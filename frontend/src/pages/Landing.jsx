import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap, ShieldCheck, QrCode, Wallet, BarChart3, Users, Loader2, Sparkles } from "lucide-react";

export default function Landing() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [li, setLi] = useState({ identifier: "", password: "" });
  const [reg, setReg] = useState({ institute_name: "", principal_name: "", email: "", password: "", phone: "" });
  const [fp, setFp] = useState({ open: false, step: 1, email: "", otp: "", new_password: "", loading: false });

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

  const features = [
    [QrCode, "QR Attendance", "Scan student ID cards to mark attendance instantly."],
    [Wallet, "UPI Fee Collection", "Razorpay payments, digital receipts & auto reminders."],
    [BarChart3, "Live Dashboards", "Real-time insights on students, fees & staff."],
    [Users, "Multi-Portal", "Separate workspaces for principals, teachers & students."],
  ];

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };
  const item = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } } };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Hero panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 xl:p-16 text-white overflow-hidden bg-[#0b1e5b]">
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(700px 500px at 90% 0%, rgba(59,130,246,0.55), transparent 60%), radial-gradient(700px 600px at -10% 100%, rgba(99,102,241,0.5), transparent 55%), linear-gradient(160deg, #0b1e5b, #1e3a8a 55%, #3730a3)" }} />
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-blue-400/20 blur-3xl float" />
        <div className="absolute bottom-8 -left-16 h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl float" style={{ animationDelay: "1.5s" }} />
        {/* subtle grid */}
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "44px 44px" }} />

        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative flex items-center gap-3">
          <div className="h-14 w-14 rounded-2xl glass-dark border border-white/20 flex items-center justify-center shadow-xl">
            <GraduationCap className="h-8 w-8" />
          </div>
          <div>
            <p className="text-3xl font-extrabold font-heading tracking-tight">EduSync</p>
            <p className="text-blue-200 text-sm">Smarter Institutes. Better Tomorrow.</p>
          </div>
        </motion.div>

        <motion.div variants={container} initial="hidden" animate="show" className="relative space-y-9">
          <motion.div variants={item} className="space-y-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full glass-dark border border-white/15 text-blue-100">
              <Sparkles className="h-3.5 w-3.5" /> Enterprise-grade School ERP
            </span>
            <h2 className="text-4xl xl:text-5xl font-extrabold font-heading leading-[1.1]">One platform to run<br />your entire institute.</h2>
            <p className="text-blue-200/90 text-base max-w-md">Admissions to attendance, fees to results — manage every classroom operation from a single beautiful dashboard.</p>
          </motion.div>
          <motion.div variants={container} className="grid grid-cols-2 gap-4 max-w-xl">
            {features.map(([Icon, t, d]) => (
              <motion.div key={t} variants={item} className="glass-dark rounded-2xl p-5 border border-white/12 hover:border-white/25 transition-colors">
                <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center mb-3"><Icon className="h-5 w-5 text-blue-50" /></div>
                <p className="font-semibold text-sm">{t}</p>
                <p className="text-xs text-blue-200/80 mt-1 leading-snug">{d}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <p className="relative text-xs text-blue-200/80 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> A Privam Solutions product · Multi-institute SaaS
        </p>
      </div>

      {/* Auth panel */}
      <div className="flex items-center justify-center p-6 sm:p-12 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-blue-50/60" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-md relative">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/30"><GraduationCap className="h-6 w-6 text-white" /></div>
            <div><p className="font-extrabold text-2xl font-heading leading-none">EduSync</p><p className="text-[10px] text-slate-400">by Privam Solutions</p></div>
          </div>
          <Card className="p-8 border-slate-200/70 shadow-2xl shadow-blue-900/5 rounded-3xl glass">
            <Tabs defaultValue="login">
              <TabsList className="grid grid-cols-2 w-full mb-6">
                <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">New Institute</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <h1 className="text-2xl font-bold font-heading mb-1">Welcome back</h1>
                <p className="text-sm text-slate-500 mb-6">Principals & teachers use email. Students use their Student ID.</p>
                <form onSubmit={doLogin} className="space-y-4">
                  <div>
                    <Label>Email or Student ID</Label>
                    <Input data-testid="login-identifier" className="mt-1.5 h-11" placeholder="you@school.in / STU25XXXXX" value={li.identifier}
                      onChange={(e) => setLi({ ...li, identifier: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input data-testid="login-password" className="mt-1.5 h-11" type="password" placeholder="••••••••" value={li.password}
                      onChange={(e) => setLi({ ...li, password: e.target.value })} required />
                  </div>
                  <div className="text-right -mt-1.5">
                    <button type="button" data-testid="forgot-password-link" onClick={() => setFp((s) => ({ ...s, open: true, step: 1 }))} className="text-xs font-medium text-blue-600 hover:text-blue-700">Forgot Password?</button>
                  </div>
                  <Button data-testid="login-submit" className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/25" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
                  </Button>
                </form>
                <div className="mt-5 text-xs text-slate-500 bg-blue-50/60 border border-blue-100 rounded-xl p-3 space-y-1">
                  <p className="font-semibold text-slate-600">Demo credentials</p>
                  <p>Principal: <span className="font-mono">mantri.shivam111@gmail.com</span> / Admin@123</p>
                  <p>Teacher: <span className="font-mono">teacher1@edusync.in</span> / teacher123</p>
                </div>
              </TabsContent>

              <TabsContent value="register">
                <h1 className="text-2xl font-bold font-heading mb-1">Create your institute</h1>
                <p className="text-sm text-slate-500 mb-6">Set up your workspace as the Principal.</p>
                <form onSubmit={doRegister} className="space-y-3.5">
                  <div><Label>Institute Name</Label><Input data-testid="reg-institute" className="mt-1.5 h-11" value={reg.institute_name} onChange={(e) => setReg({ ...reg, institute_name: e.target.value })} required /></div>
                  <div><Label>Your Name (Principal)</Label><Input data-testid="reg-name" className="mt-1.5 h-11" value={reg.principal_name} onChange={(e) => setReg({ ...reg, principal_name: e.target.value })} required /></div>
                  <div><Label>Email</Label><Input data-testid="reg-email" type="email" className="mt-1.5 h-11" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} required /></div>
                  <div><Label>Password</Label><Input data-testid="reg-password" type="password" className="mt-1.5 h-11" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} required /></div>
                  <Button data-testid="reg-submit" className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/25" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Institute"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </Card>
        </motion.div>

        <Dialog open={fp.open} onOpenChange={(v) => setFp((s) => ({ ...s, open: v }))}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reset your password</DialogTitle></DialogHeader>
            {fp.step === 1 ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Enter your registered email and we'll send you a 6-digit OTP.</p>
                <div><Label>Email</Label><Input data-testid="fp-email" type="email" className="mt-1.5" value={fp.email} onChange={(e) => setFp({ ...fp, email: e.target.value })} /></div>
                <DialogFooter><Button data-testid="fp-send-otp" onClick={sendOtp} disabled={!fp.email || fp.loading} className="bg-blue-600 hover:bg-blue-700">{fp.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send OTP"}</Button></DialogFooter>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Enter the OTP sent to <b>{fp.email}</b> and your new password.</p>
                <div><Label>OTP</Label><Input data-testid="fp-otp" className="mt-1.5" value={fp.otp} onChange={(e) => setFp({ ...fp, otp: e.target.value })} placeholder="6-digit code" /></div>
                <div><Label>New Password</Label><Input data-testid="fp-newpass" type="password" className="mt-1.5" value={fp.new_password} onChange={(e) => setFp({ ...fp, new_password: e.target.value })} /></div>
                <DialogFooter><Button data-testid="fp-reset" onClick={doReset} disabled={!fp.otp || !fp.new_password || fp.loading} className="bg-blue-600 hover:bg-blue-700">{fp.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset Password"}</Button></DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
