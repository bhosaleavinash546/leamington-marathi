"""ChartFacts schema validation.

CLAUDE.md 5: "Validate ``ChartFacts`` with a JSON Schema in CI. A schema change is
a major version bump." The validation runs in the engine's own tests rather than
only at the API edge, so a field that drifts out of contract fails the build
where it was introduced.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import jsonschema

from core.version import CHARTFACTS_SCHEMA_VERSION

SCHEMA_PATH: Path = (
    Path(__file__).parent / "schema" / f"chartfacts-{CHARTFACTS_SCHEMA_VERSION}.schema.json"
)


class ChartFactsError(ValueError):
    """A ChartFacts document that does not conform to its schema."""


@lru_cache(maxsize=1)
def load_schema() -> dict[str, Any]:
    """The pinned JSON Schema for the current ChartFacts version."""
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(
            f"no schema for ChartFacts {CHARTFACTS_SCHEMA_VERSION} at {SCHEMA_PATH}; "
            "a version bump needs a matching schema file"
        )
    data: dict[str, Any] = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    return data


def validate_chart_facts(facts: dict[str, Any]) -> None:
    """Raise :class:`ChartFactsError` with a readable path on any violation."""
    validator = jsonschema.Draft202012Validator(load_schema())
    errors = sorted(validator.iter_errors(facts), key=lambda e: list(e.absolute_path))
    if not errors:
        return
    lines = [
        f"  {'/'.join(str(p) for p in err.absolute_path) or '<root>'}: {err.message}"
        for err in errors[:20]
    ]
    if len(errors) > 20:
        lines.append(f"  ... and {len(errors) - 20} more")
    raise ChartFactsError(
        f"ChartFacts failed schema {CHARTFACTS_SCHEMA_VERSION}:\n" + "\n".join(lines)
    )


def assert_no_devanagari(facts: dict[str, Any]) -> None:
    """Assert that no engine-produced *key* carries Devanagari (CLAUDE.md 5).

    The user's own ``name`` is exempt: it is input echoed back, not an engine key,
    and a Marathi user is entitled to have their name stored as they wrote it.
    """
    exempt_paths = {("input", "name"), ("name", "display_name")}

    def walk(node: Any, path: tuple[str, ...]) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if _has_devanagari(key):
                    raise ChartFactsError(
                        f"Devanagari in a ChartFacts key at {'/'.join((*path, key))}"
                    )
                walk(value, (*path, key))
        elif isinstance(node, list):
            for index, item in enumerate(node):
                walk(item, (*path, str(index)))
        elif isinstance(node, str) and path not in exempt_paths and _has_devanagari(node):
            raise ChartFactsError(f"Devanagari in a ChartFacts value at {'/'.join(path)}: {node!r}")

    walk(facts, ())


def _has_devanagari(text: str) -> bool:
    """True if any character lies in the Devanagari or Devanagari Extended block."""
    return any("ऀ" <= ch <= "ॿ" or "꣠" <= ch <= "ꣿ" for ch in text)
