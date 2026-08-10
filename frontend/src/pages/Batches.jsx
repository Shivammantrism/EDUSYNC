import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { GraduationCap, Plus, Users, Trash2 } from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function Batches() {
  const [batches, setBatches] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", teacher_id: "", room: "", schedule_days: DAYS.slice(0, 5) });

  const load = () => api.get("/batches").then((r) => setBatches(r.data));
  useEffect(() => { load(); api.get("/teachers").then((r) => setTeachers(r.data)); }, []);

  const save = async () => {
    try { await api.post("/batches", form); toast.success("Batch created"); setOpen(false); setForm({ name: "", subject: "", teacher_id: "", room: "", schedule_days: DAYS.slice(0, 5) }); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const del = async (id) => { await api.delete(`/batches/${id}`); toast.success("Deleted"); load(); };

  if (!batches) return <Loader />;
  return (
    <div>
      <PageHeader title="Batches & Classes" subtitle={`${batches.length} active batches`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-batch-btn" className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-2" />New Batch</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Batch</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Batch Name</Label><Input data-testid="batch-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Class 10-A" /></div>
              <div><Label>Subject</Label><Input data-testid="batch-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              <div><Label>Class Teacher</Label>
                <Select value={form.teacher_id} onValueChange={(v) => setForm({ ...form, teacher_id: v })}>
                  <SelectTrigger data-testid="batch-teacher"><SelectValue placeholder="Assign teacher" /></SelectTrigger>
                  <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Room</Label><Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Room 101" /></div>
            </div>
            <DialogFooter><Button data-testid="save-batch-btn" onClick={save} disabled={!form.name} className="bg-blue-600 hover:bg-blue-700">Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      {batches.length === 0 ? <Empty icon={GraduationCap} title="No batches yet" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {batches.map((b) => (
            <Card key={b.id} data-testid={`batch-card-${b.id}`} className="p-5 border-slate-200 stat-card">
              <div className="flex items-start justify-between">
                <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><GraduationCap className="h-5 w-5" /></div>
                <button data-testid={`del-batch-${b.id}`} onClick={() => del(b.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
              <p className="font-bold text-slate-900 font-heading">{b.name}</p>
              <p className="text-sm text-slate-500">{b.subject || "—"} · {b.room}</p>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1"><Users className="h-4 w-4" />{b.student_count} students</span>
                <span className="text-slate-700 font-medium">{b.teacher_name}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
