import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarDays, Wand2, Sparkles, Loader2 } from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SLOTS = ["09:00-10:00", "10:00-11:00", "11:15-12:15", "12:15-13:15", "14:00-15:00", "15:00-16:00"];

export default function Timetable() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [tt, setTt] = useState(null);
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [gen, setGen] = useState(false);
  const [ai, setAi] = useState("");
  const [aiLoad, setAiLoad] = useState(false);

  const load = () => api.get("/timetable", { params: batchId ? { batch_id: batchId } : {} }).then((r) => setTt(r.data));
  useEffect(() => { load(); }, [batchId]);
  useEffect(() => { if (isPrincipal || user.role === "teacher") api.get("/batches").then((r) => setBatches(r.data)); }, []);

  const generate = async () => {
    setGen(true);
    try { const { data } = await api.post("/timetable/generate"); toast.success(`Generated ${data.count} slots`); load(); }
    catch (e) { toast.error("Generation failed"); }
    finally { setGen(false); }
  };
  const suggest = async () => {
    setAiLoad(true);
    try { const { data } = await api.post("/ai/timetable-suggest", {}); setAi(data.suggestions); }
    catch (e) { toast.error("AI failed"); }
    finally { setAiLoad(false); }
  };

  if (!tt) return <Loader />;
  const grid = {};
  tt.forEach((e) => { grid[e.day] = grid[e.day] || {}; grid[e.day][e.slot] = e; });

  return (
    <div>
      <PageHeader title="Timetable Scheduler" subtitle="Auto-generated weekly schedule" actions={
        isPrincipal && (
          <div className="flex gap-2">
            <Button data-testid="ai-suggest-btn" variant="outline" onClick={suggest} disabled={aiLoad}>{aiLoad ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-2" />AI Suggest</>}</Button>
            <Button data-testid="generate-tt-btn" onClick={generate} disabled={gen} className="bg-blue-600 hover:bg-blue-700">{gen ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Wand2 className="h-4 w-4 mr-2" />Auto-Generate</>}</Button>
          </div>
        )
      } />

      {ai && (
        <Card className="p-4 border-slate-200 mb-6 bg-indigo-50/50">
          <p className="text-sm font-semibold text-indigo-700 flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4" />AI Scheduling Suggestions</p>
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
              {DAYS.map((d) => <th key={d} className="p-3 text-left font-semibold text-slate-600">{d}</th>)}
            </tr></thead>
            <tbody>
              {SLOTS.map((slot) => (
                <tr key={slot} className="border-b border-slate-100">
                  <td className="p-3 text-xs font-medium text-slate-400">{slot}</td>
                  {DAYS.map((d) => {
                    const e = grid[d]?.[slot];
                    return <td key={d} className="p-2">
                      {e ? <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
                        <p className="font-semibold text-blue-800 text-xs">{e.subject || e.batch_name}</p>
                        <p className="text-[11px] text-slate-500">{e.batch_name} · {e.teacher_name}</p>
                      </div> : <div className="text-slate-200 text-center">—</div>}
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
