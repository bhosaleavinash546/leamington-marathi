"""Assembly of one complete panchang day.

This is the module the API layer calls. It stitches together sunrise resolution
(CLAUDE.md N4/4.2), the five limbs at sunrise *and* at an arbitrary instant
(CLAUDE.md 4.3), the day's periods, the amanta month and Shaka year, and the
kshaya/vriddhi classification.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from core.enums import (
    CalendarVariant,
    MonthAnomaly,
    Paksha,
    TithiAnomaly,
)
from core.ephemeris.adapter import DiscConvention, Ephemeris
from core.panchang.ishtakaal import GhatiConvention, Ishtakaal, compute_ishtakaal
from core.panchang.kaal import DayPeriods, compute_day_periods
from core.panchang.limbs import (
    KaranaState,
    NakshatraState,
    TithiState,
    VaraState,
    YogaState,
    karana_at,
    karanas_in_day,
    nakshatra_at,
    nakshatras_in_day,
    tithi_at,
    tithis_in_day,
    vara_for_hindu_day,
    yoga_at,
    yogas_in_day,
)
from core.panchang.month import LunarMonth, lunar_month_at, resolve_month_name, shaka_year_for
from core.panchang.ritu import RituConvention, SolarContext, solar_context
from core.panchang.solar import DayLights, compute_day_lights, resolve_hindu_date
from core.types import EngineOptions, Place


@dataclass(frozen=True, slots=True)
class HinduDate:
    """The date as a Marathi panchang states it."""

    shaka_year: int
    month_index: int
    month_key: str
    month_anomaly: MonthAnomaly
    suppressed_month_key: str | None
    paksha: Paksha
    tithi_index: int  # 1-30 within the lunar month
    tithi_key: str
    tithi_number_in_paksha: int  # 1-15
    variant: CalendarVariant


@dataclass(frozen=True, slots=True)
class PanchangDay:
    """Everything a panchang prints for one Hindu day at one place."""

    #: Civil date on which this Hindu day's sunrise falls. A pre-dawn instant has
    #: already been rolled back to the previous day (CLAUDE.md 4.2).
    hindu_civil_date: dt.date
    place: Place
    lights: DayLights
    vara: VaraState

    # Limbs at sunrise: the day's headline values.
    tithi_at_sunrise: TithiState
    nakshatra_at_sunrise: NakshatraState
    yoga_at_sunrise: YogaState
    karana_at_sunrise: KaranaState

    # Every division touching the day, for the "ends at" column of a sheet.
    tithis: tuple[TithiState, ...]
    nakshatras: tuple[NakshatraState, ...]
    yogas: tuple[YogaState, ...]
    karanas: tuple[KaranaState, ...]

    tithi_anomaly: TithiAnomaly
    #: The tithi skipped on a kshaya day, or the repeated one on a vriddhi day.
    anomalous_tithi: TithiState | None

    hindu_date: HinduDate
    lunar_month: LunarMonth
    periods: DayPeriods
    solar: SolarContext
    disc_convention: DiscConvention


@dataclass(frozen=True, slots=True)
class BirthMoment:
    """Limbs at the exact moment of birth, which need not match the day's.

    CLAUDE.md 4.3: "The day's headline tithi is the one running at sunrise. The
    tithi at the moment of birth may differ. Both must be reported, separately
    labelled."
    """

    when_utc: dt.datetime
    tithi: TithiState
    nakshatra: NakshatraState
    yoga: YogaState
    karana: KaranaState
    ishtakaal: Ishtakaal
    #: True when the birth tithi differs from the day's headline tithi.
    differs_from_sunrise: bool


def compute_panchang_day(
    eph: Ephemeris,
    hindu_civil_date: dt.date,
    place: Place,
    options: EngineOptions | None = None,
    *,
    lights: DayLights | None = None,
    ritu_convention: RituConvention = RituConvention.LUNAR_MONTH_PAIRS,
) -> PanchangDay:
    """Compute the full panchang for the Hindu day beginning on ``hindu_civil_date``.

    ``lights`` may be passed in when the caller has already resolved the day
    roll, to avoid recomputing sunrise.
    """
    opts = options or EngineOptions()
    day_lights = lights or compute_day_lights(eph, hindu_civil_date, place, opts)
    sunrise = day_lights.sunrise
    next_sunrise = day_lights.next_sunrise

    vara = vara_for_hindu_day(hindu_civil_date)

    tithi_sr = tithi_at(eph, sunrise)
    nak_sr = nakshatra_at(eph, sunrise)
    yoga_sr = yoga_at(eph, sunrise)
    karana_sr = karana_at(eph, sunrise)

    tithis = tuple(tithis_in_day(eph, sunrise, next_sunrise))
    anomaly, anomalous = _classify_tithi_anomaly(eph, tithi_sr, next_sunrise, tithis)

    month = lunar_month_at(eph, sunrise)
    month_index, month_key = resolve_month_name(month, tithi_sr.paksha, opts.calendar_variant)

    hindu_date = HinduDate(
        shaka_year=shaka_year_for(eph, sunrise),
        month_index=month_index,
        month_key=month_key,
        month_anomaly=month.anomaly,
        suppressed_month_key=month.suppressed_key,
        paksha=tithi_sr.paksha,
        tithi_index=tithi_sr.index,
        tithi_key=tithi_sr.key,
        tithi_number_in_paksha=tithi_sr.number_in_paksha,
        variant=opts.calendar_variant,
    )

    return PanchangDay(
        hindu_civil_date=hindu_civil_date,
        place=place,
        lights=day_lights,
        vara=vara,
        tithi_at_sunrise=tithi_sr,
        nakshatra_at_sunrise=nak_sr,
        yoga_at_sunrise=yoga_sr,
        karana_at_sunrise=karana_sr,
        tithis=tithis,
        nakshatras=tuple(nakshatras_in_day(eph, sunrise, next_sunrise)),
        yogas=tuple(yogas_in_day(eph, sunrise, next_sunrise)),
        karanas=tuple(karanas_in_day(eph, sunrise, next_sunrise)),
        tithi_anomaly=anomaly,
        anomalous_tithi=anomalous,
        hindu_date=hindu_date,
        lunar_month=month,
        periods=compute_day_periods(day_lights, vara.index),
        solar=solar_context(eph, sunrise, month.index, ritu_convention),
        disc_convention=day_lights.convention,
    )


def _classify_tithi_anomaly(
    eph: Ephemeris,
    tithi_at_sunrise: TithiState,
    next_sunrise: dt.datetime,
    tithis: tuple[TithiState, ...],
) -> tuple[TithiAnomaly, TithiState | None]:
    """Detect a vriddhi or kshaya tithi on this day (CLAUDE.md 3.2).

    Both are consequences of the tithi (mean length 23h 37m, range 21h 34m to
    26h 06m) not matching the solar day:

    * **Vriddhi** - a long tithi spans two consecutive sunrises, so it is the
      headline tithi on two days and one date is "repeated".
    * **Kshaya** - a short tithi begins after sunrise and ends before the next,
      touching no sunrise at all, so it never becomes a headline tithi and the
      date is skipped.

    Classification compares the tithi index at this sunrise with the index at the
    next: equal means vriddhi, a jump of two means the tithi in between is kshaya.
    """
    next_index = tithi_at(eph, next_sunrise).index
    advance = (next_index - tithi_at_sunrise.index) % 30

    if advance == 0:
        return TithiAnomaly.VRIDDHI, tithi_at_sunrise
    if advance >= 2:
        # The skipped tithi is the one wholly inside the day: the second entry
        # in the day's sequence when three touch it, else the middle one.
        skipped = next(
            (t for t in tithis if t.index != tithi_at_sunrise.index and t.index != next_index),
            None,
        )
        return TithiAnomaly.KSHAYA, skipped
    return TithiAnomaly.NONE, None


def compute_birth_moment(
    eph: Ephemeris,
    birth_utc: dt.datetime,
    day: PanchangDay,
    ghati_convention: GhatiConvention = GhatiConvention.FIXED_24_MIN,
) -> BirthMoment:
    """Limbs at the exact birth instant, plus Ishtakaal from that day's sunrise."""
    tithi = tithi_at(eph, birth_utc)
    return BirthMoment(
        when_utc=birth_utc,
        tithi=tithi,
        nakshatra=nakshatra_at(eph, birth_utc),
        yoga=yoga_at(eph, birth_utc),
        karana=karana_at(eph, birth_utc),
        ishtakaal=compute_ishtakaal(day.lights, birth_utc, ghati_convention),
        differs_from_sunrise=tithi.index != day.tithi_at_sunrise.index,
    )


def panchang_for_instant(
    eph: Ephemeris,
    civil_date: dt.date,
    when_utc: dt.datetime,
    place: Place,
    options: EngineOptions | None = None,
) -> tuple[PanchangDay, BirthMoment]:
    """Resolve the Hindu day for an instant and compute both views of it.

    The single entry point that gets the sunrise day-roll right: a 02:30 birth on
    the 5th is computed against the 4th's sunrise, vara and headline tithi.
    """
    hindu_date, lights = resolve_hindu_date(eph, civil_date, when_utc, place, options)
    day = compute_panchang_day(eph, hindu_date, place, options, lights=lights)
    return day, compute_birth_moment(eph, when_utc, day)
