# Audit sweep — what each finding actually rested on

After F-9 was found to be wrong (see `AUDIT-2026-08.md`, F-32), every other
finding was re-classified by its evidentiary basis and re-verified where it had
not been measured directly.

The question asked of each: **did I measure the artefact, or did I report a
tool's output?**

| Basis | Meaning |
|---|---|
| **MEASURED** | Ran the code, executed both versions, or exported the artefact and read the bytes |
| **VERIFIED** | Re-derived independently in this sweep (originally subagent-reported) |
| **CODE-READ** | Concluded from reading source directly |
| **TOOL-OUTPUT** | Taken from a script's summary — the failure mode |

## Result

| Finding | Basis | How | Verdict |
|---|---|---|---|
| F-1 export provenance | MEASURED | parsed each exporter function; re-rendered PDFs | holds |
| F-2 ranking inflation | MEASURED | executed both versions of `rankIdeas` side by side | holds |
| F-3 "2× more accurate" | MEASURED | computed ratios from benchmark result JSON | holds |
| F-4 evidenceUnverified | CODE-READ | type contract vs truthiness test in source | holds |
| F-5 DFA steel density | MEASURED | test proves aluminium differs >2× | holds |
| F-6 TRIZ grammar | MEASURED | observed in live endpoint output | holds |
| F-7 held-out accuracy | MEASURED | ran the benchmark | holds |
| F-8 band coverage | MEASURED | ran benchmark, computed residual spread | holds |
| **F-9 citation debt** | **TOOL-OUTPUT** | **read the audit summary, never the catalogue** | **WRONG — retracted** |
| F-10 unverified unmarked | CODE-READ | read the badge logic | holds |
| F-11 engine-check coverage | MEASURED | 6-part eval; initial 2-part reading retracted | holds after retraction |
| F-12 eval harness | MEASURED | observed the failure live, read the handler | holds |
| F-13 engine-check equivalence | CODE-READ | stamped figure vs displayed figure | holds |
| F-14 validationFlags dead | VERIFIED | 14 writers; the one "reader" was a type declaration | holds |
| F-15 PCB vision prices | VERIFIED | baseline carried no total-level provenance | holds |
| F-16 cad-analyze fallback | CODE-READ | legacy `indexOf('{')` parsing in the handler | holds |
| F-17 TRIZ costs dropped | MEASURED | hit the live endpoint, saw the silent drop | holds |
| F-18 BYOK bypassed | VERIFIED | 13 files use localStorage; live save/delete cycle | holds |
| F-19 harness no UI | MEASURED | orphan list, then live 0/14 → 5/13 after the fix | holds |
| F-20 org invites API-only | VERIFIED | endpoints exist; the Help page admitted it | holds |
| F-21 search unreachable | VERIFIED | present in the independently-derived orphan list | holds |
| F-22 Foresight demote | VERIFIED | endpoint exists, no caller | holds |
| F-23 orphan endpoints | AGENT-ONLY | claimed ~12; independently derived **16**, list matches | holds, count refined |
| F-24 report layer untested | VERIFIED | 5,545 lines, 0 referencing test files | holds |
| F-25 llm-json untested | VERIFIED | no test imported it at baseline | holds |
| F-26 benchmarks outside CI | MEASURED | read the CI step list | holds |
| F-27 PCB v2 marginal | MEASURED | ran the benchmark | holds |
| F-28 CostVision brand | MEASURED | exported a real workbook, read the bytes | holds |
| F-29 band caveat missing | MEASURED | read the exported workbook | holds |
| F-30 eval variance | MEASURED | three full six-part paid runs | holds |
| F-31 prior-art 83% | MEASURED | eval plus both ranking versions executed | holds |

**31 findings · 30 hold · 1 wrong · 1 rested on a tool's summary.**

## Claims re-derived from scratch in this sweep

Because three subagents produced a large share of the original findings, their
structural claims were re-checked independently rather than trusted:

| Claim | Result |
|---|---|
| All nav entries resolve to real routed pages | **0 unrouted** of 21 registry entries against 30 routes |
| No page calls a non-existent endpoint | **0 real** — an initial 12 were an artefact of my own regex truncating template literals at `${` |
| ~12 orphan endpoints | **16**, list matches the reported one |
| `OnboardingBanner` and `ui/Button` are dead | **0 importers each** |
| 13+ pages read `localStorage.brainspark_api_key` | **13** |
| No TODO/FIXME/stub markers | **0** |
| ~5,700 lines of report generation, untested | **5,545 lines, 0 test files referencing them** |
| Ideation eval never ran | **0 result files at baseline** |

## What this does not prove

The sweep tests one specific failure mode. It does not re-derive every number
from first principles, and two weaknesses stayed visible rather than being
hidden:

- **F-11 needed a mid-flight retraction.** The 46% engine-check figure came from
  a 2-part partial run; the 6-part run said 16.9%. Measured, but under-sampled —
  caught by re-running, not by review.
- **F-23 shipped agent-only** until this sweep. It held, but it had not been
  independently checked when it was written into the register.
