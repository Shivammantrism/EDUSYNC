import { useEffect, useState } from "react";
import api, { formatErr, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty, StatusBadge, money } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Banknote, Plus, CheckCircle2, Download, SlidersHorizontal, Mail, Pencil, CalendarClock } from "lucide-react";

export default function Salary() {
  const { user, institute, refreshInstitute } = useAuth();
  const isPrincipal = user.role === "principal";
  const [salaries, setSalaries] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [open, setOpen] = useState(false);
  const [structOpen, setStructOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quota, setQuota] = useState(2);
  const [form, setForm] = useState({ teacher_id: "", month: new Date().toISOString().slice(0, 7) });
  const [struct, setStruct] = useState({ teacher_id: "", base: 30000, hra: 8000, allowances: 4000, deductions: 2000 });
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjust, setAdjust] = useState({ id: "", teacher_name: "", month: "", base: 0, hra: 0, allowances: 0, lwp_amount: 0, extra_deductions: 0, extra_allowance: 0, note: "" });

  const load = () => api.get("/salaries").then((r) => setSalaries(r.data));
  useEffect(() => { load(); if (isPrincipal) api.get("/teachers").then((r) => setTeachers(r.data)); }, []);
  useEffect(() => { if (institute?.leave_quota != null) setQuota(institute.leave_quota); }, [institute]);

  const saveQuota = async () => {
    try { await api.put("/institute", { leave_quota: Number(quota) }); toast.success(`Paid leave quota set to ${quota} days/month`); setQuotaOpen(false); refreshInstitute?.(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const create = async () => {
    try { await api.post("/salaries", form); toast.success("Draft salary generated with pay-cut calculation"); setOpen(false); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const saveStruct = async () => {
    try {
      await api.put(`/teachers/${struct.teacher_id}/salary-structure`, { base: Number(struct.base), hra: Number(struct.hra), allowances: Number(struct.allowances), deductions: Number(struct.deductions) });
      toast.success("Salary structure saved"); setStructOpen(false);
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const openAdjust = (s) => {
    setAdjust({ id: s.id, teacher_name: s.teacher_name, month: s.month, base: s.base || 0, hra: s.hra || 0, allowances: s.special ?? s.allowances ?? 0, lwp_amount: s.lwp_amount || 0, extra_deductions: s.extra_deductions || 0, extra_allowance: s.extra_allowance || 0, note: s.adjust_note || "" });
    setAdjustOpen(true);
  };
  const saveAdjust = async () => {
    try {
      const { data } = await api.patch(`/salaries/${adjust.id}`, { base: Number(adjust.base), hra: Number(adjust.hra), allowances: Number(adjust.allowances), lwp_amount: Number(adjust.lwp_amount), extra_deductions: Number(adjust.extra_deductions), extra_allowance: Number(adjust.extra_allowance), note: adjust.note });
      toast.success(`Adjusted · Net ${money(data.amount)}`); setAdjustOpen(false); load();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const pay = async (id) => {
    try { const { data } = await api.put(`/salaries/${id}/pay`); toast.success(`Approved & Paid · Slip ${data.slip_no}`); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const slip = (id) => { const token = localStorage.getItem("edusync_token"); fetch(`${API}/salaries/${id}/slip`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.blob()).then((b) => window.open(URL.createObjectURL(b))); };
  const emailSlip = async (id) => { try { const { data } = await api.post(`/salaries/${id}/email-slip`); toast.success(`Slip emailed to ${data.to}`); } catch (e) { toast.error(formatErr(e.response?.data?.detail)); } };

  if (!salaries) return <Loader />;
  return (
    <div>
      <PageHeader title={isPrincipal ? "Staff Salary" : "My Salary"} subtitle="Draft payroll → edit → Approve & Pay, with automatic leave pay-cut" actions={
        isPrincipal && (
          <div className="flex flex-wrap gap-2">
            <Dialog open={quotaOpen} onOpenChange={setQuotaOpen}>
              <DialogTrigger asChild><Button data-testid="leave-quota-btn" variant="outline"><CalendarClock className="h-4 w-4 mr-2" />Leave Policy</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Monthly Paid Leave Policy</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Paid Leave Quota (days / month)</Label><Input data-testid="leave-quota-input" type="number" min="0" value={quota} onChange={(e) => setQuota(e.target.value)} /></div>
                  <p className="text-xs text-slate-400">Leaves within the quota are paid. Excess leave is auto-deducted on the payslip as (Gross ÷ days-in-month) × excess days.</p>
                </div>
                <DialogFooter><Button data-testid="save-quota-btn" onClick={saveQuota} className="btn-gradient">Save Policy</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={structOpen} onOpenChange={setStructOpen}>
              <DialogTrigger asChild><Button data-testid="salary-structure-btn" variant="outline"><SlidersHorizontal className="h-4 w-4 mr-2" />Salary Structure</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Configure Salary Structure</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Teacher</Label>
                    <Select value={struct.teacher_id} onValueChange={(v) => { const t = teachers.find((x) => x.id === v); const c = t?.salary_components; setStruct({ teacher_id: v, base: c?.base ?? t?.monthly_salary ?? 30000, hra: c?.hra ?? 0, allowances: c?.allowances ?? 0, deductions: c?.deductions ?? 0 }); }}>
                      <SelectTrigger data-testid="struct-teacher"><SelectValue placeholder="Select teacher" /></SelectTrigger>
                      <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Base Pay (₹)</Label><Input data-testid="struct-base" type="number" value={struct.base} onChange={(e) => setStruct({ ...struct, base: e.target.value })} /></div>
                    <div><Label>HRA (₹)</Label><Input data-testid="struct-hra" type="number" value={struct.hra} onChange={(e) => setStruct({ ...struct, hra: e.target.value })} /></div>
                    <div><Label>Allowances (₹)</Label><Input data-testid="struct-allowances" type="number" value={struct.allowances} onChange={(e) => setStruct({ ...struct, allowances: e.target.value })} /></div>
                    <div><Label>Deductions (₹)</Label><Input data-testid="struct-deductions" type="number" value={struct.deductions} onChange={(e) => setStruct({ ...struct, deductions: e.target.value })} /></div>
                  </div>
                </div>
                <DialogFooter><Button data-testid="save-struct-btn" onClick={saveStruct} disabled={!struct.teacher_id} className="btn-gradient">Save Structure</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button data-testid="add-salary-btn" className="btn-gradient"><Plus className="h-4 w-4 mr-2" />Generate Salary</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Generate Monthly Salary</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Teacher</Label>
                    <Select value={form.teacher_id} onValueChange={(v) => setForm({ ...form, teacher_id: v })}>
                      <SelectTrigger data-testid="salary-teacher"><SelectValue placeholder="Select teacher" /></SelectTrigger>
                      <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Month</Label><Input data-testid="salary-month" type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></div>
                  <p className="text-xs text-slate-400">Generates a draft using the teacher's structure and deducts pay for leave beyond the monthly quota. You can edit it before Approve & Pay.</p>
                </div>
                <DialogFooter><Button data-testid="save-salary-btn" onClick={create} disabled={!form.teacher_id} className="btn-gradient">Generate Draft</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )
      } />
      <Card className="border-slate-200 card-premium">
        {salaries.length === 0 ? <Empty icon={Banknote} title="No salary records" /> : (
          <Table>
            <TableHeader><TableRow>{isPrincipal && <TableHead>Teacher</TableHead>}<TableHead>Month</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Pay Cut</TableHead><TableHead className="text-right">Net</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{salaries.map((s) => (
              <TableRow key={s.id} data-testid={`salary-row-${s.id}`}>
                {isPrincipal && <TableCell className="font-medium">{s.teacher_name}</TableCell>}
                <TableCell>{s.month}</TableCell>
                <TableCell className="text-right">{money(s.gross ?? s.amount)}</TableCell>
                <TableCell className="text-right text-red-600">{s.lwp_amount ? `${s.lwp_days ? s.lwp_days + "d · " : ""}${money(s.lwp_amount)}` : "—"}</TableCell>
                <TableCell className="text-right font-semibold">{money(s.amount)}</TableCell>
                <TableCell><StatusBadge status={s.status === "pending" ? "draft" : s.status} /></TableCell>
                <TableCell className="text-right space-x-2">
                  {s.status === "pending" && isPrincipal && <Button data-testid={`adjust-salary-${s.id}`} size="sm" variant="outline" onClick={() => openAdjust(s)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>}
                  {s.status === "pending" && isPrincipal && <Button data-testid={`pay-salary-${s.id}`} size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => pay(s.id)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve & Pay</Button>}
                  {s.status === "paid" && <Button data-testid={`slip-${s.id}`} size="sm" variant="outline" onClick={() => slip(s.id)}><Download className="h-3.5 w-3.5 mr-1" />Slip</Button>}
                  {s.status === "paid" && isPrincipal && <Button data-testid={`email-slip-${s.id}`} size="sm" variant="outline" onClick={() => emailSlip(s.id)}><Mail className="h-3.5 w-3.5 mr-1" />Email</Button>}
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Draft Slip{adjust.teacher_name ? ` — ${adjust.teacher_name}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-400">{adjust.month} · Edit base components, override the auto pay-cut, or add a bonus / one-off deduction. Net recalculates on save.</p>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Base (₹)</Label><Input data-testid="adjust-base" type="number" value={adjust.base} onChange={(e) => setAdjust({ ...adjust, base: e.target.value })} /></div>
              <div><Label>HRA (₹)</Label><Input data-testid="adjust-hra" type="number" value={adjust.hra} onChange={(e) => setAdjust({ ...adjust, hra: e.target.value })} /></div>
              <div><Label>Allowances (₹)</Label><Input data-testid="adjust-allowances" type="number" value={adjust.allowances} onChange={(e) => setAdjust({ ...adjust, allowances: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Pay Cut / LWP (₹)</Label><Input data-testid="adjust-lwp" type="number" value={adjust.lwp_amount} onChange={(e) => setAdjust({ ...adjust, lwp_amount: e.target.value })} /></div>
              <div><Label>Bonus (₹)</Label><Input data-testid="adjust-allowance" type="number" value={adjust.extra_allowance} onChange={(e) => setAdjust({ ...adjust, extra_allowance: e.target.value })} /></div>
              <div><Label>One-off Deduction (₹)</Label><Input data-testid="adjust-deduction" type="number" value={adjust.extra_deductions} onChange={(e) => setAdjust({ ...adjust, extra_deductions: e.target.value })} /></div>
            </div>
            <div><Label>Note (optional)</Label><Input data-testid="adjust-note" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} placeholder="e.g. Diwali bonus / advance recovery" /></div>
          </div>
          <DialogFooter><Button data-testid="save-adjust-btn" onClick={saveAdjust} className="btn-gradient">Save Draft</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
