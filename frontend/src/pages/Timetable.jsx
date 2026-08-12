import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, Wand2, Sparkles, Loader2, Download } from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SLOTS = ["09:00-10:00", "10:00-11:00", "11:15-12:15", "12:15-13:15", "14:00-15:00", "15:00-16:00"];

export default function Timetable() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [tt, setTt] = useState(null);
  const [batches, setBatches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [gen, setGen] = useState(false);
  const [ai, setAi] = useState("");
  const [aiLoad, setAiLoad] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfg, setCfg] = useState({ days: DAYS.slice(0, 5), periods: [...SLOTS], teacher_ids: [], use_ai: true });

  const load = () => api.get("/timetable", { params: batchId ? { batch_id: batchId } : {} }).then((r) => setTt(r.data));
  useEffect(() => { load(); }, [batchId]);
  useEffect(() => {
    if (isPrincipal || user.role === "teacher") api.get("/batches").then((r) => setBatches(r.data)).catch(() => {});
    if (isPrincipal) api.get("/teachers").then((r) => setTeachers(r.data)).catch(() => {});
  }, []);

  const toggle = (key, val) => setCfg((c) => ({ ...c, [key]: c[key].includes(val) ? c[key].filter((x) => x !== val) : [...c[key], val] }));

  const generate = async () => {
    setGen(true);
    try {
      const { data } = await api.post("/timetable/generate", cfg);
      toast.success(`Generated ${data.count} conflict-free slots`);
      if (data.ai_note) setAi(data.ai_note);
      setCfgOpen(false); load();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail) || "Generation failed"); }
    finally { setGen(false); }
  };
  const suggest = async () => {
    setAiLoad(true);
    try { const { data } = await api.post("/ai/timetable-suggest", {}); setAi(data.suggestions); }
    catch (e) { toast.error("AI failed"); }
    finally { setAiLoad(false); }
  };
  const downloadPdf = async () => {
    try {
      const res = await api.get("/timetable/pdf", { params: batchId ? { batch_id: batchId } : {}, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(url, "_blank");
    } catch (e) { toast.error("Could not download PDF"); }
  };

  if (!tt) return <Loader />;
  const days = DAYS.filter((d) => tt.some((e) => e.day === d));
  const gridDays = days.length ? days : DAYS.slice(0, 5);
  const usedSlots = [...new Set(tt.map((e) => e.slot))].sort();
  const gridSlots = usedSlots.length ? usedSlots : SLOTS;
  const grid = {};
  tt.forEach((e) => { (grid[e.day] = grid[e.day] || {}); (grid[e.day][e.slot] = grid[e.day][e.slot] || []).push(e); });

  return (
    <div>
      <PageHeader title="Timetable Scheduler" subtitle="AI auto-generated conflict-free weekly schedule" actions={
        <div className="flex flex-wrap gap-2">
          {tt.length > 0 && <Button data-testid="tt-download-pdf" variant="outline" onClick={downloadPdf}><Download className="h-4 w-4 mr-2" />Download PDF</Button>}
          {isPrincipal && (
            <>
              <Button data-testid="ai-suggest-btn" variant="outline" onClick={suggest} disabled={aiLoad}>{aiLoad ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-2" />AI Suggest</>}</Button>
              <Dialog open={cfgOpen} onOpenChange={setCfgOpen}>
                <DialogTrigger asChild><Button data-testid="generate-tt-btn" className="btn-gradient"><Wand2 className="h-4 w-4 mr-2" />Auto-Generate</Button></DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>AI Timetable Generator</DialogTitle></DialogHeader>
                  <div className="space-y-4 max-h-[65vh] overflow-y-auto">
                    <div>
                      <p className="text-sm font-semibold text-slate-700 mb-2">Working Days</p>
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map((d) => (
                          <button key={d} type="button" data-testid={`tt-day-${d}`} onClick={() => toggle("days", d)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${cfg.days.includes(d) ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{d.slice(0, 3)}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700 mb-2">Available Periods</p>
                      <div className="flex flex-wrap gap-2">
                        {SLOTS.map((s, i) => (
                          <button key={s} type="button" data-testid={`tt-period-${i}`} onClick={() => toggle("periods", s)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${cfg.periods.includes(s) ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700 mb-2">Include Teachers <span className="font-normal text-slate-400">(none = all)</span></p>
                      <div className="flex flex-wrap gap-2">
                        {teachers.map((t) => (
                          <button key={t.id} type="button" data-testid={`tt-teacher-${t.id}`} onClick={() => toggle("teacher_ids", t.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${cfg.teacher_ids.includes(t.id) ? "bg-violet-600 text-white border-violet-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{t.name}</button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" data-testid="tt-use-ai" checked={cfg.use_ai} onChange={(e) => setCfg({ ...cfg, use_ai: e.target.checked })} />
                      Use AI optimization
                    </label>
                  </div>
                  <DialogFooter>
                    <Button data-testid="tt-generate-confirm" onClick={generate} disabled={gen || cfg.days.length === 0 || cfg.periods.length === 0} className="btn-gradient">
                      {gen ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Wand2 className="h-4 w-4 mr-2" />Generate Timetable</>}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      } />

      {ai && (
        <Card className="p-4 border-slate-200 mb-6 bg-indigo-50/50">
          <p className="text-sm font-semibold text-indigo-700 flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4" />AI Scheduling Insight</p>
          <div className="text-sm text-slate-600 whitespace-pre-line">{ai}</div>
        </Card>
      )}

      {(isPrincipal || user.role === "teacher") && batches.length > 0 && (
        <div className="mb-4 max-w-xs">
          <Select value={batchId || "all"} onValueChange={(v) => setBatchId(v === "all" ? "" : v)}>
            <SelectTrigger data-testid="tt-batch-filter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Batches</SelectItem>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {tt.length === 0 ? <Empty icon={CalendarDays} title="No timetable yet" hint={isPrincipal ? "Click Auto-Generate to build it." : "Ask your principal to generate the schedule."} /> : (
        <Card className="border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="border-b border-slate-200 bg-slate-50">
              <th className="p-3 text-left font-semibold text-slate-500 w-28">Time</th>
              {gridDays.map((d) => <th key={d} className="p-3 text-left font-semibold text-slate-600">{d}</th>)}
            </tr></thead>
            <tbody>
              {gridSlots.map((slot) => (
                <tr key={slot} className="border-b border-slate-100">
                  <td className="p-3 text-xs font-medium text-slate-400">{slot}</td>
                  {gridDays.map((d) => {
                    const list = grid[d]?.[slot] || [];
                    return <td key={d} className="p-2 align-top">
                      {list.length ? (
                        <div className="space-y-1.5">
                          {list.map((e) => (
                            <div key={e.id} className="rounded-lg bg-blue-50 border border-blue-100 p-2">
                              <p className="font-semibold text-blue-800 text-xs">{e.subject || e.batch_name}</p>
                              <p className="text-[11px] text-slate-500">{e.batch_name} · {e.teacher_name}</p>
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-slate-200 text-center">—</div>}
                    </td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
