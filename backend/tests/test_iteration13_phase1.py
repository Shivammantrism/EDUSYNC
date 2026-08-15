"""Phase 1 class freedom, privacy, roster assignment, and homework API tests."""
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
HIDDEN = {"parent_phone", "parent_email", "phone", "emergency_contact", "address", "email", "monthly_fee"}


def api(method, path, token, **kwargs):
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=90, **kwargs)


@pytest.fixture(scope="session")
def database():
    client = MongoClient(BACKEND_ENV["MONGO_URL"])
    db = client[BACKEND_ENV["DB_NAME"]]
    yield db
    client.close()


@pytest.fixture(scope="session")
def identities(database):
    principal = database.users.find_one({"institute_id": INSTITUTE_ID, "role": "principal"})
    teacher = database.users.find_one({"institute_id": INSTITUTE_ID, "role": "teacher"})
    student = database.students.find_one({"institute_id": INSTITUTE_ID, "batch_id": {"$nin": [None, ""]}})
    assert principal and teacher and student
    return {"principal": principal, "teacher": teacher, "student": student}


def token_for(doc, role):
    return jwt.encode(
        {"sub": doc["id"], "role": role, "institute_id": doc["institute_id"], "type": "access"},
        BACKEND_ENV["JWT_SECRET"], algorithm="HS256"
    )


@pytest.fixture(scope="session")
def tokens(identities):
    return {role: token_for(identities[role], role) for role in ("principal", "teacher", "student")}


@pytest.fixture
def cleanup(database):
    state = {"batch_ids": [], "homework_ids": [], "restore_students": {}}
    yield state
    if state["batch_ids"]:
        database.batches.delete_many({"id": {"$in": state["batch_ids"]}})
    if state["homework_ids"]:
        database.homework.delete_many({"id": {"$in": state["homework_ids"]}})
    for sid, batch_id in state["restore_students"].items():
        database.students.update_one({"id": sid}, {"$set": {"batch_id": batch_id}})


# Principal class list enrichment and optional section CRUD persistence.
def test_principal_batch_list_and_optional_section_create_update(tokens, cleanup):
    token = tokens["principal"]
    initial = api("GET", "/batches", token)
    assert initial.status_code == 200, initial.text
    rows = initial.json()
    assert isinstance(rows, list) and rows
    assert all(isinstance(row.get("student_count"), int) for row in rows)
    assert all(isinstance(row.get("teacher_name"), str) for row in rows)

    marker = uuid.uuid4().hex[:8]
    no_section_payload = {
        "name": f"TEST_Phase1_NoSection_{marker}", "subject": "QA", "teacher_id": "",
        "room": "QA-1", "class_name": "11th", "section": "", "schedule_days": ["Monday"]
    }
    created = api("POST", "/batches", token, json=no_section_payload)
    assert created.status_code == 200, created.text
    no_section = created.json()
    cleanup["batch_ids"].append(no_section["id"])
    assert no_section["section"] == "" and no_section["class_name"] == "11th"

    with_section_payload = {**no_section_payload, "name": f"TEST_Phase1_Section_{marker}", "section": "A"}
    created_two = api("POST", "/batches", token, json=with_section_payload)
    assert created_two.status_code == 200, created_two.text
    with_section = created_two.json()
    cleanup["batch_ids"].append(with_section["id"])
    assert with_section["section"] == "A"

    update_payload = {**with_section_payload, "name": f"TEST_Phase1_Edited_{marker}", "section": "B", "room": "QA-2"}
    updated = api("PUT", f"/batches/{with_section['id']}", token, json=update_payload)
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == update_payload["name"] and updated.json()["section"] == "B"
    persisted = api("GET", "/batches", token).json()
    assert any(row["id"] == with_section["id"] and row["name"] == update_payload["name"] and row["section"] == "B" for row in persisted)


# Principal can assign students from the global list and roster/count refreshes.
def test_principal_assign_students_and_roster_refresh(tokens, database, cleanup):
    token = tokens["principal"]
    marker = uuid.uuid4().hex[:8]
    batch_payload = {
        "name": f"TEST_Phase1_Assign_{marker}", "subject": "QA", "teacher_id": "",
        "room": "QA-3", "class_name": "12th", "section": "", "schedule_days": []
    }
    created = api("POST", "/batches", token, json=batch_payload)
    assert created.status_code == 200, created.text
    bid = created.json()["id"]
    cleanup["batch_ids"].append(bid)

    candidates = api("GET", "/students", token).json()
    selected = candidates[:2]
    assert len(selected) == 2
    for student in selected:
        cleanup["restore_students"][student["id"]] = student.get("batch_id", "")

    assigned = api("POST", f"/batches/{bid}/assign", token, json={"student_ids": [s["id"] for s in selected]})
    assert assigned.status_code == 200, assigned.text
    assert assigned.json().get("moved") == 2
    roster = api("GET", f"/batches/{bid}/students", token)
    assert roster.status_code == 200, roster.text
    assert {s["id"] for s in roster.json()} == {s["id"] for s in selected}
    listed = api("GET", "/batches", token).json()
    assert next(row for row in listed if row["id"] == bid)["student_count"] == 2


# Assignment remains principal-only and must reject a non-existent target before mutating a student.
def test_assign_students_authorization_and_invalid_target_safety(tokens, database, cleanup):
    student = database.students.find_one({"institute_id": INSTITUTE_ID})
    assert student
    sid = student["id"]
    original_batch_id = student.get("batch_id", "")
    cleanup["restore_students"][sid] = original_batch_id

    teacher_attempt = api("POST", f"/batches/{uuid.uuid4()}/assign", tokens["teacher"], json={"student_ids": [sid]})
    assert teacher_attempt.status_code == 403, teacher_attempt.text
    assert database.students.find_one({"id": sid}).get("batch_id", "") == original_batch_id

    missing_bid = str(uuid.uuid4())
    principal_attempt = api("POST", f"/batches/{missing_bid}/assign", tokens["principal"], json={"student_ids": [sid]})
    assert principal_attempt.status_code == 404, principal_attempt.text
    assert database.students.find_one({"id": sid}).get("batch_id", "") == original_batch_id


# Teacher global student visibility must redact every principal-only field.
def test_teacher_sees_all_students_without_contact_or_fee_fields(tokens, database):
    response = api("GET", "/students", tokens["teacher"])
    assert response.status_code == 200, response.text
    rows = response.json()
    expected = database.students.count_documents({"institute_id": INSTITUTE_ID})
    assert len(rows) == expected and expected > 0
    leaks = [{"id": row.get("id"), "fields": sorted(HIDDEN.intersection(row))} for row in rows if HIDDEN.intersection(row)]
    assert not leaks, f"Principal-only fields leaked from /students: {leaks[:3]}"


# Teacher global classes include a boolean i_teach marker on every row.
def test_teacher_sees_all_batches_with_boolean_i_teach(tokens, database):
    response = api("GET", "/batches", tokens["teacher"])
    assert response.status_code == 200, response.text
    rows = response.json()
    expected = database.batches.count_documents({"institute_id": INSTITUTE_ID})
    assert len(rows) == expected and expected > 1
    assert all(isinstance(row.get("i_teach"), bool) for row in rows)


# Read-only teacher class page requires roster access on classes they do not teach, without PII leakage.
def test_teacher_can_view_non_taught_batch_roster_without_sensitive_fields(tokens, identities):
    batches = api("GET", "/batches", tokens["teacher"]).json()
    target = next((row for row in batches if not row["i_teach"] and row["student_count"] > 0), None)
    if target is None:
        pytest.skip("No populated non-taught batch is available")
    response = api("GET", f"/batches/{target['id']}/students", tokens["teacher"])
    assert response.status_code == 200, response.text
    rows = response.json()
    assert rows
    assert all(not HIDDEN.intersection(row) for row in rows)


# Principal-only contact/fee fields must also be redacted from teacher detail and roster APIs.
def test_teacher_student_detail_does_not_leak_sensitive_fields(tokens, identities):
    response = api("GET", f"/students/{identities['student']['id']}", tokens["teacher"])
    assert response.status_code == 200, response.text
    leaked = HIDDEN.intersection(response.json())
    assert not leaked, f"Principal-only fields leaked from student detail: {sorted(leaked)}"


def test_teacher_taught_batch_roster_does_not_leak_sensitive_fields(tokens):
    batches = api("GET", "/batches", tokens["teacher"]).json()
    target = next((row for row in batches if row["i_teach"] and row["student_count"] > 0), None)
    if target is None:
        pytest.skip("No populated taught batch is available")
    response = api("GET", f"/batches/{target['id']}/students", tokens["teacher"])
    assert response.status_code == 200, response.text
    leaks = [sorted(HIDDEN.intersection(row)) for row in response.json() if HIDDEN.intersection(row)]
    assert not leaks, f"Principal-only fields leaked from batch roster: {leaks[:3]}"


# Teachers see all homework and can assign work to a class they do not teach.
def test_teacher_homework_all_and_create_for_non_taught_class(tokens, database, cleanup):
    token = tokens["teacher"]
    batches = api("GET", "/batches", token).json()
    target = next(row for row in batches if not row["i_teach"])
    before = api("GET", "/homework", token)
    assert before.status_code == 200, before.text
    assert len(before.json()) == database.homework.count_documents({"institute_id": INSTITUTE_ID})
    marker = uuid.uuid4().hex[:8]
    payload = {
        "title": f"TEST_Phase1_HW_{marker}", "description": "Teacher freedom regression",
        "batch_id": target["id"], "subject": target.get("subject", "QA"), "deadline": "2099-12-31"
    }
    created = api("POST", "/homework", token, json=payload)
    assert created.status_code == 200, created.text
    homework = created.json()
    cleanup["homework_ids"].append(homework["id"])
    assert homework["batch_id"] == target["id"] and homework["title"] == payload["title"]
    after = api("GET", "/homework", token).json()
    assert any(item["id"] == homework["id"] for item in after)


# Student class list remains scoped to exactly their own class.
def test_student_batches_only_own_class(tokens, identities):
    response = api("GET", "/batches", tokens["student"])
    assert response.status_code == 200, response.text
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["id"] == identities["student"]["batch_id"]
