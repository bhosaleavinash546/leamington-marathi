"""Houses: whole-sign (primary) and Sripati Bhava Chalit (secondary).

CLAUDE.md 3.3: "Houses: whole-sign (Rashi = Bhava) is the primary model.
Additionally compute a Bhava Chalit chart using Sripati cusps. Do **not** use
Placidus."

**Whole sign.** The rashi holding the ascendant *is* the first house, entire. A
graha's house is then just the count of signs from the lagna sign. This is the
model every yoga and dosha rule in this engine is evaluated against, because the
classical rules were written for it.

**Sripati.** The quadrants Asc-IC and MC-Asc are trisected in ecliptic longitude
(the Porphyry construction), and - this is the specifically Indian step - those
trisection points are read as *bhava madhya*, the middle of each house, not as
its cusp. The house boundaries (*bhava sandhi*) are then the midpoints between
consecutive madhyas. So a Sripati house straddles its Porphyry cusp rather than
starting at it, and a graha can sit in a different house here than in the
whole-sign chart - which is the whole point of showing the Chalit alongside.
"""

from __future__ import annotations

from dataclasses import dataclass

from core.angles import norm360, rashi_of


@dataclass(frozen=True, slots=True)
class BhavaChalit:
    """The twelve Sripati houses, as middles and boundaries."""

    #: bhava madhya - the Porphyry trisection points, index 0 = house 1.
    madhyas: tuple[float, ...]
    #: bhava sandhi - boundary *before* each house, index 0 = start of house 1.
    sandhis: tuple[float, ...]

    def house_of(self, sid_lon: float) -> int:
        """1-based Sripati house containing ``sid_lon``."""
        lon = norm360(sid_lon)
        for house in range(12):
            start = self.sandhis[house]
            end = self.sandhis[(house + 1) % 12]
            if _arc_contains(start, end, lon):
                return house + 1
        raise AssertionError(  # pragma: no cover - the twelve arcs cover the circle
            f"longitude {sid_lon} fell outside all twelve Sripati houses"
        )

    def span_degrees(self, house_1based: int) -> float:
        """Extent of a house in degrees. Sripati houses are unequal off the
        equator; the sum over twelve houses is always 360."""
        start = self.sandhis[house_1based - 1]
        end = self.sandhis[house_1based % 12]
        return norm360(end - start)


def _arc_contains(start: float, end: float, lon: float) -> bool:
    """True when ``lon`` lies in the forward arc ``[start, end)``, wrap-safe."""
    return norm360(lon - start) < norm360(end - start)


def whole_sign_house(graha_sid_lon: float, lagna_sid_lon: float) -> int:
    """1-based whole-sign house: the count of signs from the lagna's sign."""
    return (rashi_of(graha_sid_lon) - rashi_of(lagna_sid_lon)) % 12 + 1


def house_distance(from_sid_lon: float, to_sid_lon: float) -> int:
    """Whole-sign house count from one longitude to another, 1-based.

    ``house_distance(x, x) == 1``: a graha is in the 1st house from itself. This
    is the convention every classical rule in ``core/rules/`` assumes.
    """
    return (rashi_of(to_sid_lon) - rashi_of(from_sid_lon)) % 12 + 1


def sripati_cusps(ascendant_sid: float, mc_sid: float) -> BhavaChalit:
    """Sripati bhava madhyas and sandhis from the ascendant and the meridian.

    ``mc_sid`` is the sidereal longitude of the tenth-house meridian point. Its
    distance from the ascendant is 90 degrees only on the equator or at the
    equinoxes; away from those the quadrants are markedly unequal, which is what
    makes the Chalit chart differ from a whole-sign one.
    """
    asc = norm360(ascendant_sid)
    mc = norm360(mc_sid)
    ic = norm360(mc + 180.0)
    desc = norm360(asc + 180.0)

    # Forward arcs of the two independent quadrant pairs.
    asc_to_ic = norm360(ic - asc)  # spans houses 1, 2, 3
    mc_to_asc = norm360(asc - mc)  # spans houses 10, 11, 12

    madhyas = [0.0] * 12
    madhyas[0] = asc  # house 1
    madhyas[1] = norm360(asc + asc_to_ic / 3.0)  # house 2
    madhyas[2] = norm360(asc + 2.0 * asc_to_ic / 3.0)  # house 3
    madhyas[3] = ic  # house 4
    madhyas[9] = mc  # house 10
    madhyas[10] = norm360(mc + mc_to_asc / 3.0)  # house 11
    madhyas[11] = norm360(mc + 2.0 * mc_to_asc / 3.0)  # house 12
    madhyas[6] = desc  # house 7
    # Houses 5, 6, 8, 9 are the exact opposites of 11, 12, 2, 3.
    madhyas[4] = norm360(madhyas[10] + 180.0)
    madhyas[5] = norm360(madhyas[11] + 180.0)
    madhyas[7] = norm360(madhyas[1] + 180.0)
    madhyas[8] = norm360(madhyas[2] + 180.0)

    # A sandhi sits halfway between two consecutive madhyas. Taking half of the
    # *forward* arc keeps the result on the correct side of the circle even when
    # the pair straddles 0 degrees.
    sandhis = tuple(
        norm360(madhyas[i] - norm360(madhyas[i] - madhyas[(i - 1) % 12]) / 2.0) for i in range(12)
    )
    return BhavaChalit(madhyas=tuple(madhyas), sandhis=sandhis)


def houses_from_rashi(rashi: int, lagna_rashi: int) -> int:
    """Whole-sign house of a rashi given the lagna rashi. Both 1-based."""
    return (rashi - lagna_rashi) % 12 + 1
