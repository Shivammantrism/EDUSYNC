import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { StatCard, Loader, PageHeader, StatusBadge, money } from "@/components/common";
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, RadialBarChart, RadialBar,
} from "recharts";
import { Users, TrendingUp, CalendarCheck, Wallet, UserCheck, MessageSquareWarning, BookOpen, Award } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "principal") return <PrincipalDash />;
  if (user?.role === "teacher") return <TeacherDash />;
  return <StudentDash />;
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
        <StatCard testid="kpi-total-students" label="Enrolled Students" value={k.total_students} sub={`+${k.monthly_joiners} this month`} icon={Users} tone="blue" delay={0} />
        <StatCard testid="kpi-attendance" label="Today's Attendance" value={`${k.today_attendance}%`} sub="students present" icon={CalendarCheck} tone="green" delay={60} />
        <StatCard testid="kpi-pending-fees" label="Pending Fees" value={money(k.pending_fees)} sub="to be collected" icon={Wallet} tone="amber" delay={120} />
        <StatCard testid="kpi-teachers" label="Teachers Present" value={`${k.teachers_present}/${k.total_teachers}`} sub="active today" icon={UserCheck} tone="indigo" delay={180} />
        <StatCard testid="kpi-complaints" label="Open Complaints" value={k.open_complaints} sub="need attention" icon={MessageSquareWarning} tone="red" delay={240} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6 border-slate-200 lg:col-span-2">
          <h3 className="font-semibold text-slate-800 mb-4 font-heading">Monthly Fee Collection</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={d.fee_chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v / 1000}k`} />
              <Tooltip formatter={(v) => money(v)} cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="collected" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-6 border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-4 font-heading">Attendance Trend (7 days)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={d.attendance_chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ stroke: "#c7d2fe" }} />
              <Line type="monotone" dataKey="present" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: "#4f46e5" }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-4 font-heading">Recent Admissions</h3>
          <div className="space-y-3">
            {d.recent_students.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">{s.name[0]}</div>
                  <div><p className="font-medium text-slate-800">{s.name}</p><p className="text-xs text-slate-400">{s.student_id}</p></div>
                </div>
                <span className="text-xs text-slate-400">Age {s.age}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-4 font-heading">Recent Complaints</h3>
          <div className="space-y-3">
            {d.recent_complaints.length === 0 && <p className="text-sm text-slate-400">No complaints yet.</p>}
            {d.recent_complaints.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <div><p className="font-medium text-slate-800">{c.subject}</p><p className="text-xs text-slate-400">by {c.raised_by}</p></div>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </Card>
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
        <StatCard testid="t-batches" label="My Batches" value={d.my_batches} icon={BookOpen} tone="blue" />
        <StatCard testid="t-students" label="My Students" value={d.my_students} icon={Users} tone="indigo" />
        <StatCard testid="t-attendance" label="My Attendance" value={d.attendance_marked ? "Marked" : "Pending"} sub="today" icon={CalendarCheck} tone={d.attendance_marked ? "green" : "amber"} />
        <StatCard testid="t-leave" label="Leave Balance" value={d.leave_balance} sub="days left" icon={TrendingUp} tone="green" />
      </div>
      <Card className="p-6 border-slate-200">
        <h3 className="font-semibold text-slate-800 mb-4 font-heading">My Batches</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {d.batches.map((b) => (
            <div key={b.id} className="border border-slate-200 rounded-xl p-4">
              <p className="font-semibold text-slate-800">{b.name}</p>
              <p className="text-sm text-slate-500">{b.subject} · {b.room}</p>
            </div>
          ))}
          {d.batches.length === 0 && <p className="text-sm text-slate-400">No batches assigned yet.</p>}
        </div>
      </Card>
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
        <StatCard testid="s-att" label="Attendance" value={`${d.attendance_pct}%`} icon={CalendarCheck} tone="green" />
        <StatCard testid="s-fees" label="Pending Fees" value={money(d.pending_fees)} icon={Wallet} tone="amber" />
        <StatCard testid="s-avg" label="Avg Score" value={`${d.avg_percentage}%`} sub={`${d.results_count} exams`} icon={Award} tone="blue" />
        <StatCard testid="s-hw" label="Homework" value={d.homework} sub="assignments" icon={BookOpen} tone="indigo" />
      </div>
      <Card className="p-6 border-slate-200">
        <h3 className="font-semibold text-slate-800 mb-4 font-heading">Performance Trend</h3>
        {d.trend.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="subject" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="percentage" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-slate-400">No results yet.</p>}
      </Card>
    </div>
  );
}
