# EduSync — Product Requirements Document

**By Privam Solutions · Multi-institute school management SaaS**
Last updated: 2026-08-10

## Original Problem Statement
Multi-institute management SaaS with two connected portals sharing one database. Each institute gets its own workspace. Three roles: Principal (full access), Teacher (own classes/students), Student (own data). Modules: principal dashboard w/ KPIs+charts, student management + photo/PDF docs + printable QR ID cards, batches/classes, auto timetable scheduler, QR attendance + teacher self-attendance + leave approval, fee management (Razorpay UPI + receipts + reminders + monthly plans), exams/results with grades & rankings, homework + submissions, staff salary + slips, one-click PDF report cards, announcement board, three-way complaint management, admission enquiry tracker, student portal.

## User Choices
- Auth: Principal & Teacher use email+password; Students use Student ID+password (JWT Bearer, localStorage).
- Fee reminders: in-app + Twilio SMS (SMS activates when Twilio keys added; in-app always on).
- Razorpay: TEST mode (keys configured).
- Scope: all modules broad-but-functional.
- AI: enabled (Gemini) for report summaries & timetable suggestions.

## Architecture
- Frontend: React (CRA/craco), Tailwind + shadcn/ui, recharts, qrcode.react, html5-qrcode, Outfit/IBM Plex Sans, blue/white theme.
- Backend: FastAPI + Motor (MongoDB). All routes under /api. JWT Bearer auth.
- Multi-tenant: every document scoped by `institute_id`.
- Integrations: Razorpay (test), Emergent object storage (photos/PDFs), Emergent LLM key (Gemini AI), Twilio SMS (optional), reportlab (report card & salary slip PDFs).

## User Personas
- **Principal**: runs the institute end-to-end; needs live dashboards and full control.
- **Teacher**: manages assigned batches/students, attendance, marks, homework, own salary/leave.
- **Student**: views own timetable, attendance, fees/receipts, results, homework (+submit), ID card, announcements, raises complaints.

## Implemented (2026-08-10) — MVP complete, tested
- Auth: register institute, login (email or student ID), /auth/me, brute-force lockout, role-based access enforced server-side (students 403 on staff endpoints; teachers scoped to their batches for students/attendance/exams/timetable).
- Principal dashboard: 5 KPI cards + fee bar chart + 7-day attendance line chart + recent admissions/complaints.
- Students: CRUD, photo upload, multi-PDF documents, auto Student ID, printable QR ID card (3 templates), report-card PDF, AI performance summary.
- Batches, Teachers/Staff CRUD.
- Attendance: QR scan (camera) + manual code, teacher self-attendance, records by date.
- Timetable: auto-generate (leave-aware) + AI suggestions + weekly grid.
- Fees: create, list, pending dues, mark paid, reminders (in-app + optional SMS), Razorpay UPI order+verify+receipt.
- Exams/Results: create exam, enter marks, auto grades + batch rankings.
- Homework: assign, student submit, teacher mark completed.
- Salary: create, mark paid (PUT), salary-slip PDF.
- Leaves: teacher apply, principal approve/reject, balance decrement.
- Announcements, Complaints (three-way + status), Enquiries (log→follow-up→convert).
- Seed demo data for the owner principal (30 students, 4 teachers/batches, fees, attendance, exams, etc.).

## Implemented (2026-08-11) — Design upgrade + advanced modules
- Dark-navy glass sidebar & header with per-module accent colors; animated KPI counters; gradient interactive charts; framer-motion page transitions; branded loader; button/card hover polish.
- Forgot Password: email OTP flow (/auth/forgot-password + /auth/reset-password) via managed Resend; 15-min expiry, single-use.
- Fee structure customisation: fee-components CRUD, itemized fee creation, partial payments with running balance, branded PDF receipts with itemized breakdown.
- Salary structure customisation: base/HRA/allowances/deductions per teacher; auto salary generation with LWP = gross ÷ days-in-month × unapproved(rejected) leave days; itemized salary-slip PDF; duplicate teacher+month guard (409).
- Admission lead pipeline: 5-stage Kanban (New Lead → Contacted → Demo Scheduled → Admitted → Closed) with assign-to-teacher.
- Leave apply/approve/reject sends emails (teacher + principal) via Resend; approval now idempotent/state-safe.
- Twilio SMS live for overdue fee reminders (per-fee reminder, bulk "Remind Overdue", and daily cron .emergent/crons.yml at 09:30 IST → /api/cron/fee-reminders, Bearer-secured).
- Data-integrity hardening: fee student existence check (404), salary uniqueness (409), leave idempotency (400), negative salary rejection (422), OTP no longer logged.

## Implemented (2026-06) — Message-161 features + premium theme
- Classes/Sections on batches (Nursery–12th, A/B/C) with UI selectors + card badges.
- Complaints upgraded: routing direction (Principal/Class Teacher/Parent), PDF attachment upload+view, status tags (Open/In-Progress/Resolved).
- Teacher dashboard shows Assigned Admission Leads.
- Master ID Card template (institute.id_template) auto-applied to all student ID cards; picker in Branding.
- Login redesign: deep-dark animated theme (floating particles, gradient orbs, frosted glass card w/ glow border), logo + tagline.
- Premium tri-color theme (deep navy / emerald / purple) applied app-wide: sidebar, header, avatar, KPI cards, charts, all primary buttons (.btn-gradient), module accents. Login shows subtle EduSync logo watermark; demo credentials removed from login.
- Fixed backend crash (corrupt stray lines in server.py from prior fork).

## Implemented (2026-06) — Message-161 features + premium theme
- **Login page (v3 split layout)**: full-screen split — left branding panel with AI-generated purple/lavender school-scene background, bokeh, floating leaves, and floating live-stat glass cards (Attendance 96%, Today's Timetable, Total Students, QR Attendance, Performance chart) + bottom stats bar (Schools/Students/Teachers/Courses); right white/dark glass login card with logo, email/username + password show-hide, remember me, forgot password, purple→orange gradient Sign In (arrow), "Login with Institute Code" toggle, and a top-right dark-mode toggle. Visual only — auth unchanged (verified login reaches dashboard).
- **Timetable**: fixed generation + AI-powered conflict-free generator (POST /timetable/generate with TimetableConfig {days, periods, teacher_ids, use_ai}; no teacher/room double-booking) and PDF download (GET /timetable/pdf, landscape grid per batch). Config dialog on Timetable.jsx. Verified via curl: 60 slots, 0 conflicts, PDF 200.
- **Announcements**: principals AND teachers can post with optional PDF attachment; students view/download PDF; teachers delete only own. Verified via curl.
- PDF watermark (report cards/receipts/salary), premium tri-color theme (navy/emerald/purple), master ID template + live preview, Class/Sections, complaint routing+PDF+status, teacher assigned leads.

## Implemented (2026-06) — Message-161 features + premium theme
- **Financial**: itemized fee receipts with partial/balance, payment date, branded letterhead + embedded UPI payment QR (institute upi_id); Indian legal salary slips (Basic ~45% CTC, HRA 40/50% metro, Special balancing, EPF 12%, Professional Tax, TDS, auto net) as branded PDF; Razorpay UPI/card test-mode confirmed (order+HMAC verify).
- **Complaints**: role-based routing (teacher→Principal/Parent/Both, student→Teacher/Principal/Both) with per-student directed-teacher scoping (no cross-teacher leak), PDF+image attachments, status tags Pending/Under Review/Resolved (validated), full audit trail (who/when/note).
- **Timetable**: fixed 0-slot bug (was a backend syntax crash); AI conflict-free generator (days/periods/teachers config), PDF download, grid derives configured days/slots and stacks multiple batches per cell.
- **Students/Batches**: class-section assignment at admission; principal views batch roster, moves students between batches, sees batch strength; teachers auto-see their batch students.
- **Dashboard AI Insights** (live, 30s refresh): low attendance <75% (red), pending leave approvals (orange), timetable conflicts (yellow), attendance improvement % (green).
- **Legal**: Privacy Policy + Terms pages (DPDP Act, parental consent, RBAC, retention) linked from login footer.
- Login split-layout redesign, premium tri-color theme, PDF watermark, master ID template + live preview.
- NOTE: Auth intentionally uses JWT Bearer + localStorage (not HttpOnly cookie) and CORS allow_credentials=False by design — testing-agent flagged these as playbook deviations, retained per product design.

## Backlog / Remaining (P2)
- Add DialogDescription/aria-describedby to dialogs (LOW — console accessibility warning only).
- Add error/catch states to page load effects (avoid indefinite loaders on API failure).
- Check response.ok before opening blob downloads.
- Scheduled/automatic overdue-fee reminders (currently manual trigger).
- Split server.py into modules; use async clients for storage/Twilio/Razorpay.

## Next Tasks
- Activate real SMS by adding Twilio credentials.
- Optional: monthly recurring reminder cron.

## Implemented (2026-06, forked session) — ID standardization, MCQ engine, notifications, student portal, login redesign
- **ID generation standardized**: Student IDs `<CODE><YEAR>NNNN` (e.g. DP20260001), Faculty IDs `<CODE><YEAR>TNNN` (e.g. DP2026T001). Institute code auto-derived from name AND editable in Settings (brand-code); atomic per-institute counters (student_seq/faculty_seq). Startup `migrate_ids()` renumbers legacy records idempotently. Institute code shown on Principal dashboard (institute-code-badge).
- **Faculty ID cards**: IDCard.jsx supports variant="faculty"; per-teacher View-ID dialog on Teachers page + dedicated bulk `/app/faculty-ids` page.
- **MCQ Online Test engine** (new): teacher builder with per-test marks_per_correct & negative_marks, manual questions + AI generate-from-topic (Gemini via Emergent key); student TIMED attempt (auto-submit on timeout), auto-grade, scorecard with correct-answer review; teacher results leaderboard + analytics. Quiz access scoped to student's batch/institute (403 otherwise).
- **Homework PDF**: assignments accept a PDF attachment; students submit via PDF upload OR text note; teacher marks reviewed/pending.
- **Report card remarks**: editable "Teacher's Remarks" per student (StudentDetail), rendered in the report-card PDF.
- **AI Insights reworked** to 4 live rule-based buckets: RED attendance<75%, ORANGE fee overdue >30 days, YELLOW 2 consecutive exam-score drops, GREEN attendance>90% AND top-10% marks.
- **Parent notifications**: WhatsApp-first via Twilio (TWILIO_WHATSAPP_FROM, `whatsapp:` prefix) with automatic SMS fallback (`notify_parent`). Events: student marked absent (auto, deduped once/day via parent_notified flag), fee overdue reminder, exam result published, new homework assigned. TWILIO_WHATSAPP_FROM is empty by default → falls back to SMS until the user pastes a WhatsApp sender.
- **Student portal**: My Report Card PDF download, "View Answers" for completed MCQ tests, AI Performance Insights card (attendance/avg/fee + GET /student/ai-summary).
- **Login page redesigned**: removed all marketing (school/student/teacher stats bars, floating feature cards, demo placeholders, dark-mode toggle, institute-code toggle). Clean minimal card: logo, username/email, password, remember me, forgot password, sign in. Deep blue→teal→emerald gradient. Privacy/Terms still linked; register + forgot-password preserved.

## Implemented (2026-06, forked session, part 2) — Class rename, Gallery, Dashboards
- **"Batch" → "Class / Section"** in all UI labels (nav, Classes page, dropdowns in Students/Exams/Homework/Quizzes/Attendance). Data field `batch_id` and `/batches` endpoint unchanged.
- **Principal dashboard quick-enter**: `ClassQuickCards` — per-class cards with Attendance / Students / Homework buttons; Attendance deep-links with `?class=<id>` and pre-selects a class filter (attendance-class-filter).
- **Date format DD-MM-YYYY** helper `fmtDate` (frontend) + `fmt_date` (backend); applied to Attendance rows, Homework due dates, and parent SMS/WhatsApp messages (absent/homework/fee). NOTE: not yet applied to Exams/Leaves screens and leave emails — pending.
- **Photo Gallery** (`/app/gallery`, nav for all roles): principal & teachers upload photos (title + Institute shared album OR per-class album); album filter chips; staff delete. Backend GET/POST/DELETE /gallery with institute-scoped class validation + blank-image rejection.
- **Teacher dashboard assigned leads** now have an editable status dropdown (teacher-lead-stage-<id>) reflecting to the principal pipeline. Backend `PUT /enquiries/{id}` now enforces teacher ownership (403 on non-owned) and restricts teachers to stage/status/notes.
- **Premium Announcements panel** on Student & Teacher dashboards (data-testid=dashboard-announcements): dark gradient card, glow orbs, glass tiles, audience badge, author + DD-MM-YYYY date. Reads GET /announcements.

## Known pending (from QA code review) — for next session
- Date DD-MM-YYYY not yet applied to Exams/Leaves screens, leave emails, and PDFs (receipts/report cards/slips).
- Students/Homework pages don't yet read `?class=` to pre-filter (only Attendance does).
- Gallery students only get All/Institute album chips (don't fetch /batches) — add class chips for students.
- server.py is ~2.5k lines — split by domain (refactor).

## Implemented (2026-06, forked session, part 3) — Email slip/receipt, deep-filters, dates
- **Email salary slip & fee receipt** to the specific faculty/student: POST /salaries/{id}/email-slip (principal) and POST /fees/{id}/email-receipt (principal) send a richly formatted HTML slip/receipt via the managed email proxy. UI: "Email" buttons on Salary (paid rows) and Fees (paid/partial rows). Student form now captures Parent/Student Email (StudentIn.parent_email) so receipts can be delivered. NOTE: delivery fails for fake demo emails (@edusync.in) — real emails deliver.
- **Class deep-filters**: dashboard Students (`?class=`) and Homework (`?class=`) quick-links now pre-filter to that class (Attendance already did).
- **Dates DD-MM-YYYY** extended to Exams table (exam_date), Leaves table (from/to), leave application email, and PDF fee receipt (date + payment date).

## Implemented (2026-06, forked session, part 4) — PDF attachments + auto-receipt
- **PDF attachments confirmed & shipped**: the Emergent managed email proxy accepts `attachments:[{filename, content(base64)}]` (verified → 202). `send_email` now supports attachments. Email-slip and email-receipt now attach the actual reportlab PDF (generated by reusing the existing GET endpoints' `body_iterator`, zero duplication) plus a short HTML cover note.
- **Auto-email receipt on payment**: `_auto_email_receipt()` fires (fire-and-forget) when a fee is marked paid (`/fees/{id}/mark-paid`) or paid online (`/fees/razorpay/verify`), emailing the student/parent the receipt PDF automatically. Verified: mark-paid triggered a 202 send.
- Requires a student/parent email on file (captured in the student form); silently skips if none.

## Implemented (2026-06, forked session, part 5) — Auto WhatsApp/SMS across events
All use `notify_parent_async` (WhatsApp-first via TWILIO_WHATSAPP_FROM → SMS fallback):
- **Payment received** → parent/student SMS + emailed receipt (on mark-paid & Razorpay verify).
- **Student absent** → parent (deduped, existing).
- **Complaint raised** → notifies the routed party (class teacher and/or principal).
- **Complaint status update/response** → notifies the raiser (student's parent or teacher).
- **Lead assigned** → the assigned teacher gets an SMS to follow up.
- **Urgent notice** → announcement with audience "teachers" SMS-blasts all teachers.
- Verified: dispatch fires for every event (logs show Twilio sends). Delivery blocked only by the **trial Twilio account** (error 21608, unverified demo numbers) — real/verified numbers deliver; WhatsApp activates when TWILIO_WHATSAPP_FROM is set.

## Verification status (forked session)
- Backend curl-verified: ID migration/continuation, quiz create/attempt scoring w/ negative marking, batch-auth 403, insights buckets (red=3/orange=15), auto-absent dedup flag, student AI summary, student report PDF, homework/exam notify hooks present.
- Frontend compiles clean (only pre-existing html5-qrcode source-map + react-hooks/exhaustive-deps warnings).
- NOTE: Live UI screenshots blocked by the platform preview idle-gate ("Wake up servers"); the frontend is running (compiles clean, /api reachable on same domain).
