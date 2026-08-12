"""Iteration 4 targeted API coverage for conflict-free timetables and announcement attachments/RBAC."""
import re
import uuid
from collections import Counter
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
CREDS = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
PRINCIPAL_EMAIL = re.search(r"(?im)^- Email:\s*(\S+)", CREDS).group(1)
PRINCIPAL_PASSWORD = re.search(r"(?im)^- Password:\s*(\S+)", CREDS).group(1)
TEACHERS = re.findall(r"(?im)^- (teacher\d+@\S+)\s*/\s*(\S+)", CREDS)
STUDENT_PASSWORD = re.search(r"(?im)Default password.*?:\s*(\S+)", CREDS).group(1)


def api(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=150, **kwargs)


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
def teacher1():
    data = login(*TEACHERS[0])
    assert data["user"]["role"] == "teacher"
    return data


@pytest.fixture(scope="session")
def teacher2():
    data = login(*TEACHERS[1])
    assert data["user"]["role"] == "teacher"
    return data


@pytest.fixture(scope="session")
def student(principal):
    students = api("GET", "/students", principal["access_token"])
    assert students.status_code == 200 and students.json()
    failures = []
    for row in students.json():
        if not row.get("batch_id"):
            continue
        response = api("POST", "/auth/login", json={"identifier": row["student_id"], "password": STUDENT_PASSWORD})
        if response.status_code == 200:
            data = response.json()
            assert data["user"]["role"] == "student"
            data["record"] = row
            return data
        failures.append((row["student_id"], response.status_code))
    pytest.fail(f"No seeded, batched student accepted documented default credentials: {failures[:5]}")


@pytest.fixture
def announcement_cleanup(principal):
    ids = []
    yield ids
    for announcement_id in ids:
        api("DELETE", f"/announcements/{announcement_id}", principal["access_token"])


# Configured generation must persist a complete weekly schedule without teacher or room clashes.
def test_configured_timetable_generation_is_complete_and_conflict_free(principal):
    token = principal["access_token"]
    batches_response = api("GET", "/batches", token)
    teachers_response = api("GET", "/teachers", token)
    assert batches_response.status_code == teachers_response.status_code == 200
    batches = batches_response.json()
    teachers = teachers_response.json()
    assert len(batches) >= 2 and len(teachers) >= 2

    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    periods = ["09:00-10:00", "10:00-11:00", "11:15-12:15"]
    payload = {"days": days, "periods": periods, "teacher_ids": [t["id"] for t in teachers], "use_ai": False}
    generated = api("POST", "/timetable/generate", token, json=payload)
    assert generated.status_code == 200, generated.text
    result = generated.json()
    assert result["ok"] is True
    assert result["days"] == days and result["periods"] == periods

    persisted_response = api("GET", "/timetable", token)
    assert persisted_response.status_code == 200
    rows = persisted_response.json()
    assert result["count"] == len(rows)
    assert all(row["day"] in days and row["slot"] in periods for row in rows)
    assert all(row.get("subject") and row.get("batch_name") and row.get("teacher_name") for row in rows)

    teacher_keys = [(r["day"], r["slot"], r["teacher_id"]) for r in rows if r.get("teacher_id")]
    duplicate_teachers = [key for key, count in Counter(teacher_keys).items() if count > 1]
    assert not duplicate_teachers, f"Teacher double-bookings: {duplicate_teachers}"
    room_keys = [(r["day"], r["slot"], r["room"]) for r in rows if r.get("room")]
    duplicate_rooms = [key for key, count in Counter(room_keys).items() if count > 1]
    assert not duplicate_rooms, f"Room double-bookings: {duplicate_rooms}"

    expected_per_batch = len(days) * len(periods)
    counts = Counter(r["batch_id"] for r in rows)
    missing = {b["id"]: expected_per_batch - counts[b["id"]] for b in batches if counts[b["id"]] != expected_per_batch}
    assert result["conflicts"] == 0 and not missing, f"Generator skipped required slots: conflicts={result['conflicts']}, missing={missing}"


# Principal, teacher, and student receive role-scoped, valid timetable PDFs.
def test_timetable_pdf_for_all_roles(principal, teacher1, student):
    for auth, role in ((principal, "principal"), (teacher1, "teacher"), (student, "student")):
        response = api("GET", "/timetable/pdf", auth["access_token"])
        assert response.status_code == 200, f"{role}: {response.text[:300]}"
        assert response.headers.get("content-type", "").startswith("application/pdf")
        assert response.content.startswith(b"%PDF") and len(response.content) > 1000


# Teacher PDF announcement persists role/URL, is student-visible, downloadable, and own-deletable.
def test_teacher_announcement_pdf_student_visibility_and_own_delete(teacher1, student, announcement_cleanup):
    pdf_bytes = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n"
    upload = api("POST", "/upload", teacher1["access_token"], files={"file": ("TEST_notice.pdf", pdf_bytes, "application/pdf")})
    assert upload.status_code == 200, upload.text
    uploaded = upload.json()
    assert uploaded["url"].startswith("/api/files/")

    title = f"TEST_Teacher PDF Notice {uuid.uuid4().hex[:8]}"
    created = api("POST", "/announcements", teacher1["access_token"], json={
        "title": title, "body": "TEST student attachment visibility", "audience": "students", "attachment_url": uploaded["url"]
    })
    assert created.status_code == 200, created.text
    announcement = created.json()
    announcement_cleanup.append(announcement["id"])
    assert announcement["author_role"] == "teacher"
    assert announcement["author"] == teacher1["user"]["name"]
    assert announcement["attachment_url"] == uploaded["url"]

    student_rows = api("GET", "/announcements", student["access_token"])
    assert student_rows.status_code == 200
    assert any(row["id"] == announcement["id"] and row["attachment_url"] == uploaded["url"] for row in student_rows.json())
    attachment = requests.get(f"{BASE_URL}{uploaded['url']}", timeout=90)
    assert attachment.status_code == 200
    assert attachment.headers.get("content-type", "").startswith("application/pdf")
    assert attachment.content.startswith(b"%PDF")

    deleted = api("DELETE", f"/announcements/{announcement['id']}", teacher1["access_token"])
    assert deleted.status_code == 200 and deleted.json() == {"ok": True}
    announcement_cleanup.remove(announcement["id"])
    assert all(row["id"] != announcement["id"] for row in api("GET", "/announcements", teacher1["access_token"]).json())


# Teachers cannot delete another teacher's notice; principals can delete any notice.
def test_announcement_delete_permissions(principal, teacher1, teacher2, announcement_cleanup):
    title = f"TEST_Teacher2 Ownership {uuid.uuid4().hex[:8]}"
    created = api("POST", "/announcements", teacher2["access_token"], json={"title": title, "body": "ownership", "audience": "all"})
    assert created.status_code == 200, created.text
    announcement = created.json()
    announcement_cleanup.append(announcement["id"])
    forbidden = api("DELETE", f"/announcements/{announcement['id']}", teacher1["access_token"])
    assert forbidden.status_code == 403
    assert "own" in forbidden.json().get("detail", "").lower()
    still_present = api("GET", "/announcements", principal["access_token"]).json()
    assert any(row["id"] == announcement["id"] for row in still_present)
    principal_delete = api("DELETE", f"/announcements/{announcement['id']}", principal["access_token"])
    assert principal_delete.status_code == 200 and principal_delete.json() == {"ok": True}
    announcement_cleanup.remove(announcement["id"])


# Login, all dashboards, and existing AI timetable suggestions remain operational.
def test_login_dashboards_and_ai_regression(principal, teacher1, student):
    cases = ((principal, "/dashboard/principal", "kpis"), (teacher1, "/dashboard/teacher", "my_batches"), (student, "/dashboard/student", "homework"))
    for auth, path, key in cases:
        response = api("GET", path, auth["access_token"])
        assert response.status_code == 200, response.text
        assert key in response.json()
    suggestion = api("POST", "/ai/timetable-suggest", principal["access_token"], json={})
    assert suggestion.status_code == 200, suggestion.text
    text = suggestion.json().get("suggestions")
    assert isinstance(text, str) and len(text.strip()) > 20
