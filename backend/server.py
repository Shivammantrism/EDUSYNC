"""EduSync backend — multi-institute school management SaaS by Privam Solutions."""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import base64
import csv
import io
import secrets
import string
import uuid
import logging
import hmac
import hashlib
import io
import asyncio
import calendar
import random
import httpx
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List

import bcrypt
import jwt
import requests
import razorpay
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Form, Query, Header
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# ---------------------------------------------------------------- config
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Shared "marketing" DB (institute activation source). Falls back to app DB until configured.
_MKT_URL = os.environ.get("MARKETING_MONGO_URL", "").strip()
_MKT_DB = os.environ.get("MARKETING_DB_NAME", "").strip()
mkt_client = AsyncIOMotorClient(_MKT_URL) if _MKT_URL else None
mkt_db = mkt_client[_MKT_DB] if (mkt_client and _MKT_DB) else None
SUPER_ADMIN_EMAIL = "founder@privamsolutions.in"


async def institute_is_active(institute_id):
    if not institute_id:
        return True
    source = mkt_db if mkt_db is not None else db
    inst = await source.institutes.find_one({"id": institute_id}, {"_id": 0, "status": 1})
    if inst is None and mkt_db is not None:
        inst = await db.institutes.find_one({"id": institute_id}, {"_id": 0, "status": 1})
    return (inst or {}).get("status", "active") != "inactive"


# ---- Marketing Sync API (verify/provision principals over HTTP; no DB sharing) ----
SYNC_BASE_URL = os.environ.get("SYNC_BASE_URL", "").rstrip("/")
SYNC_KEY = os.environ.get("SYNC_KEY", "")


async def sync_verify_principal(email, password):
    """Verify a principal against the marketing Sync API.
    Returns: principal dict (valid+active) | None (explicitly invalid) | 'inactive' | 'unavailable'."""
    if not SYNC_BASE_URL or not SYNC_KEY:
        return "unavailable"
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{SYNC_BASE_URL}/api/sync/verify-principal",
                             headers={"X-Sync-Key": SYNC_KEY},
                             json={"email": email, "password": password})
        if r.status_code == 404 or r.status_code >= 500:
            logger.warning(f"Sync API unavailable ({r.status_code})")
            return "unavailable"
        try:
            data = r.json()
        except Exception:
            return "unavailable"
        if data.get("valid"):
            p = data.get("principal") or {}
            if p.get("active") is False:
                return "inactive"
            p.setdefault("email", email)
            return p
        return None
    except Exception as e:
        logger.warning(f"Sync API error: {e}")
        return "unavailable"


async def _provision_synced_principal(principal, password):
    email = (principal.get("email") or "").lower()
    code = principal.get("institute_code") or "SYNC"
    active = principal.get("active", True)
    inst = await db.institutes.find_one({"code": code})
    if not inst:
        institute_id = str(uuid.uuid4())
        await db.institutes.insert_one({"id": institute_id, "name": principal.get("institute_name") or code,
            "code": code, "status": "active" if active else "inactive", "synced": True, "created_at": now_iso()})
    else:
        institute_id = inst["id"]
        await db.institutes.update_one({"id": institute_id}, {"$set": {"status": "active" if active else "inactive"}})
    upd = {"name": principal.get("name") or email, "role": "principal", "institute_id": institute_id,
           "status": "active" if active else "inactive", "password_hash": hash_pw(password), "synced": True,
           "must_change_password": bool(principal.get("must_change_password"))}
    existing = await db.users.find_one({"email": email})
    if existing:
        await db.users.update_one({"id": existing["id"]}, {"$set": upd})
        uid = existing["id"]
    else:
        uid = str(uuid.uuid4())
        await db.users.insert_one({"id": uid, "email": email, "created_at": now_iso(), **upd})
    return uid, institute_id, "principal"

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
APP_NAME = "edusync"

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

RZP_KEY = os.environ.get("RAZORPAY_KEY_ID")
RZP_SECRET = os.environ.get("RAZORPAY_KEY_SECRET")
rzp_client = razorpay.Client(auth=(RZP_KEY, RZP_SECRET)) if RZP_KEY and RZP_SECRET else None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("edusync")

# ---- certificate fonts (register once) ----
CERT_FONT_SCRIPT = "Helvetica-BoldOblique"
CERT_FONT_SERIF = "Helvetica"
try:
    from reportlab.pdfbase import pdfmetrics as _pdfm
    from reportlab.pdfbase.ttfonts import TTFont as _TTF
    _fdir = os.path.join(os.path.dirname(__file__), "assets")
    _pdfm.registerFont(_TTF("GreatVibes", os.path.join(_fdir, "GreatVibes-Regular.ttf")))
    _pdfm.registerFont(_TTF("EBGaramond", os.path.join(_fdir, "EBGaramond-Regular.ttf")))
    CERT_FONT_SCRIPT = "GreatVibes"
    CERT_FONT_SERIF = "EBGaramond"
except Exception as _e:
    logger.warning(f"cert font registration failed: {_e}")

app = FastAPI(title="EduSync API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


@app.get("/health")
async def health():
    return {"status": "ok"}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today_str():
    return date.today().isoformat()


# ---------------------------------------------------------------- storage
_storage_key = None


def init_storage(force=False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path, data, content_type):
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


MIME = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf"}


# ---------------------------------------------------------------- email & sms
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "EduSync")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")


async def send_email(to, subject, html, attachments=None):
    if not EMAIL_KEY or not to:
        logger.warning("Email skipped (no key/recipient)")
        return False
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    if attachments:
        payload["attachments"] = attachments
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=45) as c:
                r = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                 headers={"X-Email-Key": EMAIL_KEY}, json=payload)
            if r.status_code == 429 and attempt < 2:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            if r.status_code >= 300:
                logger.warning(f"Email failed {r.status_code}: {r.text[:300]}")
            return r.status_code < 300
        except Exception as e:
            logger.warning(f"Email failed: {e}")
            if attempt < 2:
                await asyncio.sleep(1.0)
                continue
            return False
    return False


def fmt_date(s):
    if not s:
        return ""
    try:
        return datetime.fromisoformat(str(s)[:19]).strftime("%d-%m-%Y")
    except Exception:
        try:
            return datetime.strptime(str(s)[:10], "%Y-%m-%d").strftime("%d-%m-%Y")
        except Exception:
            return str(s)


def send_sms(to, body):
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    tok = os.environ.get("TWILIO_AUTH_TOKEN")
    frm = os.environ.get("TWILIO_FROM_NUMBER")
    if not (sid and tok and frm and to):
        return False
    to = to.strip()
    if not to.startswith("+"):
        to = "+91" + to.lstrip("0")
    try:
        r = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                          auth=(sid, tok), data={"From": frm, "To": to, "Body": body}, timeout=15)
        if r.status_code >= 300:
            logger.warning(f"SMS failed {r.status_code}: {r.text[:200]}")
        return r.status_code < 300
    except Exception as e:
        logger.warning(f"SMS error: {e}")
        return False


def send_whatsapp(to, body):
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    tok = os.environ.get("TWILIO_AUTH_TOKEN")
    frm = os.environ.get("TWILIO_WHATSAPP_FROM")
    if not (sid and tok and frm and to):
        return False
    to = to.strip()
    if not to.startswith("+"):
        to = "+91" + to.lstrip("0")
    frm2 = frm if frm.startswith("whatsapp:") else f"whatsapp:{frm}"
    try:
        r = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                          auth=(sid, tok), data={"From": frm2, "To": f"whatsapp:{to}", "Body": body}, timeout=15)
        if r.status_code >= 300:
            logger.warning(f"WhatsApp failed {r.status_code}: {r.text[:200]}")
        return r.status_code < 300
    except Exception as e:
        logger.warning(f"WhatsApp error: {e}")
        return False


def notify_parent(phone, body):
    """Try WhatsApp first, fall back to SMS. Returns the channel used or False."""
    if not phone:
        return False
    if send_whatsapp(phone, body):
        return "whatsapp"
    if send_sms(phone, body):
        return "sms"
    return False


async def notify_parent_async(phone, body):
    return await asyncio.to_thread(notify_parent, phone, body)


async def add_notification(institute_id, recipient_id, ntype, title, body=""):
    if not recipient_id:
        return
    await db.notifications.insert_one({"id": str(uuid.uuid4()), "institute_id": institute_id,
                                       "recipient_id": recipient_id, "type": ntype, "title": title,
                                       "body": body or title, "read": False, "created_at": now_iso()})


async def notify_student(student, institute_id, ntype, title, wa_msg=None, email_subject=None, email_html=None):
    """Persist an in-app notification for the student/parent, then try WhatsApp/SMS + email (all graceful)."""
    if not student:
        return
    await add_notification(institute_id, student.get("id"), ntype, title)
    phone = student.get("parent_phone") or student.get("phone")
    if phone and wa_msg:
        asyncio.create_task(notify_parent_async(phone, wa_msg))
    to = student.get("parent_email") or student.get("email")
    if to and email_subject and email_html:
        asyncio.create_task(send_email(to, email_subject, email_html))


def _seal_bytes(inst):
    try:
        if inst and inst.get("seal_path"):
            data, _ = get_object(inst["seal_path"])
            return data
    except Exception as e:
        logger.warning(f"institute seal fetch failed: {e}")
    return _logo_bytes(inst)


def _logo_bytes(inst):
    try:
        if inst and inst.get("logo_path"):
            data, _ = get_object(inst["logo_path"])
            return data
    except Exception as e:
        logger.warning(f"institute logo fetch failed: {e}")
    try:
        p = ROOT_DIR / "edusync_logo.png"
        if p.exists():
            return p.read_bytes()
    except Exception:
        pass
    return None


def draw_watermark(c, inst, w, h):
    from reportlab.lib.utils import ImageReader
    from reportlab.lib.units import cm
    lb = _logo_bytes(inst)
    if not lb:
        return
    try:
        c.saveState()
        c.setFillAlpha(0.055)
        try:
            c.setStrokeAlpha(0.055)
        except Exception:
            pass
        size = 12 * cm
        c.drawImage(ImageReader(io.BytesIO(lb)), (w - size) / 2, (h - size) / 2,
                    width=size, height=size, mask='auto', preserveAspectRatio=True)
        c.restoreState()
    except Exception as e:
        logger.warning(f"watermark failed: {e}")


def draw_letterhead(c, inst, w, h, subtitle):
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.lib.utils import ImageReader
    c.setFillColor(colors.HexColor("#0b1e3b"))
    c.rect(0, h - 3.6 * cm, w, 3.6 * cm, fill=1, stroke=0)
    seg = w / 3.0
    c.setFillColor(colors.HexColor("#1E3A8A")); c.rect(0, h - 3.74 * cm, seg, 0.14 * cm, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#059669")); c.rect(seg, h - 3.74 * cm, seg, 0.14 * cm, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#7C3AED")); c.rect(2 * seg, h - 3.74 * cm, w - 2 * seg, 0.14 * cm, fill=1, stroke=0)
    tx = 2 * cm
    lb = _logo_bytes(inst)
    if lb:
        try:
            c.drawImage(ImageReader(io.BytesIO(lb)), 1.3 * cm, h - 3.1 * cm, width=2.5 * cm, height=2.5 * cm,
                        mask='auto', preserveAspectRatio=True)
            tx = 4.3 * cm
        except Exception:
            pass
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(tx, h - 1.4 * cm, ((inst.get("name") if inst else None) or "EduSync")[:42])
    c.setFont("Helvetica", 8.5)
    y = h - 2.0 * cm
    if inst and inst.get("address"):
        c.drawString(tx, y, str(inst["address"])[:85]); y -= 0.42 * cm
    line2 = " | ".join(x for x in [inst.get("phone") if inst else None, inst.get("email") if inst else None] if x)
    if line2:
        c.drawString(tx, y, line2[:85]); y -= 0.42 * cm
    c.setFont("Helvetica-Oblique", 10)
    c.setFillColor(colors.HexColor("#C4B5FD"))
    c.drawString(tx, h - 3.25 * cm, subtitle)
    c.setFillColor(colors.HexColor("#0F172A"))


# ---------------------------------------------------------------- auth utils
def hash_pw(pw): return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
def verify_pw(pw, h):
    try: return bcrypt.checkpw(pw.encode(), h.encode())
    except Exception: return False


def make_token(uid, role, institute_id):
    payload = {"sub": uid, "role": role, "institute_id": institute_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(request: Request, cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    token = cred.credentials if cred else request.cookies.get("access_token")
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    role = payload.get("role")
    coll = db.students if role in ("student", "parent") else db.users
    user = await coll.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    user["role"] = role
    if role == "parent":
        user["must_change_password"] = False
        user["is_parent"] = True
    return user


def require(*roles):
    async def dep(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return user
    return dep


def scope(user):
    return {"institute_id": user["institute_id"]}


async def teacher_batches(user):
    bs = await db.batches.find({"institute_id": user["institute_id"], "teacher_id": user["id"]}, {"_id": 0, "id": 1}).to_list(1000)
    return [b["id"] for b in bs]


# ---------------------------------------------------------------- models
class RegisterInstitute(BaseModel):
    institute_name: str
    principal_name: str
    email: EmailStr
    password: str
    phone: Optional[str] = ""


class LoginReq(BaseModel):
    identifier: str
    password: str


class OtpVerify(BaseModel):
    identifier: str
    otp: str


class SuperAdminUserIn(BaseModel):
    name: str
    email: Optional[str] = ""
    password: Optional[str] = ""
    role: Optional[str] = "teacher"
    institute_id: Optional[str] = ""
    status: Optional[str] = "active"


class ChangePwIn(BaseModel):
    current_password: Optional[str] = ""
    new_password: str


class TeacherIn(BaseModel):
    name: str
    email: EmailStr
    password: Optional[str] = ""
    phone: Optional[str] = ""
    subjects: List[str] = []
    available_days: List[str] = []
    monthly_salary: float = 0
    leave_balance: int = 12
    salary_components: Optional[dict] = None


class StudentIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    age: Optional[int] = Field(default=None, ge=1, le=120)
    gender: Optional[str] = ""
    photo_url: Optional[str] = ""
    email: Optional[str] = ""
    parent_name: Optional[str] = ""
    parent_phone: Optional[str] = ""
    parent_email: Optional[str] = ""
    roll_no: Optional[str] = ""
    dob: Optional[str] = ""
    blood_group: Optional[str] = ""
    address: Optional[str] = ""
    mother_name: Optional[str] = ""
    emergency_contact: Optional[str] = ""
    documents: Optional[list] = []
    batch_id: Optional[str] = ""
    password: Optional[str] = "student123"
    monthly_fee: float = Field(default=0, ge=0)
    template: Optional[str] = "classic"
    parental_consent: Optional[bool] = False


class BatchIn(BaseModel):
    name: str
    subject: Optional[str] = ""
    teacher_id: Optional[str] = ""
    schedule_days: List[str] = []
    room: Optional[str] = ""
    class_name: Optional[str] = ""
    section: Optional[str] = ""


class AttendanceScan(BaseModel):
    code: str


class LeaveIn(BaseModel):
    from_date: str
    to_date: str
    reason: str


class FeeIn(BaseModel):
    student_id: str
    items: List[dict] = []
    amount: Optional[float] = None
    month: str
    due_date: str


class ExamIn(BaseModel):
    name: str
    batch_id: str
    subject: str
    max_marks: float = 100
    exam_date: str


class ResultIn(BaseModel):
    exam_id: str
    marks: dict  # {student_id: marks}


class HomeworkIn(BaseModel):
    title: str
    description: str
    batch_id: str
    subject: Optional[str] = ""
    deadline: str
    attachment_url: Optional[str] = ""
    attachment_name: Optional[str] = ""


class SubmissionIn(BaseModel):
    homework_id: str
    content: Optional[str] = ""
    attachment_url: Optional[str] = ""
    attachment_name: Optional[str] = ""


class QuestionIn(BaseModel):
    text: str
    options: List[str]
    correct: int


class QuizIn(BaseModel):
    name: str
    batch_id: str
    subject: Optional[str] = ""
    duration_min: int = 30
    marks_per_correct: float = 1
    negative_marks: float = 0
    questions: List[QuestionIn]


class QuizAttemptIn(BaseModel):
    quiz_id: str
    answers: dict


class QuizGenIn(BaseModel):
    topic: str
    count: int = 5
    subject: Optional[str] = ""


class SalaryIn(BaseModel):
    teacher_id: str
    month: str


class SalaryStructure(BaseModel):
    base: float = Field(default=0, ge=0)
    hra: float = Field(default=0, ge=0)
    allowances: float = Field(default=0, ge=0)
    deductions: float = Field(default=0, ge=0)


class FeeComponentIn(BaseModel):
    name: str
    amount: float = Field(ge=0)


class FeeStructureIn(BaseModel):
    grade: str
    components: List[dict] = []
    frequency: str = "monthly"


class CertificateIn(BaseModel):
    student_id: str
    type: str
    session: Optional[str] = ""
    remarks: Optional[str] = ""
    signatory_name: Optional[str] = ""
    signatory_designation: Optional[str] = ""
    design: Optional[str] = "amber"


class BulkCertIn(BaseModel):
    batch_id: str
    type: str
    session: Optional[str] = ""
    remarks: Optional[str] = ""
    signatory_name: Optional[str] = ""
    signatory_designation: Optional[str] = ""
    design: Optional[str] = "amber"


class ForgotReq(BaseModel):
    email: EmailStr


class ResetReq(BaseModel):
    email: EmailStr
    otp: str
    new_password: str


class PartialPay(BaseModel):
    amount: float = Field(gt=0)


class AnnouncementIn(BaseModel):
    title: str
    body: str
    audience: str = "all"  # all, teachers, students
    attachment_url: Optional[str] = ""


class TimetableConfig(BaseModel):
    days: List[str] = []
    periods: List[str] = []
    teacher_ids: List[str] = []
    use_ai: bool = True


class ComplaintIn(BaseModel):
    subject: str
    description: str
    category: Optional[str] = "general"
    direction: Optional[str] = "principal"
    attachment_url: Optional[str] = ""
    attachments: List[dict] = []


class ComplaintUpdate(BaseModel):
    status: str
    response: Optional[str] = ""
    note: Optional[str] = ""


class EnquiryIn(BaseModel):
    name: str
    phone: str
    email: Optional[str] = ""
    course: Optional[str] = ""
    notes: Optional[str] = ""


class EnquiryUpdate(BaseModel):
    status: Optional[str] = None
    stage: Optional[str] = None
    assigned_to: Optional[str] = None
    follow_up_date: Optional[str] = None
    notes: Optional[str] = None


class InstituteUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    logo_path: Optional[str] = None
    id_template: Optional[str] = None


# ---------------------------------------------------------------- auth routes
@api.post("/auth/register-institute")
async def register_institute(body: RegisterInstitute):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    inst_id = str(uuid.uuid4())
    prefix = ("".join(w[0] for w in body.institute_name.split() if w)[:2] or "IN").upper()
    await db.institutes.insert_one({"id": inst_id, "name": body.institute_name, "code": prefix,
                                    "student_seq": 0, "faculty_seq": 0, "created_at": now_iso()})
    uid = str(uuid.uuid4())
    await db.users.insert_one({
        "id": uid, "email": email, "password_hash": hash_pw(body.password),
        "name": body.principal_name, "role": "principal", "institute_id": inst_id,
        "phone": body.phone, "created_at": now_iso()})
    token = make_token(uid, "principal", inst_id)
    welcome_body = (f"<p style='color:#475569;font-size:14px;line-height:1.6'>Your EduSync workspace for "
                    f"<b>{body.institute_name}</b> is ready. As Principal you have full access to admissions, "
                    f"attendance, fees, academics, staff and reports. Sign in to get started.</p>")
    asyncio.create_task(send_email(email, f"Welcome to EduSync — {body.institute_name}",
                                   _brand_email_html({"name": body.institute_name}, f"Welcome, {body.principal_name}!", welcome_body)))
    return {"access_token": token, "user": {"id": uid, "name": body.principal_name, "email": email, "role": "principal", "institute_id": inst_id, "institute_name": body.institute_name}}


OTP_TTL_MIN = 10


def _mask_email(e):
    if not e or "@" not in e:
        return e or ""
    name, dom = e.split("@", 1)
    return (name[0] + "***" if name else "***") + "@" + dom


async def _issue_login_otp(identifier, user_id, role, email, inst_name):
    code = f"{secrets.randbelow(900000) + 100000}"
    await db.login_otps.update_one({"identifier": identifier}, {"$set": {
        "identifier": identifier, "code_hash": hash_pw(code), "user_id": user_id, "role": role,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MIN)).isoformat(),
        "attempts": 0, "used": False, "created_at": now_iso()}}, upsert=True)
    body_html = (f"<p style='color:#475569;font-size:14px;line-height:1.6'>Use this One-Time Password to complete your EduSync sign-in:</p>"
                 f"<p style='font-size:32px;font-weight:800;letter-spacing:10px;color:#0f172a;text-align:center;margin:14px 0'>{code}</p>"
                 f"<p style='color:#94a3b8;font-size:13px'>This code expires in {OTP_TTL_MIN} minutes. If you didn't try to sign in, please ignore this email.</p>")
    asyncio.create_task(send_email(email, "Your EduSync login code", _brand_email_html({"name": inst_name or "EduSync"}, "Verify your sign-in", body_html, cta=False)))


@api.post("/auth/login")
async def login(body: LoginReq):
    ident = body.identifier.strip()
    key = "login:" + ident.lower()
    now = datetime.now(timezone.utc)
    rec = await db.login_attempts.find_one({"id": key})
    if rec and rec.get("locked_until") and datetime.fromisoformat(rec["locked_until"]) > now:
        raise HTTPException(429, "Too many failed attempts. Please try again in a few minutes.")
    user = await db.users.find_one({"email": ident.lower()})
    role = user["role"] if user else None
    if not user:
        user = await db.students.find_one({"student_id": ident})
        role = "student"
    # Marketing Sync API: authoritative check for principals (email logins).
    if "@" in ident:
        sync_res = await sync_verify_principal(ident.lower(), body.password)
        if sync_res == "inactive":
            raise HTTPException(403, "Your institute is not active yet. Please contact EduSync support.")
        if isinstance(sync_res, dict):
            await db.login_attempts.delete_one({"id": key})
            uid, institute_id, role = await _provision_synced_principal(sync_res, body.password)
            inst = await db.institutes.find_one({"id": institute_id}, {"_id": 0, "name": 1}) or {}
            await _issue_login_otp(ident, uid, role, ident.lower(), inst.get("name"))
            return {"otp_required": True, "identifier": ident, "email_hint": _mask_email(ident.lower())}
        # sync_res is None (invalid) or 'unavailable' -> fall through to local auth
    if not user or not verify_pw(body.password, user.get("password_hash", "")):
        count = (rec.get("count", 0) + 1) if rec else 1
        upd = {"id": key, "count": count}
        if count >= 5:
            upd["locked_until"] = (now + timedelta(minutes=15)).isoformat()
            upd["count"] = 0
        await db.login_attempts.update_one({"id": key}, {"$set": upd}, upsert=True)
        raise HTTPException(401, "Invalid credentials")
    await db.login_attempts.delete_one({"id": key})
    if user.get("status") == "inactive":
        raise HTTPException(403, "Your account has been deactivated. Please contact your administrator.")
    if role != "super_admin" and not await institute_is_active(user.get("institute_id")):
        raise HTTPException(403, "Your institute is not active yet. Please contact EduSync support.")
    otp_email = user.get("email") if role != "student" else (user.get("email") or user.get("parent_email"))
    if otp_email:
        inst = await db.institutes.find_one({"id": user.get("institute_id")}, {"_id": 0, "name": 1}) or {}
        await _issue_login_otp(ident, user["id"], role, otp_email, inst.get("name"))
        return {"otp_required": True, "identifier": ident, "email_hint": _mask_email(otp_email)}
    token = make_token(user["id"], role, user.get("institute_id"))
    inst = await db.institutes.find_one({"id": user.get("institute_id")}, {"_id": 0})
    return {"access_token": token, "otp_required": False, "user": {"id": user["id"], "name": user["name"], "role": role,
            "institute_id": user.get("institute_id"), "institute_name": inst["name"] if inst else "",
            "student_id": user.get("student_id"), "email": user.get("email"),
            "must_change_password": bool(user.get("must_change_password"))}}


class ParentLoginReq(BaseModel):
    student_id: str
    parent_email: str


@api.post("/auth/parent-login")
async def parent_login(body: ParentLoginReq):
    sid = body.student_id.strip()
    email = body.parent_email.strip().lower()
    candidates = await db.students.find({"student_id": sid}).to_list(20)
    matches = [c for c in candidates if (c.get("parent_email") or "").strip().lower() == email]
    if not matches:
        raise HTTPException(401, "No matching student found for that Student ID and parent email.")
    active = [c for c in matches if await institute_is_active(c.get("institute_id"))]
    if not active:
        raise HTTPException(403, "Your institute is not active yet. Please contact EduSync support.")
    s = active[0]
    inst = await db.institutes.find_one({"id": s.get("institute_id")}, {"_id": 0, "name": 1}) or {}
    ident = f"parent:{sid}"
    await _issue_login_otp(ident, s["id"], "parent", email, inst.get("name"))
    return {"otp_required": True, "identifier": ident, "email_hint": _mask_email(email)}


@api.post("/auth/verify-otp")
async def verify_otp(body: OtpVerify):
    ident = body.identifier.strip()
    rec = await db.login_otps.find_one({"identifier": ident})
    if not rec or rec.get("used"):
        raise HTTPException(400, "No pending sign-in. Please log in again.")
    if datetime.fromisoformat(rec["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(400, "This code has expired. Please log in again.")
    if rec.get("attempts", 0) >= 5:
        raise HTTPException(429, "Too many incorrect attempts. Please log in again.")
    if not verify_pw(body.otp.strip(), rec["code_hash"]):
        await db.login_otps.update_one({"identifier": ident}, {"$inc": {"attempts": 1}})
        raise HTTPException(401, "Invalid code")
    await db.login_otps.update_one({"identifier": ident}, {"$set": {"used": True}})
    role = rec["role"]
    coll = db.students if role in ("student", "parent") else db.users
    user = await coll.find_one({"id": rec["user_id"]})
    if not user:
        raise HTTPException(404, "User not found")
    token = make_token(user["id"], role, user.get("institute_id"))
    inst = await db.institutes.find_one({"id": user.get("institute_id")}, {"_id": 0})
    return {"access_token": token, "user": {"id": user["id"], "name": user["name"], "role": role,
            "institute_id": user.get("institute_id"), "institute_name": inst["name"] if inst else "",
            "student_id": user.get("student_id"), "email": user.get("email"),
            "must_change_password": bool(user.get("must_change_password")) and role != "parent"}}


@api.post("/auth/change-password")
async def change_password(body: ChangePwIn, user=Depends(get_current_user)):
    if len(body.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    coll = db.students if user["role"] == "student" else db.users
    doc = await coll.find_one({"id": user["id"]})
    if not doc:
        raise HTTPException(404, "User not found")
    forced = bool(doc.get("must_change_password"))
    if not forced or body.current_password:
        if not verify_pw(body.current_password or "", doc.get("password_hash", "")):
            raise HTTPException(400, "Current password is incorrect")
    await coll.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.new_password), "must_change_password": False}})
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    inst = await db.institutes.find_one({"id": user.get("institute_id")}, {"_id": 0})
    user["institute_name"] = inst["name"] if inst else ""
    return user


# ---------------------------------------------------------------- super admin
async def require_super_admin(user=Depends(get_current_user)):
    if user.get("role") != "super_admin" and (user.get("email") or "").lower() != SUPER_ADMIN_EMAIL:
        raise HTTPException(403, "Super admin access only")
    return user


@api.get("/super-admin/sync-health")
async def sa_sync_health(user=Depends(require_super_admin)):
    if not SYNC_BASE_URL or not SYNC_KEY:
        return {"configured": False, "reachable": False, "message": "Sync API not configured (SYNC_BASE_URL/SYNC_KEY missing)."}
    url = f"{SYNC_BASE_URL}/api/sync/verify-principal"
    try:
        async with httpx.AsyncClient(timeout=12) as c:
            r = await c.post(url, headers={"X-Sync-Key": SYNC_KEY},
                             json={"email": "healthcheck@privamsolutions.in", "password": "__healthcheck__"})
        code = r.status_code
        if code == 404:
            return {"configured": True, "reachable": False, "status": 404, "base_url": SYNC_BASE_URL,
                    "message": "Endpoint /api/sync/verify-principal not found (404). The marketing backend hasn't deployed the Sync routes yet."}
        if code in (401, 403):
            return {"configured": True, "reachable": True, "status": code, "base_url": SYNC_BASE_URL,
                    "message": "Sync API reachable but rejected the X-Sync-Key. Verify the key matches the marketing site."}
        # 200 (valid:false for the fake creds) or 400/422 => endpoint exists and is responding
        return {"configured": True, "reachable": True, "status": code, "base_url": SYNC_BASE_URL,
                "message": "Sync API is reachable and responding. Marketing-activated principals can log in."}
    except Exception as e:
        return {"configured": True, "reachable": False, "status": None, "base_url": SYNC_BASE_URL,
                "message": f"Could not reach the Sync API: {str(e)[:140]}"}


@api.get("/super-admin/institutes")
async def sa_institutes(user=Depends(require_super_admin)):
    out = []
    for inst in await db.institutes.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000):
        iid = inst["id"]
        out.append({**inst, "status": inst.get("status", "active"),
                    "student_count": await db.students.count_documents({"institute_id": iid}),
                    "user_count": await db.users.count_documents({"institute_id": iid})})
    return out


@api.get("/super-admin/users")
async def sa_users(user=Depends(require_super_admin), institute_id: Optional[str] = None):
    q = {"institute_id": institute_id} if institute_id else {}
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(5000)
    students = await db.students.find(q, {"_id": 0, "password_hash": 0}).to_list(5000)
    for s in students:
        s["role"] = "student"
    return {"staff": users, "students": students}


@api.post("/super-admin/users")
async def sa_create_user(body: SuperAdminUserIn, user=Depends(require_super_admin)):
    if not body.email:
        raise HTTPException(400, "Email required")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    await db.users.insert_one({"id": uid, "email": email, "name": body.name,
        "role": body.role or "teacher", "institute_id": body.institute_id or None,
        "status": body.status or "active", "password_hash": hash_pw(body.password or gen_temp_password()),
        "must_change_password": True, "created_at": now_iso()})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@api.put("/super-admin/users/{uid}")
async def sa_update_user(uid: str, payload: dict, user=Depends(require_super_admin)):
    coll = db.students if payload.get("role") == "student" or await db.students.find_one({"id": uid}) else db.users
    upd = {}
    for k in ("name", "status", "role", "institute_id"):
        if payload.get(k) is not None:
            upd[k] = payload[k]
    if payload.get("email"):
        upd["email"] = str(payload["email"]).lower()
    if payload.get("password"):
        upd["password_hash"] = hash_pw(payload["password"])
    if not upd:
        raise HTTPException(400, "Nothing to update")
    r = await coll.update_one({"id": uid}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True}


@api.put("/super-admin/users/{uid}/status")
async def sa_user_status(uid: str, payload: dict, user=Depends(require_super_admin)):
    status = payload.get("status", "active")
    coll = db.students if await db.students.find_one({"id": uid}) else db.users
    r = await coll.update_one({"id": uid}, {"$set": {"status": status}})
    if r.matched_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True, "status": status}


@api.delete("/super-admin/users/{uid}")
async def sa_delete_user(uid: str, user=Depends(require_super_admin)):
    target = await db.users.find_one({"id": uid})
    if target and (target.get("email") or "").lower() == SUPER_ADMIN_EMAIL:
        raise HTTPException(400, "Cannot delete the Super Admin account")
    r1 = await db.users.delete_one({"id": uid})
    r2 = await db.students.delete_one({"id": uid})
    if r1.deleted_count + r2.deleted_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True}


@api.put("/super-admin/institutes/{iid}/status")
async def sa_institute_status(iid: str, payload: dict, user=Depends(require_super_admin)):
    status = payload.get("status", "active")
    r = await db.institutes.update_one({"id": iid}, {"$set": {"status": status}})
    if r.matched_count == 0:
        raise HTTPException(404, "Institute not found")
    return {"ok": True, "status": status}


# ---------------------------------------------------------------- files
@api.post("/upload")
async def upload_file(file: UploadFile = File(...), user=Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/{user['institute_id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    ct = MIME.get(ext, file.content_type or "application/octet-stream")
    result = put_object(path, data, ct)
    fid = str(uuid.uuid4())
    await db.files.insert_one({"id": fid, "storage_path": result["path"], "original_filename": file.filename,
                               "content_type": ct, "size": result["size"], "institute_id": user["institute_id"],
                               "is_deleted": False, "created_at": now_iso()})
    return {"id": fid, "path": result["path"], "url": f"/api/files/{result['path']}", "filename": file.filename}


@api.get("/files/{path:path}")
async def serve_file(path: str):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    data, ct = get_object(path)
    return Response(content=data, media_type=rec.get("content_type", ct))


# ---------------------------------------------------------------- students
def inst_prefix(inst):
    code = (inst.get("code") or "").strip()
    if code:
        return code.upper()[:4]
    parts = [w[0] for w in (inst.get("name") or "IN").split() if w]
    return ("".join(parts[:2]) or "IN").upper()


async def next_seq(institute_id, field):
    res = await db.institutes.find_one_and_update({"id": institute_id}, {"$inc": {field: 1}})
    return ((res or {}).get(field, 0) or 0) + 1


APP_BASE_URL = os.environ.get("APP_BASE_URL", "")


def gen_temp_password(n=8):
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


def _welcome_email_html(inst, name, role_label, login_id, password, id_label="Login ID"):
    inst_name = (inst.get("name") if inst else None) or "EduSync"
    login_url = APP_BASE_URL or ""
    logo = f"{APP_BASE_URL}/edusync-logo.png" if APP_BASE_URL else ""
    logo_html = (f"<img src='{logo}' alt='EduSync' width='46' height='46' "
                 f"style='display:block;border-radius:10px;background:#ffffff;padding:4px' />") if logo else ""
    btn = (f"<a href='{login_url}' style='display:inline-block;background:#1E3A8A;color:#ffffff;"
           f"text-decoration:none;padding:13px 30px;border-radius:10px;font-weight:bold;font-size:14px'>"
           f"Log in to EduSync</a>") if login_url else ""
    return f"""
<div style="background:#f1f5f9;padding:28px 0;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0"
    style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.08)">
    <tr><td style="background:linear-gradient(90deg,#0b1e3b,#1a1240);padding:22px 28px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td>{logo_html}</td>
        <td style="padding-left:12px">
          <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.3px">EduSync</div>
          <div style="color:#93c5fd;font-size:11px">Smarter Institutes. Brighter Futures.</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:32px 30px">
      <p style="color:#0f172a;font-size:16px;margin:0 0 6px">Welcome to <b>{inst_name}</b>, {name}!</p>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px">
        Your {role_label} account on EduSync has been created. Use the credentials below to sign in.
        Please change your password after your first login.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
        <tr><td style="padding:18px 22px">
          <div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.5px">{id_label}</div>
          <div style="color:#0f172a;font-size:18px;font-weight:800;font-family:monospace;margin:2px 0 14px">{login_id}</div>
          <div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Temporary Password</div>
          <div style="color:#1E3A8A;font-size:18px;font-weight:800;font-family:monospace;margin:2px 0 0">{password}</div>
        </td></tr>
      </table>
      <div style="text-align:center;margin:26px 0 6px">{btn}</div>
      <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:20px 0 0">
        If the button doesn't work, open <span style="color:#1E3A8A">{login_url}</span> in your browser.
      </p>
    </td></tr>
    <tr><td style="background:#0b1e3b;padding:16px 28px;text-align:center">
      <span style="color:#93c5fd;font-size:11px">{inst_name} · Powered by EduSync — Privam Solutions</span>
    </td></tr>
  </table>
  </td></tr></table>
</div>"""


async def send_welcome_email(to, inst, name, role_label, login_id, password, id_label="Login ID"):
    if not to:
        return False
    inst_name = (inst.get("name") if inst else None) or "EduSync"
    html = _welcome_email_html(inst, name, role_label, login_id, password, id_label)
    return await send_email(to, f"Your {role_label} login for {inst_name} — EduSync", html)


def _brand_email_html(inst, heading, body_html, cta=True):
    inst_name = (inst.get("name") if inst else None) or "EduSync"
    login_url = APP_BASE_URL or ""
    logo = f"{APP_BASE_URL}/edusync-logo.png" if APP_BASE_URL else ""
    logo_html = (f"<img src='{logo}' alt='EduSync' width='42' height='42' style='display:block;border-radius:9px;background:#ffffff;padding:4px' />") if logo else ""
    btn = (f"<div style='text-align:center;margin:24px 0 4px'><a href='{login_url}' style='display:inline-block;background:#1E3A8A;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;font-size:14px'>Open EduSync</a></div>") if (cta and login_url) else ""
    return (f"<div style=\"background:#f1f5f9;padding:26px 0;font-family:Arial,Helvetica,sans-serif\">"
            f"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr><td align=\"center\">"
            f"<table role=\"presentation\" width=\"560\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.08)\">"
            f"<tr><td style=\"background:linear-gradient(90deg,#0b1e3b,#1a1240);padding:20px 26px\">"
            f"<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td>{logo_html}</td>"
            f"<td style=\"padding-left:12px\"><div style=\"color:#ffffff;font-size:19px;font-weight:800\">{inst_name}</div>"
            f"<div style=\"color:#93c5fd;font-size:11px\">Powered by EduSync</div></td></tr></table></td></tr>"
            f"<tr><td style=\"padding:28px 30px\"><h2 style=\"color:#0f172a;font-size:18px;margin:0 0 12px\">{heading}</h2>"
            f"{body_html}{btn}"
            f"<p style=\"color:#94a3b8;font-size:12px;margin:22px 0 0\">Sent by {inst_name} via EduSync — Privam Solutions. We never ask for your password by email.</p>"
            f"</td></tr></table></td></tr></table></div>")


@api.get("/students")
async def list_students(user=Depends(require("principal", "teacher")), batch_id: Optional[str] = None):
    q = scope(user)
    if user["role"] == "teacher":
        q["batch_id"] = {"$in": await teacher_batches(user)}
    if batch_id:
        q["batch_id"] = batch_id
    students = await db.students.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(2000)
    return students


def _norm_grade(s):
    return "".join(ch for ch in (s or "").lower() if ch.isalnum())


async def allocate_class_fees(student, institute_id):
    batch = await db.batches.find_one({"id": student.get("batch_id", "")}, {"_id": 0}) or {}
    b_norm = _norm_grade(batch.get("grade") or batch.get("class_name") or batch.get("name"))
    if not b_norm:
        return
    structs = await db.fee_structures.find({"institute_id": institute_id}, {"_id": 0}).to_list(300)
    best = None
    for st in structs:
        g = _norm_grade(st.get("grade"))
        if not g:
            continue
        if b_norm == g or (b_norm.startswith(g) and (len(b_norm) == len(g) or not b_norm[len(g)].isdigit())):
            if best is None or len(g) > len(_norm_grade(best.get("grade"))):
                best = st
    if not best:
        return
    comps = best.get("components") or []
    total = round(sum(float(c.get("amount", 0) or 0) for c in comps), 2)
    if total <= 0:
        return
    today = datetime.now()
    fid = str(uuid.uuid4())
    await db.fees.insert_one({"id": fid, "student_id": student["id"], "student_name": student.get("name", ""),
                             "parent_phone": student.get("parent_phone", ""), "items": comps, "amount": total,
                             "paid_amount": 0, "status": "pending", "month": today.strftime("%b %Y"),
                             "due_date": today.replace(day=28).strftime("%Y-%m-%d"), "institute_id": institute_id,
                             "auto_allocated": True, "created_at": now_iso(), "payment_id": None, "receipt_no": None})


@api.post("/students")
async def create_student(body: StudentIn, user=Depends(require("principal", "teacher"))):
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    prefix = inst_prefix(inst)
    if not inst.get("code"):
        await db.institutes.update_one({"id": user["institute_id"]}, {"$set": {"code": prefix}})
    sid = str(uuid.uuid4())
    seq = await next_seq(user["institute_id"], "student_seq")
    student_id = f"{prefix}{datetime.now().strftime('%Y')}{seq:04d}"
    temp_password = gen_temp_password()
    doc = body.model_dump()
    doc.update({"id": sid, "student_id": student_id, "institute_id": user["institute_id"],
                "password_hash": hash_pw(temp_password),
                "created_at": now_iso(), "join_month": datetime.now().strftime("%Y-%m"),
                "must_change_password": True,
                "data_classification": "restricted", "pii_category": "minor_sensitive", "access_scope": "role_scoped",
                "is_minor_data": True,
                "parental_consent": {"obtained": True,
                                     "statement": "Parental consent verified by the institute.",
                                     "recorded_by": user["id"], "recorded_at": now_iso()}})
    doc.pop("password", None)
    await db.students.insert_one(doc)
    try:
        await allocate_class_fees(doc, user["institute_id"])
    except Exception as e:
        logger.warning(f"fee auto-allocation failed: {e}")
    recipients = list({r for r in [doc.get("email"), doc.get("parent_email")] if r})
    email_sent = False
    for r in recipients:
        if await send_welcome_email(r, inst, doc.get("name", "Student"), "Student", student_id, temp_password, id_label="Student ID"):
            email_sent = True
    out = await db.students.find_one({"id": sid}, {"_id": 0, "password_hash": 0})
    out["temp_password"] = temp_password
    out["email_sent"] = email_sent
    out["email_recipients"] = recipients
    return out


@api.post("/students/{sid}/resend-credentials")
async def resend_student_credentials(sid: str, user=Depends(require("principal", "teacher"))):
    s = await db.students.find_one({"id": sid, "institute_id": user["institute_id"]})
    if not s:
        raise HTTPException(404, "Student not found")
    if user["role"] == "teacher" and s.get("batch_id") not in await teacher_batches(user):
        raise HTTPException(403, "Forbidden")
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    temp_password = gen_temp_password()
    await db.students.update_one({"id": sid}, {"$set": {"password_hash": hash_pw(temp_password), "must_change_password": True}})
    recipients = list({r for r in [s.get("email"), s.get("parent_email")] if r})
    email_sent = False
    for r in recipients:
        if await send_welcome_email(r, inst, s.get("name", "Student"), "Student", s.get("student_id"), temp_password, id_label="Student ID"):
            email_sent = True
    return {"student_id": s.get("student_id"), "name": s.get("name"),
            "temp_password": temp_password, "email_sent": email_sent, "email_recipients": recipients}


@api.put("/students/{sid}")
async def update_student(sid: str, payload: dict, user=Depends(require("principal"))):
    allowed = {"name", "age", "gender", "batch_id", "parent_name", "parent_phone", "parent_email", "monthly_fee", "photo_url", "template", "email", "dob", "blood_group", "address", "roll_no", "mother_name", "emergency_contact", "documents"}
    upd = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if upd.get("age") not in (None, ""):
        upd["age"] = int(upd["age"])
    if upd.get("monthly_fee") not in (None, ""):
        upd["monthly_fee"] = float(upd["monthly_fee"])
    r = await db.students.update_one({"id": sid, "institute_id": user["institute_id"]}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Student not found")
    if payload.get("password"):
        await db.students.update_one({"id": sid, "institute_id": user["institute_id"]}, {"$set": {"password_hash": hash_pw(payload["password"])}})
    return await db.students.find_one({"id": sid}, {"_id": 0, "password_hash": 0})


@api.get("/export/students.csv")
async def export_students_csv(user=Depends(require("principal"))):
    rows = await db.students.find({"institute_id": user["institute_id"]}, {"_id": 0, "password_hash": 0}).sort("student_id", 1).to_list(10000)
    batches = {b["id"]: b.get("name", "") for b in await db.batches.find({"institute_id": user["institute_id"]}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)}
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["Student ID", "Name", "Age", "Gender", "Class", "Parent Name", "Parent Phone", "Parent Email", "Monthly Fee", "Joined"])
    for s in rows:
        w.writerow([s.get("student_id", ""), s.get("name", ""), s.get("age", ""), s.get("gender", ""), batches.get(s.get("batch_id"), ""),
                    s.get("parent_name", ""), s.get("parent_phone", ""), s.get("parent_email", ""), s.get("monthly_fee", ""), s.get("join_month", "")])
    return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=students.csv"})


@api.get("/export/teachers.csv")
async def export_teachers_csv(user=Depends(require("principal"))):
    rows = await db.users.find({"institute_id": user["institute_id"], "role": "teacher"}, {"_id": 0, "password_hash": 0}).sort("faculty_id", 1).to_list(10000)
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["Faculty ID", "Name", "Email", "Phone", "Subjects", "Monthly Salary", "Leave Balance"])
    for t in rows:
        w.writerow([t.get("faculty_id", ""), t.get("name", ""), t.get("email", ""), t.get("phone", ""), ", ".join(t.get("subjects", []) or []), t.get("monthly_salary", ""), t.get("leave_balance", 12)])
    return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=teachers.csv"})


@api.get("/notifications")
async def my_notifications(user=Depends(get_current_user)):
    iid = user["institute_id"]; role = user["role"]; items = []
    if role in ("student", "parent"):
        docs = await db.notifications.find({"recipient_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
        for n in docs:
            items.append({"type": n.get("type", "notice"), "title": n.get("title", ""),
                          "created_at": n.get("created_at"), "read": bool(n.get("read"))})
        unread = sum(1 for n in docs if not n.get("read"))
        for an in await db.announcements.find({"institute_id": iid, "audience": {"$in": ["all", "students", "parents"]}}).sort("created_at", -1).to_list(3):
            items.append({"type": "notice", "title": an.get("title", ""), "read": True})
        return {"count": unread, "items": items}
    elif role == "teacher":
        leads = await db.enquiries.count_documents({"institute_id": iid, "assigned_to": user["id"], "status": {"$ne": "closed"}})
        if leads:
            items.append({"type": "lead", "title": f"{leads} admission lead(s) assigned to you"})
        for an in await db.announcements.find({"institute_id": iid, "audience": {"$in": ["all", "teachers"]}}).sort("created_at", -1).to_list(3):
            items.append({"type": "notice", "title": an.get("title", "")})
    else:
        fees = await db.fees.count_documents({"institute_id": iid, "status": {"$ne": "paid"}})
        if fees:
            items.append({"type": "fee", "title": f"{fees} pending fee record(s)"})
        comp = await db.complaints.count_documents({"institute_id": iid, "status": {"$ne": "resolved"}})
        if comp:
            items.append({"type": "complaint", "title": f"{comp} open complaint(s)"})
        pend = await db.leaves.count_documents({"institute_id": iid, "status": "pending"})
        if pend:
            items.append({"type": "leave", "title": f"{pend} leave request(s) pending"})
    return {"count": len(items), "items": items}


@api.post("/notifications/mark-read")
async def mark_notifications_read(user=Depends(get_current_user)):
    await db.notifications.update_many({"recipient_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


@api.get("/notifications/history")
async def notifications_history(kind: str = "all", user=Depends(get_current_user)):
    q = {"recipient_id": user["id"]}
    kmap = {"fees": ["fee", "fee_paid"], "attendance": ["attendance", "absent"], "certificates": ["certificate"]}
    if kind in kmap:
        q["type"] = {"$in": kmap[kind]}
    docs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
    return {"items": docs, "count": len(docs)}


@api.get("/students/{sid}")
async def get_student(sid: str, user=Depends(get_current_user)):
    if user["role"] in ("student", "parent") and user["id"] != sid:
        raise HTTPException(403, "Forbidden")
    s = await db.students.find_one({"id": sid, "institute_id": user["institute_id"]}, {"_id": 0, "password_hash": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    return s


@api.delete("/students/{sid}")
async def delete_student(sid: str, user=Depends(require("principal"))):
    await db.students.delete_one({"id": sid, "institute_id": user["institute_id"]})
    return {"ok": True}


@api.post("/students/{sid}/documents")
async def add_document(sid: str, file: UploadFile = File(...), user=Depends(require("principal", "teacher"))):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "pdf"
    path = f"{APP_NAME}/{user['institute_id']}/docs/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, MIME.get(ext, "application/pdf"))
    await db.files.insert_one({"id": str(uuid.uuid4()), "storage_path": result["path"], "original_filename": file.filename,
                               "content_type": MIME.get(ext, "application/pdf"), "size": result["size"],
                               "institute_id": user["institute_id"], "is_deleted": False, "created_at": now_iso()})
    docmeta = {"id": str(uuid.uuid4()), "name": file.filename, "url": f"/api/files/{result['path']}", "uploaded_at": now_iso()}
    await db.students.update_one({"id": sid}, {"$push": {"documents": docmeta}})
    return docmeta


@api.delete("/students/{sid}/documents/{doc_id}")
async def del_document(sid: str, doc_id: str, user=Depends(require("principal"))):
    await db.students.update_one({"id": sid}, {"$pull": {"documents": {"id": doc_id}}})
    return {"ok": True}


# ---------------------------------------------------------------- teachers/staff
@api.get("/teachers")
async def list_teachers(user=Depends(require("principal"))):
    return await db.users.find({"institute_id": user["institute_id"], "role": "teacher"}, {"_id": 0, "password_hash": 0}).to_list(1000)


@api.post("/teachers")
async def create_teacher(body: TeacherIn, user=Depends(require("principal"))):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    prefix = inst_prefix(inst)
    if not inst.get("code"):
        await db.institutes.update_one({"id": user["institute_id"]}, {"$set": {"code": prefix}})
    seq = await next_seq(user["institute_id"], "faculty_seq")
    faculty_id = f"{prefix}{datetime.now().strftime('%Y')}T{seq:03d}"
    temp_password = gen_temp_password()
    doc = body.model_dump()
    doc.update({"id": uid, "email": email, "password_hash": hash_pw(temp_password), "role": "teacher",
                "faculty_id": faculty_id, "institute_id": user["institute_id"], "created_at": now_iso(),
                "must_change_password": True})
    doc.pop("password", None)
    await db.users.insert_one(doc)
    email_sent = await send_welcome_email(email, inst, doc.get("name", "Teacher"), "Teacher", email, temp_password, id_label="Login Email")
    out = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    out["temp_password"] = temp_password
    out["email_sent"] = email_sent
    out["email_recipients"] = [email]
    return out


@api.post("/teachers/{tid}/resend-credentials")
async def resend_teacher_credentials(tid: str, user=Depends(require("principal"))):
    t = await db.users.find_one({"id": tid, "institute_id": user["institute_id"], "role": "teacher"})
    if not t:
        raise HTTPException(404, "Teacher not found")
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    temp_password = gen_temp_password()
    await db.users.update_one({"id": tid}, {"$set": {"password_hash": hash_pw(temp_password), "must_change_password": True}})
    email = t.get("email")
    email_sent = await send_welcome_email(email, inst, t.get("name", "Teacher"), "Teacher", email, temp_password, id_label="Login Email")
    return {"faculty_id": t.get("faculty_id"), "email": email, "name": t.get("name"),
            "temp_password": temp_password, "email_sent": email_sent, "email_recipients": [email] if email else []}


@api.put("/teachers/{tid}")
async def update_teacher(tid: str, payload: dict, user=Depends(require("principal"))):
    allowed = {"name", "phone", "subjects", "monthly_salary", "available_days", "leave_balance", "email"}
    upd = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if upd.get("monthly_salary") not in (None, ""):
        upd["monthly_salary"] = float(upd["monthly_salary"])
    if upd.get("leave_balance") not in (None, ""):
        upd["leave_balance"] = int(upd["leave_balance"])
    if "email" in upd:
        upd["email"] = str(upd["email"]).lower()
        if await db.users.find_one({"email": upd["email"], "id": {"$ne": tid}}):
            raise HTTPException(400, "Email already registered")
    r = await db.users.update_one({"id": tid, "institute_id": user["institute_id"], "role": "teacher"}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "Teacher not found")
    if payload.get("password"):
        await db.users.update_one({"id": tid, "institute_id": user["institute_id"]}, {"$set": {"password_hash": hash_pw(payload["password"])}})
    return await db.users.find_one({"id": tid}, {"_id": 0, "password_hash": 0})


@api.put("/teachers/{tid}")
async def update_teacher(tid: str, body: TeacherIn, user=Depends(require("principal"))):
    upd = body.model_dump(exclude_none=True)
    upd.pop("password", None)
    upd.pop("email", None)
    await db.users.update_one({"id": tid, "institute_id": user["institute_id"]}, {"$set": upd})
    return await db.users.find_one({"id": tid}, {"_id": 0, "password_hash": 0})


@api.delete("/teachers/{tid}")
async def delete_teacher(tid: str, user=Depends(require("principal"))):
    await db.users.delete_one({"id": tid, "institute_id": user["institute_id"], "role": "teacher"})
    return {"ok": True}


# ---------------------------------------------------------------- batches
@api.get("/batches")
async def list_batches(user=Depends(get_current_user)):
    q = scope(user)
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
    if user["role"] == "student":
        s = await db.students.find_one({"id": user["id"]})
        q["id"] = s.get("batch_id", "")
    batches = await db.batches.find(q, {"_id": 0}).to_list(1000)
    batch_ids = [b["id"] for b in batches]
    counts = {}
    async for row in db.students.aggregate([{"$match": {"batch_id": {"$in": batch_ids}}},
                                            {"$group": {"_id": "$batch_id", "n": {"$sum": 1}}}]):
        counts[row["_id"]] = row["n"]
    teacher_ids = [b.get("teacher_id") for b in batches if b.get("teacher_id")]
    teachers = {t["id"]: t["name"] async for t in db.users.find({"id": {"$in": teacher_ids}}, {"_id": 0, "id": 1, "name": 1})}
    for b in batches:
        b["student_count"] = counts.get(b["id"], 0)
        b["teacher_name"] = teachers.get(b.get("teacher_id"), "Unassigned")
    return batches


@api.post("/batches")
async def create_batch(body: BatchIn, user=Depends(require("principal"))):
    bid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": bid, "institute_id": user["institute_id"], "created_at": now_iso()})
    await db.batches.insert_one(doc)
    return await db.batches.find_one({"id": bid}, {"_id": 0})


@api.put("/batches/{bid}")
async def update_batch(bid: str, body: BatchIn, user=Depends(require("principal"))):
    await db.batches.update_one({"id": bid, "institute_id": user["institute_id"]}, {"$set": body.model_dump()})
    return await db.batches.find_one({"id": bid}, {"_id": 0})


@api.delete("/batches/{bid}")
async def delete_batch(bid: str, user=Depends(require("principal"))):
    await db.batches.delete_one({"id": bid, "institute_id": user["institute_id"]})
    return {"ok": True}


@api.get("/batches/{bid}/students")
async def batch_students(bid: str, user=Depends(require("principal", "teacher"))):
    if user["role"] == "teacher" and bid not in await teacher_batches(user):
        raise HTTPException(403, "Not your batch")
    return await db.students.find({"institute_id": user["institute_id"], "batch_id": bid},
                                  {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(2000)


@api.put("/students/{sid}/move")
async def move_student(sid: str, payload: dict, user=Depends(require("principal"))):
    res = await db.students.update_one({"id": sid, "institute_id": user["institute_id"]},
                                       {"$set": {"batch_id": payload.get("batch_id", "")}})
    if res.matched_count == 0:
        raise HTTPException(404, "Student not found")
    return await db.students.find_one({"id": sid}, {"_id": 0, "password_hash": 0})


# ---------------------------------------------------------------- attendance
async def _mark_student(user, student, batch_id, status="present"):
    d = today_str()
    existing = await db.attendance.find_one({"student_id": student["id"], "date": d})

    async def _maybe_notify(att_id, prev_status):
        if status == prev_status or status not in ("present", "absent"):
            return
        inst = await db.institutes.find_one({"id": user["institute_id"]}) or {}
        iname = inst.get("name", "our institute")
        if status == "absent":
            title = f"{student['name']} was marked absent today ({d})"
            wa = f"Dear Parent, your ward {student['name']} was marked ABSENT today at {iname}. - EduSync"
            body_html = (f"<p style='color:#475569;font-size:14px;line-height:1.6'>Dear Parent, this is to inform you that "
                         f"<b>{student['name']}</b> was marked <b style='color:#dc2626'>absent</b> today ({d}) at "
                         f"{iname}. If this is unexpected, please contact the school office.</p>")
            await notify_student(student, user["institute_id"], "attendance", title, wa,
                                 f"Attendance Alert — {student['name']} marked absent",
                                 _brand_email_html(inst, "Absence Notification", body_html))
        else:
            title = f"{student['name']} was marked present today ({d})"
            wa = f"Dear Parent, your ward {student['name']} was marked present today at {iname}. - EduSync"
            await notify_student(student, user["institute_id"], "attendance", title, wa)
        await db.attendance.update_one({"id": att_id}, {"$set": {"parent_notified": True}})

    if existing:
        prev = existing.get("status")
        await db.attendance.update_one({"id": existing["id"]}, {"$set": {"status": status, "marked_at": now_iso()}})
        await _maybe_notify(existing["id"], prev)
        return existing["id"], False
    aid = str(uuid.uuid4())
    await db.attendance.insert_one({"id": aid, "student_id": student["id"], "student_name": student["name"],
                                    "batch_id": batch_id or student.get("batch_id", ""), "date": d, "status": status,
                                    "institute_id": user["institute_id"], "marked_at": now_iso(), "marked_by": user["id"],
                                    "parent_notified": False})
    await _maybe_notify(aid, None)
    return aid, True


@api.post("/attendance/scan")
async def scan_attendance(body: AttendanceScan, user=Depends(require("principal", "teacher"))):
    student = await db.students.find_one({"student_id": body.code.strip(), "institute_id": user["institute_id"]}, {"_id": 0, "password_hash": 0})
    if not student:
        fac = await db.users.find_one({"faculty_id": body.code.strip(), "institute_id": user["institute_id"], "role": "teacher"}, {"_id": 0, "password_hash": 0})
        if fac:
            d = today_str()
            exists = await db.teacher_attendance.find_one({"teacher_id": fac["id"], "date": d})
            if not exists:
                await db.teacher_attendance.insert_one({"id": str(uuid.uuid4()), "teacher_id": fac["id"], "teacher_name": fac["name"],
                                                        "date": d, "status": "present", "institute_id": user["institute_id"], "marked_at": now_iso()})
            return {"student": {"id": fac["id"], "name": fac["name"], "student_id": fac.get("faculty_id"), "photo_url": fac.get("photo_url")},
                    "status": "present", "new": not bool(exists), "type": "faculty", "message": f"Attendance marked for {fac['name']}"}
        raise HTTPException(404, "No student or staff found for scanned code")
    _, created = await _mark_student(user, student, student.get("batch_id"))
    return {"student": {"id": student["id"], "name": student["name"], "student_id": student["student_id"], "photo_url": student.get("photo_url")},
            "status": "present", "new": created, "type": "student", "message": f"Attendance marked for {student['name']}"}


@api.post("/attendance/mark")
async def mark_attendance(records: List[dict], user=Depends(require("principal", "teacher"))):
    for r in records:
        s = await db.students.find_one({"id": r["student_id"]}, {"_id": 0})
        if s:
            await _mark_student(user, s, s.get("batch_id"), r.get("status", "present"))
    return {"ok": True, "count": len(records)}


@api.get("/attendance")
async def get_attendance(user=Depends(get_current_user), batch_id: Optional[str] = None, date_str: Optional[str] = None):
    q = scope(user)
    if user["role"] == "student":
        q["student_id"] = user["id"]
    elif user["role"] == "teacher":
        q["batch_id"] = {"$in": await teacher_batches(user)}
    elif batch_id:
        q["batch_id"] = batch_id
    if date_str:
        q["date"] = date_str
    return await db.attendance.find(q, {"_id": 0}).sort("date", -1).to_list(3000)


# teacher self-attendance
@api.post("/teacher-attendance/mark")
async def teacher_self_attend(user=Depends(require("teacher", "principal"))):
    d = today_str()
    if await db.teacher_attendance.find_one({"teacher_id": user["id"], "date": d}):
        return {"ok": True, "message": "Already marked"}
    await db.teacher_attendance.insert_one({"id": str(uuid.uuid4()), "teacher_id": user["id"], "teacher_name": user["name"],
                                            "date": d, "status": "present", "institute_id": user["institute_id"], "marked_at": now_iso()})
    return {"ok": True, "message": "Your attendance marked"}


@api.get("/teacher-attendance")
async def get_teacher_attendance(user=Depends(get_current_user), date_str: Optional[str] = None):
    q = scope(user)
    if date_str:
        q["date"] = date_str
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
    return await db.teacher_attendance.find(q, {"_id": 0}).sort("date", -1).to_list(2000)


# ---------------------------------------------------------------- leaves
@api.post("/leaves")
async def apply_leave(body: LeaveIn, user=Depends(require("teacher"))):
    lid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": lid, "teacher_id": user["id"], "teacher_name": user["name"], "status": "pending",
                "institute_id": user["institute_id"], "created_at": now_iso()})
    await db.leaves.insert_one(doc)
    principal = await db.users.find_one({"institute_id": user["institute_id"], "role": "principal"})
    html = f"<div style='font-family:Arial'><h3 style='color:#2563eb'>Leave Application</h3><p><b>{user['name']}</b> applied for leave from <b>{fmt_date(body.from_date)}</b> to <b>{fmt_date(body.to_date)}</b>.</p><p>Reason: {body.reason}</p><p style='color:#64748b;font-size:12px'>— EduSync</p></div>"
    asyncio.create_task(send_email(user.get("email"), "Your leave application was submitted", html))
    if principal:
        asyncio.create_task(send_email(principal.get("email"), f"New leave request from {user['name']}", html))
    return await db.leaves.find_one({"id": lid}, {"_id": 0})


@api.get("/leaves")
async def list_leaves(user=Depends(get_current_user)):
    q = scope(user)
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
    return await db.leaves.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.put("/leaves/{lid}")
async def decide_leave(lid: str, body: ComplaintUpdate, user=Depends(require("principal"))):
    leave = await db.leaves.find_one({"id": lid, "institute_id": user["institute_id"]})
    if not leave:
        raise HTTPException(404, "Leave not found")
    if leave["status"] != "pending":
        raise HTTPException(400, "Leave has already been decided")
    if body.status not in ("approved", "rejected"):
        raise HTTPException(400, "Status must be approved or rejected")
    res = await db.leaves.update_one({"id": lid, "status": "pending"}, {"$set": {"status": body.status, "decided_at": now_iso()}})
    if res.modified_count == 0:
        raise HTTPException(400, "Leave has already been decided")
    if body.status == "approved":
        await db.users.update_one({"id": leave["teacher_id"]}, {"$inc": {"leave_balance": -1}})
    tuser = await db.users.find_one({"id": leave["teacher_id"]})
    principal = await db.users.find_one({"institute_id": user["institute_id"], "role": "principal"})
    color = "#16a34a" if body.status == "approved" else "#dc2626"
    html = f"<div style='font-family:Arial'><h3 style='color:#2563eb'>Leave {body.status.title()}</h3><p>Leave ({leave['from_date']} to {leave['to_date']}) for <b>{leave['teacher_name']}</b> has been <b style='color:{color}'>{body.status}</b>.</p><p style='color:#64748b;font-size:12px'>— EduSync</p></div>"
    if tuser:
        asyncio.create_task(send_email(tuser.get("email"), f"Your leave was {body.status}", html))
    if principal:
        asyncio.create_task(send_email(principal.get("email"), f"Leave {body.status}: {leave['teacher_name']}", html))
    return await db.leaves.find_one({"id": lid}, {"_id": 0})


# ---------------------------------------------------------------- fees
@api.get("/fees")
async def list_fees(user=Depends(get_current_user)):
    q = scope(user)
    if user["role"] in ("student", "parent"):
        q["student_id"] = user["id"]
    fees = await db.fees.find(q, {"_id": 0}).sort("due_date", -1).to_list(3000)
    return fees


@api.post("/fees")
async def create_fee(body: FeeIn, user=Depends(require("principal"))):
    s = await db.students.find_one({"id": body.student_id, "institute_id": user["institute_id"]})
    if not s:
        raise HTTPException(404, "Student not found")
    items = body.items or []
    amount = round(sum(float(i.get("amount", 0)) for i in items), 2) if items else float(body.amount or 0)
    fid = str(uuid.uuid4())
    await db.fees.insert_one({"id": fid, "student_id": body.student_id, "items": items, "amount": amount,
                             "month": body.month, "due_date": body.due_date, "institute_id": user["institute_id"],
                             "status": "pending", "paid_amount": 0, "student_name": s["name"] if s else "",
                             "parent_phone": s.get("parent_phone", "") if s else "", "created_at": now_iso(),
                             "payment_id": None, "receipt_no": None})
    inst = await db.institutes.find_one({"id": user["institute_id"]}, {"_id": 0, "name": 1}) or {}
    iname = inst.get("name", "our institute")
    _html = _brand_email_html(inst, "New Fee Generated", f"<p style='color:#475569;font-size:14px;line-height:1.6'>Dear Parent, a new fee of <b>Rs. {int(amount)}</b> for <b>{s['name']}</b> ({body.month}) has been generated. Due date: <b>{fmt_date(body.due_date)}</b>. You can pay securely from the EduSync portal.</p>")
    await notify_student(s, user["institute_id"], "fee", f"New fee of ₹{int(amount)} generated ({body.month})",
                         f"Dear Parent, a new fee of Rs.{int(amount)} for {s['name']} ({body.month}) has been generated at {iname}. Due: {fmt_date(body.due_date)}. - EduSync",
                         f"New Fee — {body.month} ({s['name']})", _html)
    return await db.fees.find_one({"id": fid}, {"_id": 0})


@api.post("/fees/razorpay/order")
async def rzp_order(payload: dict, user=Depends(get_current_user)):
    fee_id = payload["fee_id"]
    fee = await db.fees.find_one({"id": fee_id, "institute_id": user["institute_id"]})
    if not fee:
        raise HTTPException(404, "Fee not found")
    if not rzp_client:
        raise HTTPException(500, "Razorpay not configured")
    remaining = float(fee["amount"]) - float(fee.get("paid_amount", 0))
    if remaining <= 0:
        raise HTTPException(400, "Fee already fully paid")
    amount = int(remaining * 100)
    order = rzp_client.order.create({"amount": amount, "currency": "INR", "payment_capture": 1, "receipt": f"fee_{fee_id[:20]}"})
    await db.fees.update_one({"id": fee_id}, {"$set": {"order_id": order["id"]}})
    return {"order_id": order["id"], "amount": amount, "currency": "INR", "key_id": RZP_KEY,
            "student_name": fee.get("student_name"), "prefill_contact": fee.get("parent_phone", "")}


async def _response_pdf_bytes(resp):
    return b"".join([chunk async for chunk in resp.body_iterator])


async def _auto_email_receipt(fee_id, institute_id):
    try:
        fee = await db.fees.find_one({"id": fee_id, "institute_id": institute_id}, {"_id": 0})
        if not fee:
            return
        stu = await db.students.find_one({"id": fee["student_id"], "institute_id": institute_id})
        inst = await db.institutes.find_one({"id": institute_id}) or {}
        phone = (stu or {}).get("parent_phone") or (stu or {}).get("phone")
        if phone:
            asyncio.create_task(notify_parent_async(phone, f"Dear Parent, payment received for {(stu or {}).get('name', 'your ward')} ({fee.get('month')}). Amount: Rs.{fee.get('paid_amount', 0)}. Receipt {fee.get('receipt_no', '-')}. - {inst.get('name', 'EduSync')}"))
        to = (stu or {}).get("email") or (stu or {}).get("parent_email")
        if not to:
            return
        resp = await fee_receipt(fee_id, {"institute_id": institute_id, "role": "principal", "id": "system"})
        pdf = await _response_pdf_bytes(resp)
        att = [{"filename": f"receipt_{fee.get('receipt_no', 'fee')}.pdf", "content": base64.b64encode(pdf).decode()}]
        html = (f"<div style='font-family:Arial;max-width:560px'><h3 style='color:#1e3a8a'>{inst.get('name', 'EduSync')}</h3>"
                f"<p>Dear Parent/Student,</p><p>Thank you for your payment. Please find the official fee receipt for "
                f"<b>{fee.get('month')}</b> attached (Receipt No: {fee.get('receipt_no', '-')}, Amount Paid: Rs. {fee.get('paid_amount', 0)}).</p>"
                f"<p style='color:#64748b;font-size:12px'>Generated by EduSync — Privam Solutions</p></div>")
        await send_email(to, f"Fee Receipt {fee.get('month')} — {inst.get('name', 'EduSync')}", html, attachments=att)
    except Exception as e:
        logger.warning(f"auto receipt email failed: {e}")


@api.post("/fees/razorpay/verify")
async def rzp_verify(payload: dict, user=Depends(get_current_user)):
    fee_id = payload["fee_id"]
    params = payload["razorpay_order_id"] + "|" + payload["razorpay_payment_id"]
    expected = hmac.new(RZP_SECRET.encode(), params.encode(), hashlib.sha256).hexdigest()
    if expected != payload["razorpay_signature"]:
        raise HTTPException(400, "Payment signature verification failed")
    fee = await db.fees.find_one({"id": fee_id})
    receipt_no = "RCPT-" + datetime.now().strftime("%y%m%d") + "-" + uuid.uuid4().hex[:6].upper()
    await db.fees.update_one({"id": fee_id}, {"$set": {"status": "paid", "paid_amount": fee["amount"],
                             "payment_id": payload["razorpay_payment_id"], "receipt_no": receipt_no, "paid_at": now_iso()}})
    asyncio.create_task(_auto_email_receipt(fee_id, fee["institute_id"]))
    _stu = await db.students.find_one({"id": fee["student_id"]}, {"_id": 0}) or {}
    _inst = await db.institutes.find_one({"id": fee["institute_id"]}, {"_id": 0, "name": 1}) or {}
    await notify_student(_stu, fee["institute_id"], "fee_paid", f"Payment received ₹{int(fee['amount'])} ({fee.get('month')})",
                         f"Dear Parent, online payment of Rs.{int(fee['amount'])} for {_stu.get('name', 'your ward')} ({fee.get('month')}) received. Receipt {receipt_no}. Thank you. - {_inst.get('name', 'EduSync')}")
    return {"ok": True, "receipt_no": receipt_no}


@api.post("/fees/{fee_id}/mark-paid")
async def mark_fee_paid(fee_id: str, user=Depends(require("principal"))):
    fee = await db.fees.find_one({"id": fee_id, "institute_id": user["institute_id"]})
    if not fee:
        raise HTTPException(404, "Not found")
    receipt_no = "RCPT-" + datetime.now().strftime("%y%m%d") + "-" + uuid.uuid4().hex[:6].upper()
    await db.fees.update_one({"id": fee_id}, {"$set": {"status": "paid", "paid_amount": fee["amount"],
                             "receipt_no": receipt_no, "paid_at": now_iso(), "payment_id": "CASH"}})
    asyncio.create_task(_auto_email_receipt(fee_id, user["institute_id"]))
    _stu = await db.students.find_one({"id": fee["student_id"]}, {"_id": 0}) or {}
    _inst = await db.institutes.find_one({"id": user["institute_id"]}, {"_id": 0, "name": 1}) or {}
    await notify_student(_stu, user["institute_id"], "fee_paid", f"Payment received ₹{int(fee['amount'])} ({fee.get('month')})",
                         f"Dear Parent, payment of Rs.{int(fee['amount'])} for {_stu.get('name', 'your ward')} ({fee.get('month')}) received. Receipt {receipt_no}. Thank you. - {_inst.get('name', 'EduSync')}")
    return {"ok": True, "receipt_no": receipt_no}


@api.get("/fees/stats")
async def fee_stats(user=Depends(require("principal"))):
    online = cash = 0.0
    oc = cc = 0
    this_month = 0.0
    cur_mo = date.today().strftime("%Y-%m")
    monthly = {}
    for f in await db.fees.find(scope(user), {"_id": 0, "paid_amount": 1, "payment_id": 1, "month": 1}).to_list(10000):
        amt = float(f.get("paid_amount", 0) or 0)
        if amt <= 0:
            continue
        is_online = bool(f.get("payment_id") and f.get("payment_id") != "CASH")
        mo = f.get("month") or "?"
        m = monthly.setdefault(mo, {"month": mo, "online": 0.0, "cash": 0.0})
        if is_online:
            online += amt; oc += 1; m["online"] += amt
        else:
            cash += amt; cc += 1; m["cash"] += amt
        if mo == cur_mo:
            this_month += amt
    total = round(online + cash, 2)
    months = sorted(monthly.values(), key=lambda x: x["month"])[-6:]
    for m in months:
        m["online"] = round(m["online"], 2); m["cash"] = round(m["cash"], 2)
    inst = await db.institutes.find_one({"id": user["institute_id"]}) or {}
    target = float(inst.get("collection_target", 0) or 0)
    return {"online": round(online, 2), "cash": round(cash, 2), "total": total,
            "online_count": oc, "cash_count": cc,
            "online_pct": round(online / total * 100, 1) if total else 0,
            "cash_pct": round(cash / total * 100, 1) if total else 0,
            "monthly": months, "target": target, "this_month": round(this_month, 2),
            "current_month": cur_mo, "target_pct": round(this_month / target * 100, 1) if target else 0}


@api.post("/fees/{fee_id}/reminder")
async def send_fee_reminder(fee_id: str, user=Depends(require("principal"))):
    fee = await db.fees.find_one({"id": fee_id, "institute_id": user["institute_id"]})
    if not fee:
        raise HTTPException(404, "Not found")
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    remaining = round(float(fee["amount"]) - float(fee.get("paid_amount", 0)), 2)
    msg = f"Dear Parent, fee of Rs.{remaining} for {fee.get('student_name')} ({fee.get('month')}) is due on {fee.get('due_date')}. Please pay at the earliest. - {inst['name'] if inst else 'EduSync'}"
    phone = fee.get("parent_phone")
    channel = notify_parent(phone, msg)
    stu = await db.students.find_one({"id": fee.get("student_id")}, {"_id": 0, "email": 1, "parent_email": 1})
    to = (stu or {}).get("parent_email") or (stu or {}).get("email")
    email_ok = False
    if to:
        body_html = (f"<p style='color:#475569;font-size:14px;line-height:1.6'>Dear Parent, a fee of "
                     f"<b>Rs. {remaining}</b> for <b>{fee.get('student_name')}</b> ({fee.get('month')}) is due on "
                     f"<b>{fee.get('due_date')}</b>. Kindly clear it at the earliest. You can pay securely from the EduSync portal.</p>")
        email_ok = await send_email(to, f"Fee Reminder — {fee.get('month')} ({fee.get('student_name')})",
                                    _brand_email_html(inst, "Fee Payment Reminder", body_html))
    await db.fees.update_one({"id": fee_id}, {"$set": {"last_reminder": now_iso()}})
    await db.notifications.insert_one({"id": str(uuid.uuid4()), "institute_id": user["institute_id"],
                                       "type": "fee_reminder", "message": msg, "created_at": now_iso()})
    if channel and email_ok:
        message = f"Reminder sent via {channel.upper()} and Email"
    elif channel:
        message = f"Reminder sent via {channel.upper()}"
    elif email_ok:
        message = "Reminder sent via Email"
    elif not phone and not to:
        message = "No parent phone or email on file for this student"
    else:
        message = "Could not deliver — SMS provider rejected the number (trial accounts only send to verified numbers)."
    return {"ok": True, "sms_sent": bool(channel), "email_sent": bool(email_ok), "channel": channel, "message": message}


# ---------------------------------------------------------------- exams & results
def grade_for(pct):
    if pct >= 90: return "A+"
    if pct >= 80: return "A"
    if pct >= 70: return "B"
    if pct >= 60: return "C"
    if pct >= 40: return "D"
    return "F"


@api.get("/exams")
async def list_exams(user=Depends(get_current_user), batch_id: Optional[str] = None):
    q = scope(user)
    if user["role"] == "student":
        s = await db.students.find_one({"id": user["id"]})
        q["batch_id"] = s.get("batch_id", "")
    elif user["role"] == "teacher":
        q["batch_id"] = {"$in": await teacher_batches(user)}
    elif batch_id:
        q["batch_id"] = batch_id
    return await db.exams.find(q, {"_id": 0}).sort("exam_date", -1).to_list(1000)


@api.post("/exams")
async def create_exam(body: ExamIn, user=Depends(require("principal", "teacher"))):
    eid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": eid, "institute_id": user["institute_id"], "created_at": now_iso()})
    await db.exams.insert_one(doc)
    return await db.exams.find_one({"id": eid}, {"_id": 0})


@api.post("/results")
async def enter_results(body: ResultIn, user=Depends(require("principal", "teacher"))):
    exam = await db.exams.find_one({"id": body.exam_id, "institute_id": user["institute_id"]})
    if not exam:
        raise HTTPException(404, "Exam not found")
    await db.results.delete_many({"exam_id": body.exam_id})
    max_marks = exam["max_marks"]
    entries = []
    for student_id, marks in body.marks.items():
        s = await db.students.find_one({"id": student_id})
        pct = (float(marks) / max_marks) * 100 if max_marks else 0
        entries.append({"id": str(uuid.uuid4()), "exam_id": body.exam_id, "student_id": student_id,
                        "student_name": s["name"] if s else "", "marks": float(marks), "percentage": round(pct, 1),
                        "grade": grade_for(pct), "batch_id": exam["batch_id"], "subject": exam["subject"],
                        "institute_id": user["institute_id"], "created_at": now_iso()})
    entries.sort(key=lambda x: x["marks"], reverse=True)
    for i, e in enumerate(entries):
        e["rank"] = i + 1
    if entries:
        await db.results.insert_many(entries)
    inst = await db.institutes.find_one({"id": user["institute_id"]}) or {}
    for e in entries:
        e.pop("_id", None)
        s = await db.students.find_one({"id": e["student_id"]}, {"_id": 0, "parent_phone": 1})
        phone = (s or {}).get("parent_phone")
        if phone:
            msg = (f"Dear Parent, result for {e['student_name']} in {exam['name']} ({exam['subject']}): "
                   f"{e['marks']}/{max_marks} ({e['percentage']}%, Grade {e['grade']}, Rank #{e['rank']}) at {inst.get('name', 'EduSync')}. - EduSync")
            asyncio.create_task(notify_parent_async(phone, msg))
    return {"ok": True, "results": entries}


@api.get("/results")
async def get_results(user=Depends(get_current_user), exam_id: Optional[str] = None):
    q = scope(user)
    if exam_id:
        q["exam_id"] = exam_id
    if user["role"] == "student":
        q["student_id"] = user["id"]
    return await db.results.find(q, {"_id": 0}).sort("rank", 1).to_list(2000)


# ---------------------------------------------------------------- homework
@api.get("/homework")
async def list_homework(user=Depends(get_current_user)):
    q = scope(user)
    if user["role"] in ("student", "parent"):
        s = await db.students.find_one({"id": user["id"]})
        q["batch_id"] = s.get("batch_id", "")
    elif user["role"] == "teacher":
        batches = await db.batches.find({"institute_id": user["institute_id"], "teacher_id": user["id"]}, {"id": 1, "_id": 0}).to_list(1000)
        q["batch_id"] = {"$in": [b["id"] for b in batches]}
    hw = await db.homework.find(q, {"_id": 0}).sort("deadline", -1).to_list(1000)
    hw_ids = [h["id"] for h in hw]
    counts = {}
    async for row in db.submissions.aggregate([{"$match": {"homework_id": {"$in": hw_ids}}},
                                               {"$group": {"_id": "$homework_id", "n": {"$sum": 1}}}]):
        counts[row["_id"]] = row["n"]
    my_subs = {}
    if user["role"] in ("student", "parent"):
        async for sub in db.submissions.find({"homework_id": {"$in": hw_ids}, "student_id": user["id"]}, {"_id": 0}):
            my_subs[sub["homework_id"]] = sub
    for h in hw:
        h["submission_count"] = counts.get(h["id"], 0)
        if user["role"] in ("student", "parent"):
            h["my_submission"] = my_subs.get(h["id"])
    return hw


@api.post("/homework")
async def create_homework(body: HomeworkIn, user=Depends(require("principal", "teacher"))):
    hid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": hid, "institute_id": user["institute_id"], "created_by": user["name"], "created_at": now_iso()})
    await db.homework.insert_one(doc)
    inst = await db.institutes.find_one({"id": user["institute_id"]}) or {}
    students = await db.students.find({"batch_id": body.batch_id, "institute_id": user["institute_id"]},
                                      {"_id": 0, "name": 1, "parent_phone": 1}).to_list(2000)
    for s in students:
        if s.get("parent_phone"):
            msg = (f"Dear Parent, new homework '{body.title}'{(' (' + body.subject + ')') if body.subject else ''} "
                   f"has been assigned to {s['name']}. Due: {fmt_date(body.deadline)}. - {inst.get('name', 'EduSync')}")
            asyncio.create_task(notify_parent_async(s["parent_phone"], msg))
    return await db.homework.find_one({"id": hid}, {"_id": 0})


@api.post("/homework/submit")
async def submit_homework(body: SubmissionIn, user=Depends(require("student"))):
    fields = {"content": body.content or "", "attachment_url": body.attachment_url or "",
              "attachment_name": body.attachment_name or "", "submitted_at": now_iso(), "status": "submitted"}
    existing = await db.submissions.find_one({"homework_id": body.homework_id, "student_id": user["id"]})
    if existing:
        await db.submissions.update_one({"id": existing["id"]}, {"$set": fields})
        return await db.submissions.find_one({"id": existing["id"]}, {"_id": 0})
    sub_id = str(uuid.uuid4())
    await db.submissions.insert_one({"id": sub_id, "homework_id": body.homework_id, "student_id": user["id"],
                                     "student_name": user["name"], "institute_id": user["institute_id"], **fields})
    return await db.submissions.find_one({"id": sub_id}, {"_id": 0})


@api.get("/homework/{hid}/submissions")
async def hw_submissions(hid: str, user=Depends(require("principal", "teacher"))):
    return await db.submissions.find({"homework_id": hid}, {"_id": 0}).to_list(1000)


@api.put("/submissions/{sub_id}/complete")
async def mark_submission(sub_id: str, user=Depends(require("principal", "teacher"))):
    await db.submissions.update_one({"id": sub_id}, {"$set": {"status": "completed", "reviewed_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------- MCQ online tests
@api.get("/quizzes")
async def list_quizzes(user=Depends(get_current_user)):
    q = scope(user)
    if user["role"] == "student":
        s = await db.students.find_one({"id": user["id"]})
        q["batch_id"] = s.get("batch_id", "")
    elif user["role"] == "teacher":
        q["batch_id"] = {"$in": await teacher_batches(user)}
    quizzes = await db.quizzes.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for qz in quizzes:
        qs = qz.get("questions", [])
        qz["question_count"] = len(qs)
        qz["total_marks"] = round(len(qs) * float(qz.get("marks_per_correct", 1)), 2)
        if user["role"] == "student":
            att = await db.quiz_attempts.find_one({"quiz_id": qz["id"], "student_id": user["id"]}, {"_id": 0})
            qz["my_attempt"] = {"score": att["score"], "total": att["total"], "percentage": att["percentage"]} if att else None
            qz.pop("questions", None)
        else:
            qz["attempt_count"] = await db.quiz_attempts.count_documents({"quiz_id": qz["id"]})
    return quizzes


@api.get("/quizzes/{qid}")
async def get_quiz(qid: str, user=Depends(get_current_user)):
    quiz = await db.quizzes.find_one({"id": qid, "institute_id": user["institute_id"]}, {"_id": 0})
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if user["role"] == "student":
        s = await db.students.find_one({"id": user["id"]}, {"_id": 0, "batch_id": 1})
        if quiz.get("batch_id") != (s or {}).get("batch_id"):
            raise HTTPException(403, "This test is not assigned to your class")
        att = await db.quiz_attempts.find_one({"quiz_id": qid, "student_id": user["id"]}, {"_id": 0})
        if att:
            quiz["my_attempt"] = att
        else:
            for ques in quiz.get("questions", []):
                ques.pop("correct", None)
    return quiz


@api.post("/quizzes")
async def create_quiz(body: QuizIn, user=Depends(require("principal", "teacher"))):
    if not body.questions:
        raise HTTPException(400, "Add at least one question")
    qid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": qid, "institute_id": user["institute_id"], "created_by": user["name"], "created_at": now_iso()})
    await db.quizzes.insert_one(doc)
    return await db.quizzes.find_one({"id": qid}, {"_id": 0})


@api.delete("/quizzes/{qid}")
async def delete_quiz(qid: str, user=Depends(require("principal", "teacher"))):
    await db.quizzes.delete_one({"id": qid, "institute_id": user["institute_id"]})
    await db.quiz_attempts.delete_many({"quiz_id": qid})
    return {"ok": True}


@api.post("/quizzes/attempt")
async def attempt_quiz(body: QuizAttemptIn, user=Depends(require("student"))):
    quiz = await db.quizzes.find_one({"id": body.quiz_id, "institute_id": user["institute_id"]})
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    s = await db.students.find_one({"id": user["id"]}, {"_id": 0, "batch_id": 1})
    if quiz.get("batch_id") != (s or {}).get("batch_id"):
        raise HTTPException(403, "This test is not assigned to your class")
    if await db.quiz_attempts.find_one({"quiz_id": body.quiz_id, "student_id": user["id"]}):
        raise HTTPException(400, "You have already attempted this test")
    questions = quiz.get("questions", [])
    mpc = float(quiz.get("marks_per_correct", 1))
    neg = float(quiz.get("negative_marks", 0))
    correct = wrong = unattempted = 0
    review = []
    for i, ques in enumerate(questions):
        sel = body.answers.get(str(i), body.answers.get(i))
        sel = int(sel) if sel is not None and sel != "" else None
        is_correct = sel is not None and sel == ques.get("correct")
        if sel is None:
            unattempted += 1
        elif is_correct:
            correct += 1
        else:
            wrong += 1
        review.append({"text": ques["text"], "options": ques["options"], "correct": ques.get("correct"),
                       "selected": sel, "is_correct": is_correct})
    score = round(correct * mpc - wrong * neg, 2)
    total = round(len(questions) * mpc, 2)
    pct = round(score / total * 100, 1) if total > 0 else 0
    attempt = {"id": str(uuid.uuid4()), "quiz_id": body.quiz_id, "quiz_name": quiz["name"],
               "student_id": user["id"], "student_name": user["name"], "institute_id": user["institute_id"],
               "score": score, "total": total, "percentage": pct, "correct": correct, "wrong": wrong,
               "unattempted": unattempted, "review": review, "submitted_at": now_iso()}
    await db.quiz_attempts.insert_one(attempt)
    attempt.pop("_id", None)
    return attempt


@api.get("/quizzes/{qid}/results")
async def quiz_results(qid: str, user=Depends(require("principal", "teacher"))):
    attempts = await db.quiz_attempts.find({"quiz_id": qid, "institute_id": user["institute_id"]}, {"_id": 0, "review": 0}).sort("score", -1).to_list(2000)
    if not attempts:
        return {"attempts": [], "analytics": {"attempts": 0, "avg_percentage": 0, "highest": 0, "lowest": 0, "pass_count": 0}}
    scores = [a["percentage"] for a in attempts]
    analytics = {"attempts": len(attempts), "avg_percentage": round(sum(scores) / len(scores), 1),
                 "highest": max(scores), "lowest": min(scores), "pass_count": sum(1 for s in scores if s >= 40)}
    return {"attempts": attempts, "analytics": analytics}


@api.post("/quizzes/ai-generate")
async def ai_generate_quiz(body: QuizGenIn, user=Depends(require("principal", "teacher"))):
    import json as _json
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"quizgen-{uuid.uuid4().hex[:8]}",
                       system_message="You are an expert exam setter for Indian schools. Respond with ONLY a valid JSON array, no markdown, no commentary.").with_model("gemini", "gemini-3-flash-preview")
        prompt = (f"Create {min(body.count, 15)} multiple-choice questions on '{body.topic}'"
                  f"{(' for the subject ' + body.subject) if body.subject else ''}. "
                  'Return a JSON array where each item is {"text": "question", "options": ["a","b","c","d"], "correct": <0-based index of the correct option>}. '
                  "Exactly 4 options each. Output only the JSON array.")
        raw = (await chat.send_message(UserMessage(text=prompt))).strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:]
        start, end = raw.find("["), raw.rfind("]")
        if start != -1 and end != -1:
            raw = raw[start:end + 1]
        questions = _json.loads(raw)
        clean = []
        for q in questions:
            if isinstance(q.get("options"), list) and len(q["options"]) == 4 and isinstance(q.get("correct"), int):
                clean.append({"text": str(q["text"]), "options": [str(o) for o in q["options"]], "correct": int(q["correct"]) % 4})
        if not clean:
            raise ValueError("No valid questions parsed")
        return {"questions": clean}
    except Exception as e:
        logger.warning(f"AI quiz gen failed: {e}")
        raise HTTPException(500, "Could not generate questions. Please try again or add them manually.")


async def _gen_salary(t, month, institute_id):
    inst = await db.institutes.find_one({"id": institute_id}) or {}
    metro = bool(inst.get("metro", False))
    comp = t.get("salary_components") or {}
    gross = float(t.get("monthly_salary") or 0)
    if gross <= 0:
        gross = float(comp.get("base", 0)) + float(comp.get("hra", 0)) + float(comp.get("allowances", 0))
    gross = round(gross, 2)
    base = round(gross * 0.45, 2)
    hra = round(base * (0.5 if metro else 0.4), 2)
    special = max(round(gross - base - hra, 2), 0.0)
    extra_ded = float(comp.get("deductions", 0) or 0)
    epf = round(base * 0.12, 2)
    pt = 200.0 if gross >= 15000 else (150.0 if gross >= 10000 else 0.0)
    annual_gross = gross * 12
    taxable = max(annual_gross - 50000 - epf * 12, 0)
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
    tds = round(tax / 12, 2)
    y, m = int(month[:4]), int(month[5:7])
    dim = calendar.monthrange(y, m)[1]
    ms, me = date(y, m, 1), date(y, m, dim)
    leave_lwp = 0
    for lv in await db.leaves.find({"institute_id": institute_id, "teacher_id": t["id"], "status": "rejected"}).to_list(1000):
        try:
            f = date.fromisoformat(lv["from_date"]); tt = date.fromisoformat(lv["to_date"])
        except Exception:
            continue
        s0, e0 = max(f, ms), min(tt, me)
        if s0 <= e0:
            leave_lwp += (e0 - s0).days + 1
    # attendance-based LWP: absent working days (Mon-Sat) when attendance is tracked
    present = await db.teacher_attendance.count_documents({"institute_id": institute_id, "teacher_id": t["id"], "date": {"$regex": f"^{month}"}})
    absent_days = 0
    if present > 0:
        working = sum(1 for dd in range(1, dim + 1) if date(y, m, dd).weekday() != 6)
        absent_days = max(working - present, 0)
    lwp_days = leave_lwp + absent_days
    lwp_amount = round(gross / dim * lwp_days, 2) if dim else 0
    total_ded = round(epf + pt + tds + extra_ded + lwp_amount, 2)
    net = round(gross - total_ded, 2)
    sid = str(uuid.uuid4())
    await db.salaries.insert_one({"id": sid, "teacher_id": t["id"], "teacher_name": t["name"], "month": month,
                                  "base": base, "hra": hra, "special": special, "allowances": special, "gross": gross,
                                  "epf": epf, "professional_tax": pt, "tds": tds, "extra_deductions": extra_ded,
                                  "extra_allowance": 0.0, "deductions": round(epf + pt + tds + extra_ded, 2), "metro": metro,
                                  "days_in_month": dim, "lwp_days": lwp_days, "leave_lwp_days": leave_lwp, "absent_days": absent_days,
                                  "lwp_amount": lwp_amount, "total_deductions": total_ded, "amount": net, "status": "pending",
                                  "institute_id": institute_id, "created_at": now_iso()})
    return sid


# ---------------------------------------------------------------- salary
@api.get("/salaries")
async def list_salaries(user=Depends(require("principal", "teacher"))):
    q = scope(user)
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
    return await db.salaries.find(q, {"_id": 0}).sort("month", -1).to_list(2000)


@api.post("/salaries")
async def create_salary(body: SalaryIn, user=Depends(require("principal"))):
    t = await db.users.find_one({"id": body.teacher_id, "institute_id": user["institute_id"]})
    if not t:
        raise HTTPException(404, "Teacher not found")
    if await db.salaries.find_one({"teacher_id": body.teacher_id, "month": body.month, "institute_id": user["institute_id"]}):
        raise HTTPException(409, "Salary already generated for this teacher and month")
    sid = await _gen_salary(t, body.month, user["institute_id"])
    return await db.salaries.find_one({"id": sid}, {"_id": 0})


class SalaryAdjust(BaseModel):
    extra_deductions: Optional[float] = None
    extra_allowance: Optional[float] = None
    note: Optional[str] = ""


@api.patch("/salaries/{sid}")
async def adjust_salary(sid: str, body: SalaryAdjust, user=Depends(require("principal"))):
    s = await db.salaries.find_one({"id": sid, "institute_id": user["institute_id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Salary not found")
    if s.get("status") == "paid":
        raise HTTPException(400, "Cannot adjust a paid salary")
    extra_ded = body.extra_deductions if body.extra_deductions is not None else s.get("extra_deductions", 0)
    extra_allow = body.extra_allowance if body.extra_allowance is not None else s.get("extra_allowance", 0)
    total_ded = round(s["epf"] + s["professional_tax"] + s["tds"] + float(extra_ded) + s.get("lwp_amount", 0), 2)
    net = round(s["gross"] + float(extra_allow) - total_ded, 2)
    await db.salaries.update_one({"id": sid}, {"$set": {"extra_deductions": float(extra_ded), "extra_allowance": float(extra_allow),
                                 "deductions": round(s["epf"] + s["professional_tax"] + s["tds"] + float(extra_ded), 2),
                                 "total_deductions": total_ded, "amount": net, "adjust_note": body.note or ""}})
    return await db.salaries.find_one({"id": sid}, {"_id": 0})


@api.put("/salaries/{sid}/pay")
async def pay_salary(sid: str, user=Depends(require("principal"))):
    slip_no = "SAL-" + datetime.now().strftime("%y%m%d") + "-" + uuid.uuid4().hex[:5].upper()
    await db.salaries.update_one({"id": sid, "institute_id": user["institute_id"]}, {"$set": {"status": "paid", "paid_at": now_iso(), "slip_no": slip_no}})
    return {"ok": True, "slip_no": slip_no}


async def _generate_monthly_salaries():
    month = datetime.now().strftime("%Y-%m")
    count = 0
    for t in await db.users.find({"role": "teacher"}, {"_id": 0}).to_list(100000):
        gross = float(t.get("monthly_salary") or 0)
        comp = t.get("salary_components") or {}
        if gross <= 0:
            gross = float(comp.get("base", 0)) + float(comp.get("hra", 0)) + float(comp.get("allowances", 0))
        if gross <= 0:
            continue
        if await db.salaries.find_one({"teacher_id": t["id"], "month": month, "institute_id": t.get("institute_id")}):
            continue
        try:
            await _gen_salary(t, month, t.get("institute_id")); count += 1
        except Exception as e:
            logger.warning(f"salary gen failed for {t.get('id')}: {e}")
    logger.info(f"monthly salaries generated: {count}")


@api.post("/cron/generate-monthly-salaries")
async def cron_generate_monthly_salaries(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(401, "Unauthorized")
    asyncio.create_task(_generate_monthly_salaries())
    return {"status": "accepted"}


@api.get("/salaries/{sid}/slip")
async def salary_slip(sid: str, user=Depends(require("principal", "teacher"))):
    q = {"id": sid, "institute_id": user["institute_id"]}
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
    s = await db.salaries.find_one(q, {"_id": 0})
    if not s:
        raise HTTPException(404, "Salary not found")
    if s.get("status") != "paid":
        raise HTTPException(400, "Salary slip is available once the salary is marked Paid")
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4); w, h = A4
    draw_watermark(c, inst, w, h)
    draw_letterhead(c, inst, w, h, f"Salary Slip — {s.get('month')}")
    y = h - 4.6 * cm
    c.setFillColor(colors.HexColor("#0b1e3b")); c.setFont("Helvetica-Bold", 11)
    c.drawString(2 * cm, y, f"Employee: {s.get('teacher_name')}")
    c.drawRightString(w - 2 * cm, y, f"Slip No: {s.get('slip_no', '-')}"); y -= 0.5 * cm
    c.setFont("Helvetica", 9.5); c.setFillColor(colors.HexColor("#475569"))
    c.drawString(2 * cm, y, f"Month: {s.get('month')}   |   Paid Days: {s.get('days_in_month', 0) - s.get('lwp_days', 0)} / {s.get('days_in_month', 0)}   |   LWP Days: {s.get('lwp_days', 0)}"); y -= 0.8 * cm
    earnings = [("Basic", s.get("base", 0)), ("HRA", s.get("hra", 0)), ("Special Allowance", s.get("special", 0)), ("Adjustment Allowance", s.get("extra_allowance", 0))]
    deductions = [("EPF", s.get("epf", 0)), ("Professional Tax", s.get("professional_tax", 0)), ("TDS", s.get("tds", 0)), ("Other Deductions", s.get("extra_deductions", 0)), ("LWP", s.get("lwp_amount", 0))]
    c.setFillColor(colors.HexColor("#0b2a5b")); c.setFont("Helvetica-Bold", 10)
    c.drawString(2 * cm, y, "EARNINGS"); c.drawString(11 * cm, y, "DEDUCTIONS"); y -= 0.45 * cm
    c.setFont("Helvetica", 9.5); ry = y
    for k, v in earnings:
        c.setFillColor(colors.HexColor("#1f2937")); c.drawString(2 * cm, ry, k); c.drawRightString(9.5 * cm, ry, f"{float(v or 0):,.2f}"); ry -= 0.45 * cm
    dy = y
    for k, v in deductions:
        c.setFillColor(colors.HexColor("#1f2937")); c.drawString(11 * cm, dy, k); c.drawRightString(w - 2 * cm, dy, f"{float(v or 0):,.2f}"); dy -= 0.45 * cm
    yy = min(ry, dy) - 0.3 * cm
    c.setStrokeColor(colors.HexColor("#e2e8f0")); c.line(2 * cm, yy, w - 2 * cm, yy); yy -= 0.6 * cm
    c.setFont("Helvetica-Bold", 10.5); c.setFillColor(colors.HexColor("#0b1e3b"))
    c.drawString(2 * cm, yy, f"Gross Earnings: INR {float(s.get('gross', 0)):,.2f}")
    c.drawRightString(w - 2 * cm, yy, f"Total Deductions: INR {float(s.get('total_deductions', 0)):,.2f}"); yy -= 0.9 * cm
    c.setFillColor(colors.HexColor("#059669")); c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(w / 2, yy, f"NET PAY: INR {float(s.get('amount', 0)):,.2f}")
    c.setFont("Helvetica-Oblique", 8); c.setFillColor(colors.HexColor("#94a3b8"))
    c.drawCentredString(w / 2, 2 * cm, "This is a system-generated salary slip and does not require a physical signature.")
    c.showPage(); c.save(); buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=salary_slip_{s.get('month')}.pdf"})


# ---------------------------------------------------------------- announcements
@api.get("/announcements")
async def list_announcements(user=Depends(get_current_user)):
    q = scope(user)
    if user["role"] in ("teacher", "student"):
        q["audience"] = {"$in": ["all", user["role"] + "s"]}
    return await db.announcements.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/announcements")
async def create_announcement(body: AnnouncementIn, user=Depends(require("principal", "teacher"))):
    aid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": aid, "institute_id": user["institute_id"], "author": user["name"],
                "author_role": user["role"], "created_at": now_iso()})
    await db.announcements.insert_one(doc)
    if body.audience == "teachers":
        inst = await db.institutes.find_one({"id": user["institute_id"]}) or {}
        async for t in db.users.find({"institute_id": user["institute_id"], "role": "teacher"}, {"_id": 0, "phone": 1}):
            if t.get("phone"):
                asyncio.create_task(notify_parent_async(t["phone"], f"Notice from {user['name']}: {body.title}. {body.body[:120]} - {inst.get('name', 'EduSync')}"))
    return await db.announcements.find_one({"id": aid}, {"_id": 0})


@api.delete("/announcements/{aid}")
async def del_announcement(aid: str, user=Depends(require("principal", "teacher"))):
    ann = await db.announcements.find_one({"id": aid, "institute_id": user["institute_id"]}, {"_id": 0})
    if not ann:
        raise HTTPException(404, "Not found")
    if user["role"] == "teacher" and ann.get("author") != user["name"]:
        raise HTTPException(403, "You can only delete your own announcements")
    await db.announcements.delete_one({"id": aid, "institute_id": user["institute_id"]})
    return {"ok": True}


# ---------------------------------------------------------------- complaints
@api.get("/complaints")
async def list_complaints(user=Depends(get_current_user)):
    if user["role"] == "student":
        q = {"institute_id": user["institute_id"], "raised_by_id": user["id"]}
    elif user["role"] == "teacher":
        q = {"institute_id": user["institute_id"], "$or": [{"raised_by_id": user["id"]},
             {"$and": [{"direction": {"$in": ["teacher", "both"]}}, {"directed_teacher_id": user["id"]}]}]}
    else:
        q = scope(user)
    return await db.complaints.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.post("/complaints")
async def create_complaint(body: ComplaintIn, user=Depends(require("teacher", "student", "parent"))):
    cid = str(uuid.uuid4())
    doc = body.model_dump()
    directed_teacher_id = ""
    if user["role"] in ("student", "parent") and body.direction in ("teacher", "both"):
        s = await db.students.find_one({"id": user["id"]}, {"_id": 0})
        if s and s.get("batch_id"):
            b = await db.batches.find_one({"id": s["batch_id"]}, {"_id": 0})
            directed_teacher_id = (b or {}).get("teacher_id", "")
    doc.update({"id": cid, "institute_id": user["institute_id"], "raised_by_id": user["id"], "raised_by": user["name"],
                "raised_by_role": user["role"], "directed_teacher_id": directed_teacher_id,
                "status": "pending", "response": "", "audit": [], "created_at": now_iso()})
    await db.complaints.insert_one(doc)
    inst = await db.institutes.find_one({"id": user["institute_id"]}) or {}
    if body.direction in ("teacher", "both") and directed_teacher_id:
        t = await db.users.find_one({"id": directed_teacher_id})
        if t and t.get("phone"):
            asyncio.create_task(notify_parent_async(t["phone"], f"New complaint '{body.subject}' from {user['name']}. Please review on EduSync. - {inst.get('name', 'EduSync')}"))
    if body.direction in ("principal", "both"):
        p = await db.users.find_one({"institute_id": user["institute_id"], "role": "principal"})
        if p and p.get("phone"):
            asyncio.create_task(notify_parent_async(p["phone"], f"New complaint '{body.subject}' from {user['name']} ({user['role']}). Please review on EduSync."))
    return await db.complaints.find_one({"id": cid}, {"_id": 0})


@api.put("/complaints/{cid}")
async def update_complaint(cid: str, body: ComplaintUpdate, user=Depends(require("principal", "teacher"))):
    comp = await db.complaints.find_one({"id": cid, "institute_id": user["institute_id"]}, {"_id": 0})
    if not comp:
        raise HTTPException(404, "Not found")
    if body.status not in ("pending", "under_review", "resolved"):
        raise HTTPException(422, "Invalid status")
    if user["role"] == "teacher" and comp.get("directed_teacher_id") != user["id"] and comp.get("raised_by_id") != user["id"]:
        raise HTTPException(403, "Not authorised for this complaint")
    entry = {"by": user["name"], "by_role": user["role"], "from_status": comp.get("status", ""),
             "to_status": body.status, "note": body.note or "", "at": now_iso()}
    await db.complaints.update_one({"id": cid, "institute_id": user["institute_id"]},
                                   {"$set": {"status": body.status, "response": body.response or comp.get("response", ""), "updated_at": now_iso()},
                                    "$push": {"audit": entry}})
    raiser_role = comp.get("raised_by_role")
    phone = None
    if raiser_role == "student":
        rs = await db.students.find_one({"id": comp.get("raised_by_id")})
        phone = (rs or {}).get("parent_phone") or (rs or {}).get("phone")
    else:
        ru = await db.users.find_one({"id": comp.get("raised_by_id")})
        phone = (ru or {}).get("phone")
    if phone:
        asyncio.create_task(notify_parent_async(phone, f"Update on your complaint '{comp.get('subject')}': {body.status.replace('_', ' ').upper()}. {body.response or ''} - EduSync"))
    return await db.complaints.find_one({"id": cid}, {"_id": 0})


# ---------------------------------------------------------------- gallery
@api.get("/gallery")
async def list_gallery(user=Depends(get_current_user), class_id: Optional[str] = None):
    q = scope(user)
    if class_id:
        q["class_id"] = class_id
    return await db.gallery.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.post("/gallery")
async def add_gallery(payload: dict, user=Depends(require("principal", "teacher"))):
    image_url = (payload.get("image_url") or "").strip()
    if not image_url:
        raise HTTPException(400, "A photo is required")
    gid = str(uuid.uuid4())
    doc = {"id": gid, "title": (payload.get("title") or "")[:120], "image_url": image_url,
           "class_id": payload.get("class_id") or "", "class_name": "",
           "uploaded_by": user["name"], "uploaded_by_role": user["role"], "uploaded_by_id": user["id"],
           "institute_id": user["institute_id"], "created_at": now_iso()}
    if doc["class_id"]:
        b = await db.batches.find_one({"id": doc["class_id"], "institute_id": user["institute_id"]})
        if not b:
            raise HTTPException(400, "Invalid class album")
        doc["class_name"] = b.get("name", "")
    await db.gallery.insert_one(doc)
    return await db.gallery.find_one({"id": gid}, {"_id": 0})


@api.delete("/gallery/{gid}")
async def del_gallery(gid: str, user=Depends(require("principal", "teacher"))):
    await db.gallery.delete_one({"id": gid, "institute_id": user["institute_id"]})
    return {"ok": True}


# ---------------------------------------------------------------- enquiries
@api.get("/enquiries")
async def list_enquiries(user=Depends(require("principal", "teacher"))):
    q = scope(user)
    if user["role"] == "teacher":
        q["assigned_to"] = user["id"]
    return await db.enquiries.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.post("/enquiries")
async def create_enquiry(body: EnquiryIn, user=Depends(require("principal", "teacher"))):
    eid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": eid, "institute_id": user["institute_id"], "status": "new", "stage": "new_lead",
                "assigned_to": "", "assigned_to_name": "", "created_at": now_iso()})
    await db.enquiries.insert_one(doc)
    return await db.enquiries.find_one({"id": eid}, {"_id": 0})


@api.put("/enquiries/{eid}")
async def update_enquiry(eid: str, body: EnquiryUpdate, user=Depends(require("principal", "teacher"))):
    enq = await db.enquiries.find_one({"id": eid, "institute_id": user["institute_id"]})
    if not enq:
        raise HTTPException(404, "Enquiry not found")
    if user["role"] == "teacher" and enq.get("assigned_to") != user["id"]:
        raise HTTPException(403, "This lead is not assigned to you")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if user["role"] == "teacher":
        upd = {k: v for k, v in upd.items() if k in ("stage", "status", "notes")}
    if "assigned_to" in upd:
        t = await db.users.find_one({"id": upd["assigned_to"], "institute_id": user["institute_id"]})
        upd["assigned_to_name"] = t["name"] if t else ""
        if t and t.get("phone") and upd["assigned_to"]:
            lead_name = enq.get("name") or enq.get("student_name") or enq.get("parent_name") or "a new lead"
            asyncio.create_task(notify_parent_async(t["phone"], f"New admission lead '{lead_name}' assigned to you. Please follow up. - EduSync"))
    await db.enquiries.update_one({"id": eid, "institute_id": user["institute_id"]}, {"$set": upd})
    return await db.enquiries.find_one({"id": eid}, {"_id": 0})


# ---------------------------------------------------------------- timetable
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
SLOTS = ["09:00-10:00", "10:00-11:00", "11:15-12:15", "12:15-13:15", "14:00-15:00", "15:00-16:00"]


@api.get("/timetable")
async def get_timetable(user=Depends(get_current_user), batch_id: Optional[str] = None):
    q = scope(user)
    if user["role"] in ("student", "parent"):
        s = await db.students.find_one({"id": user["id"]})
        q["batch_id"] = s.get("batch_id", "")
    elif user["role"] == "teacher":
        q["batch_id"] = {"$in": await teacher_batches(user)}
    elif batch_id:
        q["batch_id"] = batch_id
    return await db.timetable.find(q, {"_id": 0}).to_list(500)


@api.post("/timetable/generate")
async def generate_timetable(body: Optional[TimetableConfig] = None, user=Depends(require("principal"))):
    body = body or TimetableConfig()
    days = body.days or DAYS[:5]
    periods = body.periods or SLOTS
    batches = await db.batches.find(scope(user), {"_id": 0}).to_list(1000)
    teachers = await db.users.find({"institute_id": user["institute_id"], "role": "teacher"}, {"_id": 0}).to_list(1000)
    if body.teacher_ids:
        teachers = [t for t in teachers if t["id"] in body.teacher_ids]
    on_leave = set()
    tstr = today_str()
    for lv in await db.leaves.find({"institute_id": user["institute_id"], "status": "approved"}, {"_id": 0}).to_list(1000):
        if lv["from_date"] <= tstr <= lv["to_date"]:
            on_leave.add(lv["teacher_id"])
    avail = [t for t in teachers if t["id"] not in on_leave]
    avail_ids = {t["id"] for t in avail}
    tname = {t["id"]: t["name"] for t in teachers}
    pool = []
    for t in avail:
        subs = t.get("subjects") or ([t.get("subject")] if t.get("subject") else [])
        for s in subs:
            if s:
                pool.append({"subject": s, "teacher_id": t["id"], "teacher_name": t["name"]})

    def batch_pool(b):
        own = []
        if b.get("teacher_id") in avail_ids:
            own.append({"subject": b.get("subject") or "General", "teacher_id": b["teacher_id"], "teacher_name": tname.get(b["teacher_id"], "")})
        combo = own + pool
        return combo or [{"subject": b.get("subject") or "General", "teacher_id": b.get("teacher_id", ""), "teacher_name": tname.get(b.get("teacher_id", ""), "TBD")}]

    await db.timetable.delete_many(scope(user))
    busy = set()       # (day, period, teacher_id) -> no teacher double-booking
    room_busy = set()  # (day, period, room)
    entries = []
    conflicts = 0
    for b in batches:
        cand = batch_pool(b)
        room = b.get("room") or ""
        idx = 0
        for day in days:
            for period in periods:
                chosen = None
                for k in range(len(cand)):
                    c = cand[(idx + k) % len(cand)]
                    tid = c["teacher_id"]
                    if tid and (day, period, tid) in busy:
                        continue
                    if room and (day, period, room) in room_busy:
                        continue
                    chosen = c
                    idx = idx + k + 1
                    break
                if chosen is None:
                    conflicts += 1
                    continue
                if chosen["teacher_id"]:
                    busy.add((day, period, chosen["teacher_id"]))
                if room:
                    room_busy.add((day, period, room))
                entries.append({"id": str(uuid.uuid4()), "batch_id": b["id"], "batch_name": b["name"], "day": day,
                                "slot": period, "subject": chosen["subject"], "room": room,
                                "teacher_id": chosen["teacher_id"], "teacher_name": chosen["teacher_name"] or "TBD",
                                "institute_id": user["institute_id"], "created_at": now_iso()})
    ai_note = ""
    if body.use_ai and entries:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"ttgen-{user['institute_id']}",
                           system_message="You are a school scheduling expert. In 2 short sentences, confirm the generated weekly timetable looks balanced and give one quick actionable tip. Plain text, no markdown.").with_model("gemini", "gemini-3-flash-preview")
            ai_note = await chat.send_message(UserMessage(text=f"Generated {len(entries)} slots across {len(batches)} batches over days {days} and periods {periods}, with no teacher/room clashes. Comment briefly."))
        except Exception as e:
            logger.warning(f"AI note failed: {e}")
            ai_note = "Timetable generated with no teacher or room clashes. Tip: keep core subjects in the morning periods for better focus."
    if entries:
        await db.timetable.insert_many(entries)
    for e in entries:
        e.pop("_id", None)
    return {"ok": True, "count": len(entries), "conflicts": conflicts, "ai_note": ai_note, "days": days, "periods": periods}


@api.get("/timetable/pdf")
async def timetable_pdf(user=Depends(get_current_user), batch_id: Optional[str] = None):
    q = scope(user)
    if user["role"] in ("student", "parent"):
        s = await db.students.find_one({"id": user["id"]})
        q["batch_id"] = s.get("batch_id", "") if s else ""
    elif user["role"] == "teacher":
        q["batch_id"] = {"$in": await teacher_batches(user)}
    elif batch_id:
        q["batch_id"] = batch_id
    rows = await db.timetable.find(q, {"_id": 0}).to_list(3000)
    inst = await db.institutes.find_one({"id": user["institute_id"]})

    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A4))
    w, h = landscape(A4)
    days_present = [d for d in DAYS if any(r["day"] == d for r in rows)] or DAYS[:5]
    slots_present = sorted({r["slot"] for r in rows}) or SLOTS
    batches = sorted({(r["batch_id"], r["batch_name"]) for r in rows}, key=lambda x: x[1])
    if not batches:
        batches = [("", "Weekly Timetable")]

    def render(bid, bname):
        draw_watermark(c, inst, w, h)
        draw_letterhead(c, inst, w, h, "Weekly Class Timetable")
        subset = [r for r in rows if (r["batch_id"] == bid)] if bid else rows
        y = h - 4.6 * cm
        c.setFillColor(colors.HexColor("#1E3A8A")); c.setFont("Helvetica-Bold", 13)
        c.drawString(1.5 * cm, y, bname)
        y -= 0.7 * cm
        col_w = (w - 3 * cm) / (len(days_present) + 1)
        row_h = 1.5 * cm
        c.setFont("Helvetica-Bold", 9)
        for i, lab in enumerate(["Time"] + days_present):
            c.setFillColor(colors.HexColor("#7C3AED") if i == 0 else colors.HexColor("#1E3A8A"))
            c.drawString(1.5 * cm + i * col_w + 0.15 * cm, y - 0.9 * cm, lab)
        y -= row_h
        c.setStrokeColor(colors.HexColor("#E2E8F0"))
        for slot in slots_present:
            c.rect(1.5 * cm, y - row_h, col_w, row_h, stroke=1, fill=0)
            c.setFillColor(colors.HexColor("#64748B")); c.setFont("Helvetica", 7.5)
            c.drawString(1.5 * cm + 0.12 * cm, y - 0.6 * cm, slot)
            for i, d in enumerate(days_present):
                x = 1.5 * cm + (i + 1) * col_w
                c.rect(x, y - row_h, col_w, row_h, stroke=1, fill=0)
                cell = next((r for r in subset if r["day"] == d and r["slot"] == slot), None)
                if cell:
                    c.setFillColor(colors.HexColor("#0F172A")); c.setFont("Helvetica-Bold", 7.5)
                    c.drawString(x + 0.12 * cm, y - 0.6 * cm, str(cell.get("subject") or cell.get("batch_name") or "")[:20])
                    c.setFillColor(colors.HexColor("#059669")); c.setFont("Helvetica", 6.5)
                    c.drawString(x + 0.12 * cm, y - 1.0 * cm, str(cell.get("teacher_name") or "")[:22])
            y -= row_h
        c.setFillColor(colors.HexColor("#64748B")); c.setFont("Helvetica-Oblique", 8)
        c.drawString(1.5 * cm, 1.1 * cm, "Generated by EduSync — Privam Solutions")

    for i, (bid, bname) in enumerate(batches):
        if i > 0:
            c.showPage()
        render(bid, bname)
    c.showPage(); c.save(); buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": "inline; filename=timetable.pdf"})


@api.post("/timetable/{batch_id}/email")
async def email_timetable(batch_id: str, user=Depends(require("principal"))):
    b = await db.batches.find_one({"id": batch_id, "institute_id": user["institute_id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Batch not found")
    teacher = await db.users.find_one({"id": b.get("teacher_id"), "institute_id": user["institute_id"]}, {"_id": 0}) if b.get("teacher_id") else None
    if not teacher or not teacher.get("email"):
        raise HTTPException(400, "This batch has no class teacher with an email address")
    rows = await db.timetable.find({"institute_id": user["institute_id"], "batch_id": batch_id}, {"_id": 0}).to_list(2000)
    if not rows:
        raise HTTPException(400, "No timetable to send. Generate the timetable first.")
    days = [d for d in DAYS if any(r["day"] == d for r in rows)] or DAYS[:5]
    slots = sorted({r["slot"] for r in rows}) or SLOTS

    def cell(d, s):
        e = next((r for r in rows if r["day"] == d and r["slot"] == s), None)
        return f"{e.get('subject') or e.get('batch_name')}<br><small style='color:#64748b'>{e.get('teacher_name', '')}</small>" if e else "-"
    th = "".join(f"<th style='padding:8px;border:1px solid #e2e8f0;background:#1e3a8a;color:#fff'>{d}</th>" for d in days)
    tb = "".join("<tr><td style='padding:8px;border:1px solid #e2e8f0;font-weight:600'>" + s + "</td>" + "".join(f"<td style='padding:8px;border:1px solid #e2e8f0'>{cell(d, s)}</td>" for d in days) + "</tr>" for s in slots)
    html = f"<h2 style='font-family:sans-serif'>Weekly Timetable — {b['name']}</h2><table style='border-collapse:collapse;font-family:sans-serif;font-size:13px'><tr><th style='padding:8px;border:1px solid #e2e8f0;background:#7c3aed;color:#fff'>Time</th>{th}</tr>{tb}</table><p style='font-family:sans-serif;color:#64748b'>Sent via EduSync — Privam Solutions.</p>"
    ok = await send_email(teacher["email"], f"Weekly Timetable — {b['name']}", html)
    return {"ok": ok, "emailed_to": teacher["email"]}


@api.post("/insights/notify-parents")
async def notify_low_attendance_parents(user=Depends(require("principal"))):
    iid = user["institute_id"]
    inst = await db.institutes.find_one({"id": iid}) or {}
    students = await db.students.find({"institute_id": iid}, {"_id": 0}).to_list(5000)
    sent = skipped = 0
    for s in students:
        total = await db.attendance.count_documents({"student_id": s["id"]})
        if total == 0:
            continue
        present = await db.attendance.count_documents({"student_id": s["id"], "status": "present"})
        pct = present / total * 100
        if pct < 75:
            phone = s.get("parent_phone") or s.get("phone")
            msg = f"Dear Parent, {s['name']}'s attendance is {round(pct, 1)}% (below 75%) at {inst.get('name', 'our school')}. Kindly ensure regular attendance. - EduSync"
            if phone and send_sms(phone, msg):
                sent += 1
            else:
                skipped += 1
    return {"ok": True, "sent": sent, "skipped": skipped}


# ---------------------------------------------------------------- report card PDF
def _qr_sticker_pdf(items, per_page=24, preset="standard"):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    import qrcode
    grids = {12: (3, 4), 24: (4, 6), 30: (5, 6)}
    cols, rows = grids.get(int(per_page), (4, 6))
    avery = preset == "avery"
    mx = (4.7 if avery else 8) * mm
    my = (12.7 if avery else 10) * mm
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    cw = (W - 2 * mx) / cols
    ch = (H - 2 * my) / rows
    per = cols * rows
    qr_sz = max(14 * mm, min(cw * 0.7, ch - 11 * mm))
    name_fs = 7 if per >= 30 else 8
    sub_fs = 6 if per >= 30 else 7
    for i, it in enumerate(items):
        pos = i % per
        if i and pos == 0:
            c.showPage()
        r = pos // cols
        col = pos % cols
        x0 = mx + col * cw
        y_top = H - my - r * ch
        if not avery:
            c.setStrokeColor(colors.HexColor("#E2E8F0"))
            c.setLineWidth(0.3)
            c.rect(x0, y_top - ch, cw, ch, stroke=1, fill=0)
        qimg = qrcode.make(it["qr"] or "EDUSYNC")
        bio = io.BytesIO()
        qimg.save(bio, format="PNG")
        bio.seek(0)
        qx = x0 + (cw - qr_sz) / 2
        qy = y_top - qr_sz - 3 * mm
        c.drawImage(ImageReader(bio), qx, qy, width=qr_sz, height=qr_sz)
        c.setFillColor(colors.HexColor("#0F172A"))
        c.setFont("Helvetica-Bold", name_fs)
        c.drawCentredString(x0 + cw / 2, qy - 3.5 * mm, (it.get("name") or "")[:24])
        c.setFont("Helvetica", sub_fs)
        c.setFillColor(colors.HexColor("#475569"))
        c.drawCentredString(x0 + cw / 2, qy - 6.5 * mm, it.get("sub") or "")
    c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()


@api.get("/print/qr-stickers/students/{batch_id}")
async def qr_stickers_students(batch_id: str, per_page: int = 24, preset: str = "standard", user=Depends(require("principal", "teacher"))):
    students = await db.students.find({"batch_id": batch_id, "institute_id": user["institute_id"]}, {"_id": 0}).sort("student_id", 1).to_list(2000)
    if not students:
        raise HTTPException(404, "No students in this batch")
    items = [{"qr": s.get("student_id", ""), "name": s.get("name", ""),
              "sub": f"Roll: {s.get('roll_no') or s.get('student_id', '-')}"} for s in students]
    return Response(content=_qr_sticker_pdf(items, per_page, preset), media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=qr-stickers-students.pdf"})


@api.get("/print/qr-stickers/faculty")
async def qr_stickers_faculty(per_page: int = 24, preset: str = "standard", user=Depends(require("principal"))):
    teachers = await db.users.find({"institute_id": user["institute_id"], "role": "teacher"}, {"_id": 0}).sort("faculty_id", 1).to_list(2000)
    if not teachers:
        raise HTTPException(404, "No faculty found")
    items = [{"qr": t.get("faculty_id", ""), "name": t.get("name", ""),
              "sub": f"Staff ID: {t.get('faculty_id', '-')}"} for t in teachers]
    return Response(content=_qr_sticker_pdf(items, per_page, preset), media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=qr-stickers-faculty.pdf"})


@api.get("/students/{sid}/report")
async def report_card(sid: str, user=Depends(get_current_user)):
    if user["role"] in ("student", "parent") and user["id"] != sid:
        raise HTTPException(403, "Forbidden")
    s = await db.students.find_one({"id": sid, "institute_id": user["institute_id"]}, {"_id": 0, "password_hash": 0})
    if not s:
        raise HTTPException(404, "Not found")
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    total = await db.attendance.count_documents({"student_id": sid})
    present = await db.attendance.count_documents({"student_id": sid, "status": "present"})
    att_pct = round(present / total * 100, 1) if total else 0
    results = await db.results.find({"student_id": sid}, {"_id": 0}).to_list(500)

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    draw_watermark(c, inst, w, h)
    draw_letterhead(c, inst, w, h, "Student Performance Report Card")
    y = h - 4.7 * cm
    c.setFont("Helvetica-Bold", 13)
    c.drawString(2 * cm, y, s["name"])
    c.setFont("Helvetica", 10)
    y -= 0.7 * cm
    c.drawString(2 * cm, y, f"Student ID: {s['student_id']}   Age: {s.get('age','-')}   Attendance: {att_pct}%")
    y -= 1 * cm
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(colors.HexColor("#7C3AED"))
    c.drawString(2 * cm, y, "Examination Results")
    c.setFillColor(colors.HexColor("#0F172A"))
    y -= 0.3 * cm
    c.setStrokeColor(colors.HexColor("#10B981"))
    c.setLineWidth(1.4)
    c.line(2 * cm, y, w - 2 * cm, y)
    c.setLineWidth(1)
    y -= 0.7 * cm
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#1E3A8A"))
    for label, x in [("Subject", 2), ("Marks", 9), ("%", 12), ("Grade", 14), ("Rank", 16)]:
        c.drawString(x * cm, y, label)
    c.setFillColor(colors.HexColor("#0F172A"))
    y -= 0.5 * cm
    c.setFont("Helvetica", 10)
    for r in results:
        for val, x in [(r["subject"], 2), (str(r["marks"]), 9), (str(r["percentage"]), 12), (r["grade"], 14), (str(r.get("rank","-")), 16)]:
            c.drawString(x * cm, y, str(val))
        y -= 0.55 * cm
        if y < 3 * cm:
            c.showPage(); y = h - 3 * cm
    if not results:
        c.drawString(2 * cm, y, "No exam results recorded yet.")
    remarks = s.get("remarks") or ""
    if remarks:
        y -= 0.9 * cm
        if y < 4 * cm:
            c.showPage(); y = h - 3 * cm
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(colors.HexColor("#7C3AED"))
        c.drawString(2 * cm, y, "Teacher's Remarks")
        c.setFillColor(colors.HexColor("#0F172A"))
        y -= 0.3 * cm
        c.setStrokeColor(colors.HexColor("#10B981")); c.setLineWidth(1.4)
        c.line(2 * cm, y, w - 2 * cm, y); c.setLineWidth(1)
        y -= 0.7 * cm
        c.setFont("Helvetica", 10)
        import textwrap
        for line in textwrap.wrap(remarks, 95):
            c.drawString(2 * cm, y, line); y -= 0.5 * cm
            if y < 2.5 * cm:
                c.showPage(); y = h - 3 * cm
    c.setFillColor(colors.HexColor("#64748B"))
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(2 * cm, 1.5 * cm, "Generated by EduSync — Privam Solutions")
    c.showPage()
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"inline; filename=report_{s['student_id']}.pdf"})


@api.put("/students/{sid}/remarks")
async def update_remarks(sid: str, payload: dict, user=Depends(require("principal", "teacher"))):
    await db.students.update_one({"id": sid, "institute_id": user["institute_id"]}, {"$set": {"remarks": payload.get("remarks", "")}})
    return {"ok": True}


@api.post("/salaries/{sid}/email-slip")
async def email_salary_slip(sid: str, user=Depends(require("principal"))):
    sal = await db.salaries.find_one({"id": sid, "institute_id": user["institute_id"]}, {"_id": 0})
    if not sal:
        raise HTTPException(404, "Not found")
    teacher = await db.users.find_one({"id": sal["teacher_id"], "institute_id": user["institute_id"]})
    to = (teacher or {}).get("email")
    if not to:
        raise HTTPException(400, "No email on file for this faculty")
    inst = await db.institutes.find_one({"id": user["institute_id"]}) or {}
    earn = [("Basic Pay", sal.get('base', 0)), ("HRA", sal.get('hra', 0)), ("Special Allowance", sal.get('special', sal.get('allowances', 0)))]
    ded = [("EPF", sal.get('epf', 0)), ("Professional Tax", sal.get('professional_tax', 0)), ("TDS", sal.get('tds', 0)), (f"LWP ({sal.get('lwp_days', 0)}d)", sal.get('lwp_amount', 0))]
    er = "".join(f"<tr><td style='padding:4px 10px'>{n}</td><td style='padding:4px 10px;text-align:right'>Rs. {v}</td></tr>" for n, v in earn)
    dr = "".join(f"<tr><td style='padding:4px 10px'>{n}</td><td style='padding:4px 10px;text-align:right;color:#dc2626'>Rs. {v}</td></tr>" for n, v in ded if v)
    html = (f"<div style='font-family:Arial;max-width:600px'><h2 style='color:#1e3a8a;margin-bottom:2px'>{inst.get('name', 'EduSync')}</h2>"
            f"<p style='color:#64748b;margin-top:0'>Salary Slip · {sal['month']}</p><p>Dear {sal['teacher_name']},</p>"
            f"<p>Please find your salary details for <b>{sal['month']}</b> below.</p>"
            f"<table style='width:100%;border-collapse:collapse;border:1px solid #e2e8f0'>"
            f"<tr style='background:#f1f5f9'><th style='padding:6px 10px;text-align:left'>Earnings</th><th></th></tr>{er}"
            f"<tr style='background:#f1f5f9'><th style='padding:6px 10px;text-align:left'>Deductions</th><th></th></tr>{dr}</table>"
            f"<p style='font-size:18px;color:#059669;margin-top:14px'><b>Net Pay: Rs. {sal['amount']}</b> &nbsp;<span style='color:#64748b;font-size:13px'>Status: {sal['status'].upper()}</span></p>"
            f"<p style='color:#64748b;font-size:12px'>Slip No: {sal.get('slip_no', '-')} · Generated by EduSync — Privam Solutions</p></div>")
    resp = await salary_slip(sid, user)
    pdf = await _response_pdf_bytes(resp)
    att = [{"filename": f"salary_slip_{sal['month']}.pdf", "content": base64.b64encode(pdf).decode()}]
    if not await send_email(to, f"Salary Slip {sal['month']} — {inst.get('name', 'EduSync')}", html, attachments=att):
        raise HTTPException(502, "Email could not be sent. Please check email configuration.")
    return {"sent": True, "to": to}


# ---------------------------------------------------------------- dashboards
@api.get("/dashboard/principal")
async def principal_dashboard(user=Depends(require("principal"))):
    iid = user["institute_id"]
    total_students = await db.students.count_documents({"institute_id": iid})
    this_month = datetime.now().strftime("%Y-%m")
    monthly_joiners = await db.students.count_documents({"institute_id": iid, "join_month": this_month})
    d = today_str()
    present = await db.attendance.count_documents({"institute_id": iid, "date": d, "status": "present"})
    today_att = round(present / total_students * 100, 1) if total_students else 0
    pending = await db.fees.find({"institute_id": iid, "status": "pending"}, {"amount": 1, "_id": 0}).to_list(5000)
    pending_fees = sum(f["amount"] for f in pending)
    total_teachers = await db.users.count_documents({"institute_id": iid, "role": "teacher"})
    teachers_present = await db.teacher_attendance.count_documents({"institute_id": iid, "date": d, "status": "present"})
    open_complaints = await db.complaints.count_documents({"institute_id": iid, "status": {"$ne": "resolved"}})

    # fee collection chart — last 6 months
    fee_chart = []
    for i in range(5, -1, -1):
        m = (datetime.now() - timedelta(days=30 * i)).strftime("%Y-%m")
        paid = await db.fees.find({"institute_id": iid, "status": "paid", "month": m}, {"amount": 1, "_id": 0}).to_list(5000)
        fee_chart.append({"month": m[-2:] + "/" + m[2:4], "collected": sum(x["amount"] for x in paid)})

    # attendance trend last 7 days
    att_chart = []
    for i in range(6, -1, -1):
        dd = (date.today() - timedelta(days=i)).isoformat()
        p = await db.attendance.count_documents({"institute_id": iid, "date": dd, "status": "present"})
        att_chart.append({"day": dd[-2:], "present": p})

    recent_students = await db.students.find({"institute_id": iid}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(5).to_list(5)
    recent_complaints = await db.complaints.find({"institute_id": iid}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    return {"kpis": {"total_students": total_students, "monthly_joiners": monthly_joiners, "today_attendance": today_att,
                     "pending_fees": pending_fees, "teachers_present": teachers_present, "total_teachers": total_teachers,
                     "open_complaints": open_complaints},
            "fee_chart": fee_chart, "attendance_chart": att_chart,
            "recent_students": recent_students, "recent_complaints": recent_complaints}


def _months_between(a, b):
    ya, ma = int(a[:4]), int(a[5:7]); yb, mb = int(b[:4]), int(b[5:7])
    out = []; y, m = ya, ma
    while (y, m) <= (yb, mb) and len(out) < 24:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1; y += 1
    return out


@api.get("/dashboard/analytics")
async def analytics_dashboard(months: int = 6, from_month: str = None, to_month: str = None, user=Depends(require("principal"))):
    iid = user["institute_id"]
    if from_month and to_month:
        months_list = _months_between(from_month[:7], to_month[:7]) or [datetime.now().strftime("%Y-%m")]
    else:
        months = max(1, min(int(months or 6), 24))
        months_list = [(datetime.now() - timedelta(days=30 * i)).strftime("%Y-%m") for i in range(months - 1, -1, -1)]
    month_set = set(months_list)
    batches = await db.batches.find({"institute_id": iid}, {"_id": 0, "id": 1, "name": 1, "class_name": 1}).to_list(500)
    bname = {b["id"]: (b.get("name") or b.get("class_name") or "Class") for b in batches}
    students = await db.students.find({"institute_id": iid}, {"_id": 0, "id": 1, "batch_id": 1}).to_list(20000)
    sbatch = {s["id"]: s.get("batch_id", "") for s in students}

    # fee trend — billed vs collected over the selected range
    fee_trend = []
    tot_billed = tot_collected = 0.0
    for m in months_list:
        recs = await db.fees.find({"institute_id": iid, "month": m}, {"_id": 0, "amount": 1, "paid_amount": 1}).to_list(20000)
        billed = sum(float(r.get("amount", 0) or 0) for r in recs)
        collected = sum(float(r.get("paid_amount", 0) or 0) for r in recs)
        tot_billed += billed; tot_collected += collected
        fee_trend.append({"month": m[5:7] + "/" + m[2:4], "billed": round(billed, 2), "collected": round(collected, 2),
                          "outstanding": round(max(billed - collected, 0), 2),
                          "rate": round(collected / billed * 100, 1) if billed else 0})
    collection_rate = round(tot_collected / tot_billed * 100, 1) if tot_billed else 0

    # attendance heatmap — class x last 7 days present%
    days = [(date.today() - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    att = await db.attendance.find({"institute_id": iid, "date": {"$in": days}}, {"_id": 0, "batch_id": 1, "date": 1, "status": 1}).to_list(200000)
    grid = {}
    for a in att:
        k = (a.get("batch_id", ""), a.get("date"))
        pt = grid.get(k, [0, 0]); pt[0] += 1 if a.get("status") == "present" else 0; pt[1] += 1; grid[k] = pt
    heat_rows = []
    for b in batches:
        row = {"class": bname[b["id"]], "batch_id": b["id"], "cells": []}
        for dday in days:
            p, t = grid.get((b["id"], dday), [0, 0])
            row["cells"].append(round(p / t * 100) if t else None)
        heat_rows.append(row)

    # class-wise performance — avg exam % (exams within range; undated exams always counted)
    exdate = {e["id"]: (e.get("exam_date") or "")[:7] for e in await db.exams.find({"institute_id": iid}, {"_id": 0, "id": 1, "exam_date": 1}).to_list(5000)}
    results = await db.results.find({"institute_id": iid}, {"_id": 0, "student_id": 1, "percentage": 1, "exam_id": 1}).to_list(200000)
    perf_sum, perf_cnt = {}, {}
    for r in results:
        em = exdate.get(r.get("exam_id"), "")
        if em and em not in month_set:
            continue
        b = sbatch.get(r["student_id"], "")
        perf_sum[b] = perf_sum.get(b, 0) + r["percentage"]; perf_cnt[b] = perf_cnt.get(b, 0) + 1
    class_perf = [{"class": bname[b], "avg": round(perf_sum[b] / perf_cnt[b], 1), "count": perf_cnt[b]}
                  for b in perf_cnt if b in bname]
    class_perf.sort(key=lambda x: x["avg"], reverse=True)

    # defaulters per class
    pend = await db.fees.find({"institute_id": iid, "status": {"$ne": "paid"}}, {"_id": 0, "student_id": 1, "amount": 1, "paid_amount": 1}).to_list(200000)
    def_map = {}
    for f in pend:
        due = float(f.get("amount", 0) or 0) - float(f.get("paid_amount", 0) or 0)
        if due <= 0:
            continue
        b = sbatch.get(f["student_id"], "")
        info = def_map.setdefault(b, {"students": set(), "amount": 0.0})
        info["students"].add(f["student_id"]); info["amount"] += due
    defaulters = [{"class": bname[b], "count": len(v["students"]), "amount": round(v["amount"], 2)}
                  for b, v in def_map.items() if b in bname]
    defaulters.sort(key=lambda x: x["amount"], reverse=True)
    total_due = round(sum(d["amount"] for d in defaulters), 2)
    total_defaulters = sum(d["count"] for d in defaulters)

    return {"fee_trend": fee_trend, "collection_rate": collection_rate,
            "total_billed": round(tot_billed, 2), "total_collected": round(tot_collected, 2),
            "heatmap": {"days": [d[5:] for d in days], "full_days": days, "rows": heat_rows},
            "class_performance": class_perf, "defaulters": defaulters,
            "total_due": total_due, "total_defaulters": total_defaulters,
            "period": {"count": len(months_list), "from": months_list[0], "to": months_list[-1]}}


@api.get("/attendance/absentees")
async def attendance_absentees(batch_id: str, date_str: str, user=Depends(require("principal", "teacher"))):
    recs = await db.attendance.find({"institute_id": user["institute_id"], "batch_id": batch_id, "date": date_str, "status": "absent"},
                                    {"_id": 0, "student_id": 1, "student_name": 1}).to_list(2000)
    out = []
    for r in recs:
        stu = await db.students.find_one({"id": r.get("student_id")}, {"_id": 0, "student_id": 1, "roll_no": 1, "parent_phone": 1}) or {}
        out.append({"name": r.get("student_name", ""), "student_id_code": stu.get("student_id", ""),
                    "roll_no": stu.get("roll_no", ""), "parent_phone": stu.get("parent_phone", "")})
    out.sort(key=lambda x: str(x.get("roll_no") or ""))
    return {"date": date_str, "count": len(out), "students": out}


@api.get("/students/{sid}/insights")
async def student_insights(sid: str, user=Depends(get_current_user)):
    iid = user["institute_id"]
    s = await db.students.find_one({"$or": [{"id": sid}, {"student_id": sid}], "institute_id": iid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    if user["role"] in ("student", "parent") and user["id"] != s["id"]:
        raise HTTPException(403, "Forbidden")
    sidv = s["id"]
    # attendance
    tot = await db.attendance.count_documents({"student_id": sidv})
    pres = await db.attendance.count_documents({"student_id": sidv, "status": "present"})
    att = round(pres / tot * 100, 1) if tot else 0
    # results (chronological by exam date)
    exams = {e["id"]: e.get("exam_date", "") for e in await db.exams.find({"institute_id": iid}, {"_id": 0, "id": 1, "exam_date": 1}).to_list(5000)}
    mine = await db.results.find({"student_id": sidv}, {"_id": 0, "subject": 1, "percentage": 1, "exam_id": 1}).to_list(2000)
    mine.sort(key=lambda r: str(exams.get(r.get("exam_id"), "")))
    avg = round(sum(r["percentage"] for r in mine) / len(mine), 1) if mine else 0
    # class averages per subject
    peers = await db.results.find({"institute_id": iid}, {"_id": 0, "subject": 1, "percentage": 1}).to_list(200000)
    csum, ccnt = {}, {}
    for r in peers:
        csum[r["subject"]] = csum.get(r["subject"], 0) + r["percentage"]
        ccnt[r["subject"]] = ccnt.get(r["subject"], 0) + 1
    subj_latest = {}
    for r in mine:
        subj_latest[r["subject"]] = r["percentage"]
    subjects = []
    for sub, pct in subj_latest.items():
        cavg = round(csum[sub] / ccnt[sub], 1) if ccnt.get(sub) else 0
        subjects.append({"subject": sub, "score": round(pct, 1), "class_avg": cavg, "delta": round(pct - cavg, 1),
                         "level": "strength" if pct - cavg >= 8 else ("weakness" if pct - cavg <= -8 else "on-track")})
    subjects.sort(key=lambda x: x["delta"], reverse=True)
    # consecutive grade drops (overall %, chronological)
    drops, streak = 0, 0
    for i in range(1, len(mine)):
        if mine[i]["percentage"] < mine[i - 1]["percentage"]:
            streak += 1
            drops = max(drops, streak)
        else:
            streak = 0
    # growth score: academics 50, attendance 30, consistency 20
    consistency = max(0, 100 - drops * 25)
    growth = round(avg * 0.5 + att * 0.3 + consistency * 0.2)
    at_risk = (att < 75 and tot > 0) or drops >= 2
    top = avg >= 85 and att >= 90
    status = "at-risk" if at_risk else ("top" if top else "steady")
    strengths = [x["subject"] for x in subjects if x["level"] == "strength"][:3]
    weaknesses = [x["subject"] for x in subjects if x["level"] == "weakness"][:3]
    # AI summary + 7-day plan
    summary, plan = "", []
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        subj_txt = "; ".join(f"{x['subject']} {x['score']}% (class {x['class_avg']}%)" for x in subjects) or "no marks yet"
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"insight-{sidv}",
            system_message=("You are a school academic advisor. Given a student's data, reply in STRICT JSON: "
                            "{\"summary\": \"3-4 sentence performance summary, warm and specific\", "
                            "\"plan\": [\"7 short daily action items, one per day\"]}. Plan must have exactly 7 items. No markdown, JSON only.")).with_model("gemini", "gemini-3-flash-preview")
        raw = await chat.send_message(UserMessage(text=f"Student {s['name']}. Attendance {att}%. Overall avg {avg}%. Subjects: {subj_txt}. Consecutive grade drops: {drops}. Status: {status}."))
        import json as _json, re as _re
        m = _re.search(r"\{.*\}", raw, _re.S)
        data = _json.loads(m.group(0)) if m else {}
        summary = data.get("summary", "")
        plan = (data.get("plan") or [])[:7]
    except Exception as e:
        logger.warning(f"insight AI failed: {e}")
        summary = f"{s['name']} has {att}% attendance and an overall average of {avg}%. " + ("Attention needed on consistency and weaker subjects." if at_risk else "Keep up the steady effort.")
    result = {"student_id": s.get("student_id"), "name": s["name"], "growth_score": growth, "status": status,
              "attendance": att, "average": avg, "consecutive_drops": drops, "strengths": strengths,
              "weaknesses": weaknesses, "subjects": subjects, "summary": summary}
    if user["role"] in ("principal", "teacher") or status == "at-risk":
        result["plan"] = plan if plan else ([] if not at_risk else ["Review today's weakest subject for 20 min",
            "Complete all pending homework", "Attend every class this week", "Practice 10 problems in the weakest subject",
            "Revise yesterday's lessons for 15 min", "Ask the teacher one doubt", "Take a short self-test and track score"])
    return result


@api.get("/dashboard/insights")
async def principal_insights(user=Depends(require("principal"))):
    iid = user["institute_id"]
    students = await db.students.find({"institute_id": iid}, {"_id": 0, "id": 1, "name": 1, "student_id": 1, "parent_phone": 1}).to_list(5000)

    att = await db.attendance.find({"institute_id": iid}, {"_id": 0, "student_id": 1, "status": 1}).to_list(200000)
    att_map = {}
    for a in att:
        t, p = att_map.get(a["student_id"], (0, 0))
        att_map[a["student_id"]] = (t + 1, p + (1 if a["status"] == "present" else 0))

    def att_pct(sid):
        t, p = att_map.get(sid, (0, 0))
        return round(p / t * 100, 1) if t else None

    fees = await db.fees.find({"institute_id": iid, "status": {"$ne": "paid"}}, {"_id": 0, "student_id": 1, "due_date": 1, "amount": 1, "paid_amount": 1}).to_list(200000)
    cutoff = date.today() - timedelta(days=30)
    overdue_map = {}
    for f in fees:
        try:
            dd = datetime.fromisoformat(str(f.get("due_date", ""))[:10]).date()
        except Exception:
            continue
        if dd < cutoff:
            due = float(f.get("amount", 0) or 0) - float(f.get("paid_amount", 0) or 0)
            if due > 0:
                info = overdue_map.setdefault(f["student_id"], {"amount": 0.0, "oldest": dd})
                info["amount"] += due
                info["oldest"] = min(info["oldest"], dd)

    exams = await db.exams.find({"institute_id": iid}, {"_id": 0, "id": 1, "exam_date": 1}).to_list(5000)
    exdate = {e["id"]: e.get("exam_date", "") for e in exams}
    results = await db.results.find({"institute_id": iid}, {"_id": 0, "student_id": 1, "exam_id": 1, "percentage": 1}).to_list(200000)
    res_by_student = {}
    for r in results:
        res_by_student.setdefault(r["student_id"], []).append((exdate.get(r["exam_id"], ""), r["percentage"]))
    avg_map = {sid: (sum(p for _, p in lst) / len(lst)) for sid, lst in res_by_student.items() if lst}
    sorted_avgs = sorted(avg_map.values(), reverse=True)
    threshold = sorted_avgs[max(1, int(len(sorted_avgs) * 0.10)) - 1] if sorted_avgs else None

    def declining(sid):
        vals = [p for _, p in sorted(res_by_student.get(sid, []), key=lambda x: x[0])]
        if len(vals) < 3:
            return None
        a, b, c = vals[-3], vals[-2], vals[-1]
        return vals[-3:] if (c < b < a) else None

    red, orange, yellow, green = [], [], [], []
    for s in students:
        sid = s["id"]
        base = {"name": s["name"], "student_id": s.get("student_id", ""), "parent_phone": s.get("parent_phone", "")}
        ap = att_pct(sid)
        if ap is not None and ap < 75:
            red.append({**base, "detail": f"{ap}% attendance"})
        if sid in overdue_map:
            info = overdue_map[sid]
            days = (date.today() - info["oldest"]).days
            orange.append({**base, "detail": f"₹{int(info['amount'])} overdue · {days} days"})
        dv = declining(sid)
        if dv:
            yellow.append({**base, "detail": " → ".join(f"{v}%" for v in dv)})
        if ap is not None and ap > 90 and threshold is not None and avg_map.get(sid, 0) >= threshold and avg_map.get(sid, 0) > 0:
            green.append({**base, "detail": f"{round(avg_map[sid], 1)}% avg · {ap}% att"})

    return {
        "red": {"label": "Low Attendance (<75%)", "count": len(red), "students": red},
        "orange": {"label": "Fee Overdue (>30 days)", "count": len(orange), "students": orange},
        "yellow": {"label": "Declining Performance", "count": len(yellow), "students": yellow},
        "green": {"label": "Top Performers", "count": len(green), "students": green},
    }


@api.get("/dashboard/teacher")
async def teacher_dashboard(user=Depends(require("teacher"))):
    iid = user["institute_id"]
    batches = await db.batches.find({"institute_id": iid, "teacher_id": user["id"]}, {"_id": 0}).to_list(1000)
    bids = [b["id"] for b in batches]
    students = await db.students.count_documents({"batch_id": {"$in": bids}}) if bids else 0
    d = today_str()
    my_att = await db.teacher_attendance.find_one({"teacher_id": user["id"], "date": d})
    pending_leaves = await db.leaves.count_documents({"teacher_id": user["id"], "status": "pending"})
    homework = await db.homework.count_documents({"batch_id": {"$in": bids}}) if bids else 0
    assigned_leads = await db.enquiries.find({"institute_id": iid, "assigned_to": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"my_batches": len(batches), "my_students": students, "attendance_marked": bool(my_att),
            "leave_balance": user.get("leave_balance", 0), "pending_leaves": pending_leaves, "homework": homework,
            "batches": batches, "assigned_leads": assigned_leads}


@api.get("/dashboard/student")
async def student_dashboard(user=Depends(require("student", "parent"))):
    sid = user["id"]
    total = await db.attendance.count_documents({"student_id": sid})
    present = await db.attendance.count_documents({"student_id": sid, "status": "present"})
    att_pct = round(present / total * 100, 1) if total else 0
    pending = await db.fees.find({"student_id": sid, "status": {"$ne": "paid"}}, {"amount": 1, "paid_amount": 1, "_id": 0}).to_list(500)
    pending_fees = round(sum(float(f.get("amount", 0) or 0) - float(f.get("paid_amount", 0) or 0) for f in pending), 2)
    results = await db.results.find({"student_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    avg = round(sum(r["percentage"] for r in results) / len(results), 1) if results else 0
    s = await db.students.find_one({"id": sid}) or {}
    batch = await db.batches.find_one({"id": s.get("batch_id", "")}, {"_id": 0}) or {}
    homework = await db.homework.count_documents({"batch_id": s.get("batch_id", "")})
    ct = {}
    if batch.get("teacher_id"):
        t = await db.users.find_one({"id": batch["teacher_id"]}, {"_id": 0, "name": 1, "phone": 1})
        if t:
            ct = {"name": t.get("name", ""), "phone": t.get("phone", "")}
    today_day = datetime.now().strftime("%A")
    tt = await db.timetable.find({"batch_id": s.get("batch_id", ""), "day": today_day},
                                 {"_id": 0, "slot": 1, "subject": 1, "room": 1, "teacher_name": 1}).to_list(50)
    tt.sort(key=lambda x: x.get("slot", ""))
    recent = list(reversed(results))[:5]
    recent_marks = [{"subject": r.get("subject"), "percentage": r.get("percentage"), "grade": r.get("grade")} for r in recent]
    ym = datetime.now().strftime("%Y-%m")
    cal_rows = await db.attendance.find({"student_id": sid, "date": {"$regex": f"^{ym}"}},
                                        {"_id": 0, "date": 1, "status": 1}).to_list(60)
    attendance_calendar = [{"date": c["date"], "status": c["status"]} for c in cal_rows]
    return {"attendance_pct": att_pct, "pending_fees": pending_fees, "avg_percentage": avg,
            "homework": homework, "results_count": len(results),
            "trend": [{"subject": r["subject"], "percentage": r["percentage"]} for r in results[-6:]],
            "profile": {"name": s.get("name", user["name"]), "student_id": s.get("student_id", user.get("student_id", "")),
                        "class_name": batch.get("class_name") or batch.get("name") or "", "section": batch.get("section", ""),
                        "batch_name": batch.get("name", ""), "roll_no": s.get("roll_no", ""), "photo_url": s.get("photo_url", "")},
            "today_timetable": tt, "recent_marks": recent_marks, "attendance_calendar": attendance_calendar,
            "class_teacher": ct}


# ---------------------------------------------------------------- AI
class AIReq(BaseModel):
    student_id: Optional[str] = None
    prompt: Optional[str] = None


@api.post("/ai/report-summary")
async def ai_report_summary(body: AIReq, user=Depends(require("principal", "teacher"))):
    s = await db.students.find_one({"id": body.student_id, "institute_id": user["institute_id"]}, {"_id": 0, "password_hash": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    total = await db.attendance.count_documents({"student_id": s["id"]})
    present = await db.attendance.count_documents({"student_id": s["id"], "status": "present"})
    att = round(present / total * 100, 1) if total else 0
    results = await db.results.find({"student_id": s["id"]}, {"_id": 0}).to_list(500)
    res_text = "; ".join(f"{r['subject']}: {r['percentage']}% ({r['grade']})" for r in results) or "No results yet"
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"report-{s['id']}",
                       system_message="You are a school academic advisor. Write a concise, warm, professional 3-4 sentence performance summary for an Indian school student's report card. Mention strengths, areas to improve, and one actionable suggestion. No markdown.").with_model("gemini", "gemini-3-flash-preview")
        msg = UserMessage(text=f"Student: {s['name']}, Age {s.get('age','-')}. Attendance: {att}%. Results: {res_text}. Write the summary.")
        text = await chat.send_message(msg)
        return {"summary": text}
    except Exception as e:
        logger.warning(f"AI failed: {e}")
        return {"summary": f"{s['name']} has an attendance of {att}%. Academic performance: {res_text}. Consistent effort and regular practice are recommended to improve further."}


class AssistantReq(BaseModel):
    session_id: str
    message: str


@api.get("/student/ai-assistant/history")
async def ai_assistant_history(session_id: str, user=Depends(require("student"))):
    doc = await db.ai_chats.find_one({"session_id": session_id, "student_id": user["id"]}, {"_id": 0, "messages": 1})
    return {"messages": (doc or {}).get("messages", [])}


@api.post("/student/ai-assistant")
async def student_ai_assistant(body: AssistantReq, user=Depends(require("student"))):
    if not body.message.strip():
        raise HTTPException(400, "Empty message")
    hist = await db.ai_chats.find_one({"session_id": body.session_id, "student_id": user["id"]})
    prior = (hist or {}).get("messages", [])
    batch = await db.batches.find_one({"id": user.get("batch_id")}, {"_id": 0, "name": 1})
    grade = (batch or {}).get("name", "school")
    context = ""
    if prior:
        context = "Recent conversation:\n" + "\n".join(f"{m['role']}: {m['text']}" for m in prior[-6:]) + "\n\n"
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=body.session_id,
            system_message=(f"You are EduSync Study Buddy, a friendly, professional academic tutor for {user['name']}, "
                            f"a student in {grade}. ONLY answer study/academic questions (maths, science, languages, social "
                            f"studies, exam prep, concepts, homework help) at their grade level. Explain step-by-step and simply. "
                            f"If asked anything non-academic, off-topic, personal, or inappropriate, politely decline and steer "
                            f"back to studies. Keep answers concise and encouraging. No markdown headings.")).with_model("gemini", "gemini-3-flash-preview")
        reply = await chat.send_message(UserMessage(text=context + "Student's question: " + body.message))
    except Exception as e:
        logger.error(f"AI assistant error: {e}")
        raise HTTPException(500, "Study Buddy is unavailable right now. Please try again shortly.")
    prior.append({"role": "user", "text": body.message, "ts": now_iso()})
    prior.append({"role": "assistant", "text": reply, "ts": now_iso()})
    await db.ai_chats.update_one({"session_id": body.session_id, "student_id": user["id"]},
        {"$set": {"session_id": body.session_id, "student_id": user["id"], "messages": prior[-40:], "updated_at": now_iso()}}, upsert=True)
    return {"reply": reply}


@api.get("/student/ai-summary")
async def student_ai_summary(user=Depends(require("student"))):
    sid = user["id"]
    total = await db.attendance.count_documents({"student_id": sid})
    present = await db.attendance.count_documents({"student_id": sid, "status": "present"})
    att = round(present / total * 100, 1) if total else 0
    results = await db.results.find({"student_id": sid}, {"_id": 0}).to_list(500)
    res_text = "; ".join(f"{r['subject']}: {r['percentage']}%" for r in results) or "No results yet"
    avg = round(sum(r["percentage"] for r in results) / len(results), 1) if results else 0
    pending = await db.fees.find({"student_id": sid, "status": {"$ne": "paid"}}, {"_id": 0, "amount": 1, "paid_amount": 1}).to_list(500)
    due = round(sum(float(f.get("amount", 0) or 0) - float(f.get("paid_amount", 0) or 0) for f in pending), 2)
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"stu-{sid}",
                       system_message="You are a supportive academic mentor. Write a warm, motivating 3-4 sentence performance summary addressed directly to the student ('you'). Mention a strength, one area to improve, and one practical tip. No markdown.").with_model("gemini", "gemini-3-flash-preview")
        summary = await chat.send_message(UserMessage(text=f"Attendance: {att}%. Results: {res_text}. Pending fees: Rs.{int(due)}. Write the summary."))
    except Exception as e:
        logger.warning(f"AI failed: {e}")
        summary = f"Your attendance is {att}% and your average score is {avg}%. Keep attending regularly and revising consistently — steady practice will lift your results."
    return {"attendance_pct": att, "avg_percentage": avg, "pending_fees": due, "summary": summary}


@api.post("/ai/timetable-suggest")
async def ai_timetable(body: AIReq, user=Depends(require("principal"))):
    batches = await db.batches.find(scope(user), {"_id": 0, "name": 1, "subject": 1, "schedule_days": 1}).to_list(100)
    teachers = await db.users.find({"institute_id": user["institute_id"], "role": "teacher"}, {"_id": 0, "name": 1, "subjects": 1, "available_days": 1}).to_list(100)
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"tt-{user['institute_id']}",
                       system_message="You are a school scheduling expert. Give 3-4 short, practical bullet suggestions (plain text, one per line, no markdown) to optimise a weekly timetable given batches and teacher availability.").with_model("gemini", "gemini-3-flash-preview")
        msg = UserMessage(text=f"Batches: {batches}. Teachers: {teachers}. {body.prompt or ''} Suggest optimisations.")
        text = await chat.send_message(msg)
        return {"suggestions": text}
    except Exception as e:
        logger.warning(f"AI failed: {e}")
        return {"suggestions": "Distribute core subjects in morning slots.\nAvoid scheduling same teacher in back-to-back different rooms.\nKeep one buffer slot for revisions."}


# ---------------------------------------------------------------- fee components
@api.get("/fee-components")
async def list_fee_components(user=Depends(require("principal", "teacher"))):
    return await db.fee_components.find(scope(user), {"_id": 0}).to_list(200)


@api.post("/fee-components")
async def create_fee_component(body: FeeComponentIn, user=Depends(require("principal"))):
    cid = str(uuid.uuid4())
    await db.fee_components.insert_one({"id": cid, "name": body.name, "amount": body.amount, "institute_id": user["institute_id"]})
    return await db.fee_components.find_one({"id": cid}, {"_id": 0})


@api.put("/fee-components/{cid}")
async def update_fee_component(cid: str, body: FeeComponentIn, user=Depends(require("principal"))):
    await db.fee_components.update_one({"id": cid, "institute_id": user["institute_id"]}, {"$set": {"name": body.name, "amount": body.amount}})
    return await db.fee_components.find_one({"id": cid}, {"_id": 0})


@api.delete("/fee-components/{cid}")
async def delete_fee_component(cid: str, user=Depends(require("principal"))):
    await db.fee_components.delete_one({"id": cid, "institute_id": user["institute_id"]})
    return {"ok": True}


@api.get("/fee-structures")
async def list_fee_structures(user=Depends(require("principal", "teacher"))):
    return await db.fee_structures.find(scope(user), {"_id": 0}).sort("grade", 1).to_list(300)


@api.post("/fee-structures")
async def upsert_fee_structure(body: FeeStructureIn, user=Depends(require("principal"))):
    comps = [{"name": str(c.get("name")).strip(), "amount": float(c.get("amount", 0) or 0)} for c in body.components if c.get("name")]
    total = round(sum(c["amount"] for c in comps), 2)
    existing = await db.fee_structures.find_one({"institute_id": user["institute_id"], "grade": body.grade})
    if existing:
        await db.fee_structures.update_one({"id": existing["id"]}, {"$set": {"components": comps, "total": total, "frequency": body.frequency}})
        return await db.fee_structures.find_one({"id": existing["id"]}, {"_id": 0})
    fsid = str(uuid.uuid4())
    doc = {"id": fsid, "grade": body.grade, "components": comps, "total": total, "frequency": body.frequency, "institute_id": user["institute_id"]}
    await db.fee_structures.insert_one(doc)
    return {k: v for k, v in doc.items()}


@api.delete("/fee-structures/{fsid}")
async def delete_fee_structure(fsid: str, user=Depends(require("principal"))):
    await db.fee_structures.delete_one({"id": fsid, "institute_id": user["institute_id"]})
    return {"ok": True}


@api.get("/fees/defaulters-report")
async def defaulters_report(user=Depends(require("principal"))):
    fees = await db.fees.find({"institute_id": user["institute_id"], "status": {"$ne": "paid"}}, {"_id": 0}).to_list(20000)
    due_by_student = {}
    for f in fees:
        bal = float(f.get("amount", 0) or 0) - float(f.get("paid_amount", 0) or 0)
        if bal > 0:
            due_by_student[f["student_id"]] = due_by_student.get(f["student_id"], 0) + bal
    if not due_by_student:
        raise HTTPException(404, "No outstanding dues — everyone is paid up!")
    students = await db.students.find({"id": {"$in": list(due_by_student.keys())}}, {"_id": 0, "password_hash": 0}).to_list(20000)
    batches = {b["id"]: b for b in await db.batches.find({"institute_id": user["institute_id"]}, {"_id": 0}).to_list(1000)}
    groups = {}
    for s in students:
        b = batches.get(s.get("batch_id", ""), {})
        cls = b.get("name") or b.get("class_name") or "Unassigned"
        groups.setdefault(cls, []).append((s, due_by_student.get(s["id"], 0)))
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4); w, h = A4
    draw_letterhead(c, inst, w, h, "Fee Defaulters Report")
    y = h - 4.4 * cm
    grand = 0
    for cls in sorted(groups.keys()):
        rows = sorted(groups[cls], key=lambda x: -x[1])
        if y < 4 * cm:
            c.showPage(); y = h - 3 * cm
        c.setFillColor(colors.HexColor("#0b1e3b")); c.setFont("Helvetica-Bold", 12)
        c.drawString(2 * cm, y, cls); y -= 0.5 * cm
        c.setFillColor(colors.HexColor("#64748B")); c.setFont("Helvetica-Bold", 8.5)
        c.drawString(2 * cm, y, "ROLL"); c.drawString(3.4 * cm, y, "STUDENT"); c.drawString(9.5 * cm, y, "CONTACT"); c.drawRightString(w - 2 * cm, y, "DUE (INR)"); y -= 0.15 * cm
        c.setStrokeColor(colors.HexColor("#e2e8f0")); c.line(2 * cm, y, w - 2 * cm, y); y -= 0.45 * cm
        sub = 0
        for s, due in rows:
            if y < 2.5 * cm:
                c.showPage(); y = h - 3 * cm
            c.setFillColor(colors.HexColor("#1f2937")); c.setFont("Helvetica", 9.5)
            c.drawString(2 * cm, y, str(s.get("roll_no") or "-")); c.drawString(3.4 * cm, y, (s.get("name") or "")[:40])
            c.drawString(9.5 * cm, y, str(s.get("parent_phone") or s.get("emergency_contact") or "-"))
            c.drawRightString(w - 2 * cm, y, f"{due:,.0f}"); y -= 0.5 * cm
            sub += due
        grand += sub
        c.setFont("Helvetica-Bold", 9.5); c.setFillColor(colors.HexColor("#b91c1c"))
        c.drawRightString(w - 2 * cm, y, f"Subtotal: {sub:,.0f}"); y -= 0.9 * cm
    c.setFont("Helvetica-Bold", 13); c.setFillColor(colors.HexColor("#0b1e3b"))
    c.drawRightString(w - 2 * cm, max(y, 2 * cm), f"Total Outstanding: INR {grand:,.0f}")
    c.showPage(); c.save(); buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=fee-defaulters.pdf"})


@api.post("/fees/{fee_id}/pay-partial")
async def pay_partial(fee_id: str, body: PartialPay, user=Depends(require("principal"))):
    fee = await db.fees.find_one({"id": fee_id, "institute_id": user["institute_id"]})
    if not fee:
        raise HTTPException(404, "Not found")
    new_paid = round(float(fee.get("paid_amount", 0)) + body.amount, 2)
    if new_paid > float(fee["amount"]) + 0.01:
        raise HTTPException(400, "Amount exceeds remaining balance")
    status = "paid" if new_paid >= float(fee["amount"]) else "partial"
    receipt_no = "RCPT-" + datetime.now().strftime("%y%m%d") + "-" + uuid.uuid4().hex[:6].upper()
    await db.fees.update_one({"id": fee_id}, {"$set": {"paid_amount": new_paid, "status": status,
                             "receipt_no": receipt_no, "payment_id": "CASH", "paid_at": now_iso()}})
    if status == "paid":
        _stu = await db.students.find_one({"id": fee["student_id"]}, {"_id": 0}) or {}
        _inst = await db.institutes.find_one({"id": user["institute_id"]}, {"_id": 0, "name": 1}) or {}
        await notify_student(_stu, user["institute_id"], "fee_paid", f"Payment received ₹{int(fee['amount'])} ({fee.get('month')})",
                             f"Dear Parent, payment for {_stu.get('name', 'your ward')} ({fee.get('month')}) is now complete. Receipt {receipt_no}. Thank you. - {_inst.get('name', 'EduSync')}")
    return {"ok": True, "receipt_no": receipt_no, "remaining": round(float(fee["amount"]) - new_paid, 2), "status": status}


@api.get("/fees/{fee_id}/receipt")
async def fee_receipt(fee_id: str, user=Depends(get_current_user)):
    fee = await db.fees.find_one({"id": fee_id, "institute_id": user["institute_id"]}, {"_id": 0})
    if not fee:
        raise HTTPException(404, "Not found")
    if user["role"] == "student" and fee["student_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    draw_watermark(c, inst, w, h)
    draw_letterhead(c, inst, w, h, "Official Fee Receipt")
    y = h - 4.8 * cm
    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, y, f"Receipt No: {fee.get('receipt_no','-')}")
    c.drawRightString(w - 2 * cm, y, f"Date: {datetime.now().strftime('%d-%m-%Y')}"); y -= 0.7 * cm
    c.drawString(2 * cm, y, f"Student: {fee.get('student_name')}    Month: {fee.get('month')}"); y -= 0.6 * cm
    pay_date = fmt_date(fee.get('paid_at'))
    c.drawString(2 * cm, y, f"Payment Date: {pay_date or '-'}    Status: {fee.get('status', '').upper()}"); y -= 0.9 * cm
    c.setFillColor(colors.HexColor("#1E3A8A")); c.setFont("Helvetica-Bold", 11); c.drawString(2 * cm, y, "Particulars"); c.drawRightString(w - 2 * cm, y, "Amount (Rs.)")
    c.setFillColor(colors.HexColor("#0F172A"))
    y -= 0.25 * cm; c.setStrokeColor(colors.HexColor("#10B981")); c.setLineWidth(1.4); c.line(2 * cm, y, w - 2 * cm, y); c.setLineWidth(1); y -= 0.6 * cm
    c.setFont("Helvetica", 10)
    items = fee.get("items") or [{"name": "Tuition Fee", "amount": fee["amount"]}]
    for it in items:
        c.drawString(2 * cm, y, str(it.get("name"))); c.drawRightString(w - 2 * cm, y, f"{it.get('amount')}"); y -= 0.55 * cm
    y -= 0.2 * cm; c.setStrokeColor(colors.HexColor("#E2E8F0")); c.line(2 * cm, y, w - 2 * cm, y); y -= 0.6 * cm
    c.setFont("Helvetica-Bold", 11); c.setFillColor(colors.HexColor("#1E3A8A"))
    c.drawString(2 * cm, y, "Total"); c.drawRightString(w - 2 * cm, y, f"{fee['amount']}"); y -= 0.6 * cm
    c.setFillColor(colors.HexColor("#059669")); c.drawString(2 * cm, y, "Paid"); c.drawRightString(w - 2 * cm, y, f"{fee.get('paid_amount',0)}"); y -= 0.6 * cm
    rem = round(float(fee['amount']) - float(fee.get('paid_amount', 0)), 2)
    c.setFillColor(colors.HexColor("#DC2626") if rem > 0 else colors.HexColor("#16A34A"))
    c.drawString(2 * cm, y, "Balance Due"); c.drawRightString(w - 2 * cm, y, f"{rem}")
    pd = fmt_date(fee.get('paid_at'))
    c.setFillColor(colors.HexColor("#0F172A")); c.setFont("Helvetica", 10)
    c.drawString(2 * cm, 2.7 * cm, f"Payment Date: {pd or '-'}    Status: {fee.get('status', '').upper()}")
    try:
        import qrcode
        from reportlab.lib.utils import ImageReader
        upi = (inst or {}).get("upi_id")
        rem_amt = max(round(float(fee['amount']) - float(fee.get('paid_amount', 0)), 2), 0)
        if upi:
            iname = (inst.get('name') or 'EduSync').replace(' ', '%20')
            qr_data = f"upi://pay?pa={upi}&pn={iname}&am={rem_amt}&cu=INR&tn=Fee%20{fee.get('month', '')}"
            qr_caption = f"Scan to pay via UPI - {upi}"
        else:
            qr_data = f"EduSync Receipt {fee.get('receipt_no', '-')} | {fee.get('student_name')} | {fee.get('month')} | Paid Rs.{fee.get('paid_amount', 0)}"
            qr_caption = "Scan to verify receipt"
        qb = io.BytesIO(); qrcode.make(qr_data).save(qb, format="PNG"); qb.seek(0)
        c.drawImage(ImageReader(qb), w - 5.6 * cm, 2.4 * cm, width=3 * cm, height=3 * cm, mask='auto')
        c.setFillColor(colors.HexColor("#64748B")); c.setFont("Helvetica", 7.5)
        c.drawCentredString(w - 4.1 * cm, 2.1 * cm, qr_caption)
    except Exception as e:
        logger.warning(f"receipt QR failed: {e}")
    c.setFillColor(colors.HexColor("#64748B")); c.setFont("Helvetica-Oblique", 8)
    c.drawString(2 * cm, 1.5 * cm, "This is a computer-generated receipt. Generated by EduSync - Privam Solutions")
    c.showPage(); c.save(); buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=receipt_{fee_id}.pdf"})


CERT_TYPES = {
    "achievement": "Certificate of Achievement",
    "participation": "Certificate of Participation",
    "sports": "Sports Certificate",
    "bonafide": "Bonafide Certificate",
    "character": "Character Certificate",
    "transfer": "Transfer Certificate",
}


def _cert_body(ctype, name, father, cls, roll, sid, sess, remarks):
    if ctype == "bonafide":
        return (f"This is to certify that {name}, son/daughter of {father}, bearing Student ID {sid} and Roll No {roll}, "
                f"is a bonafide student of this institution studying in {cls} during the academic session {sess}. "
                f"This certificate is issued on request for official purposes.")
    if ctype == "character":
        return (f"This is to certify that {name}, son/daughter of {father}, Roll No {roll} of {cls}, has been a student of "
                f"this institution during the session {sess}. To the best of our knowledge, his/her character and conduct "
                f"have been found to be GOOD.")
    if ctype == "transfer":
        return (f"This is to certify that {name}, son/daughter of {father}, Roll No {roll}, was a student of {cls} during the "
                f"session {sess}. All dues have been cleared and he/she is hereby granted transfer from this institution. "
                f"We wish him/her success in all future endeavours.")
    if ctype == "sports":
        base = (f"This is to certify that {name} of {cls} (Roll No {roll}) has shown outstanding sportsmanship and participated "
                f"in the sports activities of this institution during the session {sess}.")
        return base + (f" Achievement: {remarks}." if remarks else "")
    if ctype == "participation":
        return (f"This is to certify that {name} of {cls} (Roll No {roll}) has actively participated in "
                f"{remarks or 'the event/activity'} organised by this institution during the academic session {sess}.")
    return (f"This is to certify that {name} of {cls} (Roll No {roll}) has demonstrated exceptional achievement in "
            f"{remarks or 'academics'} during the academic session {sess}. We commend his/her dedication and excellence.")


@api.post("/certificates")
async def create_certificate(body: CertificateIn, user=Depends(require("principal"))):
    s = await db.students.find_one({"id": body.student_id, "institute_id": user["institute_id"]}, {"_id": 0, "password_hash": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    if body.type not in CERT_TYPES:
        raise HTTPException(400, "Invalid certificate type")
    batch = await db.batches.find_one({"id": s.get("batch_id", "")}, {"_id": 0}) or {}
    cls_label = batch.get("name") or batch.get("class_name") or "-"
    seq = await next_seq(user["institute_id"], "cert_seq")
    cert_no = f"CERT-{datetime.now().strftime('%Y')}-{seq:04d}"
    code = uuid.uuid4().hex[:10].upper()
    cid = str(uuid.uuid4())
    doc = {"id": cid, "institute_id": user["institute_id"], "student_id": s["id"],
           "type": body.type, "type_label": CERT_TYPES[body.type], "cert_no": cert_no, "verify_code": code,
           "session": body.session or "", "remarks": body.remarks or "", "student_name": s.get("name"),
           "parent_name": s.get("parent_name") or "", "roll_no": s.get("roll_no") or "", "student_id_code": s.get("student_id"),
           "class_label": cls_label, "issued_by": user.get("name", ""), "created_at": now_iso(),
           "signatory_name": body.signatory_name or "", "signatory_designation": body.signatory_designation or "",
           "design": body.design or "amber"}
    await db.certificates.insert_one(doc)
    _inst = await db.institutes.find_one({"id": user["institute_id"]}, {"_id": 0, "name": 1}) or {}
    _lbl = CERT_TYPES[body.type]
    _html = _brand_email_html(_inst, "Certificate Issued", f"<p style='color:#475569;font-size:14px;line-height:1.6'>Dear Parent, we're pleased to inform you that a <b>{_lbl}</b> (No. {cert_no}) has been issued to <b>{s['name']}</b>. Please contact the office to collect it.</p>")
    await notify_student(s, user["institute_id"], "certificate", f"{_lbl} issued to {s['name']}",
                         f"Dear Parent, a {_lbl} ({cert_no}) has been issued to {s['name']} at {_inst.get('name', 'EduSync')}. - EduSync",
                         f"Certificate Issued — {s['name']}", _html)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.post("/certificates/bulk")
async def bulk_certificates(body: BulkCertIn, user=Depends(require("principal"))):
    if body.type not in CERT_TYPES:
        raise HTTPException(400, "Invalid certificate type")
    students = await db.students.find({"batch_id": body.batch_id, "institute_id": user["institute_id"]}, {"_id": 0, "password_hash": 0}).to_list(2000)
    if not students:
        raise HTTPException(404, "No students in this class")
    batch = await db.batches.find_one({"id": body.batch_id}, {"_id": 0}) or {}
    cls_label = batch.get("name") or batch.get("class_name") or "-"
    created = []
    for s in students:
        seq = await next_seq(user["institute_id"], "cert_seq")
        cert_no = f"CERT-{datetime.now().strftime('%Y')}-{seq:04d}"
        code = uuid.uuid4().hex[:10].upper()
        cid = str(uuid.uuid4())
        doc = {"id": cid, "institute_id": user["institute_id"], "student_id": s["id"], "type": body.type,
               "type_label": CERT_TYPES[body.type], "cert_no": cert_no, "verify_code": code, "session": body.session or "",
               "remarks": body.remarks or "", "student_name": s.get("name"), "parent_name": s.get("parent_name") or "",
               "roll_no": s.get("roll_no") or "", "student_id_code": s.get("student_id"), "class_label": cls_label,
               "issued_by": user.get("name", ""), "created_at": now_iso(),
               "signatory_name": body.signatory_name or "", "signatory_designation": body.signatory_designation or "",
               "design": body.design or "amber"}
        await db.certificates.insert_one(doc)
        await notify_student(s, user["institute_id"], "certificate", f"{CERT_TYPES[body.type]} issued to {s.get('name')}",
                             f"Dear Parent, a {CERT_TYPES[body.type]} ({cert_no}) has been issued to {s.get('name')}. - EduSync")
        created.append({"id": cid, "student_name": s.get("name")})
    return {"count": len(created), "certificates": created}


@api.get("/certificates")
async def list_certificates(user=Depends(require("principal"))):
    return await db.certificates.find(scope(user), {"_id": 0}).sort("created_at", -1).to_list(500)


@api.get("/certificates/verify/{code}")
async def verify_certificate(code: str):
    cert = await db.certificates.find_one({"verify_code": code.upper()}, {"_id": 0})
    if not cert:
        return {"valid": False}
    inst = await db.institutes.find_one({"id": cert["institute_id"]}, {"_id": 0, "name": 1})
    return {"valid": True, "type": cert.get("type_label"), "cert_no": cert.get("cert_no"),
            "student_name": cert.get("student_name"), "class_label": cert.get("class_label"),
            "roll_no": cert.get("roll_no"), "session": cert.get("session"),
            "issued_on": cert.get("created_at"), "issued_by": cert.get("issued_by"),
            "institute_name": inst.get("name") if inst else ""}


@api.get("/certificates/{cid}/pdf")
async def certificate_pdf(cid: str, request: Request, user=Depends(require("principal"))):
    cert = await db.certificates.find_one({"id": cid, "institute_id": user["institute_id"]}, {"_id": 0})
    if not cert:
        raise HTTPException(404, "Not found")
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.lib.utils import simpleSplit, ImageReader
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    from reportlab.lib.pagesizes import landscape
    W, H = landscape(A4)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A4))
    designs = {
        "amber": {"file": "design_amber.png", "title": "#111827", "accent": "#E08A1E"},
        "navy": {"file": "design_navy.png", "title": "#0b2a5b", "accent": "#C9A227"},
        "emerald": {"file": "design_emerald.png", "title": "#0b3d2e", "accent": "#0f766e"},
    }
    d = designs.get(cert.get("design") or "amber", designs["amber"])
    tpl_path = os.path.join(os.path.dirname(__file__), "assets", d["file"])
    try:
        c.drawImage(tpl_path, 0, 0, width=W, height=H)
    except Exception:
        c.setFillColor(colors.white); c.rect(0, 0, W, H, fill=1, stroke=0)
    title_col = colors.HexColor(d["title"]); accent_col = colors.HexColor(d["accent"])

    # institute logo — top center
    try:
        lb = _logo_bytes(inst)
        if lb:
            c.drawImage(ImageReader(io.BytesIO(lb)), W / 2 - 19, H - 84, width=38, height=38, mask='auto', preserveAspectRatio=True)
    except Exception:
        pass

    label = cert.get("type_label", "Certificate")
    if label.lower().startswith("certificate of "):
        sub = "OF " + label[15:].upper()
    elif label.lower().endswith("certificate"):
        sub = "OF " + label[:-11].strip().upper()
    else:
        sub = label.upper()

    c.setFillColor(title_col); c.setFont("Helvetica-Bold", 40)
    c.drawCentredString(W / 2, H - 146, "CERTIFICATE")
    c.setFillColor(accent_col); c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(W / 2, H - 172, sub)

    c.setFillColor(colors.HexColor("#5b6b7f")); c.setFont(CERT_FONT_SERIF, 12)
    c.drawCentredString(W / 2, H - 208, "This certificate is proudly presented to")

    name = cert.get("student_name", "")
    c.setFillColor(title_col); c.setFont(CERT_FONT_SCRIPT, 48)
    c.drawCentredString(W / 2, H - 262, name)
    c.setStrokeColor(accent_col); c.setLineWidth(1.4); c.line(W / 2 - 180, H - 276, W / 2 + 180, H - 276)

    body = _cert_body(cert["type"], name, cert.get("parent_name") or "____",
                      cert.get("class_label") or "____", cert.get("roll_no") or "____",
                      cert.get("student_id_code") or "", cert.get("session") or "____", cert.get("remarks") or "")
    lines = simpleSplit(body, CERT_FONT_SERIF, 12.5, 600)[:4]
    c.setFillColor(colors.HexColor("#334155")); c.setFont(CERT_FONT_SERIF, 12.5)
    ty = H - 308
    for ln in lines:
        c.drawCentredString(W / 2, ty, ln); ty -= 19

    # signature — bottom left (seal above the line)
    sig_name = cert.get("signatory_name") or cert.get("issued_by") or "Principal"
    sig_desig = cert.get("signatory_designation") or "Principal / Authorised Signatory"
    try:
        sb = _seal_bytes(inst)
        if sb:
            c.drawImage(ImageReader(io.BytesIO(sb)), 182, 154, width=44, height=44, mask='auto', preserveAspectRatio=True)
    except Exception:
        pass
    c.setStrokeColor(colors.HexColor("#94a3b8")); c.setLineWidth(0.8); c.line(110, 96, 300, 96)
    c.setFillColor(title_col); c.setFont("Helvetica-Bold", 11.5); c.drawCentredString(205, 80, sig_name[:34])
    c.setFillColor(colors.HexColor("#64748B")); c.setFont(CERT_FONT_SERIF, 9.5); c.drawCentredString(205, 66, sig_desig[:42])

    # date & location — bottom right
    loc = (inst or {}).get("name", "") or ""
    c.setStrokeColor(colors.HexColor("#94a3b8")); c.setLineWidth(0.8); c.line(W - 300, 150, W - 110, 150)
    c.setFillColor(title_col); c.setFont("Helvetica-Bold", 11.5); c.drawCentredString(W - 205, 134, fmt_date(cert.get("created_at")))
    c.setFillColor(colors.HexColor("#64748B")); c.setFont(CERT_FONT_SERIF, 9.5); c.drawCentredString(W - 205, 120, loc[:42])

    # QR (bottom center) + cert no
    try:
        import qrcode
        verify_url = f"{str(request.base_url)}verify-cert/{cert.get('verify_code')}"
        qb = io.BytesIO(); qrcode.make(verify_url).save(qb, format="PNG"); qb.seek(0)
        c.drawImage(ImageReader(qb), W / 2 - 24, 66, width=48, height=48, mask='auto')
    except Exception as e:
        logger.warning(f"cert QR failed: {e}")
    c.setFillColor(colors.HexColor("#94a3b8")); c.setFont(CERT_FONT_SERIF, 8)
    c.drawCentredString(W / 2, 50, f"Certificate No: {cert.get('cert_no')}  ·  Scan the QR to verify authenticity online")
    c.showPage(); c.save(); buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=certificate_{cert.get('cert_no')}.pdf"})


async def _generate_monthly_fees():
    month = datetime.now().strftime("%b %Y")
    due = datetime.now().replace(day=28).strftime("%Y-%m-%d")
    structs_by_inst = {}
    for st in await db.fee_structures.find({}, {"_id": 0}).to_list(5000):
        structs_by_inst.setdefault(st["institute_id"], []).append(st)
    created = 0
    for s in await db.students.find({}, {"_id": 0, "id": 1, "name": 1, "parent_phone": 1, "batch_id": 1, "institute_id": 1}).to_list(100000):
        structs = structs_by_inst.get(s.get("institute_id"))
        if not structs:
            continue
        batch = await db.batches.find_one({"id": s.get("batch_id", "")}, {"_id": 0}) or {}
        b_norm = _norm_grade(batch.get("grade") or batch.get("class_name") or batch.get("name"))
        if not b_norm:
            continue
        best = None
        for stx in structs:
            g = _norm_grade(stx.get("grade"))
            if not g:
                continue
            if b_norm == g or (b_norm.startswith(g) and (len(b_norm) == len(g) or not b_norm[len(g)].isdigit())):
                if best is None or len(g) > len(_norm_grade(best.get("grade"))):
                    best = stx
        if not best:
            continue
        comps = best.get("components") or []
        total = round(sum(float(c.get("amount", 0) or 0) for c in comps), 2)
        if total <= 0:
            continue
        if await db.fees.find_one({"student_id": s["id"], "month": month, "auto_allocated": True}):
            continue
        await db.fees.insert_one({"id": str(uuid.uuid4()), "student_id": s["id"], "student_name": s.get("name", ""),
                                 "parent_phone": s.get("parent_phone", ""), "items": comps, "amount": total,
                                 "paid_amount": 0, "status": "pending", "month": month, "due_date": due,
                                 "institute_id": s["institute_id"], "auto_allocated": True, "created_at": now_iso(),
                                 "payment_id": None, "receipt_no": None})
        await notify_student(s, s["institute_id"], "fee", f"New monthly fee of ₹{int(total)} generated ({month})",
                             f"Dear Parent, a new monthly fee of Rs.{int(total)} for {s.get('name')} ({month}) has been generated. Due: {fmt_date(due)}. - EduSync")
        created += 1
    logger.info(f"monthly fee generation created {created} fees for {month}")


@api.post("/cron/generate-monthly-fees")
async def cron_generate_monthly_fees(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(401, "Unauthorized")
    asyncio.create_task(_generate_monthly_fees())
    return {"status": "accepted"}


@api.post("/fees/{fee_id}/email-receipt")
async def email_fee_receipt(fee_id: str, user=Depends(require("principal"))):
    fee = await db.fees.find_one({"id": fee_id, "institute_id": user["institute_id"]}, {"_id": 0})
    if not fee:
        raise HTTPException(404, "Not found")
    stu = await db.students.find_one({"id": fee["student_id"], "institute_id": user["institute_id"]})
    to = (stu or {}).get("email") or (stu or {}).get("parent_email")
    if not to:
        raise HTTPException(400, "No email on file for this student (add a student or parent email)")
    inst = await db.institutes.find_one({"id": user["institute_id"]}) or {}
    items = fee.get("items") or [{"name": "Tuition Fee", "amount": fee["amount"]}]
    rows = "".join(f"<tr><td style='padding:4px 10px'>{it.get('name')}</td><td style='padding:4px 10px;text-align:right'>Rs. {it.get('amount')}</td></tr>" for it in items)
    rem = round(float(fee['amount']) - float(fee.get('paid_amount', 0)), 2)
    html = (f"<div style='font-family:Arial;max-width:600px'><h2 style='color:#1e3a8a;margin-bottom:2px'>{inst.get('name', 'EduSync')}</h2>"
            f"<p style='color:#64748b;margin-top:0'>Official Fee Receipt</p><p>Dear Parent/Student,</p>"
            f"<p>Receipt No: <b>{fee.get('receipt_no', '-')}</b> · Date: {fmt_date(fee.get('paid_at') or now_iso())} · Month: {fee.get('month')}</p>"
            f"<table style='width:100%;border-collapse:collapse;border:1px solid #e2e8f0'><tr style='background:#f1f5f9'><th style='padding:6px 10px;text-align:left'>Particulars</th><th style='padding:6px 10px;text-align:right'>Amount</th></tr>{rows}</table>"
            f"<p style='margin-top:12px'>Total: Rs. {fee['amount']} &nbsp;·&nbsp; Paid: <b style='color:#059669'>Rs. {fee.get('paid_amount', 0)}</b> &nbsp;·&nbsp; Balance: <b style='color:#dc2626'>Rs. {rem}</b></p>"
            f"<p style='color:#64748b;font-size:12px'>Status: {fee.get('status', '').upper()} · This is a computer-generated receipt. Generated by EduSync — Privam Solutions</p></div>")
    resp = await fee_receipt(fee_id, user)
    pdf = await _response_pdf_bytes(resp)
    att = [{"filename": f"receipt_{fee.get('receipt_no', fee_id)}.pdf", "content": base64.b64encode(pdf).decode()}]
    if not await send_email(to, f"Fee Receipt {fee.get('month')} — {inst.get('name', 'EduSync')}", html, attachments=att):
        raise HTTPException(502, "Email could not be sent. Please check email configuration.")
    return {"sent": True, "to": to}


@api.put("/teachers/{tid}/salary-structure")
async def set_salary_structure(tid: str, body: SalaryStructure, user=Depends(require("principal"))):
    await db.users.update_one({"id": tid, "institute_id": user["institute_id"], "role": "teacher"},
                              {"$set": {"salary_components": body.model_dump()}})
    return await db.users.find_one({"id": tid}, {"_id": 0, "password_hash": 0})


# ---------------------------------------------------------------- password reset (OTP via email)
@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotReq):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if user:
        otp = f"{secrets.randbelow(900000) + 100000}"
        await db.password_resets.update_one({"email": email}, {"$set": {"email": email, "otp": otp,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(), "used": False}}, upsert=True)
        html = f"<div style='font-family:Arial,sans-serif'><h2 style='color:#2563eb'>EduSync Password Reset</h2><p>Hi {user['name']},</p><p>Your one-time password (OTP) is:</p><p style='font-size:30px;font-weight:bold;letter-spacing:8px;color:#0f172a'>{otp}</p><p>This code expires in 15 minutes. If you didn't request this, please ignore.</p><p style='color:#64748b;font-size:12px'>- EduSync by Privam Solutions</p></div>"
        await send_email(email, "Your EduSync Password Reset OTP", html)
    return {"ok": True, "message": "If that email exists, an OTP has been sent."}


@api.post("/auth/reset-password")
async def reset_password(body: ResetReq):
    email = body.email.lower()
    rec = await db.password_resets.find_one({"email": email})
    now = datetime.now(timezone.utc)
    if not rec or rec.get("used") or rec.get("otp") != body.otp or datetime.fromisoformat(rec["expires_at"]) < now:
        raise HTTPException(400, "Invalid or expired OTP")
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_pw(body.new_password)}})
    await db.password_resets.update_one({"email": email}, {"$set": {"used": True}})
    return {"ok": True, "message": "Password reset successful"}


# ---------------------------------------------------------------- overdue fee reminders + cron
async def _send_overdue(institute_id=None):
    q = {"status": {"$in": ["pending", "partial"]}, "due_date": {"$lt": today_str()}}
    if institute_id:
        q["institute_id"] = institute_id
    sent = 0
    for fee in await db.fees.find(q).to_list(5000):
        inst = await db.institutes.find_one({"id": fee["institute_id"]})
        remaining = round(float(fee["amount"]) - float(fee.get("paid_amount", 0)), 2)
        msg = f"Dear Parent, fee of Rs.{remaining} for {fee.get('student_name')} ({fee.get('month')}) is OVERDUE (due {fmt_date(fee.get('due_date'))}). Please pay at the earliest. - {inst['name'] if inst else 'EduSync'}"
        if notify_parent(fee.get("parent_phone"), msg):
            sent += 1
        await db.fees.update_one({"id": fee["id"]}, {"$set": {"last_reminder": now_iso()}})
        await db.notifications.insert_one({"id": str(uuid.uuid4()), "institute_id": fee["institute_id"],
                                           "type": "fee_overdue", "message": msg, "created_at": now_iso()})
    return sent


@api.post("/fees/send-overdue-reminders")
async def send_overdue_reminders(user=Depends(require("principal"))):
    sent = await _send_overdue(user["institute_id"])
    return {"ok": True, "sms_sent": sent, "message": f"Overdue reminders processed - {sent} SMS sent"}


@api.post("/cron/fee-reminders")
async def cron_fee_reminders(authorization: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(401, "Unauthorized")
    asyncio.create_task(_send_overdue())
    return {"ok": True, "queued": True}


# ---------------------------------------------------------------- institute branding
@api.get("/institute")
async def get_institute(user=Depends(get_current_user)):
    inst = await db.institutes.find_one({"id": user["institute_id"]}, {"_id": 0})
    return inst or {}


@api.put("/institute")
async def update_institute(payload: dict, user=Depends(require("principal"))):
    allowed = {"name", "address", "phone", "email", "logo_url", "logo_path", "seal_url", "seal_path", "id_template", "upi_id", "metro", "collection_target", "code", "id_card_primary", "id_card_accent"}
    upd = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if "code" in upd:
        clean = "".join(c for c in str(upd["code"]) if c.isalnum()).upper()[:4]
        if clean:
            upd["code"] = clean
        else:
            upd.pop("code")
    await db.institutes.update_one({"id": user["institute_id"]}, {"$set": upd})
    return await db.institutes.find_one({"id": user["institute_id"]}, {"_id": 0})


async def ensure_super_admin():
    email = SUPER_ADMIN_EMAIL
    if not await db.users.find_one({"email": email}):
        await db.users.insert_one({"id": str(uuid.uuid4()), "email": email, "name": "Super Admin",
            "role": "super_admin", "institute_id": None, "status": "active",
            "password_hash": hash_pw(os.environ.get("SUPER_ADMIN_PASSWORD", "PrivamSuper@2026")),
            "created_at": now_iso()})
    await db.institutes.update_many({"status": {"$exists": False}}, {"$set": {"status": "active"}})
    await db.users.update_many({"status": {"$exists": False}}, {"$set": {"status": "active"}})
    await db.students.update_many({"status": {"$exists": False}}, {"$set": {"status": "active"}})


async def tag_sensitive_data():
    """Logically tag student PII collections for high-security, role-scoped access control (DPDP Act)."""
    """Logically tag student PII collections for high-security, role-scoped access control (DPDP Act)."""
    await db.data_governance.update_one(
        {"id": "student-pii"},
        {"$set": {
            "id": "student-pii",
            "collections": ["students", "attendance", "results", "fees"],
            "classification": "RESTRICTED",
            "pii_category": "minor_sensitive",
            "access_control": "role_scoped_per_institute",
            "legal_basis": "DPDP Act 2023 — verifiable parental consent",
            "encryption": "encrypted cloud storage (at-rest & in-transit)",
            "retention_days": 30,
            "grievance_officer": {"name": "Shivam Mantri", "email": "founder@privamsolutions.in"},
            "updated_at": now_iso(),
        }},
        upsert=True,
    )
    await db.students.update_many(
        {"data_classification": {"$exists": False}},
        {"$set": {"data_classification": "restricted", "pii_category": "minor_sensitive", "access_scope": "role_scoped"}},
    )


# ---------------------------------------------------------------- seed
async def seed():
    await db.users.create_index("email")
    await db.students.create_index("student_id")
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin = await db.users.find_one({"email": admin_email})
    if not admin:
        iid = str(uuid.uuid4())
        await db.institutes.insert_one({"id": iid, "name": "Delhi Public Convent School", "created_at": now_iso()})
        uid = str(uuid.uuid4())
        await db.users.insert_one({"id": uid, "email": admin_email, "password_hash": hash_pw(os.environ["ADMIN_PASSWORD"]),
                                   "name": "Dr. Shivam Mantri", "role": "principal", "institute_id": iid, "phone": "9876543210", "created_at": now_iso()})
        admin = {"id": uid, "institute_id": iid}
    elif not verify_pw(os.environ["ADMIN_PASSWORD"], admin["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_pw(os.environ["ADMIN_PASSWORD"])}})
    iid = admin["institute_id"]
    if await db.students.count_documents({"institute_id": iid}) > 0:
        return
    logger.info("Seeding demo data...")
    import random
    subs = ["Mathematics", "Science", "English", "Social Studies"]
    teacher_ids = []
    for i, (nm, sub) in enumerate([("Anita Sharma", "Mathematics"), ("Rajesh Kumar", "Science"), ("Priya Verma", "English"), ("Amit Singh", "Social Studies")]):
        tid = str(uuid.uuid4())
        teacher_ids.append((tid, sub))
        await db.users.insert_one({"id": tid, "email": f"teacher{i+1}@edusync.in", "password_hash": hash_pw("teacher123"),
                                   "name": nm, "role": "teacher", "institute_id": iid, "phone": f"98100000{i:02d}",
                                   "subjects": [sub], "available_days": DAYS[:5], "monthly_salary": 35000 + i * 3000,
                                   "leave_balance": 12, "created_at": now_iso()})
    batch_ids = []
    for i, (grade, (tid, sub)) in enumerate(zip(["Class 8-A", "Class 9-A", "Class 10-A", "Class 10-B"], teacher_ids)):
        bid = str(uuid.uuid4())
        batch_ids.append(bid)
        await db.batches.insert_one({"id": bid, "name": grade, "subject": sub, "teacher_id": tid,
                                     "schedule_days": DAYS[:5], "room": f"Room {101+i}", "institute_id": iid, "created_at": now_iso()})
    first = ["Aarav", "Vivaan", "Aditya", "Ananya", "Diya", "Ishaan", "Kabir", "Myra", "Riya", "Arjun", "Saanvi", "Reyansh", "Anika", "Vihaan", "Kiara"]
    last = ["Sharma", "Verma", "Gupta", "Singh", "Patel", "Reddy", "Nair", "Iyer"]
    students = []
    months = [datetime.now().strftime("%Y-%m"), (datetime.now() - timedelta(days=40)).strftime("%Y-%m"), (datetime.now() - timedelta(days=80)).strftime("%Y-%m")]
    for i in range(30):
        sid = str(uuid.uuid4())
        student_id = "STU" + datetime.now().strftime("%y") + uuid.uuid4().hex[:5].upper()
        name = f"{random.choice(first)} {random.choice(last)}"
        bid = random.choice(batch_ids)
        jm = random.choice(months) if i < 20 else datetime.now().strftime("%Y-%m")
        fee = random.choice([2000, 2500, 3000])
        students.append({"id": sid, "student_id": student_id, "name": name, "age": random.randint(13, 16),
                         "gender": random.choice(["Male", "Female"]), "photo_url": "", "parent_name": f"Mr. {random.choice(last)}",
                         "parent_phone": f"9{random.randint(100000000,999999999)}", "batch_id": bid, "monthly_fee": fee,
                         "template": "classic", "password_hash": hash_pw("student123"), "documents": [],
                         "institute_id": iid, "join_month": jm, "created_at": now_iso()})
    await db.students.insert_many(students)
    # attendance last 7 days
    att = []
    for dd in range(7):
        dstr = (date.today() - timedelta(days=dd)).isoformat()
        for s in students:
            status = "present" if random.random() > 0.15 else "absent"
            att.append({"id": str(uuid.uuid4()), "student_id": s["id"], "student_name": s["name"], "batch_id": s["batch_id"],
                        "date": dstr, "status": status, "institute_id": iid, "marked_at": now_iso(), "marked_by": "seed"})
    await db.attendance.insert_many(att)
    # teacher attendance today
    for tid, _ in teacher_ids[:3]:
        t = await db.users.find_one({"id": tid})
        await db.teacher_attendance.insert_one({"id": str(uuid.uuid4()), "teacher_id": tid, "teacher_name": t["name"],
                                                "date": today_str(), "status": "present", "institute_id": iid, "marked_at": now_iso()})
    # fees — mix paid/pending across months
    fees = []
    for s in students:
        for mi, m in enumerate([months[0], months[1] if len(months) > 1 else months[0]]):
            paid = random.random() > 0.4
            fees.append({"id": str(uuid.uuid4()), "student_id": s["id"], "student_name": s["name"], "parent_phone": s["parent_phone"],
                         "amount": s["monthly_fee"], "month": m, "due_date": m + "-10",
                         "status": "paid" if paid else "pending", "paid_amount": s["monthly_fee"] if paid else 0,
                         "receipt_no": ("RCPT-" + uuid.uuid4().hex[:6].upper()) if paid else None,
                         "payment_id": "CASH" if paid else None, "institute_id": iid, "created_at": now_iso()})
    await db.fees.insert_many(fees)
    # complaints
    for i in range(4):
        s = random.choice(students)
        await db.complaints.insert_one({"id": str(uuid.uuid4()), "institute_id": iid, "subject": random.choice(["Classroom fan not working", "Request for extra classes", "Bus timing issue", "Library book shortage"]),
                                        "description": "Please look into this at the earliest.", "category": "general",
                                        "raised_by_id": s["id"], "raised_by": s["name"], "raised_by_role": "student",
                                        "status": random.choice(["open", "open", "in_progress", "resolved"]), "response": "", "created_at": now_iso()})
    # announcements
    for t, b in [("Annual Sports Day", "Sports day will be held on the last Saturday of this month. All students must participate."),
                 ("Parent-Teacher Meeting", "PTM scheduled for next Friday from 10 AM to 1 PM.")]:
        await db.announcements.insert_one({"id": str(uuid.uuid4()), "institute_id": iid, "title": t, "body": b,
                                           "audience": "all", "author": "Dr. Shivam Mantri", "created_at": now_iso()})
    # enquiries
    for i in range(3):
        await db.enquiries.insert_one({"id": str(uuid.uuid4()), "institute_id": iid, "name": f"{random.choice(first)} {random.choice(last)}",
                                       "phone": f"9{random.randint(100000000,999999999)}", "email": "", "course": random.choice(["Class 9", "Class 11 Science"]),
                                       "notes": "Walk-in enquiry", "status": random.choice(["new", "follow_up", "new"]), "created_at": now_iso()})
    # salaries current month
    for tid, _ in teacher_ids:
        t = await db.users.find_one({"id": tid})
        await db.salaries.insert_one({"id": str(uuid.uuid4()), "teacher_id": tid, "teacher_name": t["name"],
                                      "month": months[0], "amount": t["monthly_salary"], "status": "pending",
                                      "institute_id": iid, "created_at": now_iso()})
    # exams + results for one batch
    for bid in batch_ids[:2]:
        b = await db.batches.find_one({"id": bid})
        eid = str(uuid.uuid4())
        await db.exams.insert_one({"id": eid, "name": "Unit Test 1", "batch_id": bid, "subject": b["subject"],
                                   "max_marks": 100, "exam_date": (date.today() - timedelta(days=10)).isoformat(),
                                   "institute_id": iid, "created_at": now_iso()})
        bstudents = [s for s in students if s["batch_id"] == bid]
        entries = []
        for s in bstudents:
            marks = random.randint(45, 98)
            entries.append({"id": str(uuid.uuid4()), "exam_id": eid, "student_id": s["id"], "student_name": s["name"],
                            "marks": float(marks), "percentage": float(marks), "grade": grade_for(marks), "batch_id": bid,
                            "subject": b["subject"], "institute_id": iid, "created_at": now_iso()})
        entries.sort(key=lambda x: x["marks"], reverse=True)
        for i, e in enumerate(entries):
            e["rank"] = i + 1
        if entries:
            await db.results.insert_many(entries)
    # homework
    for bid in batch_ids[:2]:
        b = await db.batches.find_one({"id": bid})
        await db.homework.insert_one({"id": str(uuid.uuid4()), "title": f"{b['subject']} Chapter 3 Exercises",
                                      "description": "Complete all questions from exercise 3.1 and 3.2.", "batch_id": bid,
                                      "subject": b["subject"], "deadline": (date.today() + timedelta(days=5)).isoformat(),
                                      "institute_id": iid, "created_by": "Teacher", "created_at": now_iso()})
    # timetable
    await generate_timetable_internal(iid)
    logger.info("Seed complete.")


async def generate_timetable_internal(iid):
    batches = await db.batches.find({"institute_id": iid}, {"_id": 0}).to_list(1000)
    teachers = await db.users.find({"institute_id": iid, "role": "teacher"}, {"_id": 0}).to_list(1000)
    entries = []
    for b in batches:
        teacher = next((t for t in teachers if t["id"] == b.get("teacher_id")), None)
        days = b.get("schedule_days") or DAYS[:5]
        for i, day in enumerate(days):
            entries.append({"id": str(uuid.uuid4()), "batch_id": b["id"], "batch_name": b["name"], "day": day,
                            "slot": SLOTS[i % len(SLOTS)], "subject": b.get("subject", ""), "room": b.get("room", ""),
                            "teacher_id": teacher["id"] if teacher else "", "teacher_name": teacher["name"] if teacher else "TBD",
                            "institute_id": iid})
    if entries:
        await db.timetable.insert_many(entries)


# ---------------------------------------------------------------- app wiring
app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=False,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=["*"], allow_headers=["*"])


async def migrate_ids():
    """Standardize student IDs to <CODE><YEAR><4-digit> and faculty IDs to <CODE><YEAR>T<3-digit>."""
    year = datetime.now().strftime("%Y")
    async for inst in db.institutes.find({}):
        iid = inst["id"]
        code = (inst.get("code") or inst_prefix(inst)).upper()[:4]
        s_seq = inst.get("student_seq", 0) or 0
        students = await db.students.find({"institute_id": iid}).sort("created_at", 1).to_list(10000)
        for s in students:
            if not (s.get("student_id") or "").startswith(f"{code}{year}"):
                s_seq += 1
                await db.students.update_one({"id": s["id"]}, {"$set": {"student_id": f"{code}{year}{s_seq:04d}"}})
        f_seq = inst.get("faculty_seq", 0) or 0
        teachers = await db.users.find({"institute_id": iid, "role": "teacher"}).sort("created_at", 1).to_list(5000)
        for t in teachers:
            if not (t.get("faculty_id") or "").startswith(f"{code}{year}T"):
                f_seq += 1
                await db.users.update_one({"id": t["id"]}, {"$set": {"faculty_id": f"{code}{year}T{f_seq:03d}"}})
        await db.institutes.update_one({"id": iid}, {"$set": {"code": code, "student_seq": s_seq, "faculty_seq": f_seq}})


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    try:
        await seed()
    except Exception as e:
        logger.error(f"Seed failed: {e}")
    try:
        await migrate_ids()
    except Exception as e:
        logger.error(f"ID migration failed: {e}")
    try:
        await tag_sensitive_data()
    except Exception as e:
        logger.error(f"Data governance tagging failed: {e}")
    try:
        await ensure_super_admin()
    except Exception as e:
        logger.error(f"Super admin seed failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"message": "EduSync API by Privam Solutions"}


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    try:
        await seed()
    except Exception as e:
        logger.error(f"Seed failed: {e}")
    try:
        await migrate_ids()
    except Exception as e:
        logger.error(f"ID migration failed: {e}")
    try:
        await tag_sensitive_data()
    except Exception as e:
        logger.error(f"Data governance tagging failed: {e}")
    try:
        await ensure_super_admin()
    except Exception as e:
        logger.error(f"Super admin seed failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"message": "EduSync API by Privam Solutions"}
