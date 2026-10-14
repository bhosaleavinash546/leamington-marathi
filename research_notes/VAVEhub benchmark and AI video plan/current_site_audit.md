# VAVEhub (valueengineeringhub.com): current learner experience and content audit, from source code

Scope and method. Audited the local repository `/home/user/value-engineering` on 14 Oct 2026 at commit `16a93a4` ("Step B: fair assessment, marked on the server"). Local `main` is one commit ahead of `origin/main`, so Step B is **not yet published** (`git log origin/main..HEAD` shows only 16a93a4). The repository was not modified: `git status` was clean before and after. Sources below are repository file paths with line numbers where useful. Live behaviour was checked by serving the site locally on port 8475 and driving it with Playwright/Chromium, with every external request (Supabase, YouTube) blocked; the server was stopped afterwards. I also ran the repository's own test suites `pages links academy leaders` (`tests/run.js`, which uses a demo exam bank): **208 passed, 0 failed**. Word counts, text runs and media counts come from a script that parsed `src/academy/m*.html` and `src/leaders/l*.html`.

Two corrections to the brief:
- There are **8 self-hosted MP4s**, not 9: `videos/` holds brainwriting, cost-curve, fast-diagram, should-cost, target-costing, teardown, vave-study and what-is-vave (about 28 MB in total). The Academy's "9 short videos" claim (`src/academy/_head.html` L187) counts these 8 plus the YouTube embed of GM's generative-design video (rExftrAo3p4) in m11. The homepage also has a third-party YouTube intro, "Why value engineering?" (Psya4JIOIB0), in `src/home/about.html` L28–33.
- The **132-question bank cannot be verified from the code**. The real banks live in a private `exam-questions.sql` that is not in the repository (`supabase-exam.sql` L5–9). The figure of 132 comes from `changelog.html` (3 Oct 2026 entry), which also gives 30 for Leaders. The test fixture `tests/fixtures/exam-demo-bank.json` holds 73 dummy questions: 4 per Academy module and 3 per Leaders module.

---

## Q1. Which engagement features exist in each course, and how does the Academy differ from Leaders?

### Takeaway
The VE Academy (`training.html`, engine `training.js`) has a broad feature set:
- points, ranks, badges and a streak
- role-based paths
- a "Continue" banner
- narration
- in-course search
- glossary tooltips
- a practice exam and flashcards
- printable summaries
- per-module quick checks and challenges
- labs in 6 of 13 modules
- a server-marked exam with a LinkedIn-ready certificate

VAVE for Leaders (`leaders.html`, `course.js`) uses the same shell but has **no gamification, search, glossary tooltips, practice or flashcards, printable module summaries or role paths**. In return it is open without sign-in, has a lab or interactive in nearly every module, and offers a printable playbook.

Across both courses, gamification is shallow. Points come only from marking modules complete and passing the exam. Nothing social, scheduled or adaptive is switched on: the community panel, newsletter, reminders, spaced recall and AI tutor are all off or absent.

### Cited findings

**VE Academy (13 modules plus exam)**
- **Points and ranks.** Points are 100 per completed module plus 800 for passing the exam; nothing else scores points. Six ranks run from "Value Apprentice" (0) to "Certified Master" (2000). Rank shows in the top bar and the sidebar ("x pts · rank") — [training.js L190–221](training.js)
- **Badges.** There are 5 milestone badges, each tied to finishing a group of modules: Foundations (m1–2), Job Plan Master (m3–8), Cost Toolsmith (m9–11), Programme Leader (m12), Cost Preventer (m13) — [training.js L192–198](training.js)
- **Visit streak.** The streak counts consecutive days. It is stored in localStorage and saved to the cloud with the rest of the state. It appears only in the signed-in "Welcome back" banner as "🔥 n-day streak" — [training.js L16–27, L284–291](training.js)
- **Progress.** Progress shows as a percentage bar in the nav and sidebar, an "x/13" counter and a ring in the "My learning" banner. It syncs to Supabase when signed in, and cloud and local state are merged (completed modules, best exam score, last 20 attempts) — [training.js L28–55, L206–224, L271–295](training.js)
- **Resume.** The "Welcome back, {name}" banner has a "Continue: {next unfinished module} →" button. The start button opens the first unread module. Nothing remembers the scroll position inside a module — [training.js L271–295, L246–249](training.js)
- **Role-based paths.** Chips for Design Engineer, Buyer/Sourcing, Manager/Leader and Show everything star the recommended modules ("★ for you"); for example, sourcing gets m1, m2, m9, m10, m11 — [training.js L226–260](training.js); [src/academy/_head.html L78](src/academy/_head.html)
- **Quick checks.** Each module has 2 questions (26 in total). Answers are shuffled each time. A hint appears only after the second wrong try. Both questions must be answered correctly to unlock "Mark complete" — [training.js L453–583](training.js)
- **Scenario challenges.** Every one of the 13 modules has one, with 6–8 questions each. Answers are shuffled, and a "re-read sections x–y" message appears on failure. Module 4 also has an 8-example function-identification challenge — [training.js L782–848, L1279–1716](training.js)
  - In the browser, the practice pool was 120 questions: 26 quick-check plus 94 challenge questions, or 8–10 per module (Playwright evaluation of `window.VH_PRACTICE`).
- **Practice exam.** A 20-question random set comes from the on-page quick checks and challenges, never from the real bank. Explanations show immediately, there is no limit, and a "New set" button deals again. It opens from "↻ Practice & flashcards" in the sidebar and from the exam page — [training.js L939–1013](training.js); [training.js L330–336](training.js)
- **Flashcards.** 20 glossary terms in shuffled flip cards, keyboard-operable — [training.js L1015–1038](training.js)
- **Glossary tooltips.** The same 20 terms (FAST, Value Index, should-cost, LPP, TRIZ, Kano, DFMA and others) get a hover or focus definition on their first mention in each module. In the browser, 43 tooltips were rendered on the Academy page — [training.js L586–644](training.js)
- **Course search.** This is a client-side substring search over headings, paragraphs and list items in all modules. It needs at least 3 characters, shows up to 8 results, jumps to the match and highlights it. Search inside labs, challenges and diagrams is excluded — [training.js L898–937](training.js)
- **Narration.** All 13 modules have pre-generated studio narration (en-GB-SoniaNeural, 128 minutes stated). The player has play/pause/stop, a seek bar, speeds of 0.75–1.5×, paragraph highlighting that follows the audio, and an on/off switch. The audio totals 55 MB, in `audio/m1–m13.mp3` and `l0–l6.mp3` — [vh-voice.js L1–9, L130–160](vh-voice.js); [src/academy/_head.html L69](src/academy/_head.html)
- **Videos with transcripts.** There are 8 self-hosted videos with open (burned-in) subtitles and a "Read the transcript" panel, plus 1 YouTube embed. None has a `<track>` caption file (all 8 `<video>` elements lack one: Playwright) — [src/academy/m1.html video figure](src/academy/m1.html); [changelog.html 2 Oct 2026](changelog.html)
- **Labs.** Labs are interactive `ve-lab` tools or Module 4 builders:
  - m4: a step-through animated FAST builder (Next/Prev; this is not drag-and-drop), a 50-function verb–noun library and the function-identification challenge
  - m5: SCAMPER explorer, TRIZ contradiction navigator and a 3-minute idea sprint
  - m6: weighted-matrix sandbox (weights adjusted with sliders)
  - m7: business-case builder
  - m9: live should-cost calculator
  - m10: teardown walkthrough stepper
  - Source: [training.js L646–848, L1070–1278, L1336–1450](training.js)
- **Fixed lesson structure.** Every module has the same blocks: objectives (`tmod-obj`), worked example (`tex`), one case study (`tcase`), pitfalls (`tpit`), key takeaways (`tkey`) and a hands-on assignment (`tdo`). Each of these classes appears 13 times across `src/academy/m*.html`.
- **Printable one-page summary.** A "🖨 Module summary" button on every module prints the objectives, key takeaways and assignment — [training.js L401–440](training.js)
- **Certificate.** Two things are required:
  - All 13 modules must be marked complete before the exam unlocks (checked in the browser only).
  - The exam must be passed at 80% (24 of 30).

  The certificate is then issued by the server with a name the learner types. Learners can add it to LinkedIn (a `linkedin.com/profile/add` link with name, organisation name, issue date, URL and ID filled in), copy a share link, print or save it as PDF, and retake for a better score. There are public certificate and verify pages — [training.js L317–399](training.js); [vh-exam-ui.js L130–155](vh-exam-ui.js); [certificate.html L66, L148](certificate.html); [verify.html](verify.html)
- **Feedback.** Each module asks "Was this module helpful?" (👍/👎) and offers an optional anonymous comment of up to 500 characters, stored in Supabase `module_feedback` — [training.js L112–150](training.js)
- **Social proof.** A live "certificates issued" counter tile is hidden until the count is at least 1 — [training.js L889–896](training.js); [src/academy/_head.html L72](src/academy/_head.html)
- **Community.** A Giscus (GitHub Discussions) panel is coded, but the panel stays hidden because all four `giscus*` values in `site-config.js` are empty — [training.js L1041–1067](training.js); [site-config.js](site-config.js)
- **Other.** There is a rotating quotes panel and a "Course at a glance" catalogue of 13 cards; the catalogue collapses once any module is done — [training.js L850–878, L1719–1736](training.js)

**VAVE for Leaders (l0 to l6 plus quiz, about 54 minutes)**
- **Access.** All modules are open with no sign-in. Signing in is needed only for the quiz. The page auto-resumes at the first unfinished module — [course.js L186–207, L282–290](course.js)
- **Progress.** A progress bar shows "x / 7 modules", synced to the account when signed in. There are **no points, ranks, badges or streak**: Playwright found no `#trPoints`, and `course.js` contains no such code — [course.js L72–84](course.js)
- **Quick checks.** 2 per module for l1–l6 (none in l0), shuffled, and they unlock "Mark complete" — [leaders-data.js](leaders-data.js); [course.js L108–145](course.js)
- **Labs.** Five modules have labs, and l2 has an interactive scenario exercise:
  - l1: profit-equivalent calculator
  - l2: "pick the value move" (5 scenarios)
  - l3: job plan step by step
  - l4: business case in 60 seconds, with £/$/€/₹ and a board verdict
  - l5: leadership readiness check
  - l6: pilot picker
  - Source: [leaders-labs.js L16–200](leaders-labs.js)
- **Saving.** The readiness check and pilot picker do **not** save results: `leaders-labs.js` never writes to localStorage or the cloud.
- **Narration and print.** All 7 modules have narration (7 player bars, as seen in Playwright). There is a printable one-page playbook (`leaders-playbook.html`), but no per-module summary button (0 `.tmod-print` on Leaders, from Playwright).
- **Quiz and certificate.** The quiz is 12 questions marked on the server: one from each of the 7 modules plus 5 more. The pass mark is 70%. The quiz can be taken before finishing the modules. The certificate (prefix VL-) has the same LinkedIn, share-link and print options — [course.js L186–262](course.js); [supabase-exam.sql L49–50, L75–85](supabase-exam.sql)
- **Missing compared with the Academy.** In Playwright, Leaders has no course search (`#courseSearch` absent), no glossary tooltips (0 `.gloss`), no practice exam or flashcards, no role paths and no community panel.

**Leaders has, the Academy lacks**
- modules open without an account
- automatic resume at the next unfinished module
- a printable playbook
- a currency selector in the business-case lab
- four documented case studies in a single module (l4: US highway VE, the IBM Proprinter, Tesla castings and GM generative design)

### Inferences
- **Gamification is mostly cosmetic.** Points equal completion count, so they add no information beyond the progress bar. Labs, challenges, quick checks and the practice exam earn nothing, and nothing rewards return visits other than the streak label.
- **Likely resume bug.** In `training.js` init (L442–451), `acctName` is still empty because `vh-account.js` resolves the user asynchronously, so `startId` falls back to "m1". `onAccount` then re-shows `currentId`, which is m1. A signed-in returning learner therefore probably lands on Module 1 and must press "Continue" in the banner. This comes from reading the code; I did not test it with a real account.
- **Leaders is the better first-touch experience** because it has no gate, but it is the weaker course for retention, with no tools for review or revisiting.

### Gaps
- I could not exercise signed-in flows (sync, the banner, the real server exam) because Supabase was blocked and no test account was available. Those behaviours are described from code and from the repository's demo-mode tests.

---

## Q2. What is the media mix per module, where are the longest text-only stretches, and which modules have no video?

### Takeaway
- Every Academy module now has at least one diagram or chart (`concept-viz`), a case study, a challenge and a quick check.
- **5 of 13 Academy modules have no video at all (m3, m6, m7, m8, m12).** m11 has only the external YouTube clip.
- **Labs are missing in 7 of 13 Academy modules (m1, m2, m3, m8, m11, m12, m13).**
- The longest uninterrupted prose stretches run to 650–915 words (about 3–5 minutes of reading) in m5, m4, m11, m6 and m10.
- In Leaders, l0, l5 and l6 have no video and l4 has only the YouTube clip.

### Cited findings

**Per-module inventory.** Words exclude script and style. Diagrams means `concept-viz` blocks. Every Academy module also has 1 case study, 1 scenario challenge and 1 quick check.

| Module (stated time) | Words | Own video | Other video | Diagrams | Lab | Photos | Toolkit link |
|---|---|---|---|---|---|---|---|
| m1 Foundations (20 min) | 2,106 | 2 (what-is-vave, cost-curve) | – | 4 | – | – | – |
| m2 Pre-workshop (18) | 1,963 | 1 (vave-study) | – | 3 | – | – | agenda |
| m3 Information (22) | 1,485 | **0** | – | 3 | – | – | function–cost matrix |
| m4 Function analysis/FAST (40) | 2,407 | 1 (fast-diagram) | – | 1 | FAST builder, function library, function ID challenge | – | FAST worksheet, matrix |
| m5 Creative (35) | 2,836 | 1 (brainwriting) | – | 2 | SCAMPER, TRIZ, idea sprint | – | idea capture |
| m6 Evaluation (30) | 2,327 | **0** | – | 2 (+1 table) | weighted-matrix sandbox | – | idea capture |
| m7 Development (25) | 1,428 | **0** | – | 3 | business-case builder | 1 | **none** |
| m8 Presentation and implementation (20) | 1,455 | **0** | – | 2 | **none** | – | savings funnel |
| m9 Should-cost (32) | 2,110 | 1 (should-cost) | – | 3 (+1 table) | should-cost calculator | 1 | **none** |
| m10 Teardown (35) | 2,418 | 1 (teardown) | – | 2 | teardown stepper | – | teardown BOM |
| m11 AI-era (26) | 2,122 | **0** | YouTube (GM generative design) | 3 | **none** | 1 | **none** |
| m12 Programme (15) | 1,524 | **0** | – | 4 | **none** | – | **none** |
| m13 Target costing (25) | 2,043 | 1 (target-costing) | – | 2 | **none** | 2 | **none** |
| l0 Start (2) | 445 | 0 | – | 1 (course map) | – | – | – |
| l1 (8) | 874 | 1 (cost-curve) | – | 1 | profit-equivalent calculator | – | – |
| l2 (8) | 1,229 | 1 (what-is-vave) | – | 1 | pick the value move | – | – |
| l3 (10) | 1,081 | 1 (vave-study) | – | 1 | job-plan stepper | – | – |
| l4 (8) | 1,156 | 0 | YouTube (GM) | 1 | business case in 60 seconds | 3 | – |
| l5 (10) | 810 | 0 | – | 1 | readiness check | – | – |
| l6 (8) | 637 | 0 | – | 1 | pilot picker | – | 7 toolkit links |

Sources: `src/academy/m1–m13.html`, `src/leaders/l0–l6.html` (counts of `<video`, `youtube`, `concept-viz`, `data-lab`, `<img`, `href="toolkit/`); lab mapping from `data-lab` attributes and [training.js L1070–1450](training.js).

**Course length**
- The Academy's module times add up to 343 minutes (about 5 h 43 min). The catalogue says "≈6 hours" (`src/academy/_head.html` L187), while `certificate.html` L73 and `verify.html` L59 say "about 6.5 hours".
- Leaders adds up to 54 minutes.

**Longest prose-only runs.** These are words between any two non-prose blocks (figure, video, lab, callout, case, table, photo):
- m5: about **914 words**, §5.1 to §5.5 (before the brainwriting diagram)
- m4: about **830 words**, §4.2 to §4.5 (before the FAST video)
- m11: about **697 words**, §11.2 to §11.7
- m6: about **657 words**, §6.6 to §6.10, and about 472 words, §6.2 to §6.4
- m10: about **645 words**, §10.3 to §10.7, and about 511 words, §10.8 to §10.11
- m2: about 507 words, §2.1 to §2.5
- m1: about 460 words, §1.3 to §1.6
- m8: about 402 words, §8.5 to §8.7
- m9: about 404 words, §9.1 to §9.3
- m13: about 379 words, §13.3 to §13.5
- m3: about 353 words, §3.5 to §3.6
- Leaders: the longest are l3 (about 324 words, §3.1 to the Presentation step) and l5 (about 295 words, §5.3 to §5.4).
- Source: section-level parse of `src/academy/*.html` and `src/leaders/*.html`.

**History of the visual additions.** Per `changelog.html` (1–2 Oct 2026), diagrams were recently added to formerly text-only modules (Academy 2, 5, 6, 11, 12, 13; Leaders 5, 6) and licensed photos to case studies (Tesla giga-casting, IBM Proprinter, Tata Nano). Credits are on `credits.html`.

### Inferences
- **Highest-value targets for new video:** m6 (evaluation; 30 min, 657- and 472-word runs) and m8 (implementation; no video, no lab, 402-word run). Next come m3 (Information phase), m7, m11 (no self-hosted video despite being the AI module) and m12.
- **Leaders gaps:** l5 (leadership actions) and l6 (90-day plan) are the Leaders modules without video.
- **Highest-value targets for new interactives:** m8, m12, m13, m11 and m3, which have no lab. This matches roadmap item D, labs for m3, m8 and m13.

### Gaps
- I did not measure video durations; the videos are captioned "2 minutes" etc., and the files are 1.5–4.9 MB each. I also did not assess the visual quality of diagrams.

---

## Q3. What does a brand-new visitor experience end to end, and where are the friction points and dead ends?

### Takeaway
The path works end to end and has no broken links (the `links` test suite passed):

homepage → choose Academy or Leaders → Academy Module 1 free → sign-up gate from Module 2 → email-code account → modules with quick-check gates → exam after all 13 modules → server certificate → LinkedIn.

The main friction points are:
- the sign-up wall after Module 1, which guide pages do not mention
- sign-up itself: 3 fields plus a terms checkbox, then a 6-digit emailed code
- stale "65-question" copy on the gate and the sign-up page
- a 13-module completion wall before the exam can even be tried
- "My learning" always pointing to the Academy

### Cited findings

**Homepage**
- The hero has two side-by-side cards: "For engineers, buyers and cost analysts" → `training.html`, and "For senior managers and directors" → `leaders.html`.
- The nav includes Guides, Job Plan, Cost Levers, Ideation, Benchmarking, Toolkit, Glossary, 🎓 Academy, 🧭 For Leaders, Sign in, and "Get started" (→ `auth.html?view=signup`, not a course).
- There is a lazy YouTube intro video facade. There are no testimonials or learner numbers on the homepage.
- Source: Playwright capture of `/`; [src/home/hero.html](src/home/hero.html); [src/home/about.html L28–33](src/home/about.html)

**Academy, signed out**
- Module 1 opens by default. 13 sidebar items are locked (m2–m13 plus the exam).
- Clicking m2 shows "Sign in to unlock Module 2 …". The gate says "All 13 modules & the full **65-question** exam bank", which is out of date: Step B states 30 drawn from about 130 or 132.
- Gate buttons go to `auth.html?view=signup&next=training.html?open=m2`, so the learner returns to the module they wanted.
- Source: [training.js L77–110](training.js); Playwright

**Sign-up page**
- Fields: full name ("As it should appear on your certificate"), email, password (8+ characters) and a terms checkbox.
- A 6-digit emailed code follows (Supabase OTP, with a 60-second resend timer).
- The stats strip also still says "**65** exam bank".
- Source: [auth.html L58–65](auth.html); [auth.js L100–140](auth.js)
- The test `tests/suites/academy.js` L153 asserts that the sign-up page mentions the 65-question bank, so the stale figure is locked in by a test.

**Within modules**
- "Mark complete & go to Module n →" stays disabled until both quick-check questions are answered correctly — [training.js L152–156, L520–533](training.js)

**Exam (Academy)**
- The exam stays locked until all 13 modules are marked complete ("You have n modules to go"). After that, "Begin the exam" and "Try a practice exam first" appear.
- 30 questions: 2 per module plus 4 apply, calc or case questions, shuffled questions and options, no time limit, Previous/Next navigation.
- **Fail:** the score, a ring, a per-module table with "Revisit" buttons and a one-hour wait; no answers are revealed.
- **Pass:** a review of the questions the learner got wrong, with explanations, then the name box → server-issued certificate.
- Source: [training.js L317–347](training.js); [vh-exam-ui.js L25–128](vh-exam-ui.js); [supabase-exam.sql L53–111](supabase-exam.sql)
- The rule that all modules must be complete is enforced only in the browser. `start_exam()` checks sign-in and the one-hour wait but not progress — [supabase-exam.sql L64–73](supabase-exam.sql)

**Leaders**
- No gate on content. The quiz asks for sign-in and returns to `leaders.html?open=quiz` — [course.js L196–207](course.js)

**Guide pages, "Learn it properly"**
- The card copy reads "Free, narrated and interactive — with a Certificate of Completion".
- **7 of 10 guides deep-link into gated Academy modules** (m3, m4, m5, m9, m10, m11, m12). One links to free m1 and two link to `training.html`.
- **No guide links to Leaders.**
- Source: [tools/build.py L29–83, L227–231](tools/build.py)

**Account menu**
- The account menu's "🎓 My learning" link and the nav CTA, which becomes "My learning →" once signed in, always go to `training.html`, even for someone taking only Leaders — [vh-account.js L70, L95](vh-account.js)

**Features switched off in config**
- Newsletter (Buttondown), contact form (Formspree), booking (Calendly), analytics (GoatCounter) and community (Giscus) are all empty strings in `site-config.js`.
- So the newsletter and contact form fall back to opening an email draft, the "Book a call" button stays hidden, and the community panel is hidden — [site-config.js L6–43](site-config.js)

**Toolkit**
- The toolkit HTML pages link their `.xlsx` and back to the related module (e.g. `toolkit/teardown-bom.html` → `teardown-bom.xlsx` and `training.html?open=m10`).
- Modules link only to the toolkit HTML pages, never directly to the `.xlsx` — `grep xlsx src/` found nothing.

### Inferences
- **Guide traffic.** A visitor arriving from a guide's "Learn it properly" card lands on a sign-in wall that the card copy did not mention. This is the biggest expectation gap for organic traffic.
- **Completion wall.** Requiring all 13 modules (about 6 hours) before even a first exam attempt, together with the 80% pass mark and the one-hour retake wait, is rigorous. It probably depresses certification rates. The practice exam partly offsets this.
- **Publication dependency.** Step B depends on the owner running `supabase-exam.sql` and loading the private `exam-questions.sql` before or at publication. Otherwise `start_exam` raises "The question bank is empty", and the UI shows "The exam couldn't be loaded just now". The open task list also shows "Step B tests, screenshots, approval, publish, SQL to user" as still pending.

### Gaps
- I could not check real OTP email delivery or timing, or the live Supabase configuration.

---

## Q4. Which roadmap items C–G are open, partly done or done (verified in code)?

### Takeaway
- **Done:** only the LinkedIn add-to-profile button, which already exists.
- **Partly done:** the Giscus community (coded but switched off), the xlsx links (via toolkit pages only), the Leaders readiness check (exists but is not saved), and several F topics that get one-line mentions only.
- **Open:** everything else in C to G, including analytics, CPD log, gated "Learn it" links, the "My learning" link, the missing worksheets, the capstone, drag-and-drop FAST, the labs for m3, m8 and m13, the executive pack, most of the new content, spaced recall, goals, reminders, an AI tutor and testimonials.

### Cited findings

**C · Quick wins**
- **Analytics (GoatCounter): OPEN.** A loader exists but `goatcounterCode: ""` — [site-config.js L22–25, L49–57](site-config.js)
- **LinkedIn add-to-profile: DONE.** It is on the Academy and Leaders certificate panels and on the shared `certificate.html`. It passes `organizationName` only, with no `organizationId`, so LinkedIn will not show a linked company logo — [training.js renderCertificate](training.js); [course.js renderCertificate](course.js); [certificate.html L66, L148](certificate.html)
- **CPD hours log: OPEN.** There is no CPD feature; `grep -i cpd` found nothing. Certificates state "about 6.5 hours" as text only.
- **Guide "Learn it" links into gated modules: OPEN.** 7 of 10 still point at gated modules — [tools/build.py L29–83](tools/build.py)
- **"My learning" always goes to the Academy: OPEN** — [vh-account.js L70, L95](vh-account.js)
- **Worksheets for m7, m9, m12, m13: OPEN.** None of these modules has a toolkit link. The toolkit still has the same 6 sheets plus a cheat sheet: FAST worksheet, function–cost matrix, idea capture, SAVE workshop agenda, savings funnel tracker and teardown BOM (`ls toolkit/`).
- **Toolkit xlsx linked from course: PARTLY DONE.** It is reachable in two clicks through the toolkit HTML pages; there is no direct xlsx link in any module.

**D · Applied practice**
- **Single capstone product through all six phases: OPEN.** `grep capstone` found nothing. Kettle, transmit-torque and EV motor examples recur, but there is no single connected project.
- **Drag-and-drop FAST builder: OPEN.** The m4 builder is a step-through animation with Next and Prev and a faded preview of the finished diagram; there is no `draggable` code — [training.js L652–694](training.js)
- **Labs for m3, m8, m13: OPEN.** No `data-lab` exists in these modules.

**E · Leaders executive pack**
- **Business-case xlsx: OPEN.** Only the in-page l4 calculator exists.
- **Sponsor charter: OPEN for Leaders.** A charter is mentioned only in Academy m12.
- **Board-pack slides: OPEN.**
- **Saved readiness self-assessment: PARTLY DONE.** The l5 readiness check scores and lists next steps, but nothing is saved — [leaders-labs.js L145–180](leaders-labs.js)
- **Rollout guide: OPEN.** l6 has a 90-day plan section and the printable `leaders-playbook.html`, but there is no separate rollout guide.

**F · New content.** Mentions were found with grep and read in context.
- **Value metrics / paired comparison: OPEN.** No matches.
- **LCC / NPV: PARTLY DONE (mention only).** m7 says to compute "NPV … at the company's minimum required return" and lifecycle cost is mentioned in m1 and m13. There is no worked LCC or NPV exercise — [src/academy/m7.html L68](src/academy/m7.html)
- **Customer FAST: PARTLY DONE (one paragraph)** — [src/academy/m4.html L116](src/academy/m4.html)
- **Facilitation: PARTLY DONE.** It is spread across m2, m4, m5 and m12 (facilitator role, Osborn's rules), with no dedicated facilitation unit.
- **Construction and services VE: OPEN.** There are only passing references to US federal-aid highway VE (m1, m2, m8, l4) and the `industries/` guide.
- **QFD: PARTLY DONE (one line)** — [src/academy/m3.html L42](src/academy/m3.html)
- **DFMA exercise: OPEN.** DFMA is covered as a lever, with the IBM Proprinter case in m9 and l4, but there is no exercise — [src/academy/m9.html L19–27, L175](src/academy/m9.html)
- **Ethics: PARTLY DONE.** m10 §10.11 covers "Ethics and the law" for teardown and benchmarking only; there is no general VE professional-ethics content — [src/academy/m10.html L129](src/academy/m10.html)

**G · Engagement**
- **Spaced recall: OPEN.** No scheduling logic; the practice exam is random and has no memory of missed questions.
- **Weekly goals: OPEN.**
- **Email reminders: OPEN.** There is no reminder code, and the Buttondown newsletter is unconfigured.
- **AI tutor: OPEN.**
- **Community: PARTLY DONE.** Giscus is coded but hidden because the config is empty.
- **Testimonials: OPEN.** `grep testimonial` found nothing; the only social proof is the hidden-until-at-least-1 certificate counter.

### Inferences
- **Cheap configuration-only wins:** GoatCounter, Giscus and Buttondown are already coded and only need keys in `site-config.js`.
- **Small edits:** fixing the C link items ("Learn it" copy or targets, "My learning") needs only small changes in `tools/build.py` and `vh-account.js`.

### Gaps
- The brief's roadmap labels are summaries. Where the original 2 Oct review gave more detail (for example, the exact intended scope of "value metrics"), I could not see it, so the status grades reflect the plain reading of each item.

---

## Q5. What data and analytics exist for the owner, and what cannot be measured?

### Takeaway
The owner dashboard (`admin.html`, `admin.js`, Supabase `admin_dashboard()`) covers **signed-in learners only**:
- sign-ups
- activity
- country, estimated from time zone
- device
- referral source
- progress per module
- exam and quiz attempts and pass rate
- certificates
- module feedback
- chosen role

There is **no anonymous traffic data**, because GoatCounter is off. There is also **no telemetry for media, lab, search or practice use**, and **no item-level exam data**.

### Cited findings
- **What `admin_dashboard()` returns.** One admin-only call returns:
  - users: email, name, created and last-sign-in dates, confirmed flag, timezone, language, device, source and last seen
  - Academy progress JSON and per-course progress for Leaders
  - all certificates
  - all module feedback
  - Source: [supabase-setup.sql L164–197](supabase-setup.sql)
- **Dashboard labels** (from [admin.js L314–440](admin.js)):
  - New sign-ups / sign-ups over time
  - Active learners
  - Countries (estimated from the device's time zone)
  - Phone or computer
  - "How they found VAVEhub" (first referrer)
  - Course progress ("completed each module")
  - Finished all 13 / all 7 modules
  - Exam pass rate / passed the quiz
  - Certificates issued, plus Leaders certificates
  - Module ratings / Helpful % / latest comments
  - Learner roles
  - A learners table with per-learner detail
- **Sample mode.** Sample data is shown when Supabase is absent or with `?sample` — [admin.js L103–155](admin.js)
- **Profile capture.** Timezone, language, device class and source are written once a day by `VHCloud.touchProfile()` — [vh-cloud.js ~L160–171](vh-cloud.js)
- **Exam attempts.** The `exam_attempts` table stores question IDs, option order, timestamps, score, pass/fail and per-module tallies. It does **not store the options chosen**, and the dashboard does not query it; attempts reach the dashboard via the progress JSON as score, time and pass only — [supabase-exam.sql L27–38](supabase-exam.sql); [admin.js L78–94](admin.js)

**Cannot be measured today**
- anonymous visitors, page views or guide traffic (GoatCounter is unset)
- conversion from guide or homepage to sign-up
- whether people who preview Module 1 sign up
- video plays and completion
- narration use
- lab and challenge interactions
- quick-check wrong-answer patterns (only a "passed" flag is stored)
- practice exam and flashcard use
- search queries
- time spent per module
- drop-off within a module
- question difficulty and discrimination in the exam bank
- **Leaders learners who never sign in.** The modules are open, so their progress stays in localStorage and never reaches the dashboard.

### Inferences
- **Where funnel data is missing.** The owner can see who signed up and how far they got, but not why people do not sign up, which media work, or which exam questions are flawed.
- **Cheap fixes.** Two small changes would close the biggest gaps:
  - switch on GoatCounter, with custom events
  - persist the chosen answers in `submit_exam`

---

## Q6. Are there any new issues (accessibility, mobile, performance, broken links)?

### Takeaway
Basic quality is good:
- the repository's own checks pass (208/208 across pages, links, Academy and Leaders, including axe WCAG 2 AA in dark and light themes and a 375 px phone fit)
- there is no sideways scrolling on 13 pages I checked at 375 px
- there are no script errors apart from the blocked Supabase calls

The new issues are content and copy consistency, heavy single-page payloads, captions burned into the video image rather than supplied as caption tracks, and a client-side-only exam prerequisite.

### Cited findings
- **Test results.** `node run.js pages links academy leaders` gave 208 passed and 0 failed. The `pages` suite covers 22 pages with WCAG 2 AA in both themes, a 375 px fit and no script errors — [tests/README.md](tests/README.md); local run on 14 Oct 2026
- **Mobile.** At 375 px, `scrollWidth` equalled `clientWidth` (no sideways scroll) on all 13 pages checked: home, training, leaders, toolkit, glossary, certificate, verify, two toolkit sheets, playbook, changelog, cost-levers and industries.
  - Phone page heights are long: training.html is 18,429 px and the homepage 14,589 px.
  - Source: Playwright
- **Page weight.** These are local, uncompressed first-load transfers (fonts, CSS, JS, HTML, images; no video or audio):

  | Page | First load |
  |---|---|
  | Home | about 612 KB |
  | training.html | about 1.27 MB |
  | leaders.html | about 0.96 MB |
  | auth | about 529 KB |
  | Guide page | about 332 KB |

  - The Academy is one 271 KB HTML file containing all 13 modules plus a 129 KB `training.js`, and renders 5,472 DOM elements.
  - Videos use `preload="none"`. The service worker uses network-first for pages and audio, stale-while-revalidate for assets, and never caches video — [sw.js L1–50](sw.js)
- **Stale or inconsistent copy**
  - "65-question exam bank" in `training.js` L98 and `auth.html` L65, while the exam now draws from about 130 or 132; the test at `tests/suites/academy.js` L153 still expects 65.
  - Course length is given as ≈6 h (catalogue), about 6.5 h (certificate and verify) and 5 h 43 min (sum of module times).
- **Captions.** The 8 self-hosted videos have burned-in subtitles and transcripts but no `<track>` (WebVTT) captions, so captions cannot be resized, restyled or switched off, and there is no audio description. The YouTube embeds rely on YouTube's own captions — Playwright; [src/academy/m1.html](src/academy/m1.html)
- **Exam integrity.** The requirement to finish all modules before the exam is checked only in the browser (`renderExamGate`), not in `start_exam()`. The answer key is now server-side and is not shipped to the page; the test "the quiz answers are not shipped in the page" passed — [training.js L322–333](training.js); [supabase-exam.sql L53–73](supabase-exam.sql)
- **Narration sync.** Narration is regenerated from built text. After Step A, audio was regenerated for m2, m4, m5, m6, m7, m12, m13 and l5 (commit `7ddb055`). Step B changed no module text. I did not run the narration test suite, so the remaining modules' sync is unverified — `git show --stat 7ddb055 16a93a4`
- **External dependencies.** YouTube (two embeds) and Supabase are the only runtime third parties. The Content-Security-Policy restricts frames to `youtube-nocookie.com` — [src/academy/_head.html CSP](src/academy/_head.html)

### Inferences
- **Mobile speed.** On mobile data, the 1.27 MB Academy shell plus a long single page is the main performance risk. Splitting the course into one page per module would also enable per-module analytics and SEO.
- **Fix before publishing Step B.** The stale "65" copy should be fixed before Step B is published, because Step B is what changes the number.

### Gaps
- I did not run the `modules`, `narration`, `guides` or `admin` suites, Lighthouse or Core Web Vitals, or a screen-reader walkthrough. Transfer sizes are from a local, uncompressed server, not from the GitHub Pages CDN.
