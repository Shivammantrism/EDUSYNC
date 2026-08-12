"""Iteration 10 requested coverage: student portal, MCQ security/scoring, notifications, and auth controls."""
import asyncio
import inspect
import re
import sys
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
import server  # noqa: E402

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
BACKEND_ENV = dotenv_values("/app/backend/.env")
CREDS = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
PRINCIPAL_EMAIL = re.search(r"(?im)^- Email:\s*(\S+)", CREDS).group(1)
PRINCIPAL_PASSWORD = re.search(r"(?im)^- Password:\s*(\S+)", CREDS).group(1)
TEACHER_EMAIL, TEACHER_PASSWORD = re.findall(r"(?im)^- (teacher\d+@\S+)\s*/\s*(\S+)", CREDS)[0]
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
    data = login(PRINCIPAL_EMAIL, PRINCIPAL_PASSWORD)
    assert data["user"]["role"] == "principal"
    return data


@pytest.fixture(scope="session")
def teacher():
    data = login(TEACHER_EMAIL, TEACHER_PASSWORD)
    assert data["user"]["role"] == "teacher"
    return data


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(BACKEND_ENV["MONGO_URL"])
    yield client[BACKEND_ENV["DB_NAME"]]
    client.close()


@pytest.fixture(scope="session")
def teacher_batch_student(principal, teacher):
    batches = api("GET", "/batches", teacher["access_token"])
    assert batches.status_code == 200, batches.text
    batch_ids = {row["id"] for row in batches.json()}
    assert batch_ids, "Teacher has no assigned batch"
    students = api("GET", "/students", principal["access_token"])
    assert students.status_code == 200, students.text
    for row in students.json():
        if row.get("batch_id") not in batch_ids:
            continue
        response = api("POST", "/auth/login", json={"identifier": row["student_id"], "password": STUDENT_PASSWORD})
        if response.status_code == 200:
            data = response.json()
            data["record"] = row
            assert data["user"]["role"] == "student"
            return data
    pytest.fail("No student in teacher1's batch accepts the documented student password")


# Student-only AI summary and own report card contract, including cross-student authorization.
def test_student_ai_summary_and_own_report_pdf(principal, teacher, teacher_batch_student):
    student = teacher_batch_student
    summary = api("GET", "/student/ai-summary", student["access_token"])
    assert summary.status_code == 200, summary.text
    data = summary.json()
    assert set(data) == {"attendance_pct", "avg_percentage", "pending_fees", "summary"}
    assert isinstance(data["attendance_pct"], (int, float)) and 0 <= data["attendance_pct"] <= 100
    assert isinstance(data["avg_percentage"], (int, float))
    assert isinstance(data["pending_fees"], (int, float)) and data["pending_fees"] >= 0
    assert isinstance(data["summary"], str) and len(data["summary"].strip()) >= 20
    assert api("GET", "/student/ai-summary", teacher["access_token"]).status_code == 403

    own = api("GET", f"/students/{student['record']['id']}/report", student["access_token"])
    assert own.status_code == 200, own.text
    assert own.headers.get("content-type", "").startswith("application/pdf")
    assert own.content.startswith(b"%PDF") and len(own.content) > 1000

    others = [s for s in api("GET", "/students", principal["access_token"]).json() if s["id"] != student["record"]["id"]]
    assert others
    forbidden = api("GET", f"/students/{others[0]['id']}/report", student["access_token"])
    assert forbidden.status_code == 403


# Full teacher-publish -> student-attempt -> persisted answer review flow with negative marking.
def test_mcq_publish_attempt_view_answers_and_cleanup(teacher, teacher_batch_student, mongo_db):
    student = teacher_batch_student
    marker = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_UI_MCQ_{marker}",
        "batch_id": student["record"]["batch_id"],
        "subject": "QA Mathematics",
        "duration_min": 5,
        "marks_per_correct": 2,
        "negative_marks": 0.5,
        "questions": [
            {"text": "TEST: 2 + 2?", "options": ["3", "4", "5", "6"], "correct": 1},
            {"text": "TEST: 3 + 3?", "options": ["5", "6", "7", "8"], "correct": 1},
            {"text": "TEST: 5 + 5?", "options": ["9", "10", "11", "12"], "correct": 1},
        ],
    }
    created = api("POST", "/quizzes", teacher["access_token"], json=payload)
    assert created.status_code == 200, created.text
    qid = created.json()["id"]
    try:
        listed = next(q for q in api("GET", "/quizzes", student["access_token"]).json() if q["id"] == qid)
        assert listed["my_attempt"] is None and "questions" not in listed
        detail = api("GET", f"/quizzes/{qid}", student["access_token"])
        assert detail.status_code == 200
        assert all("correct" not in q for q in detail.json()["questions"])

        attempted = api("POST", "/quizzes/attempt", student["access_token"], json={"quiz_id": qid, "answers": {"0": 1, "1": 2}})
        assert attempted.status_code == 200, attempted.text
        score = attempted.json()
        assert score["score"] == 1.5 and score["total"] == 6 and score["percentage"] == 25.0
        assert (score["correct"], score["wrong"], score["unattempted"]) == (1, 1, 1)
        assert len(score["review"]) == 3
        assert score["review"][0]["correct"] == 1 and score["review"][0]["selected"] == 1
        assert score["review"][1]["correct"] == 1 and score["review"][1]["selected"] == 2
        assert score["review"][2]["selected"] is None

        relisted = next(q for q in api("GET", "/quizzes", student["access_token"]).json() if q["id"] == qid)
        assert relisted["my_attempt"] == {"score": 1.5, "total": 6.0, "percentage": 25.0}
        reviewed = api("GET", f"/quizzes/{qid}", student["access_token"])
        assert reviewed.status_code == 200
        assert reviewed.json()["my_attempt"]["review"] == score["review"]
        assert api("POST", "/quizzes/attempt", student["access_token"], json={"quiz_id": qid, "answers": {}}).status_code == 400
    finally:
        mongo_db.quiz_attempts.delete_many({"quiz_id": qid})
        mongo_db.quizzes.delete_one({"id": qid})


# A same-institute student cannot fetch or submit a guessed quiz from another batch.
def test_other_batch_quiz_get_and_attempt_are_forbidden(principal, teacher_batch_student, mongo_db):
    student = teacher_batch_student
    batches = api("GET", "/batches", principal["access_token"]).json()
    other = next(row for row in batches if row["id"] != student["record"]["batch_id"])
    created = api("POST", "/quizzes", principal["access_token"], json={
        "name": f"TEST_Private_{uuid.uuid4().hex[:6]}", "batch_id": other["id"], "subject": "QA",
        "duration_min": 5, "marks_per_correct": 1, "negative_marks": 0,
        "questions": [{"text": "Private?", "options": ["A", "B", "C", "D"], "correct": 0}],
    })
    assert created.status_code == 200, created.text
    qid = created.json()["id"]
    try:
        fetched = api("GET", f"/quizzes/{qid}", student["access_token"])
        attempted = api("POST", "/quizzes/attempt", student["access_token"], json={"quiz_id": qid, "answers": {"0": 0}})
        assert fetched.status_code == 403 and "not assigned" in fetched.json()["detail"].lower()
        assert attempted.status_code == 403 and "not assigned" in attempted.json()["detail"].lower()
    finally:
        mongo_db.quiz_attempts.delete_many({"quiz_id": qid})
        mongo_db.quizzes.delete_one({"id": qid})


# WhatsApp addressing and automatic SMS fallback use Twilio's required whatsapp: prefixes.
def test_whatsapp_prefix_and_sms_fallback(monkeypatch):
    calls = []

    class FakeResponse:
        status_code = 201
        text = "ok"

    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC_TEST")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "TOKEN_TEST")
    monkeypatch.setenv("TWILIO_WHATSAPP_FROM", "+14155238886")
    monkeypatch.setattr(server.requests, "post", lambda url, **kwargs: calls.append((url, kwargs)) or FakeResponse())
    assert server.send_whatsapp("9876543210", "TEST body") is True
    sent = calls[0][1]["data"]
    assert sent["From"] == "whatsapp:+14155238886"
    assert sent["To"] == "whatsapp:+919876543210"

    monkeypatch.setattr(server, "send_whatsapp", lambda phone, body: False)
    monkeypatch.setattr(server, "send_sms", lambda phone, body: phone == "9876543210" and body == "TEST fallback")
    assert server.notify_parent("9876543210", "TEST fallback") == "sms"


# Automatic notification hooks cover absent dedupe, result publication, overdue fees, and new homework.
def test_notification_event_hooks_and_absence_dedupe(monkeypatch, mongo_db):
    marker = uuid.uuid4().hex
    iid, bid, sid, exam_id, fee_id = [f"TEST_{name}_{marker}" for name in ("inst", "batch", "student", "exam", "fee")]
    captures = []

    async def fake_notify(phone, body):
        captures.append((phone, body))
        return "sms"

    async def scenario():
        monkeypatch.setattr(server, "notify_parent_async", fake_notify)
        monkeypatch.setattr(server, "notify_parent", lambda phone, body: captures.append((phone, body)) or "sms")
        await server.db.institutes.insert_one({"id": iid, "name": "TEST School"})
        student = {"id": sid, "student_id": f"DP2026{marker[:4]}", "name": "TEST Student", "batch_id": bid,
                   "institute_id": iid, "parent_phone": "9876543210"}
        await server.db.students.insert_one(student)
        user = {"id": "TEST_actor", "name": "TEST Teacher", "role": "teacher", "institute_id": iid}

        await server._mark_student(user, student, bid, "absent")
        await asyncio.sleep(0)
        await server._mark_student(user, student, bid, "absent")
        await asyncio.sleep(0)
        absent_messages = [body for _, body in captures if "marked absent" in body]
        assert len(absent_messages) == 1
        attendance = await server.db.attendance.find_one({"student_id": sid, "date": server.today_str()})
        assert attendance["status"] == "absent" and attendance["parent_notified"] is True

        await server.db.exams.insert_one({"id": exam_id, "name": "TEST Exam", "batch_id": bid, "subject": "QA",
                                           "max_marks": 100, "institute_id": iid})
        await server.enter_results(server.ResultIn(exam_id=exam_id, marks={sid: 88}), user)
        await asyncio.sleep(0)
        assert any("result for TEST Student" in body for _, body in captures)

        await server.db.fees.insert_one({"id": fee_id, "student_id": sid, "student_name": "TEST Student",
                                         "institute_id": iid, "parent_phone": "9876543210", "status": "pending",
                                         "amount": 1000, "paid_amount": 0, "month": "2020-01", "due_date": "2020-01-10"})
        sent = await server._send_overdue(iid)
        assert sent == 1 and any("OVERDUE" in body for _, body in captures)

        before = len(captures)
        homework = await server.create_homework(server.HomeworkIn(
            title="TEST Homework", description="TEST", batch_id=bid, subject="QA", deadline="2099-01-01"
        ), user)
        await asyncio.sleep(0)
        assert homework["id"]
        assert len(captures) == before + 1, "New homework did not notify the parent"
        assert "homework" in captures[-1][1].lower()

    try:
        asyncio.run(scenario())
    finally:
        mongo_db.attendance.delete_many({"student_id": sid})
        mongo_db.results.delete_many({"student_id": sid})
        mongo_db.exams.delete_many({"id": exam_id})
        mongo_db.fees.delete_many({"id": fee_id})
        mongo_db.notifications.delete_many({"institute_id": iid})
        mongo_db.homework.delete_many({"institute_id": iid})
        mongo_db.students.delete_many({"id": sid})
        mongo_db.institutes.delete_many({"id": iid})


# Required authentication playbook controls: bcrypt, idempotent seed update, HttpOnly cookie, explicit credentialed CORS, lockout.
def test_auth_playbook_controls(principal, mongo_db):
    row = mongo_db.users.find_one({"email": PRINCIPAL_EMAIL})
    assert row and row["password_hash"].startswith("$2b$")
    source = Path("/app/backend/server.py").read_text(encoding="utf-8")
    assert 'elif not verify_pw(os.environ["ADMIN_PASSWORD"], admin["password_hash"]):' in source
    assert 'await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_pw(os.environ["ADMIN_PASSWORD"])}})' in source

    identifier = f"TEST_lockout_{uuid.uuid4().hex}@example.test"
    statuses = [api("POST", "/auth/login", json={"identifier": identifier, "password": "wrong"}).status_code for _ in range(6)]
    assert statuses == [401, 401, 401, 401, 401, 429]

    login_response = api("POST", "/auth/login", json={"identifier": TEACHER_EMAIL, "password": TEACHER_PASSWORD})
    assert login_response.status_code == 200
    cookie = login_response.headers.get("set-cookie", "").lower()
    assert "access_token=" in cookie and "httponly" in cookie

    cors = requests.options(f"{BASE_URL}/api/auth/login", headers={
        "Origin": "https://qa.example.test", "Access-Control-Request-Method": "POST"
    }, timeout=30)
    assert cors.status_code in (200, 204)
    assert cors.headers.get("access-control-allow-credentials", "").lower() == "true"
    assert cors.headers.get("access-control-allow-origin") not in (None, "*")
