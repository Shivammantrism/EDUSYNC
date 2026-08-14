import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, LogOut, Power, Trash2, UserPlus, Loader2, Building2, KeyRound } from "lucide-react";

export default function SuperAdmin() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [institutes, setInstitutes] = useState(null);
  const [users, setUsers] = useState({ staff: [], students: [] });
  const [sel, setSel] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "teacher", institute_id: "" });

  const loadInst = () => api.get("/super-admin/institutes").then((r) => setInstitutes(r.data)).catch((e) => toast.error(formatErr(e.response?.data?.detail)));
  const loadUsers = (iid) => api.get("/super-admin/users", { params: iid ? { institute_id: iid } : {} }).then((r) => setUsers(r.data));

  useEffect(() => { loadInst(); loadUsers(); }, []);
  useEffect(() => { loadUsers(sel); }, [sel]);

  const toggleInst = async (i) => {
    const next = i.status === "inactive" ? "active" : "inactive";
    try { await api.put(`/super-admin/institutes/${i.id}/status`, { status: next }); toast.success(`Institute ${next}`); loadInst(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const toggleUser = async (u) => {
    const next = u.status === "inactive" ? "active" : "inactive";
    try { await api.put(`/super-admin/users/${u.id}/status`, { status: next }); toast.success(`User ${next}`); loadUsers(sel); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const delUser = async (u) => {
    if (!window.confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try { await api.delete(`/super-admin/users/${u.id}`); toast.success("Deleted"); loadUsers(sel); loadInst(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const resetPw = async (u) => {
    const pw = window.prompt(`New password for ${u.name}:`);
    if (!pw) return;
    try { await api.put(`/super-admin/users/${u.id}`, { password: pw, role: u.role }); toast.success("Password updated"); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const addUser = async () => {
    try { await api.post("/super-admin/users", form); toast.success("Credential created"); setAddOpen(false); setForm({ name: "", email: "", password: "", role: "teacher", institute_id: "" }); loadUsers(sel); loadInst(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const Badge = ({ s }) => (
    <span data-testid="status-badge" className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s === "inactive" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{s === "inactive" ? "Inactive" : "Active"}</span>
  );

  if (institutes === null) return <div className="min-h-screen grid place-items-center bg-slate-900"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg,#0b1e3b,#141d47 60%,#1a1240)" }} data-testid="super-admin-page">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3 text-white">
          <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 grid place-items-center"><ShieldCheck className="h-5 w-5" /></span>
          <div><p className="font-heading font-bold text-lg leading-none">EduSync Super Admin</p><p className="text-xs text-blue-300/70 mt-0.5">{user?.email}</p></div>
        </div>
        <Button data-testid="sa-logout" variant="ghost" className="text-red-300 hover:text-red-200 hover:bg-red-500/10" onClick={() => { logout(); navigate("/"); }}><LogOut className="h-4 w-4 mr-2" />Logout</Button>
      </header>

      <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2 text-white/90 font-semibold"><Building2 className="h-4 w-4" />Institutes ({institutes.length})</div>
          {institutes.map((i) => (
            <Card key={i.id} data-testid={`inst-${i.id}`} onClick={() => setSel(sel === i.id ? null : i.id)}
              className={`p-4 cursor-pointer border transition-colors ${sel === i.id ? "border-emerald-400 bg-white" : "bg-white/95 hover:bg-white"}`}>
              <div className="flex items-center justify-between">
                <div><p className="font-semibold text-slate-800">{i.name}</p><p className="text-xs text-slate-500">{i.user_count} staff · {i.student_count} students · code {i.code}</p></div>
                <div className="flex items-center gap-2"><Badge s={i.status} />
                  <button data-testid={`toggle-inst-${i.id}`} onClick={(e) => { e.stopPropagation(); toggleInst(i); }} title="Activate / Deactivate"
                    className={`h-8 w-8 rounded-lg grid place-items-center ${i.status === "inactive" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}><Power className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-white/90 font-semibold">{sel ? "Institute users" : "All users"} ({users.staff.length + users.students.length})</div>
            <Button data-testid="sa-add-user" size="sm" className="btn-gradient" onClick={() => { setForm((f) => ({ ...f, institute_id: sel || "" })); setAddOpen(true); }}><UserPlus className="h-4 w-4 mr-2" />Add Credential</Button>
          </div>
          <Card className="bg-white/95 divide-y divide-slate-100">
            {[...users.staff, ...users.students].length === 0 ? <p className="p-6 text-sm text-slate-400 text-center">No users</p> :
              [...users.staff, ...users.students].map((u) => (
                <div key={u.id} data-testid={`sa-user-${u.id}`} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{u.name} <span className="text-xs font-normal text-slate-400">· {u.role}</span></p>
                    <p className="text-xs text-slate-500 truncate">{u.email || u.student_id || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge s={u.status} />
                    <button data-testid={`sa-reset-${u.id}`} onClick={() => resetPw(u)} title="Reset password" className="text-slate-300 hover:text-blue-600"><KeyRound className="h-4 w-4" /></button>
                    <button data-testid={`sa-toggle-${u.id}`} onClick={() => toggleUser(u)} title="Activate / Deactivate" className={u.status === "inactive" ? "text-emerald-500" : "text-amber-500"}><Power className="h-4 w-4" /></button>
                    <button data-testid={`sa-del-${u.id}`} onClick={() => delUser(u)} title="Delete" className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
          </Card>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent data-testid="sa-add-dialog">
          <DialogHeader><DialogTitle>Add Login Credential</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input data-testid="sa-form-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Email</Label><Input data-testid="sa-form-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Temporary Password</Label><Input data-testid="sa-form-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to auto-generate" /></div>
            <div><Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="sa-form-role"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="principal">Principal</SelectItem><SelectItem value="teacher">Teacher</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Institute</Label>
              <Select value={form.institute_id} onValueChange={(v) => setForm({ ...form, institute_id: v })}>
                <SelectTrigger data-testid="sa-form-inst"><SelectValue placeholder="Select institute" /></SelectTrigger>
                <SelectContent>{institutes.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button data-testid="sa-save-user" className="btn-gradient" onClick={addUser} disabled={!form.name || !form.email}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
