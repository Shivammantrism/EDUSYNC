import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { accentFor } from "@/lib/modules";

export function PageHeader({ title, subtitle, actions, accent }) {
  const location = useLocation();
  const color = accent || accentFor(location.pathname).hex;
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7 fade-up">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1.5 rounded-full" style={{ background: color }} />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-heading">{title}</h1>
        </div>
        {subtitle && <p className="text-sm text-slate-500 mt-1.5 ml-4">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0 }) {
  const [n, setN] = useState(0);
  const ref = useRef();
  useEffect(() => {
    const to = Number(value) || 0;
    const dur = 950;
    let start;
    const tick = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(to * eased);
      if (p < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value]);
  const formatted = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString("en-IN");
  return <span>{prefix}{formatted}{suffix}</span>;
}

export function StatCard({ label, value, sub, icon: Icon, accent = "#2563eb", prefix = "", suffix = "", decimals = 0, testid, delay = 0 }) {
  const isNum = typeof value === "number";
  return (
    <div data-testid={testid} className="card-premium rounded-2xl p-6 relative overflow-hidden fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="absolute top-0 left-0 h-full w-1" style={{ background: accent }} />
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.07]" style={{ background: accent }} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-slate-400">{label}</p>
          <p className="text-[2rem] leading-none font-bold text-slate-900 mt-3 font-heading tabular-nums">
            {isNum ? <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} /> : value}
          </p>
          {sub && <p className="text-sm text-slate-500 mt-2">{sub}</p>}
        </div>
        {Icon && (
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: `${accent}18`, color: accent }}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
    </div>
  );
}

export function Loader({ label = "Loading" }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-[3px] border-blue-100" />
        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-600 spin-ring" />
      </div>
      <p className="text-sm text-slate-400 tracking-wide">{label}...</p>
    </div>
  );
}

export function Empty({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center fade-up">
      {Icon && <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-100 flex items-center justify-center mb-4"><Icon className="h-7 w-7 text-slate-400" /></div>}
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="text-sm text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const statusMap = {
  paid: ["#16a34a", "rgba(22,163,74,0.12)"], pending: ["#d97706", "rgba(217,119,6,0.12)"],
  partial: ["#ea580c", "rgba(234,88,12,0.12)"],
  present: ["#16a34a", "rgba(22,163,74,0.12)"], absent: ["#dc2626", "rgba(220,38,38,0.12)"],
  open: ["#d97706", "rgba(217,119,6,0.12)"], in_progress: ["#2563eb", "rgba(37,99,235,0.12)"],
  resolved: ["#16a34a", "rgba(22,163,74,0.12)"], approved: ["#16a34a", "rgba(22,163,74,0.12)"],
  rejected: ["#dc2626", "rgba(220,38,38,0.12)"], submitted: ["#2563eb", "rgba(37,99,235,0.12)"],
  completed: ["#16a34a", "rgba(22,163,74,0.12)"], new: ["#2563eb", "rgba(37,99,235,0.12)"],
  follow_up: ["#d97706", "rgba(217,119,6,0.12)"], converted: ["#16a34a", "rgba(22,163,74,0.12)"],
  new_lead: ["#2563eb", "rgba(37,99,235,0.12)"], contacted: ["#4f46e5", "rgba(79,70,229,0.12)"],
  demo_scheduled: ["#9333ea", "rgba(147,51,234,0.12)"], admitted: ["#16a34a", "rgba(22,163,74,0.12)"],
  closed: ["#64748b", "rgba(100,116,139,0.12)"],
};
export function StatusBadge({ status }) {
  const [color, bg] = statusMap[status] || ["#475569", "rgba(71,85,105,0.10)"];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize" style={{ color, background: bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {String(status).replace("_", " ")}
    </span>
  );
}

export function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl border border-slate-200 px-3.5 py-2.5 shadow-xl">
      {label && <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-bold" style={{ color: p.color || p.fill || p.stroke }}>
          {formatter ? formatter(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

export const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
