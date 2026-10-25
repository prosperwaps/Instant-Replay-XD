# CBC School Ecosystem

A full school management platform for Cameroon Baptist Convention (CBC) schools, piloting at **BCHS Nkwen**.
Goal: everything a system like Ekattor does (admissions, students, staff, academics, attendance, exams, fees, library, transport, boarding, notices), plus what it doesn't: offline-first teacher and gate apps, Cameroon-specific grading (coefficients, sequences, ranks), parent mobile app with MoMo / Orange Money, and multi-school support for the CBC Education Department.

The full specification lives in [`docs/spec/`](docs/spec/). Start with `03-module-plans.md` for the build order.

## Repository layout

```
.
├── README.md                  ← you are here
├── docs/
│   ├── spec/                  ← product specification (the source of truth)
│   │   ├── 01-master-specification.md       original Student Council proposal
│   │   ├── 02-refined-spec-and-gap-analysis.md   fixes, gaps, risks, phases
│   │   └── 03-module-plans.md               module-by-module build plan
│   └── decisions/             ← short records of important technical decisions
│
├── apps/                      ← everything a user opens (one folder per app)
│   ├── web/                   ← Module 1 + Module 2 web UI (one deployable site)
│   │   ├── index.html             public homepage            → /
│   │   ├── admissions.html        online application        → /admissions.html
│   │   ├── portal.html            student portal            → /portal.html
│   │   ├── office/index.html      School Admin: office (Module 2) + platform console (Module 0) → /office/
│   │   ├── platform/index.html    redirect to /office/ (the console now lives inside School Admin)
│   │   ├── teacher/index.html     teacher app (Module 3)     → /teacher/
│   │   ├── gate/index.html        gate attendance app (Module 4) → /gate/
│   │   ├── pinegrow.json          Pinegrow project file
│   │   └── assets/
│   │       ├── css/   styles.css (shared, ONE copy) · home.css · admissions.css · portal.css · office.css · office-homepage.css · platform.css · teacher.css
│   │       ├── js/    site.js · admissions.js · portal.js · admin-shell.js (shared icons + sidebar) · office.js (hosts School Admin) · office-homepage.js · office-marks.js · platform.js (platform pages) · school-data.js · teacher.js
│   │       ├── fonts/ font files used by styles.css
│   │       └── img/   photos, logos, illustrations
│   ├── teacher/               ← Module 3 Teacher App (planned)
│   ├── parent/                ← Module 5 Parent App (planned)
│   └── scanner/               ← Module 4 Attendance scanner (planned)
│
├── backend/
│   └── appwrite/              ← Module 0 Platform Core: collections, functions, permissions (planned)
├── packages/                  ← code shared between apps, e.g. the grading engine (planned)
│
├── design/                    ← design-tool leftovers (Pinegrow backups, exports); not deployed
└── archive/                   ← frozen snapshots; never edited
```

## Rules that keep this tidy

1. **One copy of every file.** Shared styling lives only in `apps/web/assets/css/styles.css`. Pages reach it by relative path:
   - pages in `apps/web/` → `assets/css/styles.css`
   - pages one folder down (e.g. `apps/web/office/`) → `../assets/css/styles.css`

   Never copy `styles.css` next to a page again. If a page can't find the styles, fix the path.
2. **Page-specific styles/scripts get their own file** named after the page (`portal.css`, `office.js`), never edits to someone else's file.
3. **File and folder names:** lowercase, words separated by `-`, no spaces, no `Copy`, no `--`.
4. **No manual backup copies.** Don't make `index - Copy.html`. Use version control (see below) or drop a dated zip in `archive/`.
5. **Images go in `assets/img/`**, never base64 inside CSS/HTML, and never next to pages.
6. **Specs change before code does.** If a feature changes, update `docs/spec/` (or add a note in `docs/decisions/`) in the same change.

## Design system (applies to every module)

**Everywhere:** no 3D, no gradients, no decorative or "sketchy" animation. Square corners.

| | Public site (homepage, admissions, other front pages) | School Admin (office + platform console) and future desk-based staff modules |
|---|---|---|
| Font | JetBrains Mono | Poppins, with no tiny text (dashboards set the root size to 18px) |
| Colour | Pure `#000`, `#fff`, `#3dba3d` only: no greys, tints or faded (opacity) text | Same palette on quiet neutrals; colour is used for status (tinted badges) |
| Layout | Editorial sections, `sec-head` titles | Dark sidebar with grouped icon navigation (`admin-shell.js`), top bar, dense tables, 1px rules |
| Decoration | Geometric design elements: inline SVG, solid shapes or thick lines, **only** pure `#3dba3d`, `#000`, `#fff`, all three colours in every piece, a unique composition per section | None |

**Student portal** (`portal.html`) and **Teacher App** (`teacher/`) share their own identity, built for phones: pure `#000` / `#fff` / `#3dba3d` only (no greys anywhere), Space Grotesk with JetBrains Mono for numbers and labels, a black top bar with tabs, a green page band with a geometric piece, 2px rules, and a split sign-in screen with a large piece. Status is shown without extra colours: green = done, heavy black frame = needs action, solid black = problem. The Teacher App is the dark member of this family: black is the main colour, green the accent, white the text and 1px hairline rules (still no greys). Its Home has widgets (figures plus cards that open each section) above and beside the To do list. It uses no stock icons: rows lead with label tiles (due date, subject code, section letter) and the phone tab bar uses custom solid geometric marks. Students never see fees or discipline records.

## Running the website locally

Open the folder in VS Code and use the **Live Server** extension on `apps/web/index.html`, or from a terminal:

```
npx serve apps/web
```

Then visit `http://localhost:3000` (homepage), `/admissions.html`, `/portal.html`, `/office/` (School Admin), `/teacher/`.

School Admin is currently a front-end demonstration: data lives in the browser's `localStorage` only. Sign in with a platform account (e.g. `e.ngwa@bchs.edu.cm`, any password; privileged roles then enter any 6-digit code).

### Testing the Teacher App on a phone

Installing and offline mode only work over HTTPS (or `localhost`), so opening the files from your PC over Wi-Fi is not enough. Free option, no Node needed:

1. Create a free Cloudflare account **owned by the school/CBC**, not a student.
2. Workers & Pages → Create → Pages → **Upload assets** → upload the `apps/web` folder.
3. Open `https://<project>.pages.dev/teacher/` on the phone.
   - Android (Chrome): tap **Install**.
   - iPhone (Safari): Share → **Add to Home Screen**.

When you change any Teacher App file, bump `VERSION` in `apps/web/teacher/sw.js` so phones fetch the update.

## Status

| Module | Spec | State |
|---|---|---|
| 0 Platform core | 03 §Module 0 | clickable prototype inside School Admin (`apps/web/office`, pages drawn by `platform.js`); backend not started |
| 1 Website, admissions, portal | 03 §Module 1 | static UI in `apps/web` |
| 2 Admin dashboard | 03 §Module 2 | static UI + localStorage demo in `apps/web/office`; **Mark sheets** and **Corrections** pages read what the Teacher App synced (`office-marks.js`) |
| 3 Teacher app | 03 §Module 3 | installable phone app (PWA) in `apps/web/teacher`, MVP + P1 complete as a prototype: PIN, grade entry, review & submit, offline outbox and sync centre, server-time edit window, correction requests, multi-paper combining, class-master remarks/conduct/attendance, exam workspace (draft → HOD review → sealed → published to the Student Portal); shared data in `assets/js/school-data.js` |
| 4 Attendance | 03 §Module 4 | Gate app (installable, offline) in `apps/web/gate`: stage 1 done (staff on duty + PIN, student list on the phone, manual check-in with reason, today's arrivals, sync with earliest-wins and clock correction, geometric avatars). Next: camera QR scanning, then ID cards and reports in School Admin |
| 5 Parent app | 03 §Module 5 | not started |
| 6 Finance | 03 §Module 6 | UI screens inside office demo |
| 7 Operations & analytics | 03 §Module 7 | UI screens inside office demo |
