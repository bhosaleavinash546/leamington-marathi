# Practice-first learning platforms: engagement mechanics, AI tutors and the learning-science evidence (2025–2026), translated for a free value-engineering course

Method note: research was done on 2026-10-14 using WebSearch. WebFetch failed with DNS errors (`getaddrinfo ENOTFOUND` for lennysnewsletter.com and blog.duolingo.com), so **every finding below is based on search-result snippets and summaries, not full-page reads**. Figures were kept only when a snippet tied them to a named source. Where the only source was a third party (a review site, an aggregator or a forum), that is stated next to the finding. The VE course is about function analysis, FAST diagrams, should-costing and target costing, and it runs on a static site plus Supabase.

## 1. Interactive formats (manipulables, simulations, branching, worked examples with fading, projects, cases)

### Takeaway
Market leaders have moved from video to short practice where the learner manipulates something and gets feedback straight away (Brilliant, Khan exercises, DataCamp and Codecademy in-browser coding). The research backs this up: simulations with scaffolding show large effects (g≈0.85), and worked examples help novices most when they are faded into independent problem-solving. For a VE course, the closest analogue is a "manipulate the cost model or FAST diagram, get feedback" lab, introduced through worked examples that fade.

### Cited Findings
- Brilliant's core format is short interactive problem-solving, not video lectures. In most lessons the learner manipulates something on screen, with visual models, immediate feedback and step-by-step explanations — [Brilliant review (cedarlila Substack)](https://cedarlila.substack.com/p/a-review-brilliant); [makeheadway Brilliant review](https://makeheadway.com/blog/brilliant-review/) (third-party reviews).
- Brilliant markets itself as "Learn by doing" and claims its interactive approach helps people master concepts in less time. It cites a "6x more effective than watching lecture videos" figure, which is the company's own claim and was not independently verified — [brilliant.org](https://brilliant.org); [Wikipedia: Brilliant](https://en.wikipedia.org/wiki/Brilliant_(website)).
- By 2025 Brilliant focused on active STEM learning and did not offer certifications — [Wikipedia: Brilliant](https://en.wikipedia.org/wiki/Brilliant_(website)).
- Brilliant has an AI tutor called "Koji" that gives step-by-step guidance (third-party report) — [itechguides Brilliant review](https://www.itechguides.com/best/mooc-platforms/brilliant/).
- A Brilliant reviewer who used the app daily for six months criticised it: some answers were wrong or had no single right answer, so passing meant guessing what the app wanted. **Lesson: auto-graded manipulables need careful answer design** — [cedarlila Substack review](https://cedarlila.substack.com/p/a-review-brilliant).
- DataCamp offers "Practice" sessions of hands-on exercises worth up to 250 XP each, with XP rewards that may decrease on repeat completions — [DataCamp Help: Practice](https://support.datacamp.com/hc/en-us/articles/28562143877015); [DataCamp Help: XP](https://support.datacamp.com/hc/en-us/articles/34043400793495-Understanding-XP-and-Progress-on-DataCamp).
- Codecademy offers AI-powered hints and help as learners work through select practice projects — [Codecademy blog](https://www.codecademy.com/resources/blog/?p=13738).
- **Simulations:** Chernikova et al. (2020, *Review of Educational Research* 90(4):499–541) meta-analysed 145 studies (409 effect estimates) of simulation-based learning in higher education. They found an overall effect of **g = 0.85** (95% CI 0.69–1.02). Scaffolding and technology both had positive effects. **Learners with low prior knowledge benefited more from worked examples, and those with high prior knowledge from reflection phases.** Effects held across medical education, teacher education and management — [TUM portal](https://portal.fis.tum.de/en/publications/simulation-based-learning-in-higher-education-a-meta-analysis/); [LMU PDF](https://epub.ub.uni-muenchen.de/84298/1/0034654320933544.pdf).
- **Worked examples and fading:** Renkl & Atkinson (2003) proposed fading, in which problem-solving steps are gradually added to example study until the learner works alone — [MIT Open Learning: worked and faded examples](https://openlearning.mit.edu/mit-faculty/research-based-learning-findings/worked-and-faded-examples); [Wikipedia: Worked-example effect](https://en.wikipedia.org/wiki/Worked-example_effect).
- **Expertise reversal (Kalyuga et al. 2003):** examples beat problem solving for novices early on, but the advantage disappears as expertise grows, because the worked steps become redundant — [Wikipedia: Expertise reversal effect](https://en.wikipedia.org/wiki/Expertise_reversal_effect); [ASU PDF](https://faculty.engineering.asu.edu/mre/wp-content/uploads/sites/31/2020/02/Exp_Rev_LI06.pdf).
- In tutored problem solving, Salden, Aleven, Schwonke & Renkl found the ranking **adaptive fading > fixed fading > problem solving only** — [Heriot-Watt research portal](https://researchportal.hw.ac.uk/en/publications/the-expertise-reversal-effect-and-worked-examples-in-tutored-prob/); [Wikipedia: Worked-example effect](https://en.wikipedia.org/wiki/Worked-example_effect).
- **Active learning in general:** Freeman et al. (2014, PNAS) meta-analysed 225 STEM studies. Exam performance rose by 0.47 SD (about 6% higher average scores) under active learning. Students in traditional lectures were 1.5× more likely to fail (odds ratio 1.95). Press coverage reports failure rates of 33.8% for lecture versus 21.8% for active learning — [Freeman et al. PDF](https://cdn.serc.carleton.edu/files/nagt/profdev/twp/sanbernardino/freeman_et_al._2014.pdf); [Campus Technology](https://campustechnology.com/articles/2014/05/14/55-more-stem-students-fail-lectures-than-courses-with-active-learning.aspx).

### Inferences
- VE translations:
  - (a) **FAST-diagram builder:** the learner drags functions into How–Why order, and the logic is checked by asking "how?" and "why?" questions.
  - (b) **Should-cost calculator lab:** the learner changes material, cycle time and labour rate and sees the cost build-up change.
  - (c) **Target-costing waterfall:** market price minus target margin gives the allowable cost, which is then allocated to functions.
  - (d) **Function-cost matrix exercise:** the learner spots functions with poor value.
- Make each of these a worked example first, then partly completed, then blank. This follows the fading and expertise-reversal evidence.
- **Branching case scenarios fit VE well**, for example a supplier pushback during a should-cost negotiation, or choosing which idea to take forward from an idea register. This is a simulation with scaffolding, which is the category Chernikova found effective.
- Brilliant's criticism suggests VE manipulables should accept ranges or tolerances in numeric answers, and should explain why several answers can be acceptable, especially for FAST diagrams, where more than one valid diagram exists.

### Gaps
- I found no direct experimental evidence on **branching scenarios** as a separate format, beyond the simulation meta-analysis.
- No 2025 primary source described a Brilliant course redesign; only undated app release notes turned up.
- I found no independent evidence for portfolio or project-based learning effects in online self-paced courses.

## 2. Mastery and assessment (mastery levels, adaptive practice, spaced/retrieval practice, diagnostics, skill assessments, certification and renewal)

### Takeaway
Khan Academy uses an explicit 3-level mastery model in which skills can level down. Duolingo personalises review with a trained spaced-repetition model. Certification platforms (Google Skillshop, HubSpot, DataCamp) use timed exams with expiry and recertification. This creates a reason to return, and it also builds in spaced retrieval at the scale of years.

### Cited Findings
- **Khan Academy mastery:** each skill is worth 100 Mastery Points. Familiar = 50, Proficient = 80, Mastered = 100. Reaching Proficient requires all questions on that skill correct in an exercise, quiz, unit test or challenge. Reaching Mastered requires starting from Proficient and getting all questions correct on a **Unit Test or Course Challenge**. Missing questions on a quiz, test or challenge can **drop** a skill's level — [Khan Academy Help: Course and Unit Mastery](https://support.khanacademy.org/hc/en-us/articles/115002552631).
- Khan courses have a **Course Challenge**, an assessment that samples skills across the whole course. It works as a placement or diagnostic shortcut — [Khan Academy Help](https://support.khanacademy.org/hc/articles/115002552631-What-are-Course-and-Unit-Mastery-).
- Khan Academy claims that "recommended use" produces about 20% higher than expected learning gains. This is a platform-level claim, not one about Khanmigo — [Khan Academy annual report](https://www.annualreport.khanacademy.org/) (as summarised in search results).
- **Duolingo spaced repetition:** Settles & Meeder (ACL 2016) introduced half-life regression (HLR), which estimates the "half-life" of each word in memory. HLR cut prediction error by more than 45% against baselines. Duolingo reports that HLR's error rate is nearly half that of its earlier Leitner system, and that A/B tests showed a **12% increase in overall daily activity**. Data and code were released — [ACL paper P16-1174](https://preview.aclanthology.org/fix_video/P16-1174.pdf); [Duolingo blog: how we learn how you learn](https://blog.duolingo.com/how-we-learn-how-you-learn) (snippet only).
- A 2026 follow-up (Ilídio et al., PMLR v339) proposed mixed-effects HLR feeding a Random Forest, with better predictive performance — [PMLR](https://proceedings.mlr.press/v339/ilidio26a.html).
- **DataCamp certifications** combine timed exams with a practical exam. For example, the AI Engineer for Data Scientists Associate has two timed exams of about 2 hours each, plus a 4-hour, auto-graded Python practical based on a real-world scenario. Candidates have 30 days after registering, 2 attempts per exam, and a 14-day wait before the process resets — [DataCamp Help: AI Engineer for Data Scientists Associate](https://support.datacamp.com/hc/en-us/articles/28387647483671-AI-Engineer-for-Data-Scientists-Associate); [DataCamp Help: What are DataCamp Certifications?](https://support.datacamp.com/hc/en-us/articles/7633418410519).
- **Google Skillshop:** all certifications are valid for **one year** from issue unless the certificate says otherwise. Holders must recertify, and Google notifies them before expiry — [Google Skillshop Help](https://support.google.com/skillshop/answer/7378254?hl=en).
- **HubSpot Academy:** community posts say certifications last 13 or 25 months depending on the expertise level, with technical software certifications on the 13-month cycle. Another HubSpot page says recertified credentials are valid for two years. To renew, learners retake the course and pass the exam again. **These sources partly conflict and are older; check them** — [HubSpot Community](https://community.hubspot.com/t5/Academy-Support/Length-of-Certification/m-p/313127); [HubSpot Academy: New Certification Time Frames](https://academy.hubspot.com/certification-timeline-update); [HubSpot Certifications FAQ](https://academy.hubspot.com/certifications/support).
- A HubSpot exam format of 60 multiple-choice or true/false questions with a **75% pass mark** (45/60) is reported by a third-party study guide — [ideagrove HubSpot study guide](https://ideagrove.com/blog/hubspot-certification-study-guide).
- Codecademy gives certificates for completing courses and paths, reportedly on paid plans only (third-party source), and offers certification-prep paths (AWS, CompTIA Security+, Microsoft) — [todaytesting Codecademy review](https://todaytesting.com/codecademy-review/).

### Inferences
- For VE, use a **3-level mastery state per skill**: Familiar after the quick check, Proficient after an applied exercise, Mastered after passing the skill again on a later module test or the final exam. Skills such as function definition (verb–noun), FAST logic, cost-worth ratio, should-cost build-up and target-cost allocation can each **decay** if missed in a later test. This copies Khan's design and builds in retrieval practice.
- A **course challenge or placement test** lets experienced engineers skip ahead. This respects expertise reversal and cuts drop-off among experienced practitioners.
- A **12-month certificate validity with a short recertification quiz** (the Skillshop model) gives learners a reason to return and spaced retrieval over the long term. For a free course, keep it optional or use a "current or expired" badge on the verify page, so learners are not pushed away.
- A full HLR model is unnecessary at this scale. A simple Leitner-style schedule or expanding intervals (1, 3, 7, 21 days) per skill is enough, since Duolingo's improvement over Leitner was in prediction accuracy at very large scale.

### Gaps
- I could not confirm whether DataCamp certifications expire, or the official Skillshop pass mark and retake wait (one third-party blog says 1 day).
- I found no independent evaluation of Khan's mastery system on its own, separate from Khan practice overall.
- No details were found on Duolingo's "Birdbrain" model beyond a Japanese press mention.

## 3. Motivation mechanics (streaks, freezes, leagues/XP, goals, notifications, social) and their downsides

### Takeaway
Streaks are the best-documented retention lever, mostly through Duolingo's own A/B tests. The effects are real but modest (single-digit percentages), and the headline "3.6×" figure is correlational. Leagues and competition are the most common source of reported anxiety, while streak stress shows up mainly in self-reports. Optimised notifications gave small but real DAU gains at Duolingo's scale.

### Cited Findings
- **Streak and completion:** Duolingo says learners who reach a 7-day streak are **3.6× more likely to complete their course**. This is **correlational**: it does not show the streak causes completion — [Duolingo blog: how the streak builds habit](https://blog.duolingo.com/how-duolingo-streak-builds-habit).
- A streak-milestone animation raised the chance that a brand-new learner was still active on day 7 by **+1.7%** — [Duolingo blog: how the streak builds habit](https://blog.duolingo.com/how-duolingo-streak-builds-habit).
- Separating the daily goal from the streak (A/B test) gave **+3.3% relative Day-14 retention**, +1% daily active learners and +10.5% in the share of daily learners on a streak — [Duolingo blog: improving the streak](https://blog.duolingo.com/improving-the-streak).
- **Streak Wager** (betting on keeping the streak) produced statistically significant retention gains at D1, D7 and D14, with the largest at **D7 (+14%)** — [Duolingo making blog: how streaks keep learners committed](https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals).
- **Streak Freeze:** learners can equip up to two at once — [Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit). The claim that allowing two freezes increased DAU by **+0.38%** comes from a single LinkedIn post and could not be verified against Duolingo material — [LinkedIn](https://es.linkedin.com/in/ali-ahmed-8a96a4183). The Weekend Amulet claims (4% more likely to return, 5% less streak loss) come from an unsourced fan guide — [duolingoguides.com](https://duolingoguides.com/duolingo-streak-strategy/).
- **Notifications:** Yancey & Settles (KDD 2020) describe a "Recovering Difference Softmax" bandit that chooses reminder content across millions of daily notifications. They report **+0.5% total DAU and +2% new-user retention** over a strong baseline, and say novelty effects make naive bandits unsuitable — [Duolingo Research PDF](https://research.Duolingo.com/papers/yancey.kdd20.pdf); [Papers with Code](https://paperswithcode.com/paper/a-sleeping-recovering-bandit-algorithm-for).
- **Leagues:** a weekly leaderboard of about 30 randomly assigned users ranked by XP over 7 days, with 10 tiers and a Sunday–Sunday cycle. **No published Duolingo data isolating the effect of leagues was found** — [Deconstructor of Fun teardown](https://duolingo.deconstructoroffun.com/mechanics/leagues); [We Got This Covered](https://wegotthiscovered.com/fyi/all-duolingo-leagues-explained/).
- **DataCamp:** a daily streak needs 250 XP, roughly one lesson, four exercises or a practice session. It resets at local midnight unless a streak freeze is in place. XP comes from courses, projects, practice and streaks, and never expires. A 2025 roadmap mentioned "Flawless streaks", meaning whole weeks of uninterrupted learning — [DataCamp Help: Daily Streaks](https://support.datacamp.com/hc/en-us/articles/360014799594-DataCamp-s-Daily-Streaks); [DataCamp Help: Streak freezes](https://support.datacamp.com/hc/en-us/articles/27165027716887-Streak-freezes); [DataCamp Q2 2025 roadmap webinar PDF](https://media.datacamp.com/cms/webinar-_-2025-06-12-_-datacamp-quarterly-roadmap-2025q2-_-lynn-heidberg--richie-cotton.pdf).
- **Brilliant:** a day counts towards the streak after 3 problems or 1 full lesson. Missing a day resets the streak unless a "streak charge" is used. Brilliant also has XP, weekly leagues and leaderboards. The free plan is limited to 2 lessons or practice sets per day, and Premium is about $30/month or $240/year (third-party; Wikipedia says $24.99/month or $299.88/year, which conflicts) — [Brilliant Help: What is a streak?](https://brilliant.org/help/using-brilliant/what-is-a-streak); [itechguides](https://www.itechguides.com/best/mooc-platforms/brilliant/); [Wikipedia](https://en.wikipedia.org/wiki/Brilliant_(website)).
- **Downsides:** a qualitative study (forum posts plus 15 interviews) on misuse of Duolingo gamification found users reporting apprehension and stress about league rankings, and gamification "spoiling" learning when users chase points instead — [arXiv 2203.16175](https://arxiv.org/pdf/2203.16175).
- Other sources report that some users feel pressure or anxiety from maintaining rankings or streaks (mixed-methods thesis), and that leaderboards can cause anxiety or frustration for struggling learners (literature review) — [UKWMS thesis](https://repositori.ukwms.ac.id/47113/6/BAB%205.pdf); [Essex repository, Jabbari et al.](https://repository.essex.ac.uk/41011/1/Jabbari%2C%20Zarrinabadi%2C%20%26%20Amini%20%28accepted%20copy%29.pdf).
- Press commentary quotes a researcher saying that once the streak becomes a habit, breaking it "can create stress and anxiety" — [AOL/Guardian-syndicated piece](https://www.aol.com/m-duolingo-addict-language-app-063000890.html).
- An Android Authority piece criticises Duolingo's XP Boost as a "UX trap" (snippet only) — [Android Authority](https://androidauthority.com/duolingo-xp-boost-ux-trap-3674572).
- A user review of Brilliant said leagues and streaks were "not necessary or valuable" — [itechguides summary of Play Store reviews](https://www.itechguides.com/best/mooc-platforms/brilliant/).
- **Social presence:** in a study of 143 college students using Duolingo alongside a class, app use was higher in face-to-face classes, which suggests teacher presence and peer immediacy support engagement — [CALL-EJ](https://callej.org/index.php/journal/issue/download/64/9).

### Inferences
- For a professional VE audience, **weekly goals** (e.g. "2 labs per week", similar to DataCamp's "Flawless weeks") fit working engineers better than a daily streak, and carry less risk of streak anxiety. If there is a streak, give it automatic freezes or weekend grace, and **separate the goal from the streak**, which is the one Duolingo change with published A/B data.
- **Avoid public leagues and leaderboards.** They have the clearest evidence of anxiety, and a free niche course has too few concurrent learners to fill 30-person cohorts. Private progress, mastery points and a "skills mastered" map are safer.
- Show milestone moments (e.g. "first FAST diagram completed", "3 should-costs built"), similar to Duolingo's +1.7% D7 milestone animation.
- Use few notifications: a single email nudge (e.g. a "your review is due" spaced-retrieval reminder) is supported by Duolingo's finding that reminder optimisation helps. The effect sizes, though, are small (+0.5% DAU), so it is not worth building complex logic.

### Gaps
- No controlled study measuring streak anxiety was found.
- No primary data isolating the effect of Duolingo Leagues was found.
- No primary Duolingo figure for Streak Freeze was confirmed.
- No HubSpot Academy or Skillshop engagement mechanics beyond certification were documented in the results (e.g. whether they use streaks at all).

## 4. AI tutors (Khanmigo, Duolingo Max, Codecademy/DataCamp assistants): design, guardrails, cost, evidence

### Takeaway
The main AI tutors are designed to give hints and ask Socratic questions rather than hand over answers. They are cheap for learners or free for teachers, often funded by subsidy. The best independent evidence so far is a two-year randomised trial of Khanmigo (NBER 2026), which found **no added learning beyond ordinary Khan Academy practice**, largely because students rarely used it for substantive help.

### Cited Findings
- **Khanmigo design:** it responds with prompts, hints and nudges rather than solutions, a Socratic approach meant to stop students copying answers — [tooldirectory.ai Khanmigo](https://tooldirectory.ai/tools/khanmigo); [numaschool glossary](https://numaschool.com/learn/glossary/khanmigo) (third-party).
- **Khanmigo moderation:** moderation technology flags inappropriate, harmful or unsafe content. Alerts go to the parent on family accounts, or to the assigning teacher on district accounts, with optional emails to district admins above a severity threshold. Flagged images are shown as AI-generated descriptions, and Khan notes no automated system is perfect — [Khan Academy Help article 14394569357069](https://support.khanacademy.org/hc/tr/articles/14394569357069).
- **Khanmigo cost:**
  - Khanmigo for Teachers was made **free for US K-12 educators from 21 May 2024**, after previously costing $4/month. Microsoft donated Azure OpenAI compute — [THE Journal](https://thejournal.com/Articles/2024/05/21/Microsoft-Khan-Academy-Partner-to-Make-Khanmigo-Teaching-Tool-Free.aspx); [GeekWire](https://www.geekwire.com/2024/microsoft-and-khan-academy-partner-on-khanmigo-ai-tool-for-teachers-in-cloud-shift/).
  - The families plan costs **$4/month or $44/year**, covers up to 10 children with chat-history visibility and safety alerts, and is US-only — [khanmigo.ai/parents](https://www.khanmigo.ai/parents); [Khan Academy Help](https://support.khanacademy.org/hc/nl/articles/25921448458893).
- **Khanmigo evidence:**
  - An RCT in 18 Tennessee middle schools over two years (remedial maths) raised achievement by about 1.3 national percentile ranks per term, roughly **0.06–0.08 SD per year**. These gains **resemble those from Khan Academy without AI**, and the tutor was rarely used for substantive maths dialogue — [NBER w35620](https://www.nber.org/papers/w35620); [EdWorkingPaper ai26-1551](https://edworkingpapers.com/sites/default/files/ai26-1551.pdf).
  - Hechinger Report summarised this as "Khan Academy appeared to help, but the Khanmigo tutor didn't add anything". Sal Khan said it matched internal data showing low engagement with Khanmigo — [Hechinger Report](https://hechingerreport.org/proof-points-khanmigo-math-ai-tutor/).
  - FutureEd reported that most students who tried Khanmigo's tutor did not want its help — [FutureEd](https://www.future-ed.org/students-tried-khanmigos-ai-tutor-most-didnt-want-its-help/).
  - A small physics study (Eastern Kentucky University, Oct 2025, n=69 undergraduates) found learning gains in all conditions but **no significant difference** for Khanmigo. Students saw it as a supplement — [EKU Encompass](https://encompass.eku.edu/fs_research/782).
- **Duolingo Max:**
  - The AI tier includes Video Call (a live AI conversation with the character "Lily") and Roleplay. Third-party sources put it at about **$29.99/month or $167.99/year** (family plan about $240/year), and note that Duolingo does not publish the price on its website — [storylearning Duolingo Max review](https://storylearning.com/duolingo-max-review); [artificial-intelligence-wiki](https://artificial-intelligence-wiki.com/industry-ai/ai-in-education/duolingo-max-pricing/).
  - "Explain My Answer" was reportedly made free for all users by 2026; older 2025 guides list it as Max-only (third-party, conflicting) — [beginnersinai](https://beginnersinai.org/duolingo-max-explained/).
- **Codecademy AI Learning Assistant:** explains what caused an error and how to fix it, helps "unpack mistakes", and gives AI hints on select practice projects — [Codecademy blog](https://www.codecademy.com/resources/blog/?p=13738). A third party says it gives hints "without giving [the solution] away" — [toolmage](https://www.toolmage.com/en/tool/codecademy/).
- **DataCamp AI assistant:** an anecdotal user comment says it gives 15 free prompts and then needs a separate subscription. This is unverified and possibly outdated — [OzBargain](https://www.ozbargain.com.au/node/948534). A third-party review puts DataCamp at "$300+ annually" — [listpoint DataCamp review](https://www.listpoint.co.uk/datacamp-review-2025-complete-analysis-of-features-pricing-and-user-experience-for-data-science-learning/).

### Inferences
- An AI tutor is **not the highest-value addition** for a single-author VE course. The strongest RCT shows no added learning, and the risk is low uptake. Its value is in **targeted, in-context uses** like Codecademy's "explain my error": when a learner's FAST diagram or should-cost answer is wrong, an AI explains why without giving the full answer.
- If one is built, use a **Socratic system prompt** (ask for the learner's reasoning first, give graded hints, never output a full FAST diagram or final cost), **rate limits** (DataCamp-style prompt quotas), and **logging** to Supabase for review. A Supabase Edge Function proxying an LLM API keeps the key server-side.
- **Cheaper alternative with similar benefit:** pre-written, error-specific feedback for common VE mistakes, such as functions written as nouns not verb–noun, mixing "how" and "why" directions, or applying overhead to material cost twice. This is deterministic and free to run.

### Gaps
- I found no published learning-outcome study for Duolingo Max, Codecademy's assistant or DataCamp's assistant.
- I found no official, current DataCamp AI assistant documentation or pricing.
- I could not see the full NBER paper (only the abstract and summaries), so details such as usage rates were not verified beyond the snippets.

## 5. Learning-science evidence (retrieval, spacing, interleaving, worked examples, multimedia, video length, testing effect)

### Takeaway
The most robust, transferable findings are practice testing and distributed practice (both "high utility" in Dunlosky et al. 2013). Interleaving and self-explanation are moderate. For media, Mayer's coherence, signalling, segmenting and redundancy principles have repeated support. Video engagement falls sharply after about 6 minutes (Guo et al. 2014). Rereading, highlighting and summarising are low utility.

### Cited Findings
- **Dunlosky et al. (2013), *Psychological Science in the Public Interest* 14(1):4–58**, reviewed 10 techniques:
  - **High utility:** practice testing and distributed practice. They benefit learners of different ages and abilities and boost performance across many criterion tasks and in educational settings.
  - **Moderate utility:** elaborative interrogation, self-explanation and interleaved practice.
  - **Low utility:** summarisation, highlighting/underlining, rereading, the keyword mnemonic and imagery for text.
  - Sources — [APS press release](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html); [CiteDrive DOI 10.1177/1529100612453266](https://www.citedrive.com/en/discovery/improving-students-learning-with-effective-learning-techniques).
- **Testing effect (Roediger & Karpicke 2006):** students studied prose and either took recall tests (without feedback) or restudied. On a 5-minute test, restudying won. **On tests at 2 days and 1 week, prior testing produced substantially greater retention** than restudying — [Roediger & Karpicke 2006 PDF](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf); [APS Observer: test-enhanced learning](https://www.psychologicalscience.org/observer/test-enhanced-learning). (The exact 1-week percentages were not in the snippets.)
- **Spacing (Cepeda et al. 2006, *Psychological Bulletin* 132:354–380):** 839 assessments across 317 experiments in 184 articles. The **optimal gap between sessions increases as the retention interval increases** — [Cepeda et al. 2006 PDF](https://www.evullab.org/pdf/CepedaPashlerVulWixtedRohrer-PB-2006.pdf); [York University listing](https://www.yorku.ca/ncepeda/publications/CPVWR2006.html).
- **Spacing (Cepeda et al. 2008/2009 follow-up):** an optimal gap improved final recall by **up to 150%**. Accuracy first rose sharply with longer gaps and then declined gradually. (The common "10–20% of the retention interval" heuristic could not be verified in these sources.) — [Cepeda et al. 2009 PDF](https://home.cs.colorado.edu/~mozer/Research/Selected%20Publications/reprints/Cepedaetal2009.pdf).
- **Interleaving:** Rohrer & Taylor (2007, *Instructional Science* 35:481–498), "The shuffling of mathematics practice problems boosts learning". A 2014 classroom study with 140 grade-7 students over 9 weeks found interleaved practice beat blocked practice on an unannounced test two weeks later (**72% vs 38%, d = 1.05**). Rohrer, Dedrick & Stershic (2015, *J. Educ. Psych.* 107:900–908) replicated the effect. Caveat: most evidence measures short-term retention, and year-long effects are unclear — [Rohrer 2014 PDF](https://Www.Gwern.net/doc/psychology/spaced-repetition/2014-rohrer.pdf); [Chartered College summary](https://my.chartered.college/research-hub/how-interleaving-can-help-students-retain-maths-knowledge/); [IES replication award](https://ies.ed.gov/use-work/awards/systematic-replication-study-interleaved-mathematics-practice).
- **Worked examples and fading:** see Section 1. Fading is supported, adaptive fading works best, and examples become redundant as expertise grows — [Wikipedia: Worked-example effect](https://en.wikipedia.org/wiki/Worked-example_effect); [Heriot-Watt](https://researchportal.hw.ac.uk/en/publications/the-expertise-reversal-effect-and-worked-examples-in-tutored-prob/).
- **Mayer multimedia principles (median effect sizes):**
  - Coherence: d≈0.86 (23/23 tests), or 0.70 in a later review.
  - Signalling: 0.41 (24/28 tests), or 0.46 in a later review.
  - Redundancy: 0.86–0.87.
  - Segmenting: 0.70 (single source).
  - Multimedia (words plus pictures vs words alone): 1.39–1.67.
  - Sources differ by edition and review — [Cambridge Handbook of Multimedia Learning chapter](https://resolve-he.cambridge.org/core/books/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E); [Brom & Hannemann slides](https://ksvi.mff.cuni.cz/amulab/wp-content/uploads/2018/11/MultimLn3_BromHannemann_181117.pdf); [Dartmouth: Mayer's 12 principles](https://services.dartmouth.edu/TDClient/1806/Portal/KB/PrintArticle?ID=171655).
- **Video length (Guo, Kim & Rubin 2014, ACM Learning@Scale):**
  - The study covered 6.9 million video-watching sessions across 4 edX courses.
  - **Shorter videos are more engaging, and engagement drops sharply after about 6 minutes.** The main recommendation is to segment videos into chunks under 6 minutes.
  - Informal talking-head videos and Khan-style tablet drawing were more engaging than slides.
  - High-quality pre-recorded classroom lectures did not make engaging online videos.
  - Sources — [Guo et al. 2014 PDF (MIT)](https://up.csail.mit.edu/other-pubs/las2014-pguo-engagement.pdf); [Rochester PDF](https://www.cs.rochester.edu/hci/pubs/pdfs/edX-MOOC-video-production-and-engagement_LAS-2014.pdf); [Streaming Media](https://www.streamingmedia.com/Articles/Editorial/Featured-Articles/With-Online-Video-the-Classroom-Becomes-a-Laboratory-99686.aspx).
- **Active learning:** Freeman et al. 2014 — see Section 1 ([PDF](https://cdn.serc.carleton.edu/files/nagt/profdev/twp/sanbernardino/freeman_et_al._2014.pdf)).
- **Simulations:** Chernikova et al. 2020, g = 0.85 — see Section 1 ([LMU PDF](https://epub.ub.uni-muenchen.de/84298/1/0034654320933544.pdf)).

### Inferences
- **Highest-value VE design moves, by strength of evidence:**
  - (1) Quick retrieval checks after every concept, plus a delayed review of earlier modules (testing plus spacing).
  - (2) Spaced review prompts days or weeks later.
  - (3) Interleaved mixed-practice sets, e.g. "Is this a basic or secondary function?", "Which cost driver?" and "Is this a valid How–Why link?" mixed together rather than in separate blocks.
  - (4) Worked examples that fade into labs.
  - (5) Videos under 6 minutes, with signalling (highlighted FAST nodes) and no decorative extras (coherence).
- Practice exams should feed back **why** an answer is wrong. Roediger & Karpicke saw benefits even without feedback, but feedback is the norm in the applied literature. Note that this last point was not directly sourced here.
- Since rereading and highlighting are low utility, avoid long text-only guide pages without embedded checks.

### Gaps
- Exact Roediger & Karpicke 1-week percentages were not retrieved.
- No source confirmed the "10–20% of retention interval" spacing rule.
- I found no study testing these principles in engineering cost or value-engineering training specifically.
- Kapur's productive failure, Bjork's desirable difficulties and self-explanation-prompt studies were not searched within the tool-call budget.

## 6. Feasibility for a single author on a static site plus Supabase

### Takeaway
Most evidence-backed mechanics (retrieval checks, spaced review, mastery levels, faded worked examples, weekly goals, certificate expiry) are **low to medium effort** with client-side JavaScript plus Supabase tables, RPCs and row-level security. AI tutoring, adaptive algorithms like HLR, and social leagues are **high effort** and have weak evidence at this scale.

### Cited Findings
- The underlying mechanics and evidence are cited in Sections 1–5. No external source assessed feasibility for a static site plus Supabase specifically, so this section is mostly inference.

### Inferences
| Mechanic | Evidence strength | Effort | Implementation sketch (static site + Supabase) |
|---|---|---|---|
| Inline retrieval checks with explanatory feedback | High (Dunlosky; Roediger & Karpicke) | Low | JS question banks; record attempts in a `quiz_attempts` table |
| Spaced review queue ("3 cards due today") | High (Dunlosky; Cepeda) | Low–Med | `skill_reviews(user, skill, due_at, interval)` with a Leitner or expanding-interval update in an RPC; dashboard widget |
| Interleaved mixed-practice sets / practice exam drawing from all modules | Moderate–High (Rohrer) | Low | Shuffle across module banks (stratified draw) |
| 3-level mastery per skill (Khan model), with decay on later misses | Indirect (Khan design; testing effect) | Med | `skill_mastery` table; update levels from quiz/exam RPC results; skill map UI |
| Placement test / course challenge to skip modules | Indirect (expertise reversal) | Low–Med | Reuse the exam engine; mark skills Proficient on pass |
| Worked example → faded → blank labs (FAST, should-cost, target cost) | High for novices (Renkl; Kalyuga; Salden) | Med | Three variants per lab with pre-filled fields hidden step by step; adaptive fading = skip the faded step if the first attempt is correct |
| Manipulable labs / simulations with scaffolding | High (Chernikova g=0.85) | Med–High per lab | Client-side calculators and SVG drag-and-drop; tolerance-based checking |
| Branching case scenarios (supplier negotiation, idea selection) | Moderate (simulation evidence) | Med | JSON scenario graph rendered by one generic JS engine |
| Short videos (<6 min) with signalling | Moderate (Guo; Mayer) | Med (production) | Embed; chapter long videos |
| Weekly goal plus gentle streak with auto-freeze or weekend grace | Moderate, company A/B data (Duolingo) | Low | Compute from activity timestamps in a SQL view; no penalties |
| Milestone celebrations / badges | Weak–moderate (Duolingo +1.7% D7) | Low | Client-side triggers on mastery events |
| Email review reminders | Small effect (Yancey & Settles +0.5% DAU) | Med | Supabase scheduled Edge Function + email provider; opt-in only |
| Certificate with 12-month validity + recertification quiz (Skillshop model) | Indirect (spaced retrieval; industry practice) | Low–Med | `expires_at` on certificates; verify page shows current or expired; short recert quiz |
| Public leagues / leaderboards | Weak, with documented anxiety | Med | Not recommended for a niche professional audience |
| AI Socratic tutor / "explain my mistake" | Weak (Khanmigo RCT null over base practice) | High (cost, guardrails, moderation) | Edge Function proxy, Socratic prompt, rate limit, logging; or pre-written error-specific feedback (Low effort) |
| Personalised HLR-style model | Strong only at Duolingo scale | High | Not justified; use fixed expanding intervals |

### Gaps
- No benchmark data on completion or retention for free niche professional courses (e.g. VE or cost engineering) was found to set realistic targets.
- I did not verify current Supabase pricing or limits for scheduled functions and email.
