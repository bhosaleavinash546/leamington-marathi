"""Stable machine identifiers for every Jyotish enumeration.

CLAUDE.md 5: "Every ``key`` is a stable machine identifier. No Devanagari, no
English prose inside ChartFacts." Locale files above ``core/`` map these keys to
mr/hi/en strings; ``core/`` never imports a locale file.

Renaming any key here is a breaking ChartFacts change.
"""

from __future__ import annotations

from enum import Enum, IntEnum, StrEnum
from typing import Final

# ---------------------------------------------------------------------------
# Grahas
# ---------------------------------------------------------------------------


class Graha(StrEnum):
    """The nine grahas. Rahu and Ketu are the lunar nodes, not bodies."""

    SUN = "sun"
    MOON = "moon"
    MARS = "mars"
    MERCURY = "mercury"
    JUPITER = "jupiter"
    VENUS = "venus"
    SATURN = "saturn"
    RAHU = "rahu"
    KETU = "ketu"


#: Traditional order used on a Marathi kundali sheet and in Ashtakavarga tables.
GRAHA_ORDER: Final[tuple[Graha, ...]] = (
    Graha.SUN,
    Graha.MOON,
    Graha.MARS,
    Graha.MERCURY,
    Graha.JUPITER,
    Graha.VENUS,
    Graha.SATURN,
    Graha.RAHU,
    Graha.KETU,
)

#: The seven physical grahas. Ashtakavarga and Shadbala are defined for these
#: plus the lagna; the nodes are excluded (CLAUDE.md 3.3).
SAPTA_GRAHA: Final[tuple[Graha, ...]] = GRAHA_ORDER[:7]

#: Nodes are shadow grahas: no Shadbala, no combustion, no Ashtakavarga row.
NODES: Final[frozenset[Graha]] = frozenset({Graha.RAHU, Graha.KETU})


class NodeType(StrEnum):
    """Which lunar node definition is in force (CLAUDE.md 3.3, 4.8)."""

    MEAN = "mean"
    TRUE = "true"


# ---------------------------------------------------------------------------
# Rashis
# ---------------------------------------------------------------------------


class Rashi(IntEnum):
    """1-based zodiac signs. Mesha starts at sidereal longitude 0."""

    MESHA = 1
    VRISHABHA = 2
    MITHUNA = 3
    KARKA = 4
    SIMHA = 5
    KANYA = 6
    TULA = 7
    VRISHCHIKA = 8
    DHANU = 9
    MAKARA = 10
    KUMBHA = 11
    MEENA = 12


RASHI_KEYS: Final[tuple[str, ...]] = (
    "mesha",
    "vrishabha",
    "mithuna",
    "karka",
    "simha",
    "kanya",
    "tula",
    "vrishchika",
    "dhanu",
    "makara",
    "kumbha",
    "meena",
)

#: Rashi lord (adhipati) by 1-based rashi number.
RASHI_LORD: Final[dict[int, Graha]] = {
    1: Graha.MARS,
    2: Graha.VENUS,
    3: Graha.MERCURY,
    4: Graha.MOON,
    5: Graha.SUN,
    6: Graha.MERCURY,
    7: Graha.VENUS,
    8: Graha.MARS,
    9: Graha.JUPITER,
    10: Graha.SATURN,
    11: Graha.SATURN,
    12: Graha.JUPITER,
}


class Tattva(StrEnum):
    """Element of a rashi. Used by Vashya and Bhakoot reasoning."""

    AGNI = "agni"
    PRITHVI = "prithvi"
    VAYU = "vayu"
    JALA = "jala"


RASHI_TATTVA: Final[dict[int, Tattva]] = {
    1: Tattva.AGNI,
    2: Tattva.PRITHVI,
    3: Tattva.VAYU,
    4: Tattva.JALA,
    5: Tattva.AGNI,
    6: Tattva.PRITHVI,
    7: Tattva.VAYU,
    8: Tattva.JALA,
    9: Tattva.AGNI,
    10: Tattva.PRITHVI,
    11: Tattva.VAYU,
    12: Tattva.JALA,
}


class RashiNature(StrEnum):
    """Movable / fixed / dual. Drives Sripati cusps sanity and some yogas."""

    CHARA = "chara"
    STHIRA = "sthira"
    DWISWABHAVA = "dwiswabhava"


RASHI_NATURE: Final[dict[int, RashiNature]] = {
    r: (RashiNature.CHARA, RashiNature.STHIRA, RashiNature.DWISWABHAVA)[(r - 1) % 3]
    for r in range(1, 13)
}


#: Odd rashis are male/oja, even are female/yugma. Needed by D9 and D2 rules.
def is_odd_rashi(rashi: int) -> bool:
    """True for the odd (oja, male) rashis: Mesha, Mithuna, Simha, ..."""
    return rashi % 2 == 1


# ---------------------------------------------------------------------------
# Nakshatras
# ---------------------------------------------------------------------------

NAKSHATRA_KEYS: Final[tuple[str, ...]] = (
    "ashwini",
    "bharani",
    "krittika",
    "rohini",
    "mrigashira",
    "ardra",
    "punarvasu",
    "pushya",
    "ashlesha",
    "magha",
    "purva_phalguni",
    "uttara_phalguni",
    "hasta",
    "chitra",
    "swati",
    "vishakha",
    "anuradha",
    "jyeshtha",
    "mula",
    "purvashadha",
    "uttarashadha",
    "shravana",
    "dhanishtha",
    "shatataraka",
    "purva_bhadrapada",
    "uttara_bhadrapada",
    "revati",
)

#: Vimshottari lord cycle: Ashwini = Ketu, repeating every 9 nakshatras
#: (CLAUDE.md 3.4).
NAKSHATRA_LORD_CYCLE: Final[tuple[Graha, ...]] = (
    Graha.KETU,
    Graha.VENUS,
    Graha.SUN,
    Graha.MOON,
    Graha.MARS,
    Graha.RAHU,
    Graha.JUPITER,
    Graha.SATURN,
    Graha.MERCURY,
)


def nakshatra_lord(nakshatra_1based: int) -> Graha:
    """Vimshottari lord of a 1-based nakshatra index."""
    if not 1 <= nakshatra_1based <= 27:
        raise ValueError(f"nakshatra index out of range: {nakshatra_1based}")
    return NAKSHATRA_LORD_CYCLE[(nakshatra_1based - 1) % 9]


class Gana(StrEnum):
    """Temperament class of a nakshatra. Guna Milan koot 6."""

    DEVA = "deva"
    MANUSHYA = "manushya"
    RAKSHASA = "rakshasa"


class Nadi(StrEnum):
    """Nadi / dosha axis. Guna Milan koot 8 and Nadi dosha."""

    ADI = "adi"
    MADHYA = "madhya"
    ANTYA = "antya"


# ---------------------------------------------------------------------------
# Tithi, paksha, karana, yoga
# ---------------------------------------------------------------------------


class Paksha(StrEnum):
    SHUKLA = "shukla"
    KRISHNA = "krishna"


#: The 15 tithi names. Index 15 of shukla is Purnima, of krishna is Amavasya;
#: that substitution is applied by the panchang layer, not stored here.
TITHI_KEYS: Final[tuple[str, ...]] = (
    "pratipada",
    "dwitiya",
    "tritiya",
    "chaturthi",
    "panchami",
    "shashthi",
    "saptami",
    "ashtami",
    "navami",
    "dashami",
    "ekadashi",
    "dwadashi",
    "trayodashi",
    "chaturdashi",
    "purnima",
)

KRISHNA_15_KEY: Final[str] = "amavasya"

YOGA_KEYS: Final[tuple[str, ...]] = (
    "vishkambha",
    "priti",
    "ayushman",
    "saubhagya",
    "shobhana",
    "atiganda",
    "sukarma",
    "dhriti",
    "shula",
    "ganda",
    "vriddhi",
    "dhruva",
    "vyaghata",
    "harshana",
    "vajra",
    "siddhi",
    "vyatipata",
    "variyan",
    "parigha",
    "shiva",
    "siddha",
    "sadhya",
    "shubha",
    "shukla",
    "brahma",
    "indra",
    "vaidhriti",
)

#: 11 karana names over 60 half-tithis. Karana 1 is Kimstughna; karanas 2-8
#: repeat eight times over half-tithis 2-57; 58-60 are the fixed trio.
KARANA_KEYS: Final[tuple[str, ...]] = (
    "kimstughna",
    "bava",
    "balava",
    "kaulava",
    "taitila",
    "gara",
    "vanija",
    "vishti",
    "shakuni",
    "chatushpada",
    "naga",
)


class TithiAnomaly(StrEnum):
    """Whether a solar day carries an unusual tithi pattern (CLAUDE.md 3.2)."""

    NONE = "none"
    KSHAYA = "kshaya"  # tithi begins and ends within one day: skipped at sunrise
    VRIDDHI = "vriddhi"  # tithi spans two sunrises: repeated headline tithi


# ---------------------------------------------------------------------------
# Vara
# ---------------------------------------------------------------------------

#: Weekday keys, index 0 = Sunday. Boundary is sunrise, not midnight
#: (CLAUDE.md N4, 4.2).
VARA_KEYS: Final[tuple[str, ...]] = (
    "ravivara",
    "somavara",
    "mangalavara",
    "budhavara",
    "guruvara",
    "shukravara",
    "shanivara",
)

#: Lord of the weekday, index 0 = Sunday. Used by Rahu Kaal and Kaala bala.
VARA_LORD: Final[tuple[Graha, ...]] = (
    Graha.SUN,
    Graha.MOON,
    Graha.MARS,
    Graha.MERCURY,
    Graha.JUPITER,
    Graha.VENUS,
    Graha.SATURN,
)


# ---------------------------------------------------------------------------
# Lunar months, samvat, ritu, ayana
# ---------------------------------------------------------------------------

#: Amanta month keys in order, Chaitra first (CLAUDE.md N3, 7).
MONTH_KEYS: Final[tuple[str, ...]] = (
    "chaitra",
    "vaishakha",
    "jyeshtha",
    "ashadha",
    "shravana",
    "bhadrapada",
    "ashwina",
    "kartika",
    "margashirsha",
    "pausha",
    "magha",
    "phalguna",
)


class CalendarVariant(StrEnum):
    """Lunar month reckoning. Amanta is the Maharashtra default (CLAUDE.md N3)."""

    AMANTA = "amanta"
    PURNIMANTA = "purnimanta"


class MonthAnomaly(StrEnum):
    """Intercalary / suppressed lunar month (CLAUDE.md 4.4)."""

    NONE = "none"
    ADHIKA = "adhika"  # intercalary: no solar ingress within the lunar month
    KSHAYA = "kshaya"  # suppressed: two ingresses within one lunar month


RITU_KEYS: Final[tuple[str, ...]] = (
    "vasanta",
    "grishma",
    "varsha",
    "sharad",
    "hemanta",
    "shishira",
)


class Ayana(StrEnum):
    UTTARAYANA = "uttarayana"
    DAKSHINAYANA = "dakshinayana"


# ---------------------------------------------------------------------------
# Bhavas
# ---------------------------------------------------------------------------

BHAVA_KEYS: Final[tuple[str, ...]] = (
    "tanu",
    "dhana",
    "sahaja",
    "bandhu",
    "putra",
    "shatru",
    "jaya",
    "ayu",
    "bhagya",
    "karma",
    "labha",
    "vyaya",
)

KENDRA: Final[frozenset[int]] = frozenset({1, 4, 7, 10})
TRIKONA: Final[frozenset[int]] = frozenset({1, 5, 9})
DUSTHANA: Final[frozenset[int]] = frozenset({6, 8, 12})
UPACHAYA: Final[frozenset[int]] = frozenset({3, 6, 10, 11})


# ---------------------------------------------------------------------------
# Dignity and states
# ---------------------------------------------------------------------------


class Dignity(StrEnum):
    """Positional dignity of a graha in the rashi chart."""

    MOOLATRIKONA = "moolatrikona"
    OWN_SIGN = "own_sign"
    EXALTED = "exalted"
    DEBILITATED = "debilitated"
    GREAT_FRIEND = "great_friend"
    FRIEND = "friend"
    NEUTRAL = "neutral"
    ENEMY = "enemy"
    GREAT_ENEMY = "great_enemy"


class Varga(StrEnum):
    """Divisional charts required by CLAUDE.md 3.3."""

    D1 = "D1"
    D2 = "D2"
    D3 = "D3"
    D4 = "D4"
    D7 = "D7"
    D9 = "D9"
    D10 = "D10"
    D12 = "D12"
    D16 = "D16"
    D20 = "D20"
    D24 = "D24"
    D27 = "D27"
    D30 = "D30"
    D40 = "D40"
    D45 = "D45"
    D60 = "D60"


class HouseSystem(StrEnum):
    """CLAUDE.md 3.3: whole-sign is primary, Sripati is the Chalit overlay.
    Placidus is explicitly excluded."""

    WHOLE_SIGN = "whole_sign"
    SRIPATI = "sripati"


class TimeAccuracy(StrEnum):
    EXACT = "exact"
    APPROX_15MIN = "approx_15min"
    APPROX_1HR = "approx_1hr"
    UNKNOWN = "unknown"


class TimeStandard(StrEnum):
    """How the recorded birth time should be interpreted (CLAUDE.md 4.1)."""

    CLOCK_TIME_AS_RECORDED = "clock_time_as_recorded"
    LMT = "lmt"
    IST = "ist"


class Gender(StrEnum):
    M = "m"
    F = "f"
    OTHER = "other"


class DashaSystem(StrEnum):
    VIMSHOTTARI = "vimshottari"
    ASHTOTTARI = "ashtottari"
    YOGINI = "yogini"


class YearLength(StrEnum):
    """Dasha year definition (CLAUDE.md 3.4). Documented in docs/DECISIONS.md;
    changing the default is a major engine bump."""

    SAVANA_360 = "savana_360"
    SOLAR_365_2425 = "solar_365.2425"
    SIDEREAL_365_2563 = "sidereal_365.2563"


class Strength(StrEnum):
    """Coarse strength band attached to a yoga or dosha finding."""

    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"


class Confidence(Enum):
    """Reserved for ChartFacts confidence blocks; string form is the key."""

    EXACT = "exact"
    BOUNDED = "bounded"
    UNKNOWN = "unknown"
