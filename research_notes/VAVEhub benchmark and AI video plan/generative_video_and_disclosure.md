# Generative text/image-to-video for realistic b-roll in a value engineering course, plus disclosure, ethics and accessibility rules (as of October 2026)

Research method note: done on 14 October 2026. WebFetch could not reach any primary site. DNS failed for ai.google.dev, support.google.com and www.w3.org with `getaddrinfo ENOTFOUND`. Most findings below therefore rest on WebSearch result snippets, and many of those come from third-party aggregators, resellers or law-firm summaries rather than vendor or regulator pages. Each item says where that applies. The W3C WCAG and EUR-Lex URLs are cited as the canonical texts, but they could not be fetched in this session. Check every price on the vendor's own page before you budget.

## 1. Tool-by-tool: access, pricing, clip length, resolution, audio, consistency, image-to-video, text rendering, commercial terms, watermarks

### Takeaway
Since OpenAI shut Sora down (app April 2026, API 24 Sept 2026), the realistic options are Google Veo 3.1, Kling 3.0 and Runway Gen-4.5, with Luma Ray3.x and Pika as cheaper alternatives. Veo 3.1 on Vertex AI is the safest commercial choice: output ownership sits with the customer, Google offers an IP indemnity, audio is native, and output goes to 1080p/4K. Kling 3.0 is rated best for natural human motion. Runway Gen-4.5 is natively 720p. Most of the price figures came from aggregators and conflict with each other, so treat them as indicative only.

### Cited Findings

**Google Veo 3.1 (Gemini API / Vertex AI / Flow)**
- Gemini API rate card cited by several 2026 sources (one says it read Google's Gemini API pricing page on 2026-09-11):
  - Veo 3.1 Standard: $0.40/s at 720p and 1080p, $0.60/s at 4K.
  - Veo 3.1 Fast: $0.10/s at 720p, $0.12/s at 1080p, $0.30/s at 4K.
  - Veo 3.1 Lite: $0.05/s at 720p, $0.08/s at 1080p, no 4K.
  - An 8-second clip therefore costs roughly $0.40 to $4.80.
  - Sources: [benchlm.ai](https://benchlm.ai/media-pricing/veo); [magichour.ai](https://magichour.ai/blog/veo-3-pricing); [cloudzero.com](https://www.cloudzero.com/blog/veo-3-pricing/); [wavespeed.ai](https://wavespeed.ai/blog/cost-and-billing/google-veo-3-pricing/)
- Sources disagree on price. veo3gen.app quotes $0.75/s on Vertex and the Gemini API, which looks outdated next to the other figures ([veo3gen.app](https://www.veo3gen.app/blog/veo-3-1-pricing-plans)).
- Sources say the Gemini API has no free tier for video ([wavespeed.ai](https://wavespeed.ai/blog/cost-and-billing/google-veo-3-pricing/)). One comparison lists Flow and Google AI subscriptions ranging from free to $249/month ([veo3ai.io](https://www.veo3ai.io/blog/veo-3-pricing-2026)).
- Reviewers credit Veo 3.1 with synchronised native audio, strong physics, clean prompt alignment and 4K ([benchr.org](https://benchr.org/articles/best-ai-for-video); [tech-insider.org](https://tech-insider.org/best-ai-video-generator-2026/)).
- Watermark: Google's generative models, Veo included, apply SynthID by default. SynthID is an invisible pixel-level watermark, not metadata ([writehuman.ai](https://writehuman.ai/blog/synthid-explained)).
- Since 19 May 2026, Google Lens, AI Mode and Circle to Search can report whether a file carries SynthID or C2PA credentials ([writehuman.ai](https://writehuman.ai/blog/synthid-explained)).
- I found no source confirming that Veo or Flow output also embeds C2PA Content Credentials (see Gaps).
- Ownership and indemnity: Google does not claim ownership of generated output ([terms.law comparison](https://terms.law/ai-output-rights/comparison)). Google Cloud's Generative AI Indemnified Services list covers the Vertex AI API used with GA foundation models, Veo included. The archived version found is dated 18 Sept 2025 and a newer version exists ([cloud.google.com archive](https://cloud.google.com/archive/terms/generative-ai-indemnified-services-20250918)).
- One analysis found no verified output-IP indemnity for the paid Gemini Developer API, as distinct from Vertex AI ([terms.law](https://terms.law/ai-output-rights/comparison)).

**OpenAI Sora 2 / Sora 2 Pro: discontinued**
- OpenAI's help centre, as quoted in search results, says the Sora web and app experiences were discontinued on 26 April 2026 and the Sora API on 24 September 2026. Developer notice went out around 24 March 2026, and no replacement model was named. Sources: [af.net](https://af.net/realtime/openai-to-shut-down-sora-api-on-september-24-2026-with-no-replacement-announced/); [codercops](https://blog.codercops.com/blog/openai-sora-api-shutdown-2026-what-to-do); [emarketer](https://www.emarketer.com/content/openai-discontinue-sora-app-disney-exits-partnership); [futurumgroup](https://futurumgroup.com/insights/openai-sora-discontinuation-what-the-end-of-a-platform-means-for-enterprise-ai-strategy/)
- Historical pricing for reference only:
  - Sora 2 was about $0.10/s.
  - Sora 2 Pro was $0.30 to $0.70/s by resolution, so an 8 s 1080p Pro clip cost $5.60. Batch jobs were half price.
  - Sources disagree on clip lengths: one lists 4/8/12 s, another 4 to 20 s.
  - Sources: [sume.com](https://www.sume.com/blog/sora-2-api-pricing); [unifically.com](https://unifically.com/blogs/sora-api); [adam.holter.com](https://adam.holter.com/sora-2-api-pricing-clip-limits-watermarks-and-what-you-can-actually-do/)
- Sources also disagree on watermarking. One says the API output was watermark-free. Another says outputs carried a visible moving watermark plus C2PA metadata ([adam.holter.com](https://adam.holter.com/sora-2-api-pricing-clip-limits-watermarks-and-what-you-can-actually-do/); [evolink.ai](https://evolink.ai/sora-2)).
- The point that matters: Sora is not a viable tool for new production in Oct 2026.

**Runway (Gen-4 / Gen-4.5)**
- Plans:
  - Free: 125 one-time credits, visible watermark.
  - Standard: $12/user/month billed annually ($15 monthly), 625 credits/month.
  - Pro: $28/month, 2,250 credits.
  - Max: $76/month, 9,500 credits.
  - Enterprise: custom.
  - Sources: [eesel.ai](https://www.eesel.ai/blog/runway-ai-pricing); [magichour.ai](https://magichour.ai/blog/runway-ml-pricing)
- Gen-4.5 is said to cost 12 credits/s for 2 to 10 s clips at 720p, so a 5 s clip is 60 credits. One older source says 25 credits/s ([camclo3d.com](https://camclo3d.com/blog/runway-pricing); [stacksheriff.com](https://stacksheriff.com/ai-tools/runway-pricing/); [sume.com](https://www.sume.com/blog/runway-credits-per-video)).
- Effective cost per second of Gen-4.5:
  - Standard monthly about $0.29, falling to about $0.10 on Max yearly.
  - API about $0.12/s, or $0.01 per credit.
  - Source: [techpresso](https://academy.techpresso.co/reviews/is-runway-worth-it)
- Native 720p output is a stated limitation against Kling 3.0 and Veo 3.1, which output 1080p or more. Runway also shares the general model failure modes: causality errors, object-permanence failures, and a bias toward showing physical actions succeed ([benchr.org](https://benchr.org/articles/best-ai-for-video); [wink.ai](https://wink.ai/blog/runway-gen-4-5-review)).
- I did not retrieve Runway's commercial-use terms by plan (see Gaps).

**Kling (Kuaishou), 2.6 and 3.0**
- Kling 3.0 per aggregators:
  - Native audio in English, Chinese, Japanese, Korean and Spanish.
  - Clips most often reported at up to 15 s. Some sources say 5 or 10 s.
  - Sources conflict on resolution: 1080p in some, native 4K in others.
  - Third-party API pricing of about $0.084 to $0.168/s.
  - One credit table: 720p with audio 9 credits/s, 1080p with audio 12 credits/s, 4K 30 credits/s.
  - Sources: [atlascloud.ai](https://www.atlascloud.ai/blog/tips/kling-3.0-review-features-pricing-ai-alternatives); [virse.ai](https://www.virse.ai/blog/kling-3-0-pricing); [gendia.ai](https://gendia.ai/kling); [avatarfactory.io](https://avatarfactory.io/models/kling-3)
- Kling 2.6: maximum 10 s with audio, 1080p ([kling2-6.com](https://kling2-6.com/en/blog/kling-3-vs-kling-2-6)).
- The free tier is capped at 720p, watermarked, and cannot be used commercially ([virse.ai](https://www.virse.ai/blog/kling-3-0-pricing)).
- Reviewers rate Kling 3.0's human motion as the most natural: "Where Runway and Veo produce rigid body movements, Kling generates natural fluidity" ([tech-insider.org](https://tech-insider.org/best-ai-video-generator-2026/); [benchr.org](https://benchr.org/articles/best-ai-for-video)).
- Commercial rights and ownership:
  - A third party says paid plans carry commercial-use rights and Kling offers no indemnity. It notes that no primary English Kling terms were retrievable ([terms.law](https://terms.law/ai-output-rights/comparison)).
  - An Adobe community thread notes that Kuaishou's own terms may still apply to Kling output generated inside Adobe Firefly ([Adobe community](https://community.adobe.com/questions-404/request-for-written-confirmation-of-commercial-usage-rights-for-kling-3-0-in-adobe-firefly-premium-1643709)).

**Luma (Dream Machine, Ray3 / Ray3.2)**
- Plans per [eesel.ai](https://www.eesel.ai/blog/luma-ai-pricing) and [wavespeed.ai](https://wavespeed.ai/blog/cost-and-billing/luma-ai-pricing/):
  - Commercial use starts at Plus: $30/month, or $25 billed yearly.
  - Pro is $90 ($75 yearly) and Ultra is $300 ($250 yearly).
  - Free and Lite plans are personal-use only and watermarked.
  - Ray3.2 API video pricing is by quote.
- Other sources list legacy Lite tiers at $7.99 to $9.99 ([checkthat.ai](https://checkthat.ai/brands/luma-ai/pricing)).

**Pika (2.5)**
- Free plan has 80 credits/month. Basic is $8/month for 700 credits. Top tier is about $95/month and reportedly includes commercial rights. Sources disagree on the tier structure ([faxianai comparison](https://media.faxianai.com/en/compare/luma-ray3-vs-pika-2-5/); [ninjachat.ai](https://www.ninjachat.ai/blog/best-higgsfield-ai-alternatives)).

**Higgsfield**
- 2026 pricing from secondary sources conflicts and is unreliable:
  - One set: $15 for 200 credits, Plus $39 to $49 for 1,000 credits, Ultra $99 to $129 for 3,000 credits, Business $62 to $89 per seat.
  - Another set: Basic $9, Pro $17.40, Ultimate $24.50, Creator $75.
  - Free tier is about 50 credits/month, roughly 3 videos.
  - Sources: [ninjachat.ai](https://www.ninjachat.ai/blog/best-higgsfield-ai-alternatives); [toolscompare.ai](https://toolscompare.ai/compare/higgsfield-ai-vs-luma/); [morphed.app](https://morphed.app/blog/higgsfield-alternatives)

**Cross-tool limits**
- Every tool still generates short base clips, from a few seconds up to about 25 s, which you extend by stitching ([pieroperilli.com](https://pieroperilli.com/en/blog/ai-video-generation-2026-what-actually-works)).
- Keeping one character consistent across several shots is "a real fight, even with reference images" ([pieroperilli.com](https://pieroperilli.com/en/blog/ai-video-generation-2026-what-actually-works)).
- Kling is reported to morph and break physics in clips longer than one minute ([tech-insider.org](https://tech-insider.org/best-ai-video-generator-2026/)).

### Inferences
- For a UK-based free education site, the safest paid route is probably Veo 3.1 Fast at 1080p, about $0.12/s, through Vertex AI. It has native audio, Google gives up ownership, and an indemnity is listed for Vertex. A 3-minute video using 20 to 30 b-roll shots of 6 to 8 s, at a 3 to 4× retake ratio, would need about 400 to 900 generated seconds. That comes to roughly $50 to $110 on Fast or $160 to $360 on Standard. This is my arithmetic from the cited rates, not a sourced figure.
- Kling 3.0 is a reasonable second tool for shots with people moving, such as engineers gesturing at a table. Its terms are less transparent and it has no indemnity.
- Higgsfield is best understood as a front-end and aggregator that resells several underlying models. The commercial terms of the underlying model provider, such as Kuaishou for Kling, may still apply. This rests on the Adobe/Kling example by analogy, not on a Higgsfield-specific source.
- Do not plan around Sora. Existing Sora clips may still carry visible watermarks or C2PA metadata.

### Gaps
- Could not reach official pricing pages: ai.google.dev, runway.com/pricing, klingai.com, lumalabs.ai, pika.art, higgsfield.ai. All figures are second-hand.
- Not confirmed:
  - Whether Veo 3.1 or Flow output carries C2PA Content Credentials in addition to SynthID.
  - Whether Flow, Gemini app or AI Pro tier exports carry a visible watermark.
  - Veo 3.1 maximum single-clip length and extension behaviour from Google's own docs.
- Not retrieved:
  - Runway's commercial-use and ownership terms.
  - Runway Gen-4 "References" or character-consistency specifics.
  - Kling's primary ToS.
  - Higgsfield's ToS.
- No controlled benchmark found for text-in-frame rendering by model. The evidence is review consensus only.

## 2. What works today vs fails for realistic training b-roll; best practice

### Takeaway
AI video handles establishing shots and atmospheric b-roll well: factory floors, workshop ambience, people around a table, slow pushes past machinery. It still fails at readable text and numbers, hands handling objects, correct machine mechanics and physics, and continuity across shots. Use AI for mood b-roll. Make every number, chart, label and diagram as a real motion graphic.

### Cited Findings
- On-screen text "comes out garbled more often than not", and hands and fine physics "still betray the model" ([pieroperilli.com](https://pieroperilli.com/en/blog/ai-video-generation-2026-what-actually-works)).
- Hands in motion are the most common failure point, with fingers that "multiply, bend impossibly, or flicker between frames" ([lovart.ai review](https://www.lovart.ai/blog/ai-video-generator-2026-review)).
- AI video models "have learned visual patterns, not physics laws" ([explainx.ai](https://explainx.ai/blog/video-generation-ai-sora-runway-kling-complete-guide-2026)).
- Runway, like other models, makes causality errors, fails at object permanence, and is biased toward showing physical actions as successful ([benchr.org](https://benchr.org/articles/best-ai-for-video)).
- "AI video handles establishing shots and B-roll well, but for product videos with human interaction, traditional 3D animation is needed" ([pieroperilli.com](https://pieroperilli.com/en/blog/ai-video-generation-2026-what-actually-works)).
- Recommended evaluation method: run the same prompts through each candidate model and score prompt adherence, temporal consistency and artefacts yourself ([crazyrouter.com](https://crazyrouter.com/en/blog/ai-video-generation-comparison-2026); [invideo.io](https://invideo.io/blog/best-ai-video-generation-models/)).

### Inferences
These map the cited failure modes onto the course's shot list. They are not direct tests.
- **Likely to work:**
  - Wide or medium factory-floor establishing shots.
  - Slow dolly past CNC or press machines, with no close-up of the mechanism.
  - Engineers around a table, framed from behind or at medium distance.
  - Sticky notes on a wall seen out of focus or blank.
  - Hands-free shots of a product on a bench.
- **Likely to fail:**
  - Close-ups of hands doing a teardown with tools, such as unscrewing or prying.
  - Readable sticky-note text.
  - Cost charts, gauges or HMI screens with numbers.
  - Correct CNC toolpaths or press-stroke mechanics.
  - The same "character" appearing across several scenes.
  - Logos.
- **Best practice:**
  1. Generate a still first, then animate it image-to-video, which gives more control.
  2. Prompt for blank or illegible screens and paper, then overlay real text and charts in the editor.
  3. Keep shots to 4 to 8 s and cut on motion.
  4. Avoid lingering close-ups of hands or mechanisms.
  5. Avoid identifiable brands.
  6. Have a subject-matter engineer check every machine shot for false technical depiction before publishing. A wrong process shown in a training video is an accuracy problem, not just an aesthetic one.

### Gaps
- No primary or independent benchmark specifically tests industrial machinery or engineering-process accuracy.
- Evidence on machine accuracy is anecdotal or review-based.

## 3. Disclosure, legal and ethics: EU AI Act Art. 50, UK, YouTube, LinkedIn, C2PA, real people and brands, copyright

### Takeaway
- **EU:** Article 50 transparency duties have applied since 2 August 2026, and the Digital Omnibus (Reg. (EU) 2026/1744) did not delay them. Providers such as Google and Kuaishou must machine-mark outputs. Deployers, which includes a course publisher, must disclose deepfakes: realistic content that "would falsely appear authentic". Photoreal factory or meeting b-roll presented as real footage plausibly falls in scope. The educational and informative purpose means the artistic/fictional softening probably does not apply.
- **YouTube:** requires the "altered or synthetic" disclosure for realistic AI scenes.
- **LinkedIn:** shows a CR badge where C2PA credentials survive in the file.
- **Copyright, US:** the US Copyright Office (Jan 2025) says prompts alone do not make you an author.
- **Copyright, UK:** s.9(3) CDPA still protects wholly computer-generated works for now, but the government proposed in March 2026 to remove that protection.

### Cited Findings

**EU AI Act Article 50**
- Dates:
  - Article 50 duties apply from 2 August 2026.
  - The Digital Omnibus, Regulation (EU) 2026/1744, entered into force around 27 July 2026. It left Art. 50 unchanged and moved high-risk obligations to 2 Dec 2027 (Annex III) and 2 Aug 2028 (Annex I).
  - Sources: [legalithm.com](https://www.legalithm.com/en/blog/eu-ai-act-what-applies-2-august-2026); [aiacto.eu](https://www.aiacto.eu/en/blog/digital-omnibus-ai-act-report-2027); [actuia.com](https://www.actuia.com/en/news/ai-act-obligations-in-force-and-delays-under-omnibus-2026-1744/)
- Grace periods:
  - Generative systems already on the market before 2 Aug 2026 have until 2 Dec 2026 to meet the Art. 50(2) machine-readable marking duty ([aiacto.eu](https://www.aiacto.eu/en/blog/digital-omnibus-ai-act-report-2027); [technology.org, 13 Oct 2026](https://www.technology.org/2026/10/13/eu-ai-act-deadlines-after-the-digital-omnibus-what-applies-from-december-2026-to-august-2028/)).
  - One memo mentions a further deferral to 2 Feb 2027 for watermark-detection interoperability. That is a single source and unconfirmed ([Paul Weiss](https://www.paulweiss.com/insights/client-memos/eu-finalises-transparency-rules-for-ai-generated-content)).
- Code of Practice and guidelines:
  - The voluntary Code of Practice on transparency of AI-generated content was finalised on 10 June 2026. Its provider section covers marking and detection; its deployer section covers labelling ([europeancompliancesuite.com](https://europeancompliancesuite.com/eu-ai-act-article-50-labelling/); [actuia.com](https://www.actuia.com/en/news/ai-act-obligations-in-force-and-delays-under-omnibus-2026-1744/)).
  - The Commission's Art. 50 guidelines followed on 20 July 2026 ([actuia.com](https://www.actuia.com/en/news/ai-act-obligations-in-force-and-delays-under-omnibus-2026-1744/)).
  - The Commission confirmed the Code as adequate, per a July 2026 law-firm memo ([Faegre Drinker](https://www.faegredrinker.com/en/insights/publications/2026/7/eu-ai-act-commission-confirms-transparency-code-of-practice-as-adequate-and-publishes-final-version-of-its-guidelines-on-transparency-obligations)).
- Retroactivity: the final guidelines say content generated before 2 Aug 2026 generally need not be marked retroactively. Text is the exception: its publication date governs ([Faegre Drinker](https://www.faegredrinker.com/en/insights/publications/2026/7/eu-ai-act-commission-confirms-transparency-code-of-practice-as-adequate-and-publishes-final-version-of-its-guidelines-on-transparency-obligations)).
- Penalties: up to €15m or 3% of worldwide annual turnover ([Faegre Drinker](https://www.faegredrinker.com/en/insights/publications/2026/7/eu-ai-act-commission-confirms-transparency-code-of-practice-as-adequate-and-publishes-final-version-of-its-guidelines-on-transparency-obligations)).
- Deepfake definition, Art. 3(60): AI-generated or manipulated image, audio or video that resembles realistic persons, objects, places, entities or events and "would falsely appear authentic". Per the guidance, the resemblance must be appreciable but need not be identical, and the deployer's intent does not matter. Minor technical edits such as lighting, colour or noise reduction normally do not count ([srd-rechtsanwaelte.de](https://www.srd-rechtsanwaelte.de/en/blog/deepfake-labelling-under-the-ai-act-what-the-new-eu-guidance-clarifies); [William Fry](https://www.williamfry.com/knowledge/part-2-ai-act-articles-503-and-504-transparency-obligations/)).
- Art. 50(4) carve-out:
  - For "evidently artistic, creative, satirical or fictional" works, the duty is narrowed, not removed. Disclosure must not hamper the work's display or enjoyment.
  - The exception does not apply where informative or commercial purposes predominate.
  - Sources: [srd-rechtsanwaelte.de](https://www.srd-rechtsanwaelte.de/en/blog/labelling-requirements-ai-act-deepfakes); [Bird & Bird](https://brandwrites.twobirds.com/post/102ng3r/when-marketing-meets-genai-update-what-do-the-final-eu-ai-act-transparency-gui)
- Primary text: Regulation (EU) 2024/1689, Art. 50 ([EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)). Not fetched in this session.

**UK**
- The UK has no equivalent of the AI Act's statutory labelling duty. No UK source was found in this session (see Gaps).
- Copyright:
  - The government's Report on Copyright and AI, published 18 March 2026 under ss.135 to 136 of the Data (Use and Access) Act 2025, tentatively proposes removing s.9(3) CDPA protection for wholly computer-generated works.
  - It keeps the existing originality test for AI-assisted works.
  - It is non-binding, and no legislation has been introduced.
  - Sources: [HSF Kramer](https://www.hsfkramer.com/notes/ip/2026-03/uk-government-report-on-copyright-and-ai-concludes-more-evidence-is-needed-although-s9-3-cdpa-could-go); [IPKat](https://ipkitten.blogspot.com/2026/03/uk-report-on-copyright-and-artificial.html); [Fieldfisher](https://www.fieldfisher.com/en/services/intellectual-property/intellectual-property-blog/uk-government-maintains-status-quo-on-ai-and-copyr); [Eversheds](https://www.eversheds-sutherland.com/en/united-kingdom/insights/uk-government-tentatively-sides-with-creatives-in-its-report-on-copyright-and-ai)

**US Copyright Office**
- Part 2 report, Copyrightability, published 29 Jan 2025:
  - "Prompts alone do not provide sufficient human control" for the user to be the author.
  - Purely AI-generated output is not protected.
  - Human selection, coordination and arrangement, or creative modifications, can be protected, decided case by case.
  - No sui generis right is recommended.
  - Sources: [IPWatchdog](https://ipwatchdog.com/2025/01/29/part-two-copyright-office-ai-report-says-creative-prompting-doesnt-constitute-authorship/); [Copyright Alliance](https://copyrightalliance.org/ai-report-part-2-copyrightability/); [Hogan Lovells](https://www.hoganlovells.com/en/publications/us-copyright-office-issues-report-on-copyrightability-of-ai-assisted-and-generated-works)

**YouTube**
- Creators must use the "altered or synthetic content" setting in Studio when realistic content:
  - makes a real person appear to say or do something they didn't,
  - alters footage of a real event or place, or
  - shows a realistic-looking scene that didn't happen.
- Clearly unrealistic content is exempt, and so is production help such as scripts, ideas or captions.
- YouTube may apply the label itself if a creator fails to disclose.
- The label does not by itself affect recommendations or monetisation.
- Sources: [minimatters.com](https://minimatters.com/youtube-altered-or-synthetic-content-disclosure/); [layer3labs.io](https://www.layer3labs.io/guides/youtube-ai-content-policy); [aicleanify.com](https://aicleanify.com/blog/youtube-ai-content-labels-2026-c2pa-synthid). All are secondary; the official page is [YouTube Help 14328491](https://support.google.com/youtube/answer/14328491), not fetched.
- 2026 changes, unverified and secondary only:
  - Automated detection of photorealistic AI content from May 2026.
  - Labels based on C2PA evidence or YouTube's own AI tools cannot be removed by the creator.
  - A claimed 24 Aug 2026 tightening.
  - Sources: [aicleanify.com](https://aicleanify.com/blog/youtube-ai-content-labels-2026-c2pa-synthid); [shortsfast.com](https://shortsfast.com/blog/youtube-ai-content-disclosure-rules-2026/)

**LinkedIn and C2PA**
- LinkedIn shows a "CR" (Content Credentials, or "C2PA icon") badge on images and video carrying a signed C2PA manifest. LinkedIn says it cannot detect all AI content. It labels only content that arrives with credentials ([tuesdaylogic.com.au](https://tuesdaylogic.com.au/insights/ai-content-is-now-visible-on-linkedin-what-this-means-for-businesses/); [depost.ai](https://depost.ai/blog/linkedin-cr-tag)).
- One secondary glossary says LinkedIn and TikTok preserve Content Credentials while Instagram and X strip them. This is unverified ([primores.org](https://primores.org/wiki/glossary/content-provenance/)).
- Several search results were metadata-removal vendors and were not used as authority.

**Real companies and people**
- No specific source was retrieved on using real company names such as Tesla or GM in AI scenes (see Gaps and Inferences).

### Inferences
- **Practical policy for the site:**
  1. Put a short visible on-screen or caption note on any photoreal AI shot, for example "AI-generated illustrative footage".
  2. Add a line in the video description and on the page.
  3. Tick YouTube's altered/synthetic box for photoreal factory or people scenes.
  4. Keep the vendor's SynthID or C2PA marks: do not strip metadata, and export with credentials where the editor supports it.
  5. Keep a production log of the prompts, model and date for each shot.
- **Why the site should label:** even if the site is a "deployer" with limited EU exposure, this is low-cost and matches the Art. 50 Code of Practice direction. The educational purpose likely defeats the "evidently artistic/fictional" softening.
- **Real brands and people:**
  - Do not generate scenes that depict a named real company's factory, products or logos, for example "a Tesla Gigafactory line" or "GM engineers".
  - Do not show recognisable real people.
  - Such scenes squarely meet the Art. 3(60) "resembles existing entities and places" test. They also create trade-mark, passing-off and defamation-by-false-depiction risk.
  - Generic "automotive assembly plant" prompts are safer. Refer to real companies only in narration or text, backed by factual sourced case material.
  - This is a legal-risk inference, not a sourced rule.
- **Copyright:** output alone is weakly protectable in the US. In the UK it is protected today under s.9(3), but that may go. The course's protectable value therefore lies in the human-authored script, edit, selection and graphics.

### Gaps
- Did not retrieve:
  - The official YouTube Help text. It was blocked (DNS), so all YouTube detail is secondary.
  - LinkedIn's official help page.
  - C2PA.org specification text.
- No UK-specific source found on:
  - AI content labelling. Neither the ICO nor DSIT gave a statutory equivalent.
  - The Online Safety Act's application to synthetic media on a small education site.
  - ICO guidance on using real people's likeness in AI video.
- Not verified: the 2 Feb 2027 interoperability deferral, and YouTube's claimed Aug 2026 change.
- Missing sources:
  - No source on vendor usage policies about depicting real brands, such as Google's Generative AI Prohibited Use Policy or Kling's.
  - No case law found on AI scenes naming real companies.

## 4. Accessibility for web video: WCAG 2.2, WebVTT vs burned-in subtitles, multilingual dubbing

### Takeaway
Under WCAG 2.2 AA, prerecorded video with audio needs:
- synchronised captions (1.2.2, A);
- audio description or a full media alternative (1.2.3, A);
- audio description (1.2.5, AA).

Audio description is unnecessary where the narration already conveys all important visual information, so narrate what the b-roll and charts show. Prefer WebVTT `<track>` files over burned-in subtitles. Add a transcript as good practice.

### Cited Findings
These are canonical W3C texts, cited but not fetched (www.w3.org DNS failed). The criterion levels and wording are stable from WCAG 2.0 through 2.2.
- SC 1.2.2 Captions (Prerecorded), Level A: captions for all prerecorded audio in synchronised media ([W3C Understanding 1.2.2](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html)).
- SC 1.2.3 Audio Description or Media Alternative (Prerecorded), Level A ([W3C Understanding 1.2.3](https://www.w3.org/WAI/WCAG22/Understanding/audio-description-or-media-alternative-prerecorded.html)).
- SC 1.2.5 Audio Description (Prerecorded), Level AA. At AA, a text alternative alone no longer satisfies the requirement; audio description is needed ([W3C Understanding 1.2.5](https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html)).
- SC 1.2.1 Audio-only and Video-only (Prerecorded), Level A, applies to silent b-roll loops ([W3C Understanding 1.2.1](https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded.html)).
- WebVTT is the W3C caption format used with the HTML `<track kind="captions|subtitles|descriptions">` element ([W3C WebVTT](https://www.w3.org/TR/webvtt1/)).
- The UK public-sector accessibility regulations reference WCAG. A private free education site is not bound by them, but the Equality Act 2010 duty to make reasonable adjustments applies to service providers. No source was retrieved this session (see Gaps).

### Inferences
- **Practical approach:**
  - Write narration that verbally describes key visuals ("the chart shows material is 62% of cost…"). This "integrated description" usually removes the need for a separate AD track.
  - Ship a `.vtt` captions file per language rather than burned-in subtitles. Viewers can toggle VTT tracks, they are searchable, screen-reader and translation friendly, and YouTube accepts them.
  - Burn in only on-screen labels that are part of the graphic.
  - Provide an HTML transcript below each video.
  - For YouTube, upload the same VTT or SRT. YouTube's auto-captions need correction for technical terms such as FAST, VAVE and Pareto.
  - Silent decorative loops (`muted autoplay`) should be pausable. They need no captions if purely decorative.
- **Multilingual:**
  - Separate VTT subtitle tracks per language are cheapest.
  - AI dubbing is possible, for example via ElevenLabs or YouTube's multi-language audio tracks, but it was not researched here.
  - A dubbed track needs its own matching captions.

### Gaps
- W3C pages could not be fetched. The SC wording above is from the stable standard and was not re-verified in this session.
- No source retrieved on:
  - YouTube multi-language audio track availability or eligibility in 2026.
  - AI dubbing tool pricing.
  - EU Accessibility Act (EAA, applied from 28 June 2025) applicability to a free education site.
  - Equality Act guidance.

## 5. Typical cost and time for a 3-minute course explainer mixing AI b-roll, narration and motion graphics

### Takeaway
Market rates for a 3-minute explainer:

| Route | Per minute | 3-minute estimate |
|---|---|---|
| DIY with AI tools | $99 to $1,500 | about $1,500 at most |
| Freelancers | $500 to $3,000 | about $1.5k to $9k |
| AI-assisted studios | about $1,500 to $3,000 | about $4.5k to $9k |
| Agencies | $3,000 to $15,000+ | about $9k to $45k+ |

A DIY build with Veo b-roll should cost roughly $100 to $400 in generation fees plus tool subscriptions. The main cost is skilled editing time.

### Cited Findings
- DIY/AI route: $99 to $1,500 per minute, or tools at $15 to $25/month. Output is templated, with no custom characters or strategic scripting ([fliki.ai](https://fliki.ai/blog/how-much-does-an-explainer-video-cost); [knowlify.com](https://knowlify.com/articles/explainer-video-cost-guide)).
- Freelancers charge $500 to $3,000 per minute. AI-assisted studios charge about $1,500 to $3,000 per minute ([fliki.ai](https://fliki.ai/blog/how-much-does-an-explainer-video-cost); [yansmedia.com](https://www.yansmedia.com/blog/explainer-video-cost)).
- Specialised animation studios charge $3,000 to $10,000 per minute. Agencies charge $3,000 to $15,000+ per finished minute, and one source puts full-service work at $10k to $50k+ ([vidico.com](https://vidico.com/explainer-video-production/explainer-video-cost); [vivamedia.ca](https://vivamedia.ca/blog/video-production-pricing)).
- Post-production is often 30 to 40% of the budget ([vivamedia.ca](https://vivamedia.ca/blog/video-production-pricing)).
- These sources are vendor marketing pages, so expect them to be biased.

### Inferences
- **Generation cost:** about 400 to 900 generated seconds on Veo 3.1 Fast 1080p at $0.12/s comes to about $50 to $110, or about $160 to $360 on Standard ($0.40/s). This is my arithmetic from section 1.
- **Time, my estimate:**
  - About 1 to 2 days to script, storyboard and get engineering review.
  - About 1 day for prompting and selection.
  - About 1 to 2 days for motion graphics: charts, FAST diagrams, cost bars.
  - About 0.5 to 1 day for narration, either recorded or TTS, plus edit.
  - About 0.5 day for captions, transcript and QA.
  - Total: roughly 4 to 6 person-days for a polished 3-minute piece.
- No source was found for this time breakdown. Treat it as a planning assumption.

### Gaps
- No primary or neutral survey of production time per finished minute for AI-assisted explainers was found.
- Per-minute rates come from vendor blogs and are not specific to 3-minute videos.
