import { useEffect, useState } from "react";
import api, { fileUrl, fmtDate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarDays, MapPin, Clock, Users, Plus, FileText, Check, Paperclip } from "lucide-react";
import { toast } from "sonner";

const blank = { title: "", date: "", time: "", venue: "", description: "", visibility: "public", attachment_url: "", invite_batches: [], invite_students: [], invite_staff: [] };

export default function Events() {
  const { user } = useAuth();
  const isStaff = user.role === "principal" || user.role === "teacher";
  const [events, setEvents] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [refs, setRefs] = useState({ batches: [], teachers: [], students: [] });
  const [uploading, setUploading] = useState(false);
  const [participants, setParticipants] = useState(null);

  const load = () => api.get("/events").then((r) => setEvents(r.data)).catch(() => setEvents([]));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (isStaff) Promise.all([
      api.get("/batches").then((r) => r.data).catch(() => []),
      api.get("/teachers").then((r) => r.data).catch(() => []),
      api.get("/students").then((r) => r.data).catch(() => []),
    ]).then(([batches, teachers, students]) => setRefs({ batches, teachers, students }));
  }, [isStaff]);

  const toggle = (key, id) => setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));

  const uploadBrochure = async (file) => {
    setUploading(true);
    try { const fd = new FormData(); fd.append("file", file); const { data } = await api.post("/upload", fd); setForm((f) => ({ ...f, attachment_url: data.url })); toast.success("Brochure attached"); }
    catch { toast.error("Upload failed"); } finally { setUploading(false); }
  };

  const create = async () => {
    if (!form.title || !form.date) { toast.error("Title and date are required"); return; }
    try { await api.post("/events", form); toast.success("Event created & students notified"); setOpen(false); setForm(blank); load(); }
    catch { toast.error("Could not create event"); }
  };

  const confirm = async (id) => { try { await api.post(`/events/${id}/confirm`); toast.success("Participation confirmed!"); load(); } catch { toast.error("Failed"); } };

  const viewParticipants = async (ev) => {
    setParticipants({ ev, loading: true, list: [] });
    try { const { data } = await api.get(`/events/${ev.id}/participants`); setParticipants({ ev, loading: false, list: data.participants || [] }); }
    catch { setParticipants({ ev, loading: false, list: [] }); }
  };
  const mark = async (eid, sid, status) => {
    try { await api.post(`/events/${eid}/attendance`, { student_id: sid, status });
      setParticipants((p) => ({ ...p, list: p.list.map((x) => x.student_id === sid ? { ...x, attendance: status } : x) })); }
    catch { toast.error("Failed"); }
  };

  if (!events) return <Loader />;

  return (
    <div data-testid="events-page">
      <PageHeader title="Events" subtitle="School events, meetings & competitions"
        actions={isStaff && <Button data-testid="create-event-btn" onClick={() => setOpen(true)} className="btn-gradient"><Plus className="h-4 w-4 mr-1" />Create Event</Button>} />

      {events.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm py-16 text-center" data-testid="events-empty">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400 text-sm">No upcoming events yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {events.map((ev) => (
            <div key={ev.id} data-testid={`event-card-${ev.id}`} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-heading font-bold text-slate-800 text-lg leading-tight">{ev.title}</h3>
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${ev.visibility === "public" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{ev.visibility}</span>
              </div>
              <div className="mt-2 space-y-1 text-sm text-slate-500">
                <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-slate-400" />{fmtDate(ev.date)}{ev.time ? ` · ${ev.time}` : ""}</p>
                {ev.venue && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" />{ev.venue}</p>}
              </div>
              {ev.description && <p className="mt-2 text-sm text-slate-600 line-clamp-3">{ev.description}</p>}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                {ev.attachment_url && <a href={fileUrl(ev.attachment_url)} target="_blank" rel="noreferrer" data-testid={`event-brochure-${ev.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600"><FileText className="h-3.5 w-3.5" />Brochure</a>}
                {isStaff && <button onClick={() => viewParticipants(ev)} data-testid={`event-participants-${ev.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600"><Users className="h-3.5 w-3.5" />{ev.participant_count} confirmed</button>}
              </div>
              {!isStaff && (
                <div className="mt-4">
                  {ev.confirmed
                    ? <span data-testid={`event-confirmed-${ev.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600"><Check className="h-4 w-4" />Participation confirmed</span>
                    : <Button data-testid={`event-confirm-btn-${ev.id}`} size="sm" onClick={() => confirm(ev.id)} className="btn-gradient">Confirm Participation</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input data-testid="event-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Annual Function" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date *</Label><Input data-testid="event-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Time</Label><Input data-testid="event-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
            </div>
            <div><Label>Venue</Label><Input data-testid="event-venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="School Auditorium" /></div>
            <div><Label>Description</Label><Textarea data-testid="event-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div><Label>Visibility</Label>
                <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
                  <SelectTrigger data-testid="event-visibility"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="public">Public (all students/parents)</SelectItem><SelectItem value="private">Private (invited only)</SelectItem></SelectContent>
                </Select>
              </div>
              <label data-testid="event-brochure-label" className="flex items-center gap-2 text-sm px-3 py-2 border rounded-lg hover:bg-slate-50 cursor-pointer">
                <Paperclip className="h-4 w-4" />{uploading ? "Uploading…" : form.attachment_url ? "Brochure attached" : "Attach Brochure (PDF)"}
                <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadBrochure(e.target.files[0])} />
              </label>
            </div>
            {form.visibility === "private" && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="event-invite-picker">
                <Picker label="Classes / Sections" items={refs.batches.map((b) => [b.id, b.name || b.class_name])} sel={form.invite_batches} onToggle={(id) => toggle("invite_batches", id)} />
                <Picker label="Staff" items={refs.teachers.map((t) => [t.id, t.name])} sel={form.invite_staff} onToggle={(id) => toggle("invite_staff", id)} />
                <Picker label="Individual Students" items={refs.students.map((s) => [s.id, s.name])} sel={form.invite_students} onToggle={(id) => toggle("invite_students", id)} />
              </div>
            )}
          </div>
          <DialogFooter><Button data-testid="event-save-btn" onClick={create} className="btn-gradient">Create & Notify</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Participants dialog */}
      <Dialog open={!!participants} onOpenChange={(o) => !o && setParticipants(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Participants · {participants?.ev?.title}</DialogTitle></DialogHeader>
          {participants?.loading ? <Loader /> : participants?.list?.length === 0 ? (
            <p className="py-8 text-center text-slate-400 text-sm">No confirmations yet.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {participants?.list?.map((p) => (
                <div key={p.student_id} data-testid={`participant-${p.student_id}`} className="flex items-center justify-between py-2.5">
                  <div><p className="text-sm font-semibold text-slate-800">{p.name}</p><p className="text-xs text-slate-400">{p.attendance}</p></div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant={p.attendance === "attended" ? "default" : "outline"} data-testid={`mark-attended-${p.student_id}`} onClick={() => mark(participants.ev.id, p.student_id, "attended")} className={p.attendance === "attended" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>Attended</Button>
                    <Button size="sm" variant={p.attendance === "absent" ? "default" : "outline"} data-testid={`mark-absent-${p.student_id}`} onClick={() => mark(participants.ev.id, p.student_id, "absent")} className={p.attendance === "absent" ? "bg-red-600 hover:bg-red-700" : ""}>Absent</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Picker({ label, items, sel, onToggle }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
      <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1.5">
        {items.length === 0 ? <span className="text-xs text-slate-400">None</span> : items.map(([id, name]) => (
          <button key={id} type="button" onClick={() => onToggle(id)}
            className={`text-xs px-2 py-1 rounded-full border ${sel.includes(id) ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}>{name}</button>
        ))}
      </div>
    </div>
  );
}
