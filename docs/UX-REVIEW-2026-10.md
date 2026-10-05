# UI / UX review — 5 October 2026

A second full review, done as a chief UX engineer would before putting the
tool in front of a director: measure every page, compare it with the products
our users already know, fix what is broken, then re-measure. The September
review (`UX-REVIEW-2026-09.md`) rebuilt the design-system layer. This one
looks one level up: navigation, workflows, consistency, and the bugs a user
actually hits.

**Basis legend.** MEASURED: captured from the production build by
`scripts/ux-crawl.mjs`. That is 27 routes × 2 themes × 2 viewports (1440 px
and 390 px), giving 108 captures, each with axe-core, console and network
error capture, overflow and clipping probes, target sizes and document title.
CODE: counted in the source. JUDGED: a design opinion, stated as one.

## 1. Benchmarks

Fifteen web searches covered general SaaS craft (Linear, Vercel, Stripe,
Notion, Airtable, Grafana), AI generation products (ChatGPT / Claude, Deep
Research, Perplexity, Notion AI, Copilot Workspace) and the domain tools
(aPriori, Siemens Teamcenter Product Cost Management, Ideanote, Brightidea).
The working brief was lost when the session container was recycled. Its
conclusions, ranked, were:

1. **Long AI jobs:** a staged progress rail (as Deep Research uses), partial
   results as they arrive, a real Cancel, and runs that continue in the
   background with a notification.
2. **Home:** "continue where you left off", quick actions, and KPI figures with
   an "as of" stamp (Stripe Home, Vercel overview).
3. **Page headers:** one primary action per page; secondary actions in an
   overflow menu (Stripe page actions).
4. **Results:** one toolbar for sort, filter, group and count, a Cards/Table
   toggle, and linkable saved views (Airtable, Linear).
5. **Provenance:** every figure links to its calculation and every claim to a
   numbered source with a hover preview (Perplexity, aPriori).
6. **Notices:** toast for passing events, inline for local errors, banner for
   system status; skeletons shaped like the final layout (IBM Carbon).
7. **Navigation:** collapsible groups, Recent, ⌘K that runs actions, and a `?`
   shortcut sheet (Linear, Vercel).
8. **Trust:** audit trail and version stamps, exports that carry provenance.

## 2. What was measured

| Measure | Result | Basis |
|---|---|---|
| axe serious or critical | **0** on 107 of 108 captures. One contrast hit on the landing page did not reproduce after load: it was a frame mid-entrance-animation. | MEASURED |
| Horizontal overflow | 0 on 108 | MEASURED |
| Console errors | 1 kind: the Rate Library page fired a request that was bound to return 403 | MEASURED |
| Distinct document titles | **1 of 27**: every tab read "BrainSpark — AI Idea Generation Tool" | MEASURED |
| Unknown URL | Redirected to the marketing landing page | MEASURED |
| Mobile targets under 32 px | 564 across 27 pages; Results alone had 71 | MEASURED |

**Two harness errors found and corrected on the way.**
- The first crawl injected axe with CSP enforced, so **axe never ran** and
  "0 violations" meant nothing.
- It also seeded sign-in with an init script, which reads as a CSP violation
  on every page.

The crawler now seeds storage by page evaluate and bypasses CSP only for the
axe injection. A probe that reports nothing is worth checking twice.

## 3. Findings register

S1 means a user hits it on a normal path. S2 means it is visible to a
professional audience. S3 is polish.

| ID | Sev | Finding | Basis | Status |
|---|---|---|---|---|
| K-1 | S1 | **AI tools ignored the key saved to the account.** Twenty gates across twelve files checked only `localStorage`, while the server already resolves request → account → environment. A user who saved the key in Settings and opened Prism, Analyze or CAD → Cost on a new device was blocked. Prism's message even told them to "add your Anthropic API key in Settings", which they had just done. The Results chat and patent check failed silently. | CODE + live repro | **Fixed** |
| B-1 | S1 | An unknown URL silently redirected a signed-in user to the marketing page. | MEASURED | **Fixed**: a real 404 with the path, a way home and every tool |
| B-2 | S2 | One document title for all 27 pages, so tabs, history and bookmarks were indistinguishable. | MEASURED | **Fixed**: `Should-Cost · BrainSpark`, from the nav registry |
| U-1 | S2 | **The sidebar hid half the product.** Four settings links, Collapse and the user card filled about 260 px of a fixed footer, so at 900 px tall the Track and Learn tools (Pipeline, Marketplace, Horizon, Help) sat out of sight with no scroll cue. | Screenshot | **Fixed**: Settings is one disclosure row, open on settings pages; Collapse moved into the user row |
| U-2 | S2 | **A rainbow export bar.** Share, Excel, PowerPoint, PDF and RFQ were five buttons in five saturated colours, with three more in the footer. | Screenshot | **Fixed**: one gold Export menu that names what each format is for (keyboard: arrows, Esc, focus return); Share is a quiet secondary; the footer buttons are neutral |
| U-3 | S2 | **Headers still not unified.** Horizon had a centred brand hero; Innovation Studio a gradient title; Pipeline and VAVE a compact header; Rate Library none. | Screenshot | **Fixed** for Horizon, Innovation Studio, Pipeline, VAVE and Rate Library. **Open**: DFM Studio, Trends and Help (see §5) |
| U-4 | S2 | **Emoji as icons** (🚗 ⚙️ 🔥 ⚡) on per-system gradient tiles in Analyze. That is a second icon language next to lucide, and it renders differently by operating system. | Screenshot | **Fixed**: lucide line icons on neutral tiles, gold when selected; the spring scale-on-hover replaced by the house lift |
| U-5 | S2 | **Three floating objects on a phone.** The onboarding pill, chat button and tab bar covered content, and the pill repeated the dashboard's own "Get set up" card. | Screenshot | **Fixed**: onboarding lives on Home on phones; the desktop header chip stays |
| U-6 | S2 | **Key fields inside tools.** CAD → Cost and BOM Batch asked for the key on the page, and CAD → Cost carried a personal "Designed & Created by" credit inside the tool. | Screenshot | **Fixed**: the field appears only when no key exists anywhere and links to Settings; the credit is removed |
| B-3 | S3 | The bar-chart value label on the tallest bar was clipped at the top. | Screenshot | **Fixed** (top margin) |
| B-4 | S3 | Rate Library fired a request bound to return 403 for every non-admin. | MEASURED | **Fixed**: it asks the `/status` gate first and explains what non-admins still get |
| B-5 | S3 | Help said the key is "entered on the Analyze page" and "stored only in your browser". | CODE | **Fixed** (three answers rewritten) |
| T-1 | S2 | **Small targets on Results.** The per-idea select box was 17×17 and the "Full Technical Detail" row 20 px tall, both on every card. | MEASURED | **Fixed**: 36 px hit areas, `aria-pressed` and `aria-expanded`. Results mobile went from 71 to 27 small targets |
| T-2 | S3 | Filter chips are 26–30 px on Marketplace, Horizon and Results. | MEASURED | **Open**: a touch-only chip size belongs in a shared Chip primitive, not a global CSS rule |
| J-1 | S2 | **Three steppers** (Analyze pills, Prism numbered rail, DFM numbered rail) and **three primary-button colours** (gold, teal, outline) for the same job. | JUDGED | **Open** (§5) |

**Checked and found not to be defects:**
- The logo "clipping" was my contact sheet's label.
- The empty dark-theme charts were an animation frame; 16 shapes render in both
  themes.
- The "clipped" DFM text is `sr-only`.

## 4. Before / after (108 captures each)

| Measure | Before | After |
|---|---|---|
| Real console errors | 1 kind | **0** |
| Failed requests | 4 | **0** |
| Distinct page titles | 1 / 27 | **27 / 27** |
| Unknown URL | Marketing page | **404 page** |
| Mobile targets < 32 px (all pages) | 564 | **456** (Results 71 → **27**) |
| axe serious / critical | 0 (transient 1) | **0** |
| Key saved only to the account | Generate **disabled** | Generate **enabled**, "Using the key saved to your account" (live check) |

Gates: `tests/ux-review-2026-10.test.mjs` (8 tests). The key-gate detector was
proven to flag the old pattern and pass the new one before it was trusted.

## 5. Next — what would most move it toward "professional SaaS"

1. **Long-running jobs.**
   - A staged rail for Analyze and Prism (Searching → Drafting → Engine
     checks → Ranking), with ideas streaming in under a "checking…" badge.
   - The raw log moved under "Details".
   - Runs that survive leaving the page, with a header "running" pill and a
     completion notification.
2. **A results toolbar.** One row for search, filter, sort, group and the count;
   a Cards/Table toggle; saved views in the URL. A comparison tray for the
   select boxes.
3. **Finish the masthead.**
   - DFM Studio and Trends to `PageHeader`.
   - Trends' commodity tabs below the header, not above it.
   - Then a gate: every route renders exactly one `PageHeader`.
4. **One stepper, one primary.** A `Stepper` primitive for Analyze, Prism and
   DFM. Gold for every primary action; teal stays the colour of engine
   *readouts*, not buttons.
5. **Chip primitive** with a 36 px touch height (T-2) and a pressed state.
6. **⌘K runs actions** ("New analysis", "Export PDF", "Open last result"),
   plus Recent items and a `?` shortcut sheet.
7. **Provenance on hover.** Each € figure opens its engine calculation; each
   source opens a preview card.
8. **Dashboard KPIs with "as of" stamps** (pipeline value, confirmed savings,
   ideas this month) beside "continue where you left off", which already
   exists once a user has history.

## 6. Scorecard (judged against the benchmarks)

| Dimension | Sept (after) | Now | What moved it |
|---|---|---|---|
| Information architecture | 8 | 8.5 | Sidebar shows the whole product; real 404; per-page titles |
| Visual language | 7.5 | 8 | Five more pages on the masthead; no emoji; no rainbow buttons |
| Interaction states | 8 | 8.5 | Export menu keyboard model; `aria-expanded` and `aria-pressed` on cards |
| Touch / density | 6 | 6.5 | Results card targets; chips remain |
| Workflow correctness | — | 9 | The account-key bug no longer blocks any AI tool |
| Long-job experience | 6 | 6 | Unchanged; first in §5 |
| **Overall** | **7.7** | **8.1** | |
