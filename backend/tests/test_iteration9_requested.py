"""Requested feature coverage for insights, MCQ tests, homework PDFs, report remarks, and auth controls."""
import io
import re
import uuid
from pathlib import Path

import pymupdf
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

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
    auth = login(PRINCIPAL_EMAIL, PRINCIPAL_PASSWORD)
    assert auth["user"]["role"] == "principal"
    return auth


@pytest.fixture(scope="session")
def teacher():
    auth = login(TEACHER_EMAIL, TEACHER_PASSWORD)
    assert auth["user"]["role"] == "teacher"
    return auth


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(BACKEND_ENV["MONGO_URL"])
    yield client[BACKEND_ENV["DB_NAME"]]
    client.close()


@pytest.fixture(scope="session")
def student(principal):
    rows = api("GET", "/students", principal["access_token"]).json()
    assert rows
    for row in rows:
        response = api("POST", "/auth/login", json={"identifier": row["student_id"], "password": STUDENT_PASSWORD})
        if response.status_code == 200 and row.get("batch_id"):
            auth = response.json()
            auth["record"] = row
            assert auth["user"]["role"] == "student"
            return auth
    pytest.fail("No batched student accepts the documented password")


# Four live insight buckets must expose labels, counts, student details, and principal-only access.
def test_insights_four_bucket_contract_counts_and_rbac(principal, teacher):
    response = api("GET", "/dashboard/insights", principal["access_token"])
    assert response.status_code == 200, response.text
    data = response.json()
    assert set(data) == {"red", "orange", "yellow", "green"}
    expected_labels = {
        "red": "Low Attendance (<75%)",
        "orange": "Fee Overdue (>30 days)",
        "yellow": "Declining Performance",
        "green": "Top Performers",
    }
    for key, label in expected_labels.items():
        bucket = data[key]
        assert bucket["label"] == label
        assert isinstance(bucket["count"], int) and bucket["count"] == len(bucket["students"])
        for row in bucket["students"]:
            assert all(isinstance(row.get(field), str) for field in ("name", "student_id", "detail"))
    assert data["red"]["count"] == 3
    assert data["orange"]["count"] == 15
    assert api("GET", "/dashboard/insights", teacher["access_token"]).status_code == 403


# Low-attendance parent notification returns a usable success payload even when SMS is not configured.
def test_low_attendance_parent_notification(principal, teacher):
    response = api("POST", "/insights/notify-parents", principal["access_token"])
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["ok"] is True
    assert isinstance(data["sent"], int) and isinstance(data["skipped"], int)
    assert data["sent"] + data["skipped"] == 3
    assert api("POST", "/insights/notify-parents", teacher["access_token"]).status_code == 403


# Full MCQ lifecycle: publish, scoped student view, negative marking, review, no retry, and analytics.
def test_quiz_publish_attempt_negative_marking_results_and_cleanup(principal, student, mongo_db):
    marker = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_MCQ {marker}",
        "batch_id": student["record"]["batch_id"],
        "subject": "QA Mathematics",
        "duration_min": 5,
        "marks_per_correct": 1,
        "negative_marks": 0.25,
        "questions": [
            {"text": "TEST 2 + 2?", "options": ["3", "4", "5", "6"], "correct": 1},
            {"text": "TEST 3 + 3?", "options": ["6", "7", "8", "9"], "correct": 0},
        ],
    }
    created = api("POST", "/quizzes", principal["access_token"], json=payload)
    assert created.status_code == 200, created.text
    quiz = created.json()
    qid = quiz["id"]
    try:
        staff_list = api("GET", "/quizzes", principal["access_token"]).json()
        assert any(q["id"] == qid and q["question_count"] == 2 and q["total_marks"] == 2 for q in staff_list)
        student_list = api("GET", "/quizzes", student["access_token"]).json()
        listed = next(q for q in student_list if q["id"] == qid)
        assert "questions" not in listed and listed["my_attempt"] is None

        detail = api("GET", f"/quizzes/{qid}", student["access_token"])
        assert detail.status_code == 200, detail.text
        assert all("correct" not in q for q in detail.json()["questions"])

        attempted = api("POST", "/quizzes/attempt", student["access_token"], json={"quiz_id": qid, "answers": {"0": 1, "1": 2}})
        assert attempted.status_code == 200, attempted.text
        score = attempted.json()
        assert score["score"] == 0.75 and score["total"] == 2 and score["percentage"] == 37.5
        assert (score["correct"], score["wrong"], score["unattempted"]) == (1, 1, 0)
        assert score["review"][0]["selected"] == 1 and score["review"][0]["correct"] == 1
        assert score["review"][1]["selected"] == 2 and score["review"][1]["correct"] == 0

        retried = api("POST", "/quizzes/attempt", student["access_token"], json={"quiz_id": qid, "answers": {}})
        assert retried.status_code == 400 and "already attempted" in retried.json()["detail"].lower()
        relisted = next(q for q in api("GET", "/quizzes", student["access_token"]).json() if q["id"] == qid)
        assert relisted["my_attempt"] == {"score": 0.75, "total": 2.0, "percentage": 37.5}

        results = api("GET", f"/quizzes/{qid}/results", principal["access_token"])
        assert results.status_code == 200, results.text
        result = results.json()
        assert result["analytics"] == {"attempts": 1, "avg_percentage": 37.5, "highest": 37.5, "lowest": 37.5, "pass_count": 0}
        assert result["attempts"][0]["student_id"] == student["record"]["id"]
    finally:
        mongo_db.quiz_attempts.delete_many({"quiz_id": qid})
        mongo_db.quizzes.delete_one({"id": qid})


# AI generation may succeed or return its documented manual-flow fallback error.
def test_ai_quiz_generation_contract(principal):
    response = api("POST", "/quizzes/ai-generate", principal["access_token"], json={"topic": "Fractions", "count": 3, "subject": "Mathematics"})
    assert response.status_code in (200, 500), response.text
    if response.status_code == 500:
        assert "Could not generate questions" in response.json()["detail"]
    else:
        questions = response.json()["questions"]
        assert len(questions) >= 1
        for question in questions:
            assert isinstance(question["text"], str) and question["text"].strip()
            assert len(question["options"]) == 4
            assert question["correct"] in range(4)


# Quiz configuration must reject values that make timing or scoring invalid.
def test_quiz_rejects_invalid_duration_marks_options_and_correct_index(principal):
    invalid = {
        "name": "TEST_Invalid Quiz",
        "batch_id": "TEST_batch",
        "duration_min": 0,
        "marks_per_correct": -1,
        "negative_marks": -2,
        "questions": [{"text": "Broken", "options": ["only one"], "correct": 8}],
    }
    response = api("POST", "/quizzes", principal["access_token"], json=invalid)
    if response.status_code == 200:
        api("DELETE", f"/quizzes/{response.json()['id']}", principal["access_token"])
    assert response.status_code == 422, response.text


# A student must not fetch or attempt a same-institute test assigned to another batch by guessing its ID.
def test_student_cannot_access_other_batch_quiz(principal, student, mongo_db):
    batches = api("GET", "/batches", principal["access_token"]).json()
    other_batch = next(b for b in batches if b["id"] != student["record"]["batch_id"])
    created = api("POST", "/quizzes", principal["access_token"], json={
        "name": f"TEST_Other Batch {uuid.uuid4().hex[:6]}", "batch_id": other_batch["id"], "duration_min": 5,
        "marks_per_correct": 1, "negative_marks": 0,
        "questions": [{"text": "Private?", "options": ["A", "B", "C", "D"], "correct": 0}],
    })
    assert created.status_code == 200, created.text
    qid = created.json()["id"]
    try:
        assert api("GET", f"/quizzes/{qid}", student["access_token"]).status_code == 403
        assert api("POST", "/quizzes/attempt", student["access_token"], json={"quiz_id": qid, "answers": {"0": 0}}).status_code == 403
    finally:
        mongo_db.quiz_attempts.delete_many({"quiz_id": qid})
        mongo_db.quizzes.delete_one({"id": qid})


# Homework supports an attached PDF plus a student note/PDF submission and reviewed state.
def test_homework_pdf_note_submission_review_and_cleanup(principal, student, mongo_db):
    marker = uuid.uuid4().hex[:8]
    pdf_bytes = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n"
    assignment_upload = api("POST", "/upload", principal["access_token"], files={"file": (f"TEST_assignment_{marker}.pdf", pdf_bytes, "application/pdf")})
    assert assignment_upload.status_code == 200, assignment_upload.text
    au = assignment_upload.json()
    created = api("POST", "/homework", principal["access_token"], json={
        "title": f"TEST_PDF Homework {marker}", "description": "TEST attachment flow",
        "batch_id": student["record"]["batch_id"], "subject": "QA", "deadline": "2099-01-20",
        "attachment_url": au["url"], "attachment_name": au["filename"],
    })
    assert created.status_code == 200, created.text
    homework = created.json()
    submission_upload = None
    submission = None
    try:
        listed = next(h for h in api("GET", "/homework", student["access_token"]).json() if h["id"] == homework["id"])
        assert listed["attachment_url"] == au["url"] and listed["attachment_name"] == au["filename"]
        attachment = requests.get(f"{BASE_URL}{au['url']}", timeout=60)
        assert attachment.status_code == 200 and attachment.content.startswith(b"%PDF")

        su_response = api("POST", "/upload", student["access_token"], files={"file": (f"TEST_submission_{marker}.pdf", pdf_bytes, "application/pdf")})
        assert su_response.status_code == 200, su_response.text
        submission_upload = su_response.json()
        submitted = api("POST", "/homework/submit", student["access_token"], json={
            "homework_id": homework["id"], "content": "TEST student note with PDF",
            "attachment_url": submission_upload["url"], "attachment_name": submission_upload["filename"],
        })
        assert submitted.status_code == 200, submitted.text
        submission = submitted.json()
        assert submission["status"] == "submitted" and submission["content"] == "TEST student note with PDF"
        assert submission["attachment_url"] == submission_upload["url"]

        rows = api("GET", f"/homework/{homework['id']}/submissions", principal["access_token"])
        assert rows.status_code == 200 and any(s["id"] == submission["id"] for s in rows.json())
        reviewed = api("PUT", f"/submissions/{submission['id']}/complete", principal["access_token"])
        assert reviewed.status_code == 200 and reviewed.json()["ok"] is True
        persisted = next(s for s in api("GET", f"/homework/{homework['id']}/submissions", principal["access_token"]).json() if s["id"] == submission["id"])
        assert persisted["status"] == "completed" and persisted["reviewed_at"]
    finally:
        mongo_db.submissions.delete_many({"homework_id": homework["id"]})
        mongo_db.homework.delete_one({"id": homework["id"]})
        paths = [au.get("path")]
        if submission_upload:
            paths.append(submission_upload.get("path"))
        mongo_db.files.delete_many({"storage_path": {"$in": [p for p in paths if p]}})


# Both submission channels are optional individually, but at least one must be supplied.
def test_homework_rejects_empty_submission(student, mongo_db):
    response = api("POST", "/homework/submit", student["access_token"], json={"homework_id": "TEST_nonexistent", "content": "", "attachment_url": "", "attachment_name": ""})
    if response.status_code == 200:
        mongo_db.submissions.delete_many({"homework_id": "TEST_nonexistent", "student_id": student["record"]["id"]})
    assert response.status_code == 422, response.text


# Remarks must persist and be rendered as a named section in the generated report PDF.
def test_report_card_remarks_persist_and_render_in_pdf(principal, student):
    sid = student["record"]["id"]
    before = api("GET", f"/students/{sid}", principal["access_token"])
    assert before.status_code == 200
    original = before.json().get("remarks", "")
    marker = f"TEST Remark {uuid.uuid4().hex[:8]}: Excellent progress in fractions."
    try:
        saved = api("PUT", f"/students/{sid}/remarks", principal["access_token"], json={"remarks": marker})
        assert saved.status_code == 200 and saved.json()["ok"] is True
        fetched = api("GET", f"/students/{sid}", principal["access_token"])
        assert fetched.status_code == 200 and fetched.json()["remarks"] == marker
        report = api("GET", f"/students/{sid}/report", principal["access_token"])
        assert report.status_code == 200 and report.headers["content-type"].startswith("application/pdf")
        assert report.content.startswith(b"%PDF")
        document = pymupdf.open(stream=report.content, filetype="pdf")
        text = "\n".join(page.get_text() for page in document)
        assert "Teacher's Remarks" in text and marker in text
    finally:
        api("PUT", f"/students/{sid}/remarks", principal["access_token"], json={"remarks": original})


# Seeded admin password hash and idempotent seed-update implementation follow the auth playbook.
def test_bcrypt_hash_and_seed_password_update_logic(principal, mongo_db):
    row = mongo_db.users.find_one({"email": PRINCIPAL_EMAIL})
    assert row and row["password_hash"].startswith("$2b$")
    source = Path("/app/backend/server.py").read_text(encoding="utf-8")
    assert 'elif not verify_pw(os.environ["ADMIN_PASSWORD"], admin["password_hash"]):' in source
    assert 'await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_pw(os.environ["ADMIN_PASSWORD"])}})' in source


# Successful login must set the required application HttpOnly access token cookie.
def test_login_sets_application_httponly_cookie():
    response = api("POST", "/auth/login", json={"identifier": TEACHER_EMAIL, "password": TEACHER_PASSWORD})
    assert response.status_code == 200
    cookie = response.headers.get("set-cookie", "").lower()
    assert "access_token=" in cookie and "httponly" in cookie


# Credentialed CORS must use explicit configured origins.
def test_cors_allows_credentials_with_explicit_origin():
    response = requests.options(f"{BASE_URL}/api/auth/login", headers={
        "Origin": "https://qa.example.test", "Access-Control-Request-Method": "POST"
    }, timeout=30)
    assert response.status_code in (200, 204)
    assert response.headers.get("access-control-allow-credentials", "").lower() == "true"
    assert response.headers.get("access-control-allow-origin") not in (None, "*")
