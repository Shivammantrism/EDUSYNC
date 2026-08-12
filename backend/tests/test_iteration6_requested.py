"""Iteration 4 requested-feature API coverage: timetable, batches, finance, complaints, insights, and auth."""
import base64
import re
import uuid
from collections import Counter
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
BACKEND_ENV = dotenv_values("/app/backend/.env")
CREDS = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
PRINCIPAL_EMAIL = re.search(r"(?im)^- Email:\s*(\S+)", CREDS).group(1)
PRINCIPAL_PASSWORD = re.search(r"(?im)^- Password:\s*(\S+)", CREDS).group(1)
TEACHERS = re.findall(r"(?im)^- (teacher\d+@\S+)\s*/\s*(\S+)", CREDS)
TEACHER_EMAIL, TEACHER_PASSWORD = TEACHERS[0]
STUDENT_PASSWORD = re.search(r"(?im)Default password.*?:\s*(\S+)", CREDS).group(1)


def api(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=180, **kwargs)


def login(identifier, password):
    response = api("POST", "/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data.get("access_token"), str) and data["access_token"]
    return data


@pytest.fixture(scope="session")
def principal():
    auth = login(PRINCIPAL_EMAIL, PRINCIPAL_PASSWORD)
    assert auth["user"]["role"] == "principal"
    return auth


@pytest.fixture(scope="session")
def teacher():
    auth = login(TEACHER_EMAIL, TEACHER_PASSWORD)
    assert auth["user"]["role"] == "teacher"
    return auth


@pytest.fixture(scope="session")
def teacher2():
    auth = login(*TEACHERS[1])
    assert auth["user"]["role"] == "teacher"
    return auth


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(BACKEND_ENV["MONGO_URL"])
    yield client[BACKEND_ENV["DB_NAME"]]
    client.close()


@pytest.fixture(scope="session")
def student(principal, teacher):
    rows = api("GET", "/students", principal["access_token"]).json()
    teacher_batch_ids = {b["id"] for b in api("GET", "/batches", teacher["access_token"]).json()}
    for row in rows:
        if row.get("batch_id") not in teacher_batch_ids:
            continue
        response = api("POST", "/auth/login", json={"identifier": row["student_id"], "password": STUDENT_PASSWORD})
        if response.status_code == 200:
            auth = response.json()
            auth["record"] = row
            assert auth["user"]["role"] == "student"
            return auth
    pytest.fail("No batched student accepts the documented password")


# Timetable generation must persist a complete non-zero matrix with no teacher/room clashes and a valid PDF.
def test_timetable_generation_conflicts_grid_and_pdf(principal):
    token = principal["access_token"]
    batches = api("GET", "/batches", token).json()
    teachers = api("GET", "/teachers", token).json()
    assert batches and teachers
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    periods = ["09:00-10:00", "10:00-11:00", "11:15-12:15", "12:15-13:15"]
    generated = api("POST", "/timetable/generate", token, json={
        "days": days, "periods": periods, "teacher_ids": [t["id"] for t in teachers], "use_ai": False
    })
    assert generated.status_code == 200, generated.text
    result = generated.json()
    assert result["ok"] is True and result["count"] > 0 and result["conflicts"] == 0
    rows = api("GET", "/timetable", token).json()
    assert len(rows) == result["count"] == len(batches) * len(days) * len(periods)
    assert set(r["day"] for r in rows) == set(days)
    assert set(r["slot"] for r in rows) == set(periods)
    teacher_keys = [(r["day"], r["slot"], r["teacher_id"]) for r in rows if r.get("teacher_id")]
    room_keys = [(r["day"], r["slot"], r["room"]) for r in rows if r.get("room")]
    assert all(n == 1 for n in Counter(teacher_keys).values())
    assert all(n == 1 for n in Counter(room_keys).values())
    pdf = api("GET", "/timetable/pdf", token)
    assert pdf.status_code == 200 and pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content.startswith(b"%PDF") and len(pdf.content) > 1000


# Admission assigns the selected class/section batch; roster counts and moves persist; teachers see only assigned students.
def test_batch_admission_roster_move_and_teacher_scope(principal, teacher):
    token = principal["access_token"]
    batches = api("GET", "/batches", token).json()
    assert len(batches) >= 2
    source, target = batches[0], batches[1]
    marker = uuid.uuid4().hex[:8]
    created = api("POST", "/students", token, json={
        "name": f"TEST_Batch Student {marker}", "age": 12, "gender": "Other", "batch_id": source["id"],
        "parent_name": "TEST Parent", "parent_phone": "9000000011", "monthly_fee": 1500, "password": STUDENT_PASSWORD
    })
    assert created.status_code == 200, created.text
    row = created.json()
    try:
        source_roster = api("GET", f"/batches/{source['id']}/students", token)
        assert source_roster.status_code == 200
        assert any(s["id"] == row["id"] and s["batch_id"] == source["id"] for s in source_roster.json())
        source_list = next(b for b in api("GET", "/batches", token).json() if b["id"] == source["id"])
        assert source_list["student_count"] == len(source_roster.json())

        moved = api("PUT", f"/students/{row['id']}/move", token, json={"batch_id": target["id"]})
        assert moved.status_code == 200 and moved.json()["batch_id"] == target["id"]
        assert all(s["id"] != row["id"] for s in api("GET", f"/batches/{source['id']}/students", token).json())
        assert any(s["id"] == row["id"] for s in api("GET", f"/batches/{target['id']}/students", token).json())

        teacher_batches = api("GET", "/batches", teacher["access_token"]).json()
        teacher_students = api("GET", "/students", teacher["access_token"]).json()
        allowed = {b["id"] for b in teacher_batches}
        assert allowed and all(s.get("batch_id") in allowed for s in teacher_students)
        for batch in teacher_batches:
            roster = api("GET", f"/batches/{batch['id']}/students", teacher["access_token"])
            assert roster.status_code == 200
            assert all(s["batch_id"] == batch["id"] for s in roster.json())
    finally:
        api("DELETE", f"/students/{row['id']}", token)


# Fee receipts and salary slips are PDFs; generated salary contains the requested Indian statutory breakdown.
def test_fee_receipt_salary_breakdown_and_slip(principal, mongo_db):
    token = principal["access_token"]
    paid_fee = next(f for f in api("GET", "/fees", token).json() if f.get("paid_amount", 0) > 0 or f.get("status") == "paid")
    receipt = api("GET", f"/fees/{paid_fee['id']}/receipt", token)
    assert receipt.status_code == 200 and receipt.headers["content-type"].startswith("application/pdf")
    assert receipt.content.startswith(b"%PDF") and len(receipt.content) > 1000

    teacher_row = next(t for t in api("GET", "/teachers", token).json() if not t.get("salary_components"))
    existing = {(s["teacher_id"], s["month"]) for s in api("GET", "/salaries", token).json()}
    month = next(f"2098-{m:02d}" for m in range(1, 13) if (teacher_row["id"], f"2098-{m:02d}") not in existing)
    created = api("POST", "/salaries", token, json={"teacher_id": teacher_row["id"], "month": month})
    assert created.status_code == 200, created.text
    salary = created.json()
    try:
        required = {"base", "hra", "special", "epf", "professional_tax", "tds", "gross", "amount"}
        assert required.issubset(salary)
        assert salary["gross"] == pytest.approx(salary["base"] + salary["hra"] + salary["special"], abs=0.02)
        assert salary["epf"] == pytest.approx(salary["base"] * 0.12, abs=0.02)
        expected_hra = salary["base"] * (0.5 if salary["metro"] else 0.4)
        assert salary["hra"] == pytest.approx(expected_hra, abs=0.02)
        assert salary["amount"] == pytest.approx(salary["gross"] - salary["total_deductions"], abs=0.02)
        slip = api("GET", f"/salaries/{salary['id']}/slip", token)
        assert slip.status_code == 200 and slip.headers["content-type"].startswith("application/pdf")
        assert slip.content.startswith(b"%PDF") and len(slip.content) > 1000
    finally:
        mongo_db.salaries.delete_one({"id": salary["id"]})


# Razorpay test-mode order returns a real order ID, paise amount, and rzp_test key.
def test_razorpay_test_order(principal, student, mongo_db):
    token = principal["access_token"]
    marker = uuid.uuid4().hex[:8]
    created = api("POST", "/fees", token, json={
        "student_id": student["record"]["id"], "items": [{"name": f"TEST_RZP {marker}", "amount": 101}],
        "month": "2097-12", "due_date": "2097-12-20"
    })
    assert created.status_code == 200, created.text
    fee = created.json()
    try:
        order = api("POST", "/fees/razorpay/order", student["access_token"], json={"fee_id": fee["id"]})
        assert order.status_code == 200, order.text
        data = order.json()
        assert data["order_id"].startswith("order_")
        assert data["key_id"].startswith("rzp_test_")
        assert data["amount"] == 10100 and data["currency"] == "INR"
    finally:
        mongo_db.fees.delete_one({"id": fee["id"]})


# Routed complaint with a PDF attachment is visible/manageable to principal and teacher and appends audit entries.
def test_complaint_both_attachment_principal_teacher_audit(principal, teacher, teacher2, student, mongo_db):
    pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n"
    upload = api("POST", "/upload", student["access_token"], files={"file": ("TEST_complaint.pdf", pdf, "application/pdf")})
    assert upload.status_code == 200, upload.text
    uploaded = upload.json()
    marker = uuid.uuid4().hex[:8]
    created = api("POST", "/complaints", student["access_token"], json={
        "subject": f"TEST_Both Complaint {marker}", "description": "TEST routed complaint", "direction": "both",
        "attachments": [{"url": uploaded["url"], "type": "pdf", "name": "TEST_complaint.pdf"}],
        "attachment_url": uploaded["url"]
    })
    assert created.status_code == 200, created.text
    complaint = created.json()
    try:
        assert complaint["status"] == "pending" and complaint["direction"] == "both"
        assert complaint["attachments"][0]["type"] == "pdf"
        assert any(c["id"] == complaint["id"] for c in api("GET", "/complaints", principal["access_token"]).json())
        assert any(c["id"] == complaint["id"] for c in api("GET", "/complaints", teacher["access_token"]).json())
        assert all(c["id"] != complaint["id"] for c in api("GET", "/complaints", teacher2["access_token"]).json()), "Complaint leaked to a teacher outside the student's assigned batch"
        first = api("PUT", f"/complaints/{complaint['id']}", principal["access_token"], json={
            "status": "under_review", "response": "Reviewing", "note": "TEST principal review"
        })
        assert first.status_code == 200 and len(first.json()["audit"]) == 1
        assert first.json()["audit"][0]["by_role"] == "principal"
        second = api("PUT", f"/complaints/{complaint['id']}", teacher["access_token"], json={
            "status": "resolved", "response": "Resolved", "note": "TEST teacher resolution"
        })
        assert second.status_code == 200 and second.json()["status"] == "resolved"
        assert len(second.json()["audit"]) == 2 and second.json()["audit"][1]["by_role"] == "teacher"
    finally:
        mongo_db.complaints.delete_one({"id": complaint["id"]})
        mongo_db.files.delete_one({"storage_path": uploaded["path"]})



# Complaint status is a closed workflow and must reject values outside Pending/Under Review/Resolved.
def test_complaint_rejects_invalid_status(principal, student, mongo_db):
    created = api("POST", "/complaints", student["access_token"], json={
        "subject": f"TEST_Invalid Status {uuid.uuid4().hex[:8]}", "description": "validation", "direction": "principal"
    })
    assert created.status_code == 200, created.text
    complaint = created.json()
    try:
        invalid = api("PUT", f"/complaints/{complaint['id']}", principal["access_token"], json={"status": "deleted"})
        assert invalid.status_code in (400, 422), invalid.text
    finally:
        mongo_db.complaints.delete_one({"id": complaint["id"]})


# Principal AI insights expose all four typed cards and remain forbidden to non-principals.
def test_dashboard_insights_contract_and_rbac(principal, teacher):
    response = api("GET", "/dashboard/insights", principal["access_token"])
    assert response.status_code == 200, response.text
    data = response.json()
    assert set(data) == {"low_attendance", "pending_approvals", "timetable_conflicts", "attendance_improvement"}
    assert isinstance(data["low_attendance"]["count"], int) and isinstance(data["low_attendance"]["students"], list)
    assert isinstance(data["pending_approvals"]["count"], int) and isinstance(data["pending_approvals"]["items"], list)
    assert isinstance(data["timetable_conflicts"]["count"], int) and isinstance(data["timetable_conflicts"]["items"], list)
    assert isinstance(data["attendance_improvement"]["value"], (int, float))
    assert api("GET", "/dashboard/insights", teacher["access_token"]).status_code == 403


# Auth regression and required playbook controls: all roles, bcrypt, and brute-force lockout.
def test_auth_regression_bcrypt_and_lockout(principal, teacher, student, mongo_db):
    for auth, role in ((principal, "principal"), (teacher, "teacher"), (student, "student")):
        me = api("GET", "/auth/me", auth["access_token"])
        assert me.status_code == 200 and me.json()["role"] == role
    admin = mongo_db.users.find_one({"email": PRINCIPAL_EMAIL})
    assert admin["password_hash"].startswith("$2b$")
    identifier = f"TEST_lockout_{uuid.uuid4().hex}@example.test"
    statuses = [api("POST", "/auth/login", json={"identifier": identifier, "password": "wrong"}).status_code for _ in range(6)]
    assert statuses == [401, 401, 401, 401, 401, 429]


# Login must issue the required application HttpOnly access-token cookie.
def test_login_sets_application_httponly_cookie():
    login_response = api("POST", "/auth/login", json={"identifier": TEACHER_EMAIL, "password": TEACHER_PASSWORD})
    assert login_response.status_code == 200
    cookie = login_response.headers.get("set-cookie", "").lower()
    assert "access_token=" in cookie and "httponly" in cookie


# Credentialed CORS must echo an explicit allowed origin rather than wildcard.
def test_cors_allows_credentials_with_explicit_origin():
    preflight = requests.options(f"{BASE_URL}/api/auth/login", headers={
        "Origin": "https://qa.example.test", "Access-Control-Request-Method": "POST"
    }, timeout=30)
    assert preflight.status_code in (200, 204)
    assert preflight.headers.get("access-control-allow-credentials", "").lower() == "true"
    assert preflight.headers.get("access-control-allow-origin") not in (None, "*")
