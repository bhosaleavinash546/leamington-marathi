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

## 6. Implemented — Phases 1 and 2 (Oct 2026)

Proof: `npx tsx e2e/viewer-shots.ts <out>` (real server, real STEP, both themes, then a machined part
costed end to end through CAD-to-Cost) — axe WCAG 2.1 AA inside the viewer: **0 violations** in every
state it shoots (loaded, colour menu open, inspector open, both themes). Screenshots: `docs/ui/viewer-shots/after-*.png`.

| Plan item | What shipped | Where |
|---|---|---|
| Ghost edges | Kernel edges moved with the re-centred mesh; STL after STEP no longer inherits them | `cad-viewer.ts` load |
| Theme background, lighting, shadow | Gradient backdrop per theme (live on theme switch, in snapshots too), themed grid and edges, soft contact shadow | `applyThemeToScene`, `buildShadow` |
| Icon dock + fly-outs | One floating dock: Home · Fit │ Select · Measure ▾ · Section │ Colour by ▾ · Display ▾ │ Tree · Assembly ▾ │ Inspector · Snapshot · Full screen · Shortcuts. Tools a model cannot use are hidden. Tooltips carry the shortcut. Every tool kept its `data-act` id | scaffold, `runAction` |
| View cube | Labelled cube top-right, face / edge / corner → 26 views, hover tint, theme-aware; replaces ViewHelper | `cad-viewcube.ts` |
| Animated views | Every view change glides 320 ms (ease-in-out; off under reduced motion); Fit keeps the view direction | `animateCamera` |
| Percentile ranges | Thickness and cost colour on the area-weighted 5–95 % range, legend prints ≤ / ≥ and the true readings | `robustRange` |
| Empty state + sample | Drop zone with format chips, "Try a sample part" (`public/samples/casting-bracket.stp`), what-it-does cards, an honest note that the server keeps the mesh | `index.html`, `main.ts` |
| Full screen | Fullscreen API, in-page fallback | `setFullscreen` |
| Shortcuts | H F 0–6 D R A P G Del S C E W B T I X ? Esc while the viewer has focus; the viewer claims them (the app's "?" Help no longer fires over it) | `KEYS` |
| Nav tooltip | Hidden on any click / scroll | `index.html` tooltip system |
| Inspector | Part (size, mesh volume and area, mass at a chosen typical density, bodies, faces, area by face type), Selection, Cost on model, Manufacturability, Wall thickness (histogram, median, readings), Holes & bosses, Measurements (+ CSV) | `renderInspector` |
| Cost on model | After a CAD costing the model is coloured by £ per face (hot = expensive) and the inspector ranks the engine's feature lines; click → highlight + fly to. Money in the display currency through the host's formatter | `setFaceCosts(costs, { items, format })` |
| DFM on the model | The background geometric-DFM findings (severity, measured range v threshold, £/part, source) listed with fly-to; before a costing, process-independent geometry checks (deep holes ≥ 5 × Ø, holes < Ø2, walls < 1 mm) | `setIssues`, `geometryChecks` |
| Both mounts | Standalone viewer and the inline CAD-to-Cost viewer are one component; compact mode: smaller dock, inspector as an overlay | `.cv3d--compact` |

**Found on the way (and fixed):**
- **Fillets read as holes.** The kernel marks a concave quarter-cylinder "hole", so the casting bracket's R2
  edge fillets were listed as nine Ø4 × 70.7 mm holes "17.7 × Ø deep". Holes and bosses now need ≥ 0.4 of a
  turn, measured from the kernel's own area ÷ 2πR·L (`isRoundFeature`). A split bore (two half-turn faces)
  still counts.
- **Cost heat-map was upside down.** The old ramp painted the most expensive faces blue (the "thick" end
  of the thickness ramp). Expensive is now red.
- **Thin-wall noise.** Single-ray readings on fillets and slivers (a 0.17 mm "wall") are no longer judged.
  Only faces of ≥ 1 cm² count. The bracket goes from 6 flagged faces to 1, and that one says to confirm with
  Face to face.

**Not done (Phase 3):** saved views and notes in the PDF, share links, LOD for large assemblies.
