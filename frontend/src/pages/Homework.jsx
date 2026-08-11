import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BookOpen, Plus, CheckCircle2, Send } from "lucide-react";

export default function Homework() {
  const { user } = useAuth();
  const isStaff = user.role !== "student";
  const [hw, setHw] = useState(null);
  const [batches, setBatches] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", batch_id: "", subject: "", deadline: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) });
  const [subsFor, setSubsFor] = useState(null);
  const [subs, setSubs] = useState([]);
  const [submitFor, setSubmitFor] = useState(null);
  const [content, setContent] = useState("");

  const load = () => api.get("/homework").then((r) => setHw(r.data));
  useEffect(() => { load(); if (isStaff) api.get("/batches").then((r) => setBatches(r.data)); }, []);

  const create = async () => {
    try { await api.post("/homework", form); toast.success("Homework assigned"); setOpen(false); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const openSubs = async (h) => { setSubsFor(h); const { data } = await api.get(`/homework/${h.id}/submissions`); setSubs(data); };
  const markDone = async (id) => { await api.put(`/submissions/${id}/complete`); toast.success("Marked completed"); openSubs(subsFor); };
  const submit = async () => {
    try { await api.post("/homework/submit", { homework_id: submitFor.id, content }); toast.success("Submitted!"); setSubmitFor(null); setContent(""); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  if (!hw) return <Loader />;
  return (
    <div>
      <PageHeader title="Homework & Assignments" subtitle={`${hw.length} active`} actions={
        isStaff && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-hw-btn" className="btn-gradient"><Plus className="h-4 w-4 mr-2" />Assign Homework</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Assign Homework</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input data-testid="hw-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea data-testid="hw-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label>Batch</Label>
                  <Select value={form.batch_id} onValueChange={(v) => { const b = batches.find((x) => x.id === v); setForm({ ...form, batch_id: v, subject: b?.subject || "" }); }}>
                    <SelectTrigger data-testid="hw-batch"><SelectValue placeholder="Select batch" /></SelectTrigger>
                    <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
              </div>
              <DialogFooter><Button data-testid="save-hw-btn" onClick={create} disabled={!form.title || !form.batch_id} className="btn-gradient">Assign</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />
      {hw.length === 0 ? <Empty icon={BookOpen} title="No homework" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {hw.map((h) => (
            <Card key={h.id} data-testid={`hw-card-${h.id}`} className="p-5 border-slate-200 stat-card flex flex-col">
              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><BookOpen className="h-5 w-5" /></div>
              <p className="font-bold text-slate-900 font-heading">{h.title}</p>
              <p className="text-sm text-slate-500 mt-1 flex-1">{h.description}</p>
              <div className="text-xs text-slate-400 mt-3">Due: {h.deadline} · {h.subject}</div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                {isStaff ? (
                  <Button data-testid={`view-subs-${h.id}`} size="sm" variant="outline" className="w-full" onClick={() => openSubs(h)}>View Submissions ({h.submission_count})</Button>
                ) : h.my_submission ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium"><CheckCircle2 className="h-4 w-4" />{h.my_submission.status === "completed" ? "Reviewed" : "Submitted"}</div>
                ) : (
                  <Button data-testid={`submit-hw-${h.id}`} size="sm" className="w-full btn-gradient" onClick={() => setSubmitFor(h)}><Send className="h-3.5 w-3.5 mr-1" />Submit Work</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!subsFor} onOpenChange={(v) => !v && setSubsFor(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Submissions — {subsFor?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {subs.length === 0 && <p className="text-sm text-slate-400">No submissions yet.</p>}
            {subs.map((s) => (
              <div key={s.id} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{s.student_name}</p>
                  {s.status === "completed" ? <StatusBadge status="completed" /> : <Button data-testid={`mark-done-${s.id}`} size="sm" variant="outline" onClick={() => markDone(s.id)}>Mark Done</Button>}
                </div>
                <p className="text-sm text-slate-600 mt-1">{s.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!submitFor} onOpenChange={(v) => !v && setSubmitFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit — {submitFor?.title}</DialogTitle></DialogHeader>
          <Textarea data-testid="submission-content" placeholder="Type your answer or notes..." value={content} onChange={(e) => setContent(e.target.value)} rows={5} />
          <DialogFooter><Button data-testid="confirm-submit-btn" onClick={submit} disabled={!content} className="btn-gradient">Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
