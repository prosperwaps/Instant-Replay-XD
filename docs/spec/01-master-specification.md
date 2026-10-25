# PROPOSAL FOR THE IMPLEMENTATION OF A DIGITAL SCHOOL MANAGEMENT ECOSYSTEM

**Presented to:** The Cameroon Baptist Convention (CBC) Education Department

**To the Attention of:** The Department President, School Principals, Vice Principals, and Selected Staff Members

**Presented by:** The Student Council

## Executive Summary

The modern educational landscape demands administrative precision, academic transparency, and bulletproof data security. For CBC schools to maintain their competitive edge and continue producing top-tier academic results, transitioning from paper-based tracking to an interconnected digital ecosystem is imperative.

This proposal outlines a tailor-made, modular platform designed specifically to overcome local infrastructure challenges (such as intermittent internet connectivity) while completely streamlining operations for administrators, teachers, parents, and students. By unifying five core components into a single system, we eliminate data redundancy, reduce teacher burnout, and give parents real-time visibility into their children's education.

## Module 1: The School Website & Student Portal (Public Front & Intake)

This module serves as the public gateway to the institution and the primary digital hub for student academic resources.

### 1. Unified Registration Portal

* **The Workflow:** Prospective parents visit the official school website to access the integrated admission form. They enter essential demographic details, upload digitized primary documents (e.g., birth certificates, report cards from previous schools), and submit the application.

* **Data Routing:** The moment a form is submitted, the data bypasses public view and enters a secure "Pending Review" queue on the Admin Dashboard. No student is added to the active school roll until manual administrative validation occurs.

### 2. Simultaneous Announcement Engine

* **The Workflow:** When the administration or a vice principal publishes an official announcement (e.g., holiday notices, PTA meeting schedules, emergency closures), the system handles the distribution automatically.

* **The Impact:** With a single click, the notification is cross-published **simultaneously** onto the public school website's notice board and pushed as a priority alert directly to the Parent and Teacher mobile apps. This eliminates communication gaps caused by broken or delayed information chains.

### 3. Past Paper & Revision Repository

* **The Workflow:** Embedded within the secure student login area is a structured academic library.

* **The Impact:** Students can access a comprehensive repository of past internal examinations, regional mock exams, and national board papers. Because these documents are pre-categorized by teachers during the submission phase, students can easily filter resources to study independently for high-stakes final exams.

## Module 2: The Admin Dashboard (Central Command & Grading Engine)

The web-based nerve center, accessible exclusively to school leadership (Principal, Vice Principals, and Registrars), where institutional rules are enforced.

```
[Public Website Registration] 
             │
             ▼
[Admin Review & Approval] ──► Generates Single-Use Invitation Code
             │
             ▼
[Assigned a Global Family ID] ──► Links multiple siblings together

```

### 1. Admissions & Sibling Relational Mapping

* **Review Process:** Administrators review the incoming intake data from the website. Upon deciding to admit the child, the system dynamically generates a single-use **Invitation Code** (replacing risky, permanent static keys).

* **The Family ID System:** To accommodate families with multiple children in the school, the admin backend utilizes a relational database structure. When a second or third sibling is admitted, the administrator links them under a single, overarching `Family_ID`. This prevents the creation of duplicate parent profiles and ensures seamless account management.

### 2. The Global Grading & Normalization Engine

* **Dynamic Passing Thresholds:** Instead of hardcoding a basic 50% failure mark into the software, administrators can customize passing thresholds from the dashboard. For example, a complex science subject can have its failing flag set differently than a language arts subject based on department policies.

* **Automatic Score Conversion:** Teachers frequently score tests out of non-standard point totals (e.g., a quiz out of 35 marks). The admin engine automatically normalizes these raw inputs to a standard base (e.g., out of 20 marks) on the backend.

* **Syllabus Weighting:** The dashboard applies pre-set administrative percentages to calculate final term grades (e.g., Sequence 1 = 20%, Sequence 2 = 20%, Term Exam = 60%). It automatically flags any student falling below the custom passing threshold as "Failed" for early intervention.

### 3. Report Card Generation & Resource Booking

* **Automated Compilation:** At the end of the term, the system pulls locked data from the digital class lists, compiles cumulative grades, attaches class remarks, and generates clean, unalterable PDF report cards instantly.

* **Lab Resource Allocator:** Includes a scheduling matrix where science teachers can digitally book shared physical spaces (like Chemistry or Physics laboratories) to prevent scheduling conflicts and double-bookings.

## Module 3: The Teacher App (Digital Class Lists & Exam Workspace)

A streamlined mobile and tablet interface designed to eliminate manual spreadsheet management and reduce the administrative burden on teaching staff.

### 1. The Grade Entry User Interface (UI)

The interface is structured strictly for rapid, error-proof data entry. To eliminate the risk of a teacher accidentally entering a mark on the wrong row, the app displays exactly **one student at a time** using a vertical card layout:

| UI Element | Functionality | 
 | ----- | ----- | 
| **Visual Header** | Displays the student's **Image**, unique **Class Number**, and full **Name**. | 
| **Raw Mark Input** | A dedicated entry field where the teacher inputs the raw score. | 
| **Addition/Penalty Input** | A secondary, separate input field for adding bonus points (e.g., extra credit) or subtracting marks (e.g., late submissions). This preserves the integrity of the raw test score for parent audits. | 
| **System Controls** | A prominent **Next Button** to advance to the next student alphabetically, positioned directly above a custom, oversized **Numeric Keypad** at the bottom of the screen for fast thumb typing. | 

```
┌────────────────────────────────────────────────────────┐
│ [Student Photo]  Class No: 14   Name: Prosper Wapali   │
├────────────────────────────────────────────────────────┤
│  Raw Mark Input: [ 24 ] / 30                           │
│  Addition/Penalty Box (e.g., Extra Credit): [ +2 ]     │
├────────────────────────────────────────────────────────┤
│                      [ NEXT ]                          │
├────────────────────────────────────────────────────────┤
│                    NUMERIC KEYPAD                      │
│         [1]             [2]             [3]            │
│         [4]             [5]             [6]            │
│         [7]             [8]             [9]            │
│                         [0]                            │
└────────────────────────────────────────────────────────┘

```

### 2. Multi-Paper Collaboration & "Merge Requests"

* **The Workflow:** For advanced subjects taught by multiple instructors (e.g., Further Mathematics split into Paper 1 and Paper 2 handled by separate teachers), the app introduces automated collaboration.

* **The Action:** Teacher A finishes entering marks for Paper 1 and hits "Request Merge" within the app. This sends a secure data payload notification to Teacher B. Once Teacher B accepts, the software automatically merges the two distinct mark lists on the backend, combining them into a unified subject grade based on the school's exact percentage split.

### 3. Offline-First Database Strategy & Protection Logic

* **Local Caching (Offline Mode):** Recognizing that school campuses experience internet drops, the Teacher App does not rely on a constant live connection. When internet is unavailable, all inputs are saved locally to the device's internal database cache (secure local storage). The moment a stable connection is re-established, a background sync worker silently uploads the data to the central Admin server.

* **24-Hour Edit Window:** To prevent unauthorized long-term grade tampering while leaving room for human error correction, teachers have an unalterable 24-hour grace period to edit a submitted score. Once this window closes, the marks are locked and can only be modified by a Vice Principal via the Admin Dashboard.

### 4. Exam Setting Workspace

* Teachers can collaborate on drafting upcoming examinations within a secure workspace that utilizes state tracking: `Draft ➔ Under Review ➔ Published`. Once an exam is marked as *Published*, the teacher is required to tag it by **Term, Type (Sequence vs. Terminal), and Year** before it is automatically archived into the Student Portal's past paper system.

## Module 4: The Secure Attendance System (Staff-Operated Phone App)

A specialized operational module configured exclusively for school staff devices to handle rapid daily tracking with absolute authority and verification.

### 1. Strict Staff Authorization & Device Control

* **No Student Operation:** Students never log their own attendance, and they do not interface with or touch the hardware. The attendance software is entirely restricted, requiring secure teacher or administrator authentication to open, and runs directly on the staff members' personal or school-issued phones.

### 2. Primary Scan vs. Manual Fallback Workflow

* **Primary QR Scan Method:** Every student is issued a physical institutional ID card featuring a unique, high-density QR code printed directly on the back. To take attendance, the staff member launches the app's rapid-camera scanner and scans the back of the card. The system instantly processes the token, pulls the corresponding student name, displays their photograph on the staff phone for immediate visual verification, and registers the log.

* **Secondary Manual Fallback Method:** In the event that a student forgets their ID card or it goes missing, the system provides a secure override. The staff member switches to manual mode within their phone app, selects the student's designated **Class**, and inputs their **Class Number**. The interface instantly serves the student's registered file and photograph, allowing the staff member to manually check them present after visual validation.

### 3. Automated Time-Stamping & Instant Parent Routing

* **Precise Logging:** The moment a student is verified present via either the QR scan or manual override, the database locks in the **exact network timestamp** (down to the precise hour and minute) at which the check occurred.

* **Real-Time Alerts:** The system immediately packages this timestamped entry and dispatches an automatic priority notification directly to the Parent App, ensuring families are explicitly aware of the exact time their child walked into the classroom space.

## Module 5: The Parent App (Real-Time Monitoring & Finance)

A secure mobile companion application designed to keep families actively engaged and informed regarding their children's daily institutional life.

### 1. Bulletproof Account Binding & Sibling Profiles

* **The Onboarding Flow:** To eliminate the severe security vulnerabilities of static portal keys (which can be intercepted by students), parents download the app and sign up using their own verified Email and Password. They then input the single-use **Invitation Code** provided by the administration during admission. This action permanently binds the parent's account to the student's metrics.

* **The Multi-Child Toggle:** Thanks to the `Family_ID` established at the admin level, parents with multiple children in the school do not need separate accounts. The app interface features a clean drop-down profile selector, allowing them to instantly toggle between their children's distinct data dashboards.

### 2. Granular Information Dashboards

The parent application breaks down student tracking into seven clear, unambiguous tabs:

* **Mark Checking:** Displays current grades for all ongoing sequences. It features the **Target Tracking & Trajectory Analytics** engine, allowing parents to see their child's scores plotted on a line graph against a set goal (such as maintaining an 18/20 average) to visually catch academic decline before final exams.

* **Attendance Checking:** A calendar interface displaying real-time entry logs. It actively lists the exact time stamps pushed directly from the staff attendance phone software, highlighting unexcused absences, tardiness, or precise arrival times.

* **Report Card Checking:** Provides secure view-and-download access to official end-of-term report cards once officially released by the Principal.

* **Announcements:** Access to all general school notices published via the Admin simultaneous broadcast engine.

* **Class Remarks:** Direct access to behavioral feedback, disciplinary tracking, and detention details logged by class masters or discipline masters.

* **Fee Status Tracker:** A financial ledger integrated directly with local mobile payment providers (**MTN Mobile Money** and **Orange Money**). Parents can view overall tuition costs, track installment payment history, see pending balances, and make secure mobile payments directly inside the app, automatically updating the school's accounting records.

* **Registration Status (GCE Candidates):** A high-value milestone checklist for parents of exam-class students to track national exam readiness:

  1. *Birth Certificate Verified (Yes/No)*

  2. *National ID Card Validated (Yes/No)*

  3. *GCE Registration Fees Disbursed (Yes/No)*

  4. *Final Candidate Number (Displayed immediately upon official assignment)*

## Zero-Cost Infrastructure & Implementation Strategy

To ensure this project is entirely feasible and highly attractive to the CBC Education Department, the Student Council has engineered a deployment model that bypasses traditional software labor and recurring cloud infrastructure costs.

### 1. Development Cost: 0 FCFA (Internal Student Engineering)

* **The Plan:** The software engineering, UI design, database structural mapping, and ecosystem testing will be fully executed by the technical branch of the **Student Council**.

* **The Benefit:** By treating the creation of this system as an internal innovation and capstone project, the school pays **0 FCFA** in developer labor or design fees.

### 2. Hosting & Database Cost: 0 FCFA (Leveraging Student Cloud Infrastructure)

We have designed the backend to run on industry-grade cloud structures without requiring monthly subscription outlays from the administration:

* **Database & Core Backend Hosting:** The system will utilize the specialized **Appwrite Education Plan**. This tier provides student-led projects with verified production resources at zero cost, including up to 150 GB of secure data storage, 2 TB of monthly bandwidth, and full capabilities to host up to 200,000 monthly active users—vastly exceeding the demands of our entire student body and parental network.

* **Web & Portal Frontend Hosting:** The public school website and registration portal frontend will be deployed on **Vercel's Free Developer Tier**, ensuring high-speed access, automatic SSL encryption, and unmetered bandwidth for the school's intake forms.

### 3. Notification Expenses: 0 FCFA (In-App Push Only)

* **The Plan:** To completely circumvent the heavy overhead charges of local telecom SMS aggregators (which cost 5–10 FCFA per text message), all automated system updates, timetables, detentions, and real-time attendance timestamps will be routed exclusively through **In-App Mobile Push Notifications** (via native Firebase Cloud Messaging).

* **The Benefit:** These digital alerts are instant, unmetered, and cost **0 FCFA** globally, regardless of how many thousands of logs are sent to parent phones over the school term.

### 4. Financial Integration Setup: 0 FCFA Upfront

* The connection to MTN Mobile Money and Orange Money for the fee tracker will be handled using a local gateway aggregator (such as Campay or Monetbil). These platforms provide their API infrastructure with zero upfront development fees, operating solely on a tiny transaction percentage that can be passed cleanly into standard payment processing options.

## Concrete Strategic Advantages for CBC Education

1. **Complete Data Integrity & Security:** By shifting from static portal keys to single-use invitation codes bound to unique parent emails, the school eliminates unauthorized access to student records.

2. **Elimination of Administrative Redundancy:** Teachers enter marks once into a highly optimized, single-student UI with separate boxes for bonuses and penalties. The backend handles conversions, weighting, failure-flagging, and report-card compilation automatically, saving hundreds of hours of manual calculation.

3. **Infrastructure-Proof Engineering:** The Teacher App’s offline-first caching mechanism guarantees that grading and record-keepin.g continue uninterrupted during internet outages, syncing automatically when connectivity returns.

4. **Enhanced Financial Liquidity:** Integrating direct MTN MoMo and Orange Money mobile payments into the fee tracker reduces the logistical friction of banking halls, allowing parents to pay installments on time from anywhere in the country.

5. **Unparalleled Institutional Transparency:** Real-time, staff-verified timestamped push notifications for attendance, immediate clarity on GCE registration milestones, and graphical trajectory tracking create a modern, collaborative environment between CBC school administrations and families