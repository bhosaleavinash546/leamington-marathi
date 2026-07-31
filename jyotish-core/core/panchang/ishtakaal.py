"""इष्टकाल — time elapsed since sunrise, in ghati and pala.

CLAUDE.md 3.2: "traditional Marathi kundali sheets print this; omitting it will
read as amateur to a Marathi user."

Units, from the classical sixtieths of a day:

===========  =============  ==================
unit         subdivision    modern equivalent
===========  =============  ==================
1 dinamana   = 60 ghati     1 day
1 ghati      = 60 pala      24 minutes
1 pala       = 60 vipala    24 seconds
1 vipala     -              0.4 seconds
===========  =============  ==================

Two conventions exist for the ghati length, and they differ:

* **Fixed** - a ghati is exactly 24 minutes of clock time. Ishtakaal then runs
  past 60 ghati on a long day.
* **Proportional (dinamana)** - the interval from sunrise to next sunrise is
  divided into exactly 60 ghati, so a ghati is 24 minutes only on an equinox.

Marathi panchang sheets print the fixed 24-minute ghati, which is the default
here. The proportional form is available for cross-checking and is labelled in
output. See ``docs/DECISIONS.md`` D6.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from enum import StrEnum

from core.panchang.solar import DayLights

SECONDS_PER_GHATI = 1440.0  # 24 minutes
PALA_PER_GHATI = 60
VIPALA_PER_PALA = 60
GHATI_PER_DAY = 60


class GhatiConvention(StrEnum):
    FIXED_24_MIN = "fixed_24_min"
    PROPORTIONAL_DINAMANA = "proportional_dinamana"


@dataclass(frozen=True, slots=True)
class Ishtakaal:
    """Elapsed time since sunrise in traditional units."""

    ghati: int
    pala: int
    vipala: int
    convention: GhatiConvention
    #: Kept alongside so a UI can show both without recomputing.
    minutes_since_sunrise: float

    def __str__(self) -> str:
        return f"{self.ghati}-{self.pala}-{self.vipala}"


@dataclass(frozen=True, slots=True)
class DayNightLength:
    """दिनमान and रात्रीमान - the lengths of daylight and of night.

    A Marathi patrika prints both beside sunrise and sunset, in ghati-pala, and
    their absence marks a sheet as software-first (audit F-012). They are
    reported rather than left to the reader to subtract because the Hindu day
    runs sunrise to sunrise, so night is sunset to the *next* sunrise, which is
    not what subtracting two times on one calendar date gives.
    """

    dinamana_ghati: int
    dinamana_pala: int
    ratrimana_ghati: int
    ratrimana_pala: int
    #: Kept alongside so a UI can print h:mm without reconverting.
    dinamana_minutes: float
    ratrimana_minutes: float

    @property
    def total_minutes(self) -> float:
        """Day plus night: the whole Hindu day, sunrise to sunrise.

        Stated in minutes rather than ghati because the ghati-pala pairs are each
        *floored* for display, so 33-6 and 26-54 sum to 59 ghati and 60 pala
        rather than to a tidy 60-0. The minutes are exact and the invariant lives
        here; a caller wanting the pair to add up must carry the palas.
        """
        return self.dinamana_minutes + self.ratrimana_minutes


def _ghati_pala(seconds: float, ghati_seconds: float) -> tuple[int, int]:
    ghati = int(seconds // ghati_seconds)
    pala_seconds = ghati_seconds / PALA_PER_GHATI
    return ghati, int((seconds - ghati * ghati_seconds) // pala_seconds)


def compute_day_night_length(
    lights: DayLights,
    convention: GhatiConvention = GhatiConvention.FIXED_24_MIN,
) -> DayNightLength:
    """दिनमान and रात्रीमान for one Hindu day.

    Night is measured to the *next* sunrise, not to midnight, which is what makes
    the pair sum to the whole day.
    """
    day = (lights.sunset - lights.sunrise).total_seconds()
    night = (lights.next_sunrise - lights.sunset).total_seconds()
    if convention is GhatiConvention.FIXED_24_MIN:
        ghati_seconds = SECONDS_PER_GHATI
    else:
        ghati_seconds = (lights.next_sunrise - lights.sunrise).total_seconds() / GHATI_PER_DAY

    dg, dp = _ghati_pala(day, ghati_seconds)
    ng, np_ = _ghati_pala(night, ghati_seconds)
    return DayNightLength(
        dinamana_ghati=dg,
        dinamana_pala=dp,
        ratrimana_ghati=ng,
        ratrimana_pala=np_,
        dinamana_minutes=day / 60.0,
        ratrimana_minutes=night / 60.0,
    )


def compute_ishtakaal(
    lights: DayLights,
    when: dt.datetime,
    convention: GhatiConvention = GhatiConvention.FIXED_24_MIN,
) -> Ishtakaal:
    """Ishtakaal at ``when`` for a day whose sunrise is already known.

    ``when`` must lie in the Hindu day beginning at ``lights.sunrise``; callers
    resolve a pre-dawn birth first (CLAUDE.md 4.2), so a negative elapsed time is
    a programming error, not an input condition.
    """
    elapsed = (when - lights.sunrise).total_seconds()
    if elapsed < 0.0:
        raise ValueError(
            "instant precedes sunrise; resolve the Hindu day roll before "
            "computing Ishtakaal (CLAUDE.md 4.2)"
        )

    if convention is GhatiConvention.FIXED_24_MIN:
        ghati_seconds = SECONDS_PER_GHATI
    else:
        ghati_seconds = (lights.next_sunrise - lights.sunrise).total_seconds() / GHATI_PER_DAY

    ghati = int(elapsed // ghati_seconds)
    remainder = elapsed - ghati * ghati_seconds
    pala_seconds = ghati_seconds / PALA_PER_GHATI
    pala = int(remainder // pala_seconds)
    remainder -= pala * pala_seconds
    vipala = int(remainder // (pala_seconds / VIPALA_PER_PALA))

    return Ishtakaal(
        ghati=ghati,
        pala=pala,
        vipala=vipala,
        convention=convention,
        minutes_since_sunrise=elapsed / 60.0,
    )
