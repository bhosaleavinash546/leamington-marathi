"""``/narrative-test`` — run the prohibited-content validator across all locales.

CLAUDE.md 9.5: "Narrative validator tests - the blocklist rejects prohibited
content in all three locales." CLAUDE.md 6 is where the requirement comes from:
"Enforce 6 and 7 with a **post-generation validator in code**, keyed to a
blocklist per locale. **Do not rely on the prompt alone.**"

This is a CLI, not only a test, for two reasons. It is the ``/narrative-test``
slash command from CLAUDE.md 11, so the check can be run against a locale edit
without invoking pytest. And it prints a matrix: every CLAUDE.md 6.6/6.7 category
against every locale, with the pattern that caught each sample. A pass count alone
would not show *which* pattern fired, and a blocklist that catches the sample by
accident - matching some unrelated word in it - is a blocklist that will miss the
real thing.

The samples live here rather than in the test file so both use one set; the test
module imports :data:`PROHIBITED_SAMPLES` from here.

Run: ``python -m tools.narrative_test``. Exits non-zero if any category in any
locale fails to reject its sample.
"""

from __future__ import annotations

import argparse
import sys
from typing import Final

from narrative.validator import (
    REQUIRED_CATEGORIES,
    Severity,
    blocklist_categories,
    check_prohibited_content,
    refusal_string,
    validate,
)

LOCALES: Final[tuple[str, ...]] = ("mr", "hi", "en")

#: One sentence per prohibited category, per locale, written the way a model
#: actually drifts: fluent, hedged, and plausible in context. A blunt "you will
#: die" sample would prove far less.
#:
#: Marathi and Hindi are written separately rather than transliterated - मृत्यू and
#: मृत्यु, नैराश्य and अवसाद are different words, and a blocklist keyed to one will
#: not catch the other (CLAUDE.md 7).
PROHIBITED_SAMPLES: Final[dict[str, dict[str, str]]] = {
    "death_or_lifespan": {
        "mr": "या योगामुळे मृत्यू लवकर येण्याची शक्यता दिसते.",
        "hi": "इस योग से मृत्यु शीघ्र आने की संभावना दिखती है.",
        "en": "This placement suggests an early death.",
    },
    "medical_diagnosis": {
        "mr": "अष्टम स्थानातील शनीमुळे कर्करोग होण्याची शक्यता आहे.",
        "hi": "अष्टम भाव के शनि से कैंसर की संभावना है.",
        "en": "Saturn in the 8th indicates cancer.",
    },
    "pregnancy_or_fertility": {
        "mr": "पंचम स्थान पाहता वंध्यत्व येण्याची शक्यता आहे.",
        "hi": "पंचम भाव देखकर वंध्यत्व की संभावना है.",
        "en": "The fifth house shows infertility.",
    },
    "mental_health_diagnosis": {
        "mr": "चंद्राच्या स्थितीमुळे नैराश्य येऊ शकते.",
        "hi": "चंद्र की स्थिति से अवसाद हो सकता है.",
        "en": "The Moon's placement indicates depression.",
    },
    "legal_outcome": {
        "mr": "षष्ठ स्थानाच्या बळावर खटला जिंकतील.",
        "hi": "षष्ठ भाव के बल पर मुकदमा जीतेंगे.",
        "en": "The native will win the case.",
    },
    "medical_advice": {
        "mr": "मंगळाची शांती केल्यास औषध बंद करता येईल.",
        "hi": "मंगल शांति के बाद दवा बंद कर सकते हैं.",
        "en": "After the remedy you may stop taking medication.",
    },
    "marital_verdict": {
        "mr": "गुण कमी असल्याने हे लग्न करू नका.",
        "hi": "गुण कम होने से यह विवाह न करें.",
        "en": "With this score you should not marry.",
    },
}


def check_one(category: str, locale: str) -> tuple[bool, str]:
    """Run one sample. Returns ``(rejected, detail)``.

    ``detail`` names the category the validator attributed the match to, which is
    how a sample caught by the *wrong* pattern is spotted.
    """
    sample = PROHIBITED_SAMPLES[category][locale]
    violations = check_prohibited_content(sample, locale)
    if not violations:
        return False, "no pattern matched"
    hit = violations[0]
    detail = str(hit.detail or hit.category)
    if hit.category != category:
        return True, f"caught, but attributed to {hit.category!r}: {detail}"
    return True, detail


def run(*, verbose: bool = True) -> list[str]:
    """Every failure, as human-readable lines. Empty means clean."""
    problems: list[str] = []

    missing_samples = REQUIRED_CATEGORIES - set(PROHIBITED_SAMPLES)
    for category in sorted(missing_samples):
        problems.append(f"no sample written for required category {category!r}")

    for locale in LOCALES:
        categories = blocklist_categories(locale)
        for category in sorted(REQUIRED_CATEGORIES - categories):
            problems.append(f"{locale}: blocklist defines no {category!r} patterns")
        if not refusal_string(locale).strip():
            problems.append(f"{locale}: no refusal string, so a rejection has nothing to serve")

    width = max(len(c) for c in PROHIBITED_SAMPLES)
    for category in sorted(PROHIBITED_SAMPLES):
        for locale in LOCALES:
            rejected, detail = check_one(category, locale)
            mark = "REJECTED" if rejected else "*** ALLOWED ***"
            if verbose:
                print(f"  {category:<{width}}  {locale}  {mark:<15} {detail}")
            if not rejected:
                problems.append(
                    f"{locale}/{category}: the validator did not reject "
                    f"{PROHIBITED_SAMPLES[category][locale]!r}. CLAUDE.md 6.6 requires "
                    "this category to be blocked in code, not by the prompt."
                )
            elif "attributed to" in detail:
                problems.append(f"{locale}/{category}: {detail}")

    # The validator must not reject ordinary interpretive prose: a blocklist that
    # rejects everything is not a guard, it is an outage.
    benign = {
        "mr": "लग्नात गुरु असल्याने पारंपरिक अर्थाने शुभ मानले जाते (jupiter_in_lagna).",
        "hi": "लग्न में गुरु होने से पारंपरिक अर्थ में शुभ माना जाता है (jupiter_in_lagna).",
        "en": "Jupiter in the lagna is traditionally read as auspicious (jupiter_in_lagna).",
    }
    for locale, text in benign.items():
        result = validate(text, locale=locale, facts={})
        blocking = [v for v in result.violations if v.severity is Severity.REJECT]
        if blocking:
            problems.append(
                f"{locale}: benign interpretive prose was rejected by "
                f"{blocking[0].category!r} ({blocking[0].detail}). A false positive here "
                "takes the section offline."
            )

    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--quiet", action="store_true", help="print only failures")
    args = parser.parse_args(argv)

    verbose = not args.quiet
    if verbose:
        print(
            f"prohibited-content validator: {len(PROHIBITED_SAMPLES)} categories "
            f"x {len(LOCALES)} locales ({', '.join(LOCALES)})"
        )
    problems = run(verbose=verbose)

    if problems:
        print(f"\n{len(problems)} problem(s):", file=sys.stderr)
        for line in problems:
            print(f"  {line}", file=sys.stderr)
        return 1
    print(
        f"\nall {len(PROHIBITED_SAMPLES) * len(LOCALES)} prohibited samples rejected; "
        "benign prose passed"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
