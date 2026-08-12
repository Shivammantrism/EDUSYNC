"""Requested salary-breakdown, slip-PDF, collection-target, and role-login coverage."""
import re
from pathlib import Path

import fitz
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
    return requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=120, **kwargs)


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
def mongo_db():
    client = MongoClient(BACKEND_ENV["MONGO_URL"])
    yield client[BACKEND_ENV["DB_NAME"]]
    client.close()


def assert_salary_math(salary, metro, extra_deductions):
    gross = salary["gross"]
    expected_base = round(gross * 0.45, 2)
    expected_hra = round(expected_base * (0.5 if metro else 0.4), 2)
    expected_special = round(gross - expected_base - expected_hra, 2)
    expected_epf = round(expected_base * 0.12, 2)
    expected_pt = 200.0 if gross >= 15000 else (150.0 if gross >= 10000 else 0.0)
    annual_gross = gross * 12
    taxable = max(annual_gross - 50000 - expected_epf * 12, 0)
    if taxable <= 300000:
        tax = 0.0
    elif taxable <= 700000:
        tax = (taxable - 300000) * 0.05
    elif taxable <= 1000000:
        tax = 20000 + (taxable - 700000) * 0.10
    elif taxable <= 1200000:
        tax = 50000 + (taxable - 1000000) * 0.15
    else:
        tax = 80000 + (taxable - 1200000) * 0.20
    expected_tds = round(tax / 12, 2)
    expected_total_deductions = round(expected_epf + expected_pt + expected_tds + extra_deductions + salary["lwp_amount"], 2)

    assert salary["metro"] is metro
    assert salary["base"] == pytest.approx(expected_base, abs=0.01) and salary["base"] > 0
    assert salary["hra"] == pytest.approx(expected_hra, abs=0.01) and salary["hra"] > 0
    assert salary["special"] == pytest.approx(expected_special, abs=0.01) and salary["special"] > 0
    assert salary["epf"] == pytest.approx(expected_epf, abs=0.01) and salary["epf"] > 0
    assert salary["professional_tax"] == pytest.approx(expected_pt, abs=0.01)
    assert salary["tds"] == pytest.approx(expected_tds, abs=0.01) and salary["tds"] > 0
    assert salary["extra_deductions"] == pytest.approx(extra_deductions, abs=0.01)
    assert salary["total_deductions"] == pytest.approx(expected_total_deductions, abs=0.01)
    assert salary["amount"] == pytest.approx(gross - expected_total_deductions, abs=0.01)


def assert_slip_pdf(salary, token, metro):
    response = api("GET", f"/salaries/{salary['id']}/slip", token)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content.startswith(b"%PDF") and len(response.content) > 1000
    document = fitz.open(stream=response.content, filetype="pdf")
    text = "\n".join(page.get_text() for page in document)
    document.close()
    for label in ("Basic Pay", "HRA", "Special Allowance", "EPF (12% of Basic)", "Professional Tax", "TDS", "Gross", "Total Deductions", "NET PAY"):
        assert label in text, f"Missing {label!r} in PDF text:\n{text}"
    assert ("Metro (50%)" if metro else "Non-Metro (40%)") in text
    for value in (salary["base"], salary["hra"], salary["special"], salary["epf"], salary["professional_tax"], salary["tds"], salary["gross"], salary["total_deductions"], salary["amount"]):
        assert str(value) in text, f"Missing value {value} in PDF text:\n{text}"


# Existing configured components must never override the statutory auto-breakdown; metro toggles HRA and PDFs match.
def test_salary_auto_breakdown_for_legacy_components_metro_toggle_and_pdf(principal, mongo_db):
    token = principal["access_token"]
    teachers = api("GET", "/teachers", token)
    assert teachers.status_code == 200, teachers.text
    teacher = next((row for row in teachers.json() if row.get("salary_components") and float(row.get("monthly_salary") or 0) > 0), None)
    assert teacher is not None, "No teacher with legacy salary_components is available for the requested regression"
    assert teacher["salary_components"].get("base", 0) != pytest.approx(teacher["monthly_salary"] * 0.45, abs=0.01), "Fixture no longer represents the legacy custom-components case"
    extra_deductions = float(teacher["salary_components"].get("deductions", 0) or 0)
    institute = api("GET", "/institute", token).json()
    original_metro_present = "metro" in institute
    original_metro = institute.get("metro")
    created_ids = []
    existing = {(s["teacher_id"], s["month"]) for s in api("GET", "/salaries", token).json()}
    months = [month for month in (f"2096-{m:02d}" for m in range(1, 13)) if (teacher["id"], month) not in existing]
    assert len(months) >= 2, "Need two unused teacher/month combinations"
    try:
        for metro, month in ((False, months[0]), (True, months[1])):
            updated = api("PUT", "/institute", token, json={"metro": metro})
            assert updated.status_code == 200 and updated.json()["metro"] is metro
            created = api("POST", "/salaries", token, json={"teacher_id": teacher["id"], "month": month})
            assert created.status_code == 200, created.text
            salary = created.json()
            created_ids.append(salary["id"])
            assert_salary_math(salary, metro, extra_deductions)
            assert_slip_pdf(salary, token, metro)
            listed = api("GET", "/salaries", token)
            assert listed.status_code == 200
            assert any(row["id"] == salary["id"] and row["base"] == salary["base"] for row in listed.json())
    finally:
        mongo_db.salaries.delete_many({"id": {"$in": created_ids}})
        if original_metro_present:
            mongo_db.institutes.update_one({"id": principal["user"]["institute_id"]}, {"$set": {"metro": original_metro}})
        else:
            mongo_db.institutes.update_one({"id": principal["user"]["institute_id"]}, {"$unset": {"metro": ""}})


# Collection target persists through institute settings and fee stats returns an independently verified current-month percentage.
def test_collection_target_persistence_and_fee_stats_contract(principal, mongo_db):
    token = principal["access_token"]
    institute = api("GET", "/institute", token).json()
    original_present = "collection_target" in institute
    original_target = institute.get("collection_target")
    target = 123456.78
    try:
        updated = api("PUT", "/institute", token, json={"collection_target": target})
        assert updated.status_code == 200, updated.text
        assert updated.json()["collection_target"] == pytest.approx(target)
        fetched = api("GET", "/institute", token)
        assert fetched.status_code == 200 and fetched.json()["collection_target"] == pytest.approx(target)
        stats_response = api("GET", "/fees/stats", token)
        assert stats_response.status_code == 200, stats_response.text
        stats = stats_response.json()
        assert stats["target"] == pytest.approx(target)
        assert re.fullmatch(r"\d{4}-\d{2}", stats["current_month"])
        fees = api("GET", "/fees", token).json()
        expected_this_month = round(sum(float(row.get("paid_amount", 0) or 0) for row in fees if row.get("month") == stats["current_month"]), 2)
        expected_pct = round(expected_this_month / target * 100, 1)
        assert stats["this_month"] == pytest.approx(expected_this_month)
        assert stats["target_pct"] == pytest.approx(expected_pct)
        assert isinstance(stats["monthly"], list)
    finally:
        if original_present:
            mongo_db.institutes.update_one({"id": principal["user"]["institute_id"]}, {"$set": {"collection_target": original_target}})
        else:
            mongo_db.institutes.update_one({"id": principal["user"]["institute_id"]}, {"$unset": {"collection_target": ""}})


# Principal, teacher, and a seeded student retain functional JWT login and /auth/me identity.
def test_principal_teacher_student_login_regression(principal):
    teacher = login(TEACHER_EMAIL, TEACHER_PASSWORD)
    students = api("GET", "/students", principal["access_token"])
    assert students.status_code == 200 and students.json()
    student = None
    for row in students.json():
        response = api("POST", "/auth/login", json={"identifier": row["student_id"], "password": STUDENT_PASSWORD})
        if response.status_code == 200:
            student = response.json()
            break
    assert student is not None, "No listed student accepts the documented default password"
    for auth, role in ((principal, "principal"), (teacher, "teacher"), (student, "student")):
        assert auth["user"]["role"] == role
        me = api("GET", "/auth/me", auth["access_token"])
        assert me.status_code == 200, me.text
        assert me.json()["role"] == role and me.json()["id"] == auth["user"]["id"]
