# CBC School Ecosystem: Refined Specification & Production-Readiness Gap Analysis

**Basis:** `cbc_school_ecosystem_master_specification.md` (Student Council proposal)
**Purpose:** (1) Fix weaknesses in the existing plan, (2) list everything missing for a production-grade school system, (3) propose a realistic phased delivery.

**Priority key:** **P0** = cannot go live without it · **P1** = needed within first term of use · **P2** = important, can follow · **P3** = nice to have

Items marked **(verify)** are things I believe to be true but that you should confirm against current official sources before putting them in front of the CBC Education Department.

---

## 0. Executive Verdict

The proposal has a strong core: admission → grading → report cards → parent visibility, with sensible ideas (single-use invitation codes, raw-mark/bonus separation, offline-first teacher app, one-student-at-a-time entry). But as written it is a **feature pitch, not a production system**. Five categories of gap stand out:

1. **Academic logic is incomplete for the Cameroon system**: no coefficients, ranking, class averages, absent/excused mark handling, promotion rules, or bilingual reports.
2. **Access and identity model is too thin**: one parent per family, no guardians, no staff roles beyond three labels, no audit trail.
3. **Whole operational areas are missing**: timetable, fees engine (discounts/scholarships/receipts), staff/HR, discipline workflow, health, transport/boarding, library, communications.
4. **Non-functional requirements are absent**: security, backups, data protection law, monitoring, support, accessibility, performance on low-end phones.
5. **The "zero-cost" claim is fragile**: several costs and licensing limits are not accounted for, and the model depends on students who will graduate. Sustainability and ownership are the biggest risk to CBC.

---

## 1. Corrections to the Existing Plan (Fix What's Already There)

### Module 1: Website & Student Portal

| Issue | Refinement |
|---|---|
| Registration collects documents but no rules on file type/size/malware | Whitelist PDF/JPG/PNG, max size, server-side scan, image compression client-side (low bandwidth) |
| Public form is a spam/abuse target | CAPTCHA (e.g., Turnstile/hCaptcha), rate limiting, duplicate detection (name + DOB + parent phone) |
| "Pending Review" queue has no states | Add states: `Submitted → Under Review → Info Requested → Entrance Test Scheduled → Accepted / Waitlisted / Rejected → Enrolled` with reasons and timestamps |
| No applicant feedback | Application tracking number, status page, email/WhatsApp notification, resubmission of missing documents |
| Past papers: copyright/exam-security issues | Access control by class/level, watermark PDFs with student ID, release-date rules (don't publish a paper before the exam cycle is over), separate "official board papers" from "internal" |
| Announcement engine: "one click to everyone" is dangerous | Targeting (whole school / section / class / single parent group), approval workflow for emergency vs. routine, scheduling, edit/retract, read receipts, language versions (EN/FR) |
| No accessibility/language | English + French, low-bandwidth mode, WCAG-conformant public site |

### Module 2: Admin Dashboard & Grading Engine

| Issue | Refinement |
|---|---|
| Normalization ("out of 35 → out of 20") ignores rounding | Define rounding rule once (e.g., 2 decimals stored, displayed to 1-2), applied consistently and documented |
| "Weighting: Seq 1 20% / Seq 2 20% / Exam 60%" is only one scheme | Configurable **assessment schemes per level/subject/term**, versioned per academic year |
| No **coefficients** | Cameroon report cards weight subjects by coefficient; term average = Σ(mark × coef) / Σ(coef). Must be first-class |
| No **ranking** | Class rank, ties, rank out of N, subject rank; configurable tie policy |
| No **absent / excused / not-taken / malpractice** codes | Marks need status codes distinct from 0; define how each affects averages |
| Dynamic thresholds per subject only | Also per level, per year; plus grade scales (A–F, comments bands, honours roll) |
| Report cards "unalterable" | Immutable snapshot with version number, hash, QR verification code, and a controlled **re-issue** process for corrections (with reason + approver) |
| Lab booking is minor and isolated | Fold into a general **Resource & Room Booking** feature tied to the timetable |
| Only Principal/VP/Registrar | Need granular RBAC (see §3.14) |

### Module 3: Teacher App

| Issue | Refinement |
|---|---|
| Keypad has only digits 0–9 | Needs **decimal point, backspace/clear, minus sign, and absent (ABS) / excused (EXC)** keys. Otherwise half-marks and corrections are impossible |
| One-student-per-screen is slow for 60–100 students | Add: progress bar ("23/72"), jump-to-student, previous button, list overview with missing entries highlighted, "review before submit" screen, undo |
| Max mark validation | Reject values above the max; warn on outliers; bonus/penalty must not push total outside allowed range (or must require explicit flag) |
| Photos in a card UI on weak networks | Pre-cache class photos in compressed thumbnails during sync |
| 24-hour edit window based on what clock? | Must be measured by **server-received time**, not device time. In offline mode, a teacher could change the phone date. Define: window starts at first successful sync (or use signed server time + monotonic offline counter) |
| Offline sync conflicts | Define conflict resolution: per-record versioning, last-writer rules, conflict queue for admin. Two devices editing the same mark sheet must not silently overwrite |
| "Merge Requests" for multi-paper subjects | Define what happens if Teacher B rejects, times out, or edits after merge; partial merges; audit trail; weights per paper |
| Lock after 24h; only VP can edit | Add **change-request workflow**: teacher requests correction with reason → VP approves → logged. VP-only editing becomes a bottleneck and a single point of failure |
| Exam workspace: Draft → Review → Published | Add roles (setter, moderator/HOD, approver), comments/version history, confidentiality (exam papers must not leak before exam day), **embargo until exam start time**, print-ready export |
| Teacher device security | App lock (PIN/biometric), remote sign-out, session expiry, lost-phone procedure (personal phones hold student data) |

### Module 4: Attendance

| Issue | Refinement |
|---|---|
| Static QR codes can be photographed and shared | Sign the QR payload; support **card revocation and reissue** (lost card → old code invalid); optional rotating element; verify photo on every scan |
| "Exact timestamp" from network | Offline scanning at the gate is common; queue scans locally with device timestamp + sync-time stamp; flag mismatches |
| Notification says child "walked into classroom" | A gate scan proves campus entry, not class presence. Distinguish **gate arrival** from **per-period class attendance** |
| Only one daily scan | Need: arrival, per-period/subject attendance (for teachers), departure/sign-out, early-leave permission |
| Absence reasons, excuses | Parent submits absence note in app; admin/class master approves; categories (sick, family, funeral, etc.) |
| Lateness rules | Configurable cut-off time, automatic "late" flag, accumulated-lateness sanctions |
| Bulk scan performance | Queue-based notification batching; scanner must work with one-hand, fast repeated scans, audible/haptic feedback, duplicate-scan protection |
| No visitors/staff | Staff attendance, visitor log, early pickup authorization |

### Module 5: Parent App

| Issue | Refinement |
|---|---|
| One invitation code binds one parent | Need **multiple guardians per student** (father, mother, guardian, sponsor) with different permissions (e.g., fee-payer vs. view-only). Handle separated/divorced parents and legal-guardian restrictions |
| "Permanently binds" account | Need unbinding, transfer, replacement of lost phone, guardian change, and admin override, all audited |
| Email + password only | Many parents lack regular email use. Support **phone number + OTP**, password reset, and optional PIN/biometric |
| Push-only notifications | Parents on feature phones or without data can't receive them; see §3.2 for fallback channels |
| Mark Checking shows "trajectory" | Also show class average (privacy-safe) and subject-level comments |
| Fee tracker with mobile money | See §3.5: needs receipts, reconciliation, refunds, partial payments, failed/duplicate handling |
| GCE checklist is hardcoded to 4 items | Make **configurable milestone checklists** per exam and per class (also applies to other exam classes and FSLC/CEE, not GCE only) |
| No parent-to-school channel | Add absence notes, appointment requests, complaints, replies |
| Tabs are read-only | Add acknowledgements (e.g., "I have read the term schedule"), consent forms, permission slips |

---

## 2. Feature Gap Catalogue: Everything Missing

### 2.1 Academic Management

| # | Missing feature | Pri |
|---|---|---|
| 1 | Academic year / term / sequence calendar management (open/close periods) | P0 |
| 2 | Classes, streams/arms, sections (Nursery, Primary, Secondary, High School), forms, lower/upper sixth | P0 |
| 3 | Subject catalogue, per-level subject assignment, optional subjects, subject combinations (Arts/Science, A-Level) | P0 |
| 4 | Teacher-subject-class assignment | P0 |
| 5 | Subject **coefficients** and coefficient sets per class | P0 |
| 6 | Class ranking, subject ranking, class average, highest/lowest | P0 |
| 7 | Assessment types (quizzes, tests, practicals, projects, orals) with rules | P1 |
| 8 | Competency-based / skills assessment for lower levels (if applicable) | P2 |
| 9 | Promotion, repetition, exclusion, and **end-of-year decision rules** (council of class) | P0 |
| 10 | Class councils / staff evaluation meeting support (pre-filled decisions, minutes) | P1 |
| 11 | Honour roll, encouragement, warning, blame (Cameroon terms), conduct grades | P1 |
| 12 | Curriculum, scheme of work, lesson plans, lesson notes | P2 |
| 13 | Homework/assignment distribution and submission | P2 |
| 14 | Timetable builder with conflict detection (teacher, class, room) | P0 |
| 15 | Teacher substitution and cover management | P1 |
| 16 | Duty rosters (discipline duty, gate duty, supervision) | P2 |
| 17 | Exam timetable, invigilation roster, seating plans, candidate slips | P1 |
| 18 | Marks moderation and HOD approval before publication | P1 |
| 19 | Result analysis (pass rates by subject/teacher/class, item analysis) | P1 |
| 20 | Transcripts, certificates, testimonials, attestations of attendance | P1 |
| 21 | Student progress across years (longitudinal record) | P1 |
| 22 | E-learning / LMS (videos, notes, quizzes) | P3 |
| 23 | Question bank with topic/difficulty tagging | P3 |
| 24 | Remedial/intervention tracking for flagged students | P1 |
| 25 | Special-needs/learning-support records | P2 |

### 2.2 Student Lifecycle & Records

| # | Missing feature | Pri |
|---|---|---|
| 26 | Complete student profile (DOB, gender, nationality, language, religion/denomination, previous school, address) | P0 |
| 27 | Guardians/emergency contacts (multiple, ranked) | P0 |
| 28 | Medical profile: allergies, conditions, medications, blood group, consent for emergency treatment | P0 |
| 29 | Authorised pick-up persons list and check-out log (child safeguarding) | P1 |
| 30 | Entrance exam / placement test workflow | P1 |
| 31 | Class placement and reassignment (mid-term transfers) | P0 |
| 32 | Class numbers: assignment rules, changes on reshuffle, uniqueness | P0 |
| 33 | Transfers in/out, withdrawals, dropouts, transfer certificates | P1 |
| 34 | Student ID card design, batch printing, reprint, lost-card fee | P0 |
| 35 | Alumni records and graduation | P3 |
| 36 | Duplicate-student detection and merge tool | P1 |
| 37 | Bulk import from Excel/CSV for existing students and marks (migration) | P0 |
| 38 | Document vault (birth certificates, previous reports) with verification status | P1 |
| 39 | Student clubs, sports, extracurricular, awards | P3 |

### 2.3 Communication

| # | Missing feature | Pri |
|---|---|---|
| 40 | **Fallback channels** when push isn't possible: SMS for critical alerts, WhatsApp share, USSD, printed notices | P0 |
| 41 | Two-way messaging (parent ↔ teacher, parent ↔ admin) with moderation and working-hours rules | P1 |
| 42 | Targeted announcements (class, level, section, group) | P0 |
| 43 | Emergency broadcast with delivery confirmation and escalation to SMS/calls | P0 |
| 44 | Notification preferences and quiet hours | P1 |
| 45 | Language selection (EN/FR) | P1 |
| 46 | School events calendar, PTA meetings, open days | P1 |
| 47 | Surveys/polls/feedback forms | P3 |
| 48 | Parent-teacher meeting booking | P2 |
| 49 | Complaint/suggestion box with tracking | P2 |
| 50 | Delivery and read-receipt tracking | P1 |

### 2.4 Discipline, Welfare & Safety

| # | Missing feature | Pri |
|---|---|---|
| 51 | Discipline incident log with categories, severity, witness, action taken | P0 |
| 52 | Sanction workflow (warning → detention → suspension → dismissal) with approvals | P1 |
| 53 | Detention scheduling and completion tracking | P1 |
| 54 | Counselling/pastoral care notes with **restricted** access | P1 |
| 55 | Bullying and safeguarding reports (confidential, anonymous option) | P1 |
| 56 | Sick-bay/infirmary log and parent notification | P1 |
| 57 | Emergency contact quick-access for staff offline | P1 |
| 58 | Chaplaincy/spiritual life tracking (relevant for a mission school) | P3 |

### 2.5 Finance (Currently the Thinnest Area)

| # | Missing feature | Pri |
|---|---|---|
| 59 | Fee structure per level/class/year: tuition, PTA levy, registration, exam fees, uniforms, books, boarding, transport, lab, sports | P0 |
| 60 | Installment plans with due dates and automatic balance calculation | P0 |
| 61 | Discounts, scholarships, sibling rebates, staff-child concessions, waivers | P0 |
| 62 | Multiple payment methods: MoMo, Orange Money, **bank deposit, cash at bursar**, cheque | P0 |
| 63 | Receipts (numbered, printable, PDF, QR-verifiable) | P0 |
| 64 | Payment **reconciliation** against gateway reports (failed, pending, duplicate, reversed) | P0 |
| 65 | Refunds, credits, overpayment handling | P1 |
| 66 | Payment confirmation flow when gateway callback is delayed/lost | P0 |
| 67 | Fee-blocking rules (e.g., withhold report card or exam slip) with an approval override and policy transparency | P1 |
| 68 | Arrears tracking across years, debtor reports | P0 |
| 69 | Bursar dashboard, daily cash-up, end-of-day report | P0 |
| 70 | Expense tracking, budgets, petty cash | P2 |
| 71 | Payroll/salary and staff advances | P2 |
| 72 | Accounting export (to Excel/accounting software), audit-ready ledgers | P1 |
| 73 | Gateway fee policy (who pays the percentage: school or parent) and fee display transparency | P0 |
| 74 | Segregation of duties (who records, who approves, who reconciles) | P0 |
| 75 | Tax/legal compliance for receipts and school-fee records | P2 |

### 2.6 Staff & HR

| # | Missing feature | Pri |
|---|---|---|
| 76 | Staff profiles, contracts, qualifications, subjects taught | P1 |
| 77 | Staff attendance and leave requests | P1 |
| 78 | Staff onboarding (invite, role assignment) and **offboarding** (revoke access same day) | P0 |
| 79 | Workload tracking (periods per week) | P2 |
| 80 | Performance appraisal / class observation | P3 |
| 81 | Staff directory and internal announcements | P1 |
| 82 | Professional development records | P3 |

### 2.7 Operations & Resources

| # | Missing feature | Pri |
|---|---|---|
| 83 | Room/lab/hall/sports field booking integrated with timetable | P1 |
| 84 | Asset and inventory management (equipment, furniture, lab chemicals, consumables) | P2 |
| 85 | Library (catalogue, borrowing, fines, e-resources) | P2 |
| 86 | Boarding/hostel (rooms, roll call, exeat/leave, boarders' fees) | P2 |
| 87 | Transport (routes, buses, pick-up lists, tracking) | P3 |
| 88 | Canteen/tuck shop | P3 |
| 89 | Uniform/textbook stock and sales | P3 |
| 90 | Maintenance requests and tickets | P3 |
| 91 | Print management (report cards, ID cards) with batch jobs | P0 |

### 2.8 Reporting, Analytics & Governance

| # | Missing feature | Pri |
|---|---|---|
| 92 | Principal dashboard (attendance %, fee collection %, pass rates, risk students) | P1 |
| 93 | **Multi-school support** for the CBC Education Department (per-school data isolation + department roll-up) | P0 if more than one school will use it |
| 94 | Statutory reports (enrollment statistics for MINESEC/relevant authorities, GCE Board candidate lists) | P0 |
| 95 | Early-warning system (attendance + marks + fees + discipline combined risk) | P2 |
| 96 | Custom report builder and scheduled exports | P2 |
| 97 | Data export in open formats (CSV/PDF/Excel) so CBC is never locked in | P0 |
| 98 | Year-end rollover (archive year, promote students, create new classes) | P0 |
| 99 | KPI tracking against school strategic plan | P3 |

### 2.9 GCE / Exam-Body Registration (Expand This Well)

| # | Missing feature | Pri |
|---|---|---|
| 100 | Candidate registration data captured to match the exam body's requirements (names exactly as on birth certificate, DOB, subjects, centre) | P0 |
| 101 | Document verification workflow with reviewer, date, and rejection reason | P0 |
| 102 | Name/DOB discrepancy detection (a common cause of certificate errors) | P1 |
| 103 | Subject selection and confirmation by parent (signed off in the app) | P1 |
| 104 | Candidate list export in the exam body's required format | P0 |
| 105 | Practical/orals/mock exam tracking | P2 |
| 106 | Results import and analysis after national results release | P1 |
| 107 | Support for other exam classes (Form 5 Ordinary Level, Upper Sixth Advanced Level, FSLC/CEE for primary if CBC runs primary schools) | P1 |

### 2.10 Identity, Security & Access Control

| # | Missing feature | Pri |
|---|---|---|
| 108 | Full **role-based access control** with fine permissions (see matrix in §5) | P0 |
| 109 | **Audit log** for every sensitive action: who, what, when, from where, old → new value | P0 |
| 110 | Two-factor authentication for admins, bursar, and VPs | P0 |
| 111 | Session management, device list, remote logout | P1 |
| 112 | Account recovery flows for staff and parents | P0 |
| 113 | Row-level data isolation (a parent can only see their own children; teachers only their classes) tested with automated tests | P0 |
| 114 | Rate limiting, brute-force protection, bot protection on public endpoints | P0 |
| 115 | Encryption in transit and at rest; encrypted local storage on teacher devices | P0 |
| 116 | Secret/key management and rotation (payment keys, API keys) | P0 |
| 117 | Security testing before launch (penetration test or at least a structured review of authorization rules) | P0 |
| 118 | Separation of environments: development, staging, production | P0 |
| 119 | Impersonation ("view as") for support with mandatory logging | P2 |
| 120 | Data-entry break-glass procedure (emergency access) | P2 |

### 2.11 Data Protection, Legal & Policy

| # | Missing feature | Pri |
|---|---|---|
| 121 | Compliance with Cameroon's personal-data protection law, enacted in late 2024 **(verify current law number, scope, and regulator)** and applicable rules on children's data | P0 |
| 122 | Privacy policy, terms of use, and parental consent at signup; consent for student photos and ID QR | P0 |
| 123 | Data retention and deletion schedule (e.g., how long to keep withdrawn students' records) | P1 |
| 124 | Data-processing agreements with vendors (Appwrite, Firebase, Vercel, payment aggregator) | P1 |
| 125 | Data location awareness (data hosted abroad; disclose and document) | P1 |
| 126 | Breach response plan and notification procedure | P0 |
| 127 | Written policies the software enforces: grade change policy, fee-blocking policy, attendance policy, acceptable use | P0 |
| 128 | Formal **data ownership** clause: CBC owns all data and accounts; students/developers hold no exclusive control | P0 |
| 129 | Student council role limits: student developers should **not** have access to real student records or grades in production (conflict of interest, minors' data) | P0 |

### 2.12 Reliability, Operations & Support

| # | Missing feature | Pri |
|---|---|---|
| 130 | Automated, tested **backups** with restore drills; off-platform copy | P0 |
| 131 | Disaster recovery plan (RPO/RTO targets) | P1 |
| 132 | Monitoring and alerting (uptime, errors, payment callbacks, notification queue) | P0 |
| 133 | Error tracking (Sentry-style) and structured logs | P1 |
| 134 | Service-level expectations and an incident procedure | P1 |
| 135 | Helpdesk: who do teachers/parents contact, in what hours, by what channel | P0 |
| 136 | Release management: versioned releases, staged rollout, rollback, change log | P1 |
| 137 | Forced app-update mechanism (old app versions must not corrupt data) | P1 |
| 138 | Database migrations strategy and schema versioning | P1 |
| 139 | Load testing for peak moments (results release day, start-of-term fee payments, morning scan rush) | P1 |
| 140 | Documentation: admin manual, teacher guide, parent guide, runbook, architecture docs | P0 |
| 141 | Multi-year maintenance plan and named owners | P0 |

### 2.13 Platform, UX & Accessibility

| # | Missing feature | Pri |
|---|---|---|
| 142 | Support for **low-end Android** devices and small storage; small APK size | P0 |
| 143 | iOS availability (or explicit decision to skip it) | P1 |
| 144 | Data-light mode (compressed images, text-first) because parents pay for mobile data | P0 |
| 145 | Bilingual UI (English/French) and clear terminology | P1 |
| 146 | Accessibility (font scaling, contrast, screen reader labels) | P2 |
| 147 | Onboarding tutorials in-app and printed quick-start sheets | P1 |
| 148 | Web version for teachers/parents without smartphones (basic PWA) | P1 |
| 149 | Print stylesheets for report cards, receipts, class lists | P0 |
| 150 | Digital literacy training for staff and parents | P0 |

---

## 3. Deeper Analysis of the Highest-Risk Gaps

### 3.1 The Cameroon-specific report card

A production report card will typically need (confirm the template with each school): subject name, teacher, marks per sequence, term average per subject, coefficient, weighted total, subject rank, class average/min/max per subject, appreciation/grade comment, overall term average, class rank, class size, attendance (justified/unjustified absences, lateness), conduct/discipline (warnings, blames), honour roll or encouragements, class master and principal remarks, parent signature space, and bilingual headers. Also **annual summary** on the final term. If the system can't match the school's existing report template on day one, staff will reject it.

### 3.2 Notification reliability (the biggest assumption in the plan)

The plan routes everything through push only. Real-world problems:

- Parents without smartphones, without mobile data, or with app notifications disabled by battery savers (common on some Android brands) will miss alerts.
- Push delivery is "best effort", not guaranteed.
- Emergency closures or safety alerts cannot rely on best-effort delivery.

**Refinement:** tiered channels: (1) push, (2) in-app inbox with unread badge, (3) **SMS only for critical messages** (emergency, absence of a child, fee due, exam registration), (4) printed/paper for parents outside the system. Budget a small SMS line item rather than promising 0 FCFA forever. Also track adoption: % of families who have installed and enabled notifications, and follow up with those who haven't.

### 3.3 Guardianship and invitation codes

Single-use codes are a good idea, but define:

- Expiry (e.g., 14 days) and regeneration by admin.
- One code per guardian, not per child.
- Guardian verification (phone/OTP + admin confirmation).
- Guardian permissions (view marks, pay fees, receive attendance alerts, pick up child).
- Removal/replace flow (lost phone, family dispute, court order).
- Students should never see codes (print in sealed letter or send directly to parent contact, not via student).

### 3.4 Offline-first is much harder than it sounds

It is the correct choice, but it must be designed deliberately:

- Local database with schema versions and migration.
- Encrypted storage on device.
- Delta sync, retry with exponential back-off, idempotent writes (no duplicate marks on retry).
- Conflict rules and a visible "sync status" per mark sheet ("Saved on phone", "Synced", "Conflict").
- Server-side validation on sync (reject marks after locked date; handle offline edits made after the term closed).
- Data-minimisation: the teacher's phone should cache only their own classes.
- Remote wipe / logout when a phone is lost.
- Same principle for the **attendance scanner** (gate scans must work with no internet).

### 3.5 Payments

Mobile money integrations fail in messy ways. You need: unique payment references per student/installment, webhook signature verification, idempotency, a "pending" state, manual reconciliation screen, scheduled statement matching, handling of wrong-number payments, and a policy for gateway fees. Cash/bank payments must also be recorded in the same ledger or the balance the parent sees will be wrong. Consider legal/KYC requirements for the school's merchant account with the aggregator **(verify)**.

### 3.6 Grading integrity

Add: mark-entry audit trail (original value, changed value, actor, reason), lock states per assessment and per term, mark-sheet approval by HOD, discrepancy report (unusual jumps, all-identical scores), and prevention of retroactive changes after report cards are published, unless re-issued with a new version number.

### 3.7 Child safeguarding

You are storing photos, addresses, medical data, and real-time whereabouts of minors. Threat models to address: stalking through attendance timestamps, unauthorised pick-up, staff over-access to counselling notes, leaked class lists, photo misuse, and social-engineering to reset a parent's account. Include a safeguarding policy and give the school a person accountable for data protection.

### 3.8 Multi-school

If this is for "CBC schools" plural, the architecture must be **multi-tenant from day one** (School → Sections → Classes). Retrofitting later is expensive. Decide early whether schools share one deployment with isolated data, and what the Education Department can see across schools.

---

## 4. Reality Check on the "Zero-Cost" Model

| Claim in proposal | Concern | Recommendation |
|---|---|---|
| Development cost 0 FCFA | Students graduate, exams intervene, and knowledge leaves with them. A school system is a **multi-year commitment** | Create a written **maintenance and succession plan**; require documentation and code review; recruit juniors each year; consider a small maintenance stipend or an external technical mentor/sponsor |
| Appwrite Education Plan (150 GB, 2 TB, 200k MAU) | These figures and eligibility rules should be **verified**. Education/student plans are often tied to an individual's verified student status and can expire or change | Confirm terms in writing. Plan a paid tier or self-hosting fallback. **CBC, not an individual student, must own the account** |
| Vercel Free tier with "unmetered bandwidth" | Free hobby tiers usually have usage limits and terms restricting commercial use **(verify)**; a school collecting applications and fees may fall outside them | Read the terms; budget for a paid plan or use an alternative host (e.g., another static host or CBC's own server) |
| Push notifications 0 FCFA | Push itself is free but doesn't reach everyone (see §3.2). Parents also pay mobile data costs | Budget SMS for critical alerts; keep push as the default |
| Payment aggregator 0 upfront | Transaction percentages, payout delays, and KYC obligations exist | Decide who absorbs the fee; publish it |
| (Not mentioned) App-store fees | Publishing on Google Play requires a one-time developer registration fee, and Apple's developer program is an annual fee **(verify current amounts)** | Add to budget, or distribute Android via APK/PWA initially, iOS via web app |
| (Not mentioned) Domain name, email sending, SSL, monitoring, backup storage | Small but recurring costs | Create a small annual infrastructure budget (line items with owner) |
| (Not mentioned) ID cards, card printers, lamination, QR-capable phones/tablets, power banks, charging, mobile data for staff | Hardware and consumables are real costs | Cost a hardware plan; consider pilot with a shared set of scanning devices at the gate |
| (Not mentioned) Training, printing, support hours | The largest hidden cost is **human time** | Assign a paid or formally recognised system administrator role at each school |

**Suggested reframing for the pitch:** "Near-zero development cost with a transparent, small, predictable running budget" is more credible than "0 FCFA forever". Decision-makers tend to trust honest cost lines more than absolute claims.

---

## 5. Roles & Permission Matrix (Starting Point)

| Capability | Principal | Vice Principal | Registrar | Bursar | Class Master | Discipline Master | Teacher | HOD | Parent | Student | System Admin |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Approve admissions | ✔ | ✔ | ✔ | | | | | | | | |
| Edit locked marks | | ✔ (with reason) | | | | | | | | | |
| Request mark correction | | | | | ✔ | | ✔ | ✔ | | | |
| Approve mark sheets | | ✔ | | | | | | ✔ | | | |
| Release report cards | ✔ | ✔ | | | | | | | | | |
| Record payments | | | | ✔ | | | | | ✔ (own) | | |
| Approve waivers/discounts | ✔ | | | ✔ (propose) | | | | | | | |
| Log discipline | | ✔ | | | ✔ | ✔ | ✔ | | | | |
| View counselling notes | | limited | | | | | | | | | |
| View own child's data | | | | | | | | | ✔ | own | |
| Manage users/roles | | | | | | | | | | | ✔ (logged) |
| Access production data for support | | | | | | | | | | | ✔ (logged, minimal) |

Everything sensitive here is **logged**, and any role change requires a second approver.

---

## 6. Refined Architecture (Concise)

**Clients:** Parent app (Android first, PWA fallback), Teacher app (offline-first), Staff scanner (offline-first), Admin web dashboard, Public website.

**Backend concerns to define explicitly:**
- Multi-tenant data model (School → Section → Class → Enrolment).
- API layer with server-side authorization on every request (never rely on the client).
- Background jobs: notification queue, report-card generation, payment reconciliation, backups, sync processing.
- File storage with signed, expiring URLs for documents and report cards.
- Event/audit log written on every state change.
- Webhook endpoints for payments with signature verification and idempotency.
- Feature flags so unfinished modules can be hidden safely.

**Core entities:** School, AcademicYear, Term, Sequence, Class, Enrolment, Student, Guardian, GuardianLink, Staff, Role, Subject, ClassSubject, TeachingAssignment, Assessment, MarkEntry (raw, adjustment, status, version), GradeScheme, ReportCard (versioned snapshot), AttendanceEvent (gate) and PeriodAttendance, DisciplineIncident, FeeStructure, Invoice, Payment, Receipt, Waiver, Announcement, NotificationLog, DocumentFile, ExamPaper, AuditLog.

---

## 7. Phased Delivery (Realistic for a Student-Led Team)

Trying to deliver all five modules at once is the largest project risk. Suggested phasing:

**Phase 0: Foundations (before any code)**
- Sign-off by CBC: data ownership, roles, policies, pilot school, named school-side owner.
- Collect real artefacts: current report card template, mark sheets, fee schedule, ID cards, GCE registration forms.
- Legal/data protection review; hosting/terms verification.

**Phase 1: Core records + Grading (MVP)**
Student/class/subject/teacher setup, bulk import, Teacher App grade entry (offline), coefficient-based averages, ranking, report card PDFs matching the school's template, admin RBAC, audit log, backups.

**Phase 2: Parent access + Communication**
Guardian invitation and linking, parent app (marks, report cards, announcements), targeted announcements, SMS fallback for critical alerts.

**Phase 3: Attendance**
ID card production and QR signing, offline scanning, manual fallback, gate arrival alerts, absence excuses.

**Phase 4: Finance**
Fee structures, invoices, cash/bank recording, receipts, then MoMo/Orange Money with reconciliation.

**Phase 5: Admissions, GCE registration, past papers, exam workspace**
Online applications with status tracking, candidate registration workflow, exam-paper workspace and repository.

**Phase 6: Operations & analytics**
Timetable, discipline workflow, health, library, boarding, dashboards, multi-school roll-up.

**Pilot rule:** run each phase with **one class or one school section for one full term** in parallel with the paper process before switching over.

---

## 8. Testing, Rollout & Change Management

- **Test plan:** unit tests for grade calculations (with worked examples verified by teachers), authorization tests for every role, offline/sync scenario tests (airplane mode, clock changes, two devices), payment failure simulations, load tests.
- **User acceptance:** teachers and bursar sign off on calculations against last term's manual results (parallel run: compare system vs. manual for a whole class).
- **Data migration:** dry-run imports, error reports, correction cycle before go-live.
- **Training:** hands-on sessions per role, quick reference cards, "champion" teacher per department.
- **Adoption plan for parents:** onboarding drive at PTA meetings and registration days; help desk table at school gate; printed instructions.
- **Rollback plan:** paper process remains available until a term of successful parallel operation.
- **Feedback loop:** in-app feedback, monthly review with the Principal.

---

## 9. Key Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Student team turnover | System becomes unsupported | Succession plan, documentation, mentoring, external sponsor/partner |
| Free-tier limits or terms change | Outage or forced cost | Written confirmation, portable architecture, exports, fallback budget |
| Wrong grade calculation | Loss of trust, legal/academic disputes | Parallel run, teacher-verified test cases, locked formula versions |
| Data breach of minors' data | Legal, reputational harm | Least privilege, 2FA, audit logs, encryption, incident plan |
| Low parent adoption | Value not realised | Multi-channel notifications, training, onboarding drives |
| Payment errors | Financial disputes | Reconciliation, receipts, dual control |
| Scope creep | Never finishes | Phase gating, MVP, change-control |
| Conflict of interest (students handling peers' grades/fees) | Integrity and fairness concern | Strict separation: developers work on test data; production admin held by staff |
| Staff resistance | Low adoption | Involve teachers in design, reduce their workload first, respect their workflows |

---

## 10. Questions to Put to CBC Before Building

1. How many schools, and which sections (nursery, primary, secondary, high school)? Is this one deployment for all?
2. Who is the **named owner** at CBC (person/role) accountable for the system after handover?
3. What are the exact report card templates, grading scales, coefficients, and promotion rules per level?
4. Which exams (GCE O/A-Level, FSLC, CEE, others) and what registration data does each require?
5. How do parents currently pay fees (bank, cash, MoMo)? Who is the bursar and what are the accounting requirements?
6. What is the fee-default policy (are report cards or exams withheld)?
7. What percentage of parents own smartphones and have data? (Survey it.)
8. What devices will teachers and gate staff use? Are school-owned devices available?
9. Is there existing student data in Excel/paper that must be migrated?
10. Which language(s) are required for parents and staff?
11. What are CBC's rules on photographing and identifying students, and on sharing data with third-party services abroad?
12. Who approves grade changes after lock, and what is the escalation if that person is absent?
13. What is the acceptable downtime during exam periods and results release?
14. Who pays for SMS, ID cards, devices, domain, and app-store accounts?

---

## 11. Production Go-Live Checklist

- [ ] CBC-owned accounts for all cloud services (no personal accounts)
- [ ] Signed data ownership and data protection policy
- [ ] Roles and permissions tested with automated authorization tests
- [ ] 2FA enabled for all admin-level accounts
- [ ] Audit log verified on grades, fees, and user management
- [ ] Backups running; **restore test completed**
- [ ] Monitoring and alerts configured, with a named on-call person
- [ ] Payment webhook signature, idempotency, and reconciliation verified with real small transactions
- [ ] Report cards reviewed by teachers and match the official template
- [ ] Parallel run completed against manual results
- [ ] Offline and sync scenarios tested on the actual teacher devices
- [ ] ID cards printed, QR verified, revocation tested
- [ ] SMS fallback tested for emergency alerts
- [ ] Privacy policy, consent flows, and parental agreements published
- [ ] Training delivered; helpdesk and escalation path published
- [ ] Rollback plan documented
- [ ] Annual maintenance/renewal calendar (domain, certificates, store accounts, hosting terms)

---

## 12. Suggested Rewrite of the Pitch Positioning

Keep your strongest ideas (invitation codes, raw/bonus separation, offline-first, one-student card entry, real-time transparency) but reposition the proposal as:

> A **phased, CBC-owned digital school platform**, starting with a pilot in one school, built with near-zero development cost by the Student Council under staff oversight, with a small, transparent annual running budget, and a written plan for security, data protection, and long-term maintenance.

This answers the questions administrators will ask first: *Who owns it? Who supports it? What happens if it fails? Is our children's data safe?*
