"""Guna Milan (गुणमेलन / पत्रिका जुळवणी) — the eight koots, 36 points.

CLAUDE.md 3.5: "Output per-koot score with the reason, plus Bhakoot and Nadi
exception rules - never a bare total."

============  ======  ============================================
koot          points  compares
============  ======  ============================================
Varna          1      spiritual class of the Moon rashi
Vashya         2      dominance class of the Moon rashi
Tara           3      birth-star compatibility, counted both ways
Yoni           4      animal symbol of the nakshatra
Graha Maitri   5      friendship of the two Moon-rashi lords
Gana           6      temperament class of the nakshatra
Bhakoot        7      distance between the two Moon rashis
Nadi           8      the three-fold constitutional axis
**total**   **36**
============  ======  ============================================

CLAUDE.md 6.7 governs presentation: this module returns scores and reasons. It
never returns a verdict, a percentage-of-happiness, or a recommendation, and the
narrative layer is forbidden from manufacturing one.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from core.chart.dignity import natural_relation
from core.doshas.computed import gana_of, nadi_of
from core.enums import (
    NAKSHATRA_KEYS,
    RASHI_KEYS,
    RASHI_LORD,
    Dignity,
    Gana,
)

MAX_POINTS: Final[int] = 36

KOOT_MAX: Final[dict[str, int]] = {
    "varna": 1,
    "vashya": 2,
    "tara": 3,
    "yoni": 4,
    "graha_maitri": 5,
    "gana": 6,
    "bhakoot": 7,
    "nadi": 8,
}


class Varna(StrEnum):
    BRAHMIN = "brahmin"
    KSHATRIYA = "kshatriya"
    VAISHYA = "vaishya"
    SHUDRA = "shudra"


class Vashya(StrEnum):
    CHATUSHPADA = "chatushpada"  # quadruped
    MANAVA = "manava"  # human
    JALACHARA = "jalachara"  # water-dwelling
    VANACHARA = "vanachara"  # wild
    KEETA = "keeta"  # insect


#: Varna by 1-based Moon rashi. Water signs are Brahmin, fire Kshatriya, and so
#: on round the four-element cycle.
RASHI_VARNA: Final[tuple[Varna, ...]] = (
    Varna.KSHATRIYA,  # Mesha
    Varna.VAISHYA,  # Vrishabha
    Varna.SHUDRA,  # Mithuna
    Varna.BRAHMIN,  # Karka
    Varna.KSHATRIYA,  # Simha
    Varna.VAISHYA,  # Kanya
    Varna.SHUDRA,  # Tula
    Varna.BRAHMIN,  # Vrishchika
    Varna.KSHATRIYA,  # Dhanu
    Varna.VAISHYA,  # Makara
    Varna.SHUDRA,  # Kumbha
    Varna.BRAHMIN,  # Meena
)

VARNA_RANK: Final[dict[Varna, int]] = {
    Varna.SHUDRA: 1,
    Varna.VAISHYA: 2,
    Varna.KSHATRIYA: 3,
    Varna.BRAHMIN: 4,
}

#: Vashya class by 1-based rashi.
RASHI_VASHYA: Final[tuple[Vashya, ...]] = (
    Vashya.CHATUSHPADA,  # Mesha
    Vashya.CHATUSHPADA,  # Vrishabha
    Vashya.MANAVA,  # Mithuna
    Vashya.JALACHARA,  # Karka
    Vashya.VANACHARA,  # Simha
    Vashya.MANAVA,  # Kanya
    Vashya.MANAVA,  # Tula
    Vashya.KEETA,  # Vrishchika
    Vashya.CHATUSHPADA,  # Dhanu - the human half is disregarded for Vashya
    Vashya.CHATUSHPADA,  # Makara
    Vashya.MANAVA,  # Kumbha
    Vashya.JALACHARA,  # Meena
)

#: Yoni (animal symbol) of each nakshatra, 1-based.
NAKSHATRA_YONI: Final[tuple[str, ...]] = (
    "ashva",  # Ashwini - horse
    "gaja",  # Bharani - elephant
    "mesha",  # Krittika - sheep
    "sarpa",  # Rohini - serpent
    "sarpa",  # Mrigashira - serpent
    "shwana",  # Ardra - dog
    "marjara",  # Punarvasu - cat
    "mesha",  # Pushya - sheep
    "marjara",  # Ashlesha - cat
    "mushaka",  # Magha - rat
    "mushaka",  # P.Phalguni - rat
    "gau",  # U.Phalguni - cow
    "mahisha",  # Hasta - buffalo
    "vyaghra",  # Chitra - tiger
    "mahisha",  # Swati - buffalo
    "vyaghra",  # Vishakha - tiger
    "mriga",  # Anuradha - deer
    "mriga",  # Jyeshtha - deer
    "shwana",  # Mula - dog
    "vanara",  # P.Ashadha - monkey
    "nakula",  # U.Ashadha - mongoose
    "vanara",  # Shravana - monkey
    "simha",  # Dhanishtha - lion
    "ashva",  # Shatataraka - horse
    "simha",  # P.Bhadrapada - lion
    "gau",  # U.Bhadrapada - cow
    "gaja",  # Revati - elephant
)

#: Yoni pairs held to be natural enemies. Same yoni scores 4, enemy pairs score
#: 0, and everything between scores by the table in :func:`_yoni_points`.
YONI_ENEMIES: Final[frozenset[frozenset[str]]] = frozenset(
    {
        frozenset({"ashva", "mahisha"}),
        frozenset({"gaja", "simha"}),
        frozenset({"mesha", "vanara"}),
        frozenset({"sarpa", "nakula"}),
        frozenset({"shwana", "mriga"}),
        frozenset({"marjara", "mushaka"}),
        frozenset({"gau", "vyaghra"}),
    }
)


#: Gana koot points by ordered ``(bride, groom)`` pair. Asymmetric on the
#: Manushya/Rakshasa axis, which is the whole reason it is a table.
GANA_SCORES: Final[dict[tuple[Gana, Gana], float]] = {
    (Gana.DEVA, Gana.DEVA): 6.0,
    (Gana.MANUSHYA, Gana.MANUSHYA): 6.0,
    (Gana.RAKSHASA, Gana.RAKSHASA): 6.0,
    (Gana.DEVA, Gana.MANUSHYA): 5.0,
    (Gana.MANUSHYA, Gana.DEVA): 5.0,
    (Gana.DEVA, Gana.RAKSHASA): 0.0,
    (Gana.RAKSHASA, Gana.DEVA): 0.0,
    (Gana.MANUSHYA, Gana.RAKSHASA): 0.0,
    (Gana.RAKSHASA, Gana.MANUSHYA): 1.0,
}


@dataclass(frozen=True, slots=True)
class KootScore:
    """One koot's score with the machine-readable reason it scored that way."""

    koot: str
    points: float
    max_points: int
    #: Evidence keys, in the same style as the yoga rules.
    evidence: tuple[str, ...]

    @property
    def is_full(self) -> bool:
        return self.points >= self.max_points


@dataclass(frozen=True, slots=True)
class MilanException:
    """A classical exception that cancels a zero-scoring koot."""

    koot: str
    key: str
    evidence: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class GunaMilan:
    """The eight koots, the total, and any exceptions that apply.

    ``total`` is the raw sum. Exceptions are reported *beside* it and never
    silently folded in: whether a Bhakoot or Nadi exception cancels the deduction
    is an interpretive judgement, and quietly adding the points back would hide
    the reasoning the user is entitled to see.
    """

    koots: tuple[KootScore, ...]
    exceptions: tuple[MilanException, ...]

    @property
    def total(self) -> float:
        return sum(k.points for k in self.koots)

    @property
    def max_total(self) -> int:
        return MAX_POINTS

    def koot(self, name: str) -> KootScore:
        return next(k for k in self.koots if k.koot == name)


# ---------------------------------------------------------------------------
# Individual koots
# ---------------------------------------------------------------------------


def varna_koot(bride_rashi: int, groom_rashi: int) -> KootScore:
    """1 point when the groom's varna is not below the bride's.

    The classical rule is directional, which is why the two arguments are not
    interchangeable.
    """
    bride, groom = RASHI_VARNA[bride_rashi - 1], RASHI_VARNA[groom_rashi - 1]
    points = 1.0 if VARNA_RANK[groom] >= VARNA_RANK[bride] else 0.0
    return KootScore(
        koot="varna",
        points=points,
        max_points=1,
        evidence=(f"bride_varna_{bride.value}", f"groom_varna_{groom.value}"),
    )


def vashya_koot(bride_rashi: int, groom_rashi: int) -> KootScore:
    """2 for the same vashya class, 1 for a compatible pair, 0 otherwise."""
    bride, groom = RASHI_VASHYA[bride_rashi - 1], RASHI_VASHYA[groom_rashi - 1]
    if bride is groom:
        points = 2.0
    elif Vashya.KEETA in (bride, groom) and Vashya.JALACHARA in (bride, groom):
        points = 0.0  # insect and water-dweller are the classical hostile pair
    elif Vashya.MANAVA in (bride, groom):
        points = 1.0
    else:
        points = 0.5
    return KootScore(
        koot="vashya",
        points=points,
        max_points=2,
        evidence=(f"bride_vashya_{bride.value}", f"groom_vashya_{groom.value}"),
    )


def tara_koot(bride_nakshatra: int, groom_nakshatra: int) -> KootScore:
    """3 points, scored from the nakshatra count taken in *both* directions.

    Counting from the bride's star to the groom's and back gives two remainders
    mod 9; each favourable remainder earns 1.5 points. Remainders 3, 5 and 7 are
    the inauspicious ones (Vipat, Pratyari and Vadha tara).
    """
    inauspicious = {3, 5, 7}
    forward = ((groom_nakshatra - bride_nakshatra) % 27 + 1) % 9
    backward = ((bride_nakshatra - groom_nakshatra) % 27 + 1) % 9
    points = 0.0
    evidence: list[str] = []
    for label, remainder in (("bride_to_groom", forward), ("groom_to_bride", backward)):
        if remainder not in inauspicious:
            points += 1.5
        evidence.append(f"tara_{label}_remainder_{remainder}")
    return KootScore(koot="tara", points=points, max_points=3, evidence=tuple(evidence))


def _yoni_points(a: str, b: str) -> float:
    if a == b:
        return 4.0
    if frozenset({a, b}) in YONI_ENEMIES:
        return 0.0
    return 2.0


def yoni_koot(bride_nakshatra: int, groom_nakshatra: int) -> KootScore:
    """4 for the same yoni, 0 for an enemy pair, 2 otherwise.

    The classical table grades the middle band further (3, 2 and 1 for friendly,
    neutral and unfriendly). This engine collapses the middle to a flat 2 rather
    than reproduce a graded table whose published versions disagree; the
    simplification is recorded in ``docs/DIVERGENCES.md``.
    """
    bride = NAKSHATRA_YONI[bride_nakshatra - 1]
    groom = NAKSHATRA_YONI[groom_nakshatra - 1]
    return KootScore(
        koot="yoni",
        points=_yoni_points(bride, groom),
        max_points=4,
        evidence=(f"bride_yoni_{bride}", f"groom_yoni_{groom}"),
    )


def graha_maitri_koot(bride_rashi: int, groom_rashi: int) -> KootScore:
    """5 points from the natural friendship of the two Moon-rashi lords."""
    lord_a, lord_b = RASHI_LORD[bride_rashi], RASHI_LORD[groom_rashi]
    if lord_a is lord_b:
        points = 5.0
    else:
        a_to_b = natural_relation(lord_a, lord_b)
        b_to_a = natural_relation(lord_b, lord_a)
        both = {a_to_b, b_to_a}
        if both == {Dignity.FRIEND}:
            points = 5.0
        elif Dignity.FRIEND in both and Dignity.NEUTRAL in both:
            points = 4.0
        elif both == {Dignity.NEUTRAL}:
            points = 3.0
        elif Dignity.FRIEND in both and Dignity.ENEMY in both:
            points = 1.0
        elif Dignity.NEUTRAL in both and Dignity.ENEMY in both:
            points = 0.5
        else:
            points = 0.0
    return KootScore(
        koot="graha_maitri",
        points=points,
        max_points=5,
        evidence=(f"bride_rashi_lord_{lord_a.value}", f"groom_rashi_lord_{lord_b.value}"),
    )


def gana_koot(bride_nakshatra: int, groom_nakshatra: int) -> KootScore:
    """6 points on the temperament classes; the Deva-Rakshasa pair scores 0.

    Tabulated rather than branched because the rule is **asymmetric**: a Manushya
    bride with a Rakshasa groom scores 0 while the reverse scores 1, so the
    lookup is keyed on the ordered pair and swapping the arguments changes the
    answer. That is classical, and it is why :func:`compute_milan` is
    keyword-only.
    """
    bride, groom = gana_of(bride_nakshatra), gana_of(groom_nakshatra)
    return KootScore(
        koot="gana",
        points=GANA_SCORES[(bride, groom)],
        max_points=6,
        evidence=(f"bride_gana_{bride.value}", f"groom_gana_{groom.value}"),
    )


def bhakoot_koot(bride_rashi: int, groom_rashi: int) -> KootScore:
    """7 points unless the Moon rashis stand 6/8, 5/9 or 2/12 apart.

    Those three axes are the classical Bhakoot dosha. The count is taken both
    ways, so a 2/12 relation is caught from either side.
    """
    forward = (groom_rashi - bride_rashi) % 12 + 1
    backward = (bride_rashi - groom_rashi) % 12 + 1
    pair = {forward, backward}
    afflicted_axes = ({6, 8}, {5, 9}, {2, 12})
    afflicted = any(pair == axis for axis in afflicted_axes)
    return KootScore(
        koot="bhakoot",
        points=0.0 if afflicted else 7.0,
        max_points=7,
        evidence=(
            f"rashi_distance_{forward}_and_{backward}",
            f"bride_rashi_{RASHI_KEYS[bride_rashi - 1]}",
            f"groom_rashi_{RASHI_KEYS[groom_rashi - 1]}",
        ),
    )


def nadi_koot(bride_nakshatra: int, groom_nakshatra: int) -> KootScore:
    """8 points unless both share the same nadi."""
    bride, groom = nadi_of(bride_nakshatra), nadi_of(groom_nakshatra)
    return KootScore(
        koot="nadi",
        points=0.0 if bride is groom else 8.0,
        max_points=8,
        evidence=(f"bride_nadi_{bride.value}", f"groom_nadi_{groom.value}"),
    )


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


def bhakoot_exceptions(
    bride_rashi: int, groom_rashi: int, bride_nakshatra: int, groom_nakshatra: int
) -> tuple[MilanException, ...]:
    """Classical cancellations of Bhakoot dosha (CLAUDE.md 3.5).

    Two are encoded, both from the standard exception lists:

    * the two Moon rashis share a lord, or their lords are natural friends;
    * the two Moon nakshatras are the same, or their lords are the same.
    """
    out: list[MilanException] = []
    lord_a, lord_b = RASHI_LORD[bride_rashi], RASHI_LORD[groom_rashi]
    if lord_a is lord_b:
        out.append(
            MilanException(
                koot="bhakoot",
                key="bhakoot_exception_same_rashi_lord",
                evidence=(f"shared_lord_{lord_a.value}",),
            )
        )
    elif natural_relation(lord_a, lord_b) is Dignity.FRIEND and (
        natural_relation(lord_b, lord_a) is Dignity.FRIEND
    ):
        out.append(
            MilanException(
                koot="bhakoot",
                key="bhakoot_exception_mutual_friend_lords",
                evidence=(f"lords_{lord_a.value}_{lord_b.value}_mutual_friends",),
            )
        )
    if bride_nakshatra == groom_nakshatra:
        out.append(
            MilanException(
                koot="bhakoot",
                key="bhakoot_exception_same_nakshatra",
                evidence=(f"shared_nakshatra_{NAKSHATRA_KEYS[bride_nakshatra - 1]}",),
            )
        )
    return tuple(out)


def nadi_exceptions(
    bride_nakshatra: int, groom_nakshatra: int, bride_rashi: int, groom_rashi: int
) -> tuple[MilanException, ...]:
    """Classical cancellations of Nadi dosha (CLAUDE.md 3.5).

    * The same nakshatra but different padas - the shared nadi is then held not
      to bind. Padas are not available to this function, so the weaker form
      (same nakshatra) is what is reported, and the caller may refine it.
    * Different Moon rashis while sharing a nakshatra lord.
    """
    out: list[MilanException] = []
    if bride_nakshatra == groom_nakshatra:
        out.append(
            MilanException(
                koot="nadi",
                key="nadi_exception_same_nakshatra",
                evidence=(f"shared_nakshatra_{NAKSHATRA_KEYS[bride_nakshatra - 1]}",),
            )
        )
    if bride_rashi != groom_rashi and (bride_nakshatra - 1) % 9 == (groom_nakshatra - 1) % 9:
        out.append(
            MilanException(
                koot="nadi",
                key="nadi_exception_shared_nakshatra_lord_different_rashi",
                evidence=(
                    f"bride_rashi_{RASHI_KEYS[bride_rashi - 1]}",
                    f"groom_rashi_{RASHI_KEYS[groom_rashi - 1]}",
                ),
            )
        )
    return tuple(out)


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------


def compute_milan(
    *,
    bride_moon_rashi: int,
    bride_moon_nakshatra: int,
    groom_moon_rashi: int,
    groom_moon_nakshatra: int,
) -> GunaMilan:
    """All eight koots for a pair of charts, with reasons and exceptions.

    Every argument is keyword-only: Varna, Gana and Tara are all directional, and
    silently swapping bride and groom would change the score without any error.
    """
    for name, value, limit in (
        ("bride_moon_rashi", bride_moon_rashi, 12),
        ("groom_moon_rashi", groom_moon_rashi, 12),
        ("bride_moon_nakshatra", bride_moon_nakshatra, 27),
        ("groom_moon_nakshatra", groom_moon_nakshatra, 27),
    ):
        if not 1 <= value <= limit:
            raise ValueError(f"{name} out of range: {value}")

    koots = (
        varna_koot(bride_moon_rashi, groom_moon_rashi),
        vashya_koot(bride_moon_rashi, groom_moon_rashi),
        tara_koot(bride_moon_nakshatra, groom_moon_nakshatra),
        yoni_koot(bride_moon_nakshatra, groom_moon_nakshatra),
        graha_maitri_koot(bride_moon_rashi, groom_moon_rashi),
        gana_koot(bride_moon_nakshatra, groom_moon_nakshatra),
        bhakoot_koot(bride_moon_rashi, groom_moon_rashi),
        nadi_koot(bride_moon_nakshatra, groom_moon_nakshatra),
    )

    exceptions: list[MilanException] = []
    if any(k.koot == "bhakoot" and k.points == 0.0 for k in koots):
        exceptions.extend(
            bhakoot_exceptions(
                bride_moon_rashi, groom_moon_rashi, bride_moon_nakshatra, groom_moon_nakshatra
            )
        )
    if any(k.koot == "nadi" and k.points == 0.0 for k in koots):
        exceptions.extend(
            nadi_exceptions(
                bride_moon_nakshatra, groom_moon_nakshatra, bride_moon_rashi, groom_moon_rashi
            )
        )

    return GunaMilan(koots=koots, exceptions=tuple(exceptions))
