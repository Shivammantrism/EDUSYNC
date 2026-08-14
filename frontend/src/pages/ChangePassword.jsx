import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Loader2, KeyRound, LogOut } from "lucide-react";

export default function ChangePassword() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const forced = !!user?.must_change_password;
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.new_password.length < 6) return toast.error("New password must be at least 6 characters");
    if (form.new_password !== form.confirm) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: form.current_password, new_password: form.new_password });
      toast.success("Password updated successfully");
      const { data } = await api.get("/auth/me");
      setUser(data);
      navigate("/app/dashboard");
    } catch (err) { toast.error(formatErr(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4" data-testid="change-password-page">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <span className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-600 grid place-items-center mb-3"><ShieldCheck className="h-7 w-7 text-white" /></span>
          <h1 className="text-2xl font-extrabold font-heading text-slate-900">{forced ? "Set a new password" : "Change Password"}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {forced ? "You're using a temporary password. Please choose a new password to continue." : "Update your account password. You'll stay signed in."}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>{forced ? "Temporary password (optional)" : "Current password"}</Label>
            <Input data-testid="cp-current" type="password" className="mt-1.5" placeholder={forced ? "Enter the temporary password you received" : "Enter current password"}
              value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} required={!forced} />
          </div>
          <div>
            <Label>New password</Label>
            <Input data-testid="cp-new" type="password" className="mt-1.5" placeholder="At least 6 characters"
              value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} required />
          </div>
          <div>
            <Label>Confirm new password</Label>
            <Input data-testid="cp-confirm" type="password" className="mt-1.5" placeholder="Re-enter new password"
              value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
          </div>
          <Button data-testid="cp-submit" disabled={loading} className="w-full h-11 btn-gradient">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Update Password</span>}
          </Button>
          {forced && (
            <button type="button" data-testid="cp-logout" onClick={() => { logout(); navigate("/"); }}
              className="w-full text-center text-sm text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1.5 pt-1">
              <LogOut className="h-3.5 w-3.5" />Sign out instead
            </button>
          )}
        </form>
      </Card>
    </div>
  );
}
