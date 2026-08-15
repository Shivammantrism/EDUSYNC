import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowRight, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";

const LOGO = "/edusync-watermark.png";
const BTN = "linear-gradient(120deg,#1e3a8a 0%,#0e7490 52%,#059669 100%)";

export default function Landing() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("login"); // login | otp
  const [mode, setMode] = useState("staff"); // staff | parent
  const [li, setLi] = useState({ identifier: "", password: "" });
  const [pl, setPl] = useState({ student_id: "", parent_email: "" });
  const [otp, setOtp] = useState("");
  const [hint, setHint] = useState("");
  const [fp, setFp] = useState({ open: false, step: 1, email: "", otp: "", new_password: "", loading: false });

  const finish = (data) => {
    login(data.access_token, data.user);
    toast.success(`Welcome back, ${data.user.name}`);
    navigate(data.user.role === "super_admin" ? "/super-admin" : "/app/dashboard");
  };

  const doLogin = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data } = await api.post("/auth/login", li);
      if (data.otp_required) { setHint(data.email_hint || ""); setStep("otp"); toast.success("We emailed you a 6-digit code."); }
      else finish(data);
    } catch (err) { toast.error(formatErr(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  const doVerify = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data } = await api.post("/auth/verify-otp", { identifier: li.identifier, otp });
      finish(data);
    } catch (err) { toast.error(formatErr(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  const doParentLogin = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data } = await api.post("/auth/parent-login", pl);
      if (data.otp_required) { setLi({ identifier: data.identifier, password: "" }); setHint(data.email_hint || ""); setStep("otp"); toast.success("We emailed you a 6-digit code."); }
    } catch (err) { toast.error(formatErr(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  const resend = async () => {
    try {
      if (li.identifier.startsWith("parent:")) await api.post("/auth/parent-login", pl);
      else await api.post("/auth/login", li);
      toast.success("A new code has been sent.");
    } catch (err) { toast.error(formatErr(err.response?.data?.detail)); }
  };

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

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center px-5 py-10 overflow-hidden"
      style={{ background: "linear-gradient(140deg,#0a1f4d 0%,#0b3b4a 48%,#064e3b 100%)" }}>
      <div className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full" style={{ background: "radial-gradient(circle, rgba(37,99,235,0.35), transparent 70%)" }} />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(16,185,129,0.30), transparent 70%)" }} />

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md rounded-[24px] border border-white/70 bg-white/95 backdrop-blur-xl p-8 shadow-[0_30px_80px_-30px_rgba(4,30,60,0.8)]">
        <div className="flex flex-col items-center mb-7">
          <div className="h-16 w-16 rounded-2xl bg-white p-2 shadow-md flex items-center justify-center mb-3 ring-1 ring-slate-100">
            <img src={LOGO} alt="EduSync" className="h-full w-full object-contain" />
          </div>
          <p className="text-xl font-extrabold font-heading text-slate-900 leading-none">EduSync</p>
          <p className="text-[11px] text-slate-400 mt-1">by Privam Solutions</p>
          <h2 className="text-2xl font-extrabold font-heading text-slate-900 mt-5">{step === "login" ? "Welcome back" : "Verify it's you"}</h2>
          <p className="text-sm text-slate-500 mt-1 text-center">{step === "login" ? "Sign in to your workspace" : `Enter the 6-digit code sent to ${hint}`}</p>
        </div>

        {step === "login" && mode === "parent" ? (
          <form onSubmit={doParentLogin} className="space-y-4" data-testid="parent-login-form">
            <div>
              <Label className="text-slate-700">Student ID</Label>
              <Input data-testid="parent-student-id" className="mt-1.5 h-11" placeholder="Your child's Student ID (e.g. DP20260001)"
                value={pl.student_id} onChange={(e) => setPl({ ...pl, student_id: e.target.value })} required />
            </div>
            <div>
              <Label className="text-slate-700">Parent Email</Label>
              <Input data-testid="parent-email" type="email" className="mt-1.5 h-11" placeholder="Email on file with the school"
                value={pl.parent_email} onChange={(e) => setPl({ ...pl, parent_email: e.target.value })} required />
            </div>
            <Button data-testid="parent-login-submit" disabled={loading}
              className="group w-full h-12 text-white font-semibold border-0 rounded-xl shadow-[0_14px_32px_-12px_rgba(6,78,59,0.8)] hover:brightness-110 transition-all"
              style={{ backgroundImage: BTN }}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex items-center justify-center gap-2">Send code <ArrowRight className="h-[18px] w-[18px] group-hover:translate-x-1 transition-transform" /></span>}
            </Button>
            <p className="text-center text-xs text-slate-400">Read-only access to your child's attendance, marks, fees & receipts.</p>
            <button type="button" data-testid="switch-to-staff" onClick={() => setMode("staff")} className="w-full text-center text-sm font-medium text-blue-700 hover:text-emerald-700 pt-1">← Staff / Student login</button>
          </form>
        ) : step === "login" ? (
          <form onSubmit={doLogin} className="space-y-4">
            <div>
              <Label className="text-slate-700">Email or Student ID</Label>
              <Input data-testid="login-identifier" className="mt-1.5 h-11" placeholder="Enter your email or Student ID"
                value={li.identifier} onChange={(e) => setLi({ ...li, identifier: e.target.value })} required />
            </div>
            <div>
              <Label className="text-slate-700">Password</Label>
              <div className="relative mt-1.5">
                <Input data-testid="login-password" type={showPw ? "text" : "password"} className="h-11 pr-11" placeholder="Enter your password"
                  value={li.password} onChange={(e) => setLi({ ...li, password: e.target.value })} required />
                <button type="button" data-testid="password-toggle" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end text-sm">
              <button type="button" data-testid="forgot-password-link" onClick={() => setFp((s) => ({ ...s, open: true, step: 1 }))} className="font-medium text-blue-700 hover:text-emerald-700">Forgot password?</button>
            </div>
            <Button data-testid="login-submit" disabled={loading}
              className="group w-full h-12 text-white font-semibold border-0 rounded-xl shadow-[0_14px_32px_-12px_rgba(6,78,59,0.8)] hover:brightness-110 transition-all"
              style={{ backgroundImage: BTN }}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex items-center justify-center gap-2">Continue <ArrowRight className="h-[18px] w-[18px] group-hover:translate-x-1 transition-transform" /></span>}
            </Button>
            <button type="button" data-testid="switch-to-parent" onClick={() => setMode("parent")} className="w-full text-center text-sm font-semibold text-blue-700 hover:text-emerald-700">Are you a parent? Sign in here →</button>
            <p className="text-center text-xs text-slate-400 pt-1">Access is by invitation. Accounts are provisioned by your institute administrator.</p>
          </form>
        ) : (
          <form onSubmit={doVerify} className="space-y-4">
            <div className="flex justify-center mb-1"><span className="h-12 w-12 rounded-full bg-blue-50 grid place-items-center"><ShieldCheck className="h-6 w-6 text-blue-600" /></span></div>
            <div>
              <Label className="text-slate-700">6-digit code</Label>
              <Input data-testid="otp-input" inputMode="numeric" maxLength={6} className="mt-1.5 h-12 text-center text-2xl font-bold tracking-[0.5em]"
                placeholder="______" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required autoFocus />
            </div>
            <Button data-testid="verify-otp-submit" disabled={loading || otp.length !== 6}
              className="w-full h-12 text-white font-semibold border-0 rounded-xl hover:brightness-110 transition-all" style={{ backgroundImage: BTN }}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify & Sign In"}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" data-testid="otp-back" onClick={() => { setStep("login"); setOtp(""); }} className="flex items-center gap-1 text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" />Back</button>
              <button type="button" data-testid="otp-resend" onClick={resend} className="font-medium text-blue-700 hover:text-emerald-700">Resend code</button>
            </div>
          </form>
        )}

        <p className="text-center text-[11px] text-slate-400 mt-7">
          © 2026 EduSync · Privam Solutions ·{" "}
          <a data-testid="privacy-link" href="/privacy" className="underline hover:text-emerald-700">Privacy Policy</a>
          {" · "}
          <a data-testid="terms-link" href="/terms" className="underline hover:text-emerald-700">Terms of Service</a>
        </p>
        <div data-testid="grievance-officer" className="mt-3 text-center text-[11px] leading-relaxed text-slate-400 border-t border-slate-100 pt-3">
          <p className="font-semibold text-slate-500">Grievance Officer (DPDP Act, 2023)</p>
          <p>Shivam Mantri · <a href="mailto:founder@privamsolutions.in" className="underline hover:text-emerald-700">founder@privamsolutions.in</a></p>
        </div>
      </motion.div>

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
