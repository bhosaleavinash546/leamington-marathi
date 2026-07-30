"""Namakaran syllable check — नामकरण.

CLAUDE.md 3.6 is emphatic that ``name`` has three narrow uses and must not be
inflated. This module implements the second: the traditional first-syllable set
for the birth nakshatra-pada, "report[ed as] match/mismatch as information, not
as a defect."

Each of the 108 nakshatra-padas carries one traditional syllable. The table below
stores them **romanised** rather than in Devanagari, for the same reason
ChartFacts stores keys and not strings (CLAUDE.md 5): the syllable has to reach
an ``en`` reader as ``chu`` and an ``mr`` reader as चू, and that mapping belongs
in the locale files above ``core/``, not here.

Matching is deliberately generous about transliteration. A user typing "Chinmay"
in Latin, "चिन्मय" in Devanagari, or "Cinmay" should all match the ``chi``
syllable of Revati pada 4 - so comparison is on a normalised consonant-vowel
prefix, and the *reason* for the verdict is returned alongside it.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Final

from core.enums import NAKSHATRA_KEYS

#: Traditional first syllables, romanised, indexed ``[nakshatra - 1][pada - 1]``.
#: The order within each nakshatra is pada 1 to 4.
NAMAKARAN_SYLLABLES: Final[tuple[tuple[str, str, str, str], ...]] = (
    ("chu", "che", "cho", "la"),  # 1 Ashwini
    ("li", "lu", "le", "lo"),  # 2 Bharani
    ("a", "i", "u", "e"),  # 3 Krittika
    ("o", "va", "vi", "vu"),  # 4 Rohini
    ("ve", "vo", "ka", "ki"),  # 5 Mrigashira
    ("ku", "gha", "nga", "chha"),  # 6 Ardra
    ("ke", "ko", "ha", "hi"),  # 7 Punarvasu
    ("hu", "he", "ho", "da"),  # 8 Pushya
    ("di", "du", "de", "do"),  # 9 Ashlesha
    ("ma", "mi", "mu", "me"),  # 10 Magha
    ("mo", "ta", "ti", "tu"),  # 11 Purva Phalguni
    ("te", "to", "pa", "pi"),  # 12 Uttara Phalguni
    ("pu", "sha", "na", "tha"),  # 13 Hasta
    ("pe", "po", "ra", "ri"),  # 14 Chitra
    ("ru", "re", "ro", "ta"),  # 15 Swati
    ("ti", "tu", "te", "to"),  # 16 Vishakha
    ("na", "ni", "nu", "ne"),  # 17 Anuradha
    ("no", "ya", "yi", "yu"),  # 18 Jyeshtha
    ("ye", "yo", "bha", "bhi"),  # 19 Mula
    ("bhu", "dha", "pha", "dha"),  # 20 Purvashadha
    ("bhe", "bho", "ja", "ji"),  # 21 Uttarashadha
    ("ju", "je", "jo", "gha"),  # 22 Shravana
    ("ga", "gi", "gu", "ge"),  # 23 Dhanishtha
    ("go", "sa", "si", "su"),  # 24 Shatataraka
    ("se", "so", "da", "di"),  # 25 Purva Bhadrapada
    ("du", "tha", "jha", "tra"),  # 26 Uttara Bhadrapada
    ("de", "do", "cha", "chi"),  # 27 Revati
)

#: Latin spellings that stand for the same Devanagari consonant. Used to make the
#: prefix comparison tolerant of transliteration style rather than of typos.
_EQUIVALENT_ONSETS: Final[tuple[frozenset[str], ...]] = (
    frozenset({"c", "ch"}),  # Cinmay / Chinmay
    frozenset({"chh", "ch"}),
    frozenset({"v", "w"}),  # Vasant / Wasant
    frozenset({"sh", "s"}),  # Shailesh / Sailesh
    frozenset({"th", "t"}),
    frozenset({"dh", "d"}),
    frozenset({"bh", "b"}),
    frozenset({"gh", "g"}),
    frozenset({"jh", "j"}),
    frozenset({"ph", "f"}),
    frozenset({"ksh", "x"}),
)

#: Devanagari independent-vowel and consonant letters mapped to a Latin onset, so
#: a name typed in Devanagari can be compared with the romanised table.
_DEVANAGARI_ONSET: Final[dict[str, str]] = {
    "अ": "a",
    "आ": "a",
    "इ": "i",
    "ई": "i",
    "उ": "u",
    "ऊ": "u",
    "ए": "e",
    "ऐ": "ai",
    "ओ": "o",
    "औ": "au",
    "क": "k",
    "ख": "kh",
    "ग": "g",
    "घ": "gh",
    "ङ": "ng",
    "च": "ch",
    "छ": "chh",
    "ज": "j",
    "झ": "jh",
    "ञ": "nya",
    "ट": "t",
    "ठ": "th",
    "ड": "d",
    "ढ": "dh",
    "ण": "n",
    "त": "t",
    "थ": "th",
    "द": "d",
    "ध": "dh",
    "न": "n",
    "प": "p",
    "फ": "ph",
    "ब": "b",
    "भ": "bh",
    "म": "m",
    "य": "y",
    "र": "r",
    "ल": "l",
    "व": "v",
    "ळ": "l",
    "श": "sh",
    "ष": "sh",
    "स": "s",
    "ह": "h",
}

#: Devanagari matras mapped to the vowel they carry.
_DEVANAGARI_MATRA: Final[dict[str, str]] = {
    "ा": "a",
    "ि": "i",
    "ी": "i",
    "ु": "u",
    "ू": "u",
    "े": "e",
    "ै": "ai",
    "ो": "o",
    "ौ": "au",
    "ृ": "ru",
}


@dataclass(frozen=True, slots=True)
class NamakaranCheck:
    """Whether a name opens with the syllable its birth pada suggests."""

    nakshatra_key: str
    pada: int
    #: The four syllables of the nakshatra, and the one belonging to this pada.
    pada_syllable: str
    nakshatra_syllables: tuple[str, ...]
    #: Normalised onset actually extracted from the supplied name.
    name_onset: str
    matches_pada: bool
    matches_nakshatra: bool
    #: Machine keys explaining the verdict, in the evidence style used elsewhere.
    evidence: tuple[str, ...]


def _normalise(name: str) -> str:
    """Strip accents and case, keeping letters and Devanagari matras only.

    Digits, punctuation and whitespace are dropped. Without that, a name like
    "7up" or "O'Brien" would yield an onset built from a non-letter and the
    Namakaran check would compare nonsense against a syllable table.

    Combining marks are dropped as accents *except* Devanagari matras, which are
    not decoration - they carry the vowel of the syllable being matched.
    """
    decomposed = unicodedata.normalize("NFD", name.strip())
    kept: list[str] = []
    for ch in decomposed:
        if ch in _DEVANAGARI_MATRA or unicodedata.category(ch).startswith("L"):
            kept.append(ch)
    return "".join(kept).lower()


def name_onset(name: str) -> str:
    """The opening consonant-plus-vowel of a name, romanised and normalised.

    Returns an empty string for a name with no usable opening letter, which the
    caller reports as "cannot check" rather than as a mismatch.
    """
    text = _normalise(name)
    if not text:
        return ""

    first = text[0]
    if first in _DEVANAGARI_ONSET:
        onset = _DEVANAGARI_ONSET[first]
        # A following matra supplies the vowel; a bare consonant implies 'a'.
        vowel = ""
        for ch in text[1:]:
            if ch in _DEVANAGARI_MATRA:
                vowel = _DEVANAGARI_MATRA[ch]
            break
        if onset[-1] not in "aeiou":
            onset += vowel or "a"
        return onset

    # Latin: take the longest consonant cluster, then the first vowel after it.
    vowels = "aeiou"
    i = 0
    while i < len(text) and text[i] not in vowels:
        i += 1
    cluster = text[:i]
    vowel = text[i] if i < len(text) else ""
    return (cluster + vowel) if cluster else vowel


def _onsets_equivalent(a: str, b: str) -> bool:
    """Compare two onsets, allowing for transliteration variants."""
    if a == b:
        return True
    a_cons, a_vow = _split_onset(a)
    b_cons, b_vow = _split_onset(b)
    if a_vow != b_vow:
        return False
    if a_cons == b_cons:
        return True
    return any(a_cons in group and b_cons in group for group in _EQUIVALENT_ONSETS)


def _split_onset(onset: str) -> tuple[str, str]:
    vowels = "aeiou"
    for i, ch in enumerate(onset):
        if ch in vowels:
            return onset[:i], onset[i:]
    return onset, ""


def check_namakaran(name: str, nakshatra_1based: int, pada: int) -> NamakaranCheck:
    """Compare a name's opening syllable with its birth pada's syllable.

    A mismatch is information, not a defect (CLAUDE.md 3.6): the traditional
    syllable is a *suggestion* made at the naming ceremony, and most people were
    named without reference to it. Both a pada-level and a looser nakshatra-level
    result are returned, because families often use any syllable of the nakshatra.
    """
    if not 1 <= nakshatra_1based <= 27:
        raise ValueError(f"nakshatra index out of range: {nakshatra_1based}")
    if not 1 <= pada <= 4:
        raise ValueError(f"pada out of range: {pada}")

    syllables = NAMAKARAN_SYLLABLES[nakshatra_1based - 1]
    expected = syllables[pada - 1]
    onset = name_onset(name)

    if not onset:
        return NamakaranCheck(
            nakshatra_key=NAKSHATRA_KEYS[nakshatra_1based - 1],
            pada=pada,
            pada_syllable=expected,
            nakshatra_syllables=syllables,
            name_onset="",
            matches_pada=False,
            matches_nakshatra=False,
            evidence=("name_has_no_recognisable_onset",),
        )

    matches_pada = _onsets_equivalent(onset, expected)
    matches_nakshatra = any(_onsets_equivalent(onset, s) for s in syllables)
    evidence = [f"name_onset_{onset}", f"pada_syllable_{expected}"]
    if matches_pada:
        evidence.append("onset_matches_pada_syllable")
    elif matches_nakshatra:
        evidence.append("onset_matches_another_pada_of_same_nakshatra")
    else:
        evidence.append("onset_matches_no_syllable_of_nakshatra")

    return NamakaranCheck(
        nakshatra_key=NAKSHATRA_KEYS[nakshatra_1based - 1],
        pada=pada,
        pada_syllable=expected,
        nakshatra_syllables=syllables,
        name_onset=onset,
        matches_pada=matches_pada,
        matches_nakshatra=matches_nakshatra,
        evidence=tuple(evidence),
    )


def syllables_for(nakshatra_1based: int) -> tuple[str, ...]:
    """The four traditional syllables of a nakshatra."""
    if not 1 <= nakshatra_1based <= 27:
        raise ValueError(f"nakshatra index out of range: {nakshatra_1based}")
    return NAMAKARAN_SYLLABLES[nakshatra_1based - 1]
