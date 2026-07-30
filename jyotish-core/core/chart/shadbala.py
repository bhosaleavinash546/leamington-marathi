"""Shadbala — the six strengths, reported component by component.

CLAUDE.md 3.3: "Shadbala: Sthana, Dig, Kaala, Cheshta, Naisargika, Drik bala;
return components, not just the total." A bare total hides which of thirteen
sub-quantities produced it, and a reader cannot check a total.

Everything is in **virupas**; 60 virupas make one **rupa**, and rupas are what
the classics quote. Sthana bala is itself a sum of five sub-balas and Kaala bala
of six, so the "six strengths" are really thirteen numbers, all of which are
returned.

Two things are deliberately *not* computed, and are flagged rather than faked:

* **Yuddha bala** (planetary war) applies only when two non-luminary grahas sit
  within one degree of each other. It is detected and reported, but the classical
  winner/loser adjustment is left at zero because the schools disagree on whether
  the northerly or the brighter graha wins. See ``docs/DIVERGENCES.md``.
* **Cheshta bala** uses the eight-state (avastha) reading keyed to speed against
  the mean, not the mean-versus-true-longitude arc used by some software. Both
  are defensible; the choice is recorded.
"""

from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass
from typing import Final

from core.angles import DEG_PER_RASHI, deg_in_rashi, norm360, rashi_of, shortest_separation
from core.chart.aspects import graded_drishti_virupa, is_benefic
from core.chart.dignity import (
    debilitation_longitude,
    dignity_of,
)
from core.chart.houses import BhavaChalit, whole_sign_house
from core.chart.vargas import SAPTAVARGA, varga_rashi
from core.enums import (
    KENDRA,
    RASHI_LORD,
    SAPTA_GRAHA,
    Dignity,
    Graha,
    is_odd_rashi,
)

VIRUPA_PER_RUPA: Final[float] = 60.0

#: Naisargika (natural, permanent) bala: an even ladder from Saturn to the Sun,
#: 60/7 virupas per rung.
NAISARGIKA_RANK: Final[dict[Graha, int]] = {
    Graha.SATURN: 1,
    Graha.MARS: 2,
    Graha.MERCURY: 3,
    Graha.JUPITER: 4,
    Graha.VENUS: 5,
    Graha.MOON: 6,
    Graha.SUN: 7,
}

#: Dignity -> Saptavargaja virupas, one varga at a time.
SAPTAVARGAJA_POINTS: Final[dict[Dignity, float]] = {
    Dignity.MOOLATRIKONA: 45.0,
    Dignity.OWN_SIGN: 30.0,
    Dignity.EXALTED: 30.0,
    Dignity.GREAT_FRIEND: 22.5,
    Dignity.FRIEND: 15.0,
    Dignity.NEUTRAL: 7.5,
    Dignity.ENEMY: 3.75,
    Dignity.GREAT_ENEMY: 1.875,
    Dignity.DEBILITATED: 1.875,
}

#: Whole-sign house in which each graha has full Dig bala.
DIG_BALA_STRONGEST_HOUSE: Final[dict[Graha, int]] = {
    Graha.JUPITER: 1,
    Graha.MERCURY: 1,
    Graha.SUN: 10,
    Graha.MARS: 10,
    Graha.SATURN: 7,
    Graha.MOON: 4,
    Graha.VENUS: 4,
}

#: Grahas strong at local midnight rather than at noon (Nathonnatha bala).
MIDNIGHT_STRONG: Final[frozenset[Graha]] = frozenset({Graha.MOON, Graha.MARS, Graha.SATURN})
NOON_STRONG: Final[frozenset[Graha]] = frozenset({Graha.SUN, Graha.JUPITER, Graha.VENUS})

#: Tribhaga lords: the three parts of the day, then the three of the night.
TRIBHAGA_DAY_LORDS: Final[tuple[Graha, ...]] = (Graha.MERCURY, Graha.SUN, Graha.SATURN)
TRIBHAGA_NIGHT_LORDS: Final[tuple[Graha, ...]] = (Graha.MOON, Graha.VENUS, Graha.MARS)

#: Grahas whose Ayana bala rises with *northern* declination.
AYANA_NORTH_STRONG: Final[frozenset[Graha]] = frozenset(
    {Graha.SUN, Graha.MARS, Graha.JUPITER, Graha.VENUS}
)

#: Mean daily sidereal motion in degrees, for the Cheshta avastha comparison.
MEAN_DAILY_MOTION: Final[dict[Graha, float]] = {
    Graha.MARS: 0.524,
    Graha.MERCURY: 1.383,
    Graha.JUPITER: 0.083,
    Graha.VENUS: 1.602,
    Graha.SATURN: 0.033,
}

#: Minimum total strength in rupas a graha is expected to reach (BPHS). Below it
#: the graha is read as weak. Reported, never used to gate anything.
REQUIRED_RUPAS: Final[dict[Graha, float]] = {
    Graha.SUN: 5.0,
    Graha.MOON: 6.0,
    Graha.MARS: 5.0,
    Graha.MERCURY: 7.0,
    Graha.JUPITER: 6.5,
    Graha.VENUS: 5.5,
    Graha.SATURN: 5.0,
}

#: Separation within which two grahas are held to be in planetary war.
YUDDHA_ORB_DEG: Final[float] = 1.0


@dataclass(frozen=True, slots=True)
class ShadbalaContext:
    """Everything Shadbala needs, gathered by the chart assembler.

    Passed in rather than computed here so that this module stays free of any
    ephemeris or panchang dependency and is unit-testable from literals.
    """

    sidereal: dict[Graha, float]
    tropical: dict[Graha, float]
    latitudes: dict[Graha, float]
    speeds: dict[Graha, float]
    lagna_sid: float
    chalit: BhavaChalit
    obliquity: float
    #: Sun-Moon elongation in degrees, for Paksha bala.
    elongation: float
    birth_utc: dt.datetime
    sunrise_utc: dt.datetime
    sunset_utc: dt.datetime
    next_sunrise_utc: dt.datetime
    vara_lord: Graha
    hora_lord: Graha
    masa_lord: Graha
    varsha_lord: Graha


@dataclass(frozen=True, slots=True)
class SthanaBala:
    uchcha: float
    saptavargaja: float
    ojayugma: float
    kendradi: float
    drekkana: float

    @property
    def total(self) -> float:
        return self.uchcha + self.saptavargaja + self.ojayugma + self.kendradi + self.drekkana


@dataclass(frozen=True, slots=True)
class KaalaBala:
    nathonnatha: float
    paksha: float
    tribhaga: float
    varsha_masa_dina_hora: float
    ayana: float
    yuddha: float
    #: True when this graha is within one degree of another non-luminary.
    in_planetary_war: bool

    @property
    def total(self) -> float:
        return (
            self.nathonnatha
            + self.paksha
            + self.tribhaga
            + self.varsha_masa_dina_hora
            + self.ayana
            + self.yuddha
        )


@dataclass(frozen=True, slots=True)
class GrahaBala:
    """All six strengths for one graha, in virupas unless stated."""

    graha: Graha
    sthana: SthanaBala
    dig: float
    kaala: KaalaBala
    cheshta: float
    naisargika: float
    drik: float

    @property
    def total_virupa(self) -> float:
        return (
            self.sthana.total
            + self.dig
            + self.kaala.total
            + self.cheshta
            + self.naisargika
            + self.drik
        )

    @property
    def total_rupa(self) -> float:
        return self.total_virupa / VIRUPA_PER_RUPA

    @property
    def meets_requirement(self) -> bool | None:
        """Whether the total reaches the classical minimum, or None if unlisted."""
        required = REQUIRED_RUPAS.get(self.graha)
        return None if required is None else self.total_rupa >= required


# ---------------------------------------------------------------------------
# Sthana bala
# ---------------------------------------------------------------------------


def uchcha_bala(graha: Graha, sid_lon: float) -> float:
    """Exaltation strength: angular distance from the debilitation point / 3.

    Zero at the debilitation degree, a full 60 virupas at the exaltation degree
    exactly 180 degrees away.
    """
    if graha not in (*SAPTA_GRAHA,):
        return 0.0
    return shortest_separation(sid_lon, debilitation_longitude(graha)) / 3.0


def saptavargaja_bala(graha: Graha, sid_lon: float, others: dict[Graha, float]) -> float:
    """Summed dignity across the seven vargas D1, D2, D3, D7, D9, D12, D30."""
    total = 0.0
    for varga in SAPTAVARGA:
        rashi = varga_rashi(varga, sid_lon)
        # Evaluate dignity at the varga sign's midpoint: the varga chart places a
        # graha in a sign, not at a degree, so any interior point serves and the
        # midpoint avoids sign-boundary ambiguity.
        pseudo_lon = (rashi - 1) * DEG_PER_RASHI + 15.0
        total += SAPTAVARGAJA_POINTS[dignity_of(graha, pseudo_lon, others)]
    return total


def ojayugma_bala(graha: Graha, sid_lon: float) -> float:
    """Odd/even sign strength, counted once in D1 and once in D9.

    The Moon and Venus want even (yugma) signs; the other five want odd (oja).
    15 virupas for each of the two charts, so 30 at most.
    """
    wants_even = graha in (Graha.MOON, Graha.VENUS)
    score = 0.0
    for rashi in (rashi_of(sid_lon), varga_rashi(SAPTAVARGA[4], sid_lon)):  # D1, D9
        if is_odd_rashi(rashi) is not wants_even:
            score += 15.0
    return score


def kendradi_bala(house_1based: int) -> float:
    """60 in a kendra, 30 in a panaphara, 15 in an apoklima."""
    if house_1based in KENDRA:
        return 60.0
    if house_1based in {2, 5, 8, 11}:
        return 30.0
    return 15.0


def drekkana_bala(graha: Graha, sid_lon: float) -> float:
    """15 virupas when a graha sits in the drekkana matching its gender.

    Male grahas (Sun, Mars, Jupiter) want the first third of a sign, neuter
    (Mercury, Saturn) the second, female (Moon, Venus) the third.
    """
    third = int(deg_in_rashi(sid_lon) // 10.0)
    match graha:
        case Graha.SUN | Graha.MARS | Graha.JUPITER:
            return 15.0 if third == 0 else 0.0
        case Graha.MERCURY | Graha.SATURN:
            return 15.0 if third == 1 else 0.0
        case Graha.MOON | Graha.VENUS:
            return 15.0 if third == 2 else 0.0
        case _:
            return 0.0


# ---------------------------------------------------------------------------
# Dig bala
# ---------------------------------------------------------------------------


def dig_bala(graha: Graha, sid_lon: float, chalit: BhavaChalit) -> float:
    """Directional strength: distance from the graha's powerless cardinal point.

    The powerless point is the bhava madhya opposite the graha's strongest house,
    and strength grows linearly to 60 virupas at 180 degrees from it.
    """
    strongest = DIG_BALA_STRONGEST_HOUSE.get(graha)
    if strongest is None:
        return 0.0
    powerless_house = (strongest + 6 - 1) % 12 + 1
    powerless_lon = chalit.madhyas[powerless_house - 1]
    return shortest_separation(sid_lon, powerless_lon) / 3.0


# ---------------------------------------------------------------------------
# Kaala bala
# ---------------------------------------------------------------------------


def nathonnatha_bala(graha: Graha, ctx: ShadbalaContext) -> float:
    """Diurnal/nocturnal strength, ramping linearly between noon and midnight.

    Local apparent noon is taken as the midpoint of sunrise to sunset and local
    midnight as the midpoint of sunset to the next sunrise, rather than as clock
    12:00 - the two differ by up to a quarter of an hour, and the sunrise-based
    definition is the one consistent with the rest of this engine.
    """
    if graha is Graha.MERCURY:
        return 60.0  # Mercury is held equally strong by day and by night
    noon = ctx.sunrise_utc + (ctx.sunset_utc - ctx.sunrise_utc) / 2
    midnight = ctx.sunset_utc + (ctx.next_sunrise_utc - ctx.sunset_utc) / 2
    half_day_seconds = (ctx.next_sunrise_utc - ctx.sunrise_utc).total_seconds() / 2.0

    reference = noon if graha in NOON_STRONG else midnight
    if graha not in NOON_STRONG and graha not in MIDNIGHT_STRONG:
        return 0.0  # nodes
    gap = abs((ctx.birth_utc - reference).total_seconds())
    gap = min(gap, half_day_seconds)
    return 60.0 * (1.0 - gap / half_day_seconds)


def paksha_bala(graha: Graha, elongation: float) -> float:
    """Lunar-phase strength. Benefics gain as the Moon waxes, malefics as it wanes.

    The Moon's own Paksha bala is doubled, so it alone can exceed 60 virupas -
    that is classical, not a bug.
    """
    waxing_fraction = (elongation if elongation <= 180.0 else 360.0 - elongation) / 180.0
    value = 60.0 * waxing_fraction if is_benefic(graha) else 60.0 * (1.0 - waxing_fraction)
    return value * 2.0 if graha is Graha.MOON else value


def tribhaga_bala(graha: Graha, ctx: ShadbalaContext) -> float:
    """60 virupas to the lord of the current third of the day or night.

    Jupiter receives it unconditionally in every third, which is why the
    classics call it the one graha always strong in Tribhaga.
    """
    if graha is Graha.JUPITER:
        return 60.0
    if ctx.birth_utc < ctx.sunset_utc:
        span = (ctx.sunset_utc - ctx.sunrise_utc) / 3
        part = min(int((ctx.birth_utc - ctx.sunrise_utc) / span), 2)
        lord = TRIBHAGA_DAY_LORDS[part]
    else:
        span = (ctx.next_sunrise_utc - ctx.sunset_utc) / 3
        part = min(int((ctx.birth_utc - ctx.sunset_utc) / span), 2)
        lord = TRIBHAGA_NIGHT_LORDS[part]
    return 60.0 if graha is lord else 0.0


def adhipati_bala(graha: Graha, ctx: ShadbalaContext) -> float:
    """Lordship of the year (15), month (30), day (45) and hora (60), summed.

    A graha can hold more than one lordship at once, so these add.
    """
    total = 0.0
    if graha is ctx.varsha_lord:
        total += 15.0
    if graha is ctx.masa_lord:
        total += 30.0
    if graha is ctx.vara_lord:
        total += 45.0
    if graha is ctx.hora_lord:
        total += 60.0
    return total


def declination_deg(tropical_lon: float, ecliptic_lat: float, obliquity: float) -> float:
    """Declination from ecliptic coordinates. Tropical longitude, not sidereal.

    Declination is an equatorial quantity, so it must be built from the tropical
    longitude - subtracting the ayanamsa first would rotate the frame and give a
    wrong answer by up to the ayanamsa itself.
    """
    lon = math.radians(tropical_lon)
    lat = math.radians(ecliptic_lat)
    eps = math.radians(obliquity)
    sin_dec = math.sin(lat) * math.cos(eps) + math.cos(lat) * math.sin(eps) * math.sin(lon)
    return math.degrees(math.asin(max(-1.0, min(1.0, sin_dec))))


def ayana_bala(graha: Graha, ctx: ShadbalaContext) -> float:
    """Declination strength, scaled so the full swing spans 60 virupas.

    The Sun, Mars, Jupiter and Venus gain in northern declination; the Moon and
    Saturn in southern. Mercury gains from declination of either sign, which is
    why its Ayana bala is never small.
    """
    if graha not in (*SAPTA_GRAHA,):
        return 0.0
    dec = declination_deg(ctx.tropical[graha], ctx.latitudes[graha], ctx.obliquity)
    if graha is Graha.MERCURY:
        effective = abs(dec)
    elif graha in AYANA_NORTH_STRONG:
        effective = dec
    else:
        effective = -dec
    # 24 degrees is the conventional scaling constant: the swing runs from
    # -24 to +24, i.e. 48 degrees mapped onto 0..60 virupas.
    return (24.0 + effective) * 60.0 / 48.0


def detect_planetary_war(sidereal: dict[Graha, float]) -> dict[Graha, bool]:
    """Flag grahas within :data:`YUDDHA_ORB_DEG` of another non-luminary.

    The luminaries do not go to war - a graha near the Sun is combust, which is a
    different condition entirely, and one already reported by
    :func:`core.chart.dignity.is_combust`.
    """
    contenders = [g for g in SAPTA_GRAHA if g not in (Graha.SUN, Graha.MOON)]
    at_war = dict.fromkeys(SAPTA_GRAHA, False)
    for i, a in enumerate(contenders):
        for b in contenders[i + 1 :]:
            if shortest_separation(sidereal[a], sidereal[b]) <= YUDDHA_ORB_DEG:
                at_war[a] = True
                at_war[b] = True
    return at_war


# ---------------------------------------------------------------------------
# Cheshta, Naisargika, Drik
# ---------------------------------------------------------------------------


def cheshta_bala(graha: Graha, ctx: ShadbalaContext) -> float:
    """Motional strength from the graha's motion state (avastha).

    The Sun and Moon have no retrograde motion, so the classics substitute: the
    Sun's Cheshta bala is its Ayana bala and the Moon's is its Paksha bala.

    For the five star-planets the state is read off the speed against the mean:

    ==================  ======  =========================================
    state               virupa  condition
    ==================  ======  =========================================
    vakra (retrograde)  60      speed < 0
    vikala (stationary) 15      |speed| below a thousandth of the mean
    manda / mandatara   15-30   slower than mean
    sama                7.5     within 5% of mean
    chara / atichara    30-45   faster than mean
    ==================  ======  =========================================
    """
    if graha is Graha.SUN:
        return ayana_bala(graha, ctx)
    if graha is Graha.MOON:
        return paksha_bala(graha, ctx.elongation)
    mean = MEAN_DAILY_MOTION.get(graha)
    if mean is None:
        return 0.0
    speed = ctx.speeds[graha]
    if speed < 0.0:
        return 60.0
    if abs(speed) < mean / 1000.0:
        return 15.0
    ratio = speed / mean
    if ratio < 0.5:
        return 15.0  # mandatara
    if ratio < 0.95:
        return 30.0  # manda
    if ratio <= 1.05:
        return 7.5  # sama
    if ratio <= 1.5:
        return 30.0  # chara
    return 45.0  # atichara


def naisargika_bala(graha: Graha) -> float:
    """Fixed natural strength: 60/7 virupas per rung of the classical ladder."""
    rank = NAISARGIKA_RANK.get(graha)
    return 0.0 if rank is None else rank * 60.0 / 7.0


def drik_bala(graha: Graha, sidereal: dict[Graha, float]) -> float:
    """Aspectual strength: benefic glances add, malefic glances subtract, / 4."""
    total = 0.0
    target = sidereal[graha]
    for other, lon in sidereal.items():
        if other is graha or other not in (*SAPTA_GRAHA,):
            continue
        value = graded_drishti_virupa(target - lon)
        total += value if is_benefic(other) else -value
    return total / 4.0


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------


def compute_shadbala(ctx: ShadbalaContext) -> dict[Graha, GrahaBala]:
    """All six strengths for the seven grahas. Nodes are excluded by tradition."""
    at_war = detect_planetary_war(ctx.sidereal)
    out: dict[Graha, GrahaBala] = {}
    for graha in SAPTA_GRAHA:
        sid_lon = ctx.sidereal[graha]
        house = whole_sign_house(sid_lon, ctx.lagna_sid)
        sthana = SthanaBala(
            uchcha=uchcha_bala(graha, sid_lon),
            saptavargaja=saptavargaja_bala(graha, sid_lon, ctx.sidereal),
            ojayugma=ojayugma_bala(graha, sid_lon),
            kendradi=kendradi_bala(house),
            drekkana=drekkana_bala(graha, sid_lon),
        )
        kaala = KaalaBala(
            nathonnatha=nathonnatha_bala(graha, ctx),
            paksha=paksha_bala(graha, ctx.elongation),
            tribhaga=tribhaga_bala(graha, ctx),
            varsha_masa_dina_hora=adhipati_bala(graha, ctx),
            ayana=ayana_bala(graha, ctx),
            # Left at zero on purpose: the winner/loser rule is school-dependent.
            yuddha=0.0,
            in_planetary_war=at_war[graha],
        )
        out[graha] = GrahaBala(
            graha=graha,
            sthana=sthana,
            dig=dig_bala(graha, sid_lon, ctx.chalit),
            kaala=kaala,
            cheshta=cheshta_bala(graha, ctx),
            naisargika=naisargika_bala(graha),
            drik=drik_bala(graha, ctx.sidereal),
        )
    return out


def bhava_bala(house_1based: int, lagna_sid: float, balas: dict[Graha, GrahaBala]) -> float:
    """Bhava bala reduced to its Bhavadhipati component, in virupas.

    Only the house-lord's own strength is included. The two other classical
    components - Bhava Digbala and Bhava Drishti bala - are omitted rather than
    approximated, and this is stated in ``docs/DIVERGENCES.md``.
    """
    rashi = (rashi_of(lagna_sid) - 1 + house_1based - 1) % 12 + 1
    lord = RASHI_LORD[rashi]
    bala = balas.get(lord)
    return 0.0 if bala is None else bala.total_virupa


def strongest_graha(balas: dict[Graha, GrahaBala]) -> Graha:
    """The graha with the highest total. Ties break on the classical order."""
    return max(SAPTA_GRAHA, key=lambda g: (balas[g].total_virupa, -SAPTA_GRAHA.index(g)))


def ishta_kashta_phala(graha: Graha, sid_lon: float, cheshta: float) -> tuple[float, float]:
    """Ishta (benefic yield) and Kashta (malefic yield) phala, 0-60 each.

    ``ishta = sqrt(uchcha_bala * cheshta_bala)``, and kashta is its complement
    against 60. Reported because it is the classical way of turning strength
    into a benefic/malefic reading without inventing new numbers.
    """
    ishta = math.sqrt(max(0.0, uchcha_bala(graha, sid_lon)) * max(0.0, cheshta))
    return ishta, 60.0 - ishta


def normalise_longitudes(sidereal: dict[Graha, float]) -> dict[Graha, float]:
    """Defensive pass through ``norm360`` for externally supplied longitudes."""
    return {g: norm360(v) for g, v in sidereal.items()}
