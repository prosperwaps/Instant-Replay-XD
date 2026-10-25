# CBC School Ecosystem: Module-by-Module Implementation Plan

Companion to `cbc_school_ecosystem_refined_spec_and_gap_analysis.md`. Every module below applies the fixes and gaps identified there.

**How to read each module plan:** Purpose → Users → Scope split (MVP / Next / Later) → Workflows & states → Business rules → Screens → Data → Offline & notifications → Permissions → Integrations → Edge cases → Acceptance criteria → Dependencies → Risks → Size.

**Sizing:** S (≈2–3 weeks), M (≈4–6), L (≈7–10), XL (≈11+), in *team-weeks for a small part-time student team*. These are planning estimates, not commitments; re-estimate after Phase 0.

**Priority tags:** P0 must-have for go-live of that module · P1 first term after launch · P2 later.

---

## 0. Build Order at a Glance

| Order | Module | Why here | Size |
|---|---|---|---|
| 0 | **Phase 0: Discovery & governance** | Nothing else is safe without it | M (mostly non-code) |
| 1 | **Module 0: Platform Core** (identity, roles, multi-tenant, audit, notifications, files, sync framework) | Every module depends on it | XL |
| 2 | **Module 2: Admin Dashboard: setup & grading engine** | Data must exist before teachers can enter marks | XL |
| 3 | **Module 3: Teacher App** | Produces the marks the whole system runs on | XL |
| 4 | **Report cards** (part of Module 2) | First visible value to parents/principal | L |
| 5 | **Module 5: Parent App** (marks, report cards, announcements first) | Delivers transparency | L |
| 6 | **Module 4: Attendance** | Needs ID cards, devices, and parent app | L |
| 7 | **Module 6: Finance** (extracted from Parent App, now its own module) | Highest risk; needs stable base | XL |
| 8 | **Module 1: Website, Admissions & Portal** | Can run in parallel from Phase 2 as low-coupling work | L |
| 9 | **Module 7: Operations & Analytics** (timetable, discipline, health, library, dashboards) | Needs everything else stable | XL |

> **Recommended tech direction (open to change):** Keep Appwrite as backend if terms are confirmed. Use **one cross-platform mobile codebase** (Flutter or React Native) for Teacher, Parent and Scanner as three build flavours sharing a common offline/sync library. Admin and public site as web apps. If Appwrite proves limiting (complex authorization, reporting queries), plan a portable data model so you can move to Postgres-based hosting without rewriting the apps.

---

## PHASE 0: Discovery & Governance (Before Any Code)

**Goal:** Remove the assumptions that would otherwise be baked into code.

**Deliverables**
1. **Signed governance pack:** data ownership (CBC owns everything), named CBC system owner, student-team role limits (no production data access), data protection policy, acceptable-use policy.
2. **Artefact collection** from the pilot school: report card template(s) per level, mark sheet formats, grading scales and coefficients, fee schedule and payment history format, class list format, ID card design, GCE registration forms, discipline log format, timetable.
3. **Parent survey (short):** smartphone ownership, Android vs iPhone, mobile data usage, WhatsApp use, preferred language, willingness to pay via MoMo/Orange Money.
4. **Device audit:** which teacher and gate-staff phones exist; Android versions; storage; whether school will supply devices.
5. **Terms verification:** Appwrite plan, Vercel plan, Firebase, payment aggregator terms (fees, KYC, settlement times), app-store fees.
6. **Pilot selection:** one school, one section, ideally one form/class group to begin.
7. **Glossary:** agree official terms (sequence, term, blame, warning, class master, etc.), EN/FR.
8. **Risk register and budget** (running costs list from the gap analysis §4).

**Exit criteria:** CBC sign-off on scope of Phase 1, pilot class chosen, templates in hand.

---

## MODULE 0: PLATFORM CORE

**Purpose:** The shared foundation: identity, permissions, multi-school structure, auditing, notifications, files, and offline sync. Not visible to users, but it determines whether everything else is safe and maintainable.

**Users:** All (indirectly); System Admin directly.

### Scope

| Tier | Features |
|---|---|
| **MVP (P0)** | Multi-tenant model (School → Section → Class); users & roles (RBAC); staff invitation and offboarding; login, password reset, 2FA for privileged roles; guardian identity (phone/email + OTP option); audit log; academic-year/term/sequence calendar; file storage with signed URLs; notification service (queue + push); background jobs; configuration store (thresholds, schemes); environments (dev/staging/prod); backups; error monitoring |
| **Next (P1)** | SMS gateway abstraction (provider-swappable); feature flags; device/session management; data export tooling; rate-limit dashboards |
| **Later (P2)** | Impersonation for support (logged); custom report builder framework; department-level roll-up across schools |

### Key design decisions

1. **Server-side authorization on every request.** Client checks are for UX only. Write automated tests: "Parent A cannot read Student B", "Teacher cannot edit a class they don't teach", "Bursar cannot edit marks".
2. **Everything sensitive writes an audit record:** actor, role, action, entity, old value, new value, timestamp (server), device/IP, reason (if required).
3. **Time is server-authoritative.** Store both `client_time` (when captured) and `server_received_time`. Business rules (edit windows, deadlines) use server time.
4. **Soft delete + history** for students, marks, payments (never hard delete).
5. **Idempotency keys** on every write coming from offline apps or webhooks.
6. **Configuration over hardcoding:** thresholds, weights, coefficients, scales, fee rules, lateness cut-offs are data with effective dates and version numbers.

### Data model (core)
`School, Section, AcademicYear, Term, Sequence, User, Role, Permission, RoleAssignment, StaffProfile, Guardian, GuardianStudentLink, Student (identity only here), Device, Session, AuditLog, NotificationJob, NotificationDelivery, FileObject, ConfigSetting (versioned), SyncCursor`.

### Workflows
- **Staff onboarding:** Admin creates staff → invite (email/phone) → set password → forced 2FA setup for privileged roles → role assigned by second approver.
- **Staff offboarding:** Admin disables account → all sessions revoked → devices remotely signed out → assigned classes flagged for reassignment. Target: same day.
- **Guardian linking:** (owned by Module 5 but rules live here) code generation, expiry, verification.
- **Notification pipeline:** event → template + language + recipient resolution → channel choice (push → in-app → SMS if critical/undelivered) → delivery log → retry.

### Sync framework (shared by Teacher app and Scanner)
- Local encrypted DB with schema versions and migrations.
- Outbox pattern: each change becomes a queued operation with a unique ID.
- Server processes ops idempotently, returns accepted / rejected / conflict with reason.
- Visible statuses in UI: `Saved on this phone → Sending → Synced → Needs attention`.
- Minimum-cache policy: device only stores its user's classes.
- Forced update gate: server can reject app versions below a minimum.

### Non-functional
- Availability target during school hours (define with CBC).
- Backup daily; **restore drill before go-live and each term**.
- Alerts on: failed jobs, notification queue depth, sync rejection spikes, auth failures.
- Logging without leaking personal data.

### Acceptance criteria
- Authorization test suite passes for all roles and cross-tenant cases.
- Audit log shows a full trail for a sample mark change and a role change.
- Restoring yesterday's backup to staging succeeds and passes smoke tests.
- A revoked staff account cannot sync or log in within minutes.

**Dependencies:** Phase 0 governance. **Risks:** over-engineering; mitigate by building only what Phase 1 needs but with the right interfaces. **Size:** XL (spread across phases).

---

## MODULE 2: ADMIN DASHBOARD (Setup, Grading Engine, Report Cards)

*Planned before Module 1 and 3 because it creates the structures they depend on.*

**Purpose:** Central control for school leadership: define the academic structure, configure grading rules, manage students and staff, approve/lock marks, and produce report cards.

**Users:** Principal, Vice Principals, Registrar, HODs (limited), Class Masters (limited), System Admin.

### Scope

| Tier | Features |
|---|---|
| **MVP (P0)** | Academic structure setup (year, terms, sequences, classes, subjects, class-subject-teacher assignments); **student records** (full profile, medical basics, photo, class number); guardian records; **bulk import** (CSV/Excel) with validation report; grading configuration (scales, coefficients, weights, thresholds); mark sheet monitoring (who has/hasn't entered); mark locking & **correction requests**; computation engine; **report card generation** (versioned, hashed PDF); release control; audit views; basic role management |
| **Next (P1)** | Class council tools (promotion/repeat decisions); moderation and HOD approval; result analysis (pass rates by subject/teacher/class); class remarks & conduct entry; transcripts/testimonials; year-end rollover; duplicate detection/merge; document vault |
| **Later (P2)** | Early-warning risk list; custom reports; scheduled exports; multi-school roll-up |

### Setup wizard (first-run order)
1. School profile & sections → 2. Academic year & terms/sequences (with open/close dates) → 3. Classes/streams → 4. Subjects & coefficients per class → 5. Grading scheme → 6. Staff & roles → 7. Teaching assignments → 8. Import students & guardians → 9. Assign class numbers → 10. Verify with a printed class list.

### Grading engine: rules to specify with the school (all versioned per academic year)
| Rule | Detail to define |
|---|---|
| **Normalization** | `normalized = raw / max × base` (e.g., base 20); rounding: store full precision, display 2 decimals (confirm school preference) |
| **Adjustments** | Bonus/penalty stored separately from raw; cap policy (may total exceed max? default: cap at base unless "allow overflow" configured); reason field |
| **Mark status codes** | `Present(score)`, `Absent (ABS)`, `Excused (EXC)`, `Not Taken (NT)`, `Malpractice (MAL)`. Each has a defined effect on averages (e.g., ABS = 0 counted; EXC = excluded; NT = excluded; MAL = 0 + flag) |
| **Weighting** | Per level/subject/term, e.g., Seq1 20 / Seq2 20 / Exam 60; must sum to 100 |
| **Subject average** | Weighted result out of 20 |
| **Coefficients** | Per class-subject; term average = Σ(subject avg × coef) / Σ(coef) |
| **Ranking** | Rank by term average; tie policy (shared rank, next rank skips); excluded students (transferred mid-term) policy |
| **Thresholds** | Pass mark per subject/level/year; "Failed" flag; "At risk" band (e.g., within 2 points) |
| **Grade scale & comments** | Marks → letter/appreciation, bilingual |
| **Annual average** | Average of three terms (weights configurable) |
| **Promotion rule** | Annual average ≥ threshold, subject minimums, conduct; decision list requires council approval |

**Build the engine as a pure, versioned library** with a test suite of worked examples signed off by teachers. The same code runs on server for authoritative results; the Teacher App may show a preview only.

### Workflows & states
- **Mark sheet:** `Not started → In progress → Submitted → (24h edit window) → Locked → (Correction requested → Approved → Amended & re-locked)` ; optional `HOD Approved` before `Published to parents`.
- **Report card:** `Draft (computed) → Under review → Approved by class master → Approved by principal → Released → (Reissued vX)`.
- **Correction request:** teacher submits reason + new value → VP/HOD approves/rejects (with comment) → applied with audit record → dependent averages recomputed → if report already released, triggers **reissue** and notifies parent.
- **Fallback if VP absent:** configurable delegate role.

### Report card generation
- Template engine matching the school's real layout (header, student photo, bilingual labels, table of subjects with marks per sequence, coefficient, average, rank, class avg/min/max, appreciation, attendance summary, conduct, remarks, signatures, verification QR/code).
- Batch generation per class, with progress and error list ("3 students missing marks").
- **Blockers checklist before generation:** every mark sheet locked; remarks completed; attendance summary closed.
- Output: PDF stored immutably with hash and version; QR points to a verification page showing authenticity, not full data.
- Print-optimized (A4), low ink usage, batch print job.

### Key screens
Dashboard (completion progress per class/teacher) · Structure setup · Student list & profile · Import center · Grading config · Mark sheet monitor · Correction requests · Report card center · Roles & permissions · Audit log viewer · Year-end rollover.

### Data
`Student, Enrolment, Class, Subject, ClassSubject (coef), TeachingAssignment, GradeScheme, AssessmentDefinition, MarkEntry, MarkAdjustment, MarkSheet (status), CorrectionRequest, TermResult, AnnualResult, RankSnapshot, ReportCardVersion, ClassRemark, ConductRecord, PromotionDecision`.

### Edge cases to handle
Student joins mid-term; student changes class; subject taught by two teachers; class with optional subjects; missing mark at report time; retake exams; recalculation after coefficient fix (require re-approval); duplicate class numbers; students with same name; tied ranks; grade scheme change between years (old reports must remain reproducible).

### Acceptance criteria
- Parallel run: system results for a full pilot class match manual/Excel results for the previous term (zero unexplained differences).
- Report card for a pilot student is accepted by the Principal as equivalent to the paper one.
- Locked mark cannot be changed except through correction workflow; audit shows every step.
- Import of 500 students completes with a clear error report and can be re-run safely.

**Dependencies:** Module 0. **Risks:** rule ambiguity; mitigate with signed rule document. **Size:** XL.

---

## MODULE 3: TEACHER APP (Grade Entry, Class Tools, Exam Workspace)

**Purpose:** Fast, error-proof, offline-capable grade entry and teacher workflows.

**Users:** Subject teachers, class masters, HODs, discipline masters (limited).

### Scope

| Tier | Features |
|---|---|
| **MVP (P0)** | Login (with app lock); my classes/subjects; **grade entry (one-student card + list overview)**; separate raw/adjustment input; status codes; offline storage and sync; submit; 24h edit window; correction request; sync status view; class list with photos |
| **Next (P1)** | Multi-paper collaboration & merge; class-master tools (remarks, conduct, attendance summary confirmation); exam workspace (draft → review → published → archived); announcements inbox; discipline quick-log; per-period attendance (if adopted) |
| **Later (P2)** | Homework/assignments; lesson notes; question bank; timetable & substitution view; lab booking |

### Grade entry: refined UI

| Element | Specification |
|---|---|
| Header | Photo, class number, full name, progress "23 / 72", assessment name, max mark |
| Raw mark field | Numeric; validated against max; decimals allowed |
| Status chips | `ABS` `EXC` `NT` one tap (replaces raw field) |
| Adjustment field | Signed value + optional reason; shows resulting total |
| Keypad | **0–9, decimal point, backspace, clear, +/− toggle**, large targets, haptic feedback |
| Navigation | **Previous** and **Next**, jump-to-student (search by number/name), auto-advance option |
| Feedback | Immediate inline error (e.g., "Above maximum 30"); outlier warning; duplicate-entry protection |
| Overview | Toggle to list view: green = entered, amber = missing, red = invalid; tap to jump |
| Review & submit | Summary: entered count, missing, ABS/EXC counts, average, highest/lowest; **submit** disabled until missing entries are resolved or explicitly marked NT |
| Undo | Last action undo; edit history visible before submit |
| Order | Alphabetical (default) or by class number (toggle) |

### Offline behaviour
- Class list, photos (thumbnails), assessment definitions cached on login/first sync.
- All entries go to encrypted local DB → outbox.
- Sync worker uploads when connectivity is detected; retry with back-off; manual "Sync now".
- **Server decides:** accepts if the sheet is open and within window; rejects if locked/closed; conflicts (same mark changed elsewhere) go to "Needs attention" list.
- **Edit window:** starts at first server acceptance of submission; measured in server time only. If a teacher submits offline, the window begins when it syncs (documented and visible: "You can edit until …").
- Lost phone: admin remote sign-out → app wipes local cache on next connect; PIN/biometric lock and auto-lock timeout.

### Multi-paper merge (P1)
- Assessment defined by admin as "composite": Paper 1 (teacher A, weight x%) + Paper 2 (teacher B, weight y%).
- **Model change from "merge request":** instead of merging after the fact, each teacher owns a *component*; the system combines automatically once both components are `Submitted`. A "Request merge" becomes a "Ready" signal + reminder to the other teacher.
- States per component; deadline reminders; if one teacher is unavailable, HOD can reassign the component.
- Audit shows each component's history separately.

### Exam workspace (P1)
- Roles: Setter, Reviewer/Moderator (HOD), Approver.
- States: `Draft → Under Review → Changes Requested → Approved → Sealed (embargoed) → Published to archive`.
- Version history, inline comments, attachment of marking scheme (restricted visibility).
- **Embargo:** exam content invisible to students until the exam is over; archive tagging (Term, Type, Year, Level, Subject) mandatory before archive.
- Export to print-ready PDF; access logged.

### Key screens
Login/PIN · Home (assignments, deadlines, sync status) · Class list · Grade entry card · Overview · Review & submit · Corrections · Multi-paper status · Exam workspace · Settings.

### Data (device)
`LocalClass, LocalStudent (minimal), LocalPhoto, LocalAssessment, LocalMarkEntry, OutboxOp, SyncState`.

### Edge cases
Two teachers share a class; student leaves during entry; wrong assessment selected (confirm screen shows subject/class/assessment in a persistent header); app killed mid-entry (draft persists); very long class lists; low storage; time changed on device; attempting entry after term close; poor camera/photos not cached.

### Acceptance criteria
- A teacher can enter a 60-student mark sheet in airplane mode, close/reopen the app, then sync without loss or duplication.
- Changing the phone's date does not extend the edit window.
- Entering 31/30 is blocked; entering 24.5/30 works.
- Conflict scenario produces a clear "Needs attention" item, not silent overwrite.
- Usability test with 5 real teachers: median entry time per student under target (define, e.g., < 6 seconds) and zero wrong-row errors.

**Dependencies:** Modules 0, 2. **Risks:** sync complexity; teacher device diversity. **Size:** XL.

---

## MODULE 5: PARENT APP

**Purpose:** Secure, low-data window into each child's school life, plus communication with the school.

**Users:** Guardians (parents, guardians, sponsors). Students are not app users in this design (portal access covered under Module 1).

### Scope

| Tier | Features |
|---|---|
| **MVP (P0)** | Sign-up/login (email or phone + OTP); guardian linking via single-use code; child switcher; **Marks** view; **Report cards** (after release); **Announcements**; notification inbox; language switch (EN/FR); data-light mode; onboarding |
| **Next (P1)** | Attendance calendar & absence notes; class remarks/discipline view; trajectory & target tracking; two-way messaging; event calendar; consent/acknowledgement forms; notification preferences; fee tab (read-only until Module 6) |
| **Later (P2)** | Fee payments (from Module 6); appointment booking; complaint tracking; GCE/exam milestone tracker (configurable checklists); web/PWA version |

### Guardian onboarding (refined)
1. Admin creates **guardian record** at admission (name, phone, email, relationship, permissions).
2. System generates a **single-use code per guardian** (expires in 14 days; admin can regenerate). Delivered to the guardian's contact or in a sealed letter, never through the student.
3. Guardian installs app → registers (email/phone + password/OTP) → enters code → app shows **confirmation of child's name/class** (partial info) → guardian confirms → link created.
4. Additional guardians repeat the flow with their own codes.
5. **Unbind/replace:** admin can revoke a link; guardian can request phone change → verified by OTP + admin approval if number changed.
6. Brute-force protection on code entry (attempt limits, lockouts, alerts to admin).

### Permission flags per guardian-child link
`view_marks, view_reports, view_attendance, receive_alerts, view_discipline, view_fees, pay_fees, authorise_pickup, submit_absence_notes`. Defaults set at admission; restrictions honoured for custody/legal cases.

### Tabs (initial set, ordered by value)
1. **Home:** child switcher, alert summary, latest announcement.
2. **Marks:** per subject per sequence, class average (if enabled), trend line and target (P1).
3. **Report cards:** list by term, download PDF (cached offline), verification QR.
4. **Attendance (P1):** calendar with arrival time, late/absent, excuse status; "Report absence" button.
5. **Announcements:** targeted for the child's class/level, with read state.
6. **Remarks & discipline (P1):** severity-aware wording, acknowledgement.
7. **Fees (P1 read-only, P2 payments).**
8. **Exam registration (P2, configurable checklist).**

### Notifications (parent side)
- Categories: Critical (emergency, child absent unexpectedly, payment due), Academic (marks published, report ready), General (events).
- Controls: per-child, per-category, quiet hours (except Critical).
- **Fallback:** Critical alerts unacknowledged in X minutes → SMS (if budget/consent) → flagged for school follow-up.
- In-app inbox always holds the full history so missed pushes aren't lost.
- Guide parents through disabling battery optimization for the app (device-specific tips).

### Data-light & offline
- Text first, thumbnails only, lazy images, cached last-viewed data, PDF caching, small APK.
- "Last updated at …" label on every screen when offline.

### Edge cases
Parent with children across sections; same parent linked to multiple schools (future); parent changes phone; parent deletes app and reinstalls; two parents wanting different permissions; marks released mid-day (avoid partial views: publish by class/assessment atomically); child transfers out (access ends with a grace period, historical reports remain downloadable).

### Acceptance criteria
- Parent can register, link with code, and see only their child's data; cross-child access attempt fails (tested).
- A used or expired code is rejected with a clear message.
- Report card is not visible until release; after re-issue, parent sees new version and is notified.
- App usable on a low-end Android with 2 GB RAM; first load under target data usage (define, e.g., < 1 MB).
- Adoption dashboard shows % of families linked and % with notifications enabled.

**Dependencies:** Modules 0, 2 (data), 3 (marks). **Risks:** adoption, smartphone access; mitigate with channels + training. **Size:** L.

---

## MODULE 4: ATTENDANCE SYSTEM (Staff-Operated)

**Purpose:** Reliable, fast, tamper-resistant recording of student arrival (and later per-period attendance), with instant parent visibility.

**Users:** Gate/discipline staff, class masters, teachers, admin (students not operating).

### Scope

| Tier | Features |
|---|---|
| **MVP (P0)** | Staff login with PIN; **QR scan** (signed tokens) with photo verification; **manual fallback** (class + class number) with photo; offline queue & sync; duplicate-scan protection; timestamp capture (device + server); late flag by cut-off; parent notification on arrival (if enabled); daily class summary; ID card generation & reissue workflow |
| **Next (P1)** | Absence notes from parents & approval; per-period attendance for teachers; early departure / sign-out with authorised pickup check; attendance reports (daily, weekly, chronic absence); staff attendance; late-sanction rules |
| **Later (P2)** | Bulk scan mode with tablet/kiosk at gate; NFC option; anomalies detection (same card scanned by different devices in minutes); integration with early-warning system |

### ID card system (foundational)
- Card design (front: photo, name, class, number, year, school; back: QR).
- **QR payload:** opaque signed token (student reference + card version + signature), no personal data inside.
- Card version increments on reissue → old versions rejected at scan time (and cached in offline revocation list refreshed at each sync).
- Batch printing workflow with proof sheet, reprint request, lost-card fee hook (Finance).
- Photo standards (size, lighting, background) and capture process; photo retake procedure.

### Scan flow
1. Staff opens app → PIN/biometric.
2. Camera scans QR → verify signature locally → look up student in cached roster.
3. Screen shows **large photo, name, class, number** with green tick and time; audible + haptic feedback.
4. Log stored locally (`client_time`, device ID, staff ID) → synced; server assigns `server_received_time`.
5. If already scanned today → "Already recorded at 07:42" (no duplicate).
6. If revoked/unknown card → red alert, prompt manual fallback with supervisor code.
7. Parent notification job queued (with configurable delay/batching to avoid spikes).

### Manual fallback
Select class → enter class number → show photo/name → confirm. Marked as `manual` with reason (forgot card / lost card / damaged). Report shows manual rate per staff/day (to detect misuse).

### Business rules (configurable per school)
- School day start, late cut-off, absent cut-off.
- Excused categories and who can approve.
- Notification wording: **"Arrived at school at HH:MM"** (gate arrival), not "in classroom".
- Retention of attendance data.

### Offline
- Roster and photos cached per section at day start (sync on entering campus Wi-Fi/data).
- Scans queued; sync automatically; clear "Pending upload: N" indicator.
- Conflict: same student scanned on two devices → keep earliest, log both.
- Device clock drift detection (compare with server on sync; flag scans with suspicious offset).

### Reports & follow-up
Daily absentee list generated by class master by set time → prompt to contact parents → record outcome. Weekly chronic-absence list to VP. Attendance summary auto-fed to report cards.

### Edge cases
Student arrives without card during rush; twins; photo outdated after growth spurt (annual photo refresh); power/phone battery failure at gate (backup device, paper sheet template); student leaves and returns (multi-scan policy); staff scanning at multiple gates; false alerts to parents after system error (correction message procedure).

### Acceptance criteria
- 200 scans in 10 minutes on a mid-range phone with no dropped or duplicated logs, online and offline.
- Reissued card invalidates the old one within one sync cycle.
- Photo shown for every scan; manual override recorded with reason.
- Parent receives the correct time within target latency (define, e.g., < 60 s online).
- Attendance % matches paper register in a one-week parallel run.

**Dependencies:** Modules 0, 2 (students/photos), 5 (notifications); hardware plan. **Risks:** gate congestion, card forgery, privacy. **Size:** L.

---

## MODULE 6: FINANCE & FEES (Extracted as Its Own Module)

**Purpose:** Accurate fee accounting with parent-friendly payment options and clean books for the bursar and Principal.

**Users:** Bursar/accountant, Principal, Registrar (read), Parents (view/pay).

### Scope

| Tier | Features |
|---|---|
| **MVP (P0)** | Fee structures (per level/class/year); student invoices (auto-generated); installment schedules; **manual payment recording** (cash/bank) with numbered receipts; balances & arrears; discounts/waivers/scholarships with approval; bursar dashboard & daily cash-up; parent read-only fee view; receipts PDF |
| **Next (P1)** | **MoMo/Orange Money payments** via aggregator; webhook handling; reconciliation console; refunds/credits; fee-blocking policy engine (with override); accounting exports; debtor reports; payment reminders |
| **Later (P2)** | Expense/budget tracking; payroll; supplier payments; bank statement import matching |

*Sequence:* ship manual-record ledger first (so parents see accurate balances), then add online payments. Payments must never be the only source of truth.

### Ledger design (double-entry-lite)
- `Invoice` (lines by fee type) → `Payment` (method, reference, amount, date, recorded by) → `Allocation` (payment applied to invoice lines/installments) → `Receipt`.
- `Adjustment` (waiver, scholarship, sibling discount, penalty, write-off) with approver.
- Balances are **derived** from ledger entries, never edited directly.
- Immutable entries: corrections via reversal + new entry.

### Online payment flow (P1)
1. Parent selects installment/amount → app creates `PaymentIntent` with unique reference.
2. Redirect/USSD prompt via aggregator → parent confirms on phone.
3. Aggregator webhook → verify signature → idempotency check → mark payment → allocate → issue receipt → notify.
4. If webhook delayed: status "Pending"; job polls aggregator; parent sees "Payment processing".
5. Failed/expired/reversed states handled; duplicate payment detection; wrong-amount handling (partial allocation vs. hold).
6. Daily **reconciliation**: compare aggregator settlement report with ledger; mismatches to a review queue.

### Business rules to confirm
Who pays the gateway fee; late-fee policy; allocation order (oldest first?); part-payments allowed; sibling discounts; staff-child concessions; what happens to fees on withdrawal; carry-forward of arrears; whether report cards/exam slips are withheld and who can override (VP/Principal only, logged, visible to parent as neutral wording).

### Controls (segregation of duties)
- Recording, approving discounts, and reconciling are different roles (or at least different people for high-value actions).
- Receipt numbering sequential and gap-monitored.
- Daily cash-up signed by two people.
- Full audit; exportable for external auditors.

### Screens
Fee setup · Invoicing run · Student ledger · Record payment · Receipts · Waiver approvals · Arrears/debtors · Daily cash-up · Reconciliation · Reports/exports · Parent fee tab (balance, schedule, history, receipts, Pay).

### Edge cases
Payment for wrong child; two children paid in one transaction; overpayment; refund after withdrawal; currency rounding (FCFA integers); backdated payments; partial failure between aggregator and ledger; scholarship changes mid-year; fee structure change after invoices issued (versioned; migration rules).

### Acceptance criteria
- Ledger balances for a pilot class reconcile with the bursar's existing records (opening balances imported).
- Test payments (real small amounts) succeed, fail, and duplicate correctly; reconciliation report catches a planted mismatch.
- No user can edit a balance directly; all changes appear in audit.
- Parent sees receipt and updated balance within minutes of confirmed payment.

**Dependencies:** Modules 0, 2, 5. **Risks:** money errors, aggregator terms, fraud. **Size:** XL.

---

## MODULE 1: PUBLIC WEBSITE, ADMISSIONS & STUDENT PORTAL

**Purpose:** Public face of the school, online admissions pipeline, and a secure student learning-resources area.

**Users:** Public visitors, prospective parents/applicants, admissions staff, students (portal), teachers (uploading papers).

### Scope

| Tier | Features |
|---|---|
| **MVP (P0)** | Public site (about, sections, fees overview, calendar, contact, notice board, news) in EN/FR; **online application form** with document upload; anti-spam; application tracking number & status page; admissions queue with statuses; accept → generate guardian invitation code(s) & student record; email/SMS confirmations |
| **Next (P1)** | Entrance/placement test scheduling; waitlist; document verification checklist; **notice board sync** with announcements (public-safe only); past paper repository (secured student area) with tagging; student portal login |
| **Later (P2)** | Payment of application fee (via Module 6); virtual tour/gallery; alumni page; e-learning materials; online reference letter requests |

### Admissions workflow
`Draft (save & resume) → Submitted → Under Review → Info Requested → Test Scheduled → Decision (Accepted / Waitlisted / Rejected) → Offer Sent → Accepted by parent → Enrolled (class assigned, student ID, guardian codes generated)`.

- Each transition logged; templates for emails/SMS in EN/FR; rejection/waitlist reasons.
- **Duplicate detection** (name + DOB + guardian phone).
- Documents: type whitelist, size limit, client-side compression, malware scan, verification status per document.
- Data collected: legal name as on birth certificate, DOB, place of birth, gender, previous school/class, results, medical notes (optional), guardians (multiple), denomination (if relevant), special needs (optional).
- **Consent checkbox** for data processing (linked to privacy policy) and photo use.
- Draft-saving on poor networks; form works on small screens and with low bandwidth.

### Public notice board
- Only announcements flagged "public" appear; internal or child-specific notices never do.
- Emergency closure banner with override.

### Past paper repository
- Sources: exam workspace (Module 3) archive + admin uploads for external/national papers.
- Metadata: level, subject, term, type (sequence/terminal/mock/national), year, has-marking-scheme (restricted).
- Access control: by student's level; **release rules** (not before the relevant exam cycle ends); watermarking (student ID/date) to discourage bulk redistribution.
- Search & filters; download tracking (for abuse detection); copyright/permissions log for external papers.

### Student portal (minimal, safe)
Student login (school-issued credentials, forced password change; no access to fees or discipline), past papers, notices, timetable (later). Students **never** see or handle guardian invitation codes.

### Security & performance
CAPTCHA/rate limiting on forms; HTTPS; content security; SEO basics; image optimization; uptime monitoring; CDN caching; accessibility checks; separate public and authenticated deployments if practical.

### Acceptance criteria
- End-to-end test: applicant submits with documents → admissions officer moves through states → acceptance creates student + guardian code without re-typing data.
- Form completes on a throttled 3G test; drafts survive refresh.
- Spam test (automated submissions) is blocked.
- Non-authorized user cannot access any past paper or document URL directly (signed/expiring links).

**Dependencies:** Modules 0, 2 (student creation), 3 (papers). Can start in parallel from Phase 2. **Risks:** spam, data quality, exam-paper leaks. **Size:** L.

---

## MODULE 7: OPERATIONS, DISCIPLINE, WELFARE & ANALYTICS

*(New module gathering high-value features missing from the original plan. Deliver in slices.)*

| Slice | Contents | Pri | Size |
|---|---|---|---|
| **7a Discipline & remarks** | Incident log, categories/severity, sanction ladder with approvals, detention scheduling, parent visibility rules, class-master remarks | P0/P1 | M |
| **7b Timetable & rooms** | Timetable builder with conflict detection, teacher substitution, room/lab booking (replaces lone Lab Allocator), exam timetable & invigilation | P1 | L |
| **7c Health & safeguarding** | Sick-bay log, medical alerts for staff, emergency contacts, authorised pick-up, restricted counselling/safeguarding notes with strict access | P1 | M |
| **7d Exam & GCE registration** | Configurable milestone checklists, document verification, candidate list export, subject confirmation by parent, results import & analysis | P1 | M |
| **7e Staff & HR light** | Staff attendance, leave, workload, directory | P2 | M |
| **7f Library / boarding / transport / assets** | Only if the school confirms need | P2–P3 | L |
| **7g Dashboards & analytics** | Principal dashboard; pass rates; attendance and fee KPIs; early-warning list; scheduled exports; **department roll-up across schools** | P1–P2 | L |

### Key rules
- Discipline entries visible to parents follow a policy (which incidents, wording, delay for review) set by administration.
- Counselling/safeguarding notes are visible only to named roles and every view is logged.
- GCE/exam checklist is **configurable data**, not hardcoded fields (works for O-Level, A-Level, FSLC, CEE).
- Timetable is the backbone for per-period attendance and lab booking.

**Acceptance (per slice):** written by school owner during slice kickoff; each slice needs a real workflow observed at the school first.

---

## CROSS-MODULE CONCERNS

### A. Notification matrix

| Event | Source | Recipient | Channel | Critical? |
|---|---|---|---|---|
| Emergency closure | Admin | All targeted guardians/staff | Push + SMS + in-app | Yes |
| Announcement | Admin | Targeted | Push + in-app (public flag → website) | No |
| Student arrived | Attendance | Guardians with alerts on | Push + in-app | No |
| Unexplained absence | Attendance | Guardians | Push, SMS if unread | Yes |
| Marks published | Grading | Guardians | Push + in-app | No |
| Report released / reissued | Report cards | Guardians | Push + in-app | No |
| Payment confirmed / failed | Finance | Payer | Push + in-app (+SMS optional) | No |
| Fee due reminder | Finance | Fee-paying guardian | Push, SMS optional | No |
| Correction request decision | Grading | Teacher | Push + in-app | No |
| Merge/component ready | Teacher App | Other teacher | Push + in-app | No |
| Admission status change | Admissions | Applicant guardian | Email/SMS | No |

### B. Language & content
All templates and UI in EN/FR; terminology glossary maintained centrally; report cards bilingual; user-selectable language, defaulting from school setting.

### C. Testing strategy per module
Unit tests (rules), integration tests (workflows), permission tests, offline scenario tests, load tests (peak days), usability tests with real users, UAT sign-off by named school staff, parallel run for one term before replacing paper.

### D. Documentation deliverables per module
User guide (role-based, with screenshots, EN/FR), quick-reference card, admin runbook, troubleshooting FAQ, architecture notes, "what to do when it's down" paper fallback procedure.

### E. Release & rollout pattern (repeat for each module)
1. Design review with school owner → 2. Build behind feature flag → 3. Staging demo with real (anonymised or test) data → 4. Pilot class/section → 5. Parallel run one term → 6. Review metrics & feedback → 7. Wider rollout → 8. Retire paper process only after sign-off.

### F. Success metrics
| Area | Metric |
|---|---|
| Grading | % mark sheets submitted on time; correction rate; report card generation time |
| Parent adoption | % of families linked; % with notifications enabled; weekly active parents |
| Attendance | Scan success rate; manual override rate; time to complete morning scan |
| Finance | % fees collected on time; reconciliation mismatches; time to issue receipt |
| Reliability | Uptime in school hours; sync failure rate; support tickets per week |
| Satisfaction | Teacher and parent survey scores each term |

---

## SUGGESTED SEQUENCE SUMMARY (Aligned with Gap Analysis Phases)

| Phase | Modules delivered | Pilot |
|---|---|---|
| 0 | Governance, discovery | none |
| 1 | Module 0 (core) + Module 2 (setup, grading, report cards) + Module 3 (grade entry, offline) | One class, parallel run one term |
| 2 | Module 5 (marks, reports, announcements) + targeted announcements + SMS fallback | Pilot class families |
| 3 | Module 4 (ID cards, scanning, alerts) | Gate for pilot section |
| 4 | Module 6 (manual ledger → online payments) | Pilot class fees |
| 5 | Module 1 (admissions, portal, past papers) + Module 3 P1 (exam workspace, multi-paper) + Module 7d (GCE) | Next intake cycle |
| 6 | Module 7 remaining slices, analytics, multi-school roll-up | All pilot sections → other CBC schools |

**Next step recommendation:** finish Phase 0 artefact collection, then convert Module 2's grading rules and Module 3's grade-entry screens into a clickable prototype to validate with 5 teachers and the Principal *before* writing production code.
