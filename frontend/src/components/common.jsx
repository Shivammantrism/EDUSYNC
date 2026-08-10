import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-heading">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = "blue", testid, delay = 0 }) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    indigo: "bg-indigo-50 text-indigo-600",
  };
  return (
    <Card data-testid={testid} className="stat-card fade-up p-6 border-slate-200 shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] font-semibold text-slate-400">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2 font-heading">{value}</p>
          {sub && <p className="text-sm text-slate-500 mt-1">{sub}</p>}
        </div>
        {Icon && <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${tones[tone]}`}><Icon className="h-5 w-5" /></div>}
      </div>
    </Card>
  );
}

export function Loader({ label = "Loading..." }) {
  return (
    <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
      <Loader2 className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

export function Empty({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Icon className="h-6 w-6 text-slate-400" /></div>}
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="text-sm text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const statusMap = {
  paid: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700",
  present: "bg-emerald-100 text-emerald-700", absent: "bg-red-100 text-red-700",
  open: "bg-amber-100 text-amber-700", in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700", approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700", submitted: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700", new: "bg-blue-100 text-blue-700",
  follow_up: "bg-amber-100 text-amber-700", converted: "bg-emerald-100 text-emerald-700",
};
export function StatusBadge({ status }) {
  const cls = statusMap[status] || "bg-slate-100 text-slate-700";
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${cls}`}>{String(status).replace("_", " ")}</span>;
}

export const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
