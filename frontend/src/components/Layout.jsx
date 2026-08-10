import { useState } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Users, GraduationCap, CalendarCheck, Wallet, FileText,
  BookOpen, Megaphone, MessageSquareWarning, UserPlus, CalendarDays, Banknote,
  ClipboardList, LogOut, Menu, X, PlaneTakeoff, IdCard,
} from "lucide-react";

const NAV = {
  principal: [
    ["/app/dashboard", "Dashboard", LayoutDashboard],
    ["/app/students", "Students", Users],
    ["/app/batches", "Batches & Classes", GraduationCap],
    ["/app/teachers", "Teachers & Staff", Users],
    ["/app/attendance", "Attendance", CalendarCheck],
    ["/app/timetable", "Timetable", CalendarDays],
    ["/app/fees", "Fee Management", Wallet],
    ["/app/exams", "Exams & Results", FileText],
    ["/app/homework", "Homework", BookOpen],
    ["/app/salary", "Staff Salary", Banknote],
    ["/app/leaves", "Leave Requests", PlaneTakeoff],
    ["/app/announcements", "Announcements", Megaphone],
    ["/app/complaints", "Complaints", MessageSquareWarning],
    ["/app/enquiries", "Admission Enquiries", UserPlus],
  ],
  teacher: [
    ["/app/dashboard", "Dashboard", LayoutDashboard],
    ["/app/students", "My Students", Users],
    ["/app/attendance", "Attendance", CalendarCheck],
    ["/app/timetable", "Timetable", CalendarDays],
    ["/app/exams", "Exams & Marks", FileText],
    ["/app/homework", "Homework", BookOpen],
    ["/app/salary", "My Salary", Banknote],
    ["/app/leaves", "My Leaves", PlaneTakeoff],
    ["/app/announcements", "Announcements", Megaphone],
    ["/app/complaints", "Complaints", MessageSquareWarning],
  ],
  student: [
    ["/app/dashboard", "Dashboard", LayoutDashboard],
    ["/app/timetable", "My Timetable", CalendarDays],
    ["/app/attendance", "My Attendance", CalendarCheck],
    ["/app/fees", "Fees & Receipts", Wallet],
    ["/app/exams", "My Results", FileText],
    ["/app/homework", "Homework", BookOpen],
    ["/app/idcard", "Digital ID Card", IdCard],
    ["/app/announcements", "Announcements", Megaphone],
    ["/app/complaints", "Complaints", MessageSquareWarning],
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const nav = NAV[user?.role] || [];

  const roleLabel = { principal: "Principal", teacher: "Teacher", student: "Student" }[user?.role];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`fixed z-40 inset-y-0 left-0 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"} flex flex-col`}>
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-slate-100">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 leading-none font-heading text-lg">EduSync</p>
            <p className="text-[10px] text-slate-400 tracking-wide">by Privam Solutions</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {nav.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)} data-testid={`nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-blue-50 text-blue-700 border-l-2 border-blue-600" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}>
              <Icon className="h-[18px] w-[18px]" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <button onClick={() => { logout(); navigate("/"); }} data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
            <LogOut className="h-[18px] w-[18px]" /> Logout
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 lg:ml-72 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setOpen(true)} data-testid="sidebar-toggle">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div>
              <p className="font-semibold text-slate-900 text-sm sm:text-base leading-none">{user?.institute_name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{roleLabel} Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-800 leading-none">{user?.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{user?.student_id || user?.email}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-8 max-w-[1600px] w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
