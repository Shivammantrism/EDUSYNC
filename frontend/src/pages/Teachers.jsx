import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { UserPlus, Users, Trash2 } from "lucide-react";

export default function Teachers() {
  const [teachers, setTeachers] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "teacher123", phone: "", subjects: "", monthly_salary: 30000 });

  const load = () => api.get("/teachers").then((r) => setTeachers(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/teachers", { ...form, monthly_salary: Number(form.monthly_salary), subjects: form.subjects.split(",").map((s) => s.trim()).filter(Boolean), available_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] });
      toast.success("Teacher added"); setOpen(false); setForm({ name: "", email: "", password: "teacher123", phone: "", subjects: "", monthly_salary: 30000 }); load();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const del = async (id) => { await api.delete(`/teachers/${id}`); toast.success("Removed"); load(); };

  if (!teachers) return <Loader />;
  return (
    <div>
      <PageHeader title="Teachers & Staff" subtitle={`${teachers.length} teachers`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-teacher-btn" className="bg-blue-600 hover:bg-blue-700"><UserPlus className="h-4 w-4 mr-2" />Add Teacher</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Teacher</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input data-testid="teacher-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input data-testid="teacher-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Password</Label><Input data-testid="teacher-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Monthly Salary (₹)</Label><Input type="number" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} /></div>
              </div>
              <div><Label>Subjects (comma separated)</Label><Input value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} placeholder="Maths, Physics" /></div>
            </div>
            <DialogFooter><Button data-testid="save-teacher-btn" onClick={save} disabled={!form.name || !form.email} className="bg-blue-600 hover:bg-blue-700">Add Teacher</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Card className="border-slate-200">
        {teachers.length === 0 ? <Empty icon={Users} title="No teachers yet" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Subjects</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Salary</TableHead><TableHead>Leave</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {teachers.map((t) => (
                <TableRow key={t.id} data-testid={`teacher-row-${t.id}`}>
                  <TableCell><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold">{t.name[0]}</div><span className="font-medium">{t.name}</span></div></TableCell>
                  <TableCell className="text-slate-500">{t.email}</TableCell>
                  <TableCell className="text-slate-500">{(t.subjects || []).join(", ")}</TableCell>
                  <TableCell className="text-slate-500">{t.phone}</TableCell>
                  <TableCell className="text-right">₹{t.monthly_salary}</TableCell>
                  <TableCell>{t.leave_balance ?? 12}d</TableCell>
                  <TableCell><button data-testid={`del-teacher-${t.id}`} onClick={() => del(t.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
