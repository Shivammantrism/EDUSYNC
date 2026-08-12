"""Requested ID standardization, faculty-card data, branding, and auth regression tests."""
import re
import uuid
from pathlib import Path

import bcrypt
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BACKEND_ENV = dotenv_values("/app/backend/.env")
BASE_URL = FRONTEND_ENV["REACT_APP_BACKEND_URL"].rstrip("/")
CREDS_TEXT = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
PRINCIPAL_EMAIL = re.search(r"(?im)^- Email:\s*(\S+)", CREDS_TEXT).group(1)
PRINCIPAL_PASSWORD = re.search(r"(?im)^- Password:\s*(\S+)", CREDS_TEXT).group(1)
STUDENT_PASSWORD = re.search(r"(?im)Default password.*?:\s*(\S+)", CREDS_TEXT).group(1)
YEAR = "2026"


def api(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=120, **kwargs)


@pytest.fixture(scope="session")
def principal():
    response = api("POST", "/auth/login", json={"identifier": PRINCIPAL_EMAIL, "password": PRINCIPAL_PASSWORD})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["user"]["role"] == "principal"
    assert isinstance(data.get("access_token"), str) and data["access_token"]
    return data


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(BACKEND_ENV["MONGO_URL"])
    yield client[BACKEND_ENV["DB_NAME"]]
    client.close()


# Seed migration and institute code expose only the standardized current-year IDs.
def test_seeded_institute_and_ids_are_standardized(principal):
    token = principal["access_token"]
    institute = api("GET", "/institute", token)
    assert institute.status_code == 200, institute.text
    inst = institute.json()
    assert inst["code"] == "DP"

    students_response = api("GET", "/students", token)
    teachers_response = api("GET", "/teachers", token)
    assert students_response.status_code == teachers_response.status_code == 200
    students = students_response.json()
    teachers = teachers_response.json()
    assert students and teachers
    assert all(re.fullmatch(r"DP2026\d{4}", row["student_id"]) for row in students)
    assert all(not row["student_id"].startswith("STU") for row in students)
    assert all(re.fullmatch(r"DP2026T\d{3}", row["faculty_id"]) for row in teachers)
    assert len({row["student_id"] for row in students}) == len(students)
    assert len({row["faculty_id"] for row in teachers}) == len(teachers)


# Create operations atomically continue institute counters and created records persist and authenticate.
def test_sequential_student_and_teacher_creation_with_cleanup(principal):
    token = principal["access_token"]
    institute_before = api("GET", "/institute", token).json()
    student_expected = int(institute_before["student_seq"]) + 1
    faculty_expected = int(institute_before["faculty_seq"]) + 1
    marker = uuid.uuid4().hex[:8]
    student = None
    teacher = None
    try:
        student_response = api("POST", "/students", token, json={
            "name": f"TEST_ID Student {marker}", "age": 14, "gender": "Other",
            "parent_name": "TEST Parent", "parent_phone": "9000000031",
            "monthly_fee": 1234, "password": STUDENT_PASSWORD,
        })
        assert student_response.status_code == 200, student_response.text
        student = student_response.json()
        assert student["student_id"] == f"DP{YEAR}{student_expected:04d}"
        fetched = api("GET", f"/students/{student['id']}", token)
        assert fetched.status_code == 200 and fetched.json()["student_id"] == student["student_id"]
        student_login = api("POST", "/auth/login", json={"identifier": student["student_id"], "password": STUDENT_PASSWORD})
        assert student_login.status_code == 200, student_login.text
        assert student_login.json()["user"]["student_id"] == student["student_id"]

        teacher_response = api("POST", "/teachers", token, json={
            "name": f"TEST_ID Teacher {marker}", "email": f"test.id.{marker}@example.test",
            "password": "teacher123", "phone": "9000000032", "subjects": ["QA"],
            "available_days": ["Monday"], "monthly_salary": 25000, "leave_balance": 12,
        })
        assert teacher_response.status_code == 200, teacher_response.text
        teacher = teacher_response.json()
        assert teacher["faculty_id"] == f"DP{YEAR}T{faculty_expected:03d}"
        listed = api("GET", "/teachers", token).json()
        assert any(row["id"] == teacher["id"] and row["faculty_id"] == teacher["faculty_id"] for row in listed)
    finally:
        if student:
            deleted = api("DELETE", f"/students/{student['id']}", token)
            assert deleted.status_code == 200
            assert api("GET", f"/students/{student['id']}", token).status_code == 404
        if teacher:
            deleted = api("DELETE", f"/teachers/{teacher['id']}", token)
            assert deleted.status_code == 200
            assert all(row["id"] != teacher["id"] for row in api("GET", "/teachers", token).json())


# A migrated student can log in and read the same new-format identity used by the Digital ID Card.
def test_seeded_new_format_student_login_and_id_data(principal):
    students = api("GET", "/students", principal["access_token"]).json()
    auth = None
    student = None
    for row in students:
        response = api("POST", "/auth/login", json={"identifier": row["student_id"], "password": STUDENT_PASSWORD})
        if response.status_code == 200:
            auth = response.json()
            student = row
            break
    assert auth is not None, "No migrated student accepts the documented password"
    assert auth["user"]["role"] == "student"
    assert auth["user"]["student_id"] == student["student_id"]
    own_record = api("GET", f"/students/{student['id']}", auth["access_token"])
    assert own_record.status_code == 200, own_record.text
    assert own_record.json()["student_id"] == student["student_id"]
    assert re.fullmatch(r"DP2026\d{4}", own_record.json()["student_id"])


# Principal branding code is sanitized, uppercased, capped, persisted, and restorable.
def test_institute_code_update_validation_and_persistence(principal):
    token = principal["access_token"]
    original = api("GET", "/institute", token).json()["code"]
    try:
        updated = api("PUT", "/institute", token, json={"code": "z9x!long"})
        assert updated.status_code == 200, updated.text
        assert updated.json()["code"] == "Z9XL"
        persisted = api("GET", "/institute", token)
        assert persisted.status_code == 200 and persisted.json()["code"] == "Z9XL"
    finally:
        restored = api("PUT", "/institute", token, json={"code": original})
        assert restored.status_code == 200 and restored.json()["code"] == original


# Required auth playbook controls: bcrypt seed/update, lockout, HttpOnly cookie, and credentialed CORS.
def test_auth_bcrypt_hash_and_seeded_password(principal, mongo_db):
    admin = mongo_db.users.find_one({"email": PRINCIPAL_EMAIL})
    assert admin and admin["password_hash"].startswith("$2b$")
    assert bcrypt.checkpw(PRINCIPAL_PASSWORD.encode(), admin["password_hash"].encode())


def test_auth_bruteforce_lockout_after_five_failures():
    identifier = f"TEST_lockout_{uuid.uuid4().hex}@example.test"
    statuses = [api("POST", "/auth/login", json={"identifier": identifier, "password": "wrong"}).status_code for _ in range(6)]
    assert statuses == [401, 401, 401, 401, 401, 429]


def test_login_sets_application_httponly_cookie():
    response = api("POST", "/auth/login", json={"identifier": PRINCIPAL_EMAIL, "password": PRINCIPAL_PASSWORD})
    assert response.status_code == 200
    cookie = response.headers.get("set-cookie", "").lower()
    assert "access_token=" in cookie and "httponly" in cookie


def test_cors_allows_credentials_with_explicit_origin():
    response = requests.options(
        f"{BASE_URL}/api/auth/login",
        headers={"Origin": "https://qa.example.test", "Access-Control-Request-Method": "POST"},
        timeout=30,
    )
    assert response.status_code in (200, 204)
    assert response.headers.get("access-control-allow-credentials", "").lower() == "true"
    assert response.headers.get("access-control-allow-origin") not in (None, "*")
