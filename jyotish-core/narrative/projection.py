"""Presentation projection of ChartFacts for the narrative layer.

ChartFacts stores every instant as UTC, because CLAUDE.md 4.7 requires it:
"Store timestamps as UTC-aware; convert at the presentation edge only." Prose *is*
a presentation edge - a reader expects "sunrise at 06:13", not
"00:43:31Z" - so the conversion has to happen somewhere.

It happens **here, in the engine**, and not in the model. CLAUDE.md N1 says no LLM
ever computes a number, and a timezone conversion is a computation: asking the
model to turn 00:43:31Z into 06:13 IST would be asking it to do arithmetic on a
value, which is exactly the thing that must never happen. So every ``*_utc`` field
gets a deterministic ``*_local`` sibling before the payload is handed over, and the
model has nothing left to convert.

This also closes a hole in the numeric-provenance check. That check requires every
number in the prose to appear in the facts the model was shown; without the local
renderings, correct prose quoting a local sunrise would be rejected as fabricated.
The projection is therefore used for the payload, for the cache key and for the
provenance check alike - one object, so the three can never disagree.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Final
from zoneinfo import ZoneInfo

from narrative.prompt import facts_subset

#: Suffix marking a UTC instant in ChartFacts.
UTC_SUFFIX: Final[str] = "_utc"

#: Suffix of the added sibling.
LOCAL_SUFFIX: Final[str] = "_local"

#: Fallback when the facts carry no place - only reachable for a hand-built
#: payload in a test, since a real document always echoes its input.
_FALLBACK_TZ: Final[str] = "UTC"


def timezone_of(facts: dict[str, Any]) -> str:
    """The IANA zone the birth was recorded in."""
    place = facts.get("input", {}).get("place", {}) if isinstance(facts.get("input"), dict) else {}
    tz = place.get("iana_tz") if isinstance(place, dict) else None
    return str(tz) if tz else _FALLBACK_TZ


def _format_local(value: str, tz: ZoneInfo) -> dict[str, str] | None:
    """Render one UTC ISO instant in ``tz`` as the fields prose actually needs."""
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:  # pragma: no cover - ChartFacts always carries Z
        parsed = parsed.replace(tzinfo=dt.UTC)
    local = parsed.astimezone(tz)
    return {
        # The three renderings a sentence can want, all engine-computed.
        "time": local.strftime("%H:%M"),
        "date": local.strftime("%Y-%m-%d"),
        "datetime": local.strftime("%Y-%m-%d %H:%M"),
    }


def add_local_times(node: Any, tz: ZoneInfo) -> Any:
    """Recursively add a ``*_local`` sibling for every ``*_utc`` string."""
    if isinstance(node, dict):
        out: dict[str, Any] = {}
        for key, value in node.items():
            out[key] = add_local_times(value, tz)
            if key.endswith(UTC_SUFFIX) and isinstance(value, str):
                rendered = _format_local(value, tz)
                if rendered is not None:
                    out[key.removesuffix(UTC_SUFFIX) + LOCAL_SUFFIX] = rendered
        return out
    if isinstance(node, list):
        return [add_local_times(item, tz) for item in node]
    return node


def project(facts: dict[str, Any], section: str) -> dict[str, Any]:
    """The exact payload a section's prose is generated from.

    Three things happen, in this order:

    1. the facts are narrowed to the section's slice (defence in depth for
       CLAUDE.md 6.2 - prose cannot cite what it was never shown);
    2. every UTC instant gains an engine-computed local rendering;
    3. the timezone is stated, so prose can name it without guessing.
    """
    subset = facts_subset(facts, section)
    tz_name = timezone_of(facts)
    projected = add_local_times(subset, ZoneInfo(tz_name))
    if isinstance(projected, dict):
        projected["presentation"] = {
            "timezone": tz_name,
            "note": (
                "Every *_local value was computed by the engine from its *_utc "
                "counterpart. Quote local values in prose; never convert a time "
                "yourself."
            ),
        }
    return dict(projected)
