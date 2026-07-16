"""Gate 4 tests: the number validator must catch orphan figures and pass
figures that exist in insights.json under any thousand-separator/currency
formatting."""

from __future__ import annotations

import pytest

from narrative.generator import template_narrative, validate_narrative

INSIGHTS = {
    "meta": {"dataset": "test.xlsx", "currency": "GBP", "run_id": "r1", "generated_at": "2026-01-01"},
    "kpis": {
        "total_annual_spend": 1234567.89,
        "total_addressable_gap_per_year": 700.0,
        "parts_analysed": 13,
        "suppliers": 8,
        "top_commodity": "forging",
        "top_commodity_share_pct": 41.2,
    },
    "findings": [
        {"title": "Gap on P-1007", "severity": "critical", "impact_per_year": 700.0,
         "detail": "quoted 55.0 vs should-cost 44.3", "analysis": "should_cost_gap",
         "method": "quoted_price - should_cost", "provenance": {}, "caveats": []},
    ],
    "analyses": [],
    "data_quality": {"trust_score": 62, "checks": []},
}


def test_validator_accepts_verbatim_and_formatted_numbers():
    text = ("[Computed] Total spend is £1,234,567.89 per year across 13 parts. "
            "[Computed] The gap is £700.0/yr, i.e. 700 pounds. Trust score 62/100.")
    assert validate_narrative(text, INSIGHTS) == []


def test_validator_rejects_orphan_numbers():
    # 9999.99 and 42 exist nowhere in INSIGHTS -> both are orphans.
    text = "[Computed] Spend is £9,999.99 and there are 42 suppliers."
    orphans = validate_narrative(text, INSIGHTS)
    assert "9,999.99" in orphans
    assert "42" in orphans


def test_validator_rejects_llm_rounding():
    # 1.2 (million) is a re-rounded figure, not in the JSON -> orphan.
    orphans = validate_narrative("Spend is about 1.2 million.", INSIGHTS)
    assert orphans == ["1.2"]


def test_template_narrative_validates_by_construction():
    narrative = template_narrative(INSIGHTS)
    assert validate_narrative(narrative, INSIGHTS) == []
    assert "[Computed]" in narrative
    assert "£700.00/yr" in narrative
    # Every sentence-bearing line is tagged.
    for line in narrative.splitlines():
        if line.startswith(("#", "-", "_")) or not line.strip():
            continue
        if line[0].isdigit():
            assert "[Computed]" in line or "[Interpretation]" in line


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
