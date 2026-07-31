# POSITIONING — what this is, who opens it, and why

> REVIEW-360 §1, Workstream A. One page. The gate at the bottom is not yet
> passed and cannot be passed from inside the project.

**Working name: जन्मपत्रिका.** The product has no real name; that is an open
decision for the owner, flagged rather than invented here.

## The one sentence

> **जन्मपत्रिका gives a practising Maharashtrian jyotishi a client-ready,
> checkable patrika — computed by drik-ganit with दाते पंचांग as the declared
> authority, in genuine Marathi — unlike AstroSage Kundli, which discloses
> neither its ayanamsa nor the reasoning behind its statements.**

`NOT VERIFIED`: the competitor clause. Standing rule 1 forbids claims about
another app that were not observed by installing it and running the reference
birth. That is Workstream D's job; until it reports, the clause is an
assertion from category reputation and must not appear in any user-facing copy.

## Primary user: the practitioner

The other two are later, not equal. The evidence is in the repository, not in
preference:

- What exists is practitioner-grade: ग्रहस्पष्ट in rashi-degree-minute, इष्टकाल
  in ghati–pala, Shadbala in itemised virupas, disclosed ayanamsa and sunrise
  convention on the sheet, शास्त्र/परंपरा standing on every rule, PDF export.
- What the **seeker** needs first — the plain-language explanation — depends on
  the narrative layer, which has never produced a real sentence (no API key;
  only a fake is exercised in tests).
- What the **household** needs first — daily panchang view, muhurta finder,
  festival calendar — is unbuilt (Workstream B will register each).

Later: the seeker (once narrative is live and validated), then the household.

## The occasion

A client has just handed the jyotishi a birth — a newborn awaiting नामकरण, a
proposal to match, a साडेसाती worry — often as a scribbled date, time and
place. They open this to compute the patrika faster than by hand, **check it
line by line against their own printed पंचांग**, and hand it over.

First action: enter the birth. Walk away with: the patrika, on screen and as a
printable sheet.

## The single differentiator

**Checkability.** Every figure is printed in the form a पंचांग prints it; the
conventions that produced it (ayanamsa, node type, sunrise refraction, dasha
year length) are on the sheet, not hidden; every yoga and dosha carries its
evidence array and its doctrinal standing. This is the opposite of "AI
astrology", and it is aimed at the one user who can tell the difference.

## Claims discipline

- **"दाते पंचांग as authority" is declared, not yet verified.** 0 of 62 golden
  cases are transcribed (`docs/GOLDEN_FILES.md`). Until they pass, copy must say
  *"drik-ganit, with दाते पंचांग as the declared authority"* — never *"matches
  दाते पंचांग"*.
- The Marathi is hand-curated but **not native-reviewed** (`docs/LOCALE_REVIEW.md`).
- The competitor clause above: `NOT VERIFIED` pending Workstream D.

## The five-second test

The home screen now leads with the one-line statement and a single action —
enter the birth, get the patrika. First run asks one question ("Are you an
astrologer, or looking at your own chart?") to set density, then goes straight
to the form. A patrika URL without a birth is an invitation to enter one, not
an error.

**Gate — pending.** An outsider must read this page plus the home screen and
describe the product correctly. That requires a human who did not build it;
the owner should run this test before Workstream B begins.
