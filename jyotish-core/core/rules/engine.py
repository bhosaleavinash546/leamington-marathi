"""A YAML rule engine for yogas and doshas, with evidence traces.

CLAUDE.md 3.3: "Yogas/combinations as a **rule table in YAML**, not code ... Each
rule = machine-checkable predicate + evidence trace listing which grahas/houses
triggered it."

The trace is the point. CLAUDE.md 8 calls the evidence affordance "what separates
a credible tool from a fortune-cookie app", and CLAUDE.md 6.3 makes the narrative
layer cite it. So every leaf predicate that matches emits a machine key naming the
placement that satisfied it - ``jupiter_in_house_4_from_moon``, not "Jupiter is
well placed". Nothing in a trace is prose and nothing in it is localised; the
locale files map these keys upward.

Predicate grammar
-----------------
A predicate is a single-key mapping. Combinators nest:

===================================  ==========================================
``all: [p, ...]``                    every child matches
``any: [p, ...]``                    at least one child matches
``not: p``                           the child does not match
``at_least: {count: n, of: [p,...]}``at least ``n`` children match
===================================  ==========================================

Leaves are listed in :data:`LEAF_EVALUATORS`. An unknown predicate key is a load
error, not a silent false: a typo in a rule file must fail the build rather than
quietly disable a yoga.

Adding a leaf predicate means adding a rule that uses it in the same change.
``tests/unit/test_rules_milan_name.py::
test_all_leaf_predicates_are_exercised_by_the_shipped_rules`` fails otherwise -
grammar no rule exercises is grammar nothing tests.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Final

import yaml

from core.angles import shortest_separation
from core.chart.aspects import sign_aspect_strength
from core.chart.assemble import Chart
from core.chart.houses import house_distance
from core.enums import (
    DUSTHANA,
    RASHI_LORD,
    Dignity,
    Graha,
    Strength,
)

RULES_DIR: Final[Path] = Path(__file__).parent / "data"


class RuleError(ValueError):
    """A malformed rule file or an unknown predicate."""


@dataclass(frozen=True, slots=True)
class Rule:
    """One yoga or dosha definition."""

    key: str
    predicate: Mapping[str, Any]
    #: Classical source, recorded so a claim can be traced past this engine.
    citation: str
    #: Doctrinal standing: a named classical text, or regional practice.
    #: See :data:`PROVENANCE_BANDS`.
    provenance: str
    strength: Strength = Strength.MODERATE
    #: For doshas: which school's house set this rule encodes (CLAUDE.md 3.5).
    ruleset: str | None = None
    notes: str = ""


@dataclass(frozen=True, slots=True)
class RuleMatch:
    """A rule that fired, with the placements that made it fire."""

    key: str
    strength: Strength
    citation: str
    #: Carried through so the reader sees the rule's standing, not only its text.
    provenance: str
    ruleset: str | None
    evidence: tuple[str, ...]


@dataclass(slots=True)
class RuleContext:
    """Everything the predicates may look at, derived from a :class:`Chart`.

    A narrow facade rather than the Chart itself: it keeps the predicate
    implementations short, and it makes the set of facts a rule can depend on
    explicit and reviewable.
    """

    chart: Chart
    _evidence: list[str] = field(default_factory=list)

    # -- lookups -----------------------------------------------------------

    def house(self, graha: Graha) -> int:
        return self.chart.grahas[graha].house_whole_sign

    def rashi(self, graha: Graha) -> int:
        return self.chart.grahas[graha].point.rashi

    def lon(self, graha: Graha) -> float:
        return self.chart.grahas[graha].point.sid_lon

    def house_from(self, graha: Graha, reference: Graha) -> int:
        return house_distance(self.lon(reference), self.lon(graha))

    def lagna_rashi(self) -> int:
        return self.chart.lagna.rashi

    def house_lord(self, house_1based: int) -> Graha:
        rashi = (self.lagna_rashi() - 1 + house_1based - 1) % 12 + 1
        return RASHI_LORD[rashi]

    def dignity(self, graha: Graha) -> Dignity:
        return self.chart.grahas[graha].dignity

    def grahas_in(self, houses: Sequence[int]) -> tuple[Graha, ...]:
        wanted = set(houses)
        return tuple(g for g in Graha if self.house(g) in wanted)


# ---------------------------------------------------------------------------
# Leaf predicates
# ---------------------------------------------------------------------------

LeafResult = tuple[bool, list[str]]
LeafEvaluator = Callable[[RuleContext, Mapping[str, Any]], LeafResult]


def _graha(spec: Mapping[str, Any], field_name: str = "graha") -> Graha:
    try:
        return Graha(spec[field_name])
    except (KeyError, ValueError) as exc:
        raise RuleError(f"bad or missing {field_name!r} in predicate {dict(spec)}") from exc


def _houses(spec: Mapping[str, Any]) -> list[int]:
    houses = spec.get("houses")
    if not isinstance(houses, list) or not all(isinstance(h, int) for h in houses):
        raise RuleError(f"'houses' must be a list of ints in {dict(spec)}")
    if not all(1 <= h <= 12 for h in houses):
        raise RuleError(f"house numbers out of range in {dict(spec)}")
    return houses


def _p_graha_in_house(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    graha = _graha(spec)
    houses = _houses(spec)
    actual = ctx.house(graha)
    if actual in houses:
        return True, [f"{graha.value}_in_house_{actual}"]
    return False, []


def _p_graha_in_house_from(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    graha = _graha(spec)
    reference = _graha(spec, "from")
    houses = _houses(spec)
    actual = ctx.house_from(graha, reference)
    if actual in houses:
        return True, [f"{graha.value}_in_house_{actual}_from_{reference.value}"]
    return False, []


def _p_same_house(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    """Two or more grahas sharing a whole-sign house (yuti / conjunction)."""
    grahas = [Graha(g) for g in spec.get("grahas", [])]
    if len(grahas) < 2:
        raise RuleError("'same_house' needs at least two grahas")
    houses = {ctx.house(g) for g in grahas}
    if len(houses) != 1:
        return False, []
    house = houses.pop()
    return True, [f"{'_'.join(g.value for g in grahas)}_conjunct_in_house_{house}"]


def _p_within_orb(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    """Two grahas within a stated angular orb, regardless of sign boundary."""
    grahas = [Graha(g) for g in spec.get("grahas", [])]
    if len(grahas) != 2:
        raise RuleError("'within_orb' needs exactly two grahas")
    orb = float(spec.get("orb_deg", 10.0))
    separation = shortest_separation(ctx.lon(grahas[0]), ctx.lon(grahas[1]))
    if separation <= orb:
        return True, [
            f"{grahas[0].value}_{grahas[1].value}_within_{orb:g}deg_actual_{separation:.2f}deg"
        ]
    return False, []


def _p_aspects(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    """One graha casting a drishti of at least ``min_strength`` on another."""
    graha = _graha(spec)
    target = _graha(spec, "target")
    minimum = float(spec.get("min_strength", 1.0))
    distance = house_distance(ctx.lon(graha), ctx.lon(target))
    strength = sign_aspect_strength(graha, distance)
    if distance != 1 and strength >= minimum:
        return True, [f"{graha.value}_aspects_{target.value}_from_house_{distance}"]
    return False, []


def _p_dignity(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    graha = _graha(spec)
    wanted = {Dignity(d) for d in spec.get("dignities", [])}
    actual = ctx.dignity(graha)
    if actual in wanted:
        return True, [f"{graha.value}_dignity_{actual.value}"]
    return False, []


def _p_retrograde(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    graha = _graha(spec)
    if ctx.chart.grahas[graha].retrograde:
        return True, [f"{graha.value}_retrograde"]
    return False, []


def _p_combust(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    graha = _graha(spec)
    if ctx.chart.grahas[graha].combust:
        return True, [f"{graha.value}_combust"]
    return False, []


def _p_house_lord_in_house(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    """The lord of one house occupying one of a set of houses."""
    of_house = int(spec["of_house"])
    houses = _houses(spec)
    lord = ctx.house_lord(of_house)
    actual = ctx.house(lord)
    if actual in houses:
        return True, [f"lord_of_house_{of_house}_{lord.value}_in_house_{actual}"]
    return False, []


def _p_house_lords_conjunct(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    """Two house lords sharing a house - the classical Raja yoga signature."""
    houses = _houses(spec)
    if len(houses) != 2:
        raise RuleError("'house_lords_conjunct' needs exactly two houses")
    lord_a, lord_b = ctx.house_lord(houses[0]), ctx.house_lord(houses[1])
    if lord_a is lord_b:
        return False, []  # one graha ruling both is a different yoga
    if ctx.house(lord_a) != ctx.house(lord_b):
        return False, []
    return True, [
        f"lord_of_house_{houses[0]}_{lord_a.value}_conjunct_"
        f"lord_of_house_{houses[1]}_{lord_b.value}_in_house_{ctx.house(lord_a)}"
    ]


def _p_count_in_houses(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    """At least ``min`` (or at most ``max``) grahas among a set of houses."""
    houses = _houses(spec)
    exclude = {Graha(g) for g in spec.get("exclude", [])}
    found = tuple(g for g in ctx.grahas_in(houses) if g not in exclude)
    minimum = spec.get("min")
    maximum = spec.get("max")
    if minimum is not None and len(found) < int(minimum):
        return False, []
    if maximum is not None and len(found) > int(maximum):
        return False, []
    label = "_".join(g.value for g in found) if found else "none"
    return True, [f"houses_{'_'.join(map(str, houses))}_occupied_by_{label}"]


def _p_no_graha_in_houses_from(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    """No graha in the given houses counted from a reference graha.

    Kemadruma yoga is stated this way: nothing in the 2nd or 12th from the Moon.
    """
    reference = _graha(spec, "from")
    houses = set(_houses(spec))
    exclude = {Graha(g) for g in spec.get("exclude", [])} | {reference}
    offenders = [g for g in Graha if g not in exclude and ctx.house_from(g, reference) in houses]
    if offenders:
        return False, []
    return True, [f"no_graha_in_houses_{'_'.join(map(str, sorted(houses)))}_from_{reference.value}"]


def _p_unafflicted(ctx: RuleContext, spec: Mapping[str, Any]) -> LeafResult:
    """A graha neither combust, nor debilitated, nor in a dusthana.

    "Unafflicted" has no single classical definition; this engine fixes it to
    those three conditions and says so, rather than leaving each rule file to
    imply its own.
    """
    graha = _graha(spec)
    pos = ctx.chart.grahas[graha]
    if pos.combust or pos.dignity is Dignity.DEBILITATED or pos.house_whole_sign in DUSTHANA:
        return False, []
    return True, [f"{graha.value}_unafflicted"]


LEAF_EVALUATORS: Final[dict[str, LeafEvaluator]] = {
    "graha_in_house": _p_graha_in_house,
    "graha_in_house_from": _p_graha_in_house_from,
    "same_house": _p_same_house,
    "within_orb": _p_within_orb,
    "aspects": _p_aspects,
    "dignity": _p_dignity,
    "retrograde": _p_retrograde,
    "combust": _p_combust,
    "house_lord_in_house": _p_house_lord_in_house,
    "house_lords_conjunct": _p_house_lords_conjunct,
    "count_in_houses": _p_count_in_houses,
    "no_graha_in_houses_from": _p_no_graha_in_houses_from,
    "unafflicted": _p_unafflicted,
}

COMBINATORS: Final[frozenset[str]] = frozenset({"all", "any", "not", "at_least"})


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def evaluate(predicate: Mapping[str, Any], ctx: RuleContext) -> LeafResult:
    """Evaluate one predicate, returning its truth and its evidence keys."""
    if len(predicate) != 1:
        raise RuleError(f"a predicate must have exactly one key, got {sorted(predicate)}")
    ((name, body),) = predicate.items()

    if name == "all":
        evidence: list[str] = []
        for child in body:
            ok, trace = evaluate(child, ctx)
            if not ok:
                return False, []
            evidence.extend(trace)
        return True, evidence

    if name == "any":
        for child in body:
            ok, trace = evaluate(child, ctx)
            if ok:
                return True, trace
        return False, []

    if name == "not":
        ok, _ = evaluate(body, ctx)
        # A negation's evidence is the absence of something, which cannot be
        # pointed at; the enclosing rule's other leaves carry the trace.
        return (not ok), []

    if name == "at_least":
        needed = int(body["count"])
        matched: list[str] = []
        hits = 0
        for child in body["of"]:
            ok, trace = evaluate(child, ctx)
            if ok:
                hits += 1
                matched.extend(trace)
        return (hits >= needed), (matched if hits >= needed else [])

    evaluator = LEAF_EVALUATORS.get(name)
    if evaluator is None:
        raise RuleError(
            f"unknown predicate {name!r}; known: {sorted(LEAF_EVALUATORS) + sorted(COMBINATORS)}"
        )
    return evaluator(ctx, body)


#: Doctrinal standing, reported so a reader can tell a cited rule from a
#: traditional one. CLAUDE.md 10 distinguishes शास्त्र from परंपरा and the rule
#: table already knew which was which - it simply never told anyone (audit F-014).
PROVENANCE_BANDS: Final[frozenset[str]] = frozenset({"shastra", "parampara"})


def _provenance(entry: dict[str, Any]) -> str:
    """The rule's declared band. Required: a rule that does not say is a rule
    whose standing a reader cannot judge."""
    band = entry.get("provenance")
    if band not in PROVENANCE_BANDS:
        raise RuleError(
            f"rule {entry.get('key')!r} declares provenance {band!r}; "
            f"every rule must declare one of {sorted(PROVENANCE_BANDS)} so a reader "
            "can tell a cited rule from a traditional one (CLAUDE.md 10)"
        )
    return str(band)


def load_rules(path: Path) -> tuple[Rule, ...]:
    """Load and validate a rule file.

    Validation walks every predicate at load time, so an unknown predicate key or
    a malformed house list fails when the file is read rather than on the first
    chart that happens to exercise that branch.
    """
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or "rules" not in raw:
        raise RuleError(f"{path}: expected a mapping with a 'rules' key")

    rules: list[Rule] = []
    # Uniqueness is on (key, ruleset), not on key alone: one dosha legitimately
    # appears once per school, and those variants share a key by design so that
    # ChartFacts reports the same dosha name whichever ruleset was applied.
    seen: set[tuple[str, str | None]] = set()
    for entry in raw["rules"]:
        key = entry.get("key")
        if not key:
            raise RuleError(f"{path}: a rule is missing its 'key'")
        identity = (key, entry.get("ruleset"))
        if identity in seen:
            raise RuleError(f"{path}: duplicate rule {key!r} for ruleset {entry.get('ruleset')!r}")
        seen.add(identity)
        if "when" not in entry:
            raise RuleError(f"{path}: rule {key!r} is missing its 'when' predicate")
        rule = Rule(
            key=key,
            predicate=entry["when"],
            citation=entry.get("citation", ""),
            provenance=_provenance(entry),
            strength=Strength(entry.get("strength", Strength.MODERATE.value)),
            ruleset=entry.get("ruleset"),
            notes=entry.get("notes", ""),
        )
        _validate_predicate(rule.predicate, path, key)
        rules.append(rule)
    return tuple(rules)


def _validate_predicate(predicate: Any, path: Path, rule_key: str) -> None:
    """Structural check without a chart: every key must be known."""
    if not isinstance(predicate, dict) or len(predicate) != 1:
        raise RuleError(f"{path}: rule {rule_key!r} has a malformed predicate: {predicate!r}")
    ((name, body),) = predicate.items()
    if name in ("all", "any"):
        if not isinstance(body, list) or not body:
            raise RuleError(f"{path}: rule {rule_key!r}: {name!r} needs a non-empty list")
        for child in body:
            _validate_predicate(child, path, rule_key)
    elif name == "not":
        _validate_predicate(body, path, rule_key)
    elif name == "at_least":
        if not isinstance(body, dict) or "count" not in body or "of" not in body:
            raise RuleError(f"{path}: rule {rule_key!r}: 'at_least' needs 'count' and 'of'")
        for child in body["of"]:
            _validate_predicate(child, path, rule_key)
    elif name not in LEAF_EVALUATORS:
        raise RuleError(f"{path}: rule {rule_key!r} uses unknown predicate {name!r}")


def evaluate_rules(
    rules: Sequence[Rule], chart: Chart, *, ruleset: str | None = None
) -> tuple[RuleMatch, ...]:
    """Every rule that fires for a chart, with its evidence.

    ``ruleset`` filters to one school's variant where a rule declares one, so a
    Mangal dosha evaluation states which house set it applied (CLAUDE.md 3.5).
    """
    ctx = RuleContext(chart=chart)
    out: list[RuleMatch] = []
    for rule in rules:
        if ruleset is not None and rule.ruleset is not None and rule.ruleset != ruleset:
            continue
        matched, evidence = evaluate(rule.predicate, ctx)
        if matched:
            out.append(
                RuleMatch(
                    key=rule.key,
                    strength=rule.strength,
                    citation=rule.citation,
                    provenance=rule.provenance,
                    ruleset=rule.ruleset,
                    evidence=tuple(dict.fromkeys(evidence)),  # de-duplicate, keep order
                )
            )
    return tuple(out)


def load_yogas() -> tuple[Rule, ...]:
    return load_rules(RULES_DIR / "yogas.yaml")


def load_doshas() -> tuple[Rule, ...]:
    return load_rules(RULES_DIR / "doshas.yaml")
