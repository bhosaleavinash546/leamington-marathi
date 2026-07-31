# Panchang authority

**दाते पंचांग — Date Panchang.**

CLAUDE.md 2.3 requires that exactly one published panchang be named here and
recorded as the reference truth. CLAUDE.md N2 makes it the standard every
astronomical value is regression-tested against.

## Why this one

Date Panchang is drik-ganit (observational/computed, as opposed to
Surya-Siddhanta-based) and is the panchang in widest scholarly and household use
in Maharashtra. Its printed times are what a Marathi user will hold this engine
against, which is the only test that matters for consumer trust.

The alternatives considered, and what was given up:

| Option | Strength | Why not chosen |
|---|---|---|
| **Date Panchang** *(chosen)* | Drik-ganit, Maharashtra standard, best consumer match | Values must be transcribed from a purchased almanac |
| Rashtriya Panchang | Government of India, Chitrapaksha ayanamsa, published conventions, most defensible technically | Not what a Maharashtrian household compares against |
| Kalnirnay | Highest household penetration | Primarily a wall calendar; less complete on limb end-times |
| Nirnaysagar Panchang | Established and respected | Narrower current circulation than Date |

## What "matching the authority" means

* **To the minute**, for every value the almanac prints (CLAUDE.md 9.1).
* **Against this authority only.** Different panchangs legitimately disagree by
  minutes on tithi end-times because of differing computational schools. A
  disagreement with Kalnirnay, or with any app, is not a bug.
* **Never averaged.** Values from several panchangs are never blended.
* **Never switched silently.** The authority appears in every ChartFacts document
  as `authority: "date_panchang"`, and changing it is a major engine version bump.

## Current verification status

**0 of 62 golden cases have been transcribed.** No page of the almanac has been
consulted, so the engine's agreement with Date Panchang is presently **unknown,
not established**. The harness reports every case as PENDING rather than passing.

This is stated plainly here, in `GOLDEN_FILES.md`, in the header of
`tests/golden/cases.yaml`, and in a CI line every run prints. See
`GOLDEN_FILES.md` for what has to happen next and `DIVERGENCES.md` for the
specific conventions the transcription will settle.

## Ayanamsa

Date Panchang uses the Chitrapaksha ayanamsa, which is the Lahiri ayanamsa. The
engine default is `SE_SIDM_LAHIRI` — see `DECISIONS.md` D3 for why the *constant*
and not the name is what gets pinned.
