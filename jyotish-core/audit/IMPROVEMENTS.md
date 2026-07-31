# IMPROVEMENTS

Genuine enhancements, ranked by user value per unit of effort. Fixes belong in
`FINDINGS.md`; nothing here is a defect, and nothing is listed to pad the page.

## 1. Per-sentence evidence traces — high value, low effort

Today the evidence affordance sits on a *finding*. The narrative paragraph that
interprets three findings carries one combined panel, so a reader cannot tell
which sentence rests on which placement.

The data already exists: `SECTION_FACT_KEYS` narrows the payload per section, and
the validator already extracts evidence keys from prose
(`check_evidence_citation`). Promote that check from WARN to a *mapping*: record
which evidence keys each sentence cited, and attach the affordance per sentence.

Why first: it is the one improvement that strengthens the app's central claim —
CLAUDE.md §8's "this is what separates a credible tool from a fortune-cookie
app" — and most of the machinery is built.

## 2. "Why does it say this" panel exposing the classical citation — high value, low effort

`citation` already travels from YAML to ChartFacts to the UI. Three things are
missing and all are cheap: translate the citations, show the शास्त्र / परंपरा /
लोकमत provenance band as a first-class label rather than English prose, and
surface it *uncollapsed* for `strength: weak` rules.

This is F-014's fix turned into a feature. For a practitioner audience it is the
difference between an app that asserts and an app that shows its working — and it
is the honest answer to the five self-declared traditional rules.

## 3. Birth-time rectification — high value, medium effort

The confidence machinery is already the hard half: `_probe_time_window` recomputes
the chart at 4-minute steps across a stated window and reports which fields move.
Invert it. Given a candidate window plus one or two known life events, rank the
candidate minutes by how well the dasha and transit picture fits.

Two constraints to respect, or it becomes the thing the product exists not to be:
present a *ranked window*, never a single "true" time, and keep every candidate's
evidence visible. Marathi clients routinely arrive with "sometime after sunset",
so the demand is real.

## 4. Muhurta finder validated against Date Panchang — high value, high effort

The panchang engine already computes everything a muhurta needs: five limbs with
boundaries, the three kaals, Abhijit, ritu, ayana. A finder over a date range is
mostly search plus a rule table.

Ranked fourth only because AUDIT §1's standard applies with full force — *"a tithi
end-time off by four minutes invalidates a muhurta"* — so this must not ship
before F-008, F-007, O1 and the 62 golden cases are settled. Built on unverified
sunrise it would be the most damaging feature in the product. Built after, it is
the most useful.

## 5. Transit (गोचर) alerts — medium value, medium effort

Sade Sati phase changes, Saturn and Jupiter ingresses, Rahu–Ketu shifts. The
Saturn crossing solver exists; generalising it to the other slow grahas is
incremental.

Deliberately ranked below the others: a notification that arrives unasked, about
an inauspicious transit, is a fear-delivery mechanism by default. CLAUDE.md §10
forbids the escalating fear ladder, and this is the feature most likely to become
one. Worth building only opt-in, phrased as a calendar event rather than a
warning, and never coupled to a remedy purchase. Fix F-001 first — an alert whose
timestamp wobbles by 39 seconds is an alert that fires twice.

## Not recommended

**Ashtottari and Yogini dashas.** The period tables are implemented and their
totals check; only the nakshatra mapping is refused for want of a source. Adding
them means picking a grouping — exactly what §0 rule 2 forbids. Supply a sourced
27-entry table and they work the same day; until then, leaving them raising is the
correct product decision, not a gap.

**More yogas.** 33 rules with 27 carrying text-and-chapter citations is already
past the point where breadth adds credibility. The marginal yoga adds a row; the
marginal *citation* and the marginal *Marathi term* (F-005) add trust.
