# School Admin rebuild plan

**Status:** in progress · **Owner:** School Admin (Module 0 + Module 2) · **Started:** 2026-10-25

The School Admin prototype (`apps/web/office`) proved the product shape: one sign-in, one dark sidebar, the
school office and the platform console side by side. It cannot carry real data. This plan replaces it with
`apps/office`, a typed, tested application, in phases that each ship something usable.

The legacy prototype stays in `apps/web/office` until the new app covers every page, so nothing is lost while
the rebuild is underway.

---

## 1. Why a rebuild and not a polish

The design review (2026-10-25) found problems at every layer. Each one maps to a fix below.

| # | Finding in the prototype | Severity | Fixed by |
|---|---|---|---|
| 1 | Mark entry boxes render black text on a black background; marks cannot be read | Blocker | Phase 1 · correctly named tokens, new mark sheet grid |
| 2 | Inverted token names in `styles.css` (`--black: #fff`, `--white: #3dba3d`) leak into every control | Blocker | Phase 1 · `apps/office/src/styles/tokens.css` |
| 3 | Sidebar is `sticky` at a fixed 720px and ends mid-page on long screens | High | Phase 1 · full-height shell grid |
| 4 | Filters lie (Routine "All" shows Form 1A; Attendance "All" renumbers the whole school) | High | Phase 1 · URL-driven filters; Phase 3 · per-class register |
| 5 | Warning amber used for neutral counts and for **Paid** | High | Phase 1 · one meaning per colour |
| 6 | Overview is a launcher: numbers without context, a queue that repeats the sidebar | High | Phase 1 · decision-led overview |
| 7 | 22 font sizes on one page, smallest 10.8px | Medium | Phase 1 · 7-step type scale, 13px floor |
| 8 | 36 nav items for every role, no role filtering, no URLs, no Back button | High | Phase 1 · role-filtered nav, real routes, command palette |
| 9 | "Acting as" role switcher permanently in the top bar | Medium | Phase 1 · demo switch moved into the account menu, demo-only |
| 10 | Plural slop ("1 change(s)"), template copy ("Configure sms / email provider…") | Medium | Every phase · `pluralize()` and written copy |
| 11 | Native `confirm()`, modal without focus trap, "Save changes" on new records | Medium | Phase 1 · `Dialog`, `ConfirmDialog` primitives |
| 12 | Buttons that only toast "needs a server" | Medium | Every phase · a control ships only when it works |
| 13 | `innerHTML` string building, inconsistent escaping, stored XSS path | Critical | Phase 1 · React (escaped by default), lint rule bans `dangerouslySetInnerHTML` |
| 14 | Two data stores, whole-database rewrites, no conflict detection | High | Phase 1 · one repository with revisions and cross-tab sync |
| 15 | Office edits (marks, payments) never audited | High | Phase 1 · every sensitive mutation writes an audit entry |
| 16 | Security claims on the sign-in screen that are not true | High | Phase 1 · honest demo sign-in; Phase 6 · real auth |
| 17 | Zero tests | High | Phase 1 · Vitest across domain, store and UI |

---

## 2. Architecture

```
apps/office/                     School Admin (new)
  src/
    app/          router, providers, session
    shell/        sidebar, top bar, command palette, account menu
    ui/           primitives: Button, Field, Badge, Dialog, Table, Meter, EmptyState, Toast
    domain/       pure logic: money, permissions, dates, plural, school calendar
    data/         repository, storage adapters, schema, seed, audit
    features/     one folder per area: overview, marks, (students, attendance, fees, platform … later)
    styles/       tokens.css, base.css
packages/grading-engine/         pure, versioned, test-covered (spec 03 §Module 2)
```

| Decision | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict` | Catches whole classes of bugs before they reach a school |
| UI | React 19 + Vite 7 | Escaped output by default; components replace string templates |
| Routing | React Router 7 | Every page has a URL: Back works, links can be shared and bookmarked |
| Styling | CSS Modules over one token file | Scoped styles, one source for every value |
| Validation | Zod 4 | The same schema checks stored data, imports and form input |
| Tests | Vitest + Testing Library | Fast unit tests for domain and store, behaviour tests for UI |
| Fonts | Self-hosted Poppins (UI), JetBrains Mono (numeric grids) | No third-party font request leaks staff IPs; numbers line up in columns |
| Data | Repository interface, `localStorage` adapter now, Appwrite adapter in Phase 6 | Pages never know where data lives, so the backend swap touches one folder |

The repository is the only way to change data. Every write goes through `commit()`, which checks the actor's
permission, bumps the record revision (rejecting stale writes from another tab), and appends an audit entry
for sensitive actions. The same contract will be enforced server-side in Phase 6; the client check is a
convenience, not the security boundary (see `SECURITY.md`).

---

## 3. Design system (School Admin)

Inherits the project rules in the root README: Poppins, square corners, no gradients, no 3D, no decorative
motion; pure `#000`, `#fff`, `#3dba3d` on quiet neutrals.

**One meaning per colour**

| Token | Value | Means | Never used for |
|---|---|---|---|
| `--ink` | `#000` | Text, primary action, selected state | Status |
| `--brand` | `#3dba3d` | The brand mark and the active-page marker in the sidebar | Status, counts, decoration |
| `--ok` / `--ok-tint` | `#1b7a1b` / `#e7f5e7` | Done, paid, present, connected | Brand |
| `--warn` / `--warn-tint` | `#8f5d00` / `#fbf1dc` | Needs action soon, partial | Neutral figures, completed states |
| `--bad` / `--bad-tint` | `#b42318` / `#fdeceb` | Blocked, overdue, failed, invalid input | Decoration |
| neutrals | `--surface`, `--page`, `--line`, `--muted` | Structure | Meaning |

**Type scale, 7 steps, 13px floor:** 13 · 14 · 15 (body) · 17 · 20 · 26 · 34. Figures use tabular numbers.

**Spacing:** 4px base (4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56).

**References:** Linear (sidebar density, command palette), Stripe Dashboard (home that leads with what needs
you, money formatting), Vercel (status language), Airtable / Google Sheets (keyboard grid entry).

---

## 4. Phases

Each phase ends with: typecheck, lint and tests green in CI; the pages checked in a real browser at 1440px
and 390px; `SECURITY.md` updated; the legacy page it replaces marked as superseded.

### Phase 1 · Foundations, overview and mark sheets *(this change)*
- Tooling: npm workspaces, strict TS, ESLint (React, hooks, a11y), Vitest, GitHub Actions CI.
- `packages/grading-engine`: normalisation, status codes (ABS, EXC, NT, MAL), adjustments with cap, weighted
  subject average, coefficients, term average, competition ranking, appreciation bands, weight validation.
- Data layer: schema, deterministic seed (a realistic school: 6 classes, ~230 students), repository with
  revisions, cross-tab sync, append-only audit.
- Domain: money in whole francs (FCFA has no subunit) with overflow-safe arithmetic, permission matrix from
  spec 02 §5, plural helper, Africa/Douala dates.
- Shell: full-height sidebar filtered by role, routes, top bar, `⌘K` command palette, account menu with the
  demo switch, skip link, focus management.
- Sign-in: honest demo sign-in that keeps the geometric panel.
- **Overview**: what needs the signed-in person today, sequence progress per class, attendance today, fees
  against expectation.
- **Mark sheets**: monitor (every class × subject for the open sequence, filterable by status) and a
  keyboard-first entry grid with status codes, live validation, class statistics, submit and lock.

### Phase 2 · People
Student register (class-aware add flow, duplicate check, profile page), admissions queue with decision
history, guardians and links, teachers and assignments, CSV import with a validation report.

### Phase 3 · School day
Attendance as a per-class register (roll numbers preserved), class routine as a real weekly calendar with
breaks and clash detection, notices.

### Phase 4 · Finance
Ledger-based fees (invoice, payment, waiver as entries), receipts, balances by class, waiver approvals
(Bursar proposes, Principal approves), income and expenses with an accountant's number format.

### Phase 5 · Platform console
Audit log (grouped by day, detail drawer, filters, paging), roles matrix with readable labels and a request
flow, approvals, devices and sync, configuration, backups, system health.

### Phase 6 · Backend and real security
Appwrite adapter behind the repository, server-side authorisation and audit, real sign-in with TOTP for
privileged roles, rate limiting, CSP headers, migration from the demo store. The demo sign-in is removed.

---

## 5. Definition of done (every page)

- Works by keyboard alone; visible focus; labels on every control; landmarks and one `h1`.
- Every state designed: loading, empty, error, read-only, and the permission-denied view.
- No figure without context (a comparison, a target, or a time frame).
- Colour follows the table in §3; text never below 13px.
- Copy written for the reader: no "(s)", no template sentences, sentence case.
- Covered by tests: domain rules as unit tests, page behaviour as Testing Library tests.
