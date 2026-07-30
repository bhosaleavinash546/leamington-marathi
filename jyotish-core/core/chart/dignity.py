"""Dignity: exaltation, moolatrikona, own sign, and the five-fold friendship.

Sources are the classical values in Brihat Parashara Hora Shastra. Where a
school difference exists it is called out in the docstring and recorded in
``docs/DIVERGENCES.md`` rather than being resolved silently.

The nodes are deliberately absent from the exaltation and friendship tables.
Rahu/Ketu exaltation (commonly Vrishabha/Vrishchika) is a later and contested
addition; CLAUDE.md 3.3 does not require it, so ``dignity_of`` returns
``NEUTRAL`` for them and says so.
"""

from __future__ import annotations

from typing import Final

from core.angles import DEG_PER_RASHI, deg_in_rashi, norm360, rashi_of
from core.enums import RASHI_LORD, SAPTA_GRAHA, Dignity, Graha

#: Exact exaltation (उच्च) point: (rashi, degrees into it). Debilitation (नीच)
#: is the point exactly 180 degrees away.
EXALTATION: Final[dict[Graha, tuple[int, float]]] = {
    Graha.SUN: (1, 10.0),  # Mesha 10
    Graha.MOON: (2, 3.0),  # Vrishabha 3
    Graha.MARS: (10, 28.0),  # Makara 28
    Graha.MERCURY: (6, 15.0),  # Kanya 15
    Graha.JUPITER: (4, 5.0),  # Karka 5
    Graha.VENUS: (12, 27.0),  # Meena 27
    Graha.SATURN: (7, 20.0),  # Tula 20
}

#: Moolatrikona (मूलत्रिकोण) arc: (rashi, start_deg, end_deg).
MOOLATRIKONA: Final[dict[Graha, tuple[int, float, float]]] = {
    Graha.SUN: (5, 0.0, 20.0),  # Simha 0-20
    Graha.MOON: (2, 4.0, 30.0),  # Vrishabha 4-30
    Graha.MARS: (1, 0.0, 12.0),  # Mesha 0-12
    Graha.MERCURY: (6, 16.0, 20.0),  # Kanya 16-20
    Graha.JUPITER: (9, 0.0, 10.0),  # Dhanu 0-10
    Graha.VENUS: (7, 0.0, 15.0),  # Tula 0-15
    Graha.SATURN: (11, 0.0, 20.0),  # Kumbha 0-20
}

#: Signs each graha owns. Mercury and Venus own two; the Sun and Moon one each.
OWN_SIGNS: Final[dict[Graha, frozenset[int]]] = {
    graha: frozenset(r for r, lord in RASHI_LORD.items() if lord is graha) for graha in SAPTA_GRAHA
}

#: Naisargika (natural, permanent) friendship, BPHS ch. 3. Read as
#: "row graha regards column graha as ...". Anything unlisted is neutral.
NATURAL_FRIENDS: Final[dict[Graha, frozenset[Graha]]] = {
    Graha.SUN: frozenset({Graha.MOON, Graha.MARS, Graha.JUPITER}),
    Graha.MOON: frozenset({Graha.SUN, Graha.MERCURY}),
    Graha.MARS: frozenset({Graha.SUN, Graha.MOON, Graha.JUPITER}),
    Graha.MERCURY: frozenset({Graha.SUN, Graha.VENUS}),
    Graha.JUPITER: frozenset({Graha.SUN, Graha.MOON, Graha.MARS}),
    Graha.VENUS: frozenset({Graha.MERCURY, Graha.SATURN}),
    Graha.SATURN: frozenset({Graha.MERCURY, Graha.VENUS}),
}

NATURAL_ENEMIES: Final[dict[Graha, frozenset[Graha]]] = {
    Graha.SUN: frozenset({Graha.VENUS, Graha.SATURN}),
    Graha.MOON: frozenset(),  # the Moon has no natural enemy
    Graha.MARS: frozenset({Graha.MERCURY}),
    Graha.MERCURY: frozenset({Graha.MOON}),
    Graha.JUPITER: frozenset({Graha.MERCURY, Graha.VENUS}),
    Graha.VENUS: frozenset({Graha.SUN, Graha.MOON}),
    Graha.SATURN: frozenset({Graha.SUN, Graha.MOON, Graha.MARS}),
}

#: Houses (counted from a graha) whose occupants are its temporary friends. The
#: complement - 1, 5, 6, 7, 8, 9 - are temporary enemies.
TEMPORAL_FRIEND_HOUSES: Final[frozenset[int]] = frozenset({2, 3, 4, 10, 11, 12})

#: Combustion (अस्त) orbs from the Sun in degrees. Mercury and Venus take a
#: tighter orb when retrograde, because they are then near inferior conjunction.
COMBUSTION_ORB: Final[dict[Graha, float]] = {
    Graha.MOON: 12.0,
    Graha.MARS: 17.0,
    Graha.MERCURY: 14.0,
    Graha.JUPITER: 11.0,
    Graha.VENUS: 10.0,
    Graha.SATURN: 15.0,
}
COMBUSTION_ORB_RETROGRADE: Final[dict[Graha, float]] = {
    Graha.MERCURY: 12.0,
    Graha.VENUS: 8.0,
}


def exaltation_longitude(graha: Graha) -> float:
    """Absolute sidereal longitude of a graha's exaltation point."""
    rashi, deg = EXALTATION[graha]
    return (rashi - 1) * DEG_PER_RASHI + deg


def debilitation_longitude(graha: Graha) -> float:
    """Absolute sidereal longitude of a graha's debilitation point."""
    return norm360(exaltation_longitude(graha) + 180.0)


def is_in_moolatrikona(graha: Graha, sid_lon: float) -> bool:
    """True when the graha falls inside its moolatrikona arc."""
    spec = MOOLATRIKONA.get(graha)
    if spec is None:
        return False
    rashi, start, end = spec
    return rashi_of(sid_lon) == rashi and start <= deg_in_rashi(sid_lon) < end


def temporal_relation(house_distance: int) -> bool:
    """True if a graha ``house_distance`` houses away is a temporary friend."""
    return house_distance in TEMPORAL_FRIEND_HOUSES


def combine_maitri(natural: Dignity, temporal_friend: bool) -> Dignity:
    """Panchadha maitri (पंचधा मैत्री): fold natural and temporary relations.

    The classical composition: a natural friend who is also a temporary friend
    becomes a *great* friend; a natural enemy who is also a temporary enemy
    becomes a *great* enemy; the mixed cases collapse one step toward neutral.
    """
    match (natural, temporal_friend):
        case (Dignity.FRIEND, True):
            return Dignity.GREAT_FRIEND
        case (Dignity.FRIEND, False):
            return Dignity.NEUTRAL
        case (Dignity.NEUTRAL, True):
            return Dignity.FRIEND
        case (Dignity.NEUTRAL, False):
            return Dignity.ENEMY
        case (Dignity.ENEMY, True):
            return Dignity.NEUTRAL
        case _:
            return Dignity.GREAT_ENEMY


def natural_relation(of_graha: Graha, toward: Graha) -> Dignity:
    """Permanent relation of ``of_graha`` toward ``toward``."""
    if toward in NATURAL_FRIENDS.get(of_graha, frozenset()):
        return Dignity.FRIEND
    if toward in NATURAL_ENEMIES.get(of_graha, frozenset()):
        return Dignity.ENEMY
    return Dignity.NEUTRAL


def positional_dignity(graha: Graha, sid_lon: float) -> Dignity:
    """Dignity from position alone, before compound friendship is applied.

    Precedence is exaltation, then moolatrikona, then own sign, then
    debilitation - so a graha exalted inside its own sign reports ``EXALTED``,
    which is the stronger and more informative label.
    """
    if graha not in EXALTATION:
        return Dignity.NEUTRAL  # nodes: no classical exaltation in this engine
    rashi = rashi_of(sid_lon)
    exalt_rashi, _ = EXALTATION[graha]
    if rashi == exalt_rashi:
        return Dignity.EXALTED
    if rashi == rashi_of(debilitation_longitude(graha)):
        return Dignity.DEBILITATED
    if is_in_moolatrikona(graha, sid_lon):
        return Dignity.MOOLATRIKONA
    if rashi in OWN_SIGNS[graha]:
        return Dignity.OWN_SIGN
    return Dignity.NEUTRAL


def relational_dignity(graha: Graha, sid_lon: float, others: dict[Graha, float]) -> Dignity:
    """Compound (panchadha) dignity of a graha toward its dispositor.

    Used when the graha is neither exalted, debilitated nor in a sign of its
    own: the relevant question becomes how it regards the lord of the sign it
    occupies, both naturally and temporarily.
    """
    lord = RASHI_LORD[rashi_of(sid_lon)]
    if lord is graha:
        return Dignity.OWN_SIGN
    natural = natural_relation(graha, lord)
    lord_lon = others.get(lord)
    if lord_lon is None:
        return natural
    distance = (rashi_of(lord_lon) - rashi_of(sid_lon)) % 12 + 1
    return combine_maitri(natural, temporal_relation(distance))


def dignity_of(graha: Graha, sid_lon: float, others: dict[Graha, float]) -> Dignity:
    """Full dignity: positional where it applies, relational otherwise."""
    positional = positional_dignity(graha, sid_lon)
    if positional is not Dignity.NEUTRAL:
        return positional
    if graha not in EXALTATION:
        return Dignity.NEUTRAL
    return relational_dignity(graha, sid_lon, others)


def is_combust(graha: Graha, sid_lon: float, sun_lon: float, retrograde: bool) -> bool:
    """Combustion (अस्त): too close to the Sun to be seen, hence weakened.

    The Sun itself and the nodes are never combust - the nodes are not bodies
    and cannot be lost in the Sun's glare.
    """
    if graha is Graha.SUN or graha not in COMBUSTION_ORB:
        return False
    orb = COMBUSTION_ORB[graha]
    if retrograde:
        orb = COMBUSTION_ORB_RETROGRADE.get(graha, orb)
    separation = abs(((sid_lon - sun_lon + 180.0) % 360.0) - 180.0)
    return separation <= orb
