"""Iteration 8 coverage for timetable scheduling, editable payroll/leave policy, and meetings."""
import calendar
import copy
import uuid
from datetime import datetime, timezone

import jwt
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BACKEND_ENV = dotenv_values("/app/backend/.env")
BASE_URL = FRONTEND_ENV["REACT_APP_BACKEND_URL"].rstrip("/")
INSTITUTE_ID = "42c4f12d-97d3-4879-ad93-50b3dd82bae8"
PRINCIPAL_ID = "0e15e402-2e7c-40e3-9136-02abd876f7e3"
ANITA_ID = "d6db3fbe-ed15-4232-8e3a-57ee6d31d886"
STUDENT_ID = "cc9251f5-8aa8-42d1-b855-914d5031d20a"
CLASS_8A = "db7289fe-dac8-4a7f-aebb-bc2efe580839"


def token(user_id, role):
    payload = {
        "sub": user_id,
        "role": role,
        "institute_id": INSTITUTE_ID,
        "type": "access",
        "exp": datetime.now(timezone.utc).timestamp() + 7200,
    }
    return jwt.encode(payload, BACKEND_ENV["JWT_SECRET"], algorithm="HS256")


TOKENS = {
    "principal": token(PRINCIPAL_ID, "principal"),
    "teacher": token(ANITA_ID, "teacher"),
    "student": token(STUDENT_ID, "student"),
}


def api(method, path, role="principal", **kwargs):
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {TOKENS[role]}"
    return requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=180, **kwargs)


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(BACKEND_ENV["MONGO_URL"])
    yield client[BACKEND_ENV["DB_NAME"]]
    client.close()


@pytest.fixture
def preserve_timetable(mongo_db):
    query = {"institute_id": INSTITUTE_ID}
    saved_rows = list(mongo_db.timetable.find(query))
    saved_config = mongo_db.tt_config.find_one(query)
    yield
    mongo_db.timetable.delete_many(query)
    if saved_rows:
        mongo_db.timetable.insert_many(saved_rows)
    mongo_db.tt_config.delete_many(query)
    if saved_config:
        mongo_db.tt_config.insert_one(saved_config)


@pytest.fixture
def preserve_quota(mongo_db):
    institute = mongo_db.institutes.find_one({"id": INSTITUTE_ID}) or {}
    existed = "leave_quota" in institute
    original = institute.get("leave_quota")
    yield
    if existed:
        mongo_db.institutes.update_one({"id": INSTITUTE_ID}, {"$set": {"leave_quota": original}})
    else:
        mongo_db.institutes.update_one({"id": INSTITUTE_ID}, {"$unset": {"leave_quota": ""}})


# Timetable setup must persist custom days, periods/breaks, class subjects, and generate clash-free rows.
def test_timetable_config_generate_break_and_persistence(preserve_timetable):
    teachers = api("GET", "/teachers").json()
    batches = api("GET", "/batches").json()
    assert teachers and batches
    class_subjects = {
        batch["id"]: [{"subject": f"TEST_Subject_{index}", "teacher_id": teachers[index % len(teachers)]["id"]}]
        for index, batch in enumerate(batches)
    }
    config = {
        "days": ["Monday", "Tuesday"],
        "periods": [
            {"label": "08:10-08:50", "is_break": False},
            {"label": "TEST Lunch", "is_break": True},
            {"label": "09:10-09:50", "is_break": False},
        ],
        "class_subjects": class_subjects,
        "use_ai": False,
    }
    saved = api("POST", "/timetable/config", json=config)
    assert saved.status_code == 200, saved.text
    assert saved.json()["days"] == config["days"]
    fetched = api("GET", "/timetable/config")
    assert fetched.status_code == 200 and fetched.json()["periods"] == config["periods"]
    assert fetched.json()["class_subjects"] == class_subjects

    generated = api("POST", "/timetable/generate", json=config)
    assert generated.status_code == 200, generated.text
    result = generated.json()
    assert result["ok"] is True and result["count"] > 0
    rows = api("GET", "/timetable").json()
    breaks = [row for row in rows if row.get("is_break")]
    assert len(breaks) == len(batches) * 2
    assert all(row["slot"] == "TEST Lunch" and row["subject"] == "TEST Lunch" for row in breaks)
    teacher_keys = [(row["day"], row["slot"], row["teacher_id"]) for row in rows if row.get("teacher_id")]
    assert len(teacher_keys) == len(set(teacher_keys)), "Generated timetable double-books a teacher"
    assert result["count"] == len([row for row in rows if not row.get("is_break")])


# Manual principal edits must persist and clearing both subject and teacher must remove the slot.
def test_timetable_manual_cell_edit_update_delete_and_rbac(mongo_db):
    marker = uuid.uuid4().hex[:8]
    day, slot = "Saturday", f"TEST-{marker}"
    payload = {"batch_id": CLASS_8A, "day": day, "slot": slot, "subject": "TEST Robotics", "teacher_id": ANITA_ID, "room": "QA Lab"}
    try:
        created = api("PUT", "/timetable/cell", json=payload)
        assert created.status_code == 200, created.text
        assert created.json()["subject"] == "TEST Robotics" and created.json()["teacher_name"] == "Anita Sharma"
        rows = api("GET", "/timetable", params={"batch_id": CLASS_8A}).json()
        assert any(row["day"] == day and row["slot"] == slot and row["room"] == "QA Lab" for row in rows)
        forbidden = api("PUT", "/timetable/cell", role="teacher", json=payload)
        assert forbidden.status_code == 403
        cleared = api("PUT", "/timetable/cell", json={**payload, "subject": "", "teacher_id": ""})
        assert cleared.status_code == 200 and cleared.json() == {"ok": True, "deleted": True}
        rows = api("GET", "/timetable", params={"batch_id": CLASS_8A}).json()
        assert not any(row["day"] == day and row["slot"] == slot for row in rows)
    finally:
        mongo_db.timetable.delete_many({"institute_id": INSTITUTE_ID, "day": day, "slot": slot})


# Teacher and student views/PDFs must be role-scoped, including a teacher's classes across batches.
def test_timetable_teacher_student_scope_and_pdfs(mongo_db):
    batches = api("GET", "/batches").json()
    other_batch = next(batch for batch in batches if batch["id"] != CLASS_8A)
    marker = uuid.uuid4().hex[:8]
    slots = [f"TEST-A-{marker}", f"TEST-B-{marker}"]
    try:
        for batch_id, day, slot in ((CLASS_8A, "Monday", slots[0]), (other_batch["id"], "Tuesday", slots[1])):
            response = api("PUT", "/timetable/cell", json={"batch_id": batch_id, "day": day, "slot": slot, "subject": "TEST Scope", "teacher_id": ANITA_ID, "room": ""})
            assert response.status_code == 200, response.text
        teacher_rows = api("GET", "/timetable", role="teacher")
        assert teacher_rows.status_code == 200
        scoped = [row for row in teacher_rows.json() if row["slot"] in slots]
        assert {row["batch_id"] for row in scoped} == {CLASS_8A, other_batch["id"]}
        assert all(row["teacher_id"] == ANITA_ID for row in teacher_rows.json())

        student = mongo_db.students.find_one({"id": STUDENT_ID})
        assert student and student.get("batch_id")
        student_rows = api("GET", "/timetable", role="student")
        assert student_rows.status_code == 200
        assert all(row["batch_id"] == student["batch_id"] for row in student_rows.json())
        for role in ("teacher", "student"):
            pdf = api("GET", "/timetable/pdf", role=role)
            assert pdf.status_code == 200, pdf.text[:300]
            assert pdf.headers.get("content-type", "").startswith("application/pdf")
            assert pdf.content.startswith(b"%PDF") and len(pdf.content) > 1000
    finally:
        mongo_db.timetable.delete_many({"institute_id": INSTITUTE_ID, "slot": {"$in": slots}})


# Leave policy must persist and reject impossible negative quotas.
def test_leave_quota_persistence_and_validation(preserve_quota):
    saved = api("PUT", "/institute", json={"leave_quota": 3})
    assert saved.status_code == 200 and saved.json()["leave_quota"] == 3
    fetched = api("GET", "/institute")
    assert fetched.status_code == 200 and fetched.json()["leave_quota"] == 3
    invalid = api("PUT", "/institute", json={"leave_quota": -1})
    assert invalid.status_code in (400, 422), invalid.text


# Approved excess leave must calculate a draft; edits recompute net, paid slips lock and render as PDF.
def test_salary_approved_leave_edit_pay_lock_and_slip(mongo_db, preserve_quota):
    month = "2094-02"
    leave_id = f"TEST-approved-{uuid.uuid4()}"
    salary_id = None
    teacher = mongo_db.users.find_one({"id": ANITA_ID})
    gross_source = float(teacher.get("monthly_salary") or 0)
    if gross_source <= 0:
        comp = teacher.get("salary_components") or {}
        gross_source = float(comp.get("base", 0)) + float(comp.get("hra", 0)) + float(comp.get("allowances", 0))
    assert gross_source > 0
    mongo_db.salaries.delete_many({"teacher_id": ANITA_ID, "month": month, "institute_id": INSTITUTE_ID})
    mongo_db.leaves.insert_one({"id": leave_id, "teacher_id": ANITA_ID, "institute_id": INSTITUTE_ID, "status": "approved", "from_date": "2094-02-01", "to_date": "2094-02-03"})
    try:
        assert api("PUT", "/institute", json={"leave_quota": 1}).status_code == 200
        created = api("POST", "/salaries", json={"teacher_id": ANITA_ID, "month": month})
        assert created.status_code == 200, created.text
        salary = created.json()
        salary_id = salary["id"]
        expected_lwp = round(gross_source / calendar.monthrange(2094, 2)[1] * 2, 2)
        assert salary["status"] == "pending" and salary["lwp_days"] == 2
        assert salary["lwp_amount"] == pytest.approx(expected_lwp, abs=0.01)

        patch = {"base": 30000, "hra": 5000, "allowances": 2500, "lwp_amount": 900, "extra_allowance": 1200, "extra_deductions": 300, "note": "TEST payroll adjustment"}
        adjusted = api("PATCH", f"/salaries/{salary_id}", json=patch)
        assert adjusted.status_code == 200, adjusted.text
        row = adjusted.json()
        expected_net = round(37500 + 1200 - (row["epf"] + row["professional_tax"] + row["tds"] + 300 + 900), 2)
        assert row["gross"] == 37500 and row["amount"] == pytest.approx(expected_net, abs=0.01)
        assert row["adjust_note"] == patch["note"]
        listed = next(item for item in api("GET", "/salaries").json() if item["id"] == salary_id)
        assert listed["amount"] == pytest.approx(expected_net, abs=0.01)

        paid = api("PUT", f"/salaries/{salary_id}/pay")
        assert paid.status_code == 200 and paid.json()["slip_no"].startswith("SAL-")
        locked = api("PATCH", f"/salaries/{salary_id}", json={"base": 1})
        assert locked.status_code == 400 and "paid" in locked.json()["detail"].lower()
        pdf = api("GET", f"/salaries/{salary_id}/slip")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF") and len(pdf.content) > 1000
    finally:
        mongo_db.leaves.delete_one({"id": leave_id})
        if salary_id:
            mongo_db.salaries.delete_one({"id": salary_id})


# Rejected leave is not absence and must not reduce a teacher's salary.
def test_salary_rejected_leave_does_not_cut_pay(mongo_db, preserve_quota):
    month = "2094-03"
    leave_id = f"TEST-rejected-{uuid.uuid4()}"
    salary_id = None
    mongo_db.salaries.delete_many({"teacher_id": ANITA_ID, "month": month, "institute_id": INSTITUTE_ID})
    mongo_db.leaves.insert_one({"id": leave_id, "teacher_id": ANITA_ID, "institute_id": INSTITUTE_ID, "status": "rejected", "from_date": "2094-03-01", "to_date": "2094-03-03"})
    try:
        assert api("PUT", "/institute", json={"leave_quota": 0}).status_code == 200
        created = api("POST", "/salaries", json={"teacher_id": ANITA_ID, "month": month})
        assert created.status_code == 200, created.text
        salary = created.json()
        salary_id = salary["id"]
        assert salary["total_absence_days"] == 0
        assert salary["lwp_days"] == 0 and salary["lwp_amount"] == 0
    finally:
        mongo_db.leaves.delete_one({"id": leave_id})
        if salary_id:
            mongo_db.salaries.delete_one({"id": salary_id})


# Meeting lifecycle must scope invitations, update confirmations, forbid uninvited responses, and delete cleanly.
def test_meeting_create_teacher_response_confirmation_delete_and_rbac(mongo_db):
    teachers = api("GET", "/teachers").json()
    other = next(row for row in teachers if row["id"] != ANITA_ID)
    other_token = token(other["id"], "teacher")
    title = f"TEST Meeting {uuid.uuid4().hex[:8]}"
    meeting_id = None
    try:
        created = api("POST", "/meetings", json={"title": title, "date": "2094-04-20", "time": "14:30", "agenda": "TEST availability", "teacher_ids": [ANITA_ID]})
        assert created.status_code == 200, created.text
        meeting = created.json()
        meeting_id = meeting["id"]
        assert meeting["title"] == title and "_id" not in meeting

        teacher_list = api("GET", "/meetings", role="teacher")
        assert teacher_list.status_code == 200
        own = next(row for row in teacher_list.json() if row["id"] == meeting_id)
        assert own["my_response"]["status"] == "pending"
        other_list = requests.get(f"{BASE_URL}/api/meetings", headers={"Authorization": f"Bearer {other_token}"}, timeout=60)
        assert other_list.status_code == 200 and all(row["id"] != meeting_id for row in other_list.json())

        uninvited = requests.post(f"{BASE_URL}/api/meetings/{meeting_id}/respond", headers={"Authorization": f"Bearer {other_token}"}, json={"status": "available"}, timeout=60)
        assert uninvited.status_code == 403, uninvited.text
        response = api("POST", f"/meetings/{meeting_id}/respond", role="teacher", json={"status": "available"})
        assert response.status_code == 200 and response.json() == {"ok": True}
        refreshed = next(row for row in api("GET", "/meetings", role="teacher").json() if row["id"] == meeting_id)
        assert refreshed["my_response"]["status"] == "available"
        principal_view = next(row for row in api("GET", "/meetings").json() if row["id"] == meeting_id)
        assert principal_view["invited_count"] == 1
        assert principal_view["confirmations"] == pytest.approx(principal_view["confirmations"])
        confirmation = principal_view["confirmations"][0]
        assert confirmation["teacher_id"] == ANITA_ID and confirmation["status"] == "available"

        deleted = api("DELETE", f"/meetings/{meeting_id}")
        assert deleted.status_code == 200 and deleted.json() == {"ok": True}
        meeting_id = None
        assert all(row["title"] != title for row in api("GET", "/meetings").json())
    finally:
        if meeting_id:
            mongo_db.meetings.delete_one({"id": meeting_id})
