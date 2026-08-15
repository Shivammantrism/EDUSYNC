import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatErr, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { GraduationCap, Plus, Users, Trash2, Printer, ArrowRightLeft, CalendarDays, Mail, Pencil, UserPlus, BadgeCheck } from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CLASSES = ["Nursery", "LKG", "UKG", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
const SECTIONS = ["A", "B", "C", "D"];
const blank = { name: "", subject: "", teacher_id: "", room: "", class_name: "", section: "", schedule_days: DAYS.slice(0, 5) };
const label = (b) => `${b.name}${b.class_name ? ` · ${b.class_name}${b.section ? "-" + b.section : ""}` : ""}`;

export default function Batches() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [batches, setBatches] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blank);
  const [viewBatch, setViewBatch] = useState(null);
  const [roster, setRoster] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSel, setAddSel] = useState({});

  const load = () => api.get("/batches").then((r) => setBatches(r.data));
  const loadStudents = () => isPrincipal && api.get("/students").then((r) => setAllStudents(r.data)).catch(() => {});
  useEffect(() => {
    load();
    if (isPrincipal) { api.get("/teachers").then((r) => setTeachers(r.data)).catch(() => {}); loadStudents(); }
  }, []);

  const openCreate = () => { setForm(blank); setEditId(null); setOpen(true); };
  const openEdit = (b) => { setForm({ ...blank, ...b, schedule_days: b.schedule_days || DAYS.slice(0, 5) }); setEditId(b.id); setOpen(true); };
  const save = async () => {
    const payload = { name: form.name, subject: form.subject, teacher_id: form.teacher_id, room: form.room, class_name: form.class_name, section: form.section, schedule_days: form.schedule_days };
    try {
      if (editId) { await api.put(`/batches/${editId}`, payload); toast.success("Class updated"); }
      else { await api.post("/batches", payload); toast.success("Class created"); }
      setOpen(false); setForm(blank); setEditId(null); load();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!window.confirm("Delete this class?")) return; await api.delete(`/batches/${id}`); toast.success("Deleted"); load(); };

  const downloadTT = (bid) => {
    const token = localStorage.getItem("edusync_token");
    fetch(`${API}/timetable/pdf?batch_id=${bid}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((b) => window.open(URL.createObjectURL(b)))
      .catch(() => toast.error("Could not download timetable"));
  };
  const emailTT = async (bid) => {
    try { const { data } = await api.post(`/timetable/${bid}/email`); toast.success(`Timetable emailed to ${data.emailed_to}`); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail) || "Could not email timetable"); }
  };

  const openStudents = async (b) => {
    setViewBatch(b); setRoster(null);
    try { const { data } = await api.get(`/batches/${b.id}/students`); setRoster(data); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); setRoster([]); }
  };
  const moveStudent = async (sid, toBatch) => {
    try {
      await api.put(`/students/${sid}/move`, { batch_id: toBatch });
      toast.success("Student moved");
      setRoster((r) => r.filter((s) => s.id !== sid));
      load(); loadStudents();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const openAdd = () => { setAddSel({}); setAddOpen(true); };
  const confirmAdd = async () => {
    const ids = Object.keys(addSel).filter((k) => addSel[k]);
    if (!ids.length) { toast.error("Select at least one student"); return; }
    try {
      const { data } = await api.post(`/batches/${viewBatch.id}/assign`, { student_ids: ids });
      toast.success(`${data.moved} student(s) added`);
      setAddOpen(false);
      const { data: r } = await api.get(`/batches/${viewBatch.id}/students`); setRoster(r);
      load(); loadStudents();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  if (!batches) return <Loader />;
  const candidates = allStudents.filter((s) => s.batch_id !== viewBatch?.id);

  return (
    <div>
      <PageHeader title="Classes & Sections" subtitle={`${batches.length} classes`} actions={
        isPrincipal && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(blank); setEditId(null); } }}>
            <DialogTrigger asChild><Button data-testid="add-batch-btn" onClick={openCreate} className="btn-gradient"><Plus className="h-4 w-4 mr-2" />New Class</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? "Edit Class" : "Create a Class"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Class Name</Label><Input data-testid="batch-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Class 11 or Class 11 - A" /></div>
                <div><Label>Subject</Label><Input data-testid="batch-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Class <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Select value={form.class_name || "none"} onValueChange={(v) => setForm({ ...form, class_name: v === "none" ? "" : v })}>
                      <SelectTrigger data-testid="batch-class"><SelectValue placeholder="Nursery–12th" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">No Class</SelectItem>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Section <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Select value={form.section || "none"} onValueChange={(v) => setForm({ ...form, section: v === "none" ? "" : v })}>
                      <SelectTrigger data-testid="batch-section"><SelectValue placeholder="A / B / C" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">No Section</SelectItem>{SECTIONS.map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Class Teacher</Label>
                  <Select value={form.teacher_id || "none"} onValueChange={(v) => setForm({ ...form, teacher_id: v === "none" ? "" : v })}>
                    <SelectTrigger data-testid="batch-teacher"><SelectValue placeholder="Assign teacher" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Unassigned</SelectItem>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Room</Label><Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Room 101" /></div>
              </div>
              <DialogFooter><Button data-testid="save-batch-btn" onClick={save} disabled={!form.name} className="btn-gradient">{editId ? "Save Changes" : "Create"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />
      {batches.length === 0 ? <Empty icon={GraduationCap} title="No classes yet" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {batches.map((b) => (
            <Card key={b.id} data-testid={`batch-card-${b.id}`} className="p-5 border-slate-200 stat-card">
              <div className="flex items-start justify-between">
                <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><GraduationCap className="h-5 w-5" /></div>
                {isPrincipal && (
                  <div className="flex items-center gap-2">
                    <button data-testid={`edit-batch-${b.id}`} onClick={() => openEdit(b)} className="text-slate-300 hover:text-blue-500"><Pencil className="h-4 w-4" /></button>
                    <button data-testid={`del-batch-${b.id}`} onClick={() => del(b.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
              <p className="font-bold text-slate-900 font-heading">{b.name}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(b.class_name || b.section) && (
                  <span data-testid={`batch-classsec-${b.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                    {b.class_name || "—"}{b.section ? ` · Sec ${b.section}` : ""}
                  </span>
                )}
                {b.i_teach && (
                  <span data-testid={`batch-iteach-${b.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5"><BadgeCheck className="h-3 w-3" />You teach here</span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">{b.subject || "—"} · {b.room}</p>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                <span data-testid={`batch-strength-${b.id}`} className="text-slate-500 flex items-center gap-1"><Users className="h-4 w-4" />{b.student_count} students</span>
                <span className="text-slate-700 font-medium">{b.teacher_name}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button data-testid={`view-students-${b.id}`} onClick={() => openStudents(b)}
                  className="text-xs font-semibold text-violet-600 border border-violet-200 rounded-lg py-2 hover:bg-violet-50 flex items-center justify-center gap-1.5 transition-colors">
                  <Users className="h-3.5 w-3.5" /> View Students
                </button>
                <button data-testid={`print-ids-${b.id}`} onClick={() => navigate(`/app/print-ids/${b.id}`)}
                  className="text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50 flex items-center justify-center gap-1.5 transition-colors">
                  <Printer className="h-3.5 w-3.5" /> Print IDs
                </button>
              </div>
              <button data-testid={`batch-tt-${b.id}`} onClick={() => downloadTT(b.id)}
                className="mt-2 w-full text-xs font-semibold text-emerald-600 border border-emerald-200 rounded-lg py-2 hover:bg-emerald-50 flex items-center justify-center gap-1.5 transition-colors">
                <CalendarDays className="h-3.5 w-3.5" /> Timetable PDF
              </button>
              {isPrincipal && (
                <button data-testid={`batch-email-tt-${b.id}`} onClick={() => emailTT(b.id)}
                  className="mt-2 w-full text-xs font-semibold text-violet-600 border border-violet-200 rounded-lg py-2 hover:bg-violet-50 flex items-center justify-center gap-1.5 transition-colors">
                  <Mail className="h-3.5 w-3.5" /> Email to Class Teacher
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!viewBatch} onOpenChange={(v) => !v && setViewBatch(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 pr-6">
              <span>{viewBatch ? label(viewBatch) : ""} · {roster?.length ?? "…"} students</span>
              {isPrincipal && <Button data-testid="add-students-btn" size="sm" variant="outline" onClick={openAdd}><UserPlus className="h-4 w-4 mr-1.5" />Add Students</Button>}
            </DialogTitle>
          </DialogHeader>
          {roster === null ? <Loader /> : roster.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No students in this class yet.{isPrincipal ? " Use “Add Students” to assign from the school list." : ""}</p>
          ) : (
            <div className="space-y-2">
              {roster.map((s) => (
                <div key={s.id} data-testid={`roster-${s.id}`} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{s.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{s.student_id}</p>
                  </div>
                  {isPrincipal && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" />
                      <Select onValueChange={(v) => moveStudent(s.id, v)}>
                        <SelectTrigger data-testid={`move-${s.id}`} className="h-8 w-40 text-xs"><SelectValue placeholder="Move to…" /></SelectTrigger>
                        <SelectContent>
                          {batches.filter((b) => b.id !== viewBatch?.id).map((b) => <SelectItem key={b.id} value={b.id}>{label(b)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Students to {viewBatch ? label(viewBatch) : ""}</DialogTitle></DialogHeader>
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Every student is already in this class.</p>
          ) : (
            <div className="space-y-1.5">
              {candidates.map((s) => {
                const cur = batches.find((b) => b.id === s.batch_id);
                return (
                  <label key={s.id} data-testid={`add-cand-${s.id}`} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <Checkbox data-testid={`add-check-${s.id}`} checked={!!addSel[s.id]} onCheckedChange={(v) => setAddSel((p) => ({ ...p, [s.id]: !!v }))} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 text-sm truncate">{s.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{s.student_id}{cur ? ` · currently ${cur.name}` : " · unassigned"}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter><Button data-testid="confirm-add-students-btn" onClick={confirmAdd} disabled={candidates.length === 0} className="btn-gradient">Add Selected</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
