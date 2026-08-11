"""Iteration 4 API tests for institute branding, logo persistence, branded PDFs, batch data, and role regressions."""
import base64
import re
import uuid
from pathlib import Path

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
TEACHER_EMAIL, TEACHER_PASSWORD = re.search(r"(?im)^- (teacher1@\S+)\s*/\s*(\S+)", CREDS_TEXT).groups()


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
    assert data["user"]["role"] == "principal" and data["access_token"]
    return data


@pytest.fixture(scope="session")
def teacher():
    response = api("POST", "/auth/login", json={"identifier": TEACHER_EMAIL, "password": TEACHER_PASSWORD})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["user"]["role"] == "teacher" and data["access_token"]
    return data


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(BACKEND_ENV["MONGO_URL"])
    yield client[BACKEND_ENV["DB_NAME"]]
    client.close()


# Institute details are principal-editable, persist through GET, and remain read-only to teachers.
def test_institute_get_update_persistence_and_rbac(principal, teacher):
    token = principal["access_token"]
    original_response = api("GET", "/institute", token)
    assert original_response.status_code == 200, original_response.text
    original = original_response.json()
    assert original["id"] == principal["user"]["institute_id"]
    assert isinstance(original.get("name"), str) and original["name"]

    marker = uuid.uuid4().hex[:8]
    updated_fields = {
        "name": original["name"],
        "address": f"TEST Branding Address {marker}",
        "phone": "9000000099",
        "email": f"branding.{marker}@example.test",
        "logo_url": original.get("logo_url", ""),
        "logo_path": original.get("logo_path", ""),
    }
    try:
        updated = api("PUT", "/institute", token, json=updated_fields)
        assert updated.status_code == 200, updated.text
        assert all(updated.json().get(key) == value for key, value in updated_fields.items())
        persisted = api("GET", "/institute", token)
        assert persisted.status_code == 200
        assert all(persisted.json().get(key) == value for key, value in updated_fields.items())

        forbidden = api("PUT", "/institute", teacher["access_token"], json={"name": "TEST Forbidden Rename"})
        assert forbidden.status_code == 403
        teacher_view = api("GET", "/institute", teacher["access_token"])
        assert teacher_view.status_code == 200 and teacher_view.json()["id"] == original["id"]
    finally:
        restore = {key: original.get(key, "") for key in ("name", "address", "phone", "email", "logo_url", "logo_path")}
        restored = api("PUT", "/institute", token, json=restore)
        assert restored.status_code == 200


# Uploaded image metadata can be saved as institute branding and is returned on reload.
def test_institute_logo_upload_and_save(principal, mongo_db):
    token = principal["access_token"]
    original = api("GET", "/institute", token).json()
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
    upload = api("POST", "/upload", token, files={"file": ("TEST_brand_logo.png", png, "image/png")})
    assert upload.status_code == 200, upload.text
    uploaded = upload.json()
    assert uploaded["path"].endswith(".png") and uploaded["url"].startswith("/api/files/")
    try:
        saved = api("PUT", "/institute", token, json={"logo_url": uploaded["url"], "logo_path": uploaded["path"]})
        assert saved.status_code == 200, saved.text
        assert saved.json()["logo_url"] == uploaded["url"] and saved.json()["logo_path"] == uploaded["path"]
        persisted = api("GET", "/institute", token).json()
        assert persisted["logo_url"] == uploaded["url"] and persisted["logo_path"] == uploaded["path"]
        served = requests.get(f"{BASE_URL}{uploaded['url']}", timeout=60)
        assert served.status_code == 200 and served.headers["content-type"].startswith("image/png")
    finally:
        restore = {key: original.get(key, "") for key in ("logo_url", "logo_path")}
        restored = api("PUT", "/institute", token, json=restore)
        assert restored.status_code == 200
        mongo_db.files.delete_many({"storage_path": uploaded["path"]})


# Existing paid fee and paid salary PDFs remain valid after branding support.
def test_branded_fee_receipt_and_salary_slip_pdfs(principal):
    token = principal["access_token"]
    fees = api("GET", "/fees", token)
    assert fees.status_code == 200
    receiptable = next((fee for fee in fees.json() if fee.get("paid_amount", 0) > 0 or fee.get("status") == "paid"), None)
    assert receiptable, "Seeded data has no paid/partial fee for receipt coverage"
    receipt = api("GET", f"/fees/{receiptable['id']}/receipt", token)
    assert receipt.status_code == 200
    assert receipt.headers["content-type"].startswith("application/pdf")
    assert receipt.content.startswith(b"%PDF") and len(receipt.content) > 1000

    salaries = api("GET", "/salaries", token)
    assert salaries.status_code == 200
    paid_salary = next((salary for salary in salaries.json() if salary.get("status") == "paid"), None)
    assert paid_salary, "Seeded data has no paid salary for slip coverage"
    slip = api("GET", f"/salaries/{paid_salary['id']}/slip", token)
    assert slip.status_code == 200
    assert slip.headers["content-type"].startswith("application/pdf")
    assert slip.content.startswith(b"%PDF") and len(slip.content) > 1000


# Batch list counts correspond to students returned for bulk-ID rendering.
def test_batch_students_support_bulk_id_cards(principal):
    token = principal["access_token"]
    batches = api("GET", "/batches", token)
    assert batches.status_code == 200 and batches.json()
    batch = next((item for item in batches.json() if item.get("student_count", 0) > 1), None)
    assert batch, "No batch with multiple students exists for bulk ID coverage"
    students = api("GET", "/students", token, params={"batch_id": batch["id"]})
    assert students.status_code == 200
    rows = students.json()
    assert len(rows) == batch["student_count"] and len(rows) > 1
    for student in rows:
        assert student["batch_id"] == batch["id"]
        assert student["student_id"] and student["name"]
        assert "password_hash" not in student and "_id" not in student
