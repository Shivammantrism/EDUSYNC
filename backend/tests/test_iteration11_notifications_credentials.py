"""Requested notification-center and automated credential-delivery API coverage."""
import re
import uuid
from datetime import datetime
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
CREDS_TEXT = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
PRINCIPAL_EMAIL = re.search(r"(?im)^- Email:\s*(\S+)", CREDS_TEXT).group(1)
PRINCIPAL_PASSWORD = re.search(r"(?im)^- Password:\s*(\S+)", CREDS_TEXT).group(1)
TEACHER_EMAIL, TEACHER_PASSWORD = re.findall(r"(?im)^- (teacher\d+@\S+)\s*/\s*(\S+)", CREDS_TEXT)[0]
YEAR = datetime.now().strftime("%Y")


def api(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=120, **kwargs)


def login(identifier, password):
    response = api("POST", "/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data.get("access_token"), str) and data["access_token"]
    return data


@pytest.fixture(scope="session")
def principal():
    result = login(PRINCIPAL_EMAIL, PRINCIPAL_PASSWORD)
    assert result["user"]["role"] == "principal"
    return result


@pytest.fixture(scope="session")
def teacher():
    result = login(TEACHER_EMAIL, TEACHER_PASSWORD)
    assert result["user"]["role"] == "teacher"
    return result


@pytest.fixture(scope="session")
def created_records(principal):
    records = {"teachers": [], "students": []}
    yield records
    token = principal["access_token"]
    for sid in records["students"]:
        response = api("DELETE", f"/students/{sid}", token)
        assert response.status_code in (200, 404), response.text
    for tid in records["teachers"]:
        response = api("DELETE", f"/teachers/{tid}", token)
        assert response.status_code in (200, 404), response.text


# Notification payloads must be role-scoped and structurally valid for each role.
def test_notifications_for_principal_and_teacher(principal, teacher):
    for auth, expected_role in ((principal, "principal"), (teacher, "teacher")):
        response = api("GET", "/notifications", auth["access_token"])
        assert response.status_code == 200, response.text
        data = response.json()
        assert set(data) == {"count", "items"}
        assert isinstance(data["count"], int) and data["count"] >= 0
        assert isinstance(data["items"], list) and data["count"] == len(data["items"])
        allowed_types = {
            "principal": {"fee", "complaint", "leave"},
            "teacher": {"lead", "notice"},
        }[expected_role]
        for item in data["items"]:
            assert set(item) == {"type", "title"}
            assert item["type"] in allowed_types
            assert isinstance(item["title"], str) and item["title"].strip()


# Principal teacher creation omits password, generates credentials, and handles rejected email gracefully.
def test_principal_creates_teacher_with_generated_credentials_and_false_email(principal, created_records):
    marker = uuid.uuid4().hex[:10]
    email = f"test_credential_{marker}@example.com"
    payload = {
        "name": f"TEST Credential Teacher {marker}",
        "email": email,
        "phone": "9000000001",
        "subjects": ["QA"],
        "available_days": ["Monday"],
        "monthly_salary": 12345,
        "leave_balance": 12,
    }
    response = api("POST", "/teachers", principal["access_token"], json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    created_records["teachers"].append(data["id"])
    assert re.fullmatch(rf"[A-Z]{{1,4}}{YEAR}T\d{{3}}", data["faculty_id"])
    assert isinstance(data["temp_password"], str) and len(data["temp_password"]) == 8
    assert data["email_sent"] is False
    assert data["email_recipients"] == [email]
    assert "password_hash" not in data and "password" not in data
    authenticated = login(email, data["temp_password"])
    assert authenticated["user"]["role"] == "teacher"


# The Resend delivered test address exercises successful welcome-email delivery for teacher creation.
def test_principal_creates_teacher_with_delivered_email(principal, created_records):
    email = "delivered@resend.dev"
    existing = api("GET", "/teachers", principal["access_token"])
    assert existing.status_code == 200, existing.text
    assert all(row.get("email") != email for row in existing.json()), "delivered@resend.dev already belongs to a seeded record; refusing destructive cleanup"
    response = api("POST", "/teachers", principal["access_token"], json={
        "name": "TEST Delivered Credential Teacher",
        "email": email,
        "subjects": ["QA"],
    })
    assert response.status_code == 200, response.text
    data = response.json()
    created_records["teachers"].append(data["id"])
    assert re.fullmatch(rf"[A-Z]{{1,4}}{YEAR}T\d{{3}}", data["faculty_id"])
    assert len(data["temp_password"]) == 8
    assert data["email_sent"] is True
    assert data["email_recipients"] == [email]


# Principal student admission generates a Student ID/password, delivers email, and supports the generated login.
def test_principal_creates_student_delivered_email_and_student_notifications(principal, created_records):
    marker = uuid.uuid4().hex[:8]
    response = api("POST", "/students", principal["access_token"], json={
        "name": f"TEST Delivered Student {marker}",
        "age": 12,
        "gender": "Other",
        "parent_name": "TEST Parent",
        "parent_email": "delivered@resend.dev",
        "monthly_fee": 2000,
    })
    assert response.status_code == 200, response.text
    data = response.json()
    created_records["students"].append(data["id"])
    assert re.fullmatch(rf"[A-Z]{{1,4}}{YEAR}\d{{4}}", data["student_id"])
    assert isinstance(data["temp_password"], str) and len(data["temp_password"]) == 8
    assert data["email_sent"] is True
    assert data["email_recipients"] == ["delivered@resend.dev"]
    assert "password_hash" not in data and "password" not in data

    student = login(data["student_id"], data["temp_password"])
    assert student["user"]["role"] == "student"
    notifications = api("GET", "/notifications", student["access_token"])
    assert notifications.status_code == 200, notifications.text
    body = notifications.json()
    assert set(body) == {"count", "items"}
    assert body["count"] == len(body["items"])
    assert all(item["type"] in {"fee", "absent", "notice"} for item in body["items"])


# Distinct student and parent addresses must both receive the generated credentials.
def test_student_and_parent_email_are_both_returned_as_recipients(principal, created_records):
    marker = uuid.uuid4().hex[:8]
    student_email = f"test_student_login_{marker}@example.com"
    parent_email = "delivered@resend.dev"
    response = api("POST", "/students", principal["access_token"], json={
        "name": f"TEST Dual Recipient Student {marker}",
        "age": 11,
        "email": student_email,
        "parent_email": parent_email,
        "monthly_fee": 1500,
    })
    assert response.status_code == 200, response.text
    data = response.json()
    created_records["students"].append(data["id"])
    assert set(data["email_recipients"]) == {student_email, parent_email}
    assert data["email_sent"] is True


# Teacher role is permitted to admit a student and an undeliverable recipient does not roll back persistence.
def test_teacher_creates_student_and_false_email_is_graceful(teacher, principal, created_records):
    batches = api("GET", "/batches", teacher["access_token"])
    assert batches.status_code == 200, batches.text
    assert batches.json(), "Teacher needs an assigned batch for a visible admission"
    marker = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST Teacher Admitted Student {marker}",
        "age": 13,
        "gender": "Female",
        "batch_id": batches.json()[0]["id"],
        "parent_name": "TEST Parent",
        "parent_email": f"test_student_{marker}@example.com",
        "monthly_fee": 2100,
    }
    response = api("POST", "/students", teacher["access_token"], json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    created_records["students"].append(data["id"])
    assert re.fullmatch(rf"[A-Z]{{1,4}}{YEAR}\d{{4}}", data["student_id"])
    assert len(data["temp_password"]) == 8
    assert data["email_sent"] is False
    assert data["email_recipients"] == [payload["parent_email"]]

    fetched = api("GET", f"/students/{data['id']}", principal["access_token"])
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["name"] == payload["name"]
    teacher_list = api("GET", "/students", teacher["access_token"])
    assert teacher_list.status_code == 200
    assert any(row["id"] == data["id"] for row in teacher_list.json())
