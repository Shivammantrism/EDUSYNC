"""Iteration 3 API tests for password reset, custom fees/payments, salary/LWP, leads, leave decisions, reminders, and PDFs."""
import asyncio
import re
import uuid
from datetime import date
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BACKEND_ENV = dotenv_values("/app/backend/.env")
BASE_URL = FRONTEND_ENV["REACT_APP_BACKEND_URL"].rstrip("/")
CREDENTIALS_PATH = Path("/app/memory/test_credentials.md")
CREDS_TEXT = CREDENTIALS_PATH.read_text(encoding="utf-8")
PRINCIPAL_EMAIL = re.search(r"(?im)^- Email:\s*(\S+)", CREDS_TEXT).group(1)
PRINCIPAL_PASSWORD = re.search(r"(?im)^- Password:\s*(\S+)", CREDS_TEXT).group(1)
TEACHER_EMAIL, TEACHER_PASSWORD = re.search(
    r"(?im)^- (teacher1@\S+)\s*/\s*(\S+)", CREDS_TEXT
).groups()


def api(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(
        method,
        f"{BASE_URL}/api{path}",
        headers=headers,
        timeout=90,
        **kwargs,
    )


@pytest.fixture(scope="session")
def principal():
    response = api(
        "POST",
        "/auth/login",
        json={"identifier": PRINCIPAL_EMAIL, "password": PRINCIPAL_PASSWORD},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["user"]["role"] == "principal" and data["access_token"]
    return data


@pytest.fixture(scope="session")
def teacher():
    response = api(
        "POST",
        "/auth/login",
        json={"identifier": TEACHER_EMAIL, "password": TEACHER_PASSWORD},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["user"]["role"] == "teacher" and data["access_token"]
    return data


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(BACKEND_ENV["MONGO_URL"])
    yield client[BACKEND_ENV["DB_NAME"]]
    client.close()


@pytest.fixture(scope="session")
def cleanup_ids(mongo_db):
    tracked = {
        "fee_components": [],
        "fees": [],
        "salaries": [],
        "leaves": [],
        "enquiries": [],
    }
    yield tracked

    for collection, ids in tracked.items():
        if ids:
            mongo_db[collection].delete_many({"id": {"$in": ids}})


# Password-reset request is enumeration-safe and invalid OTP cannot change a password.
def test_forgot_password_two_step_api_contract():
    known = api("POST", "/auth/forgot-password", json={"email": PRINCIPAL_EMAIL})
    unknown = api(
        "POST",
        "/auth/forgot-password",
        json={"email": f"test.missing.{uuid.uuid4().hex}@example.com"},
    )
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert known.json() == {
        "ok": True,
        "message": "If that email exists, an OTP has been sent.",
    }
    invalid = api(
        "POST",
        "/auth/reset-password",
        json={"email": PRINCIPAL_EMAIL, "otp": "000000", "new_password": "DoNotUse123!"},
    )
    assert invalid.status_code == 400
    assert invalid.json()["detail"] == "Invalid or expired OTP"


# Fee-component CRUD, itemized fee persistence, partial balance, receipt PDF, and reminders.
def test_custom_fee_partial_payment_receipt_and_reminders(principal, cleanup_ids):
    token = principal["access_token"]
    students = api("GET", "/students", token).json()
    assert students

    component_name = f"TEST_Lab Fee {uuid.uuid4().hex[:6]}"
    created_component = api(
        "POST",
        "/fee-components",
        token,
        json={"name": component_name, "amount": 500},
    )
    assert created_component.status_code == 200, created_component.text
    component = created_component.json()
    cleanup_ids["fee_components"].append(component["id"])
    assert component["name"] == component_name and component["amount"] == 500
    listed = api("GET", "/fee-components", token).json()
    assert any(item["id"] == component["id"] for item in listed)

    updated_component = api(
        "PUT",
        f"/fee-components/{component['id']}",
        token,
        json={"name": component_name, "amount": 550},
    )
    assert updated_component.status_code == 200
    assert updated_component.json()["amount"] == 550

    fee_created = api(
        "POST",
        "/fees",
        token,
        json={
            "student_id": students[0]["id"],
            "items": [{"name": component_name, "amount": 550}],
            "month": "2099-03",
            "due_date": "2020-01-01",
        },
    )
    assert fee_created.status_code == 200, fee_created.text
    fee = fee_created.json()
    cleanup_ids["fees"].append(fee["id"])
    assert fee["amount"] == 550 and fee["paid_amount"] == 0 and fee["status"] == "pending"

    partial = api(
        "POST",
        f"/fees/{fee['id']}/pay-partial",
        token,
        json={"amount": 200},
    )
    assert partial.status_code == 200, partial.text
    assert partial.json()["status"] == "partial" and partial.json()["remaining"] == 350
    persisted = next(item for item in api("GET", "/fees", token).json() if item["id"] == fee["id"])
    assert persisted["paid_amount"] == 200 and persisted["status"] == "partial"

    overpay = api(
        "POST",
        f"/fees/{fee['id']}/pay-partial",
        token,
        json={"amount": 351},
    )
    assert overpay.status_code == 400
    assert "exceeds" in overpay.json()["detail"].lower()

    receipt = api("GET", f"/fees/{fee['id']}/receipt", token)
    assert receipt.status_code == 200
    assert receipt.headers["content-type"].startswith("application/pdf")
    assert receipt.content.startswith(b"%PDF") and len(receipt.content) > 1000

    row_reminder = api("POST", f"/fees/{fee['id']}/reminder", token)
    assert row_reminder.status_code == 200 and row_reminder.json()["ok"] is True
    assert isinstance(row_reminder.json()["sms_sent"], bool)
    all_reminders = api("POST", "/fees/send-overdue-reminders", token)
    assert all_reminders.status_code == 200 and all_reminders.json()["ok"] is True
    assert isinstance(all_reminders.json()["sms_sent"], int)


# Salary structure drives gross/net and rejected leave days drive LWP; paid slip is a PDF.
def test_salary_structure_lwp_generation_payment_and_slip(principal, mongo_db, cleanup_ids):
    token = principal["access_token"]
    teachers = api("GET", "/teachers", token).json()
    assert teachers
    selected = teachers[0]
    original = mongo_db.users.find_one({"id": selected["id"]}).get("salary_components")

    # Principal cannot apply teacher leave; inject one scoped rejected leave as controlled LWP setup.
    forbidden = api(
        "POST",
        "/leaves",
        token,
        json={"from_date": "2099-04-05", "to_date": "2099-04-05", "reason": "TEST_LWP"},
    )
    assert forbidden.status_code == 403

    leave_id = str(uuid.uuid4())
    mongo_db.leaves.insert_one({
        "id": leave_id,
        "teacher_id": selected["id"],
        "teacher_name": selected["name"],
        "from_date": "2099-04-05",
        "to_date": "2099-04-05",
        "reason": "TEST_LWP",
        "status": "rejected",
        "institute_id": principal["user"]["institute_id"],
        "created_at": "2099-04-01T00:00:00+00:00",
    })
    cleanup_ids["leaves"].append(leave_id)

    try:
        structure = {"base": 30000, "hra": 8000, "allowances": 4000, "deductions": 2000}
        saved = api(
            "PUT",
            f"/teachers/{selected['id']}/salary-structure",
            token,
            json=structure,
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["salary_components"] == structure

        generated = api(
            "POST",
            "/salaries",
            token,
            json={"teacher_id": selected["id"], "month": "2099-04"},
        )
        assert generated.status_code == 200, generated.text
        salary = generated.json()
        cleanup_ids["salaries"].append(salary["id"])
        assert salary["gross"] == 42000
        assert salary["lwp_days"] == 1 and salary["lwp_amount"] == 1400
        assert salary["amount"] == 38600 and salary["status"] == "pending"

        paid = api("PUT", f"/salaries/{salary['id']}/pay", token)
        assert paid.status_code == 200 and paid.json()["slip_no"].startswith("SAL-")
        persisted = next(item for item in api("GET", "/salaries", token).json() if item["id"] == salary["id"])
        assert persisted["status"] == "paid"
        slip = api("GET", f"/salaries/{salary['id']}/slip", token)
        assert slip.status_code == 200 and slip.content.startswith(b"%PDF")
    finally:
        if original is None:
            mongo_db.users.update_one({"id": selected["id"]}, {"$unset": {"salary_components": ""}})
        else:
            mongo_db.users.update_one({"id": selected["id"]}, {"$set": {"salary_components": original}})


# New lead persists, moves stages, and resolves the assigned teacher name.
def test_admission_pipeline_stage_and_assignment(principal, cleanup_ids):
    token = principal["access_token"]
    teacher_row = api("GET", "/teachers", token).json()[0]
    created = api(
        "POST",
        "/enquiries",
        token,
        json={"name": "TEST_API Pipeline Lead", "phone": "9000000042"},
    )
    assert created.status_code == 200, created.text
    lead = created.json()
    cleanup_ids["enquiries"].append(lead["id"])
    assert lead["stage"] == "new_lead" and lead["assigned_to"] == ""

    moved = api(
        "PUT",
        f"/enquiries/{lead['id']}",
        token,
        json={"stage": "demo_scheduled", "status": "follow_up"},
    )
    assert moved.status_code == 200
    assert moved.json()["stage"] == "demo_scheduled"

    assigned = api(
        "PUT",
        f"/enquiries/{lead['id']}",
        token,
        json={"assigned_to": teacher_row["id"]},
    )
    assert assigned.status_code == 200
    assert assigned.json()["assigned_to"] == teacher_row["id"]
    assert assigned.json()["assigned_to_name"] == teacher_row["name"]


# Teacher leave application and principal rejection update both role-specific listings.
def test_leave_apply_and_reject_status(teacher, principal, cleanup_ids):
    created = api(
        "POST",
        "/leaves",
        teacher["access_token"],
        json={"from_date": "2099-05-10", "to_date": "2099-05-11", "reason": "TEST_UI email decision"},
    )
    assert created.status_code == 200, created.text
    leave = created.json()
    cleanup_ids["leaves"].append(leave["id"])
    assert leave["status"] == "pending"

    rejected = api(
        "PUT",
        f"/leaves/{leave['id']}",
        principal["access_token"],
        json={"status": "rejected"},
    )
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"
    mine = api("GET", "/leaves", teacher["access_token"]).json()
    assert any(item["id"] == leave["id"] and item["status"] == "rejected" for item in mine)


# Invalid foreign IDs must not create orphan fee records.
def test_fee_rejects_unknown_student(principal, cleanup_ids):
    created = api(
        "POST",
        "/fees",
        principal["access_token"],
        json={
            "student_id": f"TEST_missing_{uuid.uuid4().hex}",
            "items": [{"name": "TEST_Fee", "amount": 100}],
            "month": "2097-01",
            "due_date": "2097-01-10",
        },
    )
    if created.status_code == 200 and created.json().get("id"):
        cleanup_ids["fees"].append(created.json()["id"])
    assert created.status_code == 404, "Fee creation accepted a nonexistent student and persisted an orphan record"


# A teacher/month pair should have only one salary record.
def test_salary_generation_rejects_duplicate_teacher_month(principal, cleanup_ids):
    token = principal["access_token"]
    teacher_row = api("GET", "/teachers", token).json()[0]
    payload = {"teacher_id": teacher_row["id"], "month": "2097-02"}
    first = api("POST", "/salaries", token, json=payload)
    assert first.status_code == 200, first.text
    cleanup_ids["salaries"].append(first.json()["id"])
    duplicate = api("POST", "/salaries", token, json=payload)
    if duplicate.status_code == 200 and duplicate.json().get("id"):
        cleanup_ids["salaries"].append(duplicate.json()["id"])
    assert duplicate.status_code == 409, "Duplicate monthly salary was accepted for the same teacher"


# Repeating an approval must not consume leave balance more than once.
def test_leave_approval_is_idempotent(teacher, principal, mongo_db, cleanup_ids):
    teacher_id = teacher["user"]["id"]
    before = next(item for item in api("GET", "/teachers", principal["access_token"]).json() if item["id"] == teacher_id)
    original_balance = before.get("leave_balance", 0)
    created = api(
        "POST",
        "/leaves",
        teacher["access_token"],
        json={"from_date": "2097-03-10", "to_date": "2097-03-10", "reason": "TEST_idempotent approval"},
    )
    assert created.status_code == 200, created.text
    leave_id = created.json()["id"]
    cleanup_ids["leaves"].append(leave_id)
    try:
        first = api("PUT", f"/leaves/{leave_id}", principal["access_token"], json={"status": "approved"})
        second = api("PUT", f"/leaves/{leave_id}", principal["access_token"], json={"status": "approved"})
        assert first.status_code == 200 and second.status_code in (200, 409)
        after = next(item for item in api("GET", "/teachers", principal["access_token"]).json() if item["id"] == teacher_id)
        assert after["leave_balance"] == original_balance - 1, "Repeated approval deducted leave balance twice"
    finally:
        mongo_db.users.update_one({"id": teacher_id}, {"$set": {"leave_balance": original_balance}})


# Cron endpoint rejects missing/wrong bearer credentials without leaking details.
def test_cron_fee_reminder_rejects_unauthorized():
    missing = api("POST", "/cron/fee-reminders")
    wrong = api("POST", "/cron/fee-reminders", headers={"Authorization": "Bearer wrong"})
    assert missing.status_code == wrong.status_code == 401
    assert missing.json()["detail"] == wrong.json()["detail"] == "Unauthorized"
