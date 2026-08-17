import { useEffect, useState } from "react";
import api, { formatErr, fmtDate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarCheck, Plus, Check, X, Clock, Trash2, MapPin } from "lucide-react";

const blank = { title: "", date: "", time: "", agenda: "", teacher_ids: [] };

export default function Meetings() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [items, setItems] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  const load = () => api.get("/meetings").then((r) => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { load(); if (isPrincipal) api.get("/teachers").then((r) => setTeachers(r.data)).catch(() => {}); }, []);

  const toggle = (id) => setForm((f) => ({ ...f, teacher_ids: f.teacher_ids.includes(id) ? f.teacher_ids.filter((x) => x !== id) : [...f.teacher_ids, id] }));
  const create = async () => {
    if (!form.title || !form.date) { toast.error("Title and date are required"); return; }
    try { await api.post("/meetings", form); toast.success("Meeting created"); setOpen(false); setForm(blank); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const respond = async (id, status) => {
    try { await api.post(`/meetings/${id}/respond`, { status }); toast.success(status === "available" ? "Marked available" : "Marked unavailable"); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!window.confirm("Delete this meeting?")) return; await api.delete(`/meetings/${id}`); load(); };

  if (!items) return <Loader />;
  return (
    <div data-testid="meetings-page">
      <PageHeader title="Staff Meetings" subtitle={isPrincipal ? "Send meeting requests & track availability" : "Confirm your availability for school meetings"} actions={
        isPrincipal && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(blank); }}>
            <DialogTrigger asChild><Button data-testid="create-meeting-btn" className="btn-gradient"><Plus className="h-4 w-4 mr-2" />New Meeting</Button></DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Meeting Request</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input data-testid="meeting-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Staff Review Meeting" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Date</Label><Input data-testid="meeting-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                  <div><Label>Time</Label><Input data-testid="meeting-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
                </div>
                <div><Label>Agenda</Label><Textarea data-testid="meeting-agenda" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} rows={3} /></div>
                <div>
                  <Label>Invite Teachers <span className="text-slate-400 font-normal">(none = all staff)</span></Label>
                  <div className="flex flex-wrap gap-1.5 mt-1 max-h-32 overflow-y-auto">
                    {teachers.map((t) => (
                      <button key={t.id} type="button" data-testid={`meeting-invite-${t.id}`} onClick={() => toggle(t.id)}
                        className={`text-xs px-2 py-1 rounded-full border ${form.teacher_ids.includes(t.id) ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}>{t.name}</button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter><Button data-testid="save-meeting-btn" onClick={create} className="btn-gradient">Send Request</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />
      {items.length === 0 ? <Empty icon={CalendarCheck} title="No meetings yet" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {items.map((m) => (
            <Card key={m.id} data-testid={`meeting-card-${m.id}`} className="p-5 border-slate-200">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-heading font-bold text-slate-800 text-lg">{m.title}</h3>
                {isPrincipal && <button data-testid={`del-meeting-${m.id}`} onClick={() => del(m.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <p className="mt-1 text-sm text-slate-500 flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" />{fmtDate(m.date)}{m.time ? ` · ${m.time}` : ""}</p>
              {m.agenda && <p className="mt-2 text-sm text-slate-600">{m.agenda}</p>}

              {isPrincipal ? (
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500">Availability ({(m.confirmations || []).filter((c) => c.status === "available").length}/{m.invited_count} available)</p>
                  {(m.confirmations || []).map((c) => (
                    <div key={c.teacher_id} data-testid={`confirm-${m.id}-${c.teacher_id}`} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{c.name}</span>
                      <span className={`text-xs font-semibold ${c.status === "available" ? "text-emerald-600" : c.status === "unavailable" ? "text-red-600" : "text-slate-400"}`}>
                        {c.status === "available" ? "Available" : c.status === "unavailable" ? "Not available" : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                  {m.my_response?.status === "available" ? (
                    <span data-testid={`my-status-${m.id}`} className="text-sm font-semibold text-emerald-600 flex items-center gap-1"><Check className="h-4 w-4" />You're available</span>
                  ) : m.my_response?.status === "unavailable" ? (
                    <span data-testid={`my-status-${m.id}`} className="text-sm font-semibold text-red-600 flex items-center gap-1"><X className="h-4 w-4" />Marked unavailable</span>
                  ) : (
                    <span data-testid={`my-status-${m.id}`} className="text-sm text-slate-400">Please confirm your availability</span>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Button data-testid={`available-${m.id}`} size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => respond(m.id, "available")}><Check className="h-3.5 w-3.5 mr-1" />Available</Button>
                    <Button data-testid={`unavailable-${m.id}`} size="sm" variant="outline" onClick={() => respond(m.id, "unavailable")}><X className="h-3.5 w-3.5 mr-1" />Can't attend</Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
