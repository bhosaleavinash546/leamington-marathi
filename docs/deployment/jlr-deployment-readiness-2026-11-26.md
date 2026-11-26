# CostVision on a JLR server — deployment plan and readiness (status 26 Nov 2026)

The plan agreed in outline on 9–11 Nov 2026, and where each item stands, checked against the code on 26 Nov 2026
(branch `claude/new-session-ts4byp`, commit `a1215b37`). Update the status columns as items close.

Related: `docs/CostVision-Secure-Deployment-CAPEE-Integration.md` (July 2026 data-flow inventory and security plan),
`docs/WINDOWS-INSTALL.md` (single-laptop package — not the server route), the Phase 1 readiness deck
(`CostVision-Phase1-Readiness*.pptx` and its build script in the repo root, commit `3094f2ee`).

## 1. The plan

**Two phases.**

| Phase | Scope | AI key |
|---|---|---|
| **1 — no AI** | CAD to COST (15 processes), offline 2D drawing reader, machining-time model, cost bridge, geometric DFM / Design to Cost, compare routes, option £, country comparison, sensitivity / band, PDF + Excel reports, 39 country rate books + admin rate-book upload, software costing (no AI commentary), PCB costing from the form, saved projects | None. Run with `AIR_GAPPED=1` so no user can switch AI on with their own key |
| **2 — AI** | PCB photo → parts list → cost (and BOM from a picture), CAD "AI" / "both" modes, expert DFM commentary, RFQ analysis, agent tab / describe your part / auto-fill, chat and AI commentary | Remove `AIR_GAPPED`, add the key or JLR's approved route (`ANTHROPIC_BASE_URL`), restart. No rebuild |

DFM is rules on measured CAD — Phase 1, not AI. Drawings never go to a model in any mode.

**Recommended setup (Option A):** the existing Docker image (`calculator/Dockerfile.cad` — app + CAD kernel + offline drawing
reader with OCR files) on one Linux VM inside JLR, behind JLR's HTTPS gateway with JLR single sign-on, `AIR_GAPPED=1`, outbound
internet blocked at the VM. One data volume (SQLite + uploads), encrypted disk, nightly backup.

```
JLR browser ──HTTPS──▶ JLR gateway + single sign-on ──internal──▶ Linux VM: Docker (CostVision image)
                                                                   AIR_GAPPED=1, no key, no outbound internet
                                                                   └── data volume (DB + uploads), backed up
```

Options rejected: JLR container platform (fine later; SQLite = one copy only), Windows package on a server (built for one
laptop), public cloud (confidential CAD / drawings would leave JLR).

**Sizing:** 4 vCPU, 8 GB RAM (4 GB minimum for a few users; drawing OCR peaks near 1 GB), 50 GB disk.

**Settings file (Phase 1):** `JWT_SECRET` (random 32 bytes, explicit), `AIR_GAPPED=1`, `CV_TRUST_PROXY=1` (behind the gateway),
`ADMIN_EMAILS`, `CV_SIGNUP_DOMAINS`, `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` (JLR mail relay for sign-in codes),
`CV_DRAWING_FILE_DIR` (on the data volume), `PORT`.

**Steps:** 1 readiness check → 2 decisions with JLR IT (one-pager, data-flow diagram, security questionnaire, server spec) →
3 engineering fixes → 4 pilot install with 5–10 users, step by step → 5 go-live, update and restore-test routine, support sheet.

## 2. Readiness build — the five changes before go-live

| # | Change | Status 26 Nov 2026 |
|---|---|---|
| 1 | Sign-up limited to JLR email domains | **Done** (`a1215b37`): `CV_SIGNUP_DOMAINS` or `ADMIN_EMAILS`; first account on an empty DB from the same machine (`server/utils/signup-policy.ts`) |
| 2 | Harden the image: non-root user, health check, drawing temp folder on the data volume | **Done (26 Nov, local commit).** `Dockerfile.cad` stage `jlr`: uid 10001, `HEALTHCHECK`, drawing / CAD working files and backups on `/app/data`; `deploy/jlr/docker-compose.yml`: read-only file system, `/tmp` tmpfs, all capabilities dropped, no-new-privileges, 6 GB memory, loopback-only port, log rotation. The default stage (Fly, CI) is unchanged |
| 3 | Sheet-metal blank development off the main thread | **Done (26 Nov, `e82ba3ae`).** Worker thread; seat bracket: unfold 8.6 s, largest event-loop gap 38 ms; blank and DXF identical |
| 4 | Backup and restore scripts for the data volume | **Done (26 Nov).** `deploy/jlr/backup.sh` (online SQLite backup, integrity check, sha256, keep N) and `restore.sh` (checks, keeps the old database, restores); `calculator/scripts/ops/db-backup.mjs`, `db-check.mjs` |
| 5 | Prove it offline and in the image; write the JLR install guide | **Done here, image proof in CI.** `e2e/jlr-offline-proof.ts` 15 / 15 with no network; `e2e/full.ts` offline, all 22 commodities PASSED; `docker-cad.yml` job "JLR image" builds the `jlr` stage and runs the proof inside it (read-only, no network, no capabilities), health, write checks, backup, compose validation — **runs once pushed**. The image could not be built here (disk allowance). Guide: `docs/deployment/jlr-install-guide.md` |

Also fixed: the startup metal-price refresh now honours `AIR_GAPPED` (it would have called out had a price key been set);
the startup log says "AI: off (AIR_GAPPED=1)" instead of "API key NOT SET".

## 3. Already in place

- `AIR_GAPPED=1` stops every outside call (AI, news, live component prices) — proven by tests with outbound blocked; with no key
  the AI buttons are hidden.
- One image holds everything; nothing downloads at run time.
- Content security policy, no inline handlers, sign-in on every route, rate limits, upload caps (30 MB drawing / CAD,
  150-megapixel images).
- Admins by `ADMIN_EMAILS` (verified accounts only); rate-book upload admin-only; `CV_TRUST_PROXY` for the gateway.
- KPI dashboard built and pushed (phase 2 fixes `440afc73`, decisions D-8 / A-11 / D-4 `a1215b37`) — but its own audit still
  says **not ready for production** (A-03, A-04, A-05 partly fixed; waiting on D-1, D-2, D-3, D-5, D-6, D-7, D-9, D-10, N-11;
  see `calculator/docs/dashboard-audit/decisions-2026-11-25.md`).

## 4. Open — from JLR IT

1. A Linux VM with Docker (RHEL or Ubuntu)? Do they build the image from their package mirror, or import ours?
2. Which HTTPS gateway and single sign-on (e.g. Entra ID application proxy, nginx / F5)?
3. An internal SMTP relay for sign-in codes?
4. Backup and disk-encryption standard for application VMs?
5. Security review or penetration test required before go-live?

## 5. Open — from the project owner

- Confirm Option A (or what IT prefers); name the IT contact and a pilot group of 5–10 users.
- The email domains for `CV_SIGNUP_DOMAINS` and the admin addresses.
- KPI dashboard in Phase 1: live with a "not ready" caveat, or hidden until its decisions are made.
- JLR material / finish specification lookup table for the drawing reader (to come).
- Whether JLR STEP files carry PMI (AP242) — later, a third source for the drawing data layer.

## 6. Limits to state in go-live material

- Cost accuracy is unmeasured: no costing has been compared with a price JLR paid (`npm run accuracy`, the CAD and PCB
  actuals files are where they go).
- The drawing reader has not been measured on real JLR drawings — the agreed final check runs inside JLR
  (`calculator/scripts/drawings/accuracy.ts`).
- Some machining inputs are still rules of thumb (cast / forge audit packages PKG-1, 3, 4, 5, 7 not approved).
