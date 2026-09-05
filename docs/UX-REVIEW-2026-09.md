# UI, UX and motion review — 4 September 2026

A review of the whole product surface — every page at desktop and mobile
width, every hover, focus, loading, empty and error state, the motion
vocabulary, the type scale, the icon set and the colour system — done the way
a design lead would do it before a public launch: measure first, then judge.

**Basis legend.** MEASURED = captured from the production build in Chromium
(58 page captures: 29 routes × 2 viewports; axe-core on every one; computed
style probes for hover, focus, font size, tap target and overlay geometry).
CODE = counted in the source. JUDGED = a design opinion, stated as one.

## 1. Where it stood (before)

| Dimension | Score /10 | Evidence |
|---|---|---|
| Visual language | 5 | Three competing page-header patterns; 12 distinct `h1` sizes; 45 hex literals outside the token system; 16 one-off gradient hues for categories. CODE |
| Motion | 6 | A genuinely good motion system exists (`components/dfm/motion.ts`: one curve, three durations, reduced-motion aware) — adopted by 2 of 36 pages. Elsewhere 14 durations, 7 easings, 76 `transition-all`, 17 bouncy `hover:scale`. CODE |
| Interaction states | 7 | Hover changes on 58/58 probed controls; a global `:focus-visible` ring measured on every page. Disabled primary reads as broken (gold at 50%, no reason). MEASURED |
| Accessibility | 5 | axe **critical** on 28/29 mobile pages (unnamed hamburger button) and 6 desktop pages (unlabelled selects and file inputs); **serious** contrast on 4 pages (2.68:1 to 3.78:1). MEASURED |
| Typography | 4 | 10 px text rendered on **every** page (shell labels); 121 literal sub-11 px sizes in source; 36 distinct sizes. MEASURED + CODE |
| Touch / density | 5 | 34–55 controls under 44 px per desktop page, 10–31 per mobile page, 217 on the mobile marketplace. MEASURED |
| Layout & overlays | 4 | Chat FAB overlaps the mobile bottom nav by 33 px; onboarding popover collides with the FAB on desktop and covers 320×255 px of a 390 px phone. MEASURED |
| States | 5 | Skeleton loading on 2 pages, spinner-only on 10; empty states are a bare `h3` + sentence and break heading order on 3 pages. CODE + MEASURED |
| Information architecture | 8 | One nav registry drives sidebar, palette, mobile launcher and dashboard — the best structural decision in the front end. CODE |
| Performance feel | 6 | 0 console errors, 0 page errors on 58 captures; marketplace renders 2,994 nodes / 18,075 px in one pass. MEASURED |
| **Overall** | **5.5** | A strong engine with a front end that grew page by page. |

## 2. Findings register

Severity: S1 = a user hits it on the demo path or it blocks a task; S2 =
visible to a professional audience; S3 = polish.

| ID | Sev | Finding | Basis |
|---|---|---|---|
| U-1 | S1 | **Chat FAB sits on the mobile bottom nav.** FAB at `bottom-6` (24 px), nav is 57 px tall — the FAB covers 33 px of the third tab on every page. | MEASURED (fixed-element probe) |
| U-2 | S1 | **Onboarding popover collides with the FAB** (popover right 16 / bottom 24, 320×255; FAB right 24 / bottom 24, 56×56 — the FAB lands on the popover's corner) and on a phone the popover hides the dashboard grid. | MEASURED |
| U-3 | S1 | **Mobile menu button has no accessible name** — axe critical on 28 pages. A screen-reader user cannot open the navigation. | MEASURED |
| U-4 | S1 | **Unlabelled form controls**: two `select`s on Pipeline, hidden file inputs on CAD Diff / BOM / Team — axe critical. | MEASURED |
| U-5 | S2 | **Three page-header languages.** (a) Prism/DFM masthead — icon tile, display title, one-line promise, mode chips; (b) centred marketing hero with `text-4xl font-black` on 11 tool pages; (c) compact table header on 5 pages. Same product, three products. | CODE (12 `h1` variants) |
| U-6 | S2 | **Motion is per-page, not per-product.** The house system is adopted by Prism and DFM only; `PageTransition` uses a fourth easing; CSS `hover:scale` and `animate-float` ignore reduced-motion (only framer-motion and the toast honour it). | CODE |
| U-7 | S2 | **10 px text on every page.** Sidebar group labels, the ⌘K badge and palette hints are `text-[10px]`; Innovate renders 26 sub-11 px elements, Trends 32, Prism 18. | MEASURED |
| U-8 | S2 | **Contrast failures**: Idea Studio caption 3.62:1, Trends category tiles 3.2:1 and 3.72:1 (white on a pastel gradient), Server settings 3.21:1, Mobile settings 2.68:1. `slate-600` is used as body text on navy. | MEASURED |
| U-9 | S2 | **Small targets.** Chips at `py-1` are 26 px tall; mode toggles, filter pills and card actions are all under 44 px on touch. | MEASURED |
| U-10 | S2 | **Marketing footer inside the app.** Author bio, "AI-Powered Idea Generation Platform" and a **Sign In** link render under every authenticated page. | CODE `Footer.tsx` |
| U-11 | S2 | **Three accent systems** — gold (brand), teal (engines), then 16 one-off gradient hues for categories — plus a light theme implemented as 71 `!important` overrides. | CODE |
| U-12 | S2 | **Loading / empty / error are not designed states.** Spinner-only on 10 pages; empty state = `h3` + sentence (breaks heading order on Pipeline, VAVE, Marketplace); `role="alert"` on 5 surfaces. | CODE + MEASURED |
| U-13 | S2 | **Marketplace renders everything at once**: 2,994 nodes, 18,075 px tall, 243 sub-44 px targets. | MEASURED |
| U-14 | S3 | Disabled primary = gold at 50 % with no reason shown; reads as broken rather than "not yet". | JUDGED, screenshot |
| U-15 | S3 | Logo `alt="BrainSpark"` beside the word "BrainSpark" (axe minor, every page); onboarding popover outside any landmark (axe moderate ×4 per page). | MEASURED |
| U-16 | S3 | No `Input` / `Select` / `Card` primitives — ~230 inputs styled inline, so a focus or radius change is a 230-place edit. | CODE |
| U-17 | S3 | Icon sizes range 10–28 across 12 values; stroke width varies by page. | CODE |
| U-18 | S3 | Analyze wizard step pills clip at 390 px. | Screenshot |

**What is already right, and becomes the standard:** the Prism / DFM
masthead and its motion language; the nav registry; the global keyboard focus
ring; hover feedback on every control; lucide as the single icon family; RGB
channel tokens so every utility follows the theme.

## 3. Design direction — *an instrument, not a brochure*

The people who use this tool argue about money in front of directors. The
interface should feel like a measuring instrument: quiet ground, one accent
for action, a second for measurement, motion that only ever explains state.

1. **One shell, one masthead.** A `PageHeader` primitive carries the Prism
   pattern to every page — icon tile, eyebrow (the tool group), display
   title, one-line promise, an actions slot. Left-aligned, 28–36 px, never a
   centred hero.
2. **One motion system.** `src/lib/motion.ts` is the promoted house system;
   its curve and durations are also exposed as CSS custom properties so
   Tailwind transitions use the same numbers. `transition-all` is replaced by
   named properties; `hover:scale` by a 1 px lift and a shadow; a global
   reduced-motion rule collapses every CSS transition and animation.
3. **One type scale, floor 11 px.** 11 / 12 / 13 / 14 / 16 / 18 / 22 / 28 / 36.
   `text-2xs` is the 11 px token; 9, 10 and 10.5 px are retired.
4. **Colour with jobs.** Gold = the user's action. Teal = the engine's
   measurement. Eight categorical tokens (`--cat-1…8`) for domain colour so
   category tiles stop inventing hues. `slate-600` is a border colour, never
   text.
5. **Targets and states.** 44 px on touch, 32 px on pointer with 8 px gaps.
   Every control has hover, focus-visible, active, disabled-with-reason.
   `Skeleton`, `EmptyState` and `ErrorState` primitives replace spinners and
   bare headings.
6. **A stacking order, written down.** `--z-nav 40 · --z-fab 45 · --z-popover 50 · --z-modal 60`.
   The FAB clears the mobile nav; the onboarding card docks left on desktop and
   becomes a dismissible sheet on mobile.
7. **The shell ends where the app ends.** The footer becomes a one-line status
   bar: version, help, privacy, terms. No bio, no marketing, no Sign In.

## 4. Implementation

**Wave 1 — shipped in this change.** U-1 to U-12, U-14, U-15, U-17 and the
primitives from U-16: motion promotion with CSS tokens and a global
reduced-motion rule; `PageHeader` and migration of every hero page; z-index
scale and overlay fixes; accessible names on the menu button, selects and
file inputs; contrast fixes; type floor at 11 px; `Button` press and
disabled-with-reason; `Skeleton` / `EmptyState` / `ErrorState`; `Input`,
`Select`, `Card`; footer to status bar; categorical tokens.

**Wave 2 — next.** Adopt `Input`/`Select`/`Card` across every form (U-16);
virtualise the marketplace list (U-13); light theme via token remap instead
of `!important` (U-11); Analyze wizard step rail on mobile (U-18).

**Wave 3 — the world-class layer.** Promote `TickNumber` and `ScoreRing` to
every engine result so numbers are *measured* on screen everywhere, not only
in DFM; a live stage list for the 2–6 minute generation run (Prism review
P-7); command-palette previews; keyboard shortcuts on the results grid.

## 5. Where it stands (after)

The same 58 captures and probes, re-run on the rebuilt production bundle.

| Measure | Before | After | Basis |
|---|---|---|---|
| axe critical / serious, mobile | critical on 28 of 28 pages | **0 on 28 of 28** | MEASURED |
| axe critical / serious, desktop | critical on 6 pages, serious on 4 | **0** | MEASURED |
| Smallest rendered font | 10 px on 56 of 56 captures | **11 px on 56 of 56** | MEASURED |
| Sub-11 px elements per page | 6–32 | **0** | MEASURED |
| Overlay collisions (FAB × tab bar, FAB × onboarding) | 2, on every page | **0** | MEASURED (fixed-element probe, screenshots) |
| Controls under 44 px, desktop / mobile | 34–55 / 9–31 | 30–51 / 4–26 | MEASURED — desktop counts are against the touch floor; the pointer floor is 32 px |
| `transition-all` / `hover:scale` / sub-11 px utilities in source | 76 / 17 / 121 | **0 / 0 / 0** | CODE, now gated |
| Default transition | 150 ms, Tailwind's curve | **160 ms, house curve**; 0.01 ms under reduced motion | MEASURED (computed style) |
| Page-header patterns | 3, 12 `h1` sizes | **1** (`PageHeader` on 12 pages + the two studios; 5 compact table pages remain) | CODE |
| Motion system adoption | 2 of 36 pages | every CSS transition + `PageTransition` + 2 studios | CODE |
| Console / page errors on 56 captures | 0 | 0 | MEASURED |
| Unit / e2e | 1,248 / pass | **1,253** (design-system gate added) / pass, axe 0 serious or critical on 8 pages | MEASURED |

| Dimension | Before | After | What moved it |
|---|---|---|---|
| Visual language | 5 | 7.5 | One masthead; categorical tokens exist; status-bar footer. Compact table pages not yet migrated. |
| Motion | 6 | 8.5 | One curve everywhere by default; reduced motion honoured globally; press feedback on `Button`. |
| Interaction states | 7 | 8 | `disabledReason`, 32/40/48 px button heights, chip minimums on the migrated headers. |
| Accessibility | 5 | 8.5 | Zero axe critical/serious on 56 captures; named menu, selects, file inputs; landmarks on overlays. |
| Typography | 4 | 8 | Floor at 11 px, measured on every page; still 36 sizes in source. |
| Touch / density | 5 | 6 | Shell targets larger; the long tail is per-page chips (Wave 2). |
| Layout & overlays | 4 | 9 | Stacking scale; no collisions; onboarding is a chip / pill. |
| States | 5 | 7 | `Skeleton` / `EmptyState` / `ErrorState` exist and replace the three heading-order offenders; spinner pages remain. |
| Information architecture | 8 | 8 | Unchanged; `PageHeader` now reads from it. |
| Performance feel | 6 | 6 | Marketplace still renders in one pass (Wave 2). |
| **Overall** | **5.5** | **7.7** | |

What a 9 needs, in order: the form primitives adopted everywhere (one focus
treatment, one radius, 44 px on touch), the marketplace virtualised, and the
Wave 3 layer — measured numbers ticking in on every engine result, a live
stage list for the generation run.

## 6. The light theme, measured separately

Everything above was measured in the dark theme. The light theme was reviewed
only as source in the first pass, which was not a review: run against the same
28 pages it failed **27 of them**, and two of the failures made a surface
unusable rather than merely ugly.

**Why it failed.** The light theme is built as `!important` remaps keyed on
individual Tailwind utilities (`.text-slate-400`, `.bg-white/5`). Anything the
list does not name keeps its **dark** value on a white page. Three families of
call site escaped it:

| ID | Sev | Finding | Basis |
|---|---|---|---|
| L-1 | S1 | **The mobile tab bar was invisible.** Inline `rgba(255,255,255,0.45)` labels over a background of `--navy-950`, which light remaps to #F7F9FB. White on white: four of five tabs vanished, only the gold active tab survived. | MEASURED (computed style + screenshot) |
| L-2 | S1 | **The two settings pages stayed dark** under a light header — hardcoded `#07111e` backgrounds — and their heading sat behind the fixed header on mobile web. | MEASURED |
| L-3 | S2 | **110 accent classes carry an opacity modifier** (`text-teal-300/90`) across 22 files. Tailwind compiles those to a literal rgba, so they are classes of their own that the remap never saw. Measured as low as **1.35:1**. | MEASURED + CODE |
| L-4 | S2 | **The gold accents failed on their own chips.** Light gold-400 was AA against the page but 4.09:1 on a gold-500/15 chip — which is where it is actually used. The primary button was worse: gold-500 under the theme's own near-white ink measured **4.35:1**. | MEASURED |
| L-5 | S2 | **My own Wave 1 primitives** used `border-white/12`, `bg-white/[0.02]` and a white-alpha shimmer — none in the remap list. The loading skeleton was invisible on white and the empty state had no border. | MEASURED |
| L-6 | S3 | `hover:text-slate-200` and friends were never remapped, so hover *lightened* text on a white page. Amber, emerald, orange and slate-700 sat between 2.4:1 and 4.4:1. | MEASURED |
| L-7 | S3 | The password reveal button had no accessible name (both themes; the first sweep missed it because the dashboard rendered a different state). | MEASURED |

**The fix is structural, not a longer list.** Six **surface tokens** —
`--hairline`, `--hairline-strong`, `--tint`, `--tint-strong`, `--shimmer-base`,
`--shimmer-hi` — are defined once per theme and exposed as `border-hairline`,
`bg-tint`, `bg-tint-strong`. A component that takes these cannot be forgotten
in one theme. The categorical palette gained its light half (each hue drops to
its ~700 step, so a chart keeps its category-to-colour mapping and carries
white text). The 110 alpha accents are covered by one substring rule per
family, `[class*="text-teal-300/"]`, which catches every alpha written today or
later. Gold and amber were re-derived against the **worst ground they actually
sit on** rather than against the page.

| Light-theme measure | Before | After |
|---|---|---|
| Pages with any contrast violation | 27 of 28 | **0 of 28** |
| Contrast-failing nodes | 80 | **0** |
| axe serious or critical | present | **0** |
| Mobile tab-bar label contrast | 1.06:1 | 8.3:1 |
| Dark-theme regression check | — | 0 serious or critical on 28 pages, 11 px floor held |

Three gates now hold the line, all in `tests/design-system.test.mjs`: no
hardcoded dark colour literal in an inline style (the scanner is brace-matched
so it catches a literal inside a *ternary*, which is exactly how the tab bar
was written, and it carries a regression test proving that); both themes must
define every surface and categorical token; and every alpha accent step used in
source must have a light remap.

Two things stated rather than fixed: the light theme is still ~80 `!important`
utility overrides plus these token rules, and collapsing that into a pure token
remap remains Wave 2; and the "invisible text" probe reports two false
positives per page on the avatar initials, whose background is a gradient the
probe cannot read.

### Sign-in is dark-only

Requested after the sweep, and it exposed two more defects rather than being a
one-line change.

The sign-in page was **half** themed: its brand panel opted out with
`data-theme="dark"`, while the form column, the header above it and the footer
below it followed the light theme — a light header bolted onto a dark hero.
`ALWAYS_DARK_ROUTES` in `App.tsx` now marks the whole shell for `/auth`, so
header, page and footer are one dark surface, and the theme toggle hides itself
there rather than being a control that visibly does nothing.

Two defects found on the way:

- **The always-dark opt-out carried stale colours.** It still set slate-500 and
  slate-600 to the values from before the dark-theme contrast fix, so any dark
  panel on a light page rendered its muted text at **3.66:1** — the whole
  footer under the sign-in form failed. It is now generated from the dark
  theme's own values, and a gate compares the two so they cannot drift again.
- **The opt-out did not restore the new surface tokens** added in the light
  pass, so a dark panel would have taken dark-ink hairlines — invisible on its
  own ground. A second gate asserts that everything the light theme redefines
  is restored inside the opt-out.
- The brand logo was clipped behind the fixed header; the page now clears it.

Measured after: `/auth` renders identical dark under a stored light theme, a
stored dark theme and no stored preference, at 1440 and 390 px, with **zero**
axe serious or critical in all six combinations.

Making it dark was not enough — it still read as a form on a settings page, so
the page was recomposed:

- **One ground, not two panels.** The brand side was a `bg-hero-gradient`
  panel (#0a0f1e → #1a2235 → #0c1629) beside a flat `bg-navy-950` form column,
  which put a visible vertical seam down the middle: two screens stitched
  together. Both sides now sit on the **same navy-950** as the rest of the
  product, and the left side takes its depth from two enormous, almost
  invisible light sources and a fading grid — the technique `dfm.css` already
  uses — rather than from being a different colour. Nothing on the page draws
  an edge except the card.
- **No application chrome.** Sign-in rendered inside the product shell: a
  header offering a **Sign In** button on the sign-in page, a marketing footer
  with an author bio under the password field, the tab bar and the chat button.
  `BARE_DARK_ROUTES` in `App.tsx` renders `/auth` on its own — no header,
  sidebar, footer, tab bar, chat button or onboarding.
- **The card is the only object.** The form sits on a translucent, blurred
  panel with a single hairline border, so the eye lands on it; the brand block
  is centred against it rather than pushed apart top-and-bottom, and the
  duplicated author credit is down to one line.

### Sign-in, rebuilt

The dark-only pass fixed the theme but the page still did not look like a
product's front door. Rebuilt against what was actually wrong:

| Was | Why it read as amateur | Now |
|---|---|---|
| The marketing render in a rounded, ringed box | It carries its **own wordmark** — "BrainSpark · AI IDEA GENERATION TOOL" baked into the pixels, in electric purple. Framed as a poster it put a second logo and a second colour system on a page that already has one of each. | Prepared as an asset: cropped past the wordmark and past the callout that clipped behind the logo, graded toward the brand, **150 KB instead of 1.9 MB** on the one page every user must load first. |
| Image behind the copy | Strong enough to see meant the vehicle ran through the proof text; weak enough to read meant grey noise. The panel is ~780 px and the copy uses most of it — there is no empty zone to hide an image in. | Separated vertically: the render occupies the top, the type sits at the bottom on a scrim that is **solid navy from 52% down**. |
| Six tag pills — "3D CAD viewer", "Excel · PPT · PDF" | A list of nouns. It says nothing a competitor could not also print. | Three claims a cost engineer would test us on, each carrying the figure that backs it — the entitlement waterfall, engine-verified ideas, and the measured error. Every figure is sourced from a gate in this repo, not written for the page. |
| A generic form | `font-black` headings, unannounced errors, and a password field whose right padding was built as `pr-${'{'}isPassword ? '12' : '4'{'}'}` — a class Tailwind never generates, so the text ran under the reveal button. | Form titles on the type scale, `role="alert"` on every error, labels tied to inputs, 46 px fields, one primary-button treatment, autofocus on the first field. |

Measured: zero axe serious or critical at 1440 and 390 px across a stored
light theme, a stored dark theme and no stored preference.

**Hero copy, chosen with the owner.** The headline is a plain descriptor —
*"The AI-assisted idea generation engine."* — not a slogan, because the reader
is an internal cost engineer who already knows the domain and wants to know
what the tool is. Under it, the eight product names from the nav registry and
nothing else: no supporting sentence, no per-feature description. Names are set
as a two-column list rather than pills (a pill implies something pressable, and
none of these are) or a flowing line (its separators wrapped onto the start of
the next line).
