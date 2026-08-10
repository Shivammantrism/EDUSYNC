import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap, ShieldCheck, QrCode, Wallet, BarChart3, Users, Loader2 } from "lucide-react";

export default function Landing() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [li, setLi] = useState({ identifier: "", password: "" });
  const [reg, setReg] = useState({ institute_name: "", principal_name: "", email: "", password: "", phone: "" });

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

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 text-white overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-10 -left-10 h-56 w-56 rounded-full bg-indigo-400/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <GraduationCap className="h-7 w-7" />
            </div>
            <div>
              <p className="text-2xl font-bold font-heading">EduSync</p>
              <p className="text-blue-200 text-sm">Smarter Institutes. Better Tomorrow.</p>
            </div>
          </div>
        </div>
        <div className="relative space-y-8">
          <h2 className="text-4xl font-bold font-heading leading-tight">One platform to run<br />your entire institute.</h2>
          <div className="grid grid-cols-2 gap-5">
            {features.map(([Icon, t, d]) => (
              <div key={t} className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10">
                <Icon className="h-6 w-6 mb-2 text-blue-100" />
                <p className="font-semibold text-sm">{t}</p>
                <p className="text-xs text-blue-200 mt-1 leading-snug">{d}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-blue-200 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> A Privam Solutions product · Multi-institute SaaS
        </p>
      </div>

      {/* Right auth panel */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center"><GraduationCap className="h-5 w-5 text-white" /></div>
            <p className="font-bold text-xl font-heading">EduSync</p>
          </div>
          <Card className="p-8 border-slate-200 shadow-sm">
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
                    <Input data-testid="login-identifier" className="mt-1.5" placeholder="you@school.in / STU25XXXXX" value={li.identifier}
                      onChange={(e) => setLi({ ...li, identifier: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input data-testid="login-password" className="mt-1.5" type="password" placeholder="••••••••" value={li.password}
                      onChange={(e) => setLi({ ...li, password: e.target.value })} required />
                  </div>
                  <Button data-testid="login-submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
                  </Button>
                </form>
                <div className="mt-5 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <p className="font-semibold text-slate-600">Demo credentials</p>
                  <p>Principal: <span className="font-mono">mantri.shivam111@gmail.com</span> / Admin@123</p>
                  <p>Teacher: <span className="font-mono">teacher1@edusync.in</span> / teacher123</p>
                </div>
              </TabsContent>

              <TabsContent value="register">
                <h1 className="text-2xl font-bold font-heading mb-1">Create your institute</h1>
                <p className="text-sm text-slate-500 mb-6">Set up your workspace as the Principal.</p>
                <form onSubmit={doRegister} className="space-y-3.5">
                  <div><Label>Institute Name</Label><Input data-testid="reg-institute" className="mt-1.5" value={reg.institute_name} onChange={(e) => setReg({ ...reg, institute_name: e.target.value })} required /></div>
                  <div><Label>Your Name (Principal)</Label><Input data-testid="reg-name" className="mt-1.5" value={reg.principal_name} onChange={(e) => setReg({ ...reg, principal_name: e.target.value })} required /></div>
                  <div><Label>Email</Label><Input data-testid="reg-email" type="email" className="mt-1.5" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} required /></div>
                  <div><Label>Password</Label><Input data-testid="reg-password" type="password" className="mt-1.5" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} required /></div>
                  <Button data-testid="reg-submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Institute"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}
