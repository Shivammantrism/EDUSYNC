import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingUp, AlertTriangle, Award, Sparkles } from "lucide-react";

const STATUS = {
  "at-risk": { label: "At Risk", cls: "bg-red-100 text-red-700", Icon: AlertTriangle, bar: "#dc2626" },
  top: { label: "Top Performer", cls: "bg-emerald-100 text-emerald-700", Icon: Award, bar: "#059669" },
  steady: { label: "Steady", cls: "bg-blue-100 text-blue-700", Icon: TrendingUp, bar: "#2563eb" },
};

export default function StudentInsights({ studentId }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { setD(null); api.get(`/students/${studentId}/insights`).then((r) => setD(r.data)).catch(() => setErr(true)); }, [studentId]);

  if (err) return <Card className="p-6 text-sm text-slate-500">Insights unavailable.</Card>;
  if (!d) return <Card className="p-10 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></Card>;
  const st = STATUS[d.status] || STATUS.steady;

  return (
    <div className="space-y-5" data-testid="student-insights">
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="p-5 flex flex-col items-center justify-center text-center" style={{ background: `${st.bar}0d` }}>
          <p className="text-xs uppercase tracking-wide text-slate-400">Growth Score</p>
          <p className="text-5xl font-extrabold font-heading mt-1" style={{ color: st.bar }} data-testid="growth-score">{d.growth_score}</p>
          <span className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${st.cls}`} data-testid="risk-badge"><st.Icon className="h-3.5 w-3.5" />{st.label}</span>
        </Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-slate-400">Attendance</p><p className="text-3xl font-bold text-slate-800 mt-1">{d.attendance}%</p><p className="text-xs text-slate-400 mt-1">{d.attendance < 75 ? "Below safe threshold" : "Healthy"}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-slate-400">Overall Average</p><p className="text-3xl font-bold text-slate-800 mt-1">{d.average}%</p><p className="text-xs text-slate-400 mt-1">{d.consecutive_drops >= 2 ? `${d.consecutive_drops} consecutive drops` : "Consistent"}</p></Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-blue-600" /><h4 className="font-heading font-bold text-slate-800 text-sm">AI Summary</h4></div>
        <p className="text-sm text-slate-600 leading-relaxed" data-testid="ai-summary">{d.summary}</p>
        {(d.strengths?.length || d.weaknesses?.length) ? (
          <div className="flex flex-wrap gap-2 mt-4">
            {d.strengths?.map((s) => <span key={s} className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">💪 {s}</span>)}
            {d.weaknesses?.map((s) => <span key={s} className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">⚠ {s}</span>)}
          </div>
        ) : null}
      </Card>

      {d.subjects?.length > 0 && (
        <Card className="p-5">
          <h4 className="font-heading font-bold text-slate-800 text-sm mb-4">Subject Intelligence <span className="text-xs font-normal text-slate-400">vs class average</span></h4>
          <div className="space-y-3">
            {d.subjects.map((x) => (
              <div key={x.subject}>
                <div className="flex justify-between text-xs mb-1"><span className="font-medium text-slate-700">{x.subject}</span>
                  <span className={x.delta >= 8 ? "text-emerald-600" : x.delta <= -8 ? "text-red-600" : "text-slate-400"}>{x.score}% ({x.delta >= 0 ? "+" : ""}{x.delta} vs {x.class_avg}%)</span></div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, x.score)}%`, background: x.delta >= 8 ? "#059669" : x.delta <= -8 ? "#dc2626" : "#2563eb" }} /></div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {d.plan?.length > 0 && (
        <Card className="p-5">
          <h4 className="font-heading font-bold text-slate-800 text-sm mb-3">Personalized 7-Day Improvement Plan</h4>
          <ol className="space-y-2" data-testid="improvement-plan">
            {d.plan.map((p, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-600"><span className="h-5 w-5 rounded-full bg-blue-600 text-white text-xs font-bold grid place-items-center flex-shrink-0">{i + 1}</span>{p}</li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
