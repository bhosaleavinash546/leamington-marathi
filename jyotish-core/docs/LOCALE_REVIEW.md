# Locale review status

CLAUDE.md 7: *"**Curate all terms by hand.** Marathi and Hindi diverge on real
terms — machine translation will produce Hindi-flavoured Marathi that a
Maharashtrian user notices immediately."*

This file records which terms have been read by a native speaker and which have
not, so that "curated" is never assumed of a term that was merely written
carefully. It exists for the same reason `GOLDEN_FILES.md` does: the project would
rather report an unverified state than let one pass as verified.

## Status

| Group | Terms | Reviewed by a native Marathi reader |
|---|---|---|
| 12 rashis, 27 nakshatras, 30 tithis, 27 nitya yogas, 11 karanas, 12 months, 9 grahas, 12 bhavas, 7 varas | 156 | **no** |
| Panchang, chart, dasha, milan, UI, legal vocabulary | 135 | **no** |
| Chart combinations, doshas, strength bands (`combination`, `dosha`, `common`) | 36 | **no** — added for audit F-005 |

**No term in this repository has been reviewed by a native Marathi speaker.**
That is the honest position and it should stay written down until it changes.

## What that does and does not mean

It is not the machine-translation failure CLAUDE.md 7 warns about. Every term was
written from the classical Sanskrit form with Marathi orthography applied
deliberately, and the 35 known mr≠hi divergences are asserted distinct by
`tools/locale_audit.py` on every build — तूळ/तुला, मंगळ/मंगल, शनी/शनि, मूळ/मूल,
शततारका/शतभिषा, राहूकाळ/राहुकाल, तिथी/तिथि, काळसर्प/कालसर्प,
साडेसाती/साढ़ेसाती, चांडाळ/चांडाल, बलवृद्धी/बलवृद्धि, प्रबळ/प्रबल.

What is missing is the judgment only a practitioner has: whether a term *reads*
right on a patrika, and whether the register is the formal one a panchang uses
rather than merely correct vocabulary.

## Checklist for whoever reviews this

Ordered by how much doubt attaches to each. Everything above the line is a
judgment call I made and would most like a second opinion on.

| Term | Written as | The doubt | Why I chose it |
|---|---|---|---|
| `combination.veshi` | mr **वेशी योग**, hi **वेशि योग** | Sanskrit is *veśi*; both spellings appear in print | Follows this codebase's own established tatsama pattern — Hindi keeps short -i (तिथि, दृष्टि), Marathi lengthens (तिथी, दृष्टी). Consistency with the existing files decided it, not a preference about वेशि itself |
| `combination.amala_yoga` | **अमल योग** | अमला योग also appears | अमल = "spotless", which is the yoga's sense. अमला is a different word (the आवळा fruit), so अमला योग looks like a misreading rather than a variant |
| `combination.adhi_yoga` | **अधियोग** (one word) | अधि योग separated is also seen | It is a Sanskrit compound; the joined form is the usual written one |
| `combination.lagna_lord_in_dusthana` | **लग्नेश दुःस्थानात** | Reads clinically. A sheet might name the houses instead | दुःस्थान is standard vocabulary a Jyotish-literate reader knows, and the evidence affordance already shows which house. House numbers were left out because the app has a Devanagari/Latin numeral toggle and a hard-coded numeral would defeat it |
| `combination.raja_yoga_*` | **राजयोग — लग्नेश व पंचमेश युती** | Eight near-identical labels differing only by house lord | Naming both lords is what makes the eight distinguishable at a glance; a bare "राजयोग" eight times over would be worse |

Below the line — lower doubt, but still unread by a native speaker:

* The simple Sanskrit yoga names (गजकेसरी, हंस, मालव्य, रुचक, शश, भद्र, चामर,
  पर्वत, शकट, केमद्रुम) are **deliberately identical in mr and hi**. Inventing a
  difference where the tradition has none would be worse than sharing the form.
* `common.weak` = **क्षीण** in both. क्षीण is tatsama and shared; the alternative
  कमकुवत is Marathi-native but colloquial for a strength band.
* Whether **मंगळ दोष परिहार** is the phrase a Maharashtra sheet prints, against
  मंगळ दोष **भंग** or … **निवारण**. परिहार is the term the classical
  Muhurta-Chintamani usage suggests and is what the rule table cites.

## How to review

```bash
python -m tools.locale_audit          # completeness, divergence, rule-key coverage
python -m tools.facts_dump --name … | python -m json.tool   # keys, never prose
```

Edit `locales/<locale>/<namespace>.json` directly. The gate will fail if a term is
emptied, if a known-divergent pair becomes identical, or if a rule key loses its
term. Update the table above when a group is reviewed — including changing the
"no" to the reviewer and the date.
