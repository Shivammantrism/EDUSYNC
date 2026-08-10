import { useState } from "react";
import { NavLink, useNavigate, useLocation, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { MODULE_ACCENTS } from "@/lib/modules";
import {
  LayoutDashboard, Users, GraduationCap, CalendarCheck, Wallet, FileText,
  BookOpen, Megaphone, MessageSquareWarning, UserPlus, CalendarDays, Banknote,
  LogOut, Menu, X, PlaneTakeoff, IdCard,
} from "lucide-react";

const NAV = {
  principal: [
    ["/app/dashboard", "Dashboard", LayoutDashboard, "dashboard"],
    ["/app/students", "Students", Users, "students"],
    ["/app/batches", "Batches & Classes", GraduationCap, "batches"],
    ["/app/teachers", "Teachers & Staff", Users, "teachers"],
    ["/app/attendance", "Attendance", CalendarCheck, "attendance"],
    ["/app/timetable", "Timetable", CalendarDays, "timetable"],
    ["/app/fees", "Fee Management", Wallet, "fees"],
    ["/app/exams", "Exams & Results", FileText, "exams"],
    ["/app/homework", "Homework", BookOpen, "homework"],
    ["/app/salary", "Staff Salary", Banknote, "salary"],
    ["/app/leaves", "Leave Requests", PlaneTakeoff, "leaves"],
    ["/app/announcements", "Announcements", Megaphone, "announcements"],
    ["/app/complaints", "Complaints", MessageSquareWarning, "complaints"],
    ["/app/enquiries", "Admission Enquiries", UserPlus, "enquiries"],
  ],
  teacher: [
    ["/app/dashboard", "Dashboard", LayoutDashboard, "dashboard"],
    ["/app/students", "My Students", Users, "students"],
    ["/app/attendance", "Attendance", CalendarCheck, "attendance"],
    ["/app/timetable", "Timetable", CalendarDays, "timetable"],
    ["/app/exams", "Exams & Marks", FileText, "exams"],
    ["/app/homework", "Homework", BookOpen, "homework"],
    ["/app/salary", "My Salary", Banknote, "salary"],
    ["/app/leaves", "My Leaves", PlaneTakeoff, "leaves"],
    ["/app/announcements", "Announcements", Megaphone, "announcements"],
    ["/app/complaints", "Complaints", MessageSquareWarning, "complaints"],
  ],
  student: [
    ["/app/dashboard", "Dashboard", LayoutDashboard, "dashboard"],
    ["/app/timetable", "My Timetable", CalendarDays, "timetable"],
    ["/app/attendance", "My Attendance", CalendarCheck, "attendance"],
    ["/app/fees", "Fees & Receipts", Wallet, "fees"],
    ["/app/exams", "My Results", FileText, "exams"],
    ["/app/homework", "Homework", BookOpen, "homework"],
    ["/app/idcard", "Digital ID Card", IdCard, "idcard"],
    ["/app/announcements", "Announcements", Megaphone, "announcements"],
    ["/app/complaints", "Complaints", MessageSquareWarning, "complaints"],
  ],
};

function NavItem({ to, label, Icon, accentKey, onClick }) {
  const accent = MODULE_ACCENTS[accentKey] || MODULE_ACCENTS.dashboard;
  return (
    <NavLink to={to} onClick={onClick} data-testid={`nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150">
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full" style={{ background: accent.hex }} />}
          <span className="flex items-center gap-3 w-full rounded-xl px-1 -mx-1"
            style={isActive ? { color: accent.hex, background: accent.soft } : {}}>
            <span className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: isActive ? accent.hex : accent.soft, color: isActive ? "#fff" : accent.hex }}>
              <Icon className="h-[17px] w-[17px]" />
            </span>
            <span className={isActive ? "" : "text-slate-600 group-hover:text-slate-900"}>{label}</span>
          </span>
        </>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const nav = NAV[user?.role] || [];
  const roleLabel = { principal: "Principal", teacher: "Teacher", student: "Student" }[user?.role];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`fixed z-40 inset-y-0 left-0 w-72 glass border-r border-white/60 transform transition-transform duration-300 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"} flex flex-col shadow-xl lg:shadow-none`}>
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-slate-100/70">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-extrabold text-slate-900 leading-none font-heading text-xl tracking-tight">EduSync</p>
            <p className="text-[10px] text-slate-400 tracking-wide mt-0.5">by Privam Solutions</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {nav.map(([to, label, Icon, key]) => (
            <NavItem key={to} to={to} label={label} Icon={Icon} accentKey={key} onClick={() => setOpen(false)} />
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100/70">
          <button onClick={() => { logout(); navigate("/"); }} data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
            <span className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center"><LogOut className="h-[17px] w-[17px]" /></span> Logout
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 lg:ml-72 flex flex-col min-w-0">
        <header className="h-16 glass border-b border-white/60 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-slate-600" onClick={() => setOpen(true)} data-testid="sidebar-toggle">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div>
              <p className="font-bold text-slate-900 text-sm sm:text-base leading-none font-heading">{user?.institute_name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{roleLabel} Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-800 leading-none">{user?.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{user?.student_id || user?.email}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-blue-600/25 ring-2 ring-white">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.main key={location.pathname}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 p-4 sm:p-8 max-w-[1600px] w-full">
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
