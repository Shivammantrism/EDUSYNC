import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatCard, Loader, PageHeader, StatusBadge, ChartTooltip, money } from "@/components/common";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { Users, CalendarCheck, Wallet, UserCheck, MessageSquareWarning, BookOpen, Award, TrendingUp } from "lucide-react";

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
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard/principal").then((r) => setD(r.data)); }, []);
  if (!d) return <Loader />;
  const k = d.kpis;
  return (
    <div>
      <PageHeader title="Principal Dashboard" subtitle="Live overview of your institute" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-6">
        <StatCard testid="kpi-total-students" label="Enrolled Students" value={k.total_students} sub={`+${k.monthly_joiners} this month`} icon={Users} accent="#2563eb" delay={0} />
        <StatCard testid="kpi-attendance" label="Today's Attendance" value={k.today_attendance} suffix="%" decimals={1} sub="students present" icon={CalendarCheck} accent="#16a34a" delay={70} />
        <StatCard testid="kpi-pending-fees" label="Pending Fees" value={k.pending_fees} prefix="₹" sub="to be collected" icon={Wallet} accent="#f97316" delay={140} />
        <StatCard testid="kpi-teachers" label="Teachers Present" value={`${k.teachers_present}/${k.total_teachers}`} sub="active today" icon={UserCheck} accent="#4f46e5" delay={210} />
        <StatCard testid="kpi-complaints" label="Open Complaints" value={k.open_complaints} sub="need attention" icon={MessageSquareWarning} accent="#dc2626" delay={280} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartCard title="Monthly Fee Collection" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={d.fee_chart} margin={{ left: -12 }}>
              <defs>
                <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#60a5fa" />
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
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#c7d2fe" }} />
              <Area type="monotone" dataKey="present" stroke="#4f46e5" strokeWidth={3} fill="url(#attGrad)" dot={{ r: 3, fill: "#4f46e5" }} activeDot={{ r: 5 }} />
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
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center font-semibold">{s.name[0]}</div>
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
  if (!d) return <Loader />;
  return (
    <div>
      <PageHeader title={`Welcome, ${user.name}`} subtitle="Your teaching overview" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard testid="t-batches" label="My Batches" value={d.my_batches} icon={BookOpen} accent="#0d9488" delay={0} />
        <StatCard testid="t-students" label="My Students" value={d.my_students} icon={Users} accent="#4f46e5" delay={70} />
        <StatCard testid="t-attendance" label="My Attendance" value={d.attendance_marked ? "Marked" : "Pending"} sub="today" icon={CalendarCheck} accent={d.attendance_marked ? "#16a34a" : "#f97316"} delay={140} />
        <StatCard testid="t-leave" label="Leave Balance" value={d.leave_balance} sub="days left" icon={TrendingUp} accent="#0284c7" delay={210} />
      </div>
      <ChartCard title="My Batches">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {d.batches.map((b) => (
            <div key={b.id} className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors">
              <p className="font-semibold text-slate-800">{b.name}</p>
              <p className="text-sm text-slate-500">{b.subject} · {b.room}</p>
            </div>
          ))}
          {d.batches.length === 0 && <p className="text-sm text-slate-400">No batches assigned yet.</p>}
        </div>
      </ChartCard>
    </div>
  );
}

function StudentDash() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard/student").then((r) => setD(r.data)); }, []);
  if (!d) return <Loader />;
  return (
    <div>
      <PageHeader title={`Hi, ${user.name}`} subtitle={`Student ID: ${user.student_id}`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard testid="s-att" label="Attendance" value={d.attendance_pct} suffix="%" decimals={1} icon={CalendarCheck} accent="#16a34a" delay={0} />
        <StatCard testid="s-fees" label="Pending Fees" value={d.pending_fees} prefix="₹" icon={Wallet} accent="#f97316" delay={70} />
        <StatCard testid="s-avg" label="Avg Score" value={d.avg_percentage} suffix="%" decimals={1} sub={`${d.results_count} exams`} icon={Award} accent="#9333ea" delay={140} />
        <StatCard testid="s-hw" label="Homework" value={d.homework} sub="assignments" icon={BookOpen} accent="#0d9488" delay={210} />
      </div>
      <ChartCard title="Performance Trend">
        {d.trend.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.trend} margin={{ left: -12 }}>
              <defs>
                <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9333ea" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="subject" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} cursor={{ fill: "rgba(147,51,234,0.06)" }} />
              <Bar dataKey="percentage" fill="url(#perfGrad)" radius={[8, 8, 0, 0]} barSize={42} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-slate-400">No results yet.</p>}
      </ChartCard>
    </div>
  );
}
