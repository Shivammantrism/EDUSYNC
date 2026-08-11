"""EduSync backend — multi-institute school management SaaS by Privam Solutions."""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
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

app = FastAPI(title="EduSync API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


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


async def send_email(to, subject, html):
    if not EMAIL_KEY or not to:
        logger.warning("Email skipped (no key/recipient)")
        return False
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                             headers={"X-Email-Key": EMAIL_KEY},
                             json={"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME})
        return r.status_code < 300
    except Exception as e:
        logger.warning(f"Email failed: {e}")
        return False


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
    coll = db.students if role == "student" else db.users
    user = await coll.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    user["role"] = role
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


class TeacherIn(BaseModel):
    name: str
    email: EmailStr
    password: str
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
    parent_name: Optional[str] = ""
    parent_phone: Optional[str] = ""
    batch_id: Optional[str] = ""
    password: Optional[str] = "student123"
    monthly_fee: float = Field(default=0, ge=0)
    template: Optional[str] = "classic"


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


class SubmissionIn(BaseModel):
    homework_id: str
    content: str


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


class ComplaintIn(BaseModel):
    subject: str
    description: str
    category: Optional[str] = "general"
    direction: Optional[str] = "principal"
    attachment_url: Optional[str] = ""


class ComplaintUpdate(BaseModel):
    status: str
    response: Optional[str] = ""


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
    await db.institutes.insert_one({"id": inst_id, "name": body.institute_name, "created_at": now_iso()})
    uid = str(uuid.uuid4())
    await db.users.insert_one({
        "id": uid, "email": email, "password_hash": hash_pw(body.password),
        "name": body.principal_name, "role": "principal", "institute_id": inst_id,
        "phone": body.phone, "created_at": now_iso()})
    token = make_token(uid, "principal", inst_id)
    return {"access_token": token, "user": {"id": uid, "name": body.principal_name, "email": email, "role": "principal", "institute_id": inst_id, "institute_name": body.institute_name}}


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
    if not user or not verify_pw(body.password, user.get("password_hash", "")):
        count = (rec.get("count", 0) + 1) if rec else 1
        upd = {"id": key, "count": count}
        if count >= 5:
            upd["locked_until"] = (now + timedelta(minutes=15)).isoformat()
            upd["count"] = 0
        await db.login_attempts.update_one({"id": key}, {"$set": upd}, upsert=True)
        raise HTTPException(401, "Invalid credentials")
    await db.login_attempts.delete_one({"id": key})
    token = make_token(user["id"], role, user["institute_id"])
    inst = await db.institutes.find_one({"id": user["institute_id"]}, {"_id": 0})
    return {"access_token": token, "user": {"id": user["id"], "name": user["name"], "role": role,
            "institute_id": user["institute_id"], "institute_name": inst["name"] if inst else "",
            "student_id": user.get("student_id"), "email": user.get("email")}}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    inst = await db.institutes.find_one({"id": user["institute_id"]}, {"_id": 0})
    user["institute_name"] = inst["name"] if inst else ""
    return user


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
def gen_student_id(inst_name):
    return "STU" + datetime.now().strftime("%y") + uuid.uuid4().hex[:5].upper()


@api.get("/students")
async def list_students(user=Depends(require("principal", "teacher")), batch_id: Optional[str] = None):
    q = scope(user)
    if user["role"] == "teacher":
        q["batch_id"] = {"$in": await teacher_batches(user)}
    if batch_id:
        q["batch_id"] = batch_id
    students = await db.students.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(2000)
    return students


@api.post("/students")
async def create_student(body: StudentIn, user=Depends(require("principal"))):
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    sid = str(uuid.uuid4())
    student_id = gen_student_id(inst["name"])
    doc = body.model_dump()
    doc.update({"id": sid, "student_id": student_id, "institute_id": user["institute_id"],
                "password_hash": hash_pw(body.password or "student123"), "documents": [],
                "created_at": now_iso(), "join_month": datetime.now().strftime("%Y-%m")})
    doc.pop("password", None)
    await db.students.insert_one(doc)
    out = await db.students.find_one({"id": sid}, {"_id": 0, "password_hash": 0})
    return out


@api.get("/students/{sid}")
async def get_student(sid: str, user=Depends(get_current_user)):
    if user["role"] == "student" and user["id"] != sid:
        raise HTTPException(403, "Forbidden")
    s = await db.students.find_one({"id": sid, "institute_id": user["institute_id"]}, {"_id": 0, "password_hash": 0})
    if not s:
        raise HTTPException(404, "Student not found")
    return s


@api.put("/students/{sid}")
async def update_student(sid: str, body: StudentIn, user=Depends(require("principal"))):
    upd = body.model_dump(exclude_none=True)
    upd.pop("password", None)
    await db.students.update_one({"id": sid, "institute_id": user["institute_id"]}, {"$set": upd})
    return await db.students.find_one({"id": sid}, {"_id": 0, "password_hash": 0})


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
    doc = body.model_dump()
    doc.update({"id": uid, "email": email, "password_hash": hash_pw(body.password), "role": "teacher",
                "institute_id": user["institute_id"], "created_at": now_iso()})
    doc.pop("password", None)
    await db.users.insert_one(doc)
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


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
    for b in batches:
        b["student_count"] = await db.students.count_documents({"batch_id": b["id"]})
        t = await db.users.find_one({"id": b.get("teacher_id")}, {"_id": 0, "name": 1})
        b["teacher_name"] = t["name"] if t else "Unassigned"
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


# ---------------------------------------------------------------- attendance
async def _mark_student(user, student, batch_id, status="present"):
    d = today_str()
    existing = await db.attendance.find_one({"student_id": student["id"], "date": d})
    if existing:
        await db.attendance.update_one({"id": existing["id"]}, {"$set": {"status": status, "marked_at": now_iso()}})
        return existing["id"], False
    aid = str(uuid.uuid4())
    await db.attendance.insert_one({"id": aid, "student_id": student["id"], "student_name": student["name"],
                                    "batch_id": batch_id or student.get("batch_id", ""), "date": d, "status": status,
                                    "institute_id": user["institute_id"], "marked_at": now_iso(), "marked_by": user["id"]})
    return aid, True


@api.post("/attendance/scan")
async def scan_attendance(body: AttendanceScan, user=Depends(require("principal", "teacher"))):
    student = await db.students.find_one({"student_id": body.code.strip(), "institute_id": user["institute_id"]}, {"_id": 0, "password_hash": 0})
    if not student:
        raise HTTPException(404, "Student not found for scanned code")
    _, created = await _mark_student(user, student, student.get("batch_id"))
    return {"student": {"id": student["id"], "name": student["name"], "student_id": student["student_id"], "photo_url": student.get("photo_url")},
            "status": "present", "new": created, "message": f"Attendance marked for {student['name']}"}


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
    html = f"<div style='font-family:Arial'><h3 style='color:#2563eb'>Leave Application</h3><p><b>{user['name']}</b> applied for leave from <b>{body.from_date}</b> to <b>{body.to_date}</b>.</p><p>Reason: {body.reason}</p><p style='color:#64748b;font-size:12px'>— EduSync</p></div>"
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
    if user["role"] == "student":
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
    return {"ok": True, "receipt_no": receipt_no}


@api.post("/fees/{fee_id}/mark-paid")
async def mark_fee_paid(fee_id: str, user=Depends(require("principal"))):
    fee = await db.fees.find_one({"id": fee_id, "institute_id": user["institute_id"]})
    if not fee:
        raise HTTPException(404, "Not found")
    receipt_no = "RCPT-" + datetime.now().strftime("%y%m%d") + "-" + uuid.uuid4().hex[:6].upper()
    await db.fees.update_one({"id": fee_id}, {"$set": {"status": "paid", "paid_amount": fee["amount"],
                             "receipt_no": receipt_no, "paid_at": now_iso(), "payment_id": "CASH"}})
    return {"ok": True, "receipt_no": receipt_no}


@api.post("/fees/{fee_id}/reminder")
async def send_fee_reminder(fee_id: str, user=Depends(require("principal"))):
    fee = await db.fees.find_one({"id": fee_id, "institute_id": user["institute_id"]})
    if not fee:
        raise HTTPException(404, "Not found")
    inst = await db.institutes.find_one({"id": user["institute_id"]})
    remaining = round(float(fee["amount"]) - float(fee.get("paid_amount", 0)), 2)
    msg = f"Dear Parent, fee of Rs.{remaining} for {fee.get('student_name')} ({fee.get('month')}) is due on {fee.get('due_date')}. Please pay at the earliest. - {inst['name'] if inst else 'EduSync'}"
    sms_sent = send_sms(fee.get("parent_phone"), msg)
    await db.fees.update_one({"id": fee_id}, {"$set": {"last_reminder": now_iso()}})
    await db.notifications.insert_one({"id": str(uuid.uuid4()), "institute_id": user["institute_id"],
                                       "type": "fee_reminder", "message": msg, "created_at": now_iso()})
    return {"ok": True, "sms_sent": sms_sent, "message": "Reminder sent via SMS" if sms_sent else "Reminder logged (SMS not delivered — check parent phone)"}


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
    for e in entries:
        e.pop("_id", None)
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
    if user["role"] == "student":
        s = await db.students.find_one({"id": user["id"]})
        q["batch_id"] = s.get("batch_id", "")
    elif user["role"] == "teacher":
        batches = await db.batches.find({"institute_id": user["institute_id"], "teacher_id": user["id"]}, {"id": 1, "_id": 0}).to_list(1000)
        q["batch_id"] = {"$in": [b["id"] for b in batches]}
    hw = await db.homework.find(q, {"_id": 0}).sort("deadline", -1).to_list(1000)
    for h in hw:
        h["submission_count"] = await db.submissions.count_documents({"homework_id": h["id"]})
        if user["role"] == "student":
            sub = await db.submissions.find_one({"homework_id": h["id"], "student_id": user["id"]}, {"_id": 0})
            h["my_submission"] = sub
    return hw


@api.post("/homework")
async def create_homework(body: HomeworkIn, user=Depends(require("principal", "teacher"))):
    hid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": hid, "institute_id": user["institute_id"], "created_by": user["name"], "created_at": now_iso()})
    await db.homework.insert_one(doc)
    return await db.homework.find_one({"id": hid}, {"_id": 0})


@api.post("/homework/submit")
async def submit_homework(body: SubmissionIn, user=Depends(require("student"))):
    existing = await db.submissions.find_one({"homework_id": body.homework_id, "student_id": user["id"]})
    if existing:
        await db.submissions.update_one({"id": existing["id"]}, {"$set": {"content": body.content, "submitted_at": now_iso(), "status": "submitted"}})
        return await db.submissions.find_one({"id": existing["id"]}, {"_id": 0})
    sub_id = str(uuid.uuid4())
    await db.submissions.insert_one({"id": sub_id, "homework_id": body.homework_id, "student_id": user["id"],
                                     "student_name": user["name"], "content": body.content, "status": "submitted",
                                     "institute_id": user["institute_id"], "submitted_at": now_iso()})
    return await db.submissions.find_one({"id": sub_id}, {"_id": 0})


@api.get("/homework/{hid}/submissions")
async def hw_submissions(hid: str, user=Depends(require("principal", "teacher"))):
    return await db.submissions.find({"homework_id": hid}, {"_id": 0}).to_list(1000)


@api.put("/submissions/{sub_id}/complete")
async def mark_submission(sub_id: str, user=Depends(require("principal", "teacher"))):
    await db.submissions.update_one({"id": sub_id}, {"$set": {"status": "completed", "reviewed_at": now_iso()}})
    return {"ok": True}


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
    comp = t.get("salary_components") or {}
    base = float(comp.get("base", t.get("monthly_salary", 0)))
    hra = float(comp.get("hra", 0))
    allow = float(comp.get("allowances", 0))
    ded = float(comp.get("deductions", 0))
    gross = round(base + hra + allow, 2)
    y, m = int(body.month[:4]), int(body.month[5:7])
    dim = calendar.monthrange(y, m)[1]
    ms, me = date(y, m, 1), date(y, m, dim)
    lwp_days = 0
    for lv in await db.leaves.find({"institute_id": user["institute_id"], "teacher_id": body.teacher_id, "status": "rejected"}).to_list(1000):
        try:
            f = date.fromisoformat(lv["from_date"]); tt = date.fromisoformat(lv["to_date"])
        except Exception:
            continue
        s0, e0 = max(f, ms), min(tt, me)
        if s0 <= e0:
            lwp_days += (e0 - s0).days + 1
    lwp_amount = round(gross / dim * lwp_days, 2) if dim else 0
    net = round(gross - ded - lwp_amount, 2)
    sid = str(uuid.uuid4())
    await db.salaries.insert_one({"id": sid, "teacher_id": body.teacher_id, "teacher_name": t["name"],
                                  "month": body.month, "base": base, "hra": hra, "allowances": allow, "deductions": ded,
                                  "gross": gross, "days_in_month": dim, "lwp_days": lwp_days, "lwp_amount": lwp_amount,
                                  "amount": net, "status": "pending", "institute_id": user["institute_id"], "created_at": now_iso()})
    return await db.salaries.find_one({"id": sid}, {"_id": 0})


@api.put("/salaries/{sid}/pay")
async def pay_salary(sid: str, user=Depends(require("principal"))):
    slip_no = "SAL-" + datetime.now().strftime("%y%m%d") + "-" + uuid.uuid4().hex[:5].upper()
    await db.salaries.update_one({"id": sid, "institute_id": user["institute_id"]}, {"$set": {"status": "paid", "paid_at": now_iso(), "slip_no": slip_no}})
    return {"ok": True, "slip_no": slip_no}


# ---------------------------------------------------------------- announcements
@api.get("/announcements")
async def list_announcements(user=Depends(get_current_user)):
    q = scope(user)
    if user["role"] in ("teacher", "student"):
        q["audience"] = {"$in": ["all", user["role"] + "s"]}
    return await db.announcements.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/announcements")
async def create_announcement(body: AnnouncementIn, user=Depends(require("principal"))):
    aid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": aid, "institute_id": user["institute_id"], "author": user["name"], "created_at": now_iso()})
    await db.announcements.insert_one(doc)
    return await db.announcements.find_one({"id": aid}, {"_id": 0})


@api.delete("/announcements/{aid}")
async def del_announcement(aid: str, user=Depends(require("principal"))):
    await db.announcements.delete_one({"id": aid, "institute_id": user["institute_id"]})
    return {"ok": True}


# ---------------------------------------------------------------- complaints
@api.get("/complaints")
async def list_complaints(user=Depends(get_current_user)):
    if user["role"] == "student":
        q = {"institute_id": user["institute_id"], "raised_by_id": user["id"]}
    elif user["role"] == "teacher":
        q = {"institute_id": user["institute_id"], "$or": [{"raised_by_id": user["id"]}, {"direction": {"$in": ["teacher", "both"]}}]}
    else:
        q = scope(user)
    return await db.complaints.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.post("/complaints")
async def create_complaint(body: ComplaintIn, user=Depends(require("teacher", "student"))):
    cid = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({"id": cid, "institute_id": user["institute_id"], "raised_by_id": user["id"], "raised_by": user["name"],
                "raised_by_role": user["role"], "status": "open", "response": "", "created_at": now_iso()})
    await db.complaints.insert_one(doc)
    return await db.complaints.find_one({"id": cid}, {"_id": 0})


@api.put("/complaints/{cid}")
async def update_complaint(cid: str, body: ComplaintUpdate, user=Depends(require("principal"))):
    await db.complaints.update_one({"id": cid, "institute_id": user["institute_id"]},
                                   {"$set": {"status": body.status, "response": body.response or "", "updated_at": now_iso()}})
    return await db.complaints.find_one({"id": cid}, {"_id": 0})


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
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "assigned_to" in upd:
        t = await db.users.find_one({"id": upd["assigned_to"]})
        upd["assigned_to_name"] = t["name"] if t else ""
    await db.enquiries.update_one({"id": eid, "institute_id": user["institute_id"]}, {"$set": upd})
    return await db.enquiries.find_one({"id": eid}, {"_id": 0})


# ---------------------------------------------------------------- timetable
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
SLOTS = ["09:00-10:00", "10:00-11:00", "11:15-12:15", "12:15-13:15", "14:00-15:00", "15:00-16:00"]


@api.get("/timetable")
async def get_timetable(user=Depends(get_current_user), batch_id: Optional[str] = None):
    q = scope(user)
    if user["role"] == "student":
        s = await db.students.find_one({"id": user["id"]})
        q["batch_id"] = s.get("batch_id", "")
    elif user["role"] == "teacher":
        q["batch_id"] = {"$in": await teacher_batches(user)}
    elif batch_id:
        q["batch_id"] = batch_id
    return await db.timetable.find(q, {"_id": 0}).to_list(500)


@api.post("/timetable/generate")
async def generate_timetable(user=Depends(require("principal"))):
    batches = await db.batches.find(scope(user), {"_id": 0}).to_list(1000)
    teachers = await db.users.find({"institute_id": user["institute_id"], "role": "teacher"}, {"_id": 0}).to_list(1000)
    on_leave = set()
    tstr = today_str()
    for lv in await db.leaves.find({"institute_id": user["institute_id"], "status": "approved"}, {"_id": 0}).to_list(1000):
        if lv["from_date"] <= tstr <= lv["to_date"]:
            on_leave.add(lv["teacher_id"])
    await db.timetable.delete_many(scope(user))
    entries = []
    for b in batches:
        teacher = next((t for t in teachers if t["id"] == b.get("teacher_id") and t["id"] not in on_leave), None)
        if not teacher:
            teacher = next((t for t in teachers if t["id"] not in on_leave), None)
        days = b.get("schedule_days") or DAYS[:5]
        for i, day in enumerate(days):
            slot = SLOTS[i % len(SLOTS)]
            entries.append({"id": str(uuid.uuid4()), "batch_id": b["id"], "batch_name": b["name"], "day": day,
                            "slot": slot, "subject": b.get("subject", ""), "room": b.get("room", ""),
                            "teacher_id": teacher["id"] if teacher else "", "teacher_name": teacher["name"] if teacher else "TBD",
                            "institute_id": user["institute_id"]})
    if entries:
        await db.timetable.insert_many(entries)
    for e in entries:
        e.pop("_id", None)
    return {"ok": True, "count": len(entries), "entries": entries}


# ---------------------------------------------------------------- report card PDF
@api.get("/students/{sid}/report")
async def report_card(sid: str, user=Depends(get_current_user)):
    if user["role"] == "student" and user["id"] != sid:
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
    c.setFillColor(colors.HexColor("#64748B"))
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(2 * cm, 1.5 * cm, "Generated by EduSync — Privam Solutions")
    c.showPage()
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"inline; filename=report_{s['student_id']}.pdf"})


@api.get("/salaries/{sid}/slip")
async def salary_slip(sid: str, user=Depends(require("principal", "teacher"))):
    sal = await db.salaries.find_one({"id": sid, "institute_id": user["institute_id"]}, {"_id": 0})
    if not sal:
        raise HTTPException(404, "Not found")
    if user["role"] == "teacher" and sal["teacher_id"] != user["id"]:
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
    draw_letterhead(c, inst, w, h, f"Salary Slip - {sal['month']}")
    y = h - 4.7 * cm
    rows = [("Employee", sal["teacher_name"]), ("Month", sal["month"]),
            ("Base Pay", f"Rs. {sal.get('base', sal['amount'])}"), ("HRA", f"Rs. {sal.get('hra', 0)}"),
            ("Allowances", f"Rs. {sal.get('allowances', 0)}"), ("Gross", f"Rs. {sal.get('gross', sal['amount'])}"),
            ("Deductions", f"- Rs. {sal.get('deductions', 0)}"),
            (f"LWP ({sal.get('lwp_days', 0)} day/{sal.get('days_in_month', 30)} days)", f"- Rs. {sal.get('lwp_amount', 0)}"),
            ("NET PAY", f"Rs. {sal['amount']}"), ("Status", sal["status"].upper()), ("Slip No", sal.get("slip_no", "-"))]
    for label, val in rows:
        highlight = label in ("NET PAY", "Gross")
        c.setFillColor(colors.HexColor("#059669") if highlight else colors.HexColor("#1E3A8A"))
        c.setFont("Helvetica-Bold", 11); c.drawString(2 * cm, y, label + ":")
        c.setFillColor(colors.HexColor("#059669") if highlight else colors.HexColor("#0F172A"))
        c.setFont("Helvetica-Bold" if highlight else "Helvetica", 11); c.drawString(9 * cm, y, str(val)); y -= 0.75 * cm
    c.setFillColor(colors.HexColor("#0F172A"))
    c.setFillColor(colors.HexColor("#64748B")); c.setFont("Helvetica-Oblique", 8)
    c.drawString(2 * cm, 1.5 * cm, "Generated by EduSync — Privam Solutions")
    c.showPage(); c.save(); buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=slip_{sid}.pdf"})


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
async def student_dashboard(user=Depends(require("student"))):
    sid = user["id"]
    total = await db.attendance.count_documents({"student_id": sid})
    present = await db.attendance.count_documents({"student_id": sid, "status": "present"})
    att_pct = round(present / total * 100, 1) if total else 0
    pending = await db.fees.find({"student_id": sid, "status": "pending"}, {"amount": 1, "_id": 0}).to_list(500)
    pending_fees = sum(f["amount"] for f in pending)
    results = await db.results.find({"student_id": sid}, {"_id": 0}).to_list(500)
    avg = round(sum(r["percentage"] for r in results) / len(results), 1) if results else 0
    s = await db.students.find_one({"id": sid})
    homework = await db.homework.count_documents({"batch_id": s.get("batch_id", "")})
    return {"attendance_pct": att_pct, "pending_fees": pending_fees, "avg_percentage": avg,
            "homework": homework, "results_count": len(results),
            "trend": [{"subject": r["subject"], "percentage": r["percentage"]} for r in results[-6:]]}


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
    c.drawRightString(w - 2 * cm, y, f"Date: {datetime.now().strftime('%d %b %Y')}"); y -= 0.7 * cm
    c.drawString(2 * cm, y, f"Student: {fee.get('student_name')}    Month: {fee.get('month')}"); y -= 1 * cm
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
    c.setFillColor(colors.HexColor("#64748B")); c.setFont("Helvetica-Oblique", 8)
    c.drawString(2 * cm, 1.5 * cm, "This is a computer-generated receipt. Generated by EduSync - Privam Solutions")
    c.showPage(); c.save(); buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=receipt_{fee_id}.pdf"})


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
        otp = f"{random.randint(100000, 999999)}"
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
        msg = f"Dear Parent, fee of Rs.{remaining} for {fee.get('student_name')} ({fee.get('month')}) is OVERDUE (due {fee.get('due_date')}). Please pay at the earliest. - {inst['name'] if inst else 'EduSync'}"
        if send_sms(fee.get("parent_phone"), msg):
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
async def update_institute(body: InstituteUpdate, user=Depends(require("principal"))):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    await db.institutes.update_one({"id": user["institute_id"]}, {"$set": upd})
    return await db.institutes.find_one({"id": user["institute_id"]}, {"_id": 0})


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


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"message": "EduSync API by Privam Solutions"}
