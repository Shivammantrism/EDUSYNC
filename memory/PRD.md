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

## Backlog / Remaining (P2)
- Add DialogDescription/aria-describedby to dialogs (LOW — console accessibility warning only).
- Add error/catch states to page load effects (avoid indefinite loaders on API failure).
- Check response.ok before opening blob downloads.
- Scheduled/automatic overdue-fee reminders (currently manual trigger).
- Split server.py into modules; use async clients for storage/Twilio/Razorpay.

## Next Tasks
- Activate real SMS by adding Twilio credentials.
- Optional: monthly recurring reminder cron.
