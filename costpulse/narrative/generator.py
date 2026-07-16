"""LLM narrative layer. Words only — every number must already exist in
insights.json.

The generator calls the Anthropic API (when ANTHROPIC_API_KEY is set), then a
post-generation validator regex-extracts every number from the narrative and
verifies each one appears in insights.json (thousand separators and currency
formatting allowed). Orphan numbers trigger a regeneration with the violation
quoted back, max 2 retries, after which a template narrative built purely by
string formatting from the JSON is used instead — the template can never
contain an orphan number by construction.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

ANTHROPIC_MODEL = "claude-sonnet-4-6"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MAX_RETRIES = 2

# Embedded verbatim per the build spec.
SYSTEM_PROMPT = """You are the narrative layer of CostPulse, a deterministic cost-analysis tool.

- You will receive insights.json. You may only state numbers that appear in it, copied verbatim. You may not compute, estimate, round differently, or extrapolate any figure.
- Tag every sentence [Computed] or [Interpretation].
- Write for a senior cost engineer: direct, no filler, lead with the largest financial opportunity, quantify everything, name the specific parts/suppliers/commodities.
- Structure: Executive summary (5 lines max) -> Top opportunities ranked by £/yr -> Data quality caveats -> Recommended next actions."""

_NUMBER_PATTERN = re.compile(r"(?<![\w./-])[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w./,-])[-+]?\d+(?:\.\d+)?(?![\d,])")


def _collect_numbers(node: Any, into: set[float]) -> None:
    """Every numeric value in insights.json, plus numbers embedded in its
    strings (methods, details), becomes an allowed figure."""
    if isinstance(node, bool):
        return
    if isinstance(node, (int, float)):
        into.add(round(float(node), 6))
        into.add(round(abs(float(node)), 6))
        return
    if isinstance(node, str):
        for m in _NUMBER_PATTERN.finditer(node):
            try:
                v = float(m.group().replace(",", ""))
                into.add(round(v, 6))
                into.add(round(abs(v), 6))
            except ValueError:
                pass
        return
    if isinstance(node, dict):
        for v in node.values():
            _collect_numbers(v, into)
    elif isinstance(node, list):
        for v in node:
            _collect_numbers(v, into)


def extract_narrative_numbers(text: str) -> list[str]:
    cleaned = re.sub(r"[£$€₹]", "", text)
    # Markdown ordered-list markers ("1. ", "2. ") are structure, not figures.
    cleaned = re.sub(r"(?m)^\s*\d+\.\s+", "", cleaned)
    return [m.group() for m in _NUMBER_PATTERN.finditer(cleaned)]


def validate_narrative(narrative: str, insights: dict[str, Any]) -> list[str]:
    """Returns the orphan numbers — figures in the narrative that do not exist
    anywhere in insights.json."""
    allowed: set[float] = set()
    _collect_numbers(insights, allowed)
    orphans = []
    for raw in extract_narrative_numbers(narrative):
        try:
            value = round(float(raw.replace(",", "")), 6)
        except ValueError:
            continue
        if value not in allowed and abs(value) not in allowed:
            orphans.append(raw)
    return orphans


# ---------------------------------------------------------------- template fallback

def _fmt(value: Any, currency: str) -> str:
    if value is None:
        return "n/a"
    return f"{currency}{value:,.2f}" if isinstance(value, float) else f"{currency}{value:,}"


def template_narrative(insights: dict[str, Any]) -> str:
    """Deterministic narrative built by string formatting only. Every figure
    is interpolated straight from insights.json, so it validates by
    construction."""
    kpis = insights.get("kpis", {})
    quality = insights.get("data_quality", {})
    findings = insights.get("findings", [])
    meta = insights.get("meta", {})
    ccy = {"GBP": "£", "USD": "$", "EUR": "€"}.get(meta.get("currency") or "", "")

    lines = [f"# CostPulse summary — {meta.get('dataset', 'dataset')}", ""]
    lines.append("## Executive summary")
    gap = kpis.get("total_addressable_gap_per_year")
    spend = kpis.get("total_annual_spend")
    if gap is not None:
        lines.append(f"[Computed] Total addressable should-cost gap: {_fmt(gap, ccy)}/yr.")
    if spend is not None:
        lines.append(f"[Computed] Total annual spend analysed: {_fmt(spend, ccy)}/yr across "
                     f"{kpis.get('parts_analysed', 'n/a')} parts and {kpis.get('suppliers', 'n/a')} suppliers.")
    if kpis.get("top_commodity"):
        lines.append(f"[Computed] Largest commodity: {kpis['top_commodity']} at "
                     f"{kpis.get('top_commodity_share_pct')}% of spend.")
    lines.append(f"[Computed] Data trust score: {quality.get('trust_score', 'n/a')}/100.")
    lines.append("")

    lines.append("## Top opportunities")
    ranked = [f for f in findings if f.get("impact_per_year") is not None]
    others = [f for f in findings if f.get("impact_per_year") is None]
    for i, f in enumerate(ranked[:8], 1):
        lines.append(f"{i}. [Computed] {f['title']} — impact {_fmt(f['impact_per_year'], ccy)}/yr "
                     f"(severity: {f['severity']}). {f['detail']}")
    for f in others[:4]:
        lines.append(f"- [Computed] {f['title']} (severity: {f['severity']}). {f['detail']}")
    if not findings:
        lines.append("[Computed] No findings could be produced from the supplied columns.")
    lines.append("")

    lines.append("## Data quality caveats")
    for check in quality.get("checks", []):
        if check["status"] == "fail":
            lines.append(f"- [Computed] {check['name']}: {check['failing_row_count']} row(s) failed. "
                         f"{check['description']}")
        elif check["status"] == "skipped":
            lines.append(f"- [Computed] {check['name']} skipped: {check['skipped_reason']}")
    skipped = [a for a in insights.get("analyses", []) if a["status"] != "ok"]
    for a in skipped:
        lines.append(f"- [Computed] Analysis '{a['analysis']}' not run: {a.get('reason', 'unknown')}")
    lines.append("")

    lines.append("## Recommended next actions")
    if ranked:
        lines.append(f"- [Interpretation] Start with the top-ranked opportunity above; it is the largest "
                     f"computed lever in this dataset.")
    fails = [c for c in quality.get("checks", []) if c["status"] == "fail"]
    if fails:
        lines.append("- [Interpretation] Fix the failed data-quality rows at source and re-run before "
                     "negotiating from these numbers.")
    if any(a["status"] == "insufficient_data" for a in skipped):
        lines.append("- [Interpretation] Map the missing columns named above in schema_map.yaml to unlock "
                     "the skipped analyses.")
    lines.append("")
    lines.append("_Narrative generated by deterministic template (no LLM figures)._")
    return "\n".join(lines)


# ---------------------------------------------------------------- Anthropic call

def _call_anthropic(insights_json: str, violation_feedback: str | None, api_key: str) -> str:
    user_content = (
        "Here is insights.json. Write the summary now.\n\n```json\n" + insights_json + "\n```"
    )
    if violation_feedback:
        user_content += (
            "\n\nYour previous draft contained numbers that do NOT exist in insights.json: "
            f"{violation_feedback}. Every figure must be copied verbatim from the JSON. Rewrite."
        )
    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 2000,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_content}],
    }
    req = urllib.request.Request(
        ANTHROPIC_URL,
        data=json.dumps(payload).encode(),
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read())
    return "".join(block.get("text", "") for block in body.get("content", []))


def generate_narrative(insights: dict[str, Any]) -> tuple[str, list[str]]:
    """Returns (summary_markdown, validator_log)."""
    log: list[str] = []
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        log.append("ANTHROPIC_API_KEY not set: using deterministic template narrative.")
        narrative = template_narrative(insights)
        orphans = validate_narrative(narrative, insights)
        log.append(f"Validator: {len(orphans)} orphan numbers in template narrative.")
        return narrative, log

    insights_json = json.dumps(insights, ensure_ascii=False)
    feedback: str | None = None
    for attempt in range(1, MAX_RETRIES + 2):  # initial + 2 retries
        try:
            narrative = _call_anthropic(insights_json, feedback, api_key)
        except (urllib.error.URLError, OSError, json.JSONDecodeError, TimeoutError) as exc:
            log.append(f"Attempt {attempt}: Anthropic API call failed ({exc}); falling back to template.")
            break
        orphans = validate_narrative(narrative, insights)
        if not orphans:
            log.append(f"Attempt {attempt}: validated clean — zero orphan numbers.")
            return narrative, log
        log.append(f"Attempt {attempt}: orphan numbers rejected: {orphans}")
        feedback = ", ".join(orphans)
        if attempt >= MAX_RETRIES + 1:
            log.append("Max retries reached; falling back to template narrative.")

    narrative = template_narrative(insights)
    orphans = validate_narrative(narrative, insights)
    log.append(f"Validator: {len(orphans)} orphan numbers in template narrative.")
    return narrative, log
