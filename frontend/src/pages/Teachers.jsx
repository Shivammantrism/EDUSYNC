import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { UserPlus, Users, Trash2, IdCard, Printer, KeyRound } from "lucide-react";
import IDCard from "@/components/IDCard";
import CredentialsDialog from "@/components/CredentialsDialog";

export default function Teachers() {
  const { institute } = useAuth();
  const [teachers, setTeachers] = useState(null);
  const [open, setOpen] = useState(false);
  const [idCardFor, setIdCardFor] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "teacher123", phone: "", subjects: "", monthly_salary: 30000 });
  const [editId, setEditId] = useState(null);
  const [credResult, setCredResult] = useState(null);

  const load = () => api.get("/teachers").then((r) => setTeachers(r.data));
  useEffect(() => { load(); }, []);

  const blankT = { name: "", email: "", password: "teacher123", phone: "", subjects: "", monthly_salary: 30000, leave_balance: 12 };
  const reset = () => { setForm(blankT); setEditId(null); };
  const save = async () => {
    const payload = { name: form.name, email: form.email, phone: form.phone, monthly_salary: Number(form.monthly_salary), subjects: form.subjects.split(",").map((s) => s.trim()).filter(Boolean), available_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], leave_balance: Number(form.leave_balance ?? 12) };
    try {
      if (editId) { await api.put(`/teachers/${editId}`, { ...payload, ...(form.password ? { password: form.password } : {}) }); toast.success("Teacher updated"); setOpen(false); reset(); load(); }
      else {
        const { data } = await api.post("/teachers", payload);
        toast.success(data.email_sent ? "Teacher added — credentials emailed" : "Teacher added — share credentials manually");
        setOpen(false); reset(); load();
        setCredResult({ ...data, roleLabel: "Teacher", loginIdLabel: "Login Email", loginId: data.email });
      }
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const openEdit = (t) => { setForm({ name: t.name || "", email: t.email || "", password: "", phone: t.phone || "", subjects: (t.subjects || []).join(", "), monthly_salary: t.monthly_salary || 0, leave_balance: t.leave_balance ?? 12 }); setEditId(t.id); setOpen(true); };
  const del = async (id) => { await api.delete(`/teachers/${id}`); toast.success("Removed"); load(); };
  const resend = async (t) => {
    try {
      const { data } = await api.post(`/teachers/${t.id}/resend-credentials`);
      toast.success(data.email_sent ? "New credentials emailed" : "New password set — share manually");
      setCredResult({ ...data, roleLabel: "Teacher", loginIdLabel: "Login Email", loginId: data.email });
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  if (!teachers) return <Loader />;
  return (
    <div>
      <PageHeader title="Teachers & Staff" subtitle={`${teachers.length} teachers`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-teacher-btn" className="btn-gradient"><UserPlus className="h-4 w-4 mr-2" />Add Teacher</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Teacher</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input data-testid="teacher-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input data-testid="teacher-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              {editId ? (
                <div><Label>New Password <span className="text-xs font-normal text-slate-400">(blank = unchanged)</span></Label><Input data-testid="teacher-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="leave blank to keep" /></div>
              ) : (
                <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2" data-testid="teacher-cred-note">A unique Faculty ID and temporary password are auto-generated and emailed to the teacher on save.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input data-testid="teacher-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Monthly Salary (₹)</Label><Input data-testid="teacher-monthly-salary" type="number" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} /></div>
              </div>
              <div><Label>Subjects (comma separated)</Label><Input data-testid="teacher-subjects" value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} placeholder="Maths, Physics" /></div>
            </div>
            <DialogFooter><Button data-testid="save-teacher-btn" onClick={save} disabled={!form.name || !form.email} className="btn-gradient">{editId ? "Save Changes" : "Add Teacher"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Card className="border-slate-200">
        {teachers.length === 0 ? <Empty icon={Users} title="No teachers yet" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Faculty ID</TableHead><TableHead>Email</TableHead><TableHead>Subjects</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Salary</TableHead><TableHead>Leave</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {teachers.map((t) => (
                <TableRow key={t.id} data-testid={`teacher-row-${t.id}`}>
                  <TableCell><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold">{t.name[0]}</div><span className="font-medium">{t.name}</span></div></TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{t.faculty_id || "—"}</TableCell>
                  <TableCell className="text-slate-500">{t.email}</TableCell>
                  <TableCell className="text-slate-500">{(t.subjects || []).join(", ")}</TableCell>
                  <TableCell className="text-slate-500">{t.phone}</TableCell>
                  <TableCell className="text-right">₹{t.monthly_salary}</TableCell>
                  <TableCell>{t.leave_balance ?? 12}d</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <button data-testid={`edit-teacher-${t.id}`} onClick={() => openEdit(t)} className="text-xs font-semibold text-blue-600 hover:underline mr-1">Edit</button>
                      <button data-testid={`resend-teacher-${t.id}`} onClick={() => resend(t)} className="text-slate-300 hover:text-emerald-600" title="Reset & email new password"><KeyRound className="h-4 w-4" /></button>
                      <button data-testid={`view-id-${t.id}`} onClick={() => setIdCardFor(t)} className="text-slate-300 hover:text-violet-600" title="View ID card"><IdCard className="h-4 w-4" /></button>
                      <button data-testid={`del-teacher-${t.id}`} onClick={() => del(t.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!idCardFor} onOpenChange={(o) => !o && setIdCardFor(null)}>
        <DialogContent data-testid="faculty-id-dialog">
          <DialogHeader><DialogTitle>Faculty ID Card</DialogTitle></DialogHeader>
          {idCardFor && (
            <div className="flex flex-col items-center gap-4 pt-2">
              <div id="print-area"><IDCard student={idCardFor} institute={institute} variant="faculty" /></div>
              <Button data-testid="print-faculty-id-btn" onClick={() => window.print()} className="no-print btn-gradient"><Printer className="h-4 w-4 mr-2" />Print / Save as PDF</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CredentialsDialog result={credResult} onClose={() => setCredResult(null)} />
    </div>
  );
}
