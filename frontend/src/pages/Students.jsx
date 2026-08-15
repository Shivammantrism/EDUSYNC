import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api, { formatErr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { UserPlus, Users, Search, Upload, Loader2, KeyRound, FileText } from "lucide-react";
import CredentialsDialog from "@/components/CredentialsDialog";
import IDCard from "@/components/IDCard";

export default function Students() {
  const { user, institute } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState(null);
  const [batches, setBatches] = useState([]);
  const [q, setQ] = useState("");
  const [sp] = useSearchParams();
  const clsParam = sp.get("class");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [credResult, setCredResult] = useState(null);
  const blank = { name: "", age: "", gender: "Male", batch_id: "", email: "", parent_name: "", mother_name: "", parent_phone: "", emergency_contact: "", parent_email: "", roll_no: "", dob: "", blood_group: "", address: "", documents: [], monthly_fee: 2000, photo_url: "", template: "classic", password: "", parental_consent: true, student_id: "" };
  const [form, setForm] = useState(blank);
  const phoneOk = (v) => !v || /^[+]?\d{10,15}$/.test(String(v).replace(/[\s-]/g, ""));
  const emailOk = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const nextRoll = (batchId) => {
    const nums = (students || []).filter((s) => s.batch_id === batchId).map((s) => parseInt(String(s.roll_no || "").replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
    return String(nums.length ? Math.max(...nums) + 1 : 1);
  };

  const load = () => api.get("/students").then((r) => setStudents(r.data));
  useEffect(() => { load(); api.get("/batches").then((r) => setBatches(r.data)); }, []);

  const uploadPhoto = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/upload", fd);
      setForm((f) => ({ ...f, photo_url: data.url }));
      toast.success("Photo uploaded");
    } catch (e) { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };

  const save = async () => {
    const req = { name: "Full Name", batch_id: "Class & Section", roll_no: "Roll No", dob: "Date of Birth", blood_group: "Blood Group", emergency_contact: "Emergency Contact" };
    const missing = Object.entries(req).filter(([k]) => !String(form[k] || "").trim()).map(([, v]) => v);
    if (missing.length) { toast.error(`Please fill required field(s): ${missing.join(", ")}`); return; }
    if (!phoneOk(form.parent_phone) || !phoneOk(form.emergency_contact)) { toast.error("Enter valid phone number(s) — 10 to 15 digits"); return; }
    if (!emailOk(form.parent_email) || !emailOk(form.email)) { toast.error("Enter a valid email address"); return; }
    const dup = form.batch_id && students.some((s) => s.batch_id === form.batch_id && String(s.roll_no || "").trim().toLowerCase() === String(form.roll_no).trim().toLowerCase() && s.id !== editId);
    if (dup) { toast.error(`Roll No ${form.roll_no} is already assigned in this class. Please use a different roll number.`); return; }
    setSaving(true);
    try {
      const payload = { ...form, age: Number(form.age), monthly_fee: Number(form.monthly_fee) };
      if (editId) { await api.put(`/students/${editId}`, payload); toast.success("Student updated"); setOpen(false); setForm(blank); setEditId(null); load(); }
      else {
        const { data } = await api.post("/students", payload);
        toast.success(data.email_sent ? "Student registered — credentials emailed" : "Student registered — share credentials manually");
        setOpen(false); setForm(blank); setEditId(null); load();
        setCredResult({ ...data, roleLabel: "Student", loginIdLabel: "Student ID", loginId: data.student_id });
      }
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };
  const openEdit = (s) => { setForm({ name: s.name || "", age: s.age || "", gender: s.gender || "Male", batch_id: s.batch_id || "", email: s.email || "", parent_name: s.parent_name || "", mother_name: s.mother_name || "", parent_phone: s.parent_phone || "", emergency_contact: s.emergency_contact || "", parent_email: s.parent_email || "", roll_no: s.roll_no || "", dob: s.dob || "", blood_group: s.blood_group || "", address: s.address || "", documents: s.documents || [], monthly_fee: s.monthly_fee || 0, photo_url: s.photo_url || "", template: s.template || "classic", password: "", parental_consent: true, student_id: s.student_id || "" }); setEditId(s.id); setOpen(true); };
  const resend = async (s) => {
    try {
      const { data } = await api.post(`/students/${s.id}/resend-credentials`);
      toast.success(data.email_sent ? "New credentials emailed" : "New password set — share manually");
      setCredResult({ ...data, roleLabel: "Student", loginIdLabel: "Student ID", loginId: data.student_id });
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  if (!students) return <Loader />;
  const filtered = students.filter((s) => (s.name.toLowerCase().includes(q.toLowerCase()) || s.student_id.toLowerCase().includes(q.toLowerCase())) && (!clsParam || s.batch_id === clsParam));
  const errs = { parent_phone: !phoneOk(form.parent_phone), emergency_contact: !phoneOk(form.emergency_contact), parent_email: !emailOk(form.parent_email), email: !emailOk(form.email) };
  const hasErrs = Object.values(errs).some(Boolean);
  const rollDup = !!(form.roll_no && form.batch_id && students.some((s) => s.batch_id === form.batch_id && String(s.roll_no || "").trim().toLowerCase() === String(form.roll_no).trim().toLowerCase() && s.id !== editId));
  const selBatch = batches.find((b) => b.id === form.batch_id) || {};
  const previewStudent = { name: form.name, student_id: form.student_id || (editId ? "" : "AUTO ON SAVE"), photo_url: form.photo_url, roll_no: form.roll_no, class_name: selBatch.class_name || selBatch.name || "", section: selBatch.section || "", batch_name: selBatch.name || "", parent_name: form.parent_name, dob: form.dob, blood_group: form.blood_group, emergency_contact: form.emergency_contact, parent_phone: form.parent_phone, address: form.address, template: form.template };

  return (
    <div>
      <PageHeader title="Students" subtitle={`${students.length} enrolled`} actions={
        (user.role === "principal" || user.role === "teacher") && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(blank); setEditId(null); } }}>
            <DialogTrigger asChild><Button data-testid="add-student-btn" onClick={() => { setForm(blank); setEditId(null); }} className="btn-gradient"><UserPlus className="h-4 w-4 mr-2" />Register Student</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editId ? "Edit Student" : "Register New Student"}</DialogTitle></DialogHeader>
              <div className="grid md:grid-cols-[1fr_240px] gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center border">
                    {form.photo_url ? <img src={fileUrl(form.photo_url)} alt="" className="h-full w-full object-cover" /> : <Users className="h-8 w-8 text-slate-300" />}
                  </div>
                  <label className="cursor-pointer">
                    <div className="inline-flex items-center gap-2 text-sm px-3 py-2 border rounded-lg hover:bg-slate-50">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload Photo
                    </div>
                    <input data-testid="student-photo-input" type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadPhoto(e.target.files[0])} />
                  </label>
                </div>
                <div><Label>Full Name</Label><Input data-testid="student-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Age</Label><Input data-testid="student-age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></div>
                  <div><Label>Gender</Label>
                    <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                      <SelectTrigger data-testid="student-gender"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Class &amp; Section <span className="text-red-500">*</span></Label>
                    <Select value={form.batch_id} onValueChange={(v) => setForm((f) => ({ ...f, batch_id: v, roll_no: (!editId && !String(f.roll_no).trim()) ? nextRoll(v) : f.roll_no }))}>
                      <SelectTrigger data-testid="student-batch"><SelectValue placeholder="Select class" /></SelectTrigger>
                      <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{b.class_name ? ` · ${b.class_name}${b.section ? "-" + b.section : ""}` : ""}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Roll No <span className="text-red-500">*</span></Label><Input data-testid="student-roll-no" value={form.roll_no} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} placeholder="e.g. 12" />{rollDup && <p data-testid="err-roll-dup" className="text-xs text-amber-600 mt-1">⚠ Roll No already used in this class</p>}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Father's Name</Label><Input data-testid="student-parent-name" value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} /></div>
                  <div><Label>Mother's Name</Label><Input data-testid="student-mother-name" value={form.mother_name} onChange={(e) => setForm({ ...form, mother_name: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Primary Contact</Label><Input data-testid="student-parent-phone" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} placeholder="Parent mobile" />{errs.parent_phone && <p data-testid="err-parent-phone" className="text-xs text-red-500 mt-1">Enter 10–15 digits</p>}</div>
                  <div><Label>Emergency Contact <span className="text-red-500">*</span></Label><Input data-testid="student-emergency-contact" value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} placeholder="Alternate mobile" />{errs.emergency_contact && <p data-testid="err-emergency" className="text-xs text-red-500 mt-1">Enter 10–15 digits</p>}</div>
                </div>
                <div><Label>Parent / Guardian Email <span className="text-xs font-normal text-slate-400">(receipts & login)</span></Label><Input data-testid="student-parent-email" type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} placeholder="parent@example.com" />{errs.parent_email && <p data-testid="err-parent-email" className="text-xs text-red-500 mt-1">Invalid email address</p>}</div>
                <div><Label>Student Email <span className="text-xs font-normal text-slate-400">(optional — gets own login)</span></Label><Input data-testid="student-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="student@example.com" />{errs.email && <p data-testid="err-email" className="text-xs text-red-500 mt-1">Invalid email address</p>}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Date of Birth <span className="text-red-500">*</span></Label><Input data-testid="student-dob" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></div>
                  <div><Label>Blood Group <span className="text-red-500">*</span></Label>
                    <Select value={form.blood_group} onValueChange={(v) => setForm({ ...form, blood_group: v })}>
                      <SelectTrigger data-testid="student-blood-group"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{["A+","A-","B+","B-","O+","O-","AB+","AB-"].map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Home Address</Label><Input data-testid="student-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full residential address" /></div>
                <div>
                  <Label>Documents <span className="text-xs font-normal text-slate-400">(Birth Certificate, etc. — PDF/JPG)</span></Label>
                  <label className="mt-1.5 flex items-center gap-2 text-sm px-3 py-2 border rounded-lg hover:bg-slate-50 cursor-pointer w-fit" data-testid="student-doc-upload-label">
                    {docUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Upload Document
                    <input data-testid="student-doc-input" type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadDoc(e.target.files[0])} />
                  </label>
                  {(form.documents || []).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {form.documents.map((dd, i) => (
                        <div key={i} data-testid={`student-doc-${i}`} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2.5 py-1.5">
                          <span className="truncate">{dd.name}</span>
                          <button type="button" onClick={() => setForm((f) => ({ ...f, documents: f.documents.filter((_, j) => j !== i) }))} className="text-red-500 hover:underline ml-2 shrink-0">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Monthly Fee (₹)</Label><Input data-testid="student-monthly-fee" type="number" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} /></div>
                  <div><Label>ID Card Template</Label>
                    <Select value={form.template} onValueChange={(v) => setForm({ ...form, template: v })}>
                      <SelectTrigger data-testid="student-template"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="classic">Classic Blue</SelectItem><SelectItem value="modern">Modern Indigo</SelectItem><SelectItem value="minimal">Minimal</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                {editId ? (
                  <div><Label>Login Password <span className="text-xs font-normal text-slate-400">(blank = keep unchanged)</span></Label><Input data-testid="student-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="New password" /></div>
                ) : (
                  <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2" data-testid="student-cred-note">A unique Student ID and temporary password are auto-generated and emailed to the student &amp; parent on save.</p>
                )}
                {!editId && (
                  <label className="flex items-start gap-2.5 text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 cursor-pointer" data-testid="consent-label">
                    <input data-testid="parental-consent" type="checkbox" checked={form.parental_consent} onChange={(e) => setForm({ ...form, parental_consent: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-slate-600">Parental consent verified by the institute.</span>
                  </label>
                )}
              </div>
              <div className="hidden md:block">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Live ID Preview</p>
                <div className="sticky top-0" data-testid="id-preview"><IDCard student={previewStudent} institute={institute} /></div>
              </div>
              </div>
              <DialogFooter><Button data-testid="save-student-btn" onClick={save} disabled={saving || hasErrs || rollDup || !form.name || !form.batch_id || !form.roll_no || !form.dob || !form.blood_group || !form.emergency_contact} className="btn-gradient">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (editId ? "Save Changes" : "Register")}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />

      <Card className="border-slate-200">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input data-testid="student-search" placeholder="Search by name or ID..." value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 text-sm outline-none bg-transparent" />
        </div>
        {filtered.length === 0 ? <Empty icon={Users} title="No students found" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Student ID</TableHead><TableHead>Age</TableHead><TableHead>Parent Phone</TableHead><TableHead className="text-right">Fee</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} data-testid={`student-row-${s.id}`} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/app/students/${s.id}`)}>
                  <TableCell><div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold overflow-hidden">
                      {s.photo_url ? <img src={fileUrl(s.photo_url)} alt="" className="h-full w-full object-cover" /> : s.name[0]}
                    </div>
                    <span className="font-medium text-slate-800">{s.name}</span>
                  </div></TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{s.student_id}</TableCell>
                  <TableCell>{s.age}</TableCell>
                  <TableCell className="text-slate-500">{s.parent_phone}</TableCell>
                  <TableCell className="text-right">₹{s.monthly_fee}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button data-testid={`resend-student-${s.id}`} onClick={() => resend(s)} className="text-slate-300 hover:text-emerald-600" title="Reset & email new password"><KeyRound className="h-4 w-4" /></button>
                      {user.role === "principal" && <button data-testid={`edit-student-${s.id}`} onClick={() => openEdit(s)} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CredentialsDialog result={credResult} onClose={() => setCredResult(null)} />
    </div>
  );
}
