import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { MODULE_ACCENTS } from "@/lib/modules";
import api from "@/lib/api";
import InstallPrompt from "@/components/InstallPrompt";
import StudyBuddyWidget from "@/components/StudyBuddyWidget";
import { ensureNotificationPermission, showLocalNotification, notificationPermission } from "@/lib/pwa";
import {
  LayoutDashboard, Users, GraduationCap, CalendarCheck, Wallet, FileText,
  BookOpen, Megaphone, MessageSquareWarning, UserPlus, CalendarDays, Banknote,
  LogOut, Menu, X, PlaneTakeoff, IdCard, Settings, ListChecks, Images,
  Bell, KeyRound, Sparkles, Wallet as WalletIcon, UserX, Megaphone as MegaphoneIcon, UserPlus as UserPlusIcon, PlaneTakeoff as PlaneIcon,
} from "lucide-react";

const NOTIF_META = {
  fee: { Icon: WalletIcon, color: "#f59e0b" },
  absent: { Icon: UserX, color: "#ef4444" },
  notice: { Icon: MegaphoneIcon, color: "#3b82f6" },
  complaint: { Icon: MessageSquareWarning, color: "#ef4444" },
  lead: { Icon: UserPlusIcon, color: "#10b981" },
  leave: { Icon: PlaneIcon, color: "#8b5cf6" },
};

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ count: 0, items: [] });
  const [error, setError] = useState(false);
  const [perm, setPerm] = useState(() => notificationPermission());
  const ref = useRef(null);

  const notifyNew = (items) => {
    if (notificationPermission() !== "granted") return;
    const key = "edusync_seen_alerts";
    let prev;
    try { prev = JSON.parse(localStorage.getItem(key) || "null"); } catch { prev = null; }
    const titles = items.map((i) => i.title);
    if (prev === null) { localStorage.setItem(key, JSON.stringify(titles)); return; }
    const fresh = titles.filter((t) => !prev.includes(t));
    fresh.slice(0, 3).forEach((t) => showLocalNotification("EduSync", t));
    localStorage.setItem(key, JSON.stringify(titles));
  };

  const load = async () => {
    try {
      const { data } = await api.get("/notifications");
      setData(data);
      setError(false);
      notifyNew(data.items || []);
    } catch { setError(true); }
  };

  const enableAlerts = async () => {
    const p = await ensureNotificationPermission();
    setPerm(p);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button data-testid="notification-bell-btn" onClick={() => setOpen((o) => !o)}
        className="relative h-10 w-10 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 transition-colors">
        <Bell className="h-[19px] w-[19px]" />
        {data.count > 0 && (
          <span data-testid="notification-badge"
            className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[#141d47]">
            {data.count > 9 ? "9+" : data.count}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div data-testid="notification-dropdown"
            initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="font-heading font-bold text-slate-800 text-sm">Notifications</p>
              {perm === "granted"
                ? <span className="text-xs text-slate-400">{data.count} new</span>
                : perm !== "unsupported"
                  ? <button data-testid="enable-alerts-btn" onClick={enableAlerts} className="text-[11px] font-semibold text-blue-600 hover:underline">Enable alerts</button>
                  : <span className="text-xs text-slate-400">{data.count} new</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {data.items.length === 0 ? (
                error ? (
                  <div className="px-4 py-10 text-center text-sm text-amber-600" data-testid="notification-error">
                    <Bell className="h-8 w-8 mx-auto mb-2 text-amber-200" />
                    Couldn't load notifications. Try again shortly.
                  </div>
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-slate-400" data-testid="notification-empty">
                    <Bell className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                    You're all caught up!
                  </div>
                )
              ) : (
                data.items.map((it, i) => {
                  const meta = NOTIF_META[it.type] || NOTIF_META.notice;
                  const Icon = meta.Icon;
                  return (
                    <div key={`${it.type}-${it.title}-${i}`} data-testid={`notification-item-${i}`}
                      className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                      <span className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: meta.color + "1a", color: meta.color }}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <p className="text-sm text-slate-700 leading-snug">{it.title}</p>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NAV = {
  principal: [
    ["/app/dashboard", "Dashboard", LayoutDashboard, "dashboard"],
    ["/app/students", "Students", Users, "students"],
    ["/app/batches", "Classes & Sections", GraduationCap, "batches"],
    ["/app/teachers", "Teachers & Staff", Users, "teachers"],
    ["/app/faculty-ids", "Faculty ID Cards", IdCard, "idcard"],
    ["/app/attendance", "Attendance", CalendarCheck, "attendance"],
    ["/app/timetable", "Timetable", CalendarDays, "timetable"],
    ["/app/fees", "Fee Management", Wallet, "fees"],
    ["/app/class-fees", "Class Fee Setup", Banknote, "fees"],
    ["/app/certificates", "Certificates", FileText, "exams"],
    ["/app/exams", "Exams & Results", FileText, "exams"],
    ["/app/quizzes", "Online Tests", ListChecks, "quizzes"],
    ["/app/homework", "Homework", BookOpen, "homework"],
    ["/app/salary", "Staff Salary", Banknote, "salary"],
    ["/app/leaves", "Leave Requests", PlaneTakeoff, "leaves"],
    ["/app/announcements", "Announcements", Megaphone, "announcements"],
    ["/app/complaints", "Complaints", MessageSquareWarning, "complaints"],
    ["/app/enquiries", "Admission Enquiries", UserPlus, "enquiries"],
    ["/app/gallery", "Photo Gallery", Images, "gallery"],
    ["/app/settings", "Institute Branding", Settings, "settings"],
    ["/app/change-password", "Change Password", KeyRound, "settings"],
  ],
  teacher: [
    ["/app/dashboard", "Dashboard", LayoutDashboard, "dashboard"],
    ["/app/students", "My Students", Users, "students"],
    ["/app/attendance", "Attendance", CalendarCheck, "attendance"],
    ["/app/timetable", "Timetable", CalendarDays, "timetable"],
    ["/app/exams", "Exams & Marks", FileText, "exams"],
    ["/app/quizzes", "Online Tests", ListChecks, "quizzes"],
    ["/app/homework", "Homework", BookOpen, "homework"],
    ["/app/salary", "My Salary", Banknote, "salary"],
    ["/app/leaves", "My Leaves", PlaneTakeoff, "leaves"],
    ["/app/announcements", "Announcements", Megaphone, "announcements"],
    ["/app/complaints", "Complaints", MessageSquareWarning, "complaints"],
    ["/app/gallery", "Photo Gallery", Images, "gallery"],
    ["/app/change-password", "Change Password", KeyRound, "settings"],
  ],
  student: [
    ["/app/dashboard", "Dashboard", LayoutDashboard, "dashboard"],
    ["/app/attendance", "My Attendance", CalendarCheck, "attendance"],
    ["/app/quizzes", "Online Tests", ListChecks, "quizzes"],
    ["/app/homework", "Homework", BookOpen, "homework"],
    ["/app/fees", "Fees & Receipts", Wallet, "fees"],
    ["/app/complaints", "Raise Complaint", MessageSquareWarning, "complaints"],
    ["/app/idcard", "Digital ID Card", IdCard, "idcard"],
    ["/app/change-password", "Change Password", KeyRound, "settings"],
  ],
  parent: [
    ["/app/dashboard", "Dashboard", LayoutDashboard, "dashboard"],
    ["/app/fees", "Fees & Receipts", Wallet, "fees"],
    ["/app/complaints", "Message Teacher", MessageSquareWarning, "complaints"],
    ["/app/idcard", "Digital ID Card", IdCard, "idcard"],
  ],
};

function NavItem({ to, label, Icon, accentKey, onClick }) {
  const accent = MODULE_ACCENTS[accentKey] || MODULE_ACCENTS.dashboard;
  return (
    <NavLink to={to} onClick={onClick} data-testid={`nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      className="group relative flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-medium">
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full" style={{ background: accent.hex }} />}
          <span className="flex items-center gap-3 w-full rounded-xl px-2 -mx-1 py-0.5 transition-colors"
            style={isActive ? { background: accent.hex + "22" } : {}}>
            <span className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: isActive ? accent.hex : "rgba(255,255,255,0.06)", color: isActive ? "#fff" : accent.hex, boxShadow: isActive ? `0 6px 16px -6px ${accent.hex}` : "none" }}>
              <Icon className="h-[17px] w-[17px]" />
            </span>
            <span className={isActive ? "text-white font-semibold" : "text-slate-300 group-hover:text-white"}>{label}</span>
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
  const roleLabel = { principal: "Principal", teacher: "Teacher", student: "Student", parent: "Parent" }[user?.role];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`fixed z-40 inset-y-0 left-0 w-72 transform transition-transform duration-300 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"} flex flex-col shadow-2xl`}
        style={{ background: "linear-gradient(180deg,#0b1e3b 0%,#141d47 52%,#1a1240 100%)" }}>
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/10">
          <div className="h-11 w-11 rounded-xl bg-white p-1 flex items-center justify-center shadow-lg">
            <img src="/edusync-logo.png" alt="EduSync" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="font-extrabold leading-none font-heading text-xl tracking-tight bg-gradient-to-r from-emerald-300 via-blue-200 to-violet-300 bg-clip-text text-transparent">EduSync</p>
            <p className="text-[10px] text-blue-300/70 tracking-wide mt-0.5">Smarter Institutes. Brighter Futures.</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {nav.map(([to, label, Icon, key]) => (
            <NavItem key={to} to={to} label={label} Icon={Icon} accentKey={key} onClick={() => setOpen(false)} />
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <button onClick={() => { logout(); navigate("/"); }} data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-300 hover:bg-red-500/15 hover:text-red-200 transition-colors">
            <span className="h-8 w-8 rounded-lg bg-red-500/15 flex items-center justify-center"><LogOut className="h-[17px] w-[17px]" /></span> Logout
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 lg:ml-72 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20 shadow-lg"
          style={{ background: "linear-gradient(90deg,#0b1e3b,#1a1240)" }}>
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-white" onClick={() => setOpen(true)} data-testid="sidebar-toggle">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div>
              <p className="font-bold text-white text-sm sm:text-base leading-none font-heading">{user?.institute_name}</p>
              <p className="text-xs text-blue-300/70 mt-0.5">{roleLabel} Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-white leading-none">{user?.name}</p>
              <p className="text-xs text-blue-300/70 mt-0.5">{user?.student_id || user?.email}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 via-blue-500 to-violet-500 text-white flex items-center justify-center font-bold text-sm shadow-lg ring-2 ring-white/20">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.main key={location.pathname}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 p-4 sm:p-8 max-w-[1600px] w-full">
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
      <InstallPrompt />
      {user?.role === "student" && <StudyBuddyWidget />}
    </div>
  );
}
