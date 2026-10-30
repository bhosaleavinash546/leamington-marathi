# Leamington Marathi website: light review (30 October 2026)

Feedback: "the website is all scrolling". This review measures that and proposes small fixes. No site files have been changed.

Tested on the local copy of the code that is live now (the same as `main`). Phone = 375 × 812, desktop = 1440 × 900. "Screens" = page height ÷ screen height. One swipe is counted as one screen.

## Step 1: Scrolling

**Home page length:**

| | Phone | Desktop |
|---|---|---|
| Today (Diwali Bhet block shown) | **32.7 screens** | 20.2 screens |
| From 1 Nov (Diwali Bhet block hides itself) | **27.4 screens** | 18.0 screens |

**Sections on a phone, longest first (today):**

| Section | Screens | What makes it long |
|---|---|---|
| Events | 7.39 | Diwali Bhet 2026 block 4.68 (hides after 31 Oct), annual events timeline 2.21 |
| Sponsor | 3.36 | 3 price cards stacked 1.53, supporters 0.68, benefits 0.55 |
| Our Journey | 2.98 | Winding road timeline 2.60 |
| Gallery | 2.78 | Photo albums 1.47, video 0.81 |
| Contact | 2.49 | Contact form 1.21, Stay connected QR codes 0.88 |
| Marathi Calendar | 2.37 | Festival list, proverb and word cards 1.95 |
| Dhol Tasha | 1.92 | |
| About | 1.90 | Text and 3 value cards 1.56 |
| Get Involved | 1.63 | Form 1.43 |
| आपला महाराष्ट्र | 1.52 | |
| Hero | 1.48 | |
| Testimonials | 1.08 | |
| Flyers | 0.81 | |
| Footer | 0.71 | |

**Swipes on a phone to reach:**

| Target | Today | From 1 Nov |
|---|---|---|
| Next event booking button | 0 (hero card on first screen links to it); the WhatsApp button itself is 9.5 | no upcoming event block |
| Get Involved form | 24 | 18.5 |
| Contact | 29.5 | 24 |

The full-page phone screenshot is in `review/home-phone-full.jpg`.

## Step 2: Quick checks

| # | Check | Result |
|---|---|---|
| 1 | Normal scrolling changed? | **Pass.** No scroll library or scroll hijack. `scroll-behavior: smooth` only affects menu-link jumps. Scroll-snap is used only on the flyer row when reduced motion is on. |
| 2 | Animations stop with reduced motion? | **Pass.** A global rule stops all animations and transitions. The flyer row becomes a swipe row. |
| 3 | Slow animations, or content hidden until they play? | **Fail.** All 46 content blocks start invisible and fade in over 0.7 s as they scroll into view. Several decorative loops run all the time (title glow 4 s, floating logo 5 s, flyer row 72 s). |
| 4 | Horizontal scroll on phone? | **Pass.** Page width equals screen width. |
| 5 | Sticky header covers titles after a menu tap? | **Pass.** Tested Events, Dhol, Gallery, Get Involved and Contact. Titles land about 110 px below the header. |
| 6 | Videos load before play? | **Pass.** All 4 videos use `preload="none"` with a poster. |
| 7 | Lighthouse mobile | Performance **30**, Accessibility **100**, SEO **100**, Best practices **100**. First load 1.56 MB (about 3.9 MB after scrolling the whole page). See note below. |
| 8 | Images over 300 KB | **Pass.** None. Lighthouse still suggests about 400 KB of savings from smaller or WebP images. |
| 9 | Broken links or anchors | **Pass** for in-page anchors and local files. External links could not be tested from here. |
| 10a | Sponsor tiers show "£ / event" with no amount | **Confirmed.** All 3 tiers (Bronze, Silver, Gold). |
| 10b | "Join Our Community" goes to #contact | **Confirmed.** It should go to #get-involved. |
| 10c | Flyers in the page twice, empty alt on copies | **Rejected as a bug.** The second set makes the moving row loop. Those copies are hidden from screen readers (`aria-hidden="true"`), so empty alt text is correct. |
| 10d | Diwali Bhet 2026 text and countdown hard-coded | **Partly confirmed.** The event block, hero card, countdown and ticker hide themselves after 31 Oct. But the annual events card still says "This year: Saturday 31 October 2026" and will be out of date. |

**Note on speed:** part of the low score comes from the test setup (the local server does not compress files, which GitHub Pages does). The main cause is real: the "Our Journey" road animation measures the road about 2,400 times when the page loads. On a mid-range phone this blocks the page for several seconds. A small code change fixes it with no visible difference.

**Tap targets under 44 px (25 found):** "Register interest" links (26 px tall), "Add to calendar" (27 px), "Book tickets" (34 px), the form checkboxes (30 × 26), and the search button (43 × 34).

## Step 3: Benchmark (not done)

The 5 mandal websites could not be opened. This environment's network settings block those sites. To run it, add these domains to the environment's allowed list: mmlondon.co.uk, maharashtra-mandal-singapore.org, mbmtoronto.com, mmla.org, plus one Australian or European mandal site. Steps: https://code.claude.com/docs/en/cloud-environments#network-access

## Step 4: Scores

| Category | Score | Evidence |
|---|---|---|
| Page length and navigation | 3 | 32.7 phone screens. The join form is 24 swipes down and Contact is 29.5. |
| Mobile use | 7 | No sideways scroll and the header is fine, but 25 tap targets are under 44 px. |
| Look and graphics | 8 | Consistent colours and fonts, sharp images, Marathi text renders correctly. |
| Motion and animation | 5 | Respects reduced motion, but every block is hidden until it fades in (0.7 s), plus many looping decorations. |
| Speed | 3 | Lighthouse mobile 30. The road animation blocks the page on load. |
| Content | 7 | Clear and bilingual. Sponsor prices are missing, and one Diwali 2026 line will be out of date after tomorrow. |
| Calls to action | 6 | Booking is clear. "Join Our Community" opens the contact form, not the join form. Two separate forms do similar jobs. |

## Fix list (waiting for approval)

Screens saved are for a phone, measured against the 27.4-screen page from 1 November.

| # | What changes | Files | Effort | Screens saved |
|---|---|---|---|---|
| 1 | **Sponsor:** price cards become a sideways swipe row on phones. Benefits and supporters go behind a "Show more" (`<details>`). Show real prices, or remove the empty "£ / event" line. | index.html, style.css | M | 1.8 |
| 2 | **Our Journey:** show the first 2 milestones, with "Show the full story" for the rest. Also fix the slow road measuring. | index.html, style.css, script.js | M | 1.6 |
| 3 | **Annual events:** the full timeline cards become a short list (or swipe row). Update the stale "This year: 31 October 2026" line. | index.html, style.css | M | 1.5 |
| 4 | **One form:** the hero "Join Our Community" button goes to Get Involved. The Contact section keeps email, WhatsApp and QR codes, and its form goes behind "Send us a message". | index.html, style.css | S | 1.0 |
| 5 | **Gallery:** show 4 albums with "See all photos". The video moves inside it. | index.html, style.css | S | 0.9 |
| 6 | **Marathi Calendar:** show the next 3 festivals, with "Show more". | index.html or script.js | S | 0.7 |
| 7 | **About:** the 3 value cards become a short row or list on phones. | style.css | S | 0.6 |
| 8 | **Testimonials:** a sideways swipe row on phones. | style.css | S | 0.5 |
| 9 | **Motion:** content shows at once (no fade-in from invisible), or the fade starts earlier and lasts 0.3 s. Fewer always-on loops. | style.css, script.js | S | 0 (feels shorter) |
| 10 | **Tap targets and images:** make small buttons at least 44 px tall. Serve smaller hero and dhol images. | style.css, images | S | 0 |

**Total: about 8.6 screens saved, so 27.4 becomes about 19 phone screens (30% shorter), with no change to the look.**

To reach half (about 14 screens) within these rules, one more option is to move Sponsor and the Marathi Calendar onto their own pages. The home page would keep a 1-line link to each. This saves about 4.5 more screens. It is still small work, but it moves content, so it needs your OK separately.
