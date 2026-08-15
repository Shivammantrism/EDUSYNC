import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Loader, StatCard, money } from "@/components/common";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { TrendingUp, Wallet, AlertTriangle, Percent, CalendarCheck, GraduationCap } from "lucide-react";

function Panel({ title, icon: Icon, children, className = "", testid }) {
  return (
    <div data-testid={testid} className={`rounded-2xl bg-white border border-slate-100 shadow-sm p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        {Icon && <span className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600"><Icon className="h-4 w-4" /></span>}
        <h3 className="font-heading font-bold text-slate-800 text-base">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const heatColor = (pct) =>
  pct == null ? "#f1f5f9" : pct >= 90 ? "#16a34a" : pct >= 75 ? "#65a30d" : pct >= 60 ? "#f59e0b" : "#dc2626";

export default function Analytics() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard/analytics").then((r) => setD(r.data)).catch(() => setD({ error: true })); }, []);
  if (!d) return <Loader />;
  if (d.error) return <div className="p-8 text-center text-slate-400" data-testid="analytics-error">Couldn't load analytics. Try again shortly.</div>;

  const maxPerf = Math.max(100, ...d.class_performance.map((c) => c.avg));
  return (
    <div data-testid="analytics-page">
      <PageHeader title="Analytics" subtitle="Fee trends, attendance heatmaps and class performance at a glance" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard testid="an-collection-rate" label="Collection Rate" value={d.collection_rate} suffix="%" decimals={1} sub="last 6 months" icon={Percent} accent="#059669" delay={0} />
        <StatCard testid="an-collected" label="Total Collected" value={d.total_collected} prefix="₹" sub="last 6 months" icon={Wallet} accent="#1e3a8a" delay={70} />
        <StatCard testid="an-outstanding" label="Total Outstanding" value={d.total_due} prefix="₹" sub={`${d.total_defaulters} defaulters`} icon={AlertTriangle} accent="#dc2626" delay={140} />
        <StatCard testid="an-billed" label="Total Billed" value={d.total_billed} prefix="₹" sub="last 6 months" icon={TrendingUp} accent="#7c3aed" delay={210} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Panel title="Fee Collection Trend" icon={TrendingUp} testid="panel-fee-trend">
          {d.fee_trend.every((m) => !m.billed) ? (
            <p className="text-sm text-slate-400 py-12 text-center">No fee data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.fee_trend} margin={{ left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v, n) => [money(v), n === "collected" ? "Collected" : "Billed"]} cursor={{ fill: "rgba(37,99,235,0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="billed" name="Billed" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Class-wise Performance" icon={GraduationCap} testid="panel-class-performance">
          {d.class_performance.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">No exam results recorded yet.</p>
          ) : (
            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {d.class_performance.map((c) => (
                <div key={c.class} data-testid={`perf-row-${c.class}`}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">{c.class}</span>
                    <span className="font-bold text-slate-800">{c.avg}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${(c.avg / maxPerf) * 100}%`, background: c.avg >= 75 ? "#16a34a" : c.avg >= 50 ? "#f59e0b" : "#dc2626" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Attendance Heatmap (last 7 days)" icon={CalendarCheck} testid="panel-heatmap" className="mb-6">
        {d.heatmap.rows.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">No classes to display.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate" style={{ borderSpacing: "4px" }}>
              <thead>
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-500 px-2">Class</th>
                  {d.heatmap.days.map((day) => (
                    <th key={day} className="text-xs font-semibold text-slate-500 px-1">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.heatmap.rows.map((row) => (
                  <tr key={row.class}>
                    <td className="text-sm font-medium text-slate-700 pr-3 whitespace-nowrap">{row.class}</td>
                    {row.cells.map((pct, i) => (
                      <td key={i} className="text-center">
                        <div data-testid={`heat-${row.class}-${i}`} title={pct == null ? "No data" : `${pct}% present`}
                          className="h-9 min-w-[44px] rounded-md flex items-center justify-center text-xs font-bold"
                          style={{ background: heatColor(pct), color: pct == null ? "#94a3b8" : "#fff" }}>
                          {pct == null ? "—" : `${pct}%`}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: "#dc2626" }} />&lt;60%</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: "#f59e0b" }} />60–74%</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: "#65a30d" }} />75–89%</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: "#16a34a" }} />90%+</span>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Fee Defaulters by Class" icon={AlertTriangle} testid="panel-defaulters">
        {d.defaulters.length === 0 ? (
          <p className="text-sm text-emerald-600 py-8 text-center font-medium">🎉 No outstanding dues — everyone's paid up!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="py-2">Class</th>
                  <th className="py-2 text-center">Defaulters</th>
                  <th className="py-2 text-right">Total Dues</th>
                </tr>
              </thead>
              <tbody>
                {d.defaulters.map((r) => (
                  <tr key={r.class} data-testid={`defaulter-row-${r.class}`} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 font-medium text-slate-700">{r.class}</td>
                    <td className="py-2.5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold text-xs">{r.count}</span>
                    </td>
                    <td className="py-2.5 text-right font-bold text-slate-800">{money(r.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-100">
                  <td className="py-2.5 font-bold text-slate-800">Total</td>
                  <td className="py-2.5 text-center font-bold text-red-600">{d.total_defaulters}</td>
                  <td className="py-2.5 text-right font-extrabold text-red-600">{money(d.total_due)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
