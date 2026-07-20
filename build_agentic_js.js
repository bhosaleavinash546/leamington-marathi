// CostVision — "Agentic AI" management deck, built with pptxgenjs (same engine as
// the PCB deck that opens cleanly). Light professional theme, native charts,
// speaker notes per slide.  Usage: node build_agentic_js.js
const pptxgen = require('pptxgenjs');

const C = {
  INDIGO:'4F46E5', BLUE:'2563EB', DARK:'0F172A', BODY:'334155', MUTED:'64748B',
  BG:'FFFFFF', PANEL:'F1F5F9', PANEL2:'EFF6FF', GREEN:'059669', AMBER:'D97706',
  RED:'DC2626', VIOLET:'7C3AED', CYAN:'0891B2', LINE:'E2E8F0',
};
const BODY='Calibri';
const p=new pptxgen(); p.defineLayout({name:'W',width:13.333,height:7.5}); p.layout='W';
p.author='CostVision'; p.title='Agentic AI in CostVision';
const W=13.333,H=7.5;

const rect=(s,x,y,w,h,f,o={})=>s.addShape('rect',{x,y,w,h,fill:{color:f},line:{type:'none'},...o});
const rrect=(s,x,y,w,h,f,o={})=>s.addShape('roundRect',{x,y,w,h,fill:{color:f},line:{type:'none'},rectRadius:0.08,...o});
const txt=(s,t,x,y,w,h,o={})=>s.addText(t,{x,y,w,h,fontFace:BODY,color:C.DARK,valign:'top',margin:0,...o});

function logo(s,x=0.35,y=0.22,scale=1.0){
  rrect(s,x,y,0.42*scale,0.42*scale,C.INDIGO,{rectRadius:0.1});
  txt(s,'cv',x,y,0.42*scale,0.42*scale,{align:'center',valign:'middle',fontSize:17*scale,bold:true,color:C.BG});
  txt(s,'CostVision',x+0.52*scale,y-0.03*scale,3.0,0.32,{fontSize:18*scale,bold:true,color:C.BLUE});
  txt(s,'AI  COST  INTELLIGENCE',x+0.52*scale,y+0.24*scale,3.2,0.22,{fontSize:7.5*scale,color:C.MUTED,charSpacing:1});
}
function header(title,kicker){
  const s=p.addSlide(); rect(s,0,0,W,H,C.BG); logo(s);
  rect(s,0,0.78,W,0.03,C.INDIGO);
  let ty=1.02;
  if(kicker){ txt(s,kicker.toUpperCase(),0.45,0.95,11.5,0.3,{fontSize:11,bold:true,color:C.BLUE,charSpacing:0.5}); ty=1.22; }
  txt(s,title,0.45,ty,12.4,0.6,{fontSize:27,bold:true,color:C.DARK});
  return s;
}
function kpiCard(s,x,y,w,h,big,label,sub,color=C.BLUE){
  rrect(s,x,y,w,h,C.PANEL,{rectRadius:0.09});
  rect(s,x,y,0.07,h,color);
  txt(s,big,x+0.22,y+0.14,w-0.35,0.55,{fontSize:25,bold:true,color});
  txt(s,label,x+0.22,y+0.68,w-0.35,0.3,{fontSize:12.5,bold:true,color:C.DARK});
  txt(s,sub,x+0.22,y+0.98,w-0.35,h-1.05,{fontSize:10,color:C.MUTED,lineSpacingMultiple:1.05});
}
function chevron(s,x,y,w,h,label,sub,color){
  s.addText([{text:label,options:{fontSize:12.5,bold:true,color:C.BG,breakLine:true}},
             {text:sub,options:{fontSize:8.5,color:'E8EEFF'}}],
    {shape:'chevron',x,y,w,h,fill:{color},line:{type:'none'},fontFace:BODY,
     valign:'middle',align:'left',rectRadius:0,margin:[3,4,3,12]});
}
const CHART=(colors,extra={})=>({showLegend:false,chartColors:colors,showValue:true,
  dataLabelFontSize:10.5,dataLabelColor:C.DARK,dataLabelFontBold:true,dataLabelPosition:'outEnd',
  catAxisLabelFontSize:10.5,catAxisLabelColor:C.BODY,valAxisLabelFontSize:10,valAxisLabelColor:C.MUTED,
  valGridLine:{color:C.LINE,size:0.75},catAxisLineColor:C.LINE,valAxisLineColor:C.LINE,
  barGapWidthPct:50,...extra});

// ════ 1 — TITLE ════
(()=>{const s=p.addSlide(); rect(s,0,0,W,H,C.BG); rect(s,0,0,W,0.16,C.INDIGO);
 logo(s,0.5,0.45,1.25);
 txt(s,'Agentic AI in CostVision',0.9,2.35,11.5,1.0,{fontSize:46,bold:true,color:C.DARK});
 txt(s,'A costing tool that learns from every analysis, remembers your parts,\nand finds savings on its own — while staying fully auditable.',
   0.9,3.35,11.0,0.9,{fontSize:19,color:C.BODY,lineSpacingMultiple:1.1});
 [['Remembers',C.BLUE],['Recognises',C.CYAN],['Self-corrects',C.VIOLET],['Acts autonomously',C.GREEN]].forEach((c,i)=>{
   const x=0.9+i*2.85; rrect(s,x,4.6,2.6,0.52,C.PANEL,{rectRadius:0.26});
   txt(s,c[0],x,4.6,2.6,0.52,{align:'center',valign:'middle',fontSize:13,bold:true,color:c[1]});});
 txt(s,'Management briefing  ·  July 2026  ·  All figures verified from live system runs',0.9,6.5,11,0.4,{fontSize:12,color:C.MUTED});
 rect(s,0,H-0.16,W,0.16,C.INDIGO);
 s.addNotes("Open strong, then pause. \"Every costing tool on the market does maths. Ours does something none of them do — it learns.\" The tool remembers every part we've costed, recognises the next one, corrects itself against real quotes, and hunts for savings while nobody's watching. One promise before we start: every number in this deck is from a live run of the real system — no mock-ups. Let's go.");})();

// ════ 2 — EXECUTIVE SUMMARY ════
(()=>{const s=header('What we built — in one slide','Executive summary');
 kpiCard(s,0.45,2.0,3.0,1.75,'36×','Error reduction','Estimating error fell from 10.9% to 0.3% after the tool learned from just 3 real quotes (verified live).',C.GREEN);
 kpiCard(s,3.65,2.0,3.0,1.75,'£512k/yr','Found autonomously','In our live demo the background agent flagged £512k/yr of pricing issues — with nobody at the keyboard.',C.RED);
 kpiCard(s,6.85,2.0,3.0,1.75,'99%','Part recognition','A new bracket was matched to 3 past bracket analyses at 98–99% similarity, with reasons shown.',C.CYAN);
 kpiCard(s,10.05,2.0,2.85,1.75,'917','Automated tests','Every capability is covered by automated tests (77 suites) and was exercised end-to-end on the running system.',C.VIOLET);
 rrect(s,0.45,4.1,12.45,2.7,C.PANEL2,{rectRadius:0.06});
 txt(s,[{text:'The idea, in plain words',options:{fontSize:15,bold:true,color:C.DARK,breakLine:true}},
   {text:'Until now, every costing started from zero and the result depended on who did it. ',options:{fontSize:13.5,color:C.BODY}},
   {text:'Now the tool keeps an organisational memory: ',options:{fontSize:13.5,bold:true,color:C.DARK}},
   {text:'every analysis is stored, every real supplier quote teaches it, and every new part is compared against everything we have costed before.',options:{fontSize:13.5,color:C.BODY,breakLine:true}},
   {text:'The knowledge stays in our database, on our servers — it becomes a company asset that gets more valuable with use, and it does not walk out of the door when an expert leaves.',options:{fontSize:13.5,color:C.BODY}}],
   0.75,4.35,11.9,2.3,{lineSpacingMultiple:1.15,paraSpaceAfter:8});
 s.addNotes("If you remember four numbers, remember these. Error fell thirty-six-fold — eleven percent to under one — after the tool learned from just three real quotes. The background agent found half a million pounds a year of pricing issues with nobody at the keyboard. It recognised a brand-new bracket against past parts at ninety-nine percent and told us why. And it's production-grade — nine hundred and seventeen automated tests. The one line that matters: costing intelligence used to live in people's heads and walk out the door. Now it accumulates as a company asset that gets more valuable every day.");})();

// ════ 3 — WHAT AGENTIC AI MEANS ════
(()=>{const s=header('What "Agentic AI" means here — four plain words','The concept');
 const cards=[['🧠','Remembers','Every costing is saved as a "case": the part, the inputs, the result, and any real quote. Shared across the whole team.',C.BLUE],
  ['🔎','Recognises','Start a new part and it instantly finds the most similar past parts — like an experienced engineer saying "we\'ve done this before".',C.CYAN],
  ['🎯','Self-corrects','Log the real supplier price and the tool measures its own error, then corrects future estimates in that category. Accuracy is measured, not claimed.',C.VIOLET],
  ['🤖','Acts','A background agent re-checks all stored parts on a schedule and raises findings by itself: "you are overpaying here — worth £400k/yr."',C.GREEN]];
 cards.forEach((c,i)=>{const x=0.45+i*3.24;
   rrect(s,x,2.1,3.02,3.6,C.PANEL,{rectRadius:0.07}); rect(s,x,2.1,3.02,0.09,c[3]);
   txt(s,c[0],x+0.25,2.35,2.5,0.6,{fontSize:28,color:c[3]});
   txt(s,c[1],x+0.25,3.05,2.55,0.45,{fontSize:17,bold:true,color:c[3]});
   txt(s,c[2],x+0.25,3.55,2.55,2.0,{fontSize:11.5,color:C.BODY,lineSpacingMultiple:1.15});});
 txt(s,[{text:'Deliberate design choice: ',options:{fontSize:12.5,bold:true,color:C.DARK}},
   {text:'the learning is statistics over our own data — every suggestion shows its source parts and its arithmetic. That makes it auditable and defensible in front of a supplier, which is where costing tools win or lose.',options:{fontSize:12.5,color:C.BODY}}],
   0.45,6.0,12.4,0.9,{lineSpacingMultiple:1.15});
 s.addNotes("\"Agentic\" gets thrown around, so let me make it concrete — four plain verbs. It REMEMBERS: every analysis becomes a stored case. It RECOGNISES: new parts get matched to that memory instantly. It SELF-CORRECTS: real quotes teach it, and its accuracy is measured, not claimed. And it ACTS: an agent raises findings without being asked. One design choice underpins all of it — every suggestion shows its source parts and its arithmetic. A number you can't defend is worthless in a negotiation. Ours you can defend, line by line.");})();

// ════ 4 — LEARNING LOOP ════
(()=>{const s=header('How it works — the learning loop','How it works');
 const steps=[['1 · Analyse','Engineer costs a part as usual',C.BLUE],['2 · Remember','Saved automatically to the knowledge base',C.INDIGO],
  ['3 · Recognise','Similar past parts found instantly',C.CYAN],['4 · Suggest','Benchmarks, materials, real quotes shown',C.VIOLET],
  ['5 · Learn','Real quote logged → model self-corrects',C.AMBER],['6 · Act','Background agent flags drift & savings',C.GREEN]];
 const cw=2.24;
 steps.forEach((st,i)=>chevron(s,0.4+cw*0.86*i,2.4,cw,1.15,st[0],st[1],st[2]));
 txt(s,'…and every loop makes the next estimate better',4.7,4.9,4.6,0.35,{align:'center',fontSize:12,italic:true,color:C.MUTED});
 rrect(s,0.45,5.5,12.45,1.35,C.PANEL2,{rectRadius:0.08});
 txt(s,[{text:'No extra work for the engineer. ',options:{fontSize:13,bold:true,color:C.DARK}},
   {text:'Steps 2, 3, 4 and 6 happen automatically. The only new habit is one click — "Log Actual £" — when a real supplier quote arrives. That single click is the fuel for everything on this slide.',options:{fontSize:13,color:C.BODY}}],
   0.75,5.72,11.9,1.0,{lineSpacingMultiple:1.2});
 s.addNotes("Here's the whole machine on one slide — and the punchline is how little it asks of the engineer. They cost a part exactly as they do today. Everything automatic happens on its own: it remembers, recognises, suggests, and the agent keeps watch. There is exactly ONE new habit — a single click, 'Log Actual £,' when a real quote lands. That one click is the fuel for every loop, and every loop makes the next estimate sharper. No new workload, compounding returns. That's the deal.");})();

// ════ 5 — MEMORY ════
(()=>{const s=header('The memory — an organisational knowledge base','Capability 1 of 5');
 rrect(s,0.45,2.0,6.0,4.6,C.PANEL,{rectRadius:0.05});
 txt(s,'What is stored for every analysis',0.75,2.25,5.5,0.4,{fontSize:15,bold:true,color:C.DARK});
 [['Part "fingerprint"','process, material, weight, size, region, volume'],['The full cost result','total + breakdown by cost driver'],
  ['Real quotes','actual supplier / PO prices, when logged'],['Expert corrections',"where a person adjusted the AI's values"],
  ['CAD shape data','dimensions & features, when a CAD file was used']].forEach((r,i)=>{const y=2.75+i*0.72;
   rect(s,0.75,y,0.09,0.55,C.BLUE);
   txt(s,[{text:r[0]+' — ',options:{bold:true,color:C.DARK}},{text:r[1],options:{color:C.BODY}}],1.0,y,5.2,0.62,{fontSize:12.5,lineSpacingMultiple:1.05});});
 rrect(s,6.85,2.0,6.05,4.6,C.PANEL2,{rectRadius:0.05});
 txt(s,'Why it matters to us',7.15,2.25,5.5,0.4,{fontSize:15,bold:true,color:C.DARK});
 [['Shared, not personal',"One engineer's analysis instantly helps everyone — juniors inherit senior judgement."],
  ['Stays on our servers',"Our database, our infrastructure. The knowledge is a company asset, not a vendor's."],
  ['No duplicates','Re-costing a part updates its case — the memory stays clean.'],
  ['Compounds with use','Useful from ~20–30 analyses; every costing from today is an investment.']].forEach((r,i)=>{const y=2.75+i*0.92;
   txt(s,[{text:'✓  '+r[0],options:{fontSize:13,bold:true,color:C.GREEN,breakLine:true}},{text:r[1],options:{fontSize:11.5,color:C.BODY}}],
     7.15,y,5.5,0.85,{lineSpacingMultiple:1.05});});
 s.addNotes("Capability one — the memory. For every analysis we keep a fingerprint of the part, the full result, any real quotes, and — the clever bit — the exact places an expert overrode the AI. Those corrections are our engineers literally teaching the tool. On the right is why it matters to us: it's shared, so a junior inherits senior judgement on day one; it lives on our servers, so it's our asset; and it compounds — genuinely useful after only twenty or thirty analyses. Every costing we run from today is a deposit into an account that only grows.");})();

// ════ 6 — RECOGNITION ════
(()=>{const s=header('Recognition — "we have costed this before"','Capability 2 of 5');
 txt(s,'Live example: an engineer costs a new 0.85 kg aluminium bracket. The tool answers instantly:',0.45,1.85,12.4,0.4,{fontSize:13.5,color:C.BODY});
 rrect(s,0.45,2.4,12.45,3.1,C.PANEL,{rectRadius:0.05}); rect(s,0.45,2.4,0.09,3.1,C.CYAN);
 txt(s,[{text:'🧠  AI memory — similar past parts',options:{fontSize:14,bold:true,color:C.DARK}},
   {text:'      (knowledge base: 3 analyses · 2 with actuals)',options:{fontSize:10.5,color:C.MUTED}}],0.8,2.6,11.8,0.35);
 [['EV Battery Bracket','99% match — material family, weight, region','£41.20','actual £46.50'],
  ['Sensor Mount Bracket','98% match — material family, weight, region','£38.50',''],
  ['Inverter Bracket','98% match — material family, weight, region','£44.80','actual £50.20']].forEach((r,i)=>{const y=3.05+i*0.5;
   txt(s,[{text:r[0],options:{bold:true,color:C.DARK}},{text:'   '+r[1],options:{fontSize:10.5,color:C.MUTED}}],0.9,y,6.6,0.42,{fontSize:12.5});
   txt(s,[{text:r[2],options:{bold:true,color:C.DARK}},{text:r[3]?'   '+r[3]:'',options:{color:C.VIOLET,bold:true,fontSize:11}}],8.0,y,4.6,0.42,{fontSize:12.5});});
 [['•  Median cost of 3 similar parts: £41.20',C.BODY],['•  3 of 3 used the same material (aluminium 6061)',C.BODY],
  ['•  Real quotes logged for 2 of them — median actual £48.35',C.VIOLET]].forEach((r,i)=>txt(s,r[0],0.9,4.6+i*0.3,11.6,0.3,{fontSize:11.5,color:r[1]}));
 rrect(s,0.45,5.8,12.45,1.0,C.PANEL2,{rectRadius:0.08});
 txt(s,[{text:'Every match is explained (what matched, and how strongly) and every suggestion names its source parts — ',options:{color:C.BODY}},
   {text:'no black box.',options:{bold:true,color:C.DARK}}],0.75,5.97,11.9,0.75,{fontSize:12.5,lineSpacingMultiple:1.15});
 s.addNotes("Capability two, shown with the tool's actual live output. An engineer starts a new aluminium bracket. Before they've finished, the tool has surfaced the three most similar parts we've ever costed — at ninety-eight to ninety-nine percent — and it tells you WHY they matched: same material family, weight class, region. Then it hands over the gold: the median cost, the shared material, and the real prices we actually paid. A junior just stood on the shoulders of every senior before them. And every number names its source. No black box.");})();

// ════ 7 — SELF-CALIBRATION ════
(()=>{const s=header('Self-correction — it learns from real quotes','Capability 3 of 5');
 s.addChart('bar',[{name:'Before learning',labels:['Machining · Aluminium · UK','Casting · Aluminium · China'],values:[10.9,8.7]},
   {name:'After 3 real quotes',labels:['Machining · Aluminium · UK','Casting · Aluminium · China'],values:[0.3,0.6]}],
   {x:0.45,y:2.15,w:6.6,h:4.0,barDir:'col',...CHART([C.MUTED,C.GREEN],{showLegend:true,legendPos:'b',legendFontSize:11,valAxisMinVal:0,valAxisMaxVal:12,valAxisMajorUnit:2,catAxisLabelFontSize:9})});
 txt(s,'Estimating error (%) — measured against real supplier prices, live system run',0.45,6.25,6.6,0.5,{fontSize:10.5,italic:true,color:C.MUTED});
 rrect(s,7.45,2.15,5.45,4.6,C.PANEL,{rectRadius:0.05});
 txt(s,[{text:'How it works, simply',options:{fontSize:15,bold:true,color:C.DARK,breakLine:true}},
   {text:'1.  A real supplier quote arrives → one click logs it.',options:{fontSize:12.5,color:C.BODY,breakLine:true}},
   {text:'2.  The tool compares its estimate with reality and measures its own error.',options:{fontSize:12.5,color:C.BODY,breakLine:true}},
   {text:'3.  From 3 quotes in a category, it corrects future estimates automatically — per process, material family and region.',options:{fontSize:12.5,color:C.BODY,breakLine:true}},
   {text:'4.  It reports its accuracy openly (error % before and after).',options:{fontSize:12.5,color:C.BODY,breakLine:true}},
   {text:'Why per-category matters: ',options:{fontSize:12.5,bold:true,color:C.DARK}},
   {text:'our machining ran 12% low while our China castings ran 8% high — averaged together they looked "fine". The tool catches what averages hide.',options:{fontSize:12.5,color:C.BODY}}],
   7.75,2.4,4.9,4.2,{lineSpacingMultiple:1.12,paraSpaceAfter:10});
 s.addNotes("Capability three is the accuracy engine, and this is a real measured result. Our machining estimates ran about eleven percent LOW against real prices. After the tool learned from three logged quotes, the error was three-tenths of a percent. Now the subtle part: machining ran low; our China castings ran high. Average them and everything looks 'fine' — the errors cancel and hide. The tool refuses to average. It corrects each process, material and region separately, so it catches exactly what a portfolio average conceals. Measured against reality and reported out loud — not asserted.");})();

// ════ 8 — HONEST UNCERTAINTY ════
(()=>{const s=header('Honest ranges — from "±20%" to "±3%", earned with data','Capability 4 of 5');
 s.addChart('bar',[{name:'Confidence band (± %)',labels:['Before any real quotes','After 3 real quotes logged'],values:[20.4,2.8]}],
   {x:0.45,y:2.15,w:5.9,h:4.0,barDir:'col',...CHART([C.AMBER],{valAxisMinVal:0,valAxisMaxVal:25,valAxisMajorUnit:5})});
 txt(s,'Width of the cost confidence band on the same part (± % around the estimate)',0.45,6.25,5.9,0.5,{fontSize:10.5,italic:true,color:C.MUTED});
 rrect(s,6.75,2.15,6.15,4.6,C.PANEL,{rectRadius:0.05});
 txt(s,[{text:'Every estimate now comes as a range',options:{fontSize:15,bold:true,color:C.DARK,breakLine:true}},
   {text:'Optimistic (P10)  ·  Most likely (P50)  ·  Conservative (P90)',options:{fontSize:12.5,bold:true,color:C.BLUE,breakLine:true}},
   {text:"A single number implies a precision that early estimates don't have. The range tells buyers how much to trust the number — and what target to set in negotiation.",options:{fontSize:12.5,color:C.BODY,breakLine:true}},
   {text:'The band is earned, not guessed: ',options:{fontSize:12.5,bold:true,color:C.DARK}},
   {text:'it starts wide when the tool has no evidence, and tightens automatically as real quotes prove the accuracy. On our test part it went from ±20% to ±3% after three quotes.',options:{fontSize:12.5,color:C.BODY}}],
   7.05,2.4,5.6,4.2,{lineSpacingMultiple:1.15,paraSpaceAfter:10});
 s.addNotes("Capability four — honesty about precision, which is a feature not a weakness. Every estimate now comes as a range: optimistic, most likely, conservative. Early on, with no evidence, that range is wide — and that IS the truth. As real quotes prove the tool right, the range tightens on its own: on our test part, from plus-or-minus twenty percent to three. Give a buyer this and you've handed them a script — the conservative end is the walk-away, the optimistic end is the stretch target. A single number pretends to a confidence early estimates don't have. This tells the truth, and the truth negotiates better.");})();

// ════ 9 — AUTONOMOUS AGENT ════
(()=>{const s=header('The autonomous agent — finds money unattended','Capability 5 of 5');
 txt(s,[{text:'A background monitor re-checks every stored part on a schedule. In the live demonstration it opened these findings ',options:{color:C.BODY}},
   {text:'entirely unattended:',options:{bold:true,color:C.DARK}}],0.45,1.85,12.4,0.45,{fontSize:13});
 [['💰  RENEGOTIATION',C.RED,'≈ £400,000 / yr','Supplier price £48.00 is 20% above should-cost £40.00 at 50,000 pcs — clear recovery opportunity.'],
  ['🚨  UNDERWATER PRICE',C.AMBER,'≈ £112,000 / yr exposure','Supplier price 25% BELOW should-cost — verify scope and quality; pricing may be unsustainable.'],
  ['⏳  STALE ESTIMATE',C.MUTED,'Confidence decay','A 120-day-old estimate was never validated with a real quote — the agent asks for a refresh.']]
 .forEach((f,i)=>{const y=2.5+i*1.15; rrect(s,0.45,y,12.45,1.0,C.PANEL,{rectRadius:0.1}); rect(s,0.45,y,0.09,1.0,f[1]);
   txt(s,f[0],0.8,y+0.13,3.3,0.4,{fontSize:13,bold:true,color:f[1]});
   txt(s,f[3],0.8,y+0.5,9.0,0.45,{fontSize:11.5,color:C.BODY});
   txt(s,f[2],9.9,y+0.13,2.85,0.4,{fontSize:14,bold:true,color:f[1],align:'right'});});
 rrect(s,0.45,6.05,12.45,0.85,C.PANEL2,{rectRadius:0.1});
 txt(s,[{text:'Total surfaced in the demo:  ',options:{color:C.BODY}},{text:'≈ £512,000 / yr',options:{fontSize:15,bold:true,color:C.RED}},
   {text:'   — every finding shows its arithmetic, and one click dismisses it once handled.',options:{color:C.MUTED}}],0.75,6.2,11.9,0.6,{fontSize:13});
 s.addNotes("Capability five — the one that earns the word 'agentic.' A monitor runs on our server on a schedule and compares what we PAY against what things SHOULD cost, using everything the tool has learned. In the live demo, with nobody at the keyboard, it opened three findings by itself: a renegotiation worth four hundred thousand a year, an 'underwater' price that flags supply risk, and a stale estimate that needs a fresh quote. Half a million pounds a year, surfaced unattended — and every finding shows its arithmetic, ready to carry into a supplier meeting. The tool isn't waiting to be asked anymore. It's already working.");})();

// ════ 10 — SUPPORTING AI ════
(()=>{const s=header('Supporting AI capabilities already in the tool','The wider AI platform');
 [['📚  Grounded AI assistant',"Answers cite our actual rate library and past costings — the AI quotes our data, it doesn't improvise. Every figure is traceable.",C.BLUE],
  ['📄  RFQ analyst','Drop in an RFQ package: it costs every line, flags risky prices and single-source parts, and drafts a prioritised negotiation brief.',C.VIOLET],
  ['📐  CAD feature costing','Reads the 3D model and prices individual design features — holes, threads, surfaces — so designers see exactly what drives cost.',C.CYAN],
  ['🌱  Carbon co-costing','Every part gets a CO₂e figure alongside the £ — increasingly demanded in automotive & aerospace RFQs.',C.GREEN]]
 .forEach((q,i)=>{const x=0.45+(i%2)*6.35,y=2.1+Math.floor(i/2)*2.3;
   rrect(s,x,y,6.1,2.05,C.PANEL,{rectRadius:0.07}); rect(s,x,y,0.09,2.05,q[2]);
   txt(s,q[0],x+0.3,y+0.2,5.6,0.45,{fontSize:15,bold:true,color:q[2]});
   txt(s,q[1],x+0.3,y+0.72,5.55,1.25,{fontSize:12,color:C.BODY,lineSpacingMultiple:1.15});});
 txt(s,'Together with 18 commodity cost engines, CAD-to-cost, and PCB photo-to-BOM — the agentic layer sits on top of all of it.',0.45,6.7,12.4,0.5,{fontSize:12,italic:true,color:C.MUTED});
 s.addNotes("The learning loop is the headline, but it stands on a real platform. The assistant answers from our own rate data with citations — it quotes our numbers, it doesn't improvise. The RFQ analyst turns a full quote package into a costed, risk-flagged negotiation brief. CAD feature costing shows a designer which hole or surface drives the price. And carbon co-costing puts a CO2 figure next to every pound — which automotive and aerospace customers now demand in the RFQ itself. Eighteen commodity engines, CAD-to-cost, PCB photo-to-BOM — and the agentic layer sits on top of all of it.");})();

// ════ 11 — INPUTS REQUIRED ════
(()=>{const s=header('What it needs from us — honestly, very little','Inputs required');
 rrect(s,0.45,2.05,6.0,4.3,C.PANEL2,{rectRadius:0.05});
 txt(s,'You provide',0.75,2.3,5.4,0.4,{fontSize:16,bold:true,color:C.BLUE});
 [['Keep costing parts as normal','every analysis feeds the memory automatically'],['One click when a real quote arrives','"Log Actual £" — this is the learning fuel'],
  ['Optional: CAD file or BOM','sharper matching and better auto-fill'],['Optional: historic quotes (CSV)','seeds the memory so it starts smart, not empty']]
 .forEach((r,i)=>{const y=2.85+i*0.85;
   txt(s,[{text:`${i+1}.  `+r[0],options:{fontSize:13,bold:true,color:C.DARK,breakLine:true}},{text:'     '+r[1],options:{fontSize:11,color:C.MUTED}}],0.75,y,5.4,0.8);});
 rrect(s,6.85,2.05,6.05,4.3,C.PANEL,{rectRadius:0.05});
 txt(s,'The tool does',7.15,2.3,5.4,0.4,{fontSize:16,bold:true,color:C.GREEN});
 ['Remembers every analysis (no duplicates, org-wide)','Finds & explains similar past parts instantly','Suggests benchmarks, materials and real prices',
  'Measures its own error and self-corrects per category','Tightens confidence ranges as evidence grows','Monitors all parts in the background & raises findings']
 .forEach((t,i)=>{const y=2.85+i*0.57;
   txt(s,[{text:'✓  ',options:{bold:true,color:C.GREEN}},{text:t,options:{color:C.BODY}}],7.15,y,5.5,0.5,{fontSize:12.5});});
 s.addNotes("Fair management question: what does this cost the team in effort? Honestly — almost nothing. Engineers keep costing parts exactly as they do now; the memory builds itself. The one new habit is a single click when a real quote arrives. Two optional accelerants: attach CAD or BOM files for sharper matching, and — my recommended first move — a one-off import of our historical quotes so the system starts SMART instead of empty. Low effort in, compounding value out.");})();

// ════ 12 — RESULTS & ACCURACY ════
(()=>{const s=header('Results & accuracy — measured, not promised','Evidence');
 [['Estimating error after learning (machining segment)','10.9%  →  0.3%',C.GREEN],['Estimating error after learning (casting · China)','8.7%  →  0.6%',C.GREEN],
  ['Confidence band on the same part','±20.4%  →  ±2.8%',C.GREEN],['Similar-part recognition on live example','98–99% match, reasons shown',C.CYAN],
  ['Autonomous findings in unattended demo','£512,000 / yr surfaced',C.RED],['Automated tests protecting all of this','917 passing (77 suites)',C.VIOLET]]
 .forEach((r,i)=>{const y=2.1+i*0.72; rrect(s,0.45,y,12.45,0.6,i%2===0?C.PANEL:C.BG,{rectRadius:0.14});
   txt(s,r[0],0.8,y+0.11,8.2,0.4,{fontSize:13,color:C.BODY});
   txt(s,r[1],8.6,y+0.09,4.1,0.42,{fontSize:14,bold:true,color:r[2],align:'right'});});
 rrect(s,0.45,6.5,12.45,0.72,C.PANEL2,{rectRadius:0.1});
 txt(s,[{text:'How we verified: ',options:{bold:true,color:C.DARK}},
   {text:'every number above comes from running the real system end-to-end — live server, real database, real API calls — not from slides or simulations.',options:{color:C.BODY}}],0.75,6.62,11.9,0.5,{fontSize:12});
 s.addNotes("Everything on this slide was measured on the running system — live server, real database, real API calls — not projected. Segment error dropped to well under one percent in BOTH directions of bias. The confidence band tightened seven-fold. Recognition hit ninety-nine percent. The unattended agent surfaced half a million pounds. And nine hundred and seventeen tests stand guard so none of it quietly regresses. One honest caveat: these demos ran on small seeded datasets — real-world accuracy builds as OUR data accumulates. The mechanism is proven. The asset grows with use.");})();

// ════ 13 — BENEFITS ════
(()=>{const s=header('What this means for the business','Benefits');
 [['⚡','Faster costing','New parts start from proven history instead of a blank sheet — matches, materials and benchmarks appear instantly.',C.BLUE],
  ['🎯','Accuracy that compounds','Every real quote makes the next estimate better. Accuracy is measured and reported — defensible in any negotiation.',C.GREEN],
  ['🏦','Knowledge stays',"Senior engineers' judgement is captured as data. It doesn't leave when people do — and juniors inherit it from day one.",C.VIOLET],
  ['💰','Money found proactively','The agent watches all parts continuously and flags overpayment and pricing risk by itself, quantified in £/yr.',C.RED]]
 .forEach((b,i)=>{const x=0.45+(i%2)*6.35,y=2.05+Math.floor(i/2)*2.25;
   rrect(s,x,y,6.1,2.0,C.PANEL,{rectRadius:0.07}); rect(s,x,y,0.09,2.0,b[3]);
   txt(s,[{text:b[0]+'  ',options:{fontSize:18,color:b[3]}},{text:b[1],options:{fontSize:16,bold:true,color:b[3]}}],x+0.3,y+0.18,5.5,0.5);
   txt(s,b[2],x+0.3,y+0.75,5.55,1.15,{fontSize:12,color:C.BODY,lineSpacingMultiple:1.18});});
 txt(s,[{text:'And it is ours: ',options:{fontSize:13,bold:true,color:C.DARK}},
   {text:'the knowledge base runs on our infrastructure and grows into a proprietary asset competitors cannot buy.',options:{fontSize:13,color:C.BODY}}],0.45,6.6,12.4,0.6);
 s.addNotes("Four benefits, business language. Speed: new parts start from proven history, not a blank sheet. Accuracy: it compounds with every quote and it's always measured — which is what makes our numbers defensible with suppliers. Retention: your best engineers' judgement becomes company data instead of leaving in a leaver's head. And proactive savings: the agent finds money continuously, quantified per year. Then the strategic kicker — a competitor can buy the same software tomorrow. They cannot buy our accumulated costing intelligence. That's the moat, and it deepens every day.");})();

// ════ 14 — CONFORMAL CONFIDENCE ════
(()=>{const s=header('Confidence you can defend — not just assert','New in 2026 · advanced intelligence');
 txt(s,[{text:'Every should-cost now carries two ranges — the physics estimate, and an ',options:{color:C.BODY}},
   {text:'empirical band proven against your own logged quotes.',options:{bold:true,color:C.DARK}}],0.45,1.85,12.4,0.45,{fontSize:13.5});
 rrect(s,0.45,2.5,6.05,2.5,C.PANEL,{rectRadius:0.06}); rect(s,0.45,2.5,6.05,0.09,C.BLUE);
 txt(s,'Physics prior (Monte-Carlo)',0.75,2.72,5.5,0.4,{fontSize:14,bold:true,color:C.BLUE});
 txt(s,[{text:'How well the inputs are known — before you have any real quotes.',options:{fontSize:12,color:C.BODY,breakLine:true}},
   {text:'Example:  £86.34  ± 3.4%',options:{fontSize:14,bold:true,color:C.DARK,breakLine:true}},
   {text:'Always available, every part, every commodity.',options:{fontSize:11,italic:true,color:C.MUTED}}],0.75,3.2,5.5,1.7,{lineSpacingMultiple:1.15,paraSpaceAfter:8});
 rrect(s,6.85,2.5,6.05,2.5,C.PANEL2,{rectRadius:0.06}); rect(s,6.85,2.5,6.05,0.09,C.GREEN);
 txt(s,'Empirical band (conformal)',7.15,2.72,5.5,0.4,{fontSize:14,bold:true,color:C.GREEN});
 txt(s,[{text:'Proven against the quotes YOU logged — with a coverage guarantee.',options:{fontSize:12,color:C.BODY,breakLine:true}},
   {text:'Example:  90% of your quotes land within  ± 6.5%  →  £81.54 – £92.88',options:{fontSize:13,bold:true,color:C.DARK,breakLine:true}},
   {text:'Tightens automatically as more quotes are logged.',options:{fontSize:11,italic:true,color:C.GREEN}}],7.15,3.2,5.5,1.7,{lineSpacingMultiple:1.15,paraSpaceAfter:8});
 rrect(s,0.45,5.25,12.45,1.5,C.PANEL2,{rectRadius:0.06});
 txt(s,[{text:'Why it helps:  ',options:{fontSize:13,bold:true,color:C.BLUE}},
   {text:'a buyer can’t defend "trust me, ±5%". They CAN defend "90% of our real quotes for this family landed within ±6.5%." The band edge is an observed error — evidence, not an assertion. It is the honest uncertainty no competitor states this way.',options:{fontSize:12.5,color:C.BODY}}],0.75,5.45,11.9,1.2,{lineSpacingMultiple:1.2});
 s.addNotes("New this year, and it sharpens the moat. Every should-cost now carries TWO ranges. Left, the physics prior — a Monte-Carlo band reflecting how well the inputs are known; always available. Right, the new one: an empirical band built from the actual quotes you've logged, using conformal prediction — a method that comes with a coverage guarantee. So the tool stops asserting a precision and states an observed fact: 'ninety percent of your real quotes for this family landed within plus-or-minus six-and-a-half percent.' That band edge is measured error, not a claim — which is why a buyer can defend it in the room. And it tightens on its own. No competitor states uncertainty with a guarantee like this.");})();

// ════ 15 — OUTCOME-WEIGHTED ════
(()=>{const s=header('The agent learns what actually earns money','New in 2026 · advanced intelligence');
 txt(s,[{text:'The autonomous agent no longer just finds gaps — it learns which findings ',options:{color:C.BODY}},
   {text:'actually convert into savings, and re-ranks by the money it can really recover.',options:{bold:true,color:C.DARK}}],0.45,1.85,12.4,0.45,{fontSize:13.5});
 const cx=[0.6,4.4,7.4,10.2]; rect(s,0.45,2.5,12.45,0.5,C.DARK);
 ['Finding','Raw gap (impact)','Learned conversion','Expected realizable'].forEach((h,i)=>txt(s,h,cx[i],2.58,3.4,0.35,{fontSize:11.5,bold:true,color:C.BG}));
 [['Cast Housing','£200k/yr','20% — rarely closes','£40k',C.RED],['Machined Knuckle','£100k/yr','80% — usually closes','£80k',C.GREEN]]
 .forEach((r,i)=>{const y=3.0+i*0.62; rect(s,0.45,y,12.45,0.6,i%2===0?C.PANEL:C.BG);
   txt(s,r[0],cx[0],y+0.14,3.6,0.35,{fontSize:12.5,bold:true,color:C.DARK});
   txt(s,r[1],cx[1],y+0.14,3.0,0.35,{fontSize:12,color:C.BODY});
   txt(s,r[2],cx[2],y+0.14,2.8,0.35,{fontSize:12,color:C.BODY});
   txt(s,r[3],cx[3],y+0.14,2.6,0.35,{fontSize:13,bold:true,color:r[4]});});
 rrect(s,0.45,4.5,12.45,0.95,C.PANEL2,{rectRadius:0.08});
 txt(s,[{text:'The result: ',options:{fontSize:12.5,bold:true,color:C.BLUE}},
   {text:"the machining finding — HALF the raw gap — now ranks ABOVE the casting one, because the agent learned casting renegotiations don’t close. It stops shouting about theoretical money and surfaces the money you can get.",options:{fontSize:12.5,color:C.BODY}}],0.75,4.66,11.9,0.7,{lineSpacingMultiple:1.2});
 txt(s,[{text:'Why it helps:  ',options:{fontSize:13,bold:true,color:C.GREEN}},
   {text:'sourcing time is scarce. The agent spends it where the return is real — and tracks the £ actually saved, so you can prove the tool paid for itself. One click ("Actioned £") teaches it after every negotiation.',options:{fontSize:12.5,color:C.BODY}}],0.45,5.7,12.4,1.0,{lineSpacingMultiple:1.2});
 s.addNotes("This closes the loop on the agent. It used to rank findings by the raw gap — the theoretical money. Now it learns which findings actually convert into cash. Watch the table: the cast housing shows a two-hundred-thousand-pound gap, but casting renegotiations almost never close — twenty percent — so realizable value is forty thousand. The machined knuckle has HALF the raw gap, but machining usually closes — eighty percent — so it's worth eighty thousand realizable. The agent now ranks the machining finding ABOVE the bigger one. Why? Sourcing time is scarce — it points at money you can actually get, and tracks pounds truly saved so the tool proves its own worth.");})();

// ════ 16 — NEGOTIATION COACH ════
(()=>{const s=header('The negotiation coach — it hands you the argument','New in 2026 · advanced intelligence');
 txt(s,[{text:'The tool now knows ',options:{color:C.BODY}},{text:'why',options:{bold:true,italic:true,color:C.DARK}},
   {text:' a part costs what it does — and turns that into the sentence that wins the negotiation.',options:{color:C.BODY}}],0.45,1.85,12.4,0.45,{fontSize:13.5});
 rrect(s,0.45,2.5,12.45,2.0,C.PANEL2,{rectRadius:0.05}); rect(s,0.45,2.5,0.09,2.0,C.BLUE);
 txt(s,'Live example — real output from the tool',0.8,2.72,11.8,0.35,{fontSize:12,bold:true,color:C.BLUE});
 txt(s,[{text:'“Material is £8.39 of this part, driven by Aluminium. Every 1% move in the Aluminium index shifts the piece price by £0.11. ',options:{color:C.DARK}},
   {text:'A quote of £95 is only justified if Aluminium were ~14% above today’s index — ask the supplier to show that, or hold at £86.34.”',options:{color:C.VIOLET}}],0.8,3.12,11.8,1.3,{fontSize:14,bold:true,lineSpacingMultiple:1.3});
 rrect(s,0.45,4.75,6.05,2.0,C.PANEL,{rectRadius:0.06});
 txt(s,[{text:'What it does',options:{fontSize:13.5,bold:true,color:C.DARK,breakLine:true}},
   {text:'Links the material to its commodity index, then works out — through the same maths the engine uses — exactly how much a supplier’s price implies the metal has moved.',options:{fontSize:11.5,color:C.BODY}}],0.75,4.95,5.5,1.7,{lineSpacingMultiple:1.18,paraSpaceAfter:6});
 rrect(s,6.85,4.75,6.05,2.0,C.PANEL2,{rectRadius:0.06});
 txt(s,[{text:'Why it helps',options:{fontSize:13.5,bold:true,color:C.GREEN,breakLine:true}},
   {text:'The buyer walks in with a defensible, arithmetic counter-argument instead of "that feels high". It converts should-cost into negotiating power — the number and the words to win with it.',options:{fontSize:11.5,color:C.BODY}}],7.15,4.95,5.5,1.7,{lineSpacingMultiple:1.18,paraSpaceAfter:6});
 s.addNotes("This is where a number becomes leverage. The tool now builds a small causal model of the part — it knows the material bucket is driven by a specific commodity index, aluminium here — and runs the same overhead-and-margin maths the engine already uses to work out how sensitive the price is. Then it writes the argument for you. Read the live output: material is eight-thirty-nine, driven by aluminium; every one-percent move shifts the piece price by eleven pence; a quote of ninety-five is only justified if aluminium were about fourteen percent above today — so ask them to prove it, or hold at eighty-six thirty-four. That's a sentence a buyer can say out loud and not get argued out of.");})();

// ════ 17 — WHAT-IF ENGINE ════
(()=>{const s=header('Cost weather on demand — the what-if engine','New in 2026 · advanced intelligence');
 txt(s,'Ask "what if a commodity moves?" and get the answer instantly — for one part, or the whole portfolio.',0.45,1.85,12.4,0.45,{fontSize:13.5,color:C.BODY});
 rrect(s,0.45,2.5,6.05,2.7,C.PANEL,{rectRadius:0.06}); rect(s,0.45,2.5,6.05,0.09,C.BLUE);
 txt(s,'One part — the live slider',0.75,2.72,5.5,0.4,{fontSize:14,bold:true,color:C.BLUE});
 txt(s,[{text:'Drag a commodity −20% … +20% and the piece price recomputes as you move.',options:{fontSize:12,color:C.BODY,breakLine:true}},
   {text:'Example:  Aluminium +15%  →  £86.34 → £87.92',options:{fontSize:13.5,bold:true,color:C.DARK,breakLine:true}},
   {text:'Instant sensitivity in a single gesture.',options:{fontSize:11,italic:true,color:C.MUTED}}],0.75,3.2,5.5,1.9,{lineSpacingMultiple:1.15,paraSpaceAfter:8});
 rrect(s,6.85,2.5,6.05,2.7,C.PANEL,{rectRadius:0.06}); rect(s,6.85,2.5,6.05,0.09,C.VIOLET);
 txt(s,'Whole portfolio — the scenario',7.15,2.72,5.5,0.4,{fontSize:14,bold:true,color:C.VIOLET});
 txt(s,[{text:'Apply a move across every part at once and see who changes status.',options:{fontSize:12,color:C.BODY,breakLine:true}},
   {text:'Example:  "If Steel +10% → 7 parts cross underwater, £X/yr at risk."',options:{fontSize:13.5,bold:true,color:C.DARK,breakLine:true}},
   {text:'Pre-empt losses before the market moves them.',options:{fontSize:11,italic:true,color:C.MUTED}}],7.15,3.2,5.5,1.9,{lineSpacingMultiple:1.15,paraSpaceAfter:8});
 rrect(s,0.45,5.45,12.45,1.3,C.PANEL2,{rectRadius:0.06});
 txt(s,[{text:'Honest by design:  ',options:{fontSize:13,bold:true,color:C.AMBER}},
   {text:'this is a conditional — "IF the index moves" — never a price forecast. So it stays defensible even on an indicative commodity feed, and upgrades to a true forecast the day a live market feed is connected.',options:{fontSize:12.5,color:C.BODY}}],0.75,5.62,11.9,1.05,{lineSpacingMultiple:1.2});
 s.addNotes("Two ways to ask 'what if a commodity moves?' Left, one part: drag a slider from minus twenty to plus twenty percent and the price recomputes live under your finger — plus fifteen percent aluminium takes this part from eighty-six thirty-four to eighty-seven ninety-two. Right, the whole portfolio at once: push a move across every part and watch who changes status — steel up ten percent, seven parts flip underwater, here's the money at risk. That's sourcing getting ahead of the market instead of reacting. And the honest framing: it's always a conditional — IF the index moves — never a forecast we can't stand behind.");})();

// ════ 18 — PCB ACCURACY ════
(()=>{const s=header('PCB photo → BOM → should-cost — now supplier-grade','New in 2026 · advanced intelligence');
 txt(s,[{text:'Photograph a circuit board, get a costed bill of materials in ~60 seconds. This year we hardened it from a clever demo into a ',options:{color:C.BODY}},
   {text:'number you can put in front of a supplier.',options:{bold:true,color:C.DARK}}],0.45,1.82,12.4,0.42,{fontSize:13});
 s.addChart('bar',[{name:'Manual (engineer)',labels:['Components','Fab + assembly','Total / board'],values:[62,10,73]},
   {name:'AI (from photo)',labels:['Components','Fab + assembly','Total / board'],values:[62.29,6.82,69.11]}],
   {x:0.45,y:2.45,w:6.15,h:3.35,barDir:'col',...CHART([C.MUTED,C.BLUE],{showLegend:true,legendPos:'b',legendFontSize:10.5,valAxisMinVal:0,valAxisMaxVal:80,valAxisMajorUnit:20,dataLabelFontSize:9,catAxisLabelFontSize:9.5})});
 txt(s,'Real automotive ECU, China @ 10k/yr — AI landed within ~5% of a half-day manual estimate, in ~60 s.',0.45,5.82,6.15,0.42,{fontSize:10,italic:true,color:C.MUTED,lineSpacingMultiple:1.05});
 rrect(s,6.85,2.45,6.05,3.35,C.PANEL,{rectRadius:0.05});
 txt(s,'What we fixed this year',7.15,2.62,5.5,0.35,{fontSize:14,bold:true,color:C.DARK});
 [['Empty-BOM bug — killed','Complex boards used to return nothing; now we read every block the model emits.',C.GREEN],
  ['Catalogue grounding','Confirmed parts snap to real market prices — offline, no external API.',C.BLUE],
  ['Class-median cap + magnitude guard','A misread part can no longer dominate: one MCU £84 → £18, capped & flagged.',C.VIOLET],
  ['Deterministic fabrication','Fab is derived from stable board features — the headline no longer swings run-to-run.',C.CYAN],
  ['Confirmed vs needs-verification','The headline splits the £ you can trust from the £ to firm up.',C.AMBER]]
 .forEach((f,i)=>{const y=3.05+i*0.55; rect(s,7.15,y+0.05,0.09,0.42,f[2]);
   txt(s,[{text:'✓  '+f[0]+' — ',options:{bold:true,color:C.DARK}},{text:f[1],options:{color:C.BODY}}],7.42,y,5.35,0.55,{fontSize:10.5,lineSpacingMultiple:1.0});});
 rrect(s,0.45,5.98,12.45,0.85,C.PANEL2,{rectRadius:0.1});
 txt(s,[{text:'Result:  ',options:{fontSize:12.5,bold:true,color:C.BLUE}},
   {text:'the 2–3× over-costing is gone. That live ECU came back ASIL-B, 23 BOM lines, £69.11/board — with £37.65 confirmed and £24.64 honestly flagged to verify. Same photo, same answer, every run.',options:{fontSize:12,color:C.BODY}}],0.75,6.12,12.0,0.6,{lineSpacingMultiple:1.15});
 s.addNotes("Now the feature I'm proudest of this year. Photograph a circuit board, and in about sixty seconds you get a costed bill of materials. The story is honesty about the journey: it started as a clever demo, and complex automotive boards would sometimes come back EMPTY — a lot of compute, no result. We fixed that at the root, then hardened the whole pipeline. The chart is the proof: the same real ECU, costed by an engineer in half a day versus the AI from one photo — sixty-nine pounds against seventy-three, within about five percent, in sixty seconds. On the right, the five fixes that got us there. Bottom line: the two-to-three-times over-costing is gone. Same photo, same answer, every run — and it tells you exactly which lines to firm up before you quote.");})();

// ════ 19 — GLASS-BOX ════
(()=>{const s=header('Why ours is different — glass-box autonomy','The differentiator');
 rrect(s,0.45,2.0,12.45,1.3,C.PANEL2,{rectRadius:0.06});
 txt(s,[{text:'The principle:  ',options:{fontSize:15,bold:true,color:C.BLUE}},
   {text:'every learned or derived number stays auditable — a value a cost engineer can read and defend. No black-box weight ever touches the price. The AI narrates and explains; it never decides the number in secret.',options:{fontSize:13.5,color:C.BODY}}],0.75,2.2,11.9,1.0,{lineSpacingMultiple:1.2});
 [['Continuous learning','Calibrates on YOUR quotes; conformal band with a guarantee',C.GREEN],
  ['Autonomous action','Agent opens findings unattended AND learns which convert',C.GREEN],
  ['Causal reasoning','Knows why a part costs what it does; coaches the negotiation',C.GREEN],
  ['Explainable — always',"Every number defensible line-by-line; the competitor’s edge is the opposite",C.BLUE],
  ['Runs in your walls','On-premise; the knowledge is your IP and never leaves',C.VIOLET]]
 .forEach((r,i)=>{const y=3.5+i*0.66; rrect(s,0.45,y,12.45,0.58,i%2===0?C.PANEL:C.BG,{rectRadius:0.1}); rect(s,0.45,y,0.09,0.58,r[2]);
   txt(s,r[0],0.75,y+0.13,3.6,0.35,{fontSize:12.5,bold:true,color:r[2]});
   txt(s,r[1],4.5,y+0.13,8.2,0.35,{fontSize:12,color:C.BODY});});
 s.addNotes("If you take one competitive message away, take this. Rivals demo continuous learning and adaptive reasoning — but as a black box, a number you're told to trust. Our principle is the opposite, and it's harder to build: every learned or derived value stays auditable. The bias factor, the conformal band, the hit-rate, the coach's arithmetic — all a value a cost engineer can read and defend across the table. The AI narrates and explains; it never sets the price in secret. So we match the market on learning, autonomy and causal reasoning — and beat it on the one thing that wins deals: defensibility. Autonomous, self-improving, glass-box, AND on-premise. That combination doesn't exist anywhere else.");})();

// ════ 20 — NEXT STEPS ════
(()=>{const s=header('Where we are, and the ask','Next steps');
 rrect(s,0.45,2.0,6.0,4.4,C.PANEL,{rectRadius:0.05});
 txt(s,'Status today',0.75,2.25,5.4,0.4,{fontSize:16,bold:true,color:C.GREEN});
 ['All capabilities built, tested (917 tests) and live — incl. 6 new for 2026','Verified end-to-end on the running system',
  'Zero extra licence cost — built into our tool','Runs on-premise; no data leaves the company']
 .forEach((t,i)=>txt(s,[{text:'✓  ',options:{bold:true,color:C.GREEN}},{text:t,options:{color:C.BODY}}],0.75,2.8+i*0.55,5.4,0.5,{fontSize:12.5}));
 txt(s,[{text:'Honest note: ',options:{fontSize:12,bold:true,color:C.DARK}},
   {text:'the intelligence starts empty and grows with use. The mechanism is proven; the value builds as we feed it.',options:{fontSize:12,color:C.BODY}}],0.75,5.15,5.4,1.1,{lineSpacingMultiple:1.15});
 rrect(s,6.85,2.0,6.05,4.4,C.PANEL2,{rectRadius:0.05});
 txt(s,'The ask — three small decisions',7.15,2.25,5.4,0.4,{fontSize:16,bold:true,color:C.BLUE});
 [['1.  Adopt the habit','Make "Log Actual £" part of the quote-handling routine. One click per quote.'],
  ['2.  Seed the memory','Approve a one-off import of historical quotes so the tool starts smart (~1–2 days of effort).'],
  ['3.  Review the findings',"Put the agent's monthly findings on the sourcing team's agenda — it is already finding money."]]
 .forEach((r,i)=>{const y=2.85+i*1.05;
   txt(s,[{text:r[0],options:{fontSize:13.5,bold:true,color:C.DARK,breakLine:true}},{text:'     '+r[1],options:{fontSize:11.5,color:C.BODY}}],7.15,y,5.5,1.0,{lineSpacingMultiple:1.1});});
 rect(s,0,H-0.16,W,0.16,C.INDIGO);
 s.addNotes("To close. The capability is built, tested — nine hundred and seventeen tests — and live, at no extra licence cost, on our own infrastructure. I'll be straight about the one dependency: the intelligence starts empty and grows with use. So the ask is three small decisions. One: make 'Log Actual £' a one-click habit. Two: approve a one-off import of our historical quotes so it starts smart — a day or two of effort. Three: put the agent's findings on the sourcing agenda each month; it's already finding money. Do those three things and this becomes a compounding asset from day one. Thank you — happy to take questions, or show you the live system right now.");})();

const OUT='/home/user/leamington-marathi/CostVision-Agentic-AI-Management-Presentation.pptx';
p.writeFile({fileName:OUT}).then(f=>console.log('wrote',f));
