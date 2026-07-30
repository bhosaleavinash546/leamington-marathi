"""The narrative function and its cache.

CLAUDE.md 6: "The LLM call is a pure function: ``ChartFacts + section + locale ->
prose``" and "Cache narrative by ``hash(ChartFacts_subset + section + locale +
prompt_version)``. Identical charts must not produce drifting text."

The cache is what makes the second sentence true. Generation is not deterministic
even at temperature 0, so identical input is served from the cache rather than
regenerated. The key covers every input that can change the output:

* the **facts subset** the section is shown - not the whole document, so a change
  to an unrelated part of the chart does not invalidate cached text;
* the **section** and **locale**;
* the **prompt version**, so a prompt edit invalidates every entry;
* the **model**, so a model change does not silently serve old prose;
* the **validator version**, so tightening the blocklist re-checks cached text.
"""

from __future__ import annotations

import hashlib
import json
import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Final

from narrative.client import DEFAULT_MODEL, LLMClient, LLMError
from narrative.projection import project
from narrative.prompt import (
    PROMPT_VERSION,
    SECTIONS,
    PromptError,
    build_system_prompt,
    facts_subset,
)
from narrative.validator import ValidationResult, Violation, refusal_string, validate

#: Bump when a check is added or a blocklist tightened, so cached prose that
#: passed the old rules is re-validated rather than served.
VALIDATOR_VERSION: Final[str] = "1.0.0"

DEFAULT_CACHE_SIZE: Final[int] = 512


class NarrativeRejectedError(RuntimeError):
    """Generated prose failed a REJECT-severity check.

    Carries the violations so a caller can log precisely which CLAUDE.md 6.6
    category fired, without echoing the offending text to a user.
    """

    def __init__(self, violations: tuple[Violation, ...], attempts: int) -> None:
        self.violations = violations
        self.attempts = attempts
        categories = sorted({v.category for v in violations})
        super().__init__(
            f"narrative rejected after {attempts} attempt(s); categories: {', '.join(categories)}"
        )


@dataclass(frozen=True, slots=True)
class NarrativeSection:
    """One generated, validated section."""

    section: str
    locale: str
    text: str
    #: True when the text is the locale's refusal string rather than generated
    #: prose, because generation was rejected or disabled.
    is_refusal: bool
    cache_key: str
    cached: bool
    model: str
    prompt_version: str
    warnings: tuple[str, ...]

    @property
    def is_generated(self) -> bool:
        return not self.is_refusal


def cache_key(
    facts: dict[str, Any],
    section: str,
    locale: str,
    *,
    model: str = DEFAULT_MODEL,
    prompt_version: str = PROMPT_VERSION,
    validator_version: str = VALIDATOR_VERSION,
) -> str:
    """The cache key from CLAUDE.md 6, extended with model and validator version.

    ``sort_keys`` makes the digest independent of dict ordering, so two
    structurally identical documents built in different orders share a key.
    """
    payload = json.dumps(
        {
            "facts": project(facts, section),
            "section": section,
            "locale": locale,
            "prompt_version": prompt_version,
            "validator_version": validator_version,
            "model": model,
        },
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class NarrativeCache:
    """A bounded, thread-safe LRU cache of validated prose.

    In-process by design at this phase. The key is a content hash, so swapping in
    Redis or a Postgres table means replacing this class and nothing else - the
    service only calls ``get`` and ``put``.
    """

    def __init__(self, maxsize: int = DEFAULT_CACHE_SIZE) -> None:
        self._maxsize = maxsize
        self._entries: OrderedDict[str, str] = OrderedDict()
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> str | None:
        with self._lock:
            if key in self._entries:
                self._entries.move_to_end(key)
                self.hits += 1
                return self._entries[key]
            self.misses += 1
            return None

    def put(self, key: str, text: str) -> None:
        with self._lock:
            self._entries[key] = text
            self._entries.move_to_end(key)
            while len(self._entries) > self._maxsize:
                self._entries.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self.hits = 0
            self.misses = 0

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)


class NarrativeService:
    """Turns ChartFacts into validated prose.

    One retry on a rejection: a model that strayed into a prohibited subject will
    usually comply when told so explicitly. If the retry is also rejected the
    service returns the locale's refusal string rather than raising, because a
    reader is better served by an honest refusal than by an error page - unless
    ``strict`` is set, in which case the caller wants the failure.
    """

    def __init__(
        self,
        client: LLMClient,
        *,
        cache: NarrativeCache | None = None,
        max_attempts: int = 2,
        strict: bool = False,
        enabled: bool = True,
    ) -> None:
        self._client = client
        self._cache = cache if cache is not None else NarrativeCache()
        self._max_attempts = max(1, max_attempts)
        self._strict = strict
        self._enabled = enabled

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def cache(self) -> NarrativeCache:
        return self._cache

    def generate(self, facts: dict[str, Any], section: str, locale: str) -> NarrativeSection:
        """``ChartFacts + section + locale -> prose``, validated and cached."""
        if section not in SECTIONS:
            raise PromptError(f"unknown section {section!r}; known: {list(SECTIONS)}")

        # One projected object drives the payload, the cache key and the
        # provenance check, so the three can never disagree about what the model
        # was shown (see narrative/projection.py).
        subset = project(facts, section)
        key = cache_key(facts, section, locale, model=self._client.model)
        refusal = refusal_string(locale)

        if not self._enabled:
            # Generation is switched off (no API key, or deliberately disabled).
            # Return the refusal for the *requested* locale and never call the
            # transport: an English refusal in Marathi prose is the failure
            # CLAUDE.md N5 forbids, and no chart data should leave the process.
            return NarrativeSection(
                section=section,
                locale=locale,
                text=refusal,
                is_refusal=True,
                cache_key=key,
                cached=False,
                model="generation-disabled",
                prompt_version=PROMPT_VERSION,
                warnings=("narrative_generation_disabled",),
            )

        cached = self._cache.get(key)
        if cached is not None:
            return NarrativeSection(
                section=section,
                locale=locale,
                text=cached,
                is_refusal=cached == refusal,
                cache_key=key,
                cached=True,
                model=self._client.model,
                prompt_version=PROMPT_VERSION,
                warnings=(),
            )

        system = build_system_prompt(section, locale, refusal)
        user = _user_message(subset)
        all_violations: list[Violation] = []
        warnings: list[str] = []

        for attempt in range(1, self._max_attempts + 1):
            prompt = system if attempt == 1 else system + _RETRY_SUFFIX
            try:
                response = self._client.complete(system=prompt, user=user)
            except LLMError:
                if self._strict:
                    raise
                # Transport failure is not a content failure: do not cache, and
                # do not claim a refusal was a considered one.
                raise

            result: ValidationResult = validate(response.text, locale=locale, facts=subset)
            warnings.extend(str(v) for v in result.warnings)

            if not result.rejected:
                self._cache.put(key, response.text)
                return NarrativeSection(
                    section=section,
                    locale=locale,
                    text=response.text,
                    is_refusal=False,
                    cache_key=key,
                    cached=False,
                    model=response.model,
                    prompt_version=PROMPT_VERSION,
                    warnings=tuple(warnings),
                )
            all_violations.extend(result.rejections)

        if self._strict:
            raise NarrativeRejectedError(tuple(all_violations), self._max_attempts)

        # Cache the refusal too. A chart that reliably provokes a prohibited
        # subject would otherwise retry on every request.
        self._cache.put(key, refusal)
        return NarrativeSection(
            section=section,
            locale=locale,
            text=refusal,
            is_refusal=True,
            cache_key=key,
            cached=False,
            model=self._client.model,
            prompt_version=PROMPT_VERSION,
            warnings=(*warnings, *(str(v) for v in all_violations)),
        )

    def generate_all(
        self, facts: dict[str, Any], locale: str, sections: tuple[str, ...] = SECTIONS
    ) -> tuple[NarrativeSection, ...]:
        """Every requested section. Sections absent from the facts are skipped.

        A time-unknown chart has no `chart`, `dasha` or `yogas_present`
        (CLAUDE.md 4.6), and asking for prose about an absent section would invite
        the model to invent it.
        """
        out: list[NarrativeSection] = []
        for section in sections:
            if not facts_subset(facts, section).keys() - {
                "schema_version",
                "engine_version",
                "confidence",
                "authority",
            }:
                continue
            out.append(self.generate(facts, section, locale))
        return tuple(out)


_RETRY_SUFFIX: Final[str] = """

## Retry notice

Your previous attempt was rejected by an automated validator. Two things are the \
usual cause:

1. You touched a prohibited subject from requirement 6. Use the refusal string.
2. You stated a number that does not appear in the JSON. Every figure you write \
must be present verbatim in the JSON you were given.

Write the section again, observing both.
"""


def _user_message(subset: dict[str, Any]) -> str:
    """The user turn: the facts slice, and nothing else.

    No instructions here - they belong in the system prompt, where they are not
    competing for attention with data.
    """
    return json.dumps(subset, ensure_ascii=False, indent=2, sort_keys=True)
