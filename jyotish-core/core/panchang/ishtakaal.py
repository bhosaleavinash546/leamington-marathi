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
