import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Eye, EyeOff, ArrowRight, KeyRound, Sun, Moon, Loader2, Leaf,
  CalendarCheck, Users, QrCode, BarChart3, CalendarDays,
  Building2, GraduationCap, BookOpen,
} from "lucide-react";

const BG = "https://static.prod-images.emergentagent.com/jobs/72ae9904-4ac0-43bf-9171-d632b5cd236b/images/8d51fec8462116d99a45ca16730761766c933a83df32ddd61358d5750e59b59e.jpeg";
const LOGO = "/edusync-watermark.png";

const BOTTOM_STATS = [
  { icon: Building2, value: "500+", label: "Schools" },
  { icon: Users, value: "1.2M", label: "Students" },
  { icon: GraduationCap, value: "45K", label: "Teachers" },
  { icon: BookOpen, value: "3K+", label: "Courses" },
];

export default function Landing() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [view, setView] = useState("login"); // login | register
  const [byCode, setByCode] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [li, setLi] = useState({ identifier: "", password: "" });
  const [reg, setReg] = useState({ institute_name: "", principal_name: "", email: "", password: "" });
  const [fp, setFp] = useState({ open: false, step: 1, email: "", otp: "", new_password: "", loading: false });

  const leaves = useMemo(() => Array.from({ length: 7 }).map((_, i) => ({
    id: i, left: Math.random() * 90 + 2, size: 16 + Math.random() * 16, delay: Math.random() * 12, dur: 11 + Math.random() * 12,
  })), []);

  const sendOtp = async () => {
    setFp((s) => ({ ...s, loading: true }));
    try { await api.post("/auth/forgot-password", { email: fp.email }); toast.success("If that email exists, an OTP has been sent."); setFp((s) => ({ ...s, step: 2, loading: false })); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); setFp((s) => ({ ...s, loading: false })); }
  };
  const doReset = async () => {
    setFp((s) => ({ ...s, loading: true }));
    try { await api.post("/auth/reset-password", { email: fp.email, otp: fp.otp, new_password: fp.new_password }); toast.success("Password reset! Please sign in."); setFp({ open: false, step: 1, email: "", otp: "", new_password: "", loading: false }); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); setFp((s) => ({ ...s, loading: false })); }
  };
  const doLogin = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data } = await api.post("/auth/login", li);
      login(data.access_token, data.user);
      toast.success(`Welcome back, ${data.user.name}`);
      navigate("/app/dashboard");
    } catch (err) { toast.error(formatErr(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  const doRegister = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data } = await api.post("/auth/register-institute", reg);
      login(data.access_token, data.user);
      toast.success("Institute created! Welcome to EduSync.");
      navigate("/app/dashboard");
    } catch (err) { toast.error(formatErr(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  const cardBg = dark ? "bg-[#111528]/85 border-white/10" : "bg-white/85 border-white/60";
  const txt = dark ? "text-slate-100" : "text-slate-900";
  const sub = dark ? "text-slate-400" : "text-slate-500";
  const inputCls = dark ? "input-dark" : "";

  return (
    <div className="relative min-h-screen w-full flex overflow-hidden">
      {/* dark mode toggle */}
      <button data-testid="dark-mode-toggle" onClick={() => setDark((d) => !d)}
        className="absolute top-5 right-5 z-30 h-10 w-10 rounded-full glass-light flex items-center justify-center text-white hover:scale-105 transition-transform shadow-lg">
        {dark ? <Sun className="h-5 w-5 text-amber-300" /> : <Moon className="h-5 w-5 text-white" />}
      </button>

      {/* ---------- LEFT PANEL ---------- */}
      <div className="relative hidden lg:flex flex-col w-[56%] overflow-hidden">
        <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url(${BG})` }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(88,28,135,0.78) 0%, rgba(139,92,246,0.55) 45%, rgba(251,146,60,0.35) 100%)" }} />

        {/* bokeh */}
        <div className="bokeh h-40 w-40 top-[12%] left-[18%]" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.5), transparent 70%)", animationDuration: "7s" }} />
        <div className="bokeh h-24 w-24 top-[60%] left-[10%]" style={{ background: "radial-gradient(circle, rgba(253,224,71,0.5), transparent 70%)", animationDuration: "9s", animationDelay: "1.5s" }} />
        <div className="bokeh h-28 w-28 top-[30%] right-[14%]" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.45), transparent 70%)", animationDuration: "8s", animationDelay: "0.8s" }} />

        {/* floating leaves */}
        {leaves.map((l) => (
          <Leaf key={l.id} className="leaf text-amber-200/70" style={{ left: `${l.left}%`, width: l.size, height: l.size, top: "-5%", animationDelay: `${l.delay}s`, animationDuration: `${l.dur}s` }} />
        ))}

        {/* branding */}
        <div className="relative z-10 px-12 pt-16">
          <div className="flex items-center gap-3 login-in">
            <div className="h-14 w-14 rounded-2xl bg-white/95 p-1.5 shadow-xl flex items-center justify-center">
              <img src={LOGO} alt="EduSync" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-heading text-white leading-none">EduSync</p>
              <p className="text-[11px] text-white/70 mt-0.5">by Privam Solutions</p>
            </div>
          </div>
          <h1 className="mt-10 text-white font-heading font-extrabold text-4xl xl:text-5xl leading-tight max-w-md login-in" style={{ animationDelay: "0.05s" }}>
            Smarter Institutes.<br /><span className="bg-gradient-to-r from-amber-200 to-orange-300 bg-clip-text text-transparent">Better Tomorrow.</span>
          </h1>
          <p className="mt-4 text-white/80 text-base max-w-sm login-in" style={{ animationDelay: "0.1s" }}>
            One platform for attendance, timetables, fees, and analytics — loved by schools worldwide.
          </p>
        </div>

        {/* floating feature stat cards */}
        <div className="relative z-10 flex-1">
          <div className="absolute top-[6%] right-[8%] w-44 glass-light rounded-2xl p-4 shadow-2xl" style={{ animation: "floatCardA 9s ease-in-out infinite" }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-xs">Attendance</p>
                <p className="text-white font-extrabold text-2xl">96%</p>
              </div>
              <div className="h-12 w-12 rounded-full grid place-items-center" style={{ background: "conic-gradient(#34d399 96%, rgba(255,255,255,0.25) 0)" }}>
                <div className="h-8 w-8 rounded-full bg-black/20 grid place-items-center"><CalendarCheck className="h-4 w-4 text-white" /></div>
              </div>
            </div>
          </div>

          <div className="absolute top-[34%] left-[8%] w-52 glass-light rounded-2xl p-4 shadow-2xl" style={{ animation: "floatCardB 11s ease-in-out infinite", animationDelay: "0.6s" }}>
            <p className="text-white/80 text-xs flex items-center gap-1.5 mb-2"><CalendarDays className="h-3.5 w-3.5" />Today's Timetable</p>
            {["09:00 · Mathematics", "10:00 · Science", "11:15 · English"].map((t) => (
              <p key={t} className="text-white text-[13px] font-medium leading-6">{t}</p>
            ))}
          </div>

          <div className="absolute top-[30%] right-[10%] w-40 glass-light rounded-2xl p-4 shadow-2xl" style={{ animation: "floatCardC 10s ease-in-out infinite", animationDelay: "1.1s" }}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/15 grid place-items-center"><Users className="h-5 w-5 text-white" /></div>
              <div>
                <p className="text-white/80 text-xs">Total Students</p>
                <p className="text-white font-extrabold text-xl">1,240</p>
              </div>
            </div>
          </div>

          <div className="absolute bottom-[22%] left-[14%] w-40 glass-light rounded-2xl p-4 shadow-2xl" style={{ animation: "floatCardA 12s ease-in-out infinite", animationDelay: "1.6s" }}>
            <p className="text-white/80 text-xs mb-2 flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5" />QR Attendance</p>
            <div className="grid grid-cols-4 gap-0.5 w-16">
              {Array.from({ length: 16 }).map((_, i) => <div key={i} className={`h-3 w-3 rounded-[2px] ${(i * 7) % 3 === 0 ? "bg-white" : "bg-white/25"}`} />)}
            </div>
          </div>

          <div className="absolute bottom-[24%] right-[12%] w-48 glass-light rounded-2xl p-4 shadow-2xl" style={{ animation: "floatCardB 10.5s ease-in-out infinite", animationDelay: "2.1s" }}>
            <p className="text-white/80 text-xs mb-2 flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Performance</p>
            <div className="flex items-end gap-1.5 h-14">
              {[40, 62, 50, 78, 66, 90].map((v, i) => (
                <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-amber-300 to-white/90" style={{ height: `${v}%` }} />
              ))}
            </div>
          </div>
        </div>

        {/* bottom stats bar */}
        <div className="relative z-10 grid grid-cols-4 gap-2 px-8 py-5 bg-black/20 backdrop-blur-md border-t border-white/10">
          {BOTTOM_STATS.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5 justify-center">
              <div className="h-9 w-9 rounded-xl bg-white/15 grid place-items-center shrink-0"><s.icon className="h-4.5 w-4.5 text-white" /></div>
              <div>
                <p className="text-white font-bold text-lg leading-none">{s.value}</p>
                <p className="text-white/70 text-[11px]">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- RIGHT PANEL ---------- */}
      <div className={`relative flex-1 flex items-center justify-center px-5 py-10 transition-colors duration-300 ${dark ? "bg-[#080b16]" : "bg-gradient-to-br from-violet-50 via-white to-orange-50"}`}>
        {/* mobile bg accent */}
        <div className="lg:hidden absolute inset-0 opacity-20 bg-center bg-cover" style={{ backgroundImage: `url(${BG})` }} />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={`relative w-full max-w-md rounded-[26px] border p-8 shadow-[0_30px_80px_-30px_rgba(76,29,149,0.5)] backdrop-blur-xl ${cardBg}`}>
          <div className="flex flex-col items-center mb-6">
            <div className="h-16 w-16 rounded-2xl bg-white p-2 shadow-md flex items-center justify-center mb-3 ring-1 ring-violet-100">
              <img src={LOGO} alt="EduSync" className="h-full w-full object-contain" />
            </div>
            <h2 className={`text-2xl font-extrabold font-heading ${txt}`}>{view === "login" ? "Welcome back" : "Create your institute"}</h2>
            <p className={`text-sm ${sub} mt-1`}>{view === "login" ? "Sign in to your EduSync workspace" : "Set up your workspace as Principal"}</p>
          </div>

          {view === "login" ? (
            <form onSubmit={doLogin} className="space-y-4">
              <div>
                <Label className={dark ? "text-slate-300" : "text-slate-700"}>{byCode ? "Institute Code / Student ID" : "Username or Email"}</Label>
                <Input data-testid="login-identifier" className={`mt-1.5 h-11 ${inputCls}`} placeholder={byCode ? "INST-1234 / STU25XXXXX" : "you@school.in / STU25XXXXX"}
                  value={li.identifier} onChange={(e) => setLi({ ...li, identifier: e.target.value })} required />
              </div>
              <div>
                <Label className={dark ? "text-slate-300" : "text-slate-700"}>Password</Label>
                <div className="relative mt-1.5">
                  <Input data-testid="login-password" type={showPw ? "text" : "password"} className={`h-11 pr-11 ${inputCls}`} placeholder="••••••••"
                    value={li.password} onChange={(e) => setLi({ ...li, password: e.target.value })} required />
                  <button type="button" data-testid="password-toggle" onClick={() => setShowPw((v) => !v)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 ${dark ? "text-slate-400" : "text-slate-400 hover:text-slate-600"}`}>
                    {showPw ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className={`flex items-center gap-2 cursor-pointer ${dark ? "text-slate-300" : "text-slate-600"}`}>
                  <input data-testid="remember-me" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                  Remember me
                </label>
                <button type="button" data-testid="forgot-password-link" onClick={() => setFp((s) => ({ ...s, open: true, step: 1 }))} className="font-medium text-violet-600 hover:text-violet-700">Forgot Password?</button>
              </div>
              <Button data-testid="login-submit" disabled={loading}
                className="group w-full h-12 text-white font-semibold border-0 rounded-xl shadow-[0_12px_30px_-10px_rgba(217,70,239,0.7)] hover:shadow-[0_16px_36px_-8px_rgba(251,146,60,0.7)] transition-all"
                style={{ backgroundImage: "linear-gradient(120deg,#7c3aed 0%,#a855f7 45%,#fb923c 100%)" }}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex items-center justify-center gap-2">Sign In <ArrowRight className="h-4.5 w-4.5 group-hover:translate-x-1 transition-transform" /></span>}
              </Button>

              <div className="relative py-1">
                <div className={`h-px ${dark ? "bg-white/10" : "bg-slate-200"}`} />
                <span className={`absolute left-1/2 -translate-x-1/2 -top-2.5 px-2 text-[11px] ${dark ? "bg-[#111528] text-slate-500" : "bg-white text-slate-400"}`}>or</span>
              </div>
              <Button type="button" data-testid="institute-code-btn" variant="outline" onClick={() => setByCode((v) => !v)}
                className={`w-full h-11 rounded-xl font-medium ${dark ? "border-white/15 text-slate-200 hover:bg-white/5 bg-transparent" : "border-violet-200 text-violet-700 hover:bg-violet-50"}`}>
                <KeyRound className="h-4 w-4 mr-2" />{byCode ? "Use Email instead" : "Login with Institute Code"}
              </Button>

              <p className={`text-center text-sm ${sub}`}>New institute?{" "}
                <button type="button" data-testid="tab-register" onClick={() => setView("register")} className="font-semibold text-violet-600 hover:text-violet-700">Create workspace</button>
              </p>
            </form>
          ) : (
            <form onSubmit={doRegister} className="space-y-3.5">
              <div><Label className={dark ? "text-slate-300" : "text-slate-700"}>Institute Name</Label><Input data-testid="reg-institute" className={`mt-1.5 h-11 ${inputCls}`} value={reg.institute_name} onChange={(e) => setReg({ ...reg, institute_name: e.target.value })} required /></div>
              <div><Label className={dark ? "text-slate-300" : "text-slate-700"}>Your Name (Principal)</Label><Input data-testid="reg-name" className={`mt-1.5 h-11 ${inputCls}`} value={reg.principal_name} onChange={(e) => setReg({ ...reg, principal_name: e.target.value })} required /></div>
              <div><Label className={dark ? "text-slate-300" : "text-slate-700"}>Email</Label><Input data-testid="reg-email" type="email" className={`mt-1.5 h-11 ${inputCls}`} value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} required /></div>
              <div><Label className={dark ? "text-slate-300" : "text-slate-700"}>Password</Label><Input data-testid="reg-password" type="password" className={`mt-1.5 h-11 ${inputCls}`} value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} required /></div>
              <Button data-testid="reg-submit" disabled={loading}
                className="group w-full h-12 text-white font-semibold border-0 rounded-xl shadow-[0_12px_30px_-10px_rgba(217,70,239,0.7)] hover:shadow-[0_16px_36px_-8px_rgba(251,146,60,0.7)] transition-all"
                style={{ backgroundImage: "linear-gradient(120deg,#7c3aed 0%,#a855f7 45%,#fb923c 100%)" }}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex items-center justify-center gap-2">Create Institute <ArrowRight className="h-4.5 w-4.5 group-hover:translate-x-1 transition-transform" /></span>}
              </Button>
              <p className={`text-center text-sm ${sub}`}>Already have an account?{" "}
                <button type="button" data-testid="tab-login" onClick={() => setView("login")} className="font-semibold text-violet-600 hover:text-violet-700">Sign in</button>
              </p>
            </form>
          )}
        </motion.div>

        <div className="absolute bottom-4 left-0 right-0 text-center px-4">
          <p className={`text-[11px] ${dark ? "text-slate-500" : "text-slate-400"}`}>
            © 2026 EduSync · Privam Solutions ·{" "}
            <a data-testid="privacy-link" href="/privacy" className="underline hover:text-violet-600">Privacy Policy</a>
            {" · "}
            <a data-testid="terms-link" href="/terms" className="underline hover:text-violet-600">Terms of Service</a>
          </p>
        </div>
      </div>

      <Dialog open={fp.open} onOpenChange={(v) => setFp((s) => ({ ...s, open: v }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset your password</DialogTitle></DialogHeader>
          {fp.step === 1 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Enter your registered email and we'll send you a 6-digit OTP.</p>
              <div><Label>Email</Label><Input data-testid="fp-email" type="email" className="mt-1.5" value={fp.email} onChange={(e) => setFp({ ...fp, email: e.target.value })} /></div>
              <DialogFooter><Button data-testid="fp-send-otp" onClick={sendOtp} disabled={!fp.email || fp.loading} className="btn-gradient">{fp.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send OTP"}</Button></DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Enter the OTP sent to <b>{fp.email}</b> and your new password.</p>
              <div><Label>OTP</Label><Input data-testid="fp-otp" className="mt-1.5" value={fp.otp} onChange={(e) => setFp({ ...fp, otp: e.target.value })} placeholder="6-digit code" /></div>
              <div><Label>New Password</Label><Input data-testid="fp-newpass" type="password" className="mt-1.5" value={fp.new_password} onChange={(e) => setFp({ ...fp, new_password: e.target.value })} /></div>
              <DialogFooter><Button data-testid="fp-reset" onClick={doReset} disabled={!fp.otp || !fp.new_password || fp.loading} className="btn-gradient">{fp.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset Password"}</Button></DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
