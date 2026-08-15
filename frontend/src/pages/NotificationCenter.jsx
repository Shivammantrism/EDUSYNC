import { useEffect, useState } from "react";
import api, { fmtDate } from "@/lib/api";
import { PageHeader, Loader } from "@/components/common";
import { Bell, Wallet, CalendarCheck, FileText, Megaphone } from "lucide-react";

const META = {
  fee: { Icon: Wallet, color: "#f59e0b" },
  fee_paid: { Icon: Wallet, color: "#10b981" },
  attendance: { Icon: CalendarCheck, color: "#10b981" },
  absent: { Icon: CalendarCheck, color: "#ef4444" },
  certificate: { Icon: FileText, color: "#8b5cf6" },
  notice: { Icon: Megaphone, color: "#3b82f6" },
};

const TABS = [["all", "All"], ["fees", "Fees"], ["attendance", "Attendance"], ["certificates", "Certificates"]];

const relTime = (iso) => {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(iso);
};

export default function NotificationCenter() {
  const [kind, setKind] = useState("all");
  const [items, setItems] = useState(null);

  const load = (k) => {
    setItems(null);
    api.get("/notifications/history", { params: { kind: k } }).then((r) => setItems(r.data.items || [])).catch(() => setItems([]));
  };

  useEffect(() => { load(kind); /* eslint-disable-next-line */ }, [kind]);
  useEffect(() => { api.post("/notifications/mark-read").catch(() => {}); }, []);

  return (
    <div data-testid="notification-center">
      <PageHeader title="Notifications" subtitle="Every update on your ward — fees, attendance and certificates" />

      <div className="flex flex-wrap items-center gap-1.5 mb-5" data-testid="notif-tabs">
        {TABS.map(([val, label]) => (
          <button key={val} data-testid={`notif-tab-${val}`} onClick={() => setKind(val)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${kind === val ? "bg-slate-800 text-white shadow" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {items === null ? <Loader /> : items.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm py-16 text-center" data-testid="notif-empty">
          <Bell className="h-10 w-10 mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400 text-sm">No notifications here yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm divide-y divide-slate-50">
          {items.map((n, i) => {
            const meta = META[n.type] || META.notice;
            const Icon = meta.Icon;
            return (
              <div key={i} data-testid={`notif-row-${i}`} className="flex items-start gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors">
                <span className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.color + "1a", color: meta.color }}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 leading-snug">{n.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{relTime(n.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
