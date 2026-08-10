"""EduSync backend API regression tests for auth, RBAC, CRUD, workflows, PDFs, payments, and AI."""
import asyncio
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")

PRINCIPAL = {"identifier": "mantri.shivam111@gmail.com", "password": "Admin@123"}
TEACHER = {"identifier": "teacher1@edusync.in", "password": "teacher123"}
STATE = {}


def request(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=90, **kwargs)


@pytest.fixture(scope="session")
def principal_auth():
    response = request("POST", "/auth/login", json=PRINCIPAL)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["user"]["role"] == "principal"
    assert data["access_token"]
    return data


@pytest.fixture(scope="session")
def teacher_auth():
    response = request("POST", "/auth/login", json=TEACHER)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["user"]["role"] == "teacher"
    assert data["access_token"]
    return data


@pytest.fixture(scope="session")
def seeded_student(principal_auth):
    response = request("GET", "/students", principal_auth["access_token"])
    assert response.status_code == 200, response.text
    students = response.json()
    assert len(students) >= 1
    return students[-1]


@pytest.fixture(scope="session")
def student_auth(seeded_student):
    response = request("POST", "/auth/login", json={"identifier": seeded_student["student_id"], "password": "student123"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["user"]["role"] == "student"
    assert data["user"]["student_id"] == seeded_student["student_id"]
    return data


# Authentication, security controls, and role identity.
class TestAuth:
    def test_logins_and_me_for_all_roles(self, principal_auth, teacher_auth, student_auth):
        for auth, role in [(principal_auth, "principal"), (teacher_auth, "teacher"), (student_auth, "student")]:
            response = request("GET", "/auth/me", auth["access_token"])
            assert response.status_code == 200, response.text
            data = response.json()
            assert data["role"] == role
            assert data["id"] == auth["user"]["id"]
            assert data["institute_name"]
            assert "password_hash" not in data and "_id" not in data

    def test_invalid_login_and_lockout_after_five_failures(self):
        statuses = []
        for _ in range(6):
            response = request("POST", "/auth/login", json={"identifier": PRINCIPAL["identifier"], "password": "definitely-wrong"})
            statuses.append(response.status_code)
        assert statuses[:5] == [401] * 5
        assert statuses[5] == 429, f"Expected brute-force lockout after 5 failures, got {statuses}"

    def test_login_sets_httponly_cookie(self):
        response = request("POST", "/auth/login", json=TEACHER)
        assert response.status_code == 200
        cookie = response.headers.get("set-cookie", "").lower()
        assert "access_token=" in cookie and "httponly" in cookie

    def test_cors_credentials_uses_explicit_origin(self):
        response = requests.options(
            f"{BASE_URL}/api/auth/login",
            headers={"Origin": "https://qa.example.test", "Access-Control-Request-Method": "POST"},
            timeout=30,
        )
        assert response.status_code in (200, 204)
        assert response.headers.get("access-control-allow-credentials", "").lower() == "true"
        assert response.headers.get("access-control-allow-origin") not in (None, "*")

    def test_seeded_password_hash_is_bcrypt_2b(self):
        async def get_hash():
            client = AsyncIOMotorClient(backend_env["MONGO_URL"])
            try:
                doc = await client[backend_env["DB_NAME"]].users.find_one({"email": PRINCIPAL["identifier"]})
                return doc.get("password_hash", "") if doc else ""
            finally:
                client.close()
        password_hash = asyncio.run(get_hash())
        assert password_hash.startswith("$2b$")


# Role dashboards and scoped list access.
class TestDashboardsAndScope:
    def test_all_dashboards(self, principal_auth, teacher_auth, student_auth):
        cases = [
            (principal_auth, "/dashboard/principal", {"kpis", "fee_chart", "attendance_chart"}),
            (teacher_auth, "/dashboard/teacher", {"my_batches", "my_students", "batches"}),
            (student_auth, "/dashboard/student", {"attendance_pct", "pending_fees", "avg_percentage", "homework"}),
        ]
        for auth, path, keys in cases:
            response = request("GET", path, auth["access_token"])
            assert response.status_code == 200, response.text
            assert keys.issubset(response.json())
        principal = request("GET", "/dashboard/principal", principal_auth["access_token"]).json()
        assert len(principal["fee_chart"]) == 6
        assert len(principal["attendance_chart"]) == 7
        assert set(principal["kpis"]) >= {"total_students", "monthly_joiners", "today_attendance", "pending_fees", "teachers_present", "total_teachers", "open_complaints"}

    def test_teacher_student_scope(self, teacher_auth):
        batches = request("GET", "/batches", teacher_auth["access_token"]).json()
        students = request("GET", "/students", teacher_auth["access_token"]).json()
        allowed_batch_ids = {b["id"] for b in batches}
        assert allowed_batch_ids
        assert all(student.get("batch_id") in allowed_batch_ids for student in students)

    def test_teacher_attendance_timetable_and_exam_scope(self, teacher_auth):
        token = teacher_auth["access_token"]
        allowed_batch_ids = {b["id"] for b in request("GET", "/batches", token).json()}
        attendance = request("GET", "/attendance", token).json()
        timetable = request("GET", "/timetable", token).json()
        exams = request("GET", "/exams", token).json()
        assert all(item.get("batch_id") in allowed_batch_ids for item in attendance), "Teacher can read attendance for unassigned batches"
        assert all(item.get("batch_id") in allowed_batch_ids for item in timetable), "Teacher can read timetable for unassigned batches"
        assert all(item.get("batch_id") in allowed_batch_ids for item in exams), "Teacher can read exams for unassigned batches"

    def test_student_list_is_restricted_to_own_record(self, student_auth):
        response = request("GET", "/students", student_auth["access_token"])
        assert response.status_code in (200, 403)
        if response.status_code == 200:
            students = response.json()
            assert len(students) == 1 and students[0]["id"] == student_auth["user"]["id"]

    def test_student_cannot_access_another_student(self, student_auth, seeded_student, principal_auth):
        students = request("GET", "/students", principal_auth["access_token"]).json()
        other = next(s for s in students if s["id"] != seeded_student["id"])
        response = request("GET", f"/students/{other['id']}", student_auth["access_token"])
        assert response.status_code == 403


# Principal student, batch, and teacher CRUD with persistence verification.
class TestCoreCRUD:
    def test_student_create_update_get_delete(self, principal_auth):
        token = principal_auth["access_token"]
        batch = request("GET", "/batches", token).json()[0]
        payload = {"name": "TEST_API Student", "age": 14, "gender": "Other", "batch_id": batch["id"], "parent_name": "TEST Parent", "parent_phone": "9000000001", "monthly_fee": 2100, "password": "student123"}
        created = request("POST", "/students", token, json=payload)
        assert created.status_code == 200, created.text
        student = created.json()
        assert student["name"] == payload["name"] and student["student_id"].startswith("STU")
        sid = student["id"]
        updated_payload = {**payload, "name": "TEST_API Student Updated", "age": 15}
        updated = request("PUT", f"/students/{sid}", token, json=updated_payload)
        assert updated.status_code == 200, updated.text
        assert updated.json()["name"] == updated_payload["name"]
        fetched = request("GET", f"/students/{sid}", token)
        assert fetched.status_code == 200 and fetched.json()["age"] == 15
        deleted = request("DELETE", f"/students/{sid}", token)
        assert deleted.status_code == 200 and deleted.json() == {"ok": True}
        assert request("GET", f"/students/{sid}", token).status_code == 404

    def test_batch_create_update_delete(self, principal_auth):
        token = principal_auth["access_token"]
        teacher = request("GET", "/teachers", token).json()[0]
        payload = {"name": "TEST_API Batch", "subject": "QA", "teacher_id": teacher["id"], "schedule_days": ["Monday"], "room": "TEST Room"}
        created = request("POST", "/batches", token, json=payload)
        assert created.status_code == 200, created.text
        bid = created.json()["id"]
        payload["room"] = "TEST Room 2"
        updated = request("PUT", f"/batches/{bid}", token, json=payload)
        assert updated.status_code == 200 and updated.json()["room"] == "TEST Room 2"
        listed = request("GET", "/batches", token).json()
        assert any(b["id"] == bid and b["room"] == "TEST Room 2" for b in listed)
        assert request("DELETE", f"/batches/{bid}", token).status_code == 200
        assert all(b["id"] != bid for b in request("GET", "/batches", token).json())

    def test_teacher_create_update_delete(self, principal_auth):
        token = principal_auth["access_token"]
        email = f"test_api_{uuid.uuid4().hex[:8]}@example.com"
        payload = {"name": "TEST_API Teacher", "email": email, "password": "teacher123", "phone": "9000000002", "subjects": ["QA"], "available_days": ["Monday"], "monthly_salary": 12345, "leave_balance": 12}
        created = request("POST", "/teachers", token, json=payload)
        assert created.status_code == 200, created.text
        teacher = created.json(); tid = teacher["id"]
        assert teacher["email"] == email and "password_hash" not in teacher
        payload["name"] = "TEST_API Teacher Updated"
        updated = request("PUT", f"/teachers/{tid}", token, json=payload)
        assert updated.status_code == 200 and updated.json()["name"] == payload["name"]
        assert any(t["id"] == tid for t in request("GET", "/teachers", token).json())
        assert request("DELETE", f"/teachers/{tid}", token).status_code == 200
        assert all(t["id"] != tid for t in request("GET", "/teachers", token).json())


# Attendance, fees, reports, salary, and Razorpay test-order workflows.
class TestOperations:
    def test_manual_attendance_and_teacher_self_attendance(self, teacher_auth, seeded_student):
        token = teacher_auth["access_token"]
        scanned = request("POST", "/attendance/scan", token, json={"code": seeded_student["student_id"]})
        assert scanned.status_code == 200, scanned.text
        assert scanned.json()["student"]["student_id"] == seeded_student["student_id"]
        records = request("GET", "/attendance", token).json()
        assert any(r["student_id"] == seeded_student["id"] and r["status"] == "present" for r in records)
        self_mark = request("POST", "/teacher-attendance/mark", token)
        assert self_mark.status_code == 200 and self_mark.json()["ok"] is True
        teacher_records = request("GET", "/teacher-attendance", token).json()
        assert all(r["teacher_id"] == teacher_auth["user"]["id"] for r in teacher_records)

    def test_fee_create_remind_mark_paid(self, principal_auth, seeded_student):
        token = principal_auth["access_token"]
        payload = {"student_id": seeded_student["id"], "amount": 1234, "month": "2099-01", "due_date": "2099-01-10"}
        created = request("POST", "/fees", token, json=payload)
        assert created.status_code == 200, created.text
        fee = created.json(); fid = fee["id"]
        assert fee["status"] == "pending" and fee["amount"] == 1234
        reminded = request("POST", f"/fees/{fid}/reminder", token)
        assert reminded.status_code == 200 and reminded.json()["ok"] is True
        paid = request("POST", f"/fees/{fid}/mark-paid", token)
        assert paid.status_code == 200 and paid.json()["receipt_no"].startswith("RCPT-")
        persisted = next(f for f in request("GET", "/fees", token).json() if f["id"] == fid)
        assert persisted["status"] == "paid" and persisted["paid_amount"] == 1234

    def test_student_razorpay_test_order_creation(self, student_auth):
        token = student_auth["access_token"]
        pending = [f for f in request("GET", "/fees", token).json() if f["status"] == "pending"]
        if not pending:
            pytest.skip("Seeded student has no pending fee")
        response = request("POST", "/fees/razorpay/order", token, json={"fee_id": pending[0]["id"]})
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["order_id"].startswith("order_") and data["currency"] == "INR" and data["amount"] == int(pending[0]["amount"] * 100)
        assert data["key_id"].startswith("rzp_test_")

    def test_report_card_pdf(self, principal_auth, seeded_student):
        response = request("GET", f"/students/{seeded_student['id']}/report", principal_auth["access_token"])
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/pdf")
        assert response.content.startswith(b"%PDF") and len(response.content) > 1000

    def test_salary_create_pay_and_pdf(self, principal_auth):
        token = principal_auth["access_token"]
        teacher = request("GET", "/teachers", token).json()[0]
        created = request("POST", "/salaries", token, json={"teacher_id": teacher["id"], "month": "2099-01", "amount": 12345})
        assert created.status_code == 200, created.text
        salary = created.json(); sid = salary["id"]
        paid = request("PUT", f"/salaries/{sid}/pay", token)
        assert paid.status_code == 200, paid.text
        assert paid.json()["slip_no"].startswith("SAL-")
        persisted = next(s for s in request("GET", "/salaries", token).json() if s["id"] == sid)
        assert persisted["status"] == "paid"
        slip = request("GET", f"/salaries/{sid}/slip", token)
        assert slip.status_code == 200 and slip.content.startswith(b"%PDF")


# Exams, homework, announcements, complaints, enquiries, leaves, timetable, and AI workflows.
class TestAcademicAndCommunication:
    def test_exam_create_marks_results_rank_grade(self, principal_auth, seeded_student):
        token = principal_auth["access_token"]
        payload = {"name": "TEST_API Exam", "batch_id": seeded_student["batch_id"], "subject": "QA", "max_marks": 100, "exam_date": "2099-01-10"}
        created = request("POST", "/exams", token, json=payload)
        assert created.status_code == 200, created.text
        exam = created.json()
        students = request("GET", "/students", token, params={"batch_id": seeded_student["batch_id"]}).json()[:2]
        marks = {s["id"]: 91 - i * 10 for i, s in enumerate(students)}
        saved = request("POST", "/results", token, json={"exam_id": exam["id"], "marks": marks})
        assert saved.status_code == 200, saved.text
        results = saved.json()["results"]
        assert [r["rank"] for r in results] == list(range(1, len(results) + 1))
        assert results[0]["grade"] == "A+"
        persisted = request("GET", "/results", token, params={"exam_id": exam["id"]}).json()
        assert len(persisted) == len(students) and persisted[0]["rank"] == 1

    def test_homework_assign_submit_and_complete(self, principal_auth, seeded_student, student_auth):
        if student_auth["user"]["id"] != seeded_student["id"]:
            pytest.fail("Student fixture mismatch")
        ptoken = principal_auth["access_token"]
        payload = {"title": "TEST_API Homework", "description": "TEST submission flow", "batch_id": seeded_student["batch_id"], "subject": "QA", "deadline": "2099-01-20"}
        created = request("POST", "/homework", ptoken, json=payload)
        assert created.status_code == 200, created.text
        hw = created.json()
        listed = request("GET", "/homework", student_auth["access_token"]).json()
        assert any(h["id"] == hw["id"] for h in listed)
        submitted = request("POST", "/homework/submit", student_auth["access_token"], json={"homework_id": hw["id"], "content": "TEST_API answer"})
        assert submitted.status_code == 200, submitted.text
        submission = submitted.json()
        assert submission["content"] == "TEST_API answer" and submission["status"] == "submitted"
        completed = request("PUT", f"/submissions/{submission['id']}/complete", ptoken)
        assert completed.status_code == 200 and completed.json()["ok"] is True
        subs = request("GET", f"/homework/{hw['id']}/submissions", ptoken).json()
        assert any(s["id"] == submission["id"] and s["status"] == "completed" for s in subs)

    def test_announcement_post_role_visibility_delete(self, principal_auth, teacher_auth, student_auth):
        token = principal_auth["access_token"]
        created = request("POST", "/announcements", token, json={"title": "TEST_API Notice", "body": "Visible to all roles", "audience": "all"})
        assert created.status_code == 200, created.text
        announcement = created.json()
        for auth in (teacher_auth, student_auth):
            listed = request("GET", "/announcements", auth["access_token"]).json()
            assert any(a["id"] == announcement["id"] for a in listed)
        assert request("DELETE", f"/announcements/{announcement['id']}", token).status_code == 200
        assert all(a["id"] != announcement["id"] for a in request("GET", "/announcements", token).json())

    def test_complaint_raise_and_principal_resolve(self, principal_auth, student_auth):
        created = request("POST", "/complaints", student_auth["access_token"], json={"subject": "TEST_API Complaint", "description": "Please test", "category": "general"})
        assert created.status_code == 200, created.text
        complaint = created.json()
        assert complaint["status"] == "open" and complaint["raised_by_role"] == "student"
        updated = request("PUT", f"/complaints/{complaint['id']}", principal_auth["access_token"], json={"status": "resolved", "response": "TEST resolved"})
        assert updated.status_code == 200, updated.text
        assert updated.json()["status"] == "resolved" and updated.json()["response"] == "TEST resolved"
        mine = request("GET", "/complaints", student_auth["access_token"]).json()
        assert any(c["id"] == complaint["id"] and c["status"] == "resolved" for c in mine)

    def test_enquiry_create_and_convert(self, principal_auth):
        token = principal_auth["access_token"]
        created = request("POST", "/enquiries", token, json={"name": "TEST_API Lead", "phone": "9000000003", "course": "QA", "notes": "TEST"})
        assert created.status_code == 200, created.text
        enquiry = created.json()
        assert enquiry["status"] == "new"
        updated = request("PUT", f"/enquiries/{enquiry['id']}", token, json={"status": "converted"})
        assert updated.status_code == 200 and updated.json()["status"] == "converted"
        assert any(e["id"] == enquiry["id"] and e["status"] == "converted" for e in request("GET", "/enquiries", token).json())

    def test_teacher_leave_apply_and_principal_reject(self, teacher_auth, principal_auth):
        created = request("POST", "/leaves", teacher_auth["access_token"], json={"from_date": "2099-02-01", "to_date": "2099-02-02", "reason": "TEST_API leave"})
        assert created.status_code == 200, created.text
        leave = created.json(); assert leave["status"] == "pending"
        updated = request("PUT", f"/leaves/{leave['id']}", principal_auth["access_token"], json={"status": "rejected"})
        assert updated.status_code == 200 and updated.json()["status"] == "rejected"
        mine = request("GET", "/leaves", teacher_auth["access_token"]).json()
        assert any(item["id"] == leave["id"] and item["status"] == "rejected" for item in mine)

    def test_timetable_generate_and_student_scope(self, principal_auth, student_auth, seeded_student):
        generated = request("POST", "/timetable/generate", principal_auth["access_token"])
        assert generated.status_code == 200, generated.text
        data = generated.json()
        assert data["ok"] is True and data["count"] == len(data["entries"]) and data["count"] > 0
        student_tt = request("GET", "/timetable", student_auth["access_token"]).json()
        assert student_tt and all(e["batch_id"] == seeded_student["batch_id"] for e in student_tt)

    def test_ai_summary_and_timetable_suggestions(self, principal_auth, seeded_student):
        token = principal_auth["access_token"]
        summary = request("POST", "/ai/report-summary", token, json={"student_id": seeded_student["id"]})
        assert summary.status_code == 200, summary.text
        assert isinstance(summary.json().get("summary"), str) and len(summary.json()["summary"].strip()) > 30
        suggestions = request("POST", "/ai/timetable-suggest", token, json={"prompt": "Balance teacher workload"})
        assert suggestions.status_code == 200, suggestions.text
        assert isinstance(suggestions.json().get("suggestions"), str) and len(suggestions.json()["suggestions"].strip()) > 20


# Defensive API behavior and permission checks.
class TestValidationAndPermissions:
    def test_unauthenticated_and_forbidden_requests(self, teacher_auth, student_auth):
        assert request("GET", "/students").status_code == 401
        assert request("POST", "/teachers", student_auth["access_token"], json={}).status_code == 403
        assert request("POST", "/students", teacher_auth["access_token"], json={"name": "Nope"}).status_code == 403
        assert request("POST", "/timetable/generate", teacher_auth["access_token"]).status_code == 403

    def test_student_cannot_read_staff_payroll(self, student_auth, principal_auth):
        response = request("GET", "/salaries", student_auth["access_token"])
        assert response.status_code == 403, "Student can list institute-wide staff salaries"
        salary = request("GET", "/salaries", principal_auth["access_token"]).json()[0]
        slip = request("GET", f"/salaries/{salary['id']}/slip", student_auth["access_token"])
        assert slip.status_code == 403, "Student can download a staff salary slip"

    def test_invalid_student_input_is_rejected(self, principal_auth):
        response = request("POST", "/students", principal_auth["access_token"], json={"name": "", "age": -4, "monthly_fee": -1})
        if response.status_code == 200 and response.json().get("id"):
            request("DELETE", f"/students/{response.json()['id']}", principal_auth["access_token"])
        assert response.status_code == 422
