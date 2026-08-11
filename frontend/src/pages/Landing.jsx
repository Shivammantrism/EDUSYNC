import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldCheck, Loader2, Sparkles } from "lucide-react";

export default function Landing() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [li, setLi] = useState({ identifier: "", password: "" });
  const [reg, setReg] = useState({ institute_name: "", principal_name: "", email: "", password: "", phone: "" });
  const [fp, setFp] = useState({ open: false, step: 1, email: "", otp: "", new_password: "", loading: false });

  const particles = useMemo(() => Array.from({ length: 22 }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 3 + Math.random() * 6,
    delay: Math.random() * 12,
    duration: 12 + Math.random() * 14,
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
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", li);
      login(data.access_token, data.user);
      toast.success(`Welcome back, ${data.user.name}`);
      navigate("/app/dashboard");
    } catch (err) { toast.error(formatErr(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  const doRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register-institute", reg);
      login(data.access_token, data.user);
      toast.success("Institute created! Welcome to EduSync.");
      navigate("/app/dashboard");
    } catch (err) { toast.error(formatErr(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#05060f] px-4 py-10">
      {/* base gradient */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(900px 700px at 15% 10%, rgba(56,89,255,0.18), transparent 55%), radial-gradient(900px 700px at 90% 100%, rgba(147,51,234,0.16), transparent 55%), #05060f" }} />
      {/* gradient orbs */}
      <div className="login-orb h-[26rem] w-[26rem] -top-24 -left-24 float" style={{ background: "radial-gradient(circle, #4f46e5, transparent 70%)", position: "absolute" }} />
      <div className="login-orb h-[24rem] w-[24rem] bottom-[-8rem] right-[-6rem] float" style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)", position: "absolute", animationDelay: "2s" }} />
      <div className="login-orb h-[20rem] w-[20rem] top-1/3 right-1/4 float" style={{ background: "radial-gradient(circle, #10b981, transparent 70%)", position: "absolute", animationDelay: "4s", opacity: 0.32 }} />
      {/* subtle grid */}
      <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      {/* logo watermark */}
      <img src="/edusync-watermark.png" alt="" aria-hidden="true"
        className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,110vw)] max-w-none opacity-[0.06] blur-[1px]" />
      {/* floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p) => (
          <span key={p.id} className="particle" style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }} />
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md">
        {/* brand */}
        <div className="flex flex-col items-center gap-3 mb-7">
          <div className="h-20 w-20 rounded-2xl bg-white/95 p-2.5 shadow-[0_0_40px_-6px_rgba(99,102,241,0.7)] flex items-center justify-center">
            <img src="/edusync-logo.png" alt="EduSync" className="h-full w-full object-contain" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-extrabold font-heading tracking-tight text-white">EduSync</h1>
            <p className="text-sm bg-gradient-to-r from-blue-300 via-indigo-300 to-purple-300 bg-clip-text text-transparent font-medium mt-0.5">Smarter Institutes. Brighter Futures.</p>
            <p className="text-[11px] text-slate-500 mt-1">by Privam Solutions</p>
          </div>
        </div>

        <div className="glow-border glass-card-dark rounded-3xl p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]">
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full mb-6 bg-white/5 border border-white/10">
              <TabsTrigger value="login" data-testid="tab-login" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400">Sign In</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400">New Institute</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <p className="text-xs text-slate-400 mb-5 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Principals & teachers use email · Students use their Student ID.</p>
              <form onSubmit={doLogin} className="space-y-4">
                <div>
                  <Label className="text-slate-300">Email or Student ID</Label>
                  <Input data-testid="login-identifier" className="input-dark mt-1.5 h-11" placeholder="you@school.in / STU25XXXXX" value={li.identifier}
                    onChange={(e) => setLi({ ...li, identifier: e.target.value })} required />
                </div>
                <div>
                  <Label className="text-slate-300">Password</Label>
                  <Input data-testid="login-password" className="input-dark mt-1.5 h-11" type="password" placeholder="••••••••" value={li.password}
                    onChange={(e) => setLi({ ...li, password: e.target.value })} required />
                </div>
                <div className="text-right -mt-1.5">
                  <button type="button" data-testid="forgot-password-link" onClick={() => setFp((s) => ({ ...s, open: true, step: 1 }))} className="text-xs font-medium text-indigo-300 hover:text-indigo-200">Forgot Password?</button>
                </div>
                <Button data-testid="login-submit" className="w-full h-11 bg-gradient-to-r from-indigo-500 via-blue-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-semibold shadow-[0_0_30px_-6px_rgba(99,102,241,0.8)]" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <p className="text-xs text-slate-400 mb-5">Set up your institute workspace as the Principal.</p>
              <form onSubmit={doRegister} className="space-y-3.5">
                <div><Label className="text-slate-300">Institute Name</Label><Input data-testid="reg-institute" className="input-dark mt-1.5 h-11" value={reg.institute_name} onChange={(e) => setReg({ ...reg, institute_name: e.target.value })} required /></div>
                <div><Label className="text-slate-300">Your Name (Principal)</Label><Input data-testid="reg-name" className="input-dark mt-1.5 h-11" value={reg.principal_name} onChange={(e) => setReg({ ...reg, principal_name: e.target.value })} required /></div>
                <div><Label className="text-slate-300">Email</Label><Input data-testid="reg-email" type="email" className="input-dark mt-1.5 h-11" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} required /></div>
                <div><Label className="text-slate-300">Password</Label><Input data-testid="reg-password" type="password" className="input-dark mt-1.5 h-11" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} required /></div>
                <Button data-testid="reg-submit" className="w-full h-11 bg-gradient-to-r from-indigo-500 via-blue-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-semibold shadow-[0_0_30px_-6px_rgba(99,102,241,0.8)]" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Institute"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <p className="relative text-[11px] text-slate-500 flex items-center justify-center gap-1.5 mt-6">
          <ShieldCheck className="h-3.5 w-3.5" /> A Privam Solutions product · Multi-institute SaaS
        </p>
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
