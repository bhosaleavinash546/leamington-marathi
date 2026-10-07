# 3D CAD Viewer — audit and SaaS-grade redesign plan (Oct 2026)

**Trigger:** president's demo feedback — "the 3D viewer (CAD-to-Cost and the left-nav 3D Viewer) is very basic".
**Scope:** `src/ui/cad-viewer.ts` (2,220 lines, three.js, lazy chunk), its two mounts in `main.ts`
(standalone `#viewer-view`, inline compact viewer in CAD-to-Cost), and the tessellation route
`/api/cad/tessellate?meta=bin`.
**Screenshots:** `docs/ui/viewer-shots/` (before / after the ghost-edge fix, the thickness range issue).
**Evidence:** `npx tsx e2e/viewer-shots.ts <out>` — real server, real STEP (`cad-audit/parts/Casting_Braket.stp`),
both themes, empty / loaded / face types / wall thickness.

## 1. Honest diagnosis

The viewer is **not short of capability** — it already has B-rep face picking, distance / radius / angle /
face-to-face measurement, section planes, explode, a body tree, face-type / draft / wall-thickness heatmaps,
a per-face **cost heatmap**, snapshots and exact kernel edges. Competitors charge for most of that.

It *looks* basic because of presentation, and in one case because of a visible defect:

| # | Finding | Effect in a demo | Status |
|---|---|---|---|
| 1 | **Ghost wireframe.** The mesh is re-centred on the origin but the kernel's exact edges (`serverEdges`) were drawn in file coordinates — a second, wire-only copy of the part floated beside it on any part not modelled about the origin. An STL loaded after a STEP also inherited the STEP's edges. | The first thing anyone sees looks broken | **Fixed** (this commit) |
| 2 | Pure-white 3D canvas (`scene.background = 0xffffff`) inside a dark-themed app | Looks like an embedded 2010 applet | Phase 1 |
| 3 | ~30 small labelled buttons in a two-row, ~180 px bottom ribbon; disabled tools (Components, Explode) still shown | Visual noise, steals a fifth of the viewport, "engineering tool" not "product" | Phase 1 |
| 4 | Axis gizmo is three.js `ViewHelper` dots — no labelled faces | Users can't click "Top" on the model; every pro viewer has a view cube | Phase 1 |
| 5 | Wall-thickness legend 0.2 mm → 105 mm on a casting: the min / max are single-ray artefacts, so the whole part is one colour | The analysis looks meaningless | Phase 1 |
| 6 | Legend pill and the collapse chevron sit over the model | Clutter | Phase 1 |
| 7 | Status line is 12 px text: file · triangles · faces · bbox | No part identity, no mass / volume / material, nothing a cost engineer cares about | Phase 2 |
| 8 | Empty state is a bare drop prompt | No guidance, no sample part to try | Phase 1 |
| 9 | Fixed-height viewport, no true full-screen | Model small on a 1600 px screen | Phase 1 |
| 10 | The nav tooltip ("3D CAD Viewer …") stays open over the page after clicking the nav item | Looks unfinished | Phase 1 |
| 11 | **The cost heatmap — our unique feature — is hidden**: it only appears in the inline viewer after a costing, with no button or explanation | The one thing no generic viewer can do is invisible | Phase 2 |

## 2. What "professional" looks like — benchmark

| Product | Pattern worth copying |
|---|---|
| **Onshape** | View cube top-right (click face = normal view, corner = isometric, arrows = 45° steps); measure panel bottom-right that updates live on selection; section view from a small menu, not a permanent button. |
| **Autodesk Viewer / APS** | ONE compact floating toolbar at the bottom centre with icon buttons and tooltips, grouped with fly-out sub-menus (measure ▸ distance / angle / area; section ▸ X / Y / Z / box); dockable *Model Browser* and *Properties* panels; settings (background, quality) in one gear menu. |
| **Xometry visual DFM / aPriori** | Issues are coloured ON the model and listed in a side panel; clicking an issue flies the camera to it. Cost feedback sits next to the geometry — "this feature costs £X". |
| **Shapr3D / Fusion web** | Dark neutral gradient background, soft studio lighting with an environment map, ambient occlusion, a subtle ground shadow — the part looks like an object, not a diagram. |

Common denominator: the **model owns the screen**; chrome is small, floating, translucent and icon-first;
information lives in a collapsible right-hand inspector; nothing is shown that can't be used right now.

## 3. Target design

```
┌───────────────────────────────────────────────────────────────┬───────────────────┐
│ Casting_Braket.stp  ·  1 body · 230 faces       [⤢] [⚙] [⋯]  │ INSPECTOR      [×]│
│                                                    ┌──────┐  │ ▸ Part            │
│                                                    │ TOP  │  │   125×132×120 mm  │
│                                                    │FRONT │  │   0.71 kg (A356)  │
│                    ( the part, studio-lit,         └──────┘  │   Volume / area   │
│                      soft ground shadow,          view cube  │ ▸ Selection       │
│                      theme-aware background )                │   Cylinder Ø12.0  │
│                                                              │   Hole · through  │
│                                                              │ ▸ Analysis        │
│  ┌ legend ┐                                                  │   Wall 3.1–18 mm  │
│  └────────┘                                                  │ ▸ Cost on model £ │
│        ┌─────────────────────────────────────────────┐       │   Top 5 faces …   │
│        │ ⌂ ◱ │ ✥ ▭ │ 📏▾ ✂▾ │ 🎨▾ │ ☰ 💥 │ 📷 ⤢ │       │                   │
│        └─────────────────────────────────────────────┘       │                   │
└───────────────────────────────────────────────────────────────┴───────────────────┘
```

* **Floating icon dock** (bottom centre, 44 px, translucent, blur): Home · Fit │ Select · Pan │ Measure ▾ ·
  Section ▾ │ Colour by ▾ (none / face type / draft / thickness / **cost**) │ Tree · Explode │ Snapshot ·
  Full-screen. Tooltips carry the keyboard shortcut. Disabled tools are hidden, not greyed.
* **View cube** (labelled faces, edges, corners; theme-aware) replaces the `ViewHelper` dots.
* **Inspector** (right, collapsible, remembers state): Part (bbox, volume, area, mass by material, bodies,
  closed / open), Selection (face type, radius / diameter, area, normal, hole data from the feature table),
  Analysis (legend + histogram with a percentile range the user can drag), **Cost on model** (top faces by £,
  click → fly to and highlight).
* **Model tree** as a left drawer (bodies, visibility eye, isolate, colour swatch).
* **Look:** theme-aware gradient background (dark: #0d1117→#161b22; light: #f6f8fa→#e8ecf1), room environment
  map at low intensity + key light, SSAO-lite (or baked hemisphere AO), contact shadow under the part, edges
  at 1 px with theme colour, smooth animated camera transitions (300 ms ease) for every view change.
* **Empty state:** drop zone with format chips (STEP · IGES · STL), "Try a sample part" (a committed fixture,
  e.g. the casting bracket), and a one-line privacy note (files are tessellated on our server, not stored).
* **Keyboard:** F fit, H home, 1–6 standard views, 0 iso, M measure, S section, E edges, W wireframe,
  Esc cancel tool, Del clear measurements, ? shortcut sheet.

## 4. Roadmap

**Phase 1 — "it looks professional" (2–3 days; no engine or server change)**
1. ✅ Ghost edges + stale STL edges (done).
2. Theme-aware background, studio lighting, contact shadow, edge colour by theme.
3. Floating icon dock with fly-out groups and tooltips; hide disabled tools; reclaim the ~180 px ribbon.
4. Labelled view cube (CSS 3D cube synced to the camera — no extra dependency) with animated transitions.
5. Thickness / cost ranges clamped to the 5th–95th percentile, labelled "≤ / ≥", with outliers in grey.
6. Empty state with sample part; full-screen; viewport fills available height; legend moved into the dock area.
7. Keyboard shortcuts + `?` sheet; dismiss the nav tooltip on click.

**Phase 2 — "it's a cost tool, not a viewer" (3–4 days)**
8. Inspector panel: part facts (mass from the selected material's density), selection facts, analysis histogram.
9. "Colour by → Cost" in the dock whenever a costing exists; ranked face list; click to fly-to. This is the
   demo moment: rotate the part and see where the money is.
10. DFM issues on the model (thin wall < min for the process, zero draft, deep small holes) as a list with
    fly-to — the same advisor findings the results page prints, now pointed at faces.
11. Same component in both mounts (inline CAD-to-Cost gets the dock + inspector in a compact form).

**Phase 3 — collaboration (later, optional)**
12. Saved views and annotations (pin a note to a face), included in the PDF report.
13. Share link to a read-only view of a costing's model.
14. Large assemblies: progressive loading / LOD; instancing of repeated bodies.

## 5. Guard-rails

* The viewer shows geometry and the engine's numbers; it never computes a price itself (golden rule).
* three.js stays a lazy chunk (`vendor-three`); no static import of `cad-views`.
* Dark-theme rules: tokens only, no light literals (`tests/ui-polish.test.ts`, `tests/dark-theme-scope.test.ts`).
* Every phase is proven with `e2e/viewer-shots.ts` before / after and `e2e/ui-audit.ts` (axe WCAG 2.1 AA):
  dock buttons need accessible names, the cube needs keyboard equivalents.

## Sources
- Onshape view cube & navigation: https://cad.onshape.com/help/Content/View/view_navigation_and_the_view_cube.htm
- Onshape measure tool: https://cad.onshape.com/help/Content/View/measure_tool.htm
- Autodesk viewer toolbars: https://help.autodesk.com/cloudhelp/ENU/Docs-Files/files/view-files/View_Navigation_Toolbars.html
- Autodesk viewer tools reference: https://help.autodesk.com/cloudhelp/ENU/PLM-360-User/files/UG-ATTTAB-VIEWER.htm
- Xometry visual DFM in Fusion: https://www.autodesk.com/products/fusion-360/blog/xometry-add-in-fusion-360
- aPriori DFM buyer's guide: https://www.apriori.com/wp-content/uploads/2026/04/DFM-Buyers-Guide.pdf
