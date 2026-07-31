"""Engine version, stamped into every ChartFacts document.

Bump rules (CLAUDE.md 4.5, 5):
  * MAJOR - ChartFacts JSON Schema change, or any change to the ayanamsa
    constant / sunrise convention / dasha year length that moves published
    numbers.
  * MINOR - new computed field, new rule, new optional system.
  * PATCH - bug fix that does not move a previously-correct number.

Any commit that changes a computed value must state the numeric before/after
and the physical reason in its message (CLAUDE.md 11, standing instructions).
"""

from __future__ import annotations

ENGINE_VERSION = "2.0.0"  # 2.0.0: node default mean → true (F-027) moves राहु/केतु ≤1°40′

# ChartFacts contract version. Independent of ENGINE_VERSION: a schema change
# is a major bump here and is validated in CI.
CHARTFACTS_SCHEMA_VERSION = "2.0.0"
