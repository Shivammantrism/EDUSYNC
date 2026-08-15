import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { API, fmtDate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatCard, Loader, PageHeader, StatusBadge, ChartTooltip, money } from "@/components/common";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { Users, CalendarCheck, Wallet, UserCheck, MessageSquareWarning, BookOpen, Award, TrendingUp, Phone, GraduationCap, AlertTriangle, Clock, CalendarX, Sparkles, Download, Loader2, Megaphone, IdCard, Receipt, FileText, CalendarDays, CheckCircle2, XCircle, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import StudentInsights from "@/components/StudentInsights";
import { toast } from "sonner";

const STAGES = [
  ["new_lead", "New Lead"], ["contacted", "Contacted"], ["demo_scheduled", "Demo Scheduled"], ["admitted", "Admitted"], ["closed", "Closed"],
];

function ClassQuickCards() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState(null);
  useEffect(() => { api.get("/batches").then((r) => setBatches(r.data)).catch(() => {}); }, []);
  if (!batches || batches.length === 0) return null;
  return (
    <div className="mb-6" data-testid="class-quick-cards">
      <h3 className="font-semibold text-slate-800 font-heading mb-3">Jump to a Class</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {batches.map((b) => (
          <div key={b.id} data-testid={`class-card-${b.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 stat-card">
            <div className="flex items-center gap-2 mb-1"><GraduationCap className="h-4 w-4 text-blue-600" />
              <p className="font-bold text-slate-900 text-sm truncate">{b.name}</p></div>
            <p className="text-xs text-slate-400 mb-3">{b.class_name || "—"}{b.section ? ` · Sec ${b.section}` : ""} · {b.student_count} students</p>
            <div className="grid grid-cols-3 gap-1.5">
              <button data-testid={`class-att-${b.id}`} onClick={() => navigate(`/app/attendance?class=${b.id}`)} className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded-lg py-1.5 hover:bg-emerald-100">Attendance</button>
              <button data-testid={`class-stu-${b.id}`} onClick={() => navigate(`/app/students?class=${b.id}`)} className="text-[11px] font-semibold text-violet-700 bg-violet-50 rounded-lg py-1.5 hover:bg-violet-100">Students</button>
              <button data-testid={`class-hw-${b.id}`} onClick={() => navigate(`/app/homework?class=${b.id}`)} className="text-[11px] font-semibold text-blue-700 bg-blue-50 rounded-lg py-1.5 hover:bg-blue-100">Homework</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnouncementsPanel() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get("/announcements").then((r) => setItems(r.data)).catch(() => {}); }, []);
  if (!items || items.length === 0) return null;
  const AUD = { all: "Everyone", teachers: "Teachers", students: "Students" };
  return (
    <div data-testid="dashboard-announcements" className="relative mb-6 rounded-[22px] p-[1.5px] overflow-hidden fade-up"
      style={{ backgroundImage: "linear-gradient(130deg,#7c3aed,#2563eb 45%,#059669)" }}>
      <div className="rounded-[21px] bg-[#0b1220] text-white p-6 relative overflow-hidden">
        <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full" style={{ background: "radial-gradient(circle, rgba(124,58,237,0.5), transparent 70%)" }} />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-52 w-52 rounded-full" style={{ background: "radial-gradient(circle, rgba(16,185,129,0.4), transparent 70%)" }} />
        <div className="relative flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-2xl grid place-items-center shadow-lg" style={{ backgroundImage: "linear-gradient(135deg,#8b5cf6,#22d3ee)" }}>
            <Megaphone className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-lg leading-none">Announcements</h3>
            <p className="text-xs text-white/60 mt-1">Latest updates from your institute</p>
          </div>
          <span className="ml-auto text-[11px] font-semibold text-white/70 bg-white/10 rounded-full px-3 py-1 border border-white/10">{items.length} total</span>
        </div>
        <div className="relative grid gap-3 sm:grid-cols-2">
          {items.slice(0, 4).map((a) => (
            <div key={a.id} data-testid={`dash-announcement-${a.id}`} className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur p-4 hover:bg-white/[0.12] transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundImage: "linear-gradient(135deg,#a78bfa,#34d399)" }} />
                <p className="font-semibold text-sm truncate">{a.title}</p>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-white/50 bg-white/10 rounded px-1.5 py-0.5 shrink-0">{AUD[a.audience] || "All"}</span>
              </div>
              <p className="text-xs text-white/70 leading-relaxed line-clamp-3">{a.body}</p>
              <div className="flex items-center justify-between mt-3 text-[11px] text-white/45">
                <span className="truncate">{a.author}</span><span className="shrink-0 ml-2">{fmtDate(a.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InsightsPanel() {
  const [ins, setIns] = useState(null);
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    const go = () => api.get("/dashboard/insights").then((r) => setIns(r.data)).catch(() => {});
    go();
    const t = setInterval(go, 30000);
    return () => clearInterval(t);
  }, []);
  if (!ins) return null;
  const B = (k) => ins[k] || { label: "", count: 0, students: [] };
  const cards = [
    { key: "red", tone: "red", icon: AlertTriangle, title: B("red").label || "Low Attendance (<75%)", value: B("red").count,
      desc: B("red").count ? B("red").students.slice(0, 3).map((s) => s.name).join(", ") + (B("red").count > 3 ? "…" : "") : "All students above 75%",
      testid: "insight-low-attendance",
      rows: B("red").students.map((s) => `${s.name} · ${s.student_id} · ${s.detail}`) },
    { key: "orange", tone: "orange", icon: Wallet, title: B("orange").label || "Fee Overdue (>30 days)", value: B("orange").count,
      desc: B("orange").count ? B("orange").students.slice(0, 3).map((s) => s.name).join(", ") + (B("orange").count > 3 ? "…" : "") : "No long-overdue fees",
      testid: "insight-fee-defaulters",
      rows: B("orange").students.map((s) => `${s.name} · ${s.student_id} · ${s.detail}`) },
    { key: "yellow", tone: "yellow", icon: TrendingUp, title: B("yellow").label || "Declining Performance", value: B("yellow").count,
      desc: B("yellow").count ? B("yellow").students.slice(0, 3).map((s) => s.name).join(", ") + (B("yellow").count > 3 ? "…" : "") : "No declining trends",
      testid: "insight-declining",
      rows: B("yellow").students.map((s) => `${s.name} · ${s.student_id} · ${s.detail}`) },
    { key: "green", tone: "green", icon: Award, title: B("green").label || "Top Performers", value: B("green").count,
      desc: B("green").count ? B("green").students.slice(0, 3).map((s) => s.name).join(", ") + (B("green").count > 3 ? "…" : "") : "—",
      testid: "insight-top-performers",
      rows: B("green").students.map((s) => `${s.name} · ${s.student_id} · ${s.detail}`) },
  ];
  const tones = { red: "bg-red-50 border-red-200 text-red-700", orange: "bg-orange-50 border-orange-200 text-orange-700", yellow: "bg-amber-50 border-amber-200 text-amber-700", green: "bg-emerald-50 border-emerald-200 text-emerald-700" };
  const it = { red: "bg-red-100 text-red-600", orange: "bg-orange-100 text-orange-600", yellow: "bg-amber-100 text-amber-600", green: "bg-emerald-100 text-emerald-600" };
  return (
    <div data-testid="ai-insights-panel" className="rounded-2xl border border-slate-200 bg-white p-6 mb-6 stat-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 grid place-items-center"><Sparkles className="h-4 w-4 text-white" /></div>
        <h3 className="font-semibold text-slate-800 font-heading">AI Insights <span className="text-xs font-normal text-slate-400 ml-1">· live</span></h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <button key={c.key} data-testid={c.testid} onClick={() => setDetail({ title: c.title, rows: c.rows })}
            className={`text-left rounded-xl border p-4 transition-shadow hover:shadow-md ${tones[c.tone]}`}>
            <div className="flex items-center justify-between">
              <div className={`h-9 w-9 rounded-lg grid place-items-center ${it[c.tone]}`}><c.icon className="h-4 w-4" /></div>
              <span className="text-2xl font-extrabold">{c.value}</span>
            </div>
            <p className="font-semibold text-sm mt-2">{c.title}</p>
            <p className="text-xs opacity-80 mt-1 line-clamp-2">{c.desc}</p>
          </button>
        ))}
      </div>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent data-testid="insight-detail-dialog">
          <DialogHeader><DialogTitle>{detail?.title}</DialogTitle></DialogHeader>
          {detail?.title?.includes("Low Attendance") && (detail?.rows?.length || 0) > 0 && (
            <button data-testid="notify-parents-btn" onClick={async () => {
              try { const { data } = await api.post("/insights/notify-parents"); toast.success(`Messaged ${data.sent} parent(s) via SMS`); }
              catch (e) { toast.error("Could not send messages"); }
            }} className="w-full mb-3 text-sm font-semibold text-white rounded-lg py-2.5 btn-gradient">
              Message all parents via SMS
            </button>
          )}
          {(detail?.rows?.length || 0) === 0 ? <p className="text-sm text-slate-400 py-2">Nothing to show — all clear.</p> : (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {detail.rows.map((r, i) => <p key={i} data-testid={`insight-row-${i}`} className="text-sm text-slate-700 border-b border-slate-100 py-1.5">{r}</p>)}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "principal") return <PrincipalDash />;
  if (user?.role === "teacher") return <TeacherDash />;
  return <StudentDash />;
}

function ChartCard({ title, children, className = "" }) {
  return (
    <div className={`card-premium rounded-2xl p-6 fade-up ${className}`}>
      <h3 className="font-semibold text-slate-800 mb-5 font-heading">{title}</h3>
      {children}
    </div>
  );
}

function PrincipalDash() {
  const { institute } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard/principal").then((r) => setD(r.data)); }, []);
  if (!d) return <Loader />;
  const k = d.kpis;
  return (
    <div>
      <PageHeader title="Principal Dashboard" subtitle="Live overview of your institute" actions={
        <div className="flex items-center gap-2">
          <Button data-testid="export-students-btn" size="sm" variant="outline" onClick={() => downloadCsv("/export/students.csv", "students.csv")}><Download className="h-4 w-4 mr-1" />Students</Button>
          <Button data-testid="export-teachers-btn" size="sm" variant="outline" onClick={() => downloadCsv("/export/teachers.csv", "teachers.csv")}><Download className="h-4 w-4 mr-1" />Teachers</Button>
          {institute?.code && (
            <div data-testid="institute-code-badge" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
              <span className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Code</span>
              <span className="font-mono text-lg font-extrabold text-violet-600">{institute.code}</span>
            </div>
          )}
        </div>
      } />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-6">
        <StatCard testid="kpi-total-students" label="Enrolled Students" value={k.total_students} sub={`+${k.monthly_joiners} this month`} icon={Users} accent="#1e3a8a" delay={0} />
        <StatCard testid="kpi-attendance" label="Today's Attendance" value={k.today_attendance} suffix="%" decimals={1} sub="students present" icon={CalendarCheck} accent="#059669" delay={70} />
        <StatCard testid="kpi-pending-fees" label="Pending Fees" value={k.pending_fees} prefix="₹" sub="to be collected" icon={Wallet} accent="#7c3aed" delay={140} />
        <StatCard testid="kpi-teachers" label="Teachers Present" value={`${k.teachers_present}/${k.total_teachers}`} sub="active today" icon={UserCheck} accent="#1e40af" delay={210} />
        <StatCard testid="kpi-complaints" label="Open Complaints" value={k.open_complaints} sub="need attention" icon={MessageSquareWarning} accent="#8b5cf6" delay={280} />
      </div>

      <InsightsPanel />
      <ClassQuickCards />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartCard title="Monthly Fee Collection" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={d.fee_chart} margin={{ left: -12 }}>
              <defs>
                <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1e3a8a" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v / 1000}k`} />
              <Tooltip content={<ChartTooltip formatter={(v) => money(v)} />} cursor={{ fill: "rgba(37,99,235,0.06)" }} />
              <Bar dataKey="collected" fill="url(#feeGrad)" radius={[8, 8, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Attendance Trend (7 days)">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={d.attendance_chart} margin={{ left: -20 }}>
              <defs>
                <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#c7d2fe" }} />
              <Area type="monotone" dataKey="present" stroke="#059669" strokeWidth={3} fill="url(#attGrad)" dot={{ r: 3, fill: "#059669" }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Recent Admissions">
          <div className="space-y-3.5">
            {d.recent_students.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500 to-violet-500 text-white flex items-center justify-center font-semibold">{s.name[0]}</div>
                  <div><p className="font-medium text-slate-800">{s.name}</p><p className="text-xs text-slate-400 font-mono">{s.student_id}</p></div>
                </div>
                <span className="text-xs text-slate-400">Age {s.age}</span>
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="Recent Complaints">
          <div className="space-y-3.5">
            {d.recent_complaints.length === 0 && <p className="text-sm text-slate-400">No complaints yet.</p>}
            {d.recent_complaints.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <div><p className="font-medium text-slate-800">{c.subject}</p><p className="text-xs text-slate-400">by {c.raised_by}</p></div>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function TeacherDash() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard/teacher").then((r) => setD(r.data)); }, []);
  const updateLead = async (id, stage) => {
    const status = stage === "admitted" ? "converted" : stage === "closed" ? "closed" : "follow_up";
    try { await api.put(`/enquiries/${id}`, { stage, status }); setD((p) => ({ ...p, assigned_leads: p.assigned_leads.map((l) => l.id === id ? { ...l, stage, status } : l) })); toast.success("Lead updated"); }
    catch (e) { toast.error("Could not update lead"); }
  };
  if (!d) return <Loader />;
  return (
    <div>
      <PageHeader title={`Welcome, ${user.name}`} subtitle="Your teaching overview" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard testid="t-batches" label="My Classes" value={d.my_batches} icon={BookOpen} accent="#1e3a8a" delay={0} />
        <StatCard testid="t-students" label="My Students" value={d.my_students} icon={Users} accent="#7c3aed" delay={70} />
        <StatCard testid="t-attendance" label="My Attendance" value={d.attendance_marked ? "Marked" : "Pending"} sub="today" icon={CalendarCheck} accent={d.attendance_marked ? "#059669" : "#7c3aed"} delay={140} />
        <StatCard testid="t-leave" label="Leave Balance" value={d.leave_balance} sub="days left" icon={TrendingUp} accent="#059669" delay={210} />
      </div>
      <AnnouncementsPanel />
      <ChartCard title="My Classes">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {d.batches.map((b) => (
            <div key={b.id} className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors">
              <p className="font-semibold text-slate-800">{b.name}</p>
              <p className="text-sm text-slate-500">{b.subject} · {b.room}</p>
            </div>
          ))}
          {d.batches.length === 0 && <p className="text-sm text-slate-400">No classes assigned yet.</p>}
        </div>
      </ChartCard>

      <div className="mt-6">
        <ChartCard title="Assigned Admission Leads">
          {(d.assigned_leads?.length || 0) === 0 ? (
            <p className="text-sm text-slate-400">No leads assigned to you yet.</p>
          ) : (
            <div className="space-y-3">
              {d.assigned_leads.map((l) => (
                <div key={l.id} data-testid={`teacher-lead-${l.id}`} className="flex items-center justify-between border border-slate-200 rounded-xl p-3.5 hover:border-indigo-300 transition-colors">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{l.name}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone}</span>
                      {l.course && <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" />{l.course}</span>}
                    </p>
                  </div>
                  <Select value={l.stage || "new_lead"} onValueChange={(v) => updateLead(l.id, v)}>
                    <SelectTrigger data-testid={`teacher-lead-stage-${l.id}`} className="h-8 w-40 text-xs shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>{STAGES.map(([k, lbl]) => <SelectItem key={k} value={k} className="text-xs">{lbl}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function AttendanceCalendar({ rows }) {
  const map = {};
  (rows || []).forEach((r) => { map[r.date] = r.status; });
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = now.toLocaleString("default", { month: "long", year: "numeric" });
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let dd = 1; dd <= daysInMonth; dd++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    cells.push({ dd, status: map[key], isToday: dd === now.getDate() });
  }
  const tone = { present: "bg-emerald-500 text-white", absent: "bg-red-500 text-white", late: "bg-amber-400 text-white" };
  return (
    <div data-testid="attendance-calendar" className="card-premium rounded-2xl p-6 fade-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800 font-heading flex items-center gap-2"><CalendarDays className="h-4 w-4 text-emerald-600" />Attendance · {monthName}</h3>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Present</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Absent</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => <div key={i} className="text-[11px] font-semibold text-slate-400 pb-1">{w}</div>)}
        {cells.map((c, i) => (
          <div key={i} className="aspect-square flex items-center justify-center">
            {c && (
              <span data-testid={c.status ? `cal-day-${c.status}` : undefined}
                className={`h-8 w-8 rounded-lg grid place-items-center text-xs font-semibold ${c.status ? tone[c.status] || "bg-slate-200 text-slate-600" : "text-slate-400"} ${c.isToday ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}>
                {c.dd}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StudentDash() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [hw, setHw] = useState([]);
  const [fees, setFees] = useState([]);
  useEffect(() => {
    api.get("/dashboard/student").then((r) => setD(r.data)).catch(() => {});
    api.get("/homework").then((r) => setHw(r.data || [])).catch(() => {});
    api.get("/fees").then((r) => setFees(r.data || [])).catch(() => {});
  }, []);
  if (!d) return <Loader />;

  const p = d.profile || {};
  const classLabel = [p.class_name, p.section && `Sec ${p.section}`].filter(Boolean).join(" · ") || p.batch_name || "—";
  const pendingHw = (hw || []).filter((h) => !h.my_submission).slice(0, 5);
  const unpaidFees = (fees || []).filter((f) => f.status !== "paid");
  const paidFees = (fees || []).filter((f) => f.status === "paid");
  const totalDue = unpaidFees.reduce((a, f) => a + (Number(f.amount || 0) - Number(f.paid_amount || 0)), 0);

  const authFetch = (path, errMsg) => {
    const token = localStorage.getItem("edusync_token");
    fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((b) => window.open(URL.createObjectURL(b)))
      .catch(() => toast.error(errMsg));
  };

  return (
    <div className="space-y-6" data-testid="student-portal">
      {/* Profile hero */}
      <div className="relative rounded-3xl overflow-hidden text-white p-6 sm:p-7 fade-up" style={{ backgroundImage: "linear-gradient(120deg,#0b1e3b,#141d47 55%,#1a1240)" }}>
        <div className="pointer-events-none absolute -top-16 -right-10 h-52 w-52 rounded-full" style={{ background: "radial-gradient(circle, rgba(37,99,235,0.5), transparent 70%)" }} />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(16,185,129,0.4), transparent 70%)" }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="h-20 w-20 rounded-2xl bg-white/10 ring-2 ring-white/25 overflow-hidden grid place-items-center shrink-0 shadow-xl">
            {p.photo_url ? <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" /> : <span className="text-3xl font-extrabold">{(p.name || user.name)?.[0]?.toUpperCase()}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-heading leading-tight" data-testid="portal-student-name">{p.name || user.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
              <span className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1"><GraduationCap className="h-3.5 w-3.5" />{classLabel}</span>
              <span className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1 font-mono">{p.student_id || user.student_id}</span>
              {p.roll_no && <span className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">Roll {p.roll_no}</span>}
            </div>
          </div>
          <div className="flex sm:flex-col gap-2 shrink-0">
            <Button data-testid="portal-idcard-btn" size="sm" onClick={() => navigate("/app/idcard")} className="bg-white text-slate-900 hover:bg-slate-100"><IdCard className="h-4 w-4 mr-1.5" />ID Card</Button>
            <Button data-testid="portal-report-btn" size="sm" variant="outline" onClick={() => authFetch(`/students/${user.id}/report`, "Could not open report card")} className="border-white/40 text-white hover:bg-white/10 hover:text-white bg-transparent"><FileText className="h-4 w-4 mr-1.5" />Report Card</Button>
          </div>
        </div>
      </div>

      {/* KPI stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testid="s-att" label="Attendance" value={d.attendance_pct} suffix="%" decimals={1} icon={CalendarCheck} accent="#059669" delay={0} />
        <StatCard testid="s-avg" label="Avg Score" value={d.avg_percentage} suffix="%" decimals={1} sub={`${d.results_count} exams`} icon={Award} accent="#8b5cf6" delay={70} />
        <StatCard testid="s-fees" label="Fees Due" value={totalDue} prefix="₹" icon={Wallet} accent="#7c3aed" delay={140} />
        <StatCard testid="s-hw" label="Pending Homework" value={pendingHw.length} sub="to submit" icon={BookOpen} accent="#1e3a8a" delay={210} />
      </div>

      {/* Academic Overview + Financial Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Today's timetable */}
          <div className="card-premium rounded-2xl p-6 fade-up" data-testid="today-timetable">
            <h3 className="font-semibold text-slate-800 font-heading mb-4 flex items-center gap-2"><Clock className="h-4 w-4 text-blue-600" />Today's Classes</h3>
            {(d.today_timetable || []).length === 0 ? (
              <p className="text-sm text-slate-400">No classes scheduled for today. Enjoy your break!</p>
            ) : (
              <div className="space-y-2.5">
                {d.today_timetable.map((t, i) => (
                  <div key={i} data-testid={`tt-slot-${i}`} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
                    <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 rounded-lg px-2 py-1 shrink-0">{t.slot}</span>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800 text-sm truncate">{t.subject}</p><p className="text-xs text-slate-400 truncate">{t.teacher_name}{t.room ? ` · ${t.room}` : ""}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending homework + latest marks */}
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="card-premium rounded-2xl p-6 fade-up" data-testid="pending-homework">
              <h3 className="font-semibold text-slate-800 font-heading mb-4 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-violet-600" />Pending Homework</h3>
              {pendingHw.length === 0 ? <p className="text-sm text-slate-400">All caught up! 🎉</p> : (
                <div className="space-y-2.5">
                  {pendingHw.map((h) => (
                    <button key={h.id} data-testid={`hw-item-${h.id}`} onClick={() => navigate("/app/homework")} className="w-full text-left rounded-xl border border-slate-100 hover:border-violet-300 px-3.5 py-2.5 transition-colors">
                      <p className="font-semibold text-slate-800 text-sm truncate">{h.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{h.subject || "General"}{h.deadline ? ` · due ${fmtDate(h.deadline)}` : ""}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="card-premium rounded-2xl p-6 fade-up" data-testid="latest-marks">
              <h3 className="font-semibold text-slate-800 font-heading mb-4 flex items-center gap-2"><Award className="h-4 w-4 text-amber-500" />Latest Marks</h3>
              {(d.recent_marks || []).length === 0 ? <p className="text-sm text-slate-400">No results yet.</p> : (
                <div className="space-y-2.5">
                  {d.recent_marks.map((m, i) => (
                    <div key={i} data-testid={`mark-item-${i}`} className="flex items-center justify-between rounded-xl border border-slate-100 px-3.5 py-2.5">
                      <div className="min-w-0"><p className="font-semibold text-slate-800 text-sm truncate">{m.subject}</p><p className="text-xs text-slate-400">Grade {m.grade}</p></div>
                      <span className={`text-lg font-extrabold ${m.percentage >= 75 ? "text-emerald-600" : m.percentage >= 40 ? "text-blue-600" : "text-red-600"}`}>{m.percentage}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Financial status */}
        <div className="card-premium rounded-2xl p-6 fade-up flex flex-col" data-testid="financial-status">
          <h3 className="font-semibold text-slate-800 font-heading mb-4 flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-600" />Fee Status</h3>
          <div className={`rounded-2xl p-4 mb-4 text-center ${totalDue > 0 ? "bg-orange-50 border border-orange-200" : "bg-emerald-50 border border-emerald-200"}`}>
            {totalDue > 0 ? (
              <><p className="text-xs uppercase tracking-wide text-orange-500 font-semibold">Total Overdue</p><p className="text-3xl font-extrabold text-orange-600 mt-1" data-testid="fee-due-amount">{money(totalDue)}</p><Button data-testid="pay-fees-btn" size="sm" onClick={() => navigate("/app/fees")} className="mt-3 btn-gradient text-white">Pay Now</Button></>
            ) : (
              <><CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-1" /><p className="font-bold text-emerald-700" data-testid="fee-cleared">All fees cleared</p></>
            )}
          </div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Recent Receipts</p>
          <div className="space-y-2 overflow-y-auto flex-1">
            {paidFees.length === 0 ? <p className="text-sm text-slate-400">No paid receipts yet.</p> : paidFees.slice(0, 6).map((f) => (
              <button key={f.id} data-testid={`receipt-${f.id}`} onClick={() => authFetch(`/fees/${f.id}/receipt`, "Receipt not available")} className="w-full flex items-center justify-between rounded-xl border border-slate-100 hover:border-emerald-300 px-3.5 py-2.5 transition-colors text-left">
                <div className="min-w-0"><p className="font-semibold text-slate-800 text-sm truncate">{f.month}</p><p className="text-xs text-slate-400 font-mono truncate">{f.receipt_no || "—"}</p></div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Receipt className="h-3.5 w-3.5" />{money(f.paid_amount || f.amount)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Attendance calendar */}
      <AttendanceCalendar rows={d.attendance_calendar} />

      <AnnouncementsPanel />

      {/* AI Progress Report */}
      <div>
        <h3 className="font-heading font-bold text-slate-800 mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-600" />AI Progress Report</h3>
        <StudentInsights studentId={user.id} />
      </div>
    </div>
  );
}
