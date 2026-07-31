"""The narrative layer: ChartFacts -> prose, validated in code.

CLAUDE.md 1 draws the line this package sits on. Below it, `core/` computes; above
it, `api/` serves. This package phrases - and it may do nothing else. It receives a
ChartFacts slice, it returns prose, and a post-generation validator enforces the
CLAUDE.md 6.6/6.7 prohibitions and the CLAUDE.md N1 no-numbers rule in code rather
than trusting the prompt.
"""

from __future__ import annotations

from narrative.client import (
    DEFAULT_MODEL,
    AnthropicClient,
    LLMClient,
    LLMError,
    LLMResponse,
    RefusingClient,
    ScriptedClient,
)
from narrative.prompt import (
    PROMPT_VERSION,
    SECTIONS,
    PromptError,
    build_system_prompt,
    facts_subset,
)
from narrative.service import (
    VALIDATOR_VERSION,
    NarrativeCache,
    NarrativeRejectedError,
    NarrativeSection,
    NarrativeService,
    cache_key,
)
from narrative.validator import (
    REQUIRED_CATEGORIES,
    NarrativeLocaleError,
    Severity,
    ValidationResult,
    Violation,
    blocklist_categories,
    refusal_string,
    validate,
)

__all__ = [
    "DEFAULT_MODEL",
    "PROMPT_VERSION",
    "REQUIRED_CATEGORIES",
    "SECTIONS",
    "VALIDATOR_VERSION",
    "AnthropicClient",
    "LLMClient",
    "LLMError",
    "LLMResponse",
    "NarrativeCache",
    "NarrativeLocaleError",
    "NarrativeRejectedError",
    "NarrativeSection",
    "NarrativeService",
    "PromptError",
    "RefusingClient",
    "ScriptedClient",
    "Severity",
    "ValidationResult",
    "Violation",
    "blocklist_categories",
    "build_system_prompt",
    "cache_key",
    "facts_subset",
    "refusal_string",
    "validate",
]
