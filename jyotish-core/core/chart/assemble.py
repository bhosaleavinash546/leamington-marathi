"""Chart assembly: lagna, the nine grahas, houses, vargas, strengths.

The single entry point is :func:`compute_chart`. It produces a :class:`Chart`
holding numbers and enum keys only - no prose, no locale, no formatting - which
is what the ChartFacts builder then serialises (CLAUDE.md 1, 5).

Time-unknown charts (CLAUDE.md 4.6) never reach this module: the lagna, the
houses and Ishtakaal are all undefined without a birth time, so the caller must
suppress them rather than pass a placeholder. :func:`compute_chart` therefore
requires an instant and has no "assume noon" path at all.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from core.angles import (
    deg_in_rashi,
    nakshatra_of,
    norm360,
    pada_of,
    rashi_of,
)
from core.chart.ashtakavarga import Ashtakavarga, compute_ashtakavarga
from core.chart.dignity import dignity_of, is_combust
from core.chart.houses import BhavaChalit, sripati_cusps, whole_sign_house
from core.chart.shadbala import GrahaBala, ShadbalaContext, compute_shadbala
from core.chart.vargas import all_vargas
from core.enums import (
    NAKSHATRA_KEYS,
    RASHI_KEYS,
    SAPTA_GRAHA,
    VARA_LORD,
    Dignity,
    Graha,
    NodeType,
    Varga,
    nakshatra_lord,
)
from core.ephemeris.adapter import Ephemeris
from core.panchang.kaal import hora_at
from core.panchang.month import previous_sankranti, solar_year_start
from core.panchang.solar import DayLights
from core.timeutil import jd_from_utc
from core.types import EngineOptions, Place

#: Chaldean descending order. The hora lords cycle through this list starting
#: from the weekday lord at sunrise, which is why the day after Sunday is Monday:
#: the 25th hora of a Sunday belongs to the Moon.
CHALDEAN_ORDER: tuple[Graha, ...] = (
    Graha.SATURN,
    Graha.JUPITER,
    Graha.MARS,
    Graha.SUN,
    Graha.VENUS,
    Graha.MERCURY,
    Graha.MOON,
)


@dataclass(frozen=True, slots=True)
class PointDetail:
    """A sidereal point resolved into the coordinates a kundali sheet prints."""

    sid_lon: float
    rashi: int
    rashi_key: str
    deg_in_rashi: float
    nakshatra: int
    nakshatra_key: str
    pada: int
    nakshatra_lord: Graha


@dataclass(frozen=True, slots=True)
class GrahaPosition:
    """One graha, fully resolved."""

    graha: Graha
    point: PointDetail
    house_whole_sign: int
    house_chalit: int
    retrograde: bool
    stationary: bool
    combust: bool
    dignity: Dignity
    speed_lon: float
    vargas: dict[Varga, int]
    shadbala: GrahaBala | None


@dataclass(frozen=True, slots=True)
class Chart:
    """A complete natal chart in machine terms."""

    when_utc: dt.datetime
    place: Place
    lagna: PointDetail
    mc_sid: float
    chalit: BhavaChalit
    grahas: dict[Graha, GrahaPosition]
    ashtakavarga: Ashtakavarga
    ayanamsa_deg: float
    node_type: NodeType
    #: Lagna of the Chandra kundali (Moon as ascendant) and Surya kundali.
    chandra_lagna_rashi: int
    surya_lagna_rashi: int
    #: Varga lagnas, so a D9 chart can be drawn with its own ascendant.
    varga_lagnas: dict[Varga, int]

    def house_of(self, graha: Graha) -> int:
        return self.grahas[graha].house_whole_sign

    def grahas_in_house(self, house_1based: int) -> tuple[Graha, ...]:
        return tuple(g for g, pos in self.grahas.items() if pos.house_whole_sign == house_1based)

    def house_from_moon(self, graha: Graha) -> int:
        """Whole-sign house of a graha counted from the Moon, for Chandra rules."""
        return (self.grahas[graha].point.rashi - self.grahas[Graha.MOON].point.rashi) % 12 + 1

    def sidereal_longitudes(self) -> dict[Graha, float]:
        return {g: pos.point.sid_lon for g, pos in self.grahas.items()}


def resolve_point(sid_lon: float) -> PointDetail:
    """Split a sidereal longitude into rashi, nakshatra and pada."""
    lon = norm360(sid_lon)
    rashi = rashi_of(lon)
    nak = nakshatra_of(lon)
    return PointDetail(
        sid_lon=lon,
        rashi=rashi,
        rashi_key=RASHI_KEYS[rashi - 1],
        deg_in_rashi=deg_in_rashi(lon),
        nakshatra=nak,
        nakshatra_key=NAKSHATRA_KEYS[nak - 1],
        pada=pada_of(lon),
        nakshatra_lord=nakshatra_lord(nak),
    )


def hora_lord_at(lights: DayLights, when: dt.datetime, vara_index: int) -> Graha:
    """Planetary hora lord at an instant.

    The first hora after sunrise belongs to the weekday's lord; each subsequent
    hora steps one place down the Chaldean order.
    """
    day_lord = VARA_LORD[vara_index]
    start = CHALDEAN_ORDER.index(day_lord)
    return CHALDEAN_ORDER[(start + hora_at(lights, when, vara_index)) % 7]


def compute_chart(
    eph: Ephemeris,
    when_utc: dt.datetime,
    place: Place,
    lights: DayLights,
    vara_index: int,
    options: EngineOptions | None = None,
) -> Chart:
    """Assemble the full natal chart.

    ``lights`` and ``vara_index`` come from the panchang layer, already resolved
    for the sunrise day roll, so the chart and the panchang can never disagree
    about which Hindu day the birth belongs to.
    """
    opts = options or EngineOptions()
    jd = jd_from_utc(when_utc)

    positions = eph.positions(tuple(Graha), jd)
    angles = eph.angles(jd, place.latitude, place.longitude)
    chalit = sripati_cusps(angles.ascendant_sid, angles.mc_sid)

    sidereal = {g: p.sidereal_lon for g, p in positions.items()}
    sun_lon = sidereal[Graha.SUN]

    shadbala = compute_shadbala(
        ShadbalaContext(
            sidereal=sidereal,
            tropical={g: p.tropical_lon for g, p in positions.items()},
            latitudes={g: p.latitude for g, p in positions.items()},
            speeds={g: p.speed_lon for g, p in positions.items()},
            lagna_sid=angles.ascendant_sid,
            chalit=chalit,
            obliquity=angles.obliquity,
            elongation=norm360(sidereal[Graha.MOON] - sun_lon),
            birth_utc=when_utc,
            sunrise_utc=lights.sunrise,
            sunset_utc=lights.sunset,
            next_sunrise_utc=lights.next_sunrise,
            vara_lord=VARA_LORD[vara_index],
            hora_lord=hora_lord_at(lights, when_utc, vara_index),
            masa_lord=_lord_of_day(previous_sankranti(eph, when_utc).when_utc, place),
            varsha_lord=_lord_of_day(solar_year_start(eph, when_utc).when_utc, place),
        )
    )

    grahas: dict[Graha, GrahaPosition] = {}
    for graha, pos in positions.items():
        grahas[graha] = GrahaPosition(
            graha=graha,
            point=resolve_point(pos.sidereal_lon),
            house_whole_sign=whole_sign_house(pos.sidereal_lon, angles.ascendant_sid),
            house_chalit=chalit.house_of(pos.sidereal_lon),
            retrograde=pos.is_retrograde,
            stationary=pos.is_stationary,
            combust=is_combust(graha, pos.sidereal_lon, sun_lon, pos.is_retrograde),
            dignity=dignity_of(graha, pos.sidereal_lon, sidereal),
            speed_lon=pos.speed_lon,
            vargas=all_vargas(pos.sidereal_lon),
            shadbala=shadbala.get(graha),
        )

    return Chart(
        when_utc=when_utc,
        place=place,
        lagna=resolve_point(angles.ascendant_sid),
        mc_sid=angles.mc_sid,
        chalit=chalit,
        grahas=grahas,
        ashtakavarga=compute_ashtakavarga(
            {g: sidereal[g] for g in SAPTA_GRAHA}, angles.ascendant_sid
        ),
        ayanamsa_deg=eph.ayanamsa_deg(jd),
        node_type=opts.node_type,
        chandra_lagna_rashi=rashi_of(sidereal[Graha.MOON]),
        surya_lagna_rashi=rashi_of(sun_lon),
        varga_lagnas=all_vargas(angles.ascendant_sid),
    )


def _lord_of_day(when: dt.datetime, place: Place) -> Graha:
    """Weekday lord of the local civil day containing ``when``.

    Used for the Varsha and Masa adhipati balas, whose lords are defined as the
    weekday lords of the days on which the solar year and month began.
    """
    local_date = when.astimezone(ZoneInfo(place.iana_tz)).date()
    return VARA_LORD[(local_date.weekday() + 1) % 7]


def rotate_chart(chart: Chart, new_lagna_rashi: int) -> dict[Graha, int]:
    """House positions of every graha as seen from a different ascendant sign.

    Produces the Chandra kundali (``new_lagna_rashi = chart.chandra_lagna_rashi``)
    and the Surya kundali without recomputing any position - a rotation, which is
    exactly what those charts are.
    """
    return {
        graha: (pos.point.rashi - new_lagna_rashi) % 12 + 1 for graha, pos in chart.grahas.items()
    }


def varga_chart(chart: Chart, varga: Varga) -> dict[Graha, int]:
    """House of each graha in a divisional chart, using that varga's own lagna."""
    lagna_rashi = chart.varga_lagnas[varga]
    return {
        graha: (pos.vargas[varga] - lagna_rashi) % 12 + 1 for graha, pos in chart.grahas.items()
    }
