"""Targeted 2FA, super-admin, activation-gate, and auth-control regression tests."""
import re
import uuid
from datetime import datetime, timedelta, timezone
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


def _section_credentials(section):
    match = re.search(
        rf"## {re.escape(section)}.*?\n- (?:Email:\s*)?([^\s/]+)(?:\s*/|\n- Password:)\s*([^\s(]+)",
        CREDS_TEXT,
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        pytest.fail(f"Could not read {section} credentials from test_credentials.md")
    return {"identifier": match.group(1), "password": match.group(2)}


PRINCIPAL = _section_credentials("Principal (full access, owner)")
SUPER_ADMIN = _section_credentials("Super Admin (NEW)")
KNOWN_OTP = "123456"
TEST_IDS = {"users": [], "students": [], "login_attempts": []}


def api(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE_URL}/api{path}", headers=headers, timeout=120, **kwargs)


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(BACKEND_ENV["MONGO_URL"])
    database = client[BACKEND_ENV["DB_NAME"]]
    yield database
    # Restore the named demo institute and remove only disposable QA records.
    database.institutes.update_one({"name": "Delhi Public Convent School"}, {"$set": {"status": "active"}})
    if TEST_IDS["users"]:
        database.users.delete_many({"id": {"$in": TEST_IDS["users"]}})
    if TEST_IDS["students"]:
        database.students.delete_many({"id": {"$in": TEST_IDS["students"]}})
    if TEST_IDS["login_attempts"]:
        database.login_attempts.delete_many({"id": {"$in": TEST_IDS["login_attempts"]}})
    database.login_otps.delete_many({"identifier": {"$in": [PRINCIPAL["identifier"], SUPER_ADMIN["identifier"]]}})
    client.close()


def seed_known_otp(database, identifier, code=KNOWN_OTP, expires_delta=timedelta(minutes=10)):
    result = database.login_otps.update_one(
        {"identifier": identifier},
        {"$set": {
            "code_hash": bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode(),
            "used": False,
            "attempts": 0,
            "expires_at": (datetime.now(timezone.utc) + expires_delta).isoformat(),
        }},
    )
    assert result.matched_count == 1, f"No OTP document found for {identifier}"


def begin_otp_login(credentials):
    response = api("POST", "/auth/login", json=credentials)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["otp_required"] is True
    assert data["identifier"] == credentials["identifier"]
    assert "access_token" not in data and "user" not in data
    return response


def complete_otp_login(database, credentials):
    begin_otp_login(credentials)
    seed_known_otp(database, credentials["identifier"])
    response = api("POST", "/auth/verify-otp", json={"identifier": credentials["identifier"], "otp": KNOWN_OTP})
    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data.get("access_token"), str) and len(data["access_token"]) > 20
    return response


@pytest.fixture(scope="session")
def principal_auth(mongo_db):
    response = complete_otp_login(mongo_db, PRINCIPAL)
    assert response.json()["user"]["role"] == "principal"
    return response.json()


@pytest.fixture(scope="session")
def super_admin_auth(mongo_db):
    response = complete_otp_login(mongo_db, SUPER_ADMIN)
    assert response.json()["user"]["role"] == "super_admin"
    return response.json()


# Two-step principal login contract, masked email, OTP validation, expiry, and single-use behavior.
class TestTwoFactorLogin:
    def test_principal_login_requires_otp_and_masks_email(self, mongo_db):
        response = begin_otp_login(PRINCIPAL)
        data = response.json()
        assert data["email_hint"] == "m***@gmail.com"
        otp_doc = mongo_db.login_otps.find_one({"identifier": PRINCIPAL["identifier"]})
        assert otp_doc and otp_doc["code_hash"].startswith("$2b$")
        assert "code" not in otp_doc

    def test_wrong_otp_then_correct_otp_then_reuse_fails(self, mongo_db):
        begin_otp_login(PRINCIPAL)
        seed_known_otp(mongo_db, PRINCIPAL["identifier"])
        wrong = api("POST", "/auth/verify-otp", json={"identifier": PRINCIPAL["identifier"], "otp": "654321"})
        assert wrong.status_code == 401 and wrong.json()["detail"] == "Invalid code"
        assert mongo_db.login_otps.find_one({"identifier": PRINCIPAL["identifier"]})["attempts"] == 1
        valid = api("POST", "/auth/verify-otp", json={"identifier": PRINCIPAL["identifier"], "otp": KNOWN_OTP})
        assert valid.status_code == 200, valid.text
        assert valid.json()["user"]["role"] == "principal"
        assert valid.json()["access_token"]
        reused = api("POST", "/auth/verify-otp", json={"identifier": PRINCIPAL["identifier"], "otp": KNOWN_OTP})
        assert reused.status_code == 400
        assert "No pending sign-in" in reused.json()["detail"]

    def test_expired_and_absent_otp_return_400(self, mongo_db):
        begin_otp_login(PRINCIPAL)
        seed_known_otp(mongo_db, PRINCIPAL["identifier"], expires_delta=timedelta(seconds=-1))
        expired = api("POST", "/auth/verify-otp", json={"identifier": PRINCIPAL["identifier"], "otp": KNOWN_OTP})
        assert expired.status_code == 400 and "expired" in expired.json()["detail"].lower()
        absent_identifier = f"TEST_absent_{uuid.uuid4().hex}@example.test"
        absent = api("POST", "/auth/verify-otp", json={"identifier": absent_identifier, "otp": KNOWN_OTP})
        assert absent.status_code == 400 and "No pending sign-in" in absent.json()["detail"]

    def test_student_without_email_uses_password_only(self, mongo_db, principal_auth):
        marker = uuid.uuid4().hex[:10]
        student_id = f"TESTNOEMAIL{marker.upper()}"
        uid = str(uuid.uuid4())
        TEST_IDS["students"].append(uid)
        mongo_db.students.insert_one({
            "id": uid,
            "student_id": student_id,
            "name": "TEST No Email Student",
            "role": "student",
            "institute_id": principal_auth["user"]["institute_id"],
            "status": "active",
            "password_hash": bcrypt.hashpw(b"TEST_Student_Pass_2026", bcrypt.gensalt()).decode(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        response = api("POST", "/auth/login", json={"identifier": student_id, "password": "TEST_Student_Pass_2026"})
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["otp_required"] is False
        assert data["user"]["role"] == "student" and data["user"]["student_id"] == student_id
        assert data["access_token"]


# Super-admin identity, list contracts, credential CRUD, status toggles, and authorization.
class TestSuperAdmin:
    def test_super_admin_login_and_list_contracts(self, super_admin_auth):
        token = super_admin_auth["access_token"]
        institutes = api("GET", "/super-admin/institutes", token)
        assert institutes.status_code == 200, institutes.text
        rows = institutes.json()
        assert isinstance(rows, list) and rows
        assert all({"id", "name", "status", "student_count", "user_count"}.issubset(row) for row in rows)
        assert all(isinstance(row["student_count"], int) and isinstance(row["user_count"], int) for row in rows)
        users = api("GET", "/super-admin/users", token)
        assert users.status_code == 200, users.text
        data = users.json()
        assert set(data) == {"staff", "students"}
        assert isinstance(data["staff"], list) and isinstance(data["students"], list)
        assert all("password_hash" not in row and "_id" not in row for row in data["staff"] + data["students"])

    def test_principal_is_forbidden_from_super_admin(self, principal_auth):
        response = api("GET", "/super-admin/institutes", principal_auth["access_token"])
        assert response.status_code == 403
        assert "Super admin" in response.json()["detail"]

    def test_super_admin_user_crud_and_status(self, super_admin_auth):
        token = super_admin_auth["access_token"]
        institutes = api("GET", "/super-admin/institutes", token).json()
        institute = next(row for row in institutes if row["name"] == "Delhi Public Convent School")
        marker = uuid.uuid4().hex[:10]
        email = f"test_sa_{marker}@example.test"
        password = "TEST_SA_Create_2026!"
        create = api("POST", "/super-admin/users", token, json={
            "name": f"TEST SA User {marker}",
            "email": email,
            "password": password,
            "role": "teacher",
            "institute_id": institute["id"],
            "status": "active",
        })
        assert create.status_code == 200, create.text
        created = create.json()
        uid = created["id"]
        TEST_IDS["users"].append(uid)
        assert created["email"] == email and created["role"] == "teacher"
        assert "password_hash" not in created and "_id" not in created

        new_password = "TEST_SA_Updated_2026!"
        update = api("PUT", f"/super-admin/users/{uid}", token, json={"name": "TEST SA User Updated", "password": new_password, "role": "teacher"})
        assert update.status_code == 200 and update.json() == {"ok": True}
        listed = api("GET", "/super-admin/users", token, params={"institute_id": institute["id"]}).json()["staff"]
        assert any(row["id"] == uid and row["name"] == "TEST SA User Updated" for row in listed)

        deactivate = api("PUT", f"/super-admin/users/{uid}/status", token, json={"status": "inactive"})
        assert deactivate.status_code == 200 and deactivate.json()["status"] == "inactive"
        blocked = api("POST", "/auth/login", json={"identifier": email, "password": new_password})
        assert blocked.status_code == 403 and "deactivated" in blocked.json()["detail"].lower()
        reactivate = api("PUT", f"/super-admin/users/{uid}/status", token, json={"status": "active"})
        assert reactivate.status_code == 200 and reactivate.json()["status"] == "active"
        allowed = api("POST", "/auth/login", json={"identifier": email, "password": new_password})
        assert allowed.status_code == 200 and allowed.json()["otp_required"] is True

        deleted = api("DELETE", f"/super-admin/users/{uid}", token)
        assert deleted.status_code == 200 and deleted.json() == {"ok": True}
        TEST_IDS["users"].remove(uid)
        listed_after = api("GET", "/super-admin/users", token).json()["staff"]
        assert all(row["id"] != uid for row in listed_after)
        assert api("DELETE", f"/super-admin/users/{uid}", token).status_code == 404

    def test_institute_activation_gate_and_restore(self, super_admin_auth):
        token = super_admin_auth["access_token"]
        institute = next(row for row in api("GET", "/super-admin/institutes", token).json() if row["name"] == "Delhi Public Convent School")
        try:
            off = api("PUT", f"/super-admin/institutes/{institute['id']}/status", token, json={"status": "inactive"})
            assert off.status_code == 200 and off.json()["status"] == "inactive"
            blocked = api("POST", "/auth/login", json=PRINCIPAL)
            assert blocked.status_code == 403
            assert "institute is not active" in blocked.json()["detail"].lower()
        finally:
            on = api("PUT", f"/super-admin/institutes/{institute['id']}/status", token, json={"status": "active"})
            assert on.status_code == 200 and on.json()["status"] == "active"
        restored = api("POST", "/auth/login", json=PRINCIPAL)
        assert restored.status_code == 200 and restored.json()["otp_required"] is True


# Auth playbook controls: bcrypt, lockout, HttpOnly cookie, and credentialed explicit-origin CORS.
class TestAuthControls:
    def test_seeded_hashes_use_bcrypt_2b(self, mongo_db):
        for identifier in (PRINCIPAL["identifier"], SUPER_ADMIN["identifier"]):
            user = mongo_db.users.find_one({"email": identifier})
            assert user and user["password_hash"].startswith("$2b$")

    def test_brute_force_lockout_after_five_failures(self, mongo_db):
        identifier = f"TEST_lockout_{uuid.uuid4().hex}@example.test"
        key = f"login:{identifier.lower()}"
        TEST_IDS["login_attempts"].append(key)
        statuses = [api("POST", "/auth/login", json={"identifier": identifier, "password": "wrong"}).status_code for _ in range(6)]
        assert statuses == [401, 401, 401, 401, 401, 429]

    def test_otp_verification_sets_httponly_cookie(self, mongo_db):
        response = complete_otp_login(mongo_db, PRINCIPAL)
        cookie = response.headers.get("set-cookie", "").lower()
        assert "access_token=" in cookie and "httponly" in cookie and "secure" in cookie

    def test_cors_allows_credentials_for_explicit_origin(self):
        response = requests.options(
            f"{BASE_URL}/api/auth/login",
            headers={"Origin": BASE_URL, "Access-Control-Request-Method": "POST"},
            timeout=30,
        )
        assert response.status_code in (200, 204), response.text
        assert response.headers.get("access-control-allow-credentials", "").lower() == "true"
        assert response.headers.get("access-control-allow-origin") == BASE_URL

    def test_super_admin_seed_updates_existing_password_when_configuration_changes(self, monkeypatch):
        import asyncio
        import importlib.util

        spec = importlib.util.spec_from_file_location("edusync_server_under_test", "/app/backend/server.py")
        server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(server)

        configured_password = "TEST_Rotated_Super_Admin_2026!"
        existing = {
            "id": "existing-super-admin",
            "email": server.SUPER_ADMIN_EMAIL,
            "password_hash": bcrypt.hashpw(b"old-password", bcrypt.gensalt()).decode(),
        }

        class FakeUsers:
            async def find_one(self, query):
                return existing if query.get("email") == server.SUPER_ADMIN_EMAIL else None

            async def insert_one(self, doc):
                raise AssertionError("Existing super admin must not be inserted again")

            async def update_one(self, query, update):
                existing.update(update["$set"])

            async def update_many(self, query, update):
                return None

        class FakeCollection:
            async def update_many(self, query, update):
                return None

        class FakeDb:
            users = FakeUsers()
            institutes = FakeCollection()
            students = FakeCollection()

        monkeypatch.setattr(server, "db", FakeDb())
        monkeypatch.setenv("SUPER_ADMIN_PASSWORD", configured_password)
        asyncio.run(server.ensure_super_admin())
        assert bcrypt.checkpw(configured_password.encode(), existing["password_hash"].encode())
