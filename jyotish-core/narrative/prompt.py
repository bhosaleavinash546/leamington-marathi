"""The narrative system prompt (CLAUDE.md 6).

The seven requirements in CLAUDE.md 6 are encoded verbatim in intent below. Two
of them - 6 (prohibited topics) and 7 (no marital verdict) - are **also** enforced
by :mod:`narrative.validator` in code, because CLAUDE.md 6 is explicit: "Enforce 6
and 7 with a **post-generation validator in code**. Do not rely on the prompt
alone."

:data:`PROMPT_VERSION` is part of the cache key. Bump it whenever the prompt text
changes, or cached prose from the old prompt will be served against the new
contract.
"""

from __future__ import annotations

from typing import Final

#: Bump on ANY change to the prompt text below. Part of the cache key
#: (CLAUDE.md 6), so a stale entry cannot outlive the prompt that produced it.
PROMPT_VERSION: Final[str] = "1.0.0"

#: Sections a caller may request. Each maps to a slice of ChartFacts the prose is
#: allowed to draw on; see :data:`SECTION_BRIEFS`.
SECTIONS: Final[tuple[str, ...]] = (
    "panchang",
    "lagna_and_grahas",
    "yogas",
    "doshas",
    "dasha",
    "milan",
)

LOCALE_NAMES: Final[dict[str, str]] = {
    "mr": "Marathi (मराठी)",
    "hi": "Hindi (हिन्दी)",
    "en": "English",
}

#: What each section is for, appended to the system prompt. Deliberately narrow:
#: a section that may range over the whole chart produces prose that cites
#: whatever it likes, which defeats the evidence affordance.
SECTION_BRIEFS: Final[dict[str, str]] = {
    "panchang": (
        "Describe the panchang of the birth day: the five limbs, the Hindu date, "
        "and the periods. Where the tithi at birth differs from the tithi at "
        "sunrise, say so and explain that the Hindu day begins at sunrise."
    ),
    "lagna_and_grahas": (
        "Describe the ascendant and the placement of the nine grahas: sign, house, "
        "dignity, retrogression and combustion. Do not interpret yogas here."
    ),
    "yogas": (
        "Describe only the yogas present in `yogas_present`. If the array is empty, "
        "say that no yoga from this engine's rule table is present in this chart, "
        "and do not substitute a different combination."
    ),
    "doshas": (
        "Describe only the entries in `doshas`. State the `ruleset` that was applied "
        "where one is given, and mention any cancellation entry that appears "
        "alongside a dosha. A dosha is information, never a verdict."
    ),
    "dasha": (
        "Describe the current dasha chain and the periods in `timeline`. Use only "
        "the dates given. Never extend the timeline or infer a date between two "
        "given ones."
    ),
    "milan": (
        "Describe the per-koot scores and their reasons, and any exception that "
        "applies. Present the total as one number among the koot scores, never as "
        "a verdict on the match, a percentage of compatibility, or a "
        "recommendation."
    ),
}

#: The seven requirements of CLAUDE.md 6, as the system prompt.
SYSTEM_PROMPT_TEMPLATE: Final[str] = """\
You are writing a section of a traditional Jyotish (Vedic astrology) reading.

## 1. The JSON is authoritative and immutable

You will receive a computed Jyotish chart as JSON. Treat every number and date in \
it as authoritative and immutable. Do not recompute, adjust, round, convert or \
infer any figure that is not present in the JSON. You have no arithmetic role \
here: a deterministic engine produced these values and you are phrasing them.

If you find yourself about to state a number, a degree, a time or a date, it must \
appear verbatim in the JSON. If it does not, omit the claim.

## 2. Only what is in the JSON

You may reference only the placements, yogas and doshas that appear in the JSON. \
If asked about something absent from it, say that the chart as computed does not \
support a statement on that point. Do not fill a gap from general knowledge of \
Jyotish.

## 3. Cite the evidence

Every interpretive claim must be traceable. When you make one, cite the relevant \
entries from the `evidence` array of the finding you are drawing on, so the reader \
can see which placement drove the statement. Write the evidence keys in \
parentheses exactly as they appear, for example (jupiter_in_house_4_from_moon).

## 4. Locale and glossary

Write in {locale_name}. Use the supplied glossary terms verbatim for every \
technical term - do not translate a technical term yourself, and do not \
substitute a Hindi term in Marathi prose or vice versa. If a term you need is \
absent from the glossary, use the machine key in Latin script rather than \
inventing a translation.

## 5. Framing

Frame the output as traditional Jyotish interpretation, using conditional \
language ("is traditionally read as", "classically indicates"). State plainly \
that this is a classical interpretive framework and not an empirically validated \
forecast. Do not write as though describing facts about the reader's life.

## 6. Prohibited subjects

Never produce statements about any of the following, under any framing, even if \
the reader asks directly:

- the date, timing or manner of death, or lifespan
- terminal illness, or any specific medical diagnosis or prognosis
- pregnancy, fertility or conception outcomes
- mental-health diagnoses
- the outcome of litigation, criminal matters or immigration decisions
- advice to stop, delay, change or avoid medical treatment

On any of these, return exactly the refusal string supplied to you below and \
nothing else for that point. Do not gesture at the subject, hint at it, or \
suggest the reader consult an astrologer about it.

## 7. Never a marital verdict

Never assert marital compatibility or incompatibility as a verdict, and never \
recommend for or against a match. Present koot scores, their reasons and \
traditional remedies as information only. Do not aggregate the scores into a \
judgement, a percentage, or a "suitable / not suitable" label.

## Refusal string

If requirement 6 applies, use exactly this text:

{refusal_string}

## Your section

{section_brief}

Write flowing prose, not a bulleted list of fields. Two to five short paragraphs. \
Do not restate the JSON structure or mention that you were given JSON.
"""


class PromptError(ValueError):
    """An unknown section or locale was requested."""


def build_system_prompt(section: str, locale: str, refusal_string: str) -> str:
    """The system prompt for one (section, locale) pair.

    ``refusal_string`` comes from the locale files, not from here: CLAUDE.md 6.6
    says "return the refusal string from the locale file", and a prompt that
    carried its own English refusal would emit English into Marathi prose.
    """
    if section not in SECTIONS:
        raise PromptError(f"unknown section {section!r}; known: {list(SECTIONS)}")
    if locale not in LOCALE_NAMES:
        raise PromptError(f"unknown locale {locale!r}; known: {sorted(LOCALE_NAMES)}")
    return SYSTEM_PROMPT_TEMPLATE.format(
        locale_name=LOCALE_NAMES[locale],
        refusal_string=refusal_string,
        section_brief=SECTION_BRIEFS[section],
    )


#: Which top-level ChartFacts keys each section may see. Narrowing the payload is
#: defence in depth for requirement 2: prose cannot cite a placement it was never
#: shown, whatever the prompt says. It also keeps the cache key tight, so a change
#: to an irrelevant part of the chart does not invalidate cached text.
SECTION_FACT_KEYS: Final[dict[str, tuple[str, ...]]] = {
    "panchang": ("schema_version", "engine_version", "authority", "confidence", "panchang"),
    "lagna_and_grahas": ("schema_version", "engine_version", "confidence", "chart"),
    "yogas": ("schema_version", "engine_version", "confidence", "yogas_present"),
    "doshas": ("schema_version", "engine_version", "confidence", "doshas"),
    "dasha": ("schema_version", "engine_version", "confidence", "dasha"),
    "milan": ("schema_version", "engine_version", "confidence", "milan"),
}


def facts_subset(facts: dict[str, object], section: str) -> dict[str, object]:
    """The slice of ChartFacts a section is allowed to see."""
    if section not in SECTION_FACT_KEYS:
        raise PromptError(f"unknown section {section!r}")
    return {key: facts[key] for key in SECTION_FACT_KEYS[section] if key in facts}
