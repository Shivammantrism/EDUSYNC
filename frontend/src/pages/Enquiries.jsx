import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { PageHeader, Loader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Plus, Phone, GraduationCap } from "lucide-react";

const STAGES = [
  ["new_lead", "New Lead", "#2563eb"],
  ["contacted", "Contacted", "#4f46e5"],
  ["demo_scheduled", "Demo Scheduled", "#9333ea"],
  ["admitted", "Admitted", "#16a34a"],
  ["closed", "Closed", "#64748b"],
];

export default function Enquiries() {
  const [items, setItems] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", course: "", notes: "" });

  const load = () => api.get("/enquiries").then((r) => setItems(r.data));
  useEffect(() => { load(); api.get("/teachers").then((r) => setTeachers(r.data)).catch(() => {}); }, []);

  const create = async () => {
    try { await api.post("/enquiries", form); toast.success("Lead added"); setOpen(false); setForm({ name: "", phone: "", email: "", course: "", notes: "" }); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const setStage = async (id, stage) => {
    const status = stage === "admitted" ? "converted" : stage === "closed" ? "closed" : "follow_up";
    await api.put(`/enquiries/${id}`, { stage, status }); toast.success(`Moved to ${stage.replace("_", " ")}`); load();
  };
  const assign = async (id, assigned_to) => { await api.put(`/enquiries/${id}`, { assigned_to }); toast.success("Assigned for follow-up"); load(); };

  if (!items) return <Loader />;
  const byStage = (s) => items.filter((i) => (i.stage || "new_lead") === s);

  return (
    <div>
      <PageHeader title="Admission Lead Pipeline" subtitle={`${items.length} leads across the funnel`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-enquiry-btn" className="btn-gradient"><Plus className="h-4 w-4 mr-2" />New Lead</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Admission Lead</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input data-testid="enq-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input data-testid="enq-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Course/Class</Label><Input data-testid="enq-course" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} /></div>
              </div>
              <div><Label>Notes</Label><Textarea data-testid="enq-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button data-testid="save-enquiry-btn" onClick={create} disabled={!form.name || !form.phone} className="btn-gradient">Add Lead</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {STAGES.map(([key, label, color]) => (
          <div key={key} className="min-w-0">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                <span className="font-semibold text-sm text-slate-700">{label}</span>
              </div>
              <span className="text-xs font-semibold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{byStage(key).length}</span>
            </div>
            <div className="space-y-3">
              {byStage(key).map((e) => (
                <Card key={e.id} data-testid={`lead-${e.id}`} className="p-4 border-slate-200 card-premium" style={{ borderTop: `3px solid ${color}` }}>
                  <p className="font-semibold text-slate-800 text-sm">{e.name}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Phone className="h-3 w-3" />{e.phone}</p>
                  {e.course && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><GraduationCap className="h-3 w-3" />{e.course}</p>}
                  {e.assigned_to_name && <p className="text-[11px] text-indigo-600 mt-1.5">👤 {e.assigned_to_name}</p>}
                  <div className="mt-3 space-y-1.5">
                    <Select value={e.stage || "new_lead"} onValueChange={(v) => setStage(e.id, v)}>
                      <SelectTrigger data-testid={`stage-${e.id}`} className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{STAGES.map(([k, l]) => <SelectItem key={k} value={k} className="text-xs">{l}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={e.assigned_to || ""} onValueChange={(v) => assign(e.id, v)}>
                      <SelectTrigger data-testid={`assign-${e.id}`} className="h-8 text-xs"><SelectValue placeholder="Assign to..." /></SelectTrigger>
                      <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </Card>
              ))}
              {byStage(key).length === 0 && <p className="text-xs text-slate-300 text-center py-6">No leads</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
