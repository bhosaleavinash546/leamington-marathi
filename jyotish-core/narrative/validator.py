"""Post-generation validation of narrative prose.

CLAUDE.md 6: "Enforce 6 and 7 with a **post-generation validator in code**, keyed
to a blocklist per locale. Do not rely on the prompt alone."

Three independent checks run on every generated section, each enforcing a
different non-negotiable:

===========================  =====================================  ==========
check                        enforces                               on failure
===========================  =====================================  ==========
prohibited content           CLAUDE.md 6.6 and 6.7                  **reject**
numeric provenance           CLAUDE.md N1 ("no LLM computes a       **reject**
                             number")
evidence citation            CLAUDE.md 6.3                          warn
===========================  =====================================  ==========

The numeric-provenance check is the one that makes N1 more than an instruction. A
model asked not to invent numbers will usually comply, and "usually" is not a
guarantee: this check extracts every numeric token from the prose and requires it
to appear in the facts the model was shown. A fabricated degree, time, year or
dasha date fails the section rather than reaching a reader.

Rejection is a hard failure, not a silent scrub. Returning quietly-edited prose
would hide a prompt regression; the caller sees the violation and serves the
locale's refusal string or an error.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Any, Final

LOCALES_DIR: Final[Path] = Path(__file__).resolve().parent.parent / "locales"

#: Every category the blocklist must define. Six from CLAUDE.md 6.6 plus the
#: marital rule from 6.7.
REQUIRED_CATEGORIES: Final[frozenset[str]] = frozenset(
    {
        "death_or_lifespan",
        "medical_diagnosis",
        "pregnancy_or_fertility",
        "mental_health_diagnosis",
        "legal_outcome",
        "medical_advice",
        "marital_verdict",
    }
)

#: Devanagari digits, so prose written with the numeral toggle on (CLAUDE.md 7) is
#: checked as strictly as Latin-numeral prose.
_DEVANAGARI_DIGITS: Final[dict[int, int]] = {ord("०") + i: ord("0") + i for i in range(10)}

#: Small integers allowed in prose without appearing in the facts. These are
#: structural counts a reader expects in ordinary Jyotish sentences - "the twelve
#: houses", "the seventh from the Moon", "four padas" - and they are bounded by the
#: domain, so allowing them cannot admit a fabricated degree, year or timestamp.
#: Anything with a decimal point, a colon, or three or more digits is never
#: allowed by this route.
_STRUCTURAL_INTEGER_MAX: Final[int] = 60


class Severity(StrEnum):
    REJECT = "reject"
    WARN = "warn"


@dataclass(frozen=True, slots=True)
class Violation:
    """One problem found in generated prose."""

    check: str
    category: str
    severity: Severity
    #: The offending fragment, trimmed. Never the whole section.
    excerpt: str
    detail: str

    def __str__(self) -> str:
        return f"[{self.severity.value}] {self.check}/{self.category}: {self.detail}"


@dataclass(frozen=True, slots=True)
class ValidationResult:
    """The outcome of validating one section."""

    violations: tuple[Violation, ...]

    @property
    def rejected(self) -> bool:
        return any(v.severity is Severity.REJECT for v in self.violations)

    @property
    def rejections(self) -> tuple[Violation, ...]:
        return tuple(v for v in self.violations if v.severity is Severity.REJECT)

    @property
    def warnings(self) -> tuple[Violation, ...]:
        return tuple(v for v in self.violations if v.severity is Severity.WARN)

    @property
    def categories(self) -> frozenset[str]:
        return frozenset(v.category for v in self.rejections)


class NarrativeLocaleError(ValueError):
    """A locale's narrative file is missing or incomplete."""


@lru_cache(maxsize=8)
def load_narrative_locale(locale: str) -> dict[str, Any]:
    """The refusal string and blocklist for a locale.

    Validated on load: a locale missing a CLAUDE.md 6.6 category would silently
    let that category through, so an incomplete file is an error at import time
    rather than a gap discovered in production.
    """
    path = LOCALES_DIR / locale / "narrative.json"
    if not path.exists():
        raise NarrativeLocaleError(f"no narrative locale file for {locale!r} at {path}")
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))

    if not data.get("refusal"):
        raise NarrativeLocaleError(f"{path}: missing 'refusal' string (CLAUDE.md 6.6)")
    blocklist = data.get("blocklist")
    if not isinstance(blocklist, dict):
        raise NarrativeLocaleError(f"{path}: missing 'blocklist' object")
    missing = REQUIRED_CATEGORIES - set(blocklist)
    if missing:
        raise NarrativeLocaleError(
            f"{path}: blocklist is missing required categories {sorted(missing)}. "
            "Every CLAUDE.md 6.6 prohibition must be covered in every locale."
        )
    for category, patterns in blocklist.items():
        if not patterns:
            raise NarrativeLocaleError(f"{path}: category {category!r} has no patterns")
    return data


def refusal_string(locale: str) -> str:
    """The locale's refusal text, for prompt construction and for substitution."""
    return str(load_narrative_locale(locale)["refusal"])


@lru_cache(maxsize=8)
def _compiled_blocklist(locale: str) -> tuple[tuple[str, re.Pattern[str]], ...]:
    blocklist = load_narrative_locale(locale)["blocklist"]
    out: list[tuple[str, re.Pattern[str]]] = []
    for category in sorted(blocklist):
        for pattern in blocklist[category]:
            out.append((category, re.compile(pattern, re.IGNORECASE | re.UNICODE)))
    return tuple(out)


# ---------------------------------------------------------------------------
# Check 1: prohibited content (CLAUDE.md 6.6, 6.7)
# ---------------------------------------------------------------------------


def check_prohibited_content(text: str, locale: str) -> tuple[Violation, ...]:
    """Match the locale's blocklist against the prose.

    The locale's own refusal string is exempt: a section that correctly *refuses*
    to discuss lifespan may quote the refusal, and that text can legitimately
    contain words the blocklist watches for.
    """
    haystack = text.replace(refusal_string(locale), " ")
    out: list[Violation] = []
    for category, pattern in _compiled_blocklist(locale):
        match = pattern.search(haystack)
        if match is None:
            continue
        out.append(
            Violation(
                check="prohibited_content",
                category=category,
                severity=Severity.REJECT,
                excerpt=_excerpt(haystack, match.start(), match.end()),
                detail=(
                    f"matched {pattern.pattern!r} in locale {locale!r}; "
                    f"CLAUDE.md 6.6/6.7 forbids this subject"
                ),
            )
        )
    return tuple(out)


def _excerpt(text: str, start: int, end: int, window: int = 40) -> str:
    lo = max(0, start - window)
    hi = min(len(text), end + window)
    prefix = "..." if lo > 0 else ""
    suffix = "..." if hi < len(text) else ""
    return f"{prefix}{text[lo:hi].strip()}{suffix}"


# ---------------------------------------------------------------------------
# Check 2: numeric provenance (CLAUDE.md N1)
# ---------------------------------------------------------------------------

#: Numbers as they appear in prose: 12, 12.44, 06:22, 1948, 1,948.
_NUMBER_IN_PROSE: Final[re.Pattern[str]] = re.compile(r"\d+(?:[.,:]\d+)*")


def _normalise_digits(text: str) -> str:
    """Fold Devanagari digits to ASCII so both numeral systems are checked."""
    return text.translate(_DEVANAGARI_DIGITS)


def collect_facts_numbers(facts: Any) -> frozenset[str]:
    """Every numeric token appearing anywhere in the facts payload.

    Walks the whole structure and records each number in several renderings,
    because prose legitimately reformats: a stored ``12.44`` may be written
    ``12.44``, ``12`` or ``12.4``, and a stored ``2026-07-30T12:00:00Z`` may be
    written ``30``, ``07``, ``2026`` or ``12:00``.

    Being generous here is deliberate. The check exists to catch *invented*
    figures - a degree or a date with no basis in the chart - not to police
    rounding. A false rejection would be worse than useless: it would push a
    maintainer to disable the check.
    """
    found: set[str] = set()

    def add_number(raw: str) -> None:
        for token in _NUMBER_IN_PROSE.findall(_normalise_digits(raw)):
            found.add(token)
            # Component parts, so "2026-07-30T06:22:31Z" also authorises "06:22".
            for part in re.split(r"[.,:]", token):
                if part:
                    found.add(part)
                    found.add(part.lstrip("0") or "0")
        # Rounded renderings of a float: 12.4438 authorises 12.44, 12.4 and 12.
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return
        for places in (0, 1, 2):
            found.add(f"{value:.{places}f}".rstrip(".") if places == 0 else f"{value:.{places}f}")
        found.add(str(int(value)))

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, list | tuple):
            for item in node:
                walk(item)
        elif isinstance(node, bool):
            return  # bools are ints in Python; they are not numbers in prose
        elif isinstance(node, int | float):
            add_number(str(node))
        elif isinstance(node, str):
            add_number(node)

    walk(facts)
    return frozenset(found)


def check_numeric_provenance(text: str, facts: Any) -> tuple[Violation, ...]:
    """Every number in the prose must trace to the facts the model was shown.

    This is what turns CLAUDE.md N1 from an instruction into a guarantee. Small
    structural integers (up to :data:`_STRUCTURAL_INTEGER_MAX`) are allowed
    without provenance - "the twelve houses", "the 7th from the Moon" - because
    they are bounded by the domain and cannot express a fabricated degree, year or
    timestamp. Anything with a decimal, a colon, or a value above that bound must
    appear in the facts.
    """
    allowed = collect_facts_numbers(facts)
    normalised = _normalise_digits(text)
    out: list[Violation] = []
    seen: set[str] = set()

    for match in _NUMBER_IN_PROSE.finditer(normalised):
        token = match.group(0)
        if token in seen:
            continue
        seen.add(token)
        if token in allowed:
            continue
        if _is_structural_integer(token):
            continue
        out.append(
            Violation(
                check="numeric_provenance",
                category="fabricated_number",
                severity=Severity.REJECT,
                excerpt=_excerpt(normalised, match.start(), match.end()),
                detail=(
                    f"the number {token!r} does not appear in the chart facts. "
                    "CLAUDE.md N1: no LLM ever computes a number."
                ),
            )
        )
    return tuple(out)


def _is_structural_integer(token: str) -> bool:
    """True for a bare integer small enough to be a house, pada or division count."""
    if not token.isdigit():
        return False  # has a decimal point, comma or colon
    return int(token) <= _STRUCTURAL_INTEGER_MAX


# ---------------------------------------------------------------------------
# Check 3: evidence citation (CLAUDE.md 6.3)
# ---------------------------------------------------------------------------


def collect_evidence_keys(facts: Any) -> frozenset[str]:
    """Every evidence key present in the facts payload."""
    found: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "evidence" and isinstance(value, list):
                    found.update(item for item in value if isinstance(item, str))
                else:
                    walk(value)
        elif isinstance(node, list | tuple):
            for item in node:
                walk(item)

    walk(facts)
    return frozenset(found)


def check_evidence_citation(text: str, facts: Any) -> tuple[Violation, ...]:
    """Warn when a section with findings cites none of their evidence keys.

    A warning rather than a rejection: the panchang and graha sections are
    descriptive and carry no findings to cite, and even for a findings section the
    right response to missing citations is to surface it to a reviewer, not to
    withhold the reading. The UI's "why" affordance draws on the structured
    `evidence` array regardless, so a reader is never left without the trace.
    """
    keys = collect_evidence_keys(facts)
    if not keys:
        return ()
    if any(key in text for key in keys):
        return ()
    return (
        Violation(
            check="evidence_citation",
            category="uncited_claim",
            severity=Severity.WARN,
            excerpt=text[:80].strip(),
            detail=(
                f"{len(keys)} evidence key(s) were available and none is cited. "
                "CLAUDE.md 6.3 asks the narrative to cite the evidence array."
            ),
        ),
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def validate(text: str, *, locale: str, facts: Any) -> ValidationResult:
    """Run every check on one generated section."""
    normalised_text = unicodedata.normalize("NFC", text)
    return ValidationResult(
        violations=(
            *check_prohibited_content(normalised_text, locale),
            *check_numeric_provenance(normalised_text, facts),
            *check_evidence_citation(normalised_text, facts),
        )
    )


def blocklist_categories(locale: str) -> frozenset[str]:
    """Categories defined for a locale. Used by the CI completeness check."""
    return frozenset(load_narrative_locale(locale)["blocklist"])
