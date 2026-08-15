import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, Wand2, Sparkles, Loader2, Download, Settings2, Plus, X, Coffee, Pencil } from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function Timetable() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const isTeacher = user.role === "teacher";
  const [tt, setTt] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [batches, setBatches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [gen, setGen] = useState(false);
  const [ai, setAi] = useState("");
  const [cfgOpen, setCfgOpen] = useState(false);
  const [edit, setEdit] = useState(null); // { batch_id, day, slot, subject, teacher_id, room }

  const load = () => api.get("/timetable", { params: batchId ? { batch_id: batchId } : {} }).then((r) => setTt(r.data));
  useEffect(() => { load(); }, [batchId]);
  useEffect(() => {
    if (isPrincipal || isTeacher) {
      api.get("/batches").then((r) => setBatches(r.data)).catch(() => {});
      api.get("/timetable/config").then((r) => setCfg(r.data)).catch(() => {});
    }
    if (isPrincipal) api.get("/teachers").then((r) => setTeachers(r.data)).catch(() => {});
  }, []);

  const generate = async () => {
    setGen(true);
    try {
      const { data } = await api.post("/timetable/generate", { ...cfg, use_ai: true });
      toast.success(`Generated ${data.count} periods${data.conflicts ? ` · ${data.conflicts} slots could not be filled` : ""}`);
      if (data.ai_note) setAi(data.ai_note);
      setCfgOpen(false); load();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail) || "Generation failed"); }
    finally { setGen(false); }
  };
  const saveConfig = async () => { try { await api.post("/timetable/config", cfg); toast.success("Setup saved"); } catch { toast.error("Could not save"); } };
  const saveCell = async () => {
    try { await api.put("/timetable/cell", edit); toast.success("Slot updated"); setEdit(null); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail) || "Failed"); }
  };
  const downloadPdf = async () => {
    try {
      const res = await api.get("/timetable/pdf", { params: batchId ? { batch_id: batchId } : {}, responseType: "blob" });
      window.open(URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })), "_blank");
    } catch { toast.error("Could not download PDF"); }
  };

  if (!tt) return <Loader />;
  const cfgDays = cfg?.days?.length ? cfg.days : DAYS.slice(0, 5);
  const gridDays = cfgDays.filter((d) => true);
  const cfgPeriods = cfg?.periods?.length ? cfg.periods : [...new Set(tt.map((e) => e.slot))].sort().map((s) => ({ label: s, is_break: false }));
  const grid = {};
  tt.forEach((e) => { (grid[e.day] = grid[e.day] || {}); grid[e.day][e.slot] = e; });
  const teacherName = (id) => teachers.find((t) => t.id === id)?.name || "";

  const title = isTeacher ? "My Personal Schedule" : "Timetable Scheduler";
  const subtitle = isTeacher ? "All the classes & periods you teach" : isPrincipal ? "Set up periods, subjects & teachers, then generate or edit any slot" : "Your weekly class schedule";

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} actions={
        <div className="flex flex-wrap gap-2">
          {tt.length > 0 && <Button data-testid="tt-download-pdf" variant="outline" onClick={downloadPdf}><Download className="h-4 w-4 mr-2" />Download PDF</Button>}
          {isPrincipal && (
            <Dialog open={cfgOpen} onOpenChange={setCfgOpen}>
              <DialogTrigger asChild><Button data-testid="tt-setup-btn" className="btn-gradient"><Settings2 className="h-4 w-4 mr-2" />Setup & Generate</Button></DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Timetable Setup</DialogTitle></DialogHeader>
                {cfg && <ConfigForm cfg={cfg} setCfg={setCfg} batches={batches} teachers={teachers} />}
                <DialogFooter className="gap-2">
                  <Button data-testid="tt-save-config" variant="outline" onClick={saveConfig}>Save Setup</Button>
                  <Button data-testid="tt-generate-confirm" onClick={generate} disabled={gen} className="btn-gradient">
                    {gen ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Wand2 className="h-4 w-4 mr-2" />Generate Timetable</>}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      } />

      {ai && (
        <Card className="p-4 border-slate-200 mb-6 bg-indigo-50/50">
          <p className="text-sm font-semibold text-indigo-700 flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4" />AI Scheduling Insight</p>
          <div className="text-sm text-slate-600 whitespace-pre-line">{ai}</div>
        </Card>
      )}

      {isPrincipal && batches.length > 0 && (
        <div className="mb-4 max-w-xs">
          <Select value={batchId || "all"} onValueChange={(v) => setBatchId(v === "all" ? "" : v)}>
            <SelectTrigger data-testid="tt-batch-filter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Classes</SelectItem>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {tt.length === 0 ? <Empty icon={CalendarDays} title="No timetable yet" hint={isPrincipal ? "Click Setup & Generate to build it." : "Ask your principal to generate the schedule."} /> : (
        <Card className="border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="border-b border-slate-200 bg-slate-50">
              <th className="p-3 text-left font-semibold text-slate-500 w-32">Time</th>
              {gridDays.map((d) => <th key={d} className="p-3 text-left font-semibold text-slate-600">{d}</th>)}
            </tr></thead>
            <tbody>
              {cfgPeriods.map((p) => (
                <tr key={p.label} className={`border-b border-slate-100 ${p.is_break ? "bg-amber-50/50" : ""}`}>
                  <td className="p-3 text-xs font-medium text-slate-400">{p.is_break ? <span className="flex items-center gap-1 text-amber-600 font-semibold"><Coffee className="h-3.5 w-3.5" />{p.label}</span> : p.label}</td>
                  {gridDays.map((d) => {
                    if (p.is_break) return <td key={d} className="p-2 text-center text-amber-500 text-xs font-medium">Break</td>;
                    const e = grid[d]?.[p.label];
                    const canEdit = isPrincipal && batchId; // edit within a specific class view
                    return (
                      <td key={d} className="p-2 align-top">
                        <div
                          data-testid={`tt-cell-${d}-${p.label}`}
                          onClick={() => canEdit && setEdit({ batch_id: batchId, day: d, slot: p.label, subject: e?.subject || "", teacher_id: e?.teacher_id || "", room: e?.room || "" })}
                          className={`rounded-lg p-2 min-h-[46px] ${e ? "bg-blue-50 border border-blue-100" : "border border-dashed border-slate-200"} ${canEdit ? "cursor-pointer hover:ring-2 hover:ring-blue-300" : ""}`}>
                          {e ? (
                            <>
                              <p className="font-semibold text-blue-800 text-xs flex items-center gap-1">{e.subject || e.batch_name}{canEdit && <Pencil className="h-2.5 w-2.5 opacity-50" />}</p>
                              <p className="text-[11px] text-slate-500">{batchId ? e.teacher_name : `${e.batch_name} · ${e.teacher_name}`}</p>
                            </>
                          ) : <span className="text-slate-300 text-center block">{canEdit ? "+ add" : "—"}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {isPrincipal && !batchId && <p className="p-3 text-xs text-slate-400">Tip: pick a class above to click any slot and edit it manually.</p>}
        </Card>
      )}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Slot · {edit?.day} {edit?.slot}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div><Label>Subject</Label><Input data-testid="cell-subject" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} placeholder="e.g. Mathematics (leave blank to clear)" /></div>
              <div><Label>Teacher</Label>
                <Select value={edit.teacher_id || "none"} onValueChange={(v) => setEdit({ ...edit, teacher_id: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="cell-teacher"><SelectValue placeholder="Assign teacher" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Unassigned</SelectItem>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Room</Label><Input data-testid="cell-room" value={edit.room} onChange={(e) => setEdit({ ...edit, room: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button data-testid="cell-save" onClick={saveCell} className="btn-gradient">Save Slot</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfigForm({ cfg, setCfg, batches, teachers }) {
  const toggleDay = (d) => setCfg((c) => ({ ...c, days: c.days.includes(d) ? c.days.filter((x) => x !== d) : [...c.days, d] }));
  const setPeriod = (i, patch) => setCfg((c) => ({ ...c, periods: c.periods.map((p, idx) => idx === i ? { ...p, ...patch } : p) }));
  const addPeriod = (isBreak) => setCfg((c) => ({ ...c, periods: [...c.periods, isBreak ? { label: "Lunch Break", is_break: true } : { label: "", is_break: false }] }));
  const rmPeriod = (i) => setCfg((c) => ({ ...c, periods: c.periods.filter((_, idx) => idx !== i) }));
  const cs = (bid) => cfg.class_subjects?.[bid] || [];
  const setCS = (bid, list) => setCfg((c) => ({ ...c, class_subjects: { ...(c.class_subjects || {}), [bid]: list } }));
  const addRow = (bid) => setCS(bid, [...cs(bid), { subject: "", teacher_id: "" }]);
  const setRow = (bid, i, patch) => setCS(bid, cs(bid).map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const rmRow = (bid, i) => setCS(bid, cs(bid).filter((_, idx) => idx !== i));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">Working Days</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <button key={d} type="button" data-testid={`cfg-day-${d}`} onClick={() => toggleDay(d)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${cfg.days.includes(d) ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{d.slice(0, 3)}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">Period Timings & Breaks</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" data-testid="cfg-add-period" onClick={() => addPeriod(false)}><Plus className="h-3.5 w-3.5 mr-1" />Period</Button>
            <Button type="button" size="sm" variant="outline" data-testid="cfg-add-break" onClick={() => addPeriod(true)}><Coffee className="h-3.5 w-3.5 mr-1" />Break</Button>
          </div>
        </div>
        <div className="space-y-2">
          {cfg.periods.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              {p.is_break ? <Coffee className="h-4 w-4 text-amber-500 shrink-0" /> : <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />}
              <Input data-testid={`cfg-period-${i}`} value={p.label} onChange={(e) => setPeriod(i, { label: e.target.value })} placeholder={p.is_break ? "Lunch Break" : "e.g. 09:00-10:00"} className="h-9" />
              <button type="button" data-testid={`cfg-rm-period-${i}`} onClick={() => rmPeriod(i)} className="text-slate-300 hover:text-red-500"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">Subjects & Teachers per Class</p>
        <div className="space-y-3">
          {batches.map((b) => (
            <div key={b.id} data-testid={`cfg-class-${b.id}`} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-800">{b.name}</p>
                <Button type="button" size="sm" variant="ghost" data-testid={`cfg-add-subject-${b.id}`} onClick={() => addRow(b.id)}><Plus className="h-3.5 w-3.5 mr-1" />Subject</Button>
              </div>
              <div className="space-y-2">
                {cs(b.id).length === 0 && <p className="text-xs text-slate-400">No subjects yet — falls back to the class's default subject.</p>}
                {cs(b.id).map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input data-testid={`cfg-subject-${b.id}-${i}`} value={r.subject} onChange={(e) => setRow(b.id, i, { subject: e.target.value })} placeholder="Subject" className="h-9 flex-1" />
                    <Select value={r.teacher_id || "none"} onValueChange={(v) => setRow(b.id, i, { teacher_id: v === "none" ? "" : v })}>
                      <SelectTrigger data-testid={`cfg-teacher-${b.id}-${i}`} className="h-9 w-40"><SelectValue placeholder="Teacher" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Any</SelectItem>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <button type="button" data-testid={`cfg-rm-subject-${b.id}-${i}`} onClick={() => rmRow(b.id, i)} className="text-slate-300 hover:text-red-500"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
