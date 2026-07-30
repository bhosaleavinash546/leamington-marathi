# DIRECTION — visual direction and the Phase A token system

DESIGN.md §10 Phase A. Read alongside `web/app/tokens.css` (the tokens) and
`/tokens` (the sheet that renders every one of them in both themes).

Status: tokens committed, sheet built and photographed, contrast and font
budgets measured. **The page-scan study Phase A opens with has not been done**,
and could not be from here. That is the first section, not a footnote.

---

## 1. What has not been verified: the दाते पंचांग page

Phase A begins: *"source and study an actual दाते पंचांग page scan and describe
what you observed."* §1 makes the same point sharply — *"don't reach for a plain
broadsheet look with hairline rules and zero border-radius and call it
'panchang-inspired' … go and look at a scan of an actual page before you
design."*

I have not looked at one. I cannot source or view a page scan in this
environment, and I will not describe observations I did not make. Every colour,
measure and rhythm below therefore derives from **DESIGN.md's own description**
of the artifact — two-colour letterpress, dense numeric columns, Devanagari-first
type — and not from the artifact. The specification is a good description. It is
still second-hand, and second-hand is exactly the failure mode §1 names.

Treat the token set as a defensible first proposal, not as a verified match.

### What a reviewer with a real page should check

Concrete enough to be answered in an afternoon with one issue of the almanac.
Anything that comes back different should move the token, not the page.

| # | Question | Token it would move |
|---|---|---|
| 1 | Is the paper warmer or cooler than `#F7F3EA`, and how much does it darken across the gutter? | `--paper`, `--paper-sunk` |
| 2 | Is the red closer to sindoor `#B3251E` or to a brighter vermilion? Does it shift between the festival column and the warning marks? | `--sindoor`, and whether one red is enough |
| 3 | Are the rules genuinely hairlines, or do the column rules run heavier than the row rules? | `--hairline`, and whether a second rule weight is needed |
| 4 | How many type sizes appear on one page? A modular 1.2 assumes roughly six. | the `--step-*` scale, `--step-deva-bump` |
| 5 | Is the tabular matter set in a serif or a sans? DESIGN.md assigns a sans (IBM Plex Sans Devanagari) to data on a technical-register argument, not on an observed one. | `--font-data` |
| 6 | Are degrees printed `२४° ०७'`, `२४-०७`, or with the mark omitted? | `core.angles.format_dm` |
| 7 | Is ग्रहस्पष्ट set with rules on all four sides of every cell, or only horizontals? | the table primitive in Phase B |
| 8 | Do Devanagari numerals carry the same width as each other in the printed face? Ours do (measured, §5 below); a printed proportional face would change the column strategy. | tabular-figure policy |

Until those are answered the honest claim is: *this is what DESIGN.md's
description of a panchang implies*, not *this is what दाते पंचांग looks like*.

---

## 2. The direction, stated plainly

The artifact is a **printed sheet**, not a screen with a paper theme. Three
consequences drive every token:

**Ink is the only material.** There is one shadow token and it exists solely for
the mobile bottom sheet. Hierarchy comes from rules, weight and the sunk surface.
Nothing floats, nothing has depth, `--radius-sheet` is `0` and `--radius-control`
is 2px — the maximum §2.3 permits, and it applies to controls only.

**Red is a word, not a colour.** `--sindoor` marks auspicious and inauspicious
periods, the active tithi, festival days and warnings. The test in §1 is the
right one: if removing a red element loses no information, it was decoration. On
the token sheet, red appears exactly twice — the two signal swatches, and the
contrast column where it flags a token that needs an outline. That is the
discipline the product has to keep.

**The Devanagari face was chosen first.** Rozha One for display, Mukta for body,
IBM Plex Sans Devanagari for data — all three Devanagari-first designs, with
their own matched Latin. Line-height is 1.7 for Devanagari against 1.5 for Latin
because tight line boxes clip matras, and the specimen on the sheet is chosen to
prove it: `कृत्तिका ज्येष्ठा` puts marks above cap-height and below the baseline
in the same string.

Nine graha colours exist but are rationed. They appear as a 0.9rem chip beside a
Devanagari abbreviation, never as a fill, never as the only channel.

---

## 3. Reviewed against §1's banned list

Every row, checked against what is actually in `tokens.css` and on the sheet.

| Banned | Present? | Note |
|---|---|---|
| Purple/indigo/violet cosmic gradients | No | No gradient of any kind is defined. The palette has no purple. |
| Twinkling star or particle fields | No | — |
| Continuously rotating zodiac wheel | No | §3.1's "nothing animates continuously" is a token-level fact: there is no loop or iteration token to reach for. |
| Glowing/neon/bloom planet orbs | No | Graha colour is a flat 0.9rem square. No blur, no glow token exists. |
| Glassmorphism, frosted panels, backdrop blur | No | No blur token. `--paper-sunk` does the recessed work. |
| Crystal balls, tarot, third eyes, mandalas | No | — |
| Animated ॐ, lotus loaders | No | §4.7 forbids a spinner outright; no loader token. |
| Faux-Devanagari Latin display fonts | No | The three faces are real Devanagari designs; the Latin is each family's own. |
| Emoji planets or zodiac emoji | No | Identity is Devanagari abbreviation + colour chip. |
| Lens flares, bokeh, parallax | No | — |
| Warm-cream + terracotta + high-contrast-serif | **Nearly** | See below. |

### What changed, and why

**The graha chip.** The first version put the Devanagari abbreviation *inside*
the coloured chip. Screenshotting it killed the idea. Measured glyph-on-chip
contrast: Saturn 1.37:1 on light, the Moon 1.04:1 and Venus 1.11:1 on dark. The
tokens needing an outline to satisfy the *surface* gate were precisely the ones
whose own glyph vanished — a fill dark enough to read against paper swallows ink
text, and a fill light enough to read against dark paper swallows light text.
Colour and glyph are now separate channels: a small chip beside the abbreviation,
never behind it. Worst abbreviation contrast is now 16.72:1 light and 15.06:1
dark, and no per-token text-colour table is needed.

**The last banned row is the one to keep watching.** `#F7F3EA` paper with a
`#B3251E` red and a high-contrast display serif is one lazy step from the
"warm-cream + terracotta + tasteful serif" default §1 rejects. Three things keep
it out, and all three are load-bearing rather than decorative:

1. Rozha One is used for the masthead and the patrika title only — it is not a
   general heading face. On the sheet it appears once.
2. The red is functional and rationed, not an accent applied to headings.
3. The type is Devanagari-first and the numerals default to ०–९, which is what
   the panchang does and what nothing else in the category does. This is the
   aesthetic risk §2.2 asks for and it is the strongest differentiator here.

If a future screen uses the display serif for section headings, or tints a
heading `--sindoor` for emphasis, it has fallen into the banned row. That is the
specific failure to watch for in Phase B.

**Nothing on the sheet animates.** §3.1 bans ambient motion and a token sheet has
no state change to explain, so the motion tokens are listed as values in a table
rather than demonstrated. Demonstrating them would itself be decoration.

---

## 4. Where the tokens and the gate disagree

Three places where a measured value fails a stated rule. All three are recorded
rather than tuned away.

### 4.1 Six graha tokens fail 3:1, not two

§2.1 anticipates that the Moon and Venus "need `--ink` outline on light mode".
Measuring all nine against both surfaces in both themes (`npm run
audit:contrast`) found six failures, and not the same six per theme:

```
light   moon 1.07   venus 1.14   jupiter 2.52
dark    saturn 1.28  mars 2.38    mercury 2.81
```

Unsurprising once stated: the token light enough to read on dark paper is the one
that vanishes on light. The outline is therefore applied **per theme from the
measurement**, not from the note. No hue changed — this adds no colour to the
set.

### 4.2 `--rule` fails 3:1 in both themes, and that is correct

1.50:1 on light, 1.43:1 on dark, against the worse of the two surfaces. §8 asks
3:1 for "UI borders". A letterpress hairline separating rows of a table whose
structure is already carried by `<table>`/`<th scope>` is decoration, not a
component identifier, and raising it to 3:1 would give the sheet a gridded,
spreadsheet look that is the opposite of the direction. The same token would be
wrong as an input border or a focus ring, where 3:1 genuinely applies, so
interactive edges take `--rule-interactive` (6.15:1 light, 5.52:1 dark) and the
audit holds *that* to the gate. `--rule` is the audit's only exemption and it is
named in the code.

### 4.3 Two faces exceed §9's 90KB budget — owner's call

§9 caps the Devanagari payload at 90KB per face. Measured, after subsetting:

| Face | Size | |
|---|---|---|
| Mukta 400 | 99.4KB | over |
| Mukta 600 | 102.5KB | over |
| IBM Plex Sans Devanagari 400 / 600 | 80.6 / 82.1KB | within |
| Rozha One 400 | 73.6KB | within |
| **Total Devanagari** | **438.3KB across five faces** | |

The overage buys one specific thing: the Devanagari subsets carry the whole of
U+0900–U+097F rather than only the characters in `locales/`. The `name` field is
arbitrary user Devanagari, and a corpus-derived subset renders every screen
correctly and then breaks on the user's own name — the one line they will look at
first. Corpus-only subsetting saves about 7KB per face and still leaves Mukta
over budget, so it does not resolve the conflict; it only shrinks it.

Three ways out, none free, all the owner's to pick:

1. **Accept the overage** (current state). 438KB of Devanagari on a mid-range
   Android over 4G, against §9's implied ~270KB for three faces.
2. **Drop a weight.** Mukta 600 is the largest single file. Emphasis would come
   from Plex 600 or from size and rules instead. Saves 102.5KB.
3. **Drop to two families.** Plex covers body and data within budget; Mukta goes.
   That contradicts §2.2's face assignment and should not be done on size alone.

Recommendation: (2) — the panchang gets its hierarchy from rules and weight, but
it does not need two bold Devanagari faces to do it. Deferred to Phase B, when
there are real components to judge the loss against.

---

## 5. What only a screenshot could find

Phase A's standing instruction — *"screenshot your work and critique it before
reporting done"* — earned its place. The build was green before any of these were
visible. `npm run design:screenshot` now automates the check and fails on a page
that renders no text or logs a CSP violation.

**Every route in the app rendered blank.** `script-src 'self'` with no nonce
blocks the App Router's inline RSC payload scripts. The server HTML arrived
complete, React hydrated against an empty tree, and deleted it. This was not new
in Phase A — it applied to `/mr` and `/mr/kundali` as shipped. `'unsafe-inline'`
would fix it and is unavailable here: `KundaliChart` mounts server-generated SVG
through `dangerouslySetInnerHTML`, so an inline `<script>` reaching that markup
would execute. The CSP now carries a per-request nonce from `middleware.ts`.
Cost, stated: a nonce cannot be baked into a prerendered page, so the locale
routes render per request instead of at build time.

**The arcminute prime was in no font the project ships.** `core.angles.format_dm`
emitted `12°44′` with U+2032. Mukta, Rozha One and IBM Plex Sans Devanagari all
lack the glyph — and so does the Noto Sans Devanagari that WeasyPrint embeds, so
every degree in the exported PDF's ग्रहस्पष्ट table was a missing-glyph box.
`format_dms` in the same module had always used the ASCII apostrophe; `format_dm`
now matches it. `npm run fonts:subset` fails if a character the app emits has no
glyph, so the next one cannot ship unseen.

**The token sheet was unreachable.** The locale middleware redirected `/tokens`
to `/mr/tokens`, which has no route.

**Both themes rendered light.** The dark tokens were scoped to `:root[data-theme]`,
so a themed subtree — the entire point of a side-by-side sheet — inherited the
root. The `[data-theme]` selectors are no longer anchored to `:root`, and
`[data-theme='light']` now restates the light values so a light panel inside a
dark document works too.

Two things I misread from the screenshot and had to correct by measuring, worth
recording as method: the dark `--paper` swatch looked white (it is `rgb(20,18,15)`;
the hairline border misleads at reduced scale), and the Devanagari figures looked
mis-aligned (all three columns measure identically across rows and across numeral
systems — 302.2 / 176.3 / 163.4 px — so §5.5's tabular risk does not materialise
in these faces). Look, then measure; the screenshot finds candidates, not
verdicts.

---

## 6. Derived tokens — the brief versus the interpretation

Everything in `tokens.css` traceable to DESIGN.md is transcribed verbatim. Four
things are not in the specification and are marked `DERIVED` in the file:

| Token | Why it exists | Choice |
|---|---|---|
| `--step-*`, `--step-deva-bump` | §2.2 asks for "a modular ratio, set once as tokens" without naming one | 1.2 (minor third). A denser ratio suits a tabular sheet; the patrika's hierarchy comes from rules and weight, not size jumps. |
| `--graha-outline` | §2.1 names two outlined grahas; measurement found six, per theme | `var(--ink)` |
| `--rule-interactive` | §8's 3:1 applies to interactive edges but not to decorative hairlines, and one token cannot be both | `var(--ink-muted)` |
| `[data-theme='light']` block | Needed for a subtree to hold the opposite theme | restates the light values |

---

## 7. Open

- The page-scan study (§1). Blocked here; eight specific questions listed.
- The font budget (§4.3). Recommendation given, decision deferred to Phase B.
- Whether one red is enough. §1 says one; question 2 above is what would show it.
- Phases B–H are separate sessions and none has been started.
