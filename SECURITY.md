# Security review: CBC School Ecosystem

**Reviewed:** 2026-10-25 · **Scope:** everything in this repository — the static prototypes in `apps/web` (public site,
admissions, Student Portal, legacy School Admin, Teacher App, Gate App) and the new School Admin in `apps/office` with
`packages/grading-engine` · **Method:** manual code review of every script, threat modelling (STRIDE) of the planned
architecture, dependency audit (`npm audit`), and testing in a real browser.

> **Status in one line:** nothing in this repository is safe to put real student, staff or payment data into yet.
> Every app runs only in the browser, with sample data, and authentication is simulated. Phase 6 of
> `docs/office-rebuild/PLAN.md` is the gate; the checklist in §7 must be complete before any real record goes in.

To report a vulnerability, email the project owner privately. Do not open a public issue.

---

## 1. What we are protecting

| Asset | Why it matters | Who must never see or change it |
|---|---|---|
| Student records (names, class, guardians, phone numbers) | Personal data of **minors** | Anyone outside the school; students other than themselves |
| Marks, ranks and report cards | Decide promotion and futures; a classic tampering target | Students; teachers outside their classes; anyone after lock without the correction workflow |
| Fees and payments | Money; fraud by staff or outsiders | Everyone except the bursar and leadership |
| Discipline and counselling notes | Highly sensitive; can harm a child if leaked | All but the named roles (spec 02 §5) |
| Staff accounts and roles | Whoever controls them controls everything above | Everyone; role changes need a second approver |
| Audit log | The evidence when something goes wrong | Nobody may edit or delete it |

**Adversaries considered:** a curious or resentful student (the most likely attacker: physical access to staff phones
and shared PCs, time, and motive to change marks); a staff member exceeding their role; an outsider phishing staff; a
lost or stolen phone; a malicious browser extension or a compromised dependency.

**Legal context:** these are minors' records in Cameroon. Cameroon's personal data protection law (Law No. 2024/017
of 23 December 2024) applies; confirm the exact obligations — consent, retention, breach notification, cross-border
hosting — with CBC's legal adviser before go-live (spec 02 §10 already lists this question).

---

## 2. Trust boundaries

```
 Browser (untrusted)                     │  Server (Phase 6, trusted)
 ─────────────────────────────────────── │ ───────────────────────────────────────
 School Admin  apps/office               │  Appwrite: auth, TOTP, sessions
 Teacher App   apps/web/teacher          │  Authorisation on every read/write
 Gate App      apps/web/gate             │  Grading engine (authoritative)
 Portal        apps/web/portal.html      │  Append-only audit log
 Public site   apps/web/index.html       │  Payment webhooks (MoMo / Orange)
```

**Rule:** anything that runs in the browser can be read and changed by whoever holds the device. Every permission
check, validation and audit entry in the browser is a convenience. The server must repeat all of them. Today there
is no server, so today **every control in this document that lives in the browser is bypassable**, and it says so.

---

## 3. Findings

Severity follows likelihood × impact *for the moment real data is entered*. "Fixed" means fixed in `apps/office`; the
legacy prototype in `apps/web` keeps the issue until it is retired or rewritten.

| # | Finding | Where | Severity | Status |
|---|---|---|---|---|
| F1 | **No real authentication.** Any password works; any 6 digits pass "two-step". The role switcher grants any role. | `apps/web/office` (legacy), `apps/office` (demo sign-in) | Critical | Open by design until Phase 6. `apps/office` no longer *claims* security it lacks: it labels the sign-in as a demo. |
| F2 | **Stored XSS.** HTML is built from strings with `innerHTML` (83 uses across `apps/web/assets/js`); escaping is applied inconsistently, e.g. ``${c.name}`` in `office.js` is not escaped. A student or class name such as `<img src=x onerror=…>` would run script in an admin's browser. | `apps/web/assets/js/*.js` | Critical | **Fixed in `apps/office`:** React escapes all output; ESLint bans `dangerouslySetInnerHTML` and `.innerHTML` (`eslint.config.js`). Legacy: open. |
| F3 | **Teacher and Gate PINs stored in plain text** in `localStorage` (`bchs-teacher-pin`, `bchs-gate-pins`). Anyone with the unlocked phone, a browser extension or an XSS reads every PIN. | `teacher.js:423`, `gate.js:234` | High | Open. Fix: never store the PIN; derive a key with PBKDF2/Argon2 (≥ 200k iterations, per-device salt) and keep only a verifier, or bind to WebAuthn/platform biometrics. |
| F4 | **Unlimited PIN guesses.** The wrong-PIN counter lives in memory; reloading the page resets it, so all 10,000 four-digit PINs can be tried. | `teacher.js:23`, `gate.js` | High | Open. Fix: persist the counter with the verifier, add increasing delays, wipe local credentials after the limit (gate already wipes, but only within one page load). |
| F5 | **Client-only authorisation.** Every role check is in the browser. | all apps | Critical (at go-live) | `apps/office`: one permission table (`src/domain/permissions.ts`) enforced in the repository for every write, so the server can enforce the same table. Server enforcement is Phase 6. |
| F6 | **Office edits were never audited** (marks, payments, students), contradicting the sign-in page's claim. | legacy `office.js` | High | **Fixed in `apps/office`:** submit, lock, locked-mark edits, sign-in/out and resets are audited; refused attempts are audited too. |
| F7 | **Lost updates.** The whole database is rewritten on every save; two tabs silently overwrite each other. | legacy `office.js` | Medium | **Fixed:** the repository re-reads storage before each write and refuses stale revisions (`ConflictError`); tested. |
| F8 | **Unvalidated data on load.** A hand-edited `localStorage` value flows straight into pages. | legacy | Medium | **Fixed:** the whole store is validated with Zod on load and before every save; an invalid copy is replaced, never rendered. |
| F9 | **Mark range not enforced at the data layer.** The legacy page checks `ca > 20` in the click handler only. | legacy `office.js` | Medium | **Fixed:** `setMark()` rejects out-of-range or over-precise scores even when the UI is bypassed; tested. |
| F10 | **Third-party font requests** to Google Fonts leak staff IP addresses and the fact they use the system. | `apps/web/office/index.html` | Low | **Fixed in `apps/office`:** fonts are self-hosted. |
| F11 | **Vulnerable dependencies at scaffold time** (react-router < 7.17.1: open redirect / XSS advisories; vitest < 4.1.11: dev-server file read). | `apps/office` | High | **Fixed:** pinned to patched versions; `npm audit` reports 0; CI fails on any high advisory. |
| F12 | **No security headers / CSP.** | all apps | Medium | `apps/office/public/_headers` ships a strict CSP (`default-src 'self'`, no inline script, `frame-ancestors 'none'`), `nosniff`, `no-referrer`, a restrictive `Permissions-Policy`, COOP. Legacy: open. |
| F13 | **Sample data uses realistic personal names** of Cameroonian students and staff. | seeds | Low | Accepted: names are generated, not real people. Never paste a real class list into the demo. |
| F14 | **Session lifetime.** Legacy sessions never expire. | legacy | Medium | `apps/office`: tab-scoped session (`sessionStorage`), expires after 8 hours, role re-read from the staff record on every load (a tampered role in storage is ignored); tested. |
| F15 | **Demo reset** wipes all data and the audit log. | `apps/office` | Low (demo only) | Confirmed by a dialog and recorded as the first entry of the new log. Must not exist in production. |

---

## 4. STRIDE on the production architecture (what Phase 6 must deliver)

| Threat | Example | Required control |
|---|---|---|
| **Spoofing** | A student uses a teacher's unlocked phone; phished staff password | Appwrite sessions with short idle timeout; **TOTP or WebAuthn required** for Principal, Vice Principal, Registrar, Bursar, System Admin (`TWO_STEP_ROLES`); device PIN derived key (F3); rate-limited login; no shared accounts |
| **Tampering** | Changing a locked mark; editing an invoice | Server-side authorisation per action using the same table as `permissions.ts`; revision checks (as `Repository.commit`); locked marks change only via correction workflow with reason + second approver; report cards hashed (spec 03) |
| **Repudiation** | "I never changed that mark" | Server-written, append-only audit (no update/delete permission for anyone, including System Admin); server time, not device time; actor, role, before/after, reason, device |
| **Information disclosure** | Students reading others' marks; fees leaking to teachers | Row-level permissions (class/subject scoping for teachers, own-child for parents); minimum data per screen; HTTPS only; no PII in URLs or logs; encrypted backups |
| **Denial of service** | Flooding sync; brute-forcing invitation codes | Rate limits per account and per IP; invitation codes single-use, expiring, 5-attempt lock (already modelled in the platform prototype) |
| **Elevation of privilege** | System Admin grants themself Principal | Role changes require a second approver (spec 02 §5); System Admin cannot approve their own requests; production data access logged and time-boxed |

---

## 5. Controls in `apps/office` today

- **Output encoding by construction:** React only; raw HTML banned by lint (`eslint.config.js`).
- **One write path:** `src/data/repository.ts` — permission check → fresh read → revision check → apply →
  schema validation → audit → save. Refusals are audited. Covered by `src/data/data.test.ts`.
- **Input validation twice:** UI parsing (`parseMarkInput`) for helpful messages, data-layer validation (`setMark`,
  Zod schema) for safety.
- **Least privilege in the UI:** navigation, pages, buttons and command-palette results are filtered by role; a page
  opened by URL without permission explains the refusal instead of rendering.
- **Money:** whole francs only, overflow-checked (`src/domain/money.ts`).
- **Headers:** strict CSP and hardening headers for Cloudflare Pages (`public/_headers`).
- **Supply chain:** exact version pins, lockfile, `npm audit --audit-level=high` in CI, CI token is read-only
  (`permissions: contents: read`) and checkout does not persist credentials.

## 6. Residual risks accepted for the demonstration

- Anyone with the browser can sign in as anyone (F1) and can edit `localStorage` directly; the schema check stops
  malformed data, not well-formed lies.
- The audit log lives in the same browser storage it audits; it is tamper-evident to nobody until it moves server-side.
- `legacy-peer-deps` in `.npmrc` works around an npm resolver crash; all required peers are declared explicitly.

## 7. Go-live checklist (blocking)

- [ ] F1, F3, F4, F5 closed; demo sign-in, role switch and "Restore the sample school" removed from production builds.
- [ ] Legacy `apps/web/office` retired or F2 fixed there; legacy Teacher/Gate apps migrated or F2–F4 fixed.
- [ ] Server-side authorisation tests: for every permission in `permissions.ts`, one allowed and one refused request.
- [ ] Audit log server-side and append-only; verified that no role (including System Admin) can update or delete it.
- [ ] TOTP/WebAuthn enforced for `TWO_STEP_ROLES`; recovery codes; lockout and alerting on repeated failures.
- [ ] Backups encrypted, restore drill done and recorded.
- [ ] Data-protection review with CBC's legal adviser (retention periods, consent for photos, breach procedure).
- [ ] External penetration test of the deployed system, findings fixed or formally accepted by the Principal.
- [ ] Incident response contact list and runbook agreed with the school.
