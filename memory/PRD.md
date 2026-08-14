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

## Implemented (2026-06, forked session, part 6) — Editable profiles + honest reminder
- **Editable student profile**: PUT /students/{sid} (principal) + "Edit" button per student row → prefilled dialog (name, age, gender, class, parent name/phone/email, fee, photo, ID template). Verified.
- **Editable teacher profile**: PUT /teachers/{tid} (principal) + "Edit" button per teacher row → prefilled dialog (name, email, phone, subjects, salary, leave balance; email-uniqueness enforced; password hidden in edit). Verified.
- **Fee reminder** now uses `notify_parent` (WhatsApp→SMS) and returns an honest status: "sent via WHATSAPP/SMS", "No parent phone on file", or "Could not deliver — SMS provider rejected the number (trial accounts only send to verified numbers)". Replaces the misleading "check parent phone" message.
- NOTE (reported issues): SMS not delivering + receipt not emailed are DATA/ACCOUNT limits, not bugs — trial Twilio account (error 21608) can't message unverified numbers, and demo students had no email on file (student form now captures parent/student email).

## Implemented (2026-06, forked session, part 7) — Data export, inline phone, password reset
- **CSV exports on Principal dashboard**: "Students" and "Teachers" buttons download full CSVs via GET /export/students.csv and /export/teachers.csv (principal only). Verified.
- **Inline parent-phone fix**: when a fee reminder can't be delivered, the row prompts to add/fix the parent's phone (PUT /students/{id}) and auto-retries the reminder. Verified path.
- **Password reset**: student & teacher edit dialogs include a password field (blank = unchanged on edit); PUT /students/{id} and /teachers/{id} accept `password` → re-hash. Verified: reset then logged in with the new password.

## Implemented (2026-06, forked session, part 8) — Free WhatsApp sharing
- **WhatsApp click-to-chat (free, no Twilio)**: green WhatsApp button on each fee row opens wa.me with a pre-filled fee-reminder to the parent's number — zero SMS cost. Falls back to a clear toast if no phone on file.
- Fixed a pre-existing file corruption (duplicated tail) in Fees.jsx that caused a parse error.
- Direction "Communicate Without the Cost": built-in/free channels over paid SMS. NEXT: in-app Notification Center (🔔 bell) + PWA installability/alerts.

## Verification status (forked session)
- Backend curl-verified: ID migration/continuation, quiz create/attempt scoring w/ negative marking, batch-auth 403, insights buckets (red=3/orange=15), auto-absent dedup flag, student AI summary, student report PDF, homework/exam notify hooks present.
- Frontend compiles clean (only pre-existing html5-qrcode source-map + react-hooks/exhaustive-deps warnings).
- NOTE: Live UI screenshots blocked by the platform preview idle-gate ("Wake up servers"); the frontend is running (compiles clean, /api reachable on same domain).

## Implemented (2026-06, forked session, part 9) — Notification Center + Automated Credential Delivery
- **In-App Notification Center (🔔 bell)**: bell in topbar (Layout.jsx `NotificationBell`) with unread-count badge + dropdown of role-scoped alerts (fees/absent/notices for students; leads/notices for teachers; fees/complaints/leaves for principal). Backed by GET /api/notifications. Shows empty state or a load-error state. Testing-agent verified.
- **Automated Credential Delivery**: POST /api/teachers & POST /api/students now auto-generate an 8-char temp password (`gen_temp_password`), hash+store it, and email branded EduSync welcome credentials (logo + institute name + login link) via the Resend proxy (`send_welcome_email`/`_welcome_email_html`). Endpoints return `temp_password`, `email_sent`, `email_recipients`.
  - Teacher: auto Faculty ID (e.g. DP2026T00X) + emailed login. Password field removed from create form (auto-generated); shown only on edit.
  - Student: auto Student ID (DP2026XXXX) + emailed login to BOTH `email` (new field on StudentIn) and `parent_email`.
  - Teachers can now admit students (POST /api/students allows principal + teacher).
  - Frontend shows a `CredentialsDialog` after create (ID + temp password + email status, copy button). Toast reflects real `email_sent`.
  - Robustness: `send_email` retries on HTTP 429 with backoff; logs failure body. NOTE: the Resend proxy blocks undeliverable/fake recipients (422) → `email_sent=false` gracefully; real inboxes + delivered@resend.dev return true.
- Config: added `APP_BASE_URL` to backend/.env (frontend base for email login link + logo).
- Known/out-of-scope from test report: notification badge is a live category count (no persisted read-state); auth is Bearer/localStorage by design (no HttpOnly cookie/credentialed CORS); server.py >2800 lines (refactor pending); duplicate PUT /students & /teachers handlers should be consolidated.

## Implemented (2026-06, forked session, part 10) — PWA + Legal & Compliance
- **PWA install**: valid `public/manifest.json` (standalone, navy theme), generated 192/512/maskable + apple-touch icons, `public/sw.js` service worker (app-shell cache + notificationclick), registered via `src/lib/pwa.js`, meta tags in index.html. `InstallPrompt.jsx` shows an install banner on `beforeinstallprompt`. NOTE: index.html changes require a frontend restart.
- **Local notification banners**: bell poller fires native notifications on NEW alerts (deduped via localStorage `edusync_seen_alerts`); "Enable alerts" button in bell dropdown requests permission; uses SW `showNotification` so it works installed.
- **Legal & Compliance**:
  - Enriched `/privacy` (PrivacyPolicy.jsx → "Privacy & Compliance"): data collection (attendance/grades/IDs), encrypted cloud storage, **30-day retention**, DPDP Act 2023, verifiable parental consent, RBAC, payments; plus a highlighted **Grievance Officer** card (Shivam Mantri · founder@privamsolutions.in). Terms.jsx retention section aligned to 30-day.
  - Login footer (Landing.jsx) shows Grievance Officer details (`data-testid=grievance-officer`).
  - Student registration form: mandatory checkbox `data-testid=parental-consent` — "Verifiable parental consent obtained for this minor's data processing." Register button gated until checked (create only).
  - Backend: `StudentIn.parental_consent`; `POST /api/students` returns 400 without consent, stores a structured `parental_consent` record + classification tags (`data_classification=restricted`, `pii_category=minor_sensitive`, `access_scope=role_scoped`).
  - Data governance: `tag_sensitive_data()` on startup upserts a `data_governance` registry (students/attendance/results/fees = RESTRICTED, 30-day retention, grievance officer) and backfills classification tags on existing student docs (verified: 42 tagged, 0 untagged).

## Code review + Deployment readiness (2026-06, forked session, part 11)
- Applied safe code-review fixes: OTP now uses `secrets.randbelow` (server.py forgot-password); removed hardcoded default passwords ("teacher123"/"student123") from Teachers.jsx/Students.jsx form state; stable React key for notification items; console.debug on pwa.js fallback catches.
- Declined (with rationale): localStorage→httpOnly cookies (deliberate JWT-Bearer architecture); large-function refactors (generate_timetable/create_salary — working code, regression risk); exhaustive-deps on run-once useEffects (infinite-loop risk); `is None` is correct idiom (no bug).
- Performance: removed two N+1 query patterns — GET /api/batches (student counts via `$group` aggregation + bulk teacher lookup) and GET /api/homework (submission counts via `$group` + bulk my-submissions fetch). Both verified returning correct data.
- **Deployment health check: PASS** (deployment_agent, zero findings). Compilation OK, env-only URLs/secrets, CORS ok, supervisor valid, no unoptimized queries. App is deployment-ready.
- **Deploy fix**: added root-level `GET /health` on the FastAPI `app` (returns `{"status":"ok"}`, no DB) — the k8s readiness probe hit `/health` (not `/api/...`) and was 404ing, failing deploys. Verified 200 locally + via ingress.

## Email — Resend/managed (2026-06, forked session, part 12)
- User asked to wire a BYO Resend API key + custom `From` (founder@privamsolutions.in). Per the Resend integration playbook this is NOT permitted (platform owns the verified sending domain; From address is fixed; no BYO key). Implemented the compliant equivalent instead:
  - Kept the Emergent-managed Resend proxy (`send_email`), which already delivers to real inboxes.
  - Professional sender display name via `EMAIL_FROM_NAME="EduSync by Privam Solutions"` + **Reply-To** `EMAIL_REPLY_TO=founder@privamsolutions.in` (passed as `contact_email`) so replies reach the founder inbox.
  - **Login link fixed** to `https://app.privamsolutions.in` via `APP_BASE_URL` (used in all email buttons + logo src).
  - Added `_brand_email_html()` shared branded template. New emails now sent: **Principal welcome** (on institute registration), **Attendance-absent alert to parents** (email in addition to SMS), **Fee reminder to parents** (email + SMS; response now returns `email_sent`). Credential/welcome emails to teachers & students already existed.
- Verified: emails send (`email_sent: True` to delivered@resend.dev), login link + reply-to + from_name confirmed.
- NOTE: To send from `founder@privamsolutions.in` as the actual From address, the user would need a self-hosted SMTP/own-Resend setup outside the managed platform — not supported here; the Reply-To achieves the practical goal.

## Auth overhaul — 2FA OTP + Super Admin + gated login (2026-06, forked session, part 13)
- **2FA login (password → email OTP)**: `POST /api/auth/login` verifies password then emails a 6-digit OTP (via managed Resend, `_issue_login_otp`, secrets-based, 10-min expiry, hashed, single-use, 5-attempt cap) and returns `{otp_required, identifier, email_hint}`. `POST /api/auth/verify-otp` checks the code and issues the JWT. Students with NO email fall back to password-only (avoids lockout). OTP email destination: staff=email, student=email or parent_email.
- **Gated auth**: removed "Create workspace"/sign-up from the login page (Landing.jsx rewritten). Login page shows "Access is by invitation" note. Backend register endpoint retained but not surfaced.
- **Institute activation gate**: login blocked (403) if user's institute `status=="inactive"`. `institute_is_active()` reads a **shared marketing DB** if `MARKETING_MONGO_URL`/`MARKETING_DB_NAME` are set (env, currently empty → falls back to app DB). Demo institute kept Active.
- **Super Admin**: role `super_admin`, account `founder@privamsolutions.in` (pwd `PrivamSuper@2026`, env `SUPER_ADMIN_PASSWORD`) seeded on startup (`ensure_super_admin`, also backfills `status:active` on institutes/users/students). Route `/super-admin` (SuperAdmin.jsx) gated to super_admin. Endpoints under `/api/super-admin`: list institutes (+counts/status), list users, create/edit/delete credentials, reset password, activate/deactivate institute & user. `require_super_admin` guard.
- Verified via curl: login→otp_required, verify-otp→token, wrong OTP 401, single-use OTP, principal blocked from super-admin (403), deactivate institute→login 403, reactivate→200, SA lists 3 institutes. Frontend compiles clean; login page has no signup + shows invite note. test_credentials.md updated.
- Enforcement note: 2FA is password-first then OTP (per user choice). NOT yet load/regression-tested by testing_agent — recommend a full auth-flow test pass before production redeploy.

## Marketing Sync API — principal verify/provision over HTTP (2026-06, forked session, part 14)
- No DB sharing. On **email** logins, backend calls the marketing Sync API to verify principals: `SYNC_BASE_URL` + header `X-Sync-Key` (`SYNC_KEY`), `POST /api/sync/verify-principal {email,password}` → `{valid, principal:{email,name,role,institute_code,institute_name,active,must_change_password}}`. (Also documented: `GET /api/sync/principal/{email}`, `GET /api/sync/principals`.)
- `sync_verify_principal()` returns principal dict | None(invalid) | 'inactive'(403) | 'unavailable'. `_provision_synced_principal()` upserts a local institute (by `institute_code`, status from `active`) + local principal user (stores bcrypt of the just-verified password, `synced=True`, `must_change_password`). Then the normal 2FA OTP is issued.
- **Order of precedence** (login, email identifier): Sync positive match → provision + OTP; Sync `inactive` → 403; Sync `None`/`unavailable` → fall back to LOCAL auth (keeps demo principal, teachers, super-admin working). Student-ID logins unchanged (local).
- Env added: `SYNC_BASE_URL="https://privamsolutions.in"`, `SYNC_KEY=...`.
- **VERIFIED**: via a local mock Sync API — synced principal → otp_required + correctly provisioned (role=principal, synced, must_change_password, active institute); wrong password → 401; inactive principal → 403 (not provisioned); local demo principal + teacher still work when Sync is 404. Mock + all test data cleaned up; env reverted to production URL.
- ⚠️ **BLOCKER (production)**: The live Sync API at `https://privamsolutions.in/api/sync/*` currently returns **404** (routes not deployed — `/sync/*` serves the marketing SPA HTML). Until the marketing backend deploys these routes, EduSync falls back to local auth. User must deploy `/api/sync/verify-principal` etc. for real principal verification to take effect.

## Temporary Password & Change-Password flow (2026-06, forked session, part 15)
- **DB flag**: `must_change_password` now set `True` on every credential-issue path — create_teacher, create_student, super-admin create user, resend-credentials (teacher & student), and synced principals (from Sync `must_change_password`).
- **Endpoint**: `POST /api/auth/change-password {current_password?, new_password}` (auth required). Voluntary change requires correct current password; forced change (flag set) allows without current (user just authenticated). On success sets new bcrypt hash + clears `must_change_password`. Returned in login/verify-otp `user` object and `/auth/me`.
- **Frontend**: `ChangePassword.jsx` page + route `/app/change-password`. `Protected` guard redirects any user with `must_change_password` to it before the dashboard (mandatory). "Change Password" nav item added for all roles (Security tab). After change, refreshes `/auth/me` and routes to dashboard.
- **VERIFIED (curl)**: teacher created → flag true; wrong current → 400; forced change without current → 200 → flag cleared → login with NEW password works; `/auth/me` exposes flag. Frontend compiles clean; OTP 2FA screen confirmed via screenshot. (Change-password page screenshot not captured because clicking Continue regenerates the OTP in-browser — logic verified via curl instead.)
- NOTE: Part 1 of the request (Super Admin "Confirm Payment & Activate" generating the temp password + welcome email) lives on the **Marketing Site**, a separate app not in this repo — must be implemented there; EduSync consumes the resulting temp password via the Sync API / credential emails.

## Sync Health panel (2026-06, forked session, part 16)
- `GET /api/super-admin/sync-health` (super-admin only): pings `POST {SYNC_BASE_URL}/api/sync/verify-principal` with dummy creds and classifies: 404→not deployed, 401/403→bad key but reachable, 200/400/422→reachable & responding, exception→unreachable. Returns {configured, reachable, status, base_url, message}.
- Super Admin dashboard shows a **Sync Health panel** (data-testid=sync-health-panel, sync-status-badge, sync-refresh-btn) — green "Connected" / red "Not reachable · <status>" with a Re-check button.
- VERIFIED (curl): against live marketing API returns reachable:false, status:404, correct message ("marketing backend hasn't deployed the Sync routes yet"). Confirms EduSync side is ready; blocker is the missing `/api/sync/*` routes on privamsolutions.in.
- Diagnosis recap: `/api/sync/verify-principal` → 404 JSON on privamsolutions.in/www/app; `POST /api/` → 405 (FastAPI backend exists, sync routes not registered). EduSync Sync integration present in preview (needs redeploy to production).

## EduSync AI Study Buddy (2026-06, forked session, part 17)
- Student portal 24/7 AI doubt-solver. Backend: `POST /api/student/ai-assistant {session_id, message}` + `GET /api/student/ai-assistant/history`. Uses Universal Key (EMERGENT_LLM_KEY) via emergentintegrations LlmChat (gemini-3-flash-preview). System prompt scopes answers to the student's grade/class (from batch name), academic-only (declines off-topic/personal/inappropriate), step-by-step. History persisted in `ai_chats` (keyed session_id+student_id, last 40 msgs); recent 6 msgs replayed as context for multi-turn.
- Frontend: `AIAssistant.jsx` chat page at `/app/assistant` + "AI Study Buddy" nav item (student role only), with suggestion chips, bubble UI, thinking indicator.
- VERIFIED (curl, real student token): academic Q → correct step-by-step answer addressed to student by name; off-topic Q → polite decline + steer back; history persists (4 msgs). Frontend compiles clean.

## ⏳ STILL PENDING from the "AI Intelligence & ID Template" request (NEXT TASKS — not yet done)

## ID Template (CR80) + Enhanced AI Insights (2026-06, forked session, part 18) — DONE
- **ID Card CR80 upgrade**: `IDCard.jsx` rebuilt to CR80 portrait (54mm×85.6mm, exact print size via mm units) using the master-template aesthetic (navy #001E4D / emerald #047857 / gold #C9A227). Photo in white framed box (top-left), overlays Name/ID/Class/Section/Emergency Contact (or Designation/Subjects/Emergency for faculty), QR + institute code footer. Used by StudentDetail ID tab, Teachers faculty cards, BulkIDCards.
- **Per-student insights endpoint**: `GET /api/students/{sid}/insights` (principal/teacher/self). Real-time from live attendance+results+exams. Returns growth_score (academics 50% + attendance 30% + consistency 20%), status (at-risk if attendance<75% or ≥2 consecutive grade drops / top if avg≥85 & att≥90 / steady), per-subject score vs class-average with strength/weakness/on-track, strengths/weaknesses lists, AI summary + AI 7-day improvement plan (Universal Key gemini; plan shown to principal/teacher always, to students only when at-risk).
- **UI**: `StudentInsights.jsx` (growth score card + risk badge + attendance/avg + AI summary + subject bars vs class avg + 7-day plan). Added as "AI Insights" tab in StudentDetail (principal/teacher full analytics).
- VERIFIED (curl): principal viewing DP20260017 → growth 70, att 85.7%, avg 48%, weakness Mathematics, 7-day plan (7 items); empty-data student → graceful. Frontend + all JSX compile clean (babel-verified).
- ⚠️ Screenshots of ID card + insights tab NOT captured — browser automation can't complete 2FA (clicking Continue regenerates the OTP, so a pre-seeded code won't verify). Logic fully curl-verified + components compile. Recommend a manual visual check (or testing_agent with the Mongo OTP-overwrite trick) before production.
- Parent-facing insights: endpoint allows student-self view (summary+score+recommendations); **DONE** — `StudentInsights` now placed on the student dashboard ("My AI Performance Insights"), so students/parents see growth score, AI summary, subject bars, and (if at-risk) the 7-day plan. Frontend compiles clean.
- **ID Card Template Upgrade**: rebuild IDCard.jsx to use the provided master template image (navy/green/gold, portrait), CR80 size (85.6×54mm) for student+faculty, photo in white frame + overlay Name/ID/Class/Section/Emergency Contact. Template image URL: https://customer-assets-jai6qajn.emergentagent.net/wingman/d7d5ed6b-6888-4589-8806-5d3f9da93000/attachments/cf8152e7c4984b35a6880afb1f8d587b_ChatGPT%20Image%20Aug%2014%2C%202026%2C%2003_44_33%20PM.png (portrait, navy #001E4D / emerald #008040 / gold #DAA520, white central body, photo frame top-left).
- **Enhanced AI Student Insights**: per-student Growth Score (0-100 from academics+attendance+consistency), At-Risk (attendance<75% or 2 consecutive grade drops) RED / Top-Performer GREEN flags, subject strengths/weaknesses vs class average, AI 7-day improvement plan for decliners; visibility: principal/teacher full, parent (student portal) sees summary+score+recommendations. NOTE: `/dashboard/insights`, `/ai/report-summary`, `/student/ai-summary` already exist as a base to extend.

