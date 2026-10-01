// CostVision — "3D CAD Viewer & CAD-to-Cost Capture: market study + build plan"
// Dark technical theme, pptxgenjs, native shapes, spoken speaker notes on every slide.
// Study written July 2026; updated September 2026 so that every "today" claim matches
// the code: calculator/src/ui/cad-viewer.ts (viewer), calculator/server/utils/
// cad-geometry-engine.py (what is measured), calculator/server/services/stl-parser.ts
// (STL fast path), calculator/src/engine/cost-input-rules/ (rules + questions),
// calculator/server/utils/dxf-blank.ts (DXF flat blank). Facts: docs/decks/tool-facts.md.
// Competitor descriptions are our reading of vendors' public material, not tests.
// Usage:  NODE_PATH=calculator/node_modules node build_cad_viewer_study_js.js
const pptxgen = require('pptxgenjs');

// Brand accents on a dark ground: the onDark variants of the same hues the
// light decks and the app use (calculator/src/brand/brand.json, I5).
const BRAND = require('./calculator/src/brand/brand.json');
const D = BRAND.onDark;
const C = {
  BG:'0B0F17', SURF:'141B28', SURF2:'1C2536', BORDER:'2B3A52',
  CYAN:D.teal, BLUE:D.blue, VIOLET:D.violet, GREEN:D.green,
  AMBER:D.amber, RED:D.red,
  W:'EAF0F8', GREY:'9AA7BD', DIM:'5C6B85', INK:'0B0F17',
};
const FONT=BRAND.fonts.officeBody, HEADF=BRAND.fonts.officeTitle;
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
  T(s,'CAD-TO-COST  INTELLIGENCE',0.9,0.56,3.4,0.2,{fontSize:7.5,color:C.DIM,charSpacing:1.5});
}
function header(title,kicker){
  const s=p.addSlide(); rect(s,0,0,W,H,C.BG); logo(s);
  rect(s,0,0.92,W,0.022,C.CYAN);
  let ty=1.16;
  if(kicker){ T(s,kicker.toUpperCase(),0.45,1.08,12.4,0.28,{fontSize:10.5,bold:true,color:C.CYAN,charSpacing:0.5}); ty=1.36; }
  T(s,title,0.45,ty,12.45,0.62,{fontSize:25,bold:true,color:C.W});
  T(s,'CostVision  ·  CAD viewer study & roadmap  ·  Updated September 2026  ·  Confidential',0.45,7.12,12.45,0.28,
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
 T(s,'The 3D Viewer — and the Data It Captures',0.7,2.2,12.2,0.9,{fontSize:34,bold:true,color:C.W});
 rect(s,0.72,3.12,3.4,0.05,C.CYAN);
 T(s,'How leading should-cost tools turn CAD into cost, what our viewer and geometry engine do today, '+
     'and what is still to build.',
   0.72,3.34,11.6,0.8,{fontSize:15,color:C.GREY,lineSpacingMultiple:1.15});
 // pills
 const pills=[['Market study',C.CYAN],['Where we stand',C.BLUE],['Roadmap',C.VIOLET],
   ['What is built now',C.GREEN]];
 let px=0.72; pills.forEach(([t,c])=>{ const w=0.28+t.length*0.098;
   rr(s,px,4.55,w,0.4,C.SURF2,{line:{color:c,width:1}}); T(s,t,px,4.55,w,0.4,{fontSize:10,bold:true,color:c,align:'center',valign:'middle'}); px+=w+0.22; });
 T(s,'CostVision  ·  Cost Engineering & Digital Innovation  ·  Study July 2026, updated September 2026',0.72,6.7,12,0.3,{fontSize:11,color:C.DIM});
 s.addNotes("This deck started in July as an answer to a fair challenge. Someone had seen a rival should-cost tool and liked its 3D viewer. It felt like real CAD software, and it seemed to pull data straight off the model. So I did two things. I read up on how the leading tools do this, and I went through our own viewer and geometry engine line by line. Since July we have built a good part of that plan. So I've updated the deck to say plainly what is in the tool today and what is still future. One thing to hold on to all the way through. At JLR the AI waits for an API key. The CAD path runs on measured geometry and plain rules. Where the geometry can't decide something, the tool asks the engineer. Nothing on these slides depends on AI.");})();

// ════════════════════════════════════ 2 — EXEC SUMMARY ════════════════════════════════════
(()=>{const s=header('What we found','Executive summary');
 const k=[
   ['1','The pattern is the same everywhere','The leading tools find features on the CAD solid (the B-rep: its exact faces and edges), turn them into cost drivers, and let a person correct the result instead of retyping the part.',C.CYAN],
   ['2','We already had the hard part','Our geometry engine measures volume, size, walls, holes, draft and setups. Rules turn that into cost inputs. Where the geometry cannot decide, the tool asks the engineer.',C.GREEN],
   ['3','The "CAD feel" is analysis on the model','Wall thickness and draft coloured on the part, sections, a model tree and a big canvas. Since July most of this has been built into our viewer.',C.BLUE],
   ['4','What is left is deeper capture','Tolerances read from the CAD file, more feature types and a better STL path are still roadmap. Browser-side B-rep and learned recognition are future research.',C.VIOLET],
 ];
 let y=1.95; k.forEach(([n,t,b,c])=>{ rr(s,0.45,y,12.45,1.14,C.SURF,{line:{color:C.BORDER,width:0.75}});
   rect(s,0.45,y,0.07,1.14,c);
   s.addShape('ellipse',{x:0.72,y:y+0.34,w:0.46,h:0.46,fill:{color:c},line:{type:'none'}});
   T(s,n,0.72,y+0.34,0.46,0.46,{fontSize:19,bold:true,color:C.INK,align:'center',valign:'middle'});
   T(s,t,1.4,y+0.16,4.5,0.85,{fontSize:13,bold:true,color:C.W,valign:'middle'});
   T(s,b,5.95,y+0.12,6.7,0.92,{fontSize:10.5,color:C.GREY,valign:'middle',lineSpacingMultiple:1.05});
   y+=1.24; });
 s.addNotes("If you remember four things, make it these. One, the leading tools all work the same way. They find features on the solid model, the B-rep, which just means the exact faces and edges of the part. They turn those features into cost drivers, and a person corrects the result rather than retyping the part. Two, we already had the hard part. Our geometry engine measures the part, and rules turn those measurements into cost inputs. When the geometry can't settle something, like the process route or the material family, the tool asks you. Three, the thing that makes a viewer feel like CAD software is analysis drawn on the model. Most of that is now built. Four, what is left is deeper capture: tolerances from the file, more feature types, and a better answer for STL files. Those are still roadmap, and I'll be clear about that on each slide.");})();

// ════════════════════════════════════ 3 — THE PATTERN ════════════════════════════════════
(()=>{const s=header('How the leading tools turn CAD into cost','The pattern · from public material');
 // pipeline
 const steps=[['3D model','STEP, native CAD or Parasolid file',C.GREY],
   ['Feature finding','find holes, pockets, bends, ribs, undercuts (AFR: automatic feature recognition)',C.CYAN],
   ['Cost drivers','each feature maps to a route, operations and tooling',C.BLUE],
   ['Person corrects','fix a feature that was read wrong; no retyping the part',C.AMBER],
   ['Should-cost','built up from the drivers, so it can be explained',C.GREEN]];
 let x=0.5; const bw=2.3, gap=0.22;
 steps.forEach(([t,b,c],i)=>{ rr(s,x,2.05,bw,1.35,C.SURF2,{line:{color:C.BORDER,width:0.75}});
   rect(s,x,2.05,bw,0.05,c);
   T(s,t,x+0.14,2.2,bw-0.28,0.4,{fontSize:12,bold:true,color:c});
   T(s,b,x+0.14,2.58,bw-0.28,0.72,{fontSize:8.5,color:C.GREY,lineSpacingMultiple:1.04});
   if(i<steps.length-1) T(s,'→',x+bw-0.02,2.35,gap+0.1,0.5,{fontSize:16,bold:true,color:C.CYAN,align:'center'});
   x+=bw+gap; });
 // two example cards
 card(s,0.5,3.85,6.05,2.75,C.CYAN,'aPriori — geometric cost drivers',
   'As aPriori describes it, the tool reads the 3D model, breaks it into individual geometric cost drivers, and builds the cost from the bottom up.\n\nIt can cost from STEP and Parasolid files, which carry no feature history. That suggests it reads the shape itself rather than replaying how the designer built it. Tolerances can be added to drivers to steer the process route.',10.5,10.5);
 card(s,6.75,3.85,6.1,2.75,C.BLUE,'Siemens NX Feature2Cost',
   'As Siemens describes it, commodity modules (moulding, stamping) analyse the geometry and pick out part dimensions, ribs, undercuts, bends and progressive-die features.\n\nThose become cost drivers. The user can correct them, and they pass into Siemens\' own product-costing software.',10.5,10.5);
 T(s,'Source: each vendor\'s public product material and blogs, read July 2026. Not tested hands-on by us.',0.5,6.7,12.35,0.28,{fontSize:8,color:C.DIM,italic:true});
 s.addNotes("This is the mental model for the rest of the deck. Read it left to right. A 3D model comes in. Software finds the features, the holes, pockets, bends, ribs and undercuts. People call this AFR, automatic feature recognition. Each feature maps to a cost driver, like an operation or a tool. A person steps in only to fix a feature that was read wrong. Out comes a cost you can explain line by line. The two cards are how aPriori and Siemens describe their own tools in public. I haven't tested either of them hands-on, so treat this as their account, not mine. The part I find useful is that both keep a person in the loop to correct the recognition. Nobody claims to be fully hands-off. That matches how we work: the tool measures, and when it isn't sure, it asks.");})();

// ════════════════════════════════════ 4 — COMPETITOR MATRIX ════════════════════════════════════
(()=>{const s=header('Capability comparison','The landscape');
 const caps=['B-rep feature\nrecognition','On-model DFM\noverlays','Tolerances from\nCAD → cost','CAD-software\nviewer feel','CAD → cost with\nno retyping','Web /\ninstant'];
 const rows=[
   ['aPriori',            [2,1,1,1,2,1]],
   ['Siemens NX F2C',     [2,1,1,2,2,0]],
   ['3D-Tool (viewer)',   [1,2,0,2,0,1]],
   ['Werk24 (drawings)',  [1,0,2,0,1,2]],
   ['MTI Costimator 3DFX',[2,0,0,1,2,0]],
   ['CostVision — today', [1,2,0,2,2,2]],
   ['CostVision — if roadmap lands',[2,2,2,2,2,2]],
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
   T(s,r[0],x0+0.18,y,labW-0.2,rH,{fontSize:planned?9:10,bold:(planned||today),color:lc,valign:'middle'});
   r[1].forEach((lv,ci)=> disc(s, gridX+ci*colW+colW/2, y+rH/2, lv));
   y+=rH; });
 // legend
 const ly=y+0.18; let lx=x0;
 [['Full',2,C.CYAN],['Partial',1,C.AMBER],['Limited / none',0,C.DIM]].forEach(([t,lv])=>{ disc(s,lx+0.1,ly+0.1,lv);
   T(s,t,lx+0.28,ly-0.03,1.7,0.26,{fontSize:9,color:C.GREY}); lx+= (t.length*0.075)+0.7; });
 T(s,'Other tools: our own read of public material (July 2026), not a hands-on test.  CostVision rows: checked against the code, September 2026.',
   x0,ly+0.4,12.4,0.3,{fontSize:8,color:C.DIM,italic:true});
 s.addNotes("This is the map. Each column is a capability that matters, each row is a tool. A full cyan dot means strong, amber means partial, and hollow means limited or missing. Please take the other rows as my reading of their public material, not a test. The costing leaders are strong on feature recognition and on going from CAD to cost without retyping. The best pure viewer experience comes from 3D-Tool. Werk24 reads tolerances, but from 2D drawings. Now our row. Since July we've filled in on-model analysis and the CAD feel, so those are full now. Feature recognition is only partial. We find holes, bosses, fillets and some pockets, but not chamfers, slots or thread specs. Tolerances from the CAD file is still empty. The bottom row is what we'd have if the roadmap lands. It is a plan, not a promise.");})();

// ════════════════════════════════════ 5 — WHAT MAKES A VIEWER FEEL LIKE CAD ════════════════════════════════════
(()=>{const s=header('What makes a viewer "feel like CAD software"','The experience');
 T(s,'It is not prettier rendering. It is analysis drawn on the model, and room to work. 3D-Tool, a dedicated viewer, is a good example of the idea.',
   0.45,1.95,12.4,0.5,{fontSize:12,color:C.GREY,italic:true,lineSpacingMultiple:1.1});
 const items=[
   [C.CYAN,'Wall-thickness heatmap','Thin and thick areas coloured on the part. It shows moulding and casting risk at a glance. We have this today for STEP and IGES.'],
   [C.BLUE,'Draft & undercut view','Each face shaded by its draft angle to the tool pull direction. Undercuts need slides, and slides cost money. We have this today.'],
   [C.VIOLET,'Section & measure','Cut planes and true measurements: the everyday CAD actions people expect. We have cut planes on X, Y and Z and six measure tools.'],
   [C.GREEN,'Feature / model tree','A list of bodies and features. Click a row and the faces light up. We have this today for STEP and IGES.'],
   [C.AMBER,'Tolerances on the model','Tolerances and notes shown in 3D (PMI: product manufacturing information), tied to the faces they apply to. We do not have this yet.'],
   [C.CYAN,'A big, easy canvas','A large view, an orientation cube and smooth orbit. We have an Expand button, the cube and standard views today.'],
 ];
 const cw=4.03, ch=1.9, gx=0.45, gy=2.55, gap=0.13;
 items.forEach(([c,t,b],i)=>{ const cx=gx+(i%3)*(cw+gap), cy=gy+Math.floor(i/3)*(ch+gap);
   card(s,cx,cy,cw,ch,c,t,b,11.5,10.5); });
 s.addNotes("When people say a viewer feels like CAD software, this is usually what they mean. It isn't about nicer graphics. It's analysis painted on the model. The biggest one is a wall-thickness heatmap. Thin and thick areas show up in colour, and you can see moulding or casting risk straight away. Then draft and undercut. You shade each face by how well it releases from the tool, and undercuts show up in red, because they need slides and slides cost money. Then the everyday actions: cut planes, measuring, and a model tree where clicking a row lights up the faces. Most of these are now in our viewer, and each card says so. The one we don't have is tolerances shown on the model. PMI just means product manufacturing information, the tolerances and notes stored in the CAD file. We can't read those yet.");})();

// ════════════════════════════════════ 6 — WHERE WE STAND TODAY ════════════════════════════════════
(()=>{const s=header('Where CostVision stands today — honestly','Our baseline · checked against the code, September 2026');
 // strengths
 rr(s,0.45,1.95,6.05,4.7,C.SURF,{line:{color:C.BORDER,width:0.75}}); rect(s,0.45,1.95,6.05,0.05,C.GREEN);
 T(s,'In the tool today',0.68,2.1,5.6,0.4,{fontSize:14,bold:true,color:C.GREEN});
 const strong=['STEP/IGES measured by OpenCASCADE; STL by a fast mesh path: volume, weight, size, area',
   'Feature table (STEP/IGES): holes and bosses with diameter and depth; fillets; cautious pockets',
   'Wall thickness by ray-casting, draft and undercut counts, setup count, sheet-metal bends',
   'CNC cycle-time estimate for STEP/IGES, built up from the measured features',
   'Viewer: orientation cube, model tree, X/Y/Z section planes, exploded view, Expand',
   'On-model colour: wall thickness, draft and undercut, and £ per face after a costing',
   'Measure: distance, radius, angle, point, face-to-face; export to CSV',
   'Click a face for its exact type, radius and area; the matching result rows are outlined'];
 let y=2.55; strong.forEach(t=>{ s.addShape('ellipse',{x:0.72,y:y+0.05,w:0.09,h:0.09,fill:{color:C.GREEN},line:{type:'none'}});
   T(s,t,0.92,y-0.04,5.4,0.44,{fontSize:9.7,color:C.GREY,lineSpacingMultiple:1.02}); y+=0.5; });
 // gaps
 rr(s,6.8,1.95,6.05,4.7,C.SURF,{line:{color:C.BORDER,width:0.75}}); rect(s,6.8,1.95,6.05,0.05,C.AMBER);
 T(s,'Still open',7.03,2.1,5.6,0.4,{fontSize:14,bold:true,color:C.AMBER});
 const gaps=[['No tolerances read from the CAD file (STEP AP242 PMI); the engineer types the tightest tolerance','capture'],
   ['STL has no feature table: no cycle time, tree or thickness map; the engineer types the cycle time','capture'],
   ['No chamfer, slot or thread-spec recognition yet','capture'],
   ['The browser shows a mesh; the server turns STEP into triangles (no live B-rep in the browser)','viewer'],
   ['Section planes have no solid caps on the cut','viewer'],
   ['Extrusion has no CAD rules yet (its form still costs it)','other'],
   ['Route or material is asked, not guessed, when geometry cannot decide: by design, but it is typing','other'],
   ['No estimate has yet been compared with a price JLR actually paid','other']];
 y=2.55; gaps.forEach(([t,tag])=>{ const c=tag==='other'?C.CYAN:(tag==='capture'?C.VIOLET:C.AMBER);
   s.addShape('ellipse',{x:7.07,y:y+0.05,w:0.09,h:0.09,fill:{color:c},line:{type:'none'}});
   T(s,t,7.27,y-0.04,5.4,0.5,{fontSize:9.7,color:C.GREY,lineSpacingMultiple:1.02}); y+=0.5; });
 s.addNotes("I want to be straight about where we are, because the rest of the deck depends on it. On the left is what's in the tool today, and I checked each line against the code. The geometry engine is OpenCASCADE, an open-source CAD kernel. It measures the part, finds holes, bosses and fillets, and for STEP files it builds up a machining cycle time. The viewer now has the cube, the model tree, sections, exploded view, and colours for thickness, draft and cost per face. On the right is what's still open. The big ones are capture. We don't read tolerances from the CAD file. STL files have no feature table, so the tool stops and asks you for a cycle time rather than invent one. And there's one gap that matters more than any feature. We have not yet compared an estimate with a price JLR actually paid.");})();

// ════════════════════════════════════ 7 — THE INSIGHT ════════════════════════════════════
(()=>{const s=header('The two ideas behind the plan','Where the leverage is');
 const big=[
   [C.CYAN,'“We measured it —\nnow we show it.”','In July the engine already worked out wall thickness, draft and undercuts, but the viewer never drew them. Now thickness, draft and £ per face are coloured on the model. The data was there; the viewer just uses it.'],
   [C.VIOLET,'“Capture more —\nso people type less.”','Every feature read from the CAD is one less field someone fills in, and one less place for a typing slip. Tolerances, chamfers, slots and threads are next. Until then, the tool asks the engineer.'],
 ];
 let x=0.5; big.forEach(([c,t,b])=>{ rr(s,x,2.05,6.05,3.5,C.SURF2,{line:{color:C.BORDER,width:0.75}});
   rect(s,x,2.05,0.08,3.5,c);
   T(s,t,x+0.3,2.35,5.5,1.4,{fontSize:19,bold:true,color:C.W,lineSpacingMultiple:1.02});
   T(s,b,x+0.3,3.75,5.5,1.6,{fontSize:12,color:C.GREY,lineSpacingMultiple:1.12});
   x+=6.35; });
 rr(s,0.5,5.75,12.35,0.95,'10202E',{line:{color:C.CYAN,width:1}});
 T(s,[{text:'The rule we keep:  ',options:{bold:true,color:C.CYAN}},
   {text:'the viewer is a place to capture and check cost inputs, not decoration. The tool measures and calculates; every £ traces to a rate. AI never sets a price, and runs only once an API key is added.',options:{color:C.GREY}}],
   0.8,5.75,11.7,0.95,{fontSize:11.5,valign:'middle',lineSpacingMultiple:1.08});
 s.addNotes("The whole plan comes down to two ideas. The first one is mostly done. In July the engine was already working out wall thickness, draft and undercuts, and then throwing them away as far as the viewer was concerned. Now they're coloured on the model, along with the cost per face after you run a costing. That was cheap to build because the numbers already existed. The second idea is still ahead of us. Every feature we can read from the CAD file is a field nobody has to type. Tolerances, chamfers, slots and threads are next. Until we can read them, the tool asks the engineer, and I think that's the right default. And the rule at the bottom doesn't change. The viewer is there to capture and check inputs. The tool measures and calculates. AI never sets a price, and runs only once an API key is added.");})();

// ════════════════════════════════════ 8 — TECHNOLOGY TO BUILD ON ════════════════════════════════════
(()=>{const s=header('The technology we could build on','Future options · published and open source');
 const tech=[
   [C.CYAN,'occt-import-js (OpenCASCADE in the browser)','An open-source build of our CAD kernel that runs in a web page (WebAssembly). It opens STEP and IGES directly and links each triangle back to its original face, so a click could select an exact face with no server call.'],
   [C.BLUE,'OpenCASCADE XDE — STEP AP242 PMI','The same kernel has a module that reads tolerances, dimensions and datums stored in STEP AP242 files. That is the route to reading tolerances from the 3D file, not a separate drawing.'],
   [C.VIOLET,'Learned feature recognition (research)','Published research models (UV-Net, BRepGAT, BrepMFR, AAGNet) treat the B-rep as a graph of faces and label machining features face by face. Papers report 98–99% on public benchmarks.'],
   [C.GREEN,'Heatmap methods (textbook)','Wall thickness: cast a ray inward from each face. Draft: angle between the face normal and the pull direction. We already use both, in the engine and on the model.'],
 ];
 const cw=6.05, ch=2.0, gx=0.5, gy=2.0, gap=0.2;
 tech.forEach(([c,t,b],i)=>{ const cx=gx+(i%2)*(cw+gap), cy=gy+Math.floor(i/2)*(ch+gap);
   card(s,cx,cy,cw,ch,c,t,b,12,11); });
 rr(s,0.5,6.38,12.35,0.62,C.SURF,{line:{color:C.AMBER,width:0.75}});
 T(s,[{text:'Honest caveat:  ',options:{bold:true,color:C.AMBER}},
   {text:'the 98–99% figures are research results on clean, synthetic datasets, not our results. Real STEP files are messier, so a person would always check what the model finds.',options:{color:C.GREY}}],
   0.75,6.38,11.9,0.62,{fontSize:10,valign:'middle'});
 s.addNotes("None of the future work needs inventing. It's all published, and most of it is open source. First, occt-import-js. It's the same CAD kernel we run on the server, compiled to run inside a web page. It could open a STEP file in the browser and tie every triangle back to its original face. Second, the kernel has a module that reads tolerances from STEP AP242 files. AP242 is the newer STEP standard that can carry tolerances inside the 3D file. Third, there's academic work on learned feature recognition. Those papers report 98 to 99 percent on public benchmarks. Please don't read that as a number for us. It's research on clean, synthetic parts, and real CAD is messier. So a person would still check the result. Fourth, the heatmap methods are textbook, and we already use them. So this slide is options, not commitments.");})();

// ════════════════════════════════════ 9 — ROADMAP OVERVIEW ════════════════════════════════════
(()=>{const s=header('The build plan — four phases, and where each stands','Roadmap · status September 2026');
 const ph=[
   [C.CYAN,'Phase 0','Quick wins','Bigger viewer, and draw the data we already measured: thickness, draft, model tree, result-to-model links.','Built'],
   [C.BLUE,'Phase 1','CAD-software feel','Orientation cube, exploded view, X/Y/Z sections, richer measuring, £ per face. Solid section caps still to do.','Mostly built'],
   [C.VIOLET,'Phase 2','Deeper capture','Fillets and cautious pockets found today. Chamfers, slots, threads, STL features and tolerances from STEP AP242 still to do.','Partly started'],
   [C.GREEN,'Phase 3','Research track','Browser-side B-rep kernel and learned feature recognition. Not started and not committed.','Future'],
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
 T(s,'Each phase ships on its own. The two things you asked for — a bigger viewer and a CAD-software feel — were Phases 0 and 1, and both are now in the tool.',
   0.5,6.35,12.4,0.5,{fontSize:11,color:C.GREY,italic:true,align:'center'});
 s.addNotes("Here's the plan from July, with where each phase stands today. Phase zero was the quick wins. Make the viewer bigger, and draw the data the engine already measured. That's built. Phase one was the CAD-software feel. The cube, exploded view, sections, better measuring, and colouring the model by cost. That's mostly built. The one piece left is solid caps on a section cut, so a sliced part looks solid rather than hollow. Phase two is deeper capture, and it has only just started. We find fillets, and pockets in a cautious way. Chamfers, slots, thread specs, anything on STL, and tolerances from the file are all still to do. Phase three is research. A CAD kernel in the browser and learned recognition. It's not started and I'm not committing to it. The good news is that both of the things you asked for are now in the tool.");})();

// ════════════════════════════════════ 10 — PHASE 0 ════════════════════════════════════
(()=>{const s=header('Phase 0 — Quick wins','Roadmap · built');
 const rows=[
   ['Bigger viewer','An Expand button fills the window with the model. Esc takes you back to the costing layout.','Built. It fills the browser window; it does not use the operating system\'s full-screen mode.'],
   ['Wall-thickness heatmap','Per-face thickness from the geometry engine, coloured from thin (red) to thick (blue).','Built. STEP and IGES only; an STL has no per-face data.'],
   ['Draft / undercut view','Faces shaded by draft against a chosen pull direction (X, Y or Z). Undercuts show in red.','Built. Works on any file, as it uses the mesh.'],
   ['Model tree','Bodies, features and face types. Click a row and its faces light up; show or hide each body.','Built. STEP and IGES only.'],
   ['Result ↔ model link','Click a face and the matching feature rows in the result are outlined. A warning\'s "show me" button lights up its faces.','Built. Works where the feature has face data (STEP/IGES).'],
 ];
 T(s,'All five quick wins from the July plan are now in the tool. Three of them only needed us to draw data the engine already measured.',
   0.45,1.9,12.4,0.4,{fontSize:11.5,color:C.CYAN,italic:true});
 let y=2.4; rows.forEach(([t,b,ben])=>{ rr(s,0.45,y,12.45,0.86,C.SURF,{line:{color:C.BORDER,width:0.6}});
   rect(s,0.45,y,0.06,0.86,C.CYAN);
   T(s,t,0.66,y+0.1,3.15,0.66,{fontSize:11,bold:true,color:C.W,valign:'middle',lineSpacingMultiple:0.98});
   T(s,b,3.95,y+0.08,5.35,0.72,{fontSize:9.5,color:C.GREY,valign:'middle',lineSpacingMultiple:1.03});
   T(s,ben,9.5,y+0.08,3.25,0.72,{fontSize:9,color:C.GREEN,valign:'middle',italic:true,lineSpacingMultiple:1.03});
   y+=0.92; });
 s.addNotes("Phase zero is done, so this slide is really a checklist. The first ask was a bigger viewer. There's now an Expand button that fills the window, and Esc brings you back. To be precise, it fills the browser window rather than switching the whole screen into full-screen mode. Then the three overlays. Wall thickness coloured red for thin and blue for thick. Draft and undercut against a pull direction you choose. And a model tree where clicking a row lights up the faces. Thickness and the tree need a STEP or IGES file, because an STL is just triangles with no face data. Last, the link between the result and the model. Click a face and the matching rows in the result get outlined. If a warning is about specific faces, its show-me button highlights them. It means you can see where a number came from.");})();

// ════════════════════════════════════ 11 — PHASE 1 ════════════════════════════════════
(()=>{const s=header('Phase 1 — The CAD-software feel','Roadmap · mostly built');
 const items=[
   [C.BLUE,'Orientation cube + views','Built. A cube in the corner: click a face or axis to snap to that view. Home, front, top, right and fit buttons.'],
   [C.BLUE,'Model tree','Built. Bodies, found features and face types, with show and hide for each body.'],
   [C.VIOLET,'Exploded view','Built. Pull a multi-body file apart radially or along X, Y or Z. Each component can also be moved or rotated.'],
   [C.VIOLET,'Section planes','Partly built. Independent cut planes on X, Y and Z. Solid caps on the cut face are still to do.'],
   [C.GREEN,'Richer measuring','Built. Distance (snaps to corners and edges), 3-point radius, angle, X/Y/Z point, face-to-face. Saved per file; export to CSV.'],
   [C.CYAN,'Cost on the model','Built. After a CAD costing, faces are coloured by the £ of the machining lines they carry.'],
 ];
 const cw=4.03, ch=1.95, gx=0.45, gy=2.0, gap=0.13;
 items.forEach(([c,t,b],i)=>{ const cx=gx+(i%3)*(cw+gap), cy=gy+Math.floor(i/3)*(ch+gap);
   card(s,cx,cy,cw,ch,c,t,b,11.5,10.5); });
 rr(s,0.45,6.15,12.45,0.62,'10202E',{line:{color:C.CYAN,width:0.75}});
 T(s,[{text:'Where this leaves us:  ',options:{bold:true,color:C.CYAN}},
   {text:'the viewer is now a place to check the cost, not just a preview. The limits: it shows a mesh, sections have no caps, and tolerances are not read from the file.',options:{color:C.GREY}}],
   0.7,6.15,11.9,0.62,{fontSize:10.5,valign:'middle'});
 s.addNotes("Phase one was about making it feel like CAD software, and most of it is in. The orientation cube is in the corner. Click a face of it and the view snaps round. The model tree lists bodies, features and face types, and you can hide bodies. Exploded view pulls a multi-body file apart, and you can move or rotate each component. Section planes work on all three axes at once. What's missing is a solid cap on the cut, so today a sectioned part looks hollow. Measuring is much richer than in July. Distance that snaps to corners and edges, radius from three points, angle, a coordinate read-out, and face-to-face distance. And after a CAD costing, the model is coloured by how much money sits on each face. So the viewer is now somewhere you check the cost. It's still a mesh, though, and it still can't read tolerances.");})();

// ════════════════════════════════════ 12 — PHASE 2 ════════════════════════════════════
(()=>{const s=header('Phase 2 — Deeper automatic capture','Roadmap · partly started');
 // left: more features
 rr(s,0.45,1.95,6.05,4.7,C.SURF,{line:{color:C.BORDER,width:0.75}}); rect(s,0.45,1.95,6.05,0.05,C.VIOLET);
 T(s,'More features found → cost',0.68,2.12,5.6,0.4,{fontSize:13,bold:true,color:C.VIOLET});
 const fr=['Fillets: found today. Turning them into finishing operations is still to do',
   'Pockets and machined flat faces: found cautiously, and off in the cost until the engineer confirms',
   'Chamfers, slots and thread specs (pitch and class): still to do',
   'Rib count on mouldings to drive tool complexity: still to do',
   'Machined vs as-cast faces: still to do. Today a guard caps machining time on near-net parts',
   'STL features: still to do. Today the tool stops and asks for a cycle time'];
 let y=2.6; fr.forEach(t=>{ s.addShape('ellipse',{x:0.72,y:y+0.06,w:0.09,h:0.09,fill:{color:C.VIOLET},line:{type:'none'}});
   T(s,t,0.92,y-0.02,5.4,0.56,{fontSize:10,color:C.GREY,lineSpacingMultiple:1.05}); y+=0.63; });
 // right: PMI / tolerance-driven costing
 rr(s,6.8,1.95,6.05,4.7,C.SURF,{line:{color:C.BORDER,width:0.75}}); rect(s,6.8,1.95,6.05,0.05,C.AMBER);
 T(s,'Tolerance-driven costing (future)',7.03,2.12,5.6,0.4,{fontSize:13,bold:true,color:C.AMBER});
 T(s,'Not built. The idea: read tolerances (GD&T: geometric dimensioning and tolerancing) from STEP AP242 files, and map them to process and inspection. Today the engineer types the tightest tolerance, and it scales the machining time.',
   7.03,2.55,5.6,1.0,{fontSize:10,color:C.GREY,lineSpacingMultiple:1.08});
 const tol=[['Tight bore tolerance','→ ream / hone / grind added'],
   ['Fine surface finish (Ra)','→ extra finishing operation'],
   ['Flatness / position GD&T','→ inspection + fixturing cost'],
   ['Loose general tolerance','→ cheaper route, faster cycle']];
 y=3.7; tol.forEach(([a,b])=>{ rr(s,7.03,y,5.6,0.6,C.SURF2,{line:{color:C.BORDER,width:0.5}});
   T(s,a,7.2,y,2.7,0.6,{fontSize:9.5,bold:true,color:C.W,valign:'middle'});
   T(s,b,9.9,y,2.6,0.6,{fontSize:9.5,color:C.AMBER,valign:'middle'}); y+=0.7; });
 s.addNotes("Phase two is about capturing more so people type less, and it has only just started. On the left, the engine now finds fillets. It also finds pockets and machined flat faces, but cautiously. They're switched off in the cost until the engineer confirms them, because a wrong pocket adds cost that isn't real. Chamfers, slots, thread specs and rib counts are still to do. So is the STL path. Today, if you upload an STL for a machined part, the tool stops and asks you for a cycle time rather than making one up. On the right is tolerance-driven costing, and this is future work. GD&T means geometric dimensioning and tolerancing. The idea is to read it from the STEP file and let a tight bore add a reaming or grinding step. Today the engineer types the tightest tolerance on the form, and that scales the machining time.");})();

// ════════════════════════════════════ 13 — PHASE 3 ════════════════════════════════════
(()=>{const s=header('Phase 3 — Research track','Roadmap · future, not started');
 card(s,0.5,2.05,6.05,3.05,C.CYAN,'CAD kernel in the browser (occt-import-js)',
   'Open STEP and IGES directly in the browser and keep the real B-rep, not a mesh made on the server. That would allow exact face measurement, faster loading, and face picking with no server call.\n\nWhat it would change: every face becomes an exact object you can click and cost, even before the server replies.',12,11);
 card(s,6.75,2.05,6.1,3.05,C.VIOLET,'Learned feature recognition',
   'Add a research-style model (the UV-Net / BRepGAT family) that labels machining features face by face. It could pick up compound features our current rules miss.\n\nWhat it would change: better recall on complex parts, and every label is still a face a person can check. Only worth it if it holds up on real JLR parts.',12,11);
 rr(s,0.5,5.35,12.35,1.35,C.SURF,{line:{color:C.BORDER,width:0.75}}); rect(s,0.5,5.35,0.08,1.35,C.AMBER);
 T(s,'Why this comes last',0.78,5.5,11.8,0.35,{fontSize:12,bold:true,color:C.AMBER});
 T(s,'It is the most effort, and the published accuracy comes from synthetic test data. It only makes sense once Phase 2 is done and we have real JLR parts to test it on. A learned model would only label features. The cost would still be plain arithmetic, and at JLR any AI would need approval first.',
   0.78,5.86,11.9,0.78,{fontSize:10.5,color:C.GREY,lineSpacingMultiple:1.1});
 s.addNotes("Phase three is research, and I've put it last on purpose. None of it is started. The first idea is to run the CAD kernel inside the browser, so the viewer holds the real faces rather than a mesh the server made. That would make measuring exact and picking a face instant. The second is a learned model that labels machining features face by face. It might catch compound features our rules miss. But I want to be careful here. The accuracy figures in the papers come from clean, synthetic parts. We'd only know whether it helps by testing it on real JLR parts. And it would only ever label features. The money would still be plain arithmetic on rates. At JLR, anything like this would also need AI approval, which we don't have. So this stays a research track until Phase two is done.");})();

// ════════════════════════════════════ 14 — THE TWO ASKS, SPECCED ════════════════════════════════════
(()=>{const s=header('Your two asks — where they stand','What you asked for, checked against the tool');
 // ask 1
 rr(s,0.45,1.95,6.05,4.75,C.SURF2,{line:{color:C.CYAN,width:1}}); rect(s,0.45,1.95,6.05,0.05,C.CYAN);
 T(s,'1 · Make the 3D viewer bigger',0.7,2.12,5.6,0.4,{fontSize:15,bold:true,color:C.CYAN});
 const a1=['Built: Expand button fills the window with the viewer',
   'Built: Esc returns to the costing layout',
   'Built: the tools bar can be hidden to give the model room',
   'Built: toolbar groups can be dragged into your own order',
   'Built: the model-tree panel can be resized',
   'Not yet: true operating-system full-screen mode'];
 let y=2.62; a1.forEach(t=>{ s.addShape('ellipse',{x:0.72,y:y+0.06,w:0.09,h:0.09,fill:{color:C.CYAN},line:{type:'none'}});
   T(s,t,0.92,y-0.02,5.4,0.5,{fontSize:10.3,color:C.GREY,lineSpacingMultiple:1.04}); y+=0.62; });
 // ask 2
 rr(s,6.8,1.95,6.05,4.75,C.SURF2,{line:{color:C.BLUE,width:1}}); rect(s,6.8,1.95,6.05,0.05,C.BLUE);
 T(s,'2 · A CAD-software feel',7.05,2.12,5.6,0.4,{fontSize:15,bold:true,color:C.BLUE});
 const a2=['Built: orientation cube and standard views',
   'Built: model tree; click a row and its faces light up',
   'Built: thickness, draft and undercut colours on the model',
   'Built: X/Y/Z sections and exploded view (no solid caps yet)',
   'Built: radius, angle, point and face-to-face measuring',
   'Built: £ per face after a CAD costing'];
 y=2.62; a2.forEach(t=>{ s.addShape('ellipse',{x:7.07,y:y+0.06,w:0.09,h:0.09,fill:{color:C.BLUE},line:{type:'none'}});
   T(s,t,7.27,y-0.02,5.4,0.5,{fontSize:10.3,color:C.GREY,lineSpacingMultiple:1.04}); y+=0.62; });
 s.addNotes("This slide takes the two things you asked for and checks them against the tool as it is today. On the left, the bigger viewer. There's an Expand button, Esc brings you back, you can hide the tools bar, drag the toolbar groups into your own order, and resize the model tree. The one thing I'd call not done is true full-screen mode. Today it fills the browser window, which in practice is most of the screen. On the right, the CAD feel. The cube, the model tree, the colour overlays, sections and exploded view, the measuring tools, and cost per face are all in. The honest footnote is the section caps, and that most of the richer features need a STEP or IGES file rather than an STL. So both asks are met. The remaining work is about capture, not the viewer.");})();

// ════════════════════════════════════ 15 — BENEFITS + RECOMMENDATION ════════════════════════════════════
(()=>{const s=header('Why it matters, and what I recommend next','Benefits and next steps');
 const ben=[
   [C.GREEN,'Less typing','Each feature read from the CAD is a field nobody types. Where geometry cannot decide, the tool asks.'],
   [C.CYAN,'Fewer slips','A measured value cannot be mistyped. Every input traces back to the geometry or a rate.'],
   [C.BLUE,'Design issues seen early','Thin walls, zero draft and undercuts show on the model while a change is still cheap.'],
   [C.VIOLET,'Easier to explain','Click a face to see what was measured, and where the money sits. The model backs up the number.'],
   [C.AMBER,'Tolerance-aware cost (future)','Reading GD&T from the file would price precision parts from the model itself. Not built yet.'],
   [C.GREEN,'Still traceable','The tool measures and calculates. AI never sets a price, and runs only once an API key is added.'],
 ];
 const cw=4.03, ch=1.55, gx=0.45, gy=1.95, gap=0.13;
 ben.forEach(([c,t,b],i)=>{ const cx=gx+(i%3)*(cw+gap), cy=gy+Math.floor(i/3)*(ch+gap);
   card(s,cx,cy,cw,ch,c,t,b,11.5,10.5); });
 rr(s,0.45,5.35,12.45,1.4,'10202E',{line:{color:C.GREEN,width:1}}); rect(s,0.45,5.35,0.08,1.4,C.GREEN);
 T(s,'Recommendation',0.75,5.5,4,0.35,{fontSize:13,bold:true,color:C.GREEN});
 T(s,[{text:'Use what is built on real JLR parts, and log actual prices',options:{bold:true,color:C.W}},
   {text:' so we learn how close the estimates are. Next build: solid section caps, then chamfer, slot and thread recognition, and a better STL path. Tolerances from STEP AP242 after that. Phase 3 stays a research track.',options:{color:C.GREY}}],
   0.75,5.88,11.9,0.8,{fontSize:11,valign:'top',lineSpacingMultiple:1.12});
 s.addNotes("Let me finish on why this matters and what I'd do next. The benefits are simple. Every feature we read from the model is a field nobody types, and a measured value can't be mistyped. Thin walls and undercuts show up while a design change is still cheap. And when someone asks where a number came from, you can click the face and show them. I haven't put a time saving or an accuracy figure on any of this, because we haven't measured one. That's the first part of my recommendation. Use what's built on real JLR parts, and log the actual prices you pay, so we find out how close the estimates really are. Then the next build: section caps, chamfers, slots and threads, and a better answer for STL files. Tolerances from the STEP file after that. Phase three stays research until we have a reason to start it.");})();

// ════════════════════ 16 — Auto-capture → Cost engine ════════════════════
(()=>{ const s=header('What the Tool Measures — and Where It Goes','CAD-to-Cost · measured, then rules · STEP, IGES or STL');
  const rows=[
    ['Volume (exact, from the solid)','Material mass · stock size'],
    ['Weight = volume × density','Material cost'],
    ['Bounding box / envelope','Machine size · stock · setups'],
    ['Body count','Flags an assembly, not one part'],
    ['Hole & boss table (Ø, depth)','Drill, bore and tap operations'],
    ['Wall thickness','Route choice · mould & cast checks'],
    ['Draft & undercuts','Tooling complexity (side actions)'],
    ['Surface area','Area-driven operations'],
    ['CNC cycle & setups (STEP/IGES)','Machining time baseline'],
  ];
  const lx=0.45, lw=7.4, cx=lx+4.15; let y=1.95;
  rr(s,lx,y,lw,0.4,C.SURF2,{line:{color:C.BORDER,width:0.75}});
  T(s,'Measured from the geometry',lx+0.15,y+0.07,3.95,0.28,{fontSize:9.5,bold:true,color:C.W});
  T(s,'→ Feeds this cost input',cx+0.1,y+0.07,lw-4.25,0.28,{fontSize:9.5,bold:true,color:C.CYAN});
  y+=0.46;
  for(const [a,b] of rows){
    rr(s,lx,y,lw,0.42,C.SURF,{line:{color:C.BORDER,width:0.5}});
    T(s,a,lx+0.15,y+0.09,3.95,0.28,{fontSize:9.5,bold:true,color:C.BLUE});
    T(s,b,cx+0.1,y+0.09,lw-4.25,0.28,{fontSize:9.5,color:C.GREY});
    y+=0.46;
  }
  card(s,8.05,1.95,4.85,2.75,C.BLUE,'When the geometry cannot decide',
    'The rules ask the engineer instead of guessing: the process route, the material family, a hole count on an STL.\n\nThick-walled parts (walls over about 6 mm) are offered casting, forging, cast + machine or machining.\n\nAn STL has no feature table, so a machined STL waits until the engineer types a cycle time.\n\nSheet metal: upload a DXF flat pattern with the STEP, and the measured blank replaces the bounding box.',11,9.3);
  card(s,8.05,4.85,4.85,1.65,C.GREEN,'The golden rule',
    'AI never sets a price, and runs only once an API key is added. The CAD path runs on measured geometry and rules, for 13 commodities. Every £ is plain arithmetic, traceable to a rate.',11,9.5);
  s.addNotes("This slide answers the practical question. What does the tool measure on its own, and where does each number go? You can upload STEP, IGES or STL. On the left is what the geometry engine measures, with nothing typed. On the right is the cost input it feeds. Volume and weight give material cost. The bounding box sizes the machine and the stock. The hole table becomes drilling and tapping. Wall thickness helps pick the route, and draft and undercuts drive tooling. For STEP and IGES there's also a machining cycle estimate. The box on the right is the part I like most. When the geometry can't decide, the tool asks you. An STL has no feature table, so it waits for you to type a cycle time. For sheet metal you can add a DXF flat pattern, and the measured blank is used. Thirteen commodities work this way, with no AI.");})();

const OUT='/home/user/leamington-marathi/CostVision-3D-CAD-Viewer-Study-and-Roadmap.pptx';
p.writeFile({fileName:OUT}).then(f=>console.log('wrote',f));
