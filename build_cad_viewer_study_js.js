// CostVision — "3D CAD Viewer & CAD-to-Cost Capture: market study + build plan"
// Dark technical theme, pptxgenjs, native shapes, humanised speaker notes.
// Grounded in: (a) a code audit of our current viewer (cad-viewer.ts / cad-geometry-engine.py),
// (b) verified deep web research on aPriori, Siemens NX Feature2Cost, 3D-Tool, Werk24,
//     MTI Costimator, AFR literature (UV-Net/BRepGAT/BrepMFR), occt-import-js & OCCT XDE.
// Usage:  NODE_PATH=calculator/node_modules node build_cad_viewer_study_js.js
const pptxgen = require('pptxgenjs');

const C = {
  BG:'0B0F17', SURF:'141B28', SURF2:'1C2536', BORDER:'2B3A52',
  CYAN:'22D3EE', BLUE:'3B82F6', VIOLET:'8B5CF6', GREEN:'10B981',
  AMBER:'F59E0B', RED:'EF4444',
  W:'EAF0F8', GREY:'9AA7BD', DIM:'5C6B85', INK:'0B0F17',
};
const FONT='Calibri', HEADF='Calibri';
const p=new pptxgen(); p.defineLayout({name:'W',width:13.333,height:7.5}); p.layout='W';
p.author='CostVision'; p.title='3D CAD Viewer & CAD-to-Cost Capture — Study & Roadmap';
const W=13.333, H=7.5;

const rect=(s,x,y,w,h,f,o={})=>s.addShape('rect',{x,y,w,h,fill:{color:f},line:{type:'none'},...o});
const rr=(s,x,y,w,h,f,o={})=>s.addShape('roundRect',{x,y,w,h,fill:{color:f},line:{type:'none'},rectRadius:0.07,...o});
const line=(s,x,y,w,h,c,wd=1)=>s.addShape('line',{x,y,w,h,line:{color:c,width:wd}});
const T=(s,t,x,y,w,h,o={})=>s.addText(t,{x,y,w,h,fontFace:FONT,color:C.W,valign:'top',margin:0,...o});
// coloured status disc: 2=full(cyan), 1=partial(amber), 0=none(hollow)
function disc(s,cx,cy,level){ const d=0.19;
  if(level===2) s.addShape('ellipse',{x:cx-d/2,y:cy-d/2,w:d,h:d,fill:{color:C.CYAN},line:{type:'none'}});
  else if(level===1) s.addShape('ellipse',{x:cx-d/2,y:cy-d/2,w:d,h:d,fill:{color:C.AMBER},line:{type:'none'}});
  else s.addShape('ellipse',{x:cx-d/2,y:cy-d/2,w:d,h:d,fill:{color:C.SURF},line:{color:C.DIM,width:1.25}});
}
function logo(s){
  rr(s,0.4,0.34,0.4,0.4,C.CYAN,{rectRadius:0.1});
  T(s,'cv',0.4,0.34,0.4,0.4,{align:'center',valign:'middle',fontSize:16,bold:true,color:C.INK});
  T(s,'CostVision',0.9,0.31,3.2,0.3,{fontSize:16,bold:true,color:C.W});
  T(s,'CAD-TO-COST  INTELLIGENCE',0.9,0.56,3.4,0.2,{fontSize:7,color:C.DIM,charSpacing:1.5});
}
function header(title,kicker){
  const s=p.addSlide(); rect(s,0,0,W,H,C.BG); logo(s);
  rect(s,0,0.92,W,0.022,C.CYAN);
  let ty=1.16;
  if(kicker){ T(s,kicker.toUpperCase(),0.45,1.08,12.4,0.28,{fontSize:10.5,bold:true,color:C.CYAN,charSpacing:0.5}); ty=1.36; }
  T(s,title,0.45,ty,12.45,0.62,{fontSize:25,bold:true,color:C.W});
  T(s,'CostVision  ·  Competitive study & build plan  ·  Confidential',0.45,7.12,12.45,0.28,
    {fontSize:7.5,color:C.DIM,align:'center'});
  return s;
}
// small card
function card(s,x,y,w,h,accent,title,body,tsize=11,bsize=9.5){
  rr(s,x,y,w,h,C.SURF2,{line:{color:C.BORDER,width:0.75}});
  rect(s,x,y,0.07,h,accent);
  T(s,title,x+0.2,y+0.12,w-0.34,0.4,{fontSize:tsize,bold:true,color:C.W});
  T(s,body,x+0.2,y+0.12+0.34,w-0.34,h-0.5,{fontSize:bsize,color:C.GREY,lineSpacingMultiple:1.06});
}

// ════════════════════════════════════ 1 — TITLE ════════════════════════════════════
(()=>{const s=p.addSlide(); rect(s,0,0,W,H,C.BG);
 rect(s,0,0,W,0.14,C.CYAN);
 // faint technical grid motif (thin lines)
 for(let i=1;i<9;i++) line(s,1.5+i*1.25,4.6,0,2.2,C.SURF2,0.75);
 logo(s);
 T(s,'The 3D Viewer — and the Data It Captures',0.7,2.15,12,0.9,{fontSize:40,bold:true,color:C.W});
 rect(s,0.72,3.12,3.4,0.05,C.CYAN);
 T(s,'A competitive study of how the best should-cost tools turn CAD into cost automatically — '+
     'and a build plan to make our 3D viewer feel like real CAD software.',
   0.72,3.34,11.6,0.8,{fontSize:15,color:C.GREY,lineSpacingMultiple:1.15});
 // pills
 const pills=[['Market study',C.CYAN],['Gap analysis',C.BLUE],['4-phase roadmap',C.VIOLET],
   ['Bigger, CAD-grade viewer',C.GREEN]];
 let px=0.72; pills.forEach(([t,c])=>{ const w=0.28+t.length*0.098;
   rr(s,px,4.55,w,0.4,C.SURF2,{line:{color:c,width:1}}); T(s,t,px,4.55,w,0.4,{fontSize:10,bold:true,color:c,align:'center',valign:'middle'}); px+=w+0.22; });
 T(s,'CostVision  ·  Cost Engineering & Digital Innovation  ·  July 2026',0.72,6.7,12,0.3,{fontSize:11,color:C.DIM});
 s.addNotes("Set the frame in one breath. You looked at a rival should-cost tool and its CAD viewer impressed you — it pulls data straight off the model and it feels like real CAD software. Fair challenge. So I did two things: I audited exactly what our own viewer and geometry engine do today, and I ran verified market research on how the leaders — aPriori, Siemens, and the specialist DFM and drawing-reading tools — actually work. This deck is the honest result: where they're ahead, where we're quietly already strong, and a concrete four-phase plan to close the gap — including the two things you asked for by name, a bigger viewer and a proper CAD-software feel.");})();

// ════════════════════════════════════ 2 — EXEC SUMMARY ════════════════════════════════════
(()=>{const s=header('What we found — and the bet','Executive summary');
 const k=[
   ['1','The pattern is universal','Every leader runs automatic feature recognition on the CAD B-rep, maps features to cost drivers, and lets a human CORRECT — never re-type — the geometry.',C.CYAN],
   ['2','We are already strong where it is hard','Our OCCT engine already measures holes, depths, walls, draft, setups and feeds them to cost. Our real gaps are the VIEWER and showing what we already know.',C.GREEN],
   ['3','The "feel" is on-model overlays','What makes a viewer feel like CAD software is DFM painted ON the model — thickness & draft heatmaps, section, a feature tree — plus room to breathe (a big canvas).',C.BLUE],
   ['4','The build is bounded & staged','A 4-phase plan: quick wins first (bigger viewer + paint the data we already compute), then CAD-grade tools, then deeper capture (PMI/tolerances), then best-in-class AFR.',C.VIOLET],
 ];
 let y=1.95; k.forEach(([n,t,b,c])=>{ rr(s,0.45,y,12.45,1.14,C.SURF,{line:{color:C.BORDER,width:0.75}});
   rect(s,0.45,y,0.07,1.14,c);
   s.addShape('ellipse',{x:0.72,y:y+0.34,w:0.46,h:0.46,fill:{color:c},line:{type:'none'}});
   T(s,n,0.72,y+0.34,0.46,0.46,{fontSize:19,bold:true,color:C.INK,align:'center',valign:'middle'});
   T(s,t,1.4,y+0.16,4.5,0.85,{fontSize:13,bold:true,color:C.W,valign:'middle'});
   T(s,b,5.95,y+0.12,6.7,0.92,{fontSize:10.5,color:C.GREY,valign:'middle',lineSpacingMultiple:1.05});
   y+=1.24; });
 s.addNotes("Four takeaways if you remember nothing else. One: the whole industry works the same way — recognise features off the raw geometry, turn them into cost drivers, and keep a human in the loop only to CORRECT the recognition, never to re-type the part. Two — and this surprised me in a good way — we're already strong at the hard part: our engine measures holes, depths, walls, draft and setups and pushes them into the cost. Three: what makes their viewers feel premium isn't magic, it's DFM analysis painted directly on the model, plus a canvas big enough to work in. Four: the plan is bounded and staged — quick wins first, and several of those are just SHOWING data we already compute. This isn't a moonshot; it's mostly finishing what we started.");})();

// ════════════════════════════════════ 3 — THE PATTERN ════════════════════════════════════
(()=>{const s=header('How the best tools turn CAD into cost','The pattern · verified');
 // pipeline
 const steps=[['3D model','STEP / native CAD / Parasolid',C.GREY],
   ['B-rep AFR','recognise holes, pockets, bends, ribs, undercuts…',C.CYAN],
   ['Cost drivers','features map to routing, ops, tooling',C.BLUE],
   ['Human CORRECTS','fix a mis-read feature — not re-type geometry',C.AMBER],
   ['Should-cost','bottom-up, defensible',C.GREEN]];
 let x=0.5; const bw=2.3, gap=0.22;
 steps.forEach(([t,b,c],i)=>{ rr(s,x,2.05,bw,1.35,C.SURF2,{line:{color:C.BORDER,width:0.75}});
   rect(s,x,2.05,bw,0.05,c);
   T(s,t,x+0.14,2.2,bw-0.28,0.4,{fontSize:12,bold:true,color:c});
   T(s,b,x+0.14,2.58,bw-0.28,0.72,{fontSize:8.5,color:C.GREY,lineSpacingMultiple:1.04});
   if(i<steps.length-1) T(s,'→',x+bw-0.02,2.35,gap+0.1,0.5,{fontSize:16,bold:true,color:C.CYAN,align:'center'});
   x+=bw+gap; });
 // two proof cards
 card(s,0.5,3.85,6.05,2.75,C.CYAN,'aPriori — Geometric Cost Drivers',
   'Inspects the raw B-rep — independent of how the native CAD built the feature — to extract named "Geometric Cost Drivers", then builds cost bottom-up. Because it costs from STEP / Parasolid (history-free formats), the recognition is provably topology-based, not feature-tree replay. GD&T can be added onto drivers to steer the process route.\n\n"Analyzes the 3D model, breaks it down into individual geometric cost drivers, and builds a cost from the bottom up."  — aPriori / DEVELOP3D',10.5,9);
 card(s,6.75,3.85,6.1,2.75,C.BLUE,'Siemens NX Feature2Cost',
   'Commodity-specific modules (Molding, Stamping) automatically analyse the geometry file and recognise part dimensions, ribs, undercuts, bends and progressive-die features, turn them into cost drivers, allow manual correction, and pass them "seamlessly" into Teamcenter Product Cost Management / Tool Costing.\n\n"Recognizes important geometrical information like general part dimensions, ribs, undercuts, bends… and drives them into actual cost drivers."  — Siemens Teamcenter blog',10.5,9);
 s.addNotes("This is the mental model for the whole deck. Read left to right: a 3D model comes in; automatic feature recognition reads the geometry and finds the holes, pockets, bends, ribs, undercuts; those features map onto cost drivers — routing, operations, tooling; a human steps in only to fix a mis-read feature, not to re-enter the part; and out comes a bottom-up should-cost. The two cards are the proof, in the vendors' own words. aPriori extracts 'geometric cost drivers' straight off the B-rep — and the tell is that it costs from STEP and Parasolid, which have no feature history, so it MUST be reading raw topology. Siemens ships commodity modules that recognise ribs, undercuts and bends and hand them straight to their costing engine. Note the honest caveat in both: the human corrects the recognition. Nobody is fully hands-off — and that's exactly our glass-box philosophy.");})();

// ════════════════════════════════════ 4 — COMPETITOR MATRIX ════════════════════════════════════
(()=>{const s=header('Competitor capability matrix','The landscape');
 const caps=['B-rep feature\nrecognition','On-model DFM\noverlays','PMI / GD&T\n→ cost','CAD-software\nviewer feel','Auto → cost\n(no re-entry)','Web /\ninstant'];
 const rows=[
   ['aPriori',            [2,1,1,1,2,1]],
   ['Siemens NX F2C',     [2,1,1,2,2,0]],
   ['3D-Tool (viewer)',   [1,2,0,2,0,1]],
   ['Werk24 (drawings)',  [1,0,2,0,1,2]],
   ['MTI Costimator 3DFX',[2,0,0,1,2,0]],
   ['CostVision — today', [1,0,0,1,2,2]],
   ['CostVision — planned',[2,2,2,2,2,2]],
 ];
 const x0=0.5, labW=2.85, gridX=x0+labW, gridW=12.9-gridX, colW=gridW/caps.length;
 const y0=2.28, hHdr=0.58, rH=0.45;
 // header
 caps.forEach((c,i)=>{ T(s,c,gridX+i*colW,y0-0.02,colW,hHdr,{fontSize:8.5,bold:true,color:C.GREY,align:'center',valign:'middle',lineSpacingMultiple:0.92}); });
 T(s,'Tool',x0,y0-0.02,labW,hHdr,{fontSize:9,bold:true,color:C.GREY,valign:'middle'});
 let y=y0+hHdr;
 rows.forEach((r,ri)=>{ const planned=ri===rows.length-1, today=r[0].includes('today');
   const bg = planned?'12271F':(today?'10202E':(ri%2? C.BG : C.SURF));
   rr(s,x0,y,12.9-x0,rH,bg,{line:{color:C.BORDER,width:0.5}});
   if(planned) rect(s,x0,y,0.06,rH,C.GREEN); if(today) rect(s,x0,y,0.06,rH,C.CYAN);
   const lc = planned?C.GREEN:(today?C.CYAN:C.W);
   T(s,r[0],x0+0.18,y,labW-0.2,rH,{fontSize:10,bold:(planned||today),color:lc,valign:'middle'});
   r[1].forEach((lv,ci)=> disc(s, gridX+ci*colW+colW/2, y+rH/2, lv));
   y+=rH; });
 // legend
 const ly=y+0.18; let lx=x0;
 [['Full',2,C.CYAN],['Partial',1,C.AMBER],['Limited / none',0,C.DIM]].forEach(([t,lv])=>{ disc(s,lx+0.1,ly+0.1,lv);
   T(s,t,lx+0.28,ly-0.03,1.7,0.26,{fontSize:9,color:C.GREY}); lx+= (t.length*0.075)+0.7; });
 T(s,'Sources: aPriori (DEVELOP3D / product), Siemens Teamcenter blog, 3D-Tool, Werk24 docs, MTI Systems — all verified.  Marks are our read of published capability.',
   x0,ly+0.4,12.4,0.3,{fontSize:8,color:C.DIM,italic:true});
 s.addNotes("This is the map. Columns are the six capabilities that matter; each row is a tool; a full cyan dot means strong, amber means partial, hollow means limited or absent. A few honest reads. The costing leaders — aPriori, Siemens, MTI Costimator — are strong on B-rep feature recognition and auto-to-cost, which is the expensive part. The best VIEWER experience actually comes from a pure viewer, 3D-Tool, whose on-model heatmaps set the bar. Werk24 owns tolerance and GD&T capture, but from 2D drawings, not the 3D model. Now find our two rows. 'CostVision today' — look where we already have full dots: auto-to-cost and web-native. That's rare; most rivals are desktop. Our hollow dots are on-model overlays, PMI-to-cost, and viewer feel. The bottom row is the plan — and the whole roadmap is simply turning those three hollow dots green without giving up the two we already own.");})();

// ════════════════════════════════════ 5 — WHAT MAKES A VIEWER FEEL LIKE CAD ════════════════════════════════════
(()=>{const s=header('What makes a viewer "feel like CAD software"','The experience');
 T(s,'It is not prettier rendering — it is analysis painted ON the model, and room to work. 3D-Tool is the gold standard: four heatmap analyses shown directly on the part.',
   0.45,1.95,12.4,0.5,{fontSize:12,color:C.GREY,italic:true,lineSpacingMultiple:1.1});
 const items=[
   [C.CYAN,'Wall-thickness heatmap','Thin/thick zones coloured on the model (single-ray & fitted-ball methods) — instantly shows mould/casting risk and cost drivers.'],
   [C.BLUE,'Draft & undercut analysis','Draft angle shaded per face; areas that "cannot be demolded" flagged as undercuts → slide units → tooling cost.'],
   [C.VIOLET,'Section & measurement','Live cut planes, true measure, model comparison and collision — the everyday CAD verbs users expect.'],
   [C.GREEN,'Feature / model tree','A persistent list of recognised features; click a row → the face lights up. Two-way link between the number and the geometry.'],
   [C.AMBER,'PMI / GD&T on the model','Tolerances and annotations shown in 3D, tied to the faces that carry the cost of holding them.'],
   [C.CYAN,'A big, fluid canvas','Fullscreen / large view, an orientation cube, smooth orbit — the difference between "a widget" and "a tool".'],
 ];
 const cw=4.03, ch=1.9, gx=0.45, gy=2.55, gap=0.13;
 items.forEach(([c,t,b],i)=>{ const cx=gx+(i%3)*(cw+gap), cy=gy+Math.floor(i/3)*(ch+gap);
   card(s,cx,cy,cw,ch,c,t,b,11,9.3); });
 s.addNotes("When you said their viewer 'feels like CAD software', this slide is what you were reacting to — and it's learnable, not magic. The single biggest lever is the wall-thickness heatmap: the model lights up thin and thick zones in colour, and an engineer instantly sees the mould or casting risk that drives cost. Same idea for draft and undercut — shade the draft angle per face and flag the areas that can't be pulled from the tool, because those become slide units and real money. Then the everyday verbs: section planes, true measurement, and a feature tree where clicking a row lights up the face — that two-way link between a number and the geometry is what sells it. Add tolerances shown in 3D, and a canvas big enough to actually work in with a smooth orientation cube. None of this is exotic; it's a known, finite list — which is exactly why we can plan it.");})();

// ════════════════════════════════════ 6 — WHERE WE STAND TODAY ════════════════════════════════════
(()=>{const s=header('Where CostVision stands today — honestly','Our baseline · from a code audit');
 // strengths
 rr(s,0.45,1.95,6.05,4.7,C.SURF,{line:{color:C.BORDER,width:0.75}}); rect(s,0.45,1.95,6.05,0.05,C.GREEN);
 T(s,'✓  Already strong',0.68,2.1,5.6,0.4,{fontSize:14,bold:true,color:C.GREEN});
 const strong=['OCCT B-rep engine: volume, bbox, area, weights, face/edge classes',
   'Real feature table — holes & bosses with Ø, depth, through/blind',
   'Ray-cast wall thickness, draft/undercut analysis, setup-count',
   'Sheet-metal bend detection; parametric tooling-cost estimates',
   'Strong AUTO → cost: geometry auto-fills the cost form, no re-typing',
   'Per-face B-rep intelligence on click (type, Ø, hole-vs-boss, area)',
   'Distance / 3-pt circle / angle measure, section plane, CSV export',
   'Runs in the browser — instant, no desktop install'];
 let y=2.55; strong.forEach(t=>{ s.addShape('ellipse',{x:0.72,y:y+0.05,w:0.09,h:0.09,fill:{color:C.GREEN},line:{type:'none'}});
   T(s,t,0.92,y-0.04,5.4,0.44,{fontSize:9.7,color:C.GREY,lineSpacingMultiple:1.02}); y+=0.5; });
 // gaps
 rr(s,6.8,1.95,6.05,4.7,C.SURF,{line:{color:C.BORDER,width:0.75}}); rect(s,6.8,1.95,6.05,0.05,C.AMBER);
 T(s,'△  The real gaps',7.03,2.1,5.6,0.4,{fontSize:14,bold:true,color:C.AMBER});
 const gaps=[['No bigger / fullscreen viewer — fixed ~560px panel','viewer'],
   ['We COMPUTE thickness, draft, setups — but never paint them on the model','hidden'],
   ['No feature/model tree, no orientation cube, no exploded view','viewer'],
   ['Mesh-only render; STEP is tessellated server-side (no live B-rep in browser)','tech'],
   ['No PMI / GD&T / tolerance capture from STEP AP242','capture'],
   ['Feature recognition stops at holes/bosses — no fillet, chamfer, slot, thread specs','capture'],
   ['STL uploads are feature-blind (holes/draft/setups all zero)','capture'],
   ['Report feature tables not click-linked back to the 3D model','viewer']];
 y=2.55; gaps.forEach(([t,tag])=>{ const c=tag==='hidden'?C.CYAN:(tag==='capture'?C.VIOLET:C.AMBER);
   s.addShape('ellipse',{x:7.07,y:y+0.05,w:0.09,h:0.09,fill:{color:c},line:{type:'none'}});
   T(s,t,7.27,y-0.04,5.4,0.5,{fontSize:9.7,color:C.GREY,lineSpacingMultiple:1.02}); y+=0.5; });
 s.addNotes("I want to be straight with you, because credibility depends on it. On the left is what we already do well, and it's genuinely a lot: a real OCCT geometry engine that measures holes with depths, walls, draft and setups, and crucially auto-fills the cost form so nobody re-types the part — plus it runs right in the browser. That's the hard, expensive machinery, and it's built. On the right are the honest gaps, and I've colour-tagged them. The amber ones are the viewer experience — no bigger view, no feature tree, no orientation cube — which is exactly what you flagged. The cyan one is the most embarrassing and the most encouraging: we already COMPUTE wall thickness and draft, we just never draw them on the model. The violet ones are capture depth — fillets, chamfers, and especially tolerances from the CAD file. So the gap isn't 'we're behind on everything'; it's 'we hid our best work and skipped the shop window.'");})();

// ════════════════════════════════════ 7 — THE INSIGHT ════════════════════════════════════
(()=>{const s=header('The strategic insight','Where the leverage is');
 const big=[
   [C.CYAN,'“We already measure it —\nwe just don’t show it.”','Wall thickness, draft, undercuts, setups and manufacturability are all computed server-side today and thrown away visually. Painting them on the model is the single highest ratio of perceived value to engineering effort in this whole plan.'],
   [C.VIOLET,'“Capture more —\nso users type less.”','Every feature we recognise from the CAD (fillets, chamfers, threads, and tolerances from AP242) is one less field a human fills in — and one less place the estimate can drift. More capture = faster, more defensible, more automatic.'],
 ];
 let x=0.5; big.forEach(([c,t,b])=>{ rr(s,x,2.05,6.05,3.5,C.SURF2,{line:{color:C.BORDER,width:0.75}});
   rect(s,x,2.05,0.08,3.5,c);
   T(s,t,x+0.3,2.35,5.5,1.4,{fontSize:19,bold:true,color:C.W,lineSpacingMultiple:1.02});
   T(s,b,x+0.3,3.75,5.5,1.6,{fontSize:12,color:C.GREY,lineSpacingMultiple:1.12});
   x+=6.35; });
 rr(s,0.5,5.75,12.35,0.95,'10202E',{line:{color:C.CYAN,width:1}});
 T(s,[{text:'Design principle we keep:  ',options:{bold:true,color:C.CYAN}},
   {text:'the viewer is not decoration — it is an INPUT-CAPTURE surface. Every pixel earns its place by either capturing a cost driver or letting a human verify one. Glass-box, always: the AI reads geometry, it never sets a price in secret.',options:{color:C.GREY}}],
   0.8,5.75,11.7,0.95,{fontSize:11.5,valign:'middle',lineSpacingMultiple:1.08});
 s.addNotes("If the last slide was the diagnosis, this is the prescription, and it's two sentences. First: we already measure it, we just don't show it. Thickness, draft, undercuts, setups — all computed, all discarded visually. Painting them onto the model is the best value-to-effort ratio in the entire plan, because the hard work is already done. Second: capture more so users type less. Every feature we can read off the CAD — a fillet, a chamfer, a thread, a tolerance from the STEP file — is a field a human doesn't fill in and a place the number can't drift. And the principle at the bottom keeps us honest: the viewer isn't eye-candy, it's an input-capture surface, and every pixel has to either capture a cost driver or let a human check one. Same glass-box rule as everything else — the AI reads the geometry, it never sets the price in secret.");})();

// ════════════════════════════════════ 8 — TECHNOLOGY TO BUILD ON ════════════════════════════════════
(()=>{const s=header('The technology we would build on','How · verified & buildable');
 const tech=[
   [C.CYAN,'occt-import-js (OCCT → WASM)','Import STEP/IGES/BREP in the browser. Its JSON exposes a "brep_faces" map tying mesh triangles back to original B-rep faces — exactly what enables per-face selection & highlighting linked to cost, live, with no server round-trip.'],
   [C.BLUE,'OCCT XDE — AP242 PMI','OpenCascade\'s XDE / STEPCAFControl reads PMI (GD&T) from STEP AP242: dimensions, tolerances, datums. This is the path to reading tolerances straight from the 3D file — not a separate drawing.'],
   [C.VIOLET,'Native B-rep AFR (deep learning)','UV-Net, BRepGAT, BrepMFR, AAGNet encode the B-rep as a face-adjacency graph and segment machining features per face — 98–99%+ on public benchmarks — WITHOUT lossy mesh/voxel conversion.'],
   [C.GREEN,'Heatmap methods (well-trodden)','Wall thickness = single-ray + fitted-ball (both textbook). Draft = face-normal vs pull direction. We already compute the numbers; rendering them is a shader/vertex-colour job.'],
 ];
 const cw=6.05, ch=2.15, gx=0.5, gy=2.0, gap=0.24;
 tech.forEach(([c,t,b],i)=>{ const cx=gx+(i%2)*(cw+gap), cy=gy+Math.floor(i/2)*(ch+gap);
   card(s,cx,cy,cw,ch,c,t,b,12,10); });
 rr(s,0.5,6.45,12.35,0.62,C.SURF,{line:{color:C.AMBER,width:0.75}});
 T(s,[{text:'Honest caveat:  ',options:{bold:true,color:C.AMBER}},
   {text:'those 98–99% AFR figures are per-face on SYNTHETIC datasets; vendor "seamless / 95%+" claims are marketing. Real STEP is messier — so we keep the human-in-the-loop correction step, always.',options:{color:C.GREY}}],
   0.75,6.45,11.9,0.62,{fontSize:10,valign:'middle'});
 s.addNotes("The good news is none of this needs inventing — it's all published and buildable, and we already run the same kernel on the server. Four building blocks. First, occt-import-js: OpenCascade compiled to WebAssembly, so we can open a STEP file right in the browser and — critically — its output maps every mesh triangle back to the original CAD face, which is what lets you click one face and link it to a cost driver, live. Second, OCCT's XDE module reads GD&T and tolerances straight out of STEP AP242 — that's tolerance capture from the 3D file itself, no separate drawing. Third, native B-rep feature recognition — the UV-Net and BRepGAT family — hits 98–99% on public benchmarks by reading the geometry as a graph. And fourth, the heatmaps are textbook; we already compute the numbers. But note the caveat in amber: those accuracy numbers are on clean synthetic parts, and vendor claims are marketing — real CAD is messy — so we keep the human correction step. Honesty is the moat.");})();

// ════════════════════════════════════ 9 — ROADMAP OVERVIEW ════════════════════════════════════
(()=>{const s=header('The build plan — four phases','Roadmap');
 const ph=[
   [C.CYAN,'Phase 0','Quick wins','Bigger viewer + paint the data we already compute. Highest value / effort.','~1–2 wks'],
   [C.BLUE,'Phase 1','CAD-software feel','Feature tree, orientation cube, exploded, multi-section, richer measure, per-face → cost.','~2–4 wks'],
   [C.VIOLET,'Phase 2','Deeper capture','Fillet/chamfer/slot/thread recognition + STEP AP242 PMI → tolerance-driven costing.','~3–5 wks'],
   [C.GREEN,'Phase 3','Best-in-class AFR','Client-side B-rep kernel + graph-neural feature recognition. Rivals the leaders.','research'],
 ];
 const bw=2.98, gx=0.5, gy=2.15, gap=0.13;
 ph.forEach(([c,tag,t,b,eff],i)=>{ const x=gx+i*(bw+gap);
   rr(s,x,gy,bw,3.9,C.SURF2,{line:{color:C.BORDER,width:0.75}});
   rect(s,x,gy,bw,0.55,c);
   T(s,tag,x+0.2,gy+0.09,bw-0.4,0.4,{fontSize:14,bold:true,color:C.INK});
   T(s,t,x+0.2,gy+0.72,bw-0.4,0.5,{fontSize:14,bold:true,color:C.W});
   T(s,b,x+0.2,gy+1.35,bw-0.4,2.0,{fontSize:10.5,color:C.GREY,lineSpacingMultiple:1.12});
   rr(s,x+0.2,gy+3.28,bw-0.4,0.42,C.BG,{line:{color:c,width:0.75}});
   T(s,eff,x+0.2,gy+3.28,bw-0.4,0.42,{fontSize:10,bold:true,color:c,align:'center',valign:'middle'});
   if(i<3) T(s,'→',x+bw-0.03,gy+1.6,gap+0.12,0.5,{fontSize:15,bold:true,color:C.DIM,align:'center'}); });
 T(s,'Ship each phase on its own — value lands early. The two things you asked for (a bigger viewer, a CAD-software feel) are Phase 0 and Phase 1.',
   0.5,6.35,12.4,0.5,{fontSize:11,color:C.GREY,italic:true,align:'center'});
 s.addNotes("Here's the shape of the build, and the sequencing is deliberate. Phase zero is the quick wins — make the viewer bigger and paint the data we already compute — one to two weeks, and it's the best value for effort in the plan. Phase one is the CAD-software feel you asked for: feature tree, orientation cube, exploded view, better section and measure, and clicking a face to see its cost. Phase two goes deeper on capture — recognising fillets, chamfers, slots and threads, and reading tolerances straight from the STEP file to drive cost, which is how the leaders handle precision parts. Phase three is the research frontier — a browser-side CAD kernel and graph-neural feature recognition that would put us level with aPriori and Siemens on recognition. The key message: each phase ships on its own, so value lands early — and the two things you named specifically are the first two phases, not the last.");})();

// ════════════════════════════════════ 10 — PHASE 0 ════════════════════════════════════
(()=>{const s=header('Phase 0 — Quick wins','Roadmap · ~1–2 weeks · highest leverage');
 const rows=[
   ['Bigger / fullscreen viewer','Maximise button + Fullscreen API + a large "focus" mode and drag-to-resize. Directly the ask: room to work.','Instantly a serious tool; better demos & inspection'],
   ['Wall-thickness heatmap','Render the thickness we ALREADY compute as a colour map on the model, with a legend.','Thin-wall cost/mould risk visible at a glance'],
   ['Draft / undercut overlay','Shade draft angle per face; flag undercuts (data already computed) → tooling drivers.','DFM at concept; explains die/slide cost'],
   ['Persistent feature tree','Turn the existing feature table into a docked tree; click a row → highlight the face.','Two-way link between the number and the geometry'],
   ['Two-way report ↔ model link','Click a machined-feature report row → the face lights up in 3D, and back.','Trust: every cost line traces to a face'],
 ];
 T(s,'Everything here is high-value and low-risk — three of the five are just SHOWING data the engine already produces.',
   0.45,1.9,12.4,0.4,{fontSize:11.5,color:C.CYAN,italic:true});
 let y=2.45; rows.forEach(([t,b,ben])=>{ rr(s,0.45,y,12.45,0.86,C.SURF,{line:{color:C.BORDER,width:0.6}});
   rect(s,0.45,y,0.06,0.86,C.CYAN);
   T(s,t,0.66,y+0.1,3.15,0.66,{fontSize:11,bold:true,color:C.W,valign:'middle',lineSpacingMultiple:0.98});
   T(s,b,3.95,y+0.08,5.35,0.72,{fontSize:9.3,color:C.GREY,valign:'middle',lineSpacingMultiple:1.03});
   T(s,'→ '+ben,9.5,y+0.08,3.25,0.72,{fontSize:9,color:C.GREEN,valign:'middle',italic:true,lineSpacingMultiple:1.03});
   y+=0.94; });
 s.addNotes("Phase zero is where I'd start on Monday, because the return is immediate. Top of the list is your first explicit ask: a bigger, fullscreen viewer — a maximise button, the browser Fullscreen API, a large focus mode and drag-to-resize, so there's finally room to work and to demo. Then three overlays that are almost free because the engine already computes the numbers: paint the wall thickness as a heatmap, shade draft and flag undercuts, and it instantly looks and behaves like a DFM tool. Then a docked feature tree built from the feature table we already have, where clicking a row lights up the face — and the reverse, clicking a cost line in the report highlights the geometry it came from. That last one is quietly powerful: every pound traces to a face. Three of these five are literally just showing work we already did — that's why Phase zero is the highest-leverage slide in the deck.");})();

// ════════════════════════════════════ 11 — PHASE 1 ════════════════════════════════════
(()=>{const s=header('Phase 1 — The full CAD-software feel','Roadmap · ~2–4 weeks · your 2nd ask');
 const items=[
   [C.BLUE,'Orientation cube + smooth views','A draggable nav cube and named-view snapping — the universal "this is CAD" signal.'],
   [C.BLUE,'Feature / model tree','A real docked tree of bodies, faces & recognised features with visibility toggles.'],
   [C.VIOLET,'Exploded view','Separate the solids of an assembly along an axis — inspect and cost per component.'],
   [C.VIOLET,'Multi-section + cap shading','More than one cut plane, with solid caps — proper sectioning, not a single slider.'],
   [C.GREEN,'Richer measurement','True face radius, edge length, face-to-face parallel distance, coordinate read-out.'],
   [C.CYAN,'Per-face → cost linking','Click a face → see the operation and £ it drives. The viewer becomes the cost story.'],
 ];
 const cw=4.03, ch=1.95, gx=0.45, gy=2.0, gap=0.13;
 items.forEach(([c,t,b],i)=>{ const cx=gx+(i%3)*(cw+gap), cy=gy+Math.floor(i/3)*(ch+gap);
   card(s,cx,cy,cw,ch,c,t,b,11.5,9.6); });
 rr(s,0.45,6.15,12.45,0.62,'10202E',{line:{color:C.CYAN,width:0.75}});
 T(s,[{text:'The payoff:  ',options:{bold:true,color:C.CYAN}},
   {text:'the viewer stops being "a preview" and becomes the place engineers inspect, verify and understand the cost — the exact thing that impressed you about the competitor.',options:{color:C.GREY}}],
   0.7,6.15,11.9,0.62,{fontSize:10.5,valign:'middle'});
 s.addNotes("Phase one is your second explicit ask made concrete: making it genuinely feel like CAD software. The orientation cube in the corner is the single most recognisable 'this is CAD' signal, so it's first. A real docked feature and model tree — bodies, faces, recognised features, with visibility toggles — gives the professional structure people expect. Exploded view lets you pull an assembly apart and cost each component. Proper multi-plane sectioning with solid caps replaces our single slider. Richer measurement — true face radius, edge length, face-to-face — matches what they'd do in SolidWorks. And the one that ties it to our mission: click a face and see the operation and the pounds it drives. That's the payoff line at the bottom — the viewer stops being a preview and becomes the place engineers actually inspect and understand the cost. That's precisely what impressed you about the rival, and it's a few weeks of focused work, not a rewrite.");})();

// ════════════════════════════════════ 12 — PHASE 2 ════════════════════════════════════
(()=>{const s=header('Phase 2 — Deeper automatic capture','Roadmap · ~3–5 weeks · type less');
 // left: more features
 rr(s,0.45,1.95,6.05,4.7,C.SURF,{line:{color:C.BORDER,width:0.75}}); rect(s,0.45,1.95,6.05,0.05,C.VIOLET);
 T(s,'More recognised features → cost',0.68,2.12,5.6,0.4,{fontSize:13,bold:true,color:C.VIOLET});
 const fr=['Fillets & chamfers — count, size → finishing / deburr ops',
   'Slots & pockets — proper recognition (today only holes/bosses)',
   'Ribs & bosses on mouldings → tool complexity',
   'Thread specs — real pitch/class, not a boolean guess',
   'Machined-vs-as-cast face classification → what to machine',
   'Better STL path — recover features so STL isn’t cost-blind'];
 let y=2.6; fr.forEach(t=>{ s.addShape('ellipse',{x:0.72,y:y+0.06,w:0.09,h:0.09,fill:{color:C.VIOLET},line:{type:'none'}});
   T(s,t,0.92,y-0.02,5.4,0.5,{fontSize:10,color:C.GREY,lineSpacingMultiple:1.05}); y+=0.63; });
 // right: PMI / tolerance-driven costing
 rr(s,6.8,1.95,6.05,4.7,C.SURF,{line:{color:C.BORDER,width:0.75}}); rect(s,6.8,1.95,6.05,0.05,C.AMBER);
 T(s,'Tolerance-driven costing (the differentiator)',7.03,2.12,5.6,0.4,{fontSize:13,bold:true,color:C.AMBER});
 T(s,'Read PMI / GD&T straight from STEP AP242 (via OCCT XDE) — the tolerances that actually drive cost — and map them to process & inspection:',
   7.03,2.58,5.6,0.9,{fontSize:10,color:C.GREY,lineSpacingMultiple:1.1});
 const tol=[['Tight bore tolerance','→ ream / hone / grind added'],
   ['Fine surface finish (Ra)','→ super-finish / polish op'],
   ['Flatness / position GD&T','→ inspection + fixturing cost'],
   ['Loose general tol.','→ cheaper route, faster cycle']];
 y=3.6; tol.forEach(([a,b])=>{ rr(s,7.03,y,5.6,0.6,C.SURF2,{line:{color:C.BORDER,width:0.5}});
   T(s,a,7.2,y,2.7,0.6,{fontSize:9.5,bold:true,color:C.W,valign:'middle'});
   T(s,b,9.9,y,2.6,0.6,{fontSize:9.5,color:C.AMBER,valign:'middle'}); y+=0.7; });
 s.addNotes("Phase two is about capturing more so people type less, and it splits in two. On the left, we widen feature recognition beyond today's holes and bosses to fillets, chamfers, slots, ribs, real thread specs, and — importantly — telling machined faces from as-cast ones, plus rescuing the STL path so those uploads aren't cost-blind. Each of those is a field a human no longer fills in. On the right is the real differentiator, and it's the thing Werk24 built a company on: tolerance-driven costing. Today, tolerances only reach us if someone uploads a separate drawing. But OpenCascade's XDE module can read the GD&T straight out of the STEP AP242 file — and tolerances are where cost hides. A tight bore adds a ream or a grind; a fine surface finish adds a polishing op; a flatness callout adds inspection and fixturing; a loose tolerance means a cheaper, faster route. Reading that automatically and mapping it to the process is how you cost a precision part correctly — and almost nobody does it from the 3D model.");})();

// ════════════════════════════════════ 13 — PHASE 3 ════════════════════════════════════
(()=>{const s=header('Phase 3 — Best-in-class recognition','Roadmap · research track');
 card(s,0.5,2.05,6.05,3.05,C.CYAN,'Client-side B-rep kernel (occt-import-js)',
   'Open STEP/IGES directly in the browser and hold the real B-rep, not a server-tessellated mesh. Unlocks true face-radius measurement, instant load, and per-face picking with zero round-trip.\n\nBenefit: the viewer stops depending on a server call to feel alive — and every face is a first-class, clickable, costable object.',12,10);
 card(s,6.75,2.05,6.1,3.05,C.VIOLET,'Graph-neural feature recognition (AFR)',
   'Add a native B-rep AFR model (UV-Net / BRepGAT family) that segments machining features per face at published 98–99% on benchmarks — recognising the compound features our geometric heuristics miss.\n\nBenefit: recall and precision that rival aPriori & Siemens — while staying glass-box, because every prediction is a face a human can verify.',12,10);
 rr(s,0.5,5.35,12.35,1.35,C.SURF,{line:{color:C.BORDER,width:0.75}}); rect(s,0.5,5.35,0.08,1.35,C.AMBER);
 T(s,'Why this is a "later" phase, not a "never" phase',0.78,5.5,11.8,0.35,{fontSize:12,bold:true,color:C.AMBER});
 T(s,'Highest effort and the benchmark accuracy is on synthetic data — so it earns its place only after Phases 0–2 have already closed the visible gap. But it is the ceiling: it is what would let us say "our recognition matches the market leaders," on our own secure, learning, glass-box platform.',
   0.78,5.86,11.9,0.78,{fontSize:10.5,color:C.GREY,lineSpacingMultiple:1.1});
 s.addNotes("Phase three is the frontier, and I'm putting it last on purpose. Two pieces. First, move the CAD kernel into the browser with occt-import-js so we hold the real geometry, not a server-made mesh — that makes the viewer feel instant and makes every face a true, clickable, costable object. Second, add a graph-neural feature-recognition model of the kind the research validated — the UV-Net and BRepGAT family — which segments machining features per face at benchmark accuracies in the high nineties and catches the compound features our current geometric rules miss. That's what would let us honestly say our recognition rivals aPriori and Siemens. But note the amber box: it's the highest-effort work, and those accuracy numbers are on clean synthetic parts, so it only earns its slot after Phases zero to two have already closed the gap the user can actually see. It's the ceiling, not the floor — and it stays glass-box, because every prediction is just a face a human can verify.");})();

// ════════════════════════════════════ 14 — THE TWO ASKS, SPECCED ════════════════════════════════════
(()=>{const s=header('Your two asks — specced','What you asked for, concretely');
 // ask 1
 rr(s,0.45,1.95,6.05,4.75,C.SURF2,{line:{color:C.CYAN,width:1}}); rect(s,0.45,1.95,6.05,0.05,C.CYAN);
 T(s,'1 · Make the 3D viewer bigger',0.7,2.12,5.6,0.4,{fontSize:15,bold:true,color:C.CYAN});
 const a1=['Maximise button in the toolbar → full-window overlay',
   'Browser Fullscreen API (true full-screen, F11-style)',
   'Large "focus" mode: viewer takes the whole workspace',
   'Drag-to-resize handle on the panel; remembers your size',
   'Toolbar & panels reflow so nothing crowds the model',
   'Escape / click-out returns to the costing layout'];
 let y=2.62; a1.forEach(t=>{ s.addShape('ellipse',{x:0.72,y:y+0.06,w:0.09,h:0.09,fill:{color:C.CYAN},line:{type:'none'}});
   T(s,t,0.92,y-0.02,5.4,0.5,{fontSize:10.3,color:C.GREY,lineSpacingMultiple:1.04}); y+=0.62; });
 // ask 2
 rr(s,6.8,1.95,6.05,4.75,C.SURF2,{line:{color:C.BLUE,width:1}}); rect(s,6.8,1.95,6.05,0.05,C.BLUE);
 T(s,'2 · Full CAD-software feel',7.05,2.12,5.6,0.4,{fontSize:15,bold:true,color:C.BLUE});
 const a2=['Orientation cube + named-view snapping',
   'Docked feature / model tree (click row → highlight face)',
   'On-model heatmaps: wall thickness, draft, undercut',
   'Multi-section planes with cap shading; exploded view',
   'Richer measure: face radius, edge length, face-to-face',
   'Per-face → cost: click a face, see its op and £'];
 y=2.62; a2.forEach(t=>{ s.addShape('ellipse',{x:7.07,y:y+0.06,w:0.09,h:0.09,fill:{color:C.BLUE},line:{type:'none'}});
   T(s,t,7.27,y-0.02,5.4,0.5,{fontSize:10.3,color:C.GREY,lineSpacingMultiple:1.04}); y+=0.62; });
 s.addNotes("This slide is just the two things you asked for, turned into a checklist so we're precise. On the left, 'make it bigger' is really six concrete moves: a maximise button, true browser full-screen, a focus mode that hands the whole workspace to the model, a drag-to-resize handle that remembers your size, panels that reflow so nothing crowds the part, and escape to come back to costing. On the right, 'feel like CAD software' is the orientation cube, a clickable feature tree, the on-model heatmaps, multi-plane sections and exploded view, richer measurement, and clicking a face to see its cost. The left column is Phase zero and the right column is Phases zero and one — so if you approve the plan, both of your asks are in the first fortnight or two of work, not somewhere off in the distance.");})();

// ════════════════════════════════════ 15 — BENEFITS + RECOMMENDATION ════════════════════════════════════
(()=>{const s=header('Benefits, and the recommendation','Why it is worth it');
 const ben=[
   [C.GREEN,'More auto-capture','Every feature & tolerance read from CAD is a field nobody types — faster quotes, fewer errors.'],
   [C.CYAN,'Fewer estimate drifts','Capturing the driver instead of typing it removes a place the number can go wrong.'],
   [C.BLUE,'DFM at concept','On-model thickness/draft/undercut catches cost problems while a change is still free.'],
   [C.VIOLET,'Demo & sales credibility','A big, CAD-grade viewer is what wins the room — the exact reaction you had to the rival.'],
   [C.AMBER,'Tolerance-correct cost','Reading GD&T from the model prices precision parts right — a real differentiator.'],
   [C.GREEN,'Still glass-box & ours','Every captured value is a face a human can verify; secure, on-prem, self-learning.'],
 ];
 const cw=4.03, ch=1.55, gx=0.45, gy=1.95, gap=0.13;
 ben.forEach(([c,t,b],i)=>{ const cx=gx+(i%3)*(cw+gap), cy=gy+Math.floor(i/3)*(ch+gap);
   card(s,cx,cy,cw,ch,c,t,b,11,9.2); });
 rr(s,0.45,5.35,12.45,1.4,'10202E',{line:{color:C.GREEN,width:1}}); rect(s,0.45,5.35,0.08,1.4,C.GREEN);
 T(s,'Recommendation',0.75,5.5,4,0.35,{fontSize:13,bold:true,color:C.GREEN});
 T(s,[{text:'Approve Phase 0 now',options:{bold:true,color:C.W}},
   {text:' — the bigger viewer plus painting the data we already compute, ~1–2 weeks. It delivers both of your asks fastest and de-risks the rest. Then take Phases 1–2 as a fast-follow. Phase 3 (graph-neural AFR) stays a research track we green-light once the visible gap is closed.',options:{color:C.GREY}}],
   0.75,5.88,11.9,0.8,{fontSize:11,valign:'top',lineSpacingMultiple:1.12});
 s.addNotes("Let me land it on why this is worth doing and what I'd actually ask for. The benefits stack up in plain terms: more auto-capture means fewer fields typed and faster quotes; capturing a driver instead of typing it removes a place the estimate drifts; on-model DFM catches cost problems at concept while a change is still free; a big CAD-grade viewer wins demos — literally the reaction you had to the competitor; reading tolerances from the model prices precision parts correctly, which is a genuine differentiator; and all of it stays glass-box and on our own secure, learning platform. My recommendation is deliberately modest: approve Phase zero now — the bigger viewer plus painting the data we already compute, one to two weeks — because it delivers both of your asks fastest and de-risks everything after it. Then Phases one and two as a fast-follow, and we green-light the Phase-three research only once the gap you can see is already closed. Small ask, fast proof, compounding payoff. That's the challenge met — happy to start on Phase zero whenever you say go.");})();

const OUT='/home/user/leamington-marathi/CostVision-3D-CAD-Viewer-Study-and-Roadmap.pptx';
p.writeFile({fileName:OUT}).then(f=>console.log('wrote',f));
