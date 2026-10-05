# CostVision UI/UX review — October 2026

**Scope.** The whole signed-in product and the sign-in page, as a cost engineer uses it:
sign in → home → choose a commodity → fill the form → Calculate → read the result
(Breakdown, Detail, AI Insights) → CAD-to-cost → Negotiation, News, Portfolio, 3D
Viewer, Help.

**Method.** Measured, not just looked at. The harness `calculator/e2e/ui-audit.ts`
starts the production build on a real server with an empty database, signs a user in,
and walks 13 screens at three widths (desktop 1440×900, tablet 1024×768, phone 390×844)
in light and dark themes: 65 screen states in total. For each state it saves a
screenshot and records:

- axe-core WCAG 2.1 A/AA violations, with the measured colours for contrast failures;
- console and page errors;
- horizontal overflow;
- DOM size;
- first-load timing.

The "before" and "after" numbers below come from the same harness on the same machine.

```
cd calculator && npm run build
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium CV_UI_OUT=/tmp/ui CV_UI_LABEL=after npx tsx e2e/ui-audit.ts
```

---

## 1. Before and after

| Measure (same harness) | Before | After |
|---|---|---|
| axe WCAG 2.1 A/AA violations, 65 screen states | 30 (4 critical) | **0** |
| Console / page errors | 0 | 0 |
| Screens with horizontal overflow | 0 | 0 |
| First contentful paint (desktop, cold) | 1,040 ms | 412–528 ms (three runs) |
| DOMContentLoaded | 1,324 ms | 455–613 ms |
| Transferred on first load | 4,496 KB | 3,771 KB |
| JavaScript preloaded before first paint (vendor chunk) | 1.42 MB | 665 KB (three.js now loads only when a 3D view opens) |
| Buttons in the form's action bar | up to 11 | 3 (Calculate, Load Example, More ▾) |
| Rows of commodity pills | 2 (21 pills) | 1, scrolls sideways |
| Desktop: inputs and result visible together | no (one long column) | yes (two panes ≥ 1280 px) |

Timings come from cold loads on a cloud container; the slowest "after" run shared the CPU with the unit-test suite. Read them as a direction, not a benchmark. DOM size did not change (median about 6,600 nodes per state); see P3-1.

Screenshots, before → after, are in `docs/ui/screens/`: the result at 1440 px (`before-results-desktop-light.png` → `after-results-desktop-light.png`), the form, the sign-in page and the phone result.

---

## 2. Findings

Severity:

- **P0** blocks a task or misleads.
- **P1** a professional user notices it within a minute.
- **P2** polish and consistency.
- **P3** structural debt.

✅ marks a finding fixed in this change. ◻ marks one recommended but not done (§4).

### P0: misleads or blocks

| # | Finding | Evidence | Status |
|---|---|---|---|
| P0-1 | **The result was covered on arrival.** After Calculate, the page scrolled to the result, but the tail of the form (its sticky action bar, "Edit Rates") and the sticky panel header with cut-off buttons sat over the top of the result. | `before-results-desktop-light.png`, `before-results-tablet-light.png` | ✅ Desktop ≥ 1280 px: two panes, so nothing overlaps. Below that, the panel header sits above the action bar (z-order). |
| P0-2 | **The sign-in page made claims the product does not make.** It said "52+ commodities", "20 regions" and "10 currencies", and listed EV battery cost models (NMC / LFP) that do not exist. The app has 21 cost models, 39 countries and 28 currencies. A director comparing the login page with the tool would find this in seconds. | `auth.html` hero; counted from `index.html` picker tiles, `REGIONAL_DATA` and `CURRENCY_SYMBOL` | ✅ The numbers now come from the code and the battery claim is gone. |
| P0-3 | **Controls with no accessible name (axe critical).** The password show/hide button on all 7 auth password fields, the Portfolio "what-if" commodity select (`#wf-cat`) and its % slider (`#wf-delta`). | axe `button-name`, `select-name`, `label` | ✅ |

### P1: a professional user notices

| # | Finding | Evidence | Status |
|---|---|---|---|
| P1-1 | **The form was 1,200 px wide in one column.** At 1440 px, two-field rows stretched across the full width, which is hard to scan. Professional cost tools keep the inputs in a fixed-width pane beside the answer. | `before-form-machining-desktop-light.png` | ✅ The input pane is now 460–600 px with its own scroll; the result pane takes the rest. |
| P1-2 | **11 equal-weight buttons in the action bar.** Calculate, Save to Library, Log Actual, Calibration, Load Example, Edit Rates, and four exports after a result, all styled alike. No hierarchy. | `before-form-machining-desktop-light.png` | ✅ Calculate stays primary and Load Example stays secondary. Report / Save / Tools are grouped in a **More** menu with group headings, keyboard support (↑ ↓ Esc) and `role="menu"`. The buttons were *moved*, not copied, so their ids, handlers and show/hide logic are unchanged. |
| P1-3 | **21 commodity pills wrapped onto two rows** above every form, pushing the form down by about 60 px. | `before-form-machining-desktop-light.png` | ✅ One row that scrolls sideways, with a fade at the edge. |
| P1-4 | **The headline cost was shown three times** with the same chips (summary card, total card, insights card). The summary card used a monospace "typewriter" face for the number. | `before-results-desktop-light.png` | ✅ partly. The duplicate band and rates chips are removed from the summary card, and the number is in the UI face with tabular figures. ◻ Merging the summary and total cards is §4-3. |
| P1-5 | **A bare "Sign Out" button** where SaaS products have an account menu. Users could not see who was signed in. | header | ✅ Avatar and first name open a menu with name, e-mail, Rate library, Help centre and Sign out. |
| P1-6 | **Colour contrast below 4.5:1** (WCAG 1.4.3). Measured values: <br>• insights summary text #888 on #e8f1fa = 3.1:1 <br>• the same text in dark #555 on #102331 = 2.15:1 <br>• brand blue on its own tint = 4.43:1 <br>• Portfolio badge #3b82f6 on #e6effe = 3.17:1 <br>• dark-theme status pill = 3.9:1 | axe `color-contrast` with `fgColor` / `bgColor` (the harness now prints them) | ✅ Hard-coded greys replaced by theme tokens. A darker "accent ink" of the same hue is used for text on accent tints. Status pills mix toward the text colour. |
| P1-7 | **Tables that scroll sideways were not reachable by keyboard** (WCAG 2.1.1): the operations table, the detail table and an insight table. | axe `scrollable-region-focusable` | ✅ A scrolling region gets `tabindex=0`, `role=region` and a name taken from its section heading. A watcher keeps this true as results re-render. |
| P1-8 | **three.js (about 750 KB) was downloaded before first paint on every page**, including the sign-in redirect and the home screen. It is only needed when a 3D view opens. | Vite chunk graph: `cad-views.js` was statically imported; `three` sat in the shared vendor chunk | ✅ `three` / `occt-import` moved to a lazy `vendor-three` chunk; `renderSTLViews` is imported on demand. The preloaded vendor chunk went from 1.42 MB to 665 KB. |

### P2: polish and consistency

| # | Finding | Status |
|---|---|---|
| P2-1 | The picker legend explained blue and violet tile borders that were not drawn (a later stylesheet overrode them). | ✅ The borders are drawn. |
| P2-2 | The empty state said "fill in the inputs **on the left**", which is wrong on tablet and phone, where the result is below. | ✅ "Fill in the inputs and hit Calculate". |
| P2-3 | Switching commodity kept the old scroll position, so the CAD entry opened scrolled to the bottom. | ✅ The form, the result and the workspace scroll back to the top on a commodity switch. |
| P2-4 | The sign-in feature list used emoji as icons; they render differently on each OS and look consumer-grade. | ✅ Inline SVG icons, consistent with the app. |
| P2-5 | The sign-in tagline and footer used low-contrast translucent grey over the hero image. | ✅ Solid colours at AA contrast. |
| P2-6 | Keyboard focus was invisible on many custom controls. | ✅ One `:focus-visible` ring (2 px accent) on every interactive element. |
| P2-7 | Phone: the AI Insights summary bar squeezed three columns into 390 px. | ✅ It stacks. |
| P2-8 | In the narrower result pane the result tabs wrapped to two rows. | ✅ One row, scrolls sideways; Focus is icon-only. |
| P2-9 | Found while capturing these screenshots: the new account menu opened *under* the fixed costing workspace (header z 50, workspace z 55); the header said "Hi, Priya" beside the avatar; the self-audit and model-learning banners stayed light in dark mode. | ✅ The header lifts while its menu is open; the greeting is hidden once the account menu names the user; the banners use theme colours. Screens: `after-account-menu-desktop-light.png`, `after-more-menu-desktop-light.png`, `after-results-desktop-dark.png`. |

### P3: structural debt (recommended, not done here)

| # | Finding |
|---|---|
| P3-1 | **About 7,000 DOM nodes on every view.** All 21 forms and every view are in the page at once and hidden with `display:none`. Rendering only the active form would cut style and layout work by roughly an order of magnitude. |
| P3-2 | **CSS:** about 7,000 lines in `calculator.css` with heavy `!important` use (for example `grid-template-columns: unset !important` on the workspace, which silently defeated the first version of the two-pane layout). One token file (colour, space, radius, type scale) and component classes would make changes predictable. |
| P3-3 | **`main.ts` is about 20,000 lines.** The split already under way (review L12) should continue; new UI code goes in modules, as this change does (`saas-shell.ts`). |

---

## 3. Benchmark: what professional tools do, and where CostVision stands

The comparison is with the *patterns* of two groups. The first is established
should-cost and product-cost tools used by OEM cost engineering teams (aPriori,
Siemens Teamcenter Product Cost Management, SEER for Manufacturing, Costimator).
The second is SaaS products known for their interfaces (Linear, Stripe Dashboard,
Figma, Notion). These are general patterns visible in public product material, not
claims about any one product's current screens.

| Pattern | What the leaders do | CostVision before | CostVision now |
|---|---|---|---|
| **Workspace layout** | Inputs or a routing tree in one pane, the cost result beside it; change an input and see the cost move. | One long column; the result below a 2,000 px form. | Two panes ≥ 1280 px, each with its own scroll. |
| **Action hierarchy** | One primary action per screen; secondary actions in an overflow menu or toolbar group. | 11 equal buttons. | Calculate + Load Example + grouped More menu. |
| **Account and settings** | Avatar menu, top right: identity, settings, help, sign out. | Bare Sign Out. | Account menu. |
| **Cost transparency** | Every number drills down to the rate, the cycle time and the formula. | Strong already: 8-bucket breakdown, Detail tab, Excel trace. | Unchanged, and still the product's strongest point. |
| **Navigation density** | A command palette (⌘K), a left nav, and a single context switcher, not a wall of pills. | ⌘K and the left nav existed; commodity pills in 2 rows. | One scrolling row. ◻ A searchable "switch commodity" control is §4-4. |
| **Numbers** | One sans-serif UI face with tabular figures, so columns of £ align. | Monospace headline. | UI face with tabular figures. |
| **Accessibility** | WCAG 2.1 AA as a release gate. | 30 violations. | See §1; `npm run test:e2e:full` already gates axe on the forms. |
| **Performance** | Heavy viewers (3D, charts) load on demand. | three.js eager. | three.js lazy. |
| **Home for a returning user** | Recent work, saved estimates and tasks; marketing is for the signed-out site. | A marketing hero. | ◻ §4-1. |
| **Empty states** | Say what to do next, with one action. | Good, but "on the left" was wrong on mobile. | Fixed. |

Where CostVision is **ahead** of the usual pattern:

- **The deterministic trace.** AI never sets a price, and every £ resolves to a rate and a formula.
- **Per-country costing.** The comparison table re-costs the part in each of 39 countries' rate books.
- **Self-audit and learning banners**, which say how far to trust a number.

The UI work here is about making that depth easy to read, not about adding features.

---

## 4. Recommended next steps (not in this change)

1. **A home for returning users.** Replace the signed-in marketing hero with recent estimates, saved scenarios, calibration status ("12 actuals logged; machining bias −3%") and one "New costing" action.
2. **Render only the active form** (P3-1). The largest single gain in responsiveness on low-end laptops.
3. **One headline.** Merge the summary card and the total-should-cost card. Keep the sticky summary as a compact bar that appears only when the large card scrolls out of view.
4. **A commodity switcher** as a searchable drop-down in the panel header (as in the ⌘K palette), replacing the pill row entirely.
5. **Design tokens and CSS consolidation** (P3-2). Remove `!important` layering. The UI-review layer `saas-polish.css` is the place to collect rules while that happens.
6. **Inline validation.** Flag out-of-range inputs at the field (for example a utilisation above 1, or a cycle time of 0) before Calculate, not after.
7. **A busy state on CAD "Apply to form".** Apply now fills the form once per comparison country before the costed one (so the country table is a true per-country costing), which takes about 1–1.5 s on a 1440 px desktop with no feedback. Show "Applying…" on the button, or move the per-country fills off the click path.
8. **A guided first run** for a new user, built on the existing tour, ending on a costed example part rather than a feature list.

---

## 5. What changed: files

| File | Change |
|---|---|
| `calculator/src/ui/styles/saas-polish.css` (new, loaded last) | F1 two-pane workspace; F2 commodity row; F3 headline face; F4 More menu; F5 phone insights; F6 account menu; F7 focus ring; F8 picker borders; F9 accent ink; F10 result tabs. Each block says which finding it closes. |
| `calculator/src/ui/saas-shell.ts` (new) | `initActionMenu` (More menu), `initAccountMenu`, `enhanceScrollRegions` / `watchScrollRegions`. |
| `calculator/src/ui/main.ts` | Wires the three initialisers; imports the CSS; empty-state copy; summary card chips; scroll reset on commodity switch; lazy `cad-views`; a11y names on the Portfolio what-if; contrast tokens in Insights; status pill colour. |
| `calculator/auth.html` | True counts, SVG icons, AA-contrast hero text, named password toggles. |
| `calculator/index.html` | Empty-state copy. |
| `calculator/vite.config.ts` | `vendor-three` lazy chunk. |
| `calculator/e2e/ui-audit.ts` (new) | The measurement harness above. |
| `calculator/tests/ui-shell.test.ts` (new) | Every More-menu id exists once; the sign-in counts equal `REGIONAL_DATA`, `CURRENCY_SYMBOL` and the picker's costing tiles; the controls axe flagged keep a name. |
| `calculator/e2e/country-live.ts`, `country-forms.ts` | Click the Excel export through the DOM (it now sits in the More menu). |

No cost logic changed: the engine, the rules and the rate books are untouched.
