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

## Backlog / Remaining (P2)
- Add DialogDescription/aria-describedby to dialogs (LOW — console accessibility warning only).
- Add error/catch states to page load effects (avoid indefinite loaders on API failure).
- Check response.ok before opening blob downloads.
- Scheduled/automatic overdue-fee reminders (currently manual trigger).
- Split server.py into modules; use async clients for storage/Twilio/Razorpay.

## Next Tasks
- Activate real SMS by adding Twilio credentials.
- Optional: monthly recurring reminder cron.
