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
import { Banknote, Plus, CheckCircle2, Download, SlidersHorizontal } from "lucide-react";

export default function Salary() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [salaries, setSalaries] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [open, setOpen] = useState(false);
  const [structOpen, setStructOpen] = useState(false);
  const [form, setForm] = useState({ teacher_id: "", month: new Date().toISOString().slice(0, 7) });
  const [struct, setStruct] = useState({ teacher_id: "", base: 30000, hra: 8000, allowances: 4000, deductions: 2000 });

  const load = () => api.get("/salaries").then((r) => setSalaries(r.data));
  useEffect(() => { load(); if (isPrincipal) api.get("/teachers").then((r) => setTeachers(r.data)); }, []);

  const create = async () => {
    try { await api.post("/salaries", form); toast.success("Salary generated with LWP calculation"); setOpen(false); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const saveStruct = async () => {
    try {
      await api.put(`/teachers/${struct.teacher_id}/salary-structure`, { base: Number(struct.base), hra: Number(struct.hra), allowances: Number(struct.allowances), deductions: Number(struct.deductions) });
      toast.success("Salary structure saved"); setStructOpen(false);
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const pay = async (id) => {
    try { const { data } = await api.put(`/salaries/${id}/pay`); toast.success(`Paid · Slip ${data.slip_no}`); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const slip = (id) => { const token = localStorage.getItem("edusync_token"); fetch(`${API}/salaries/${id}/slip`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.blob()).then((b) => window.open(URL.createObjectURL(b))); };

  if (!salaries) return <Loader />;
  return (
    <div>
      <PageHeader title={isPrincipal ? "Staff Salary" : "My Salary"} subtitle="Structured payroll with LWP & slips" actions={
        isPrincipal && (
          <div className="flex gap-2">
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
                  <p className="text-xs text-slate-400">LWP is auto-calculated on payslip: gross ÷ days-in-month × unapproved (rejected) leave days.</p>
                </div>
                <DialogFooter><Button data-testid="save-struct-btn" onClick={saveStruct} disabled={!struct.teacher_id} className="bg-blue-600 hover:bg-blue-700">Save Structure</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button data-testid="add-salary-btn" className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-2" />Generate Salary</Button></DialogTrigger>
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
                  <p className="text-xs text-slate-400">Uses the teacher's configured structure and deducts LWP for unapproved leaves in that month.</p>
                </div>
                <DialogFooter><Button data-testid="save-salary-btn" onClick={create} disabled={!form.teacher_id} className="bg-blue-600 hover:bg-blue-700">Generate</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )
      } />
      <Card className="border-slate-200 card-premium">
        {salaries.length === 0 ? <Empty icon={Banknote} title="No salary records" /> : (
          <Table>
            <TableHeader><TableRow>{isPrincipal && <TableHead>Teacher</TableHead>}<TableHead>Month</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">LWP</TableHead><TableHead className="text-right">Net</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{salaries.map((s) => (
              <TableRow key={s.id} data-testid={`salary-row-${s.id}`}>
                {isPrincipal && <TableCell className="font-medium">{s.teacher_name}</TableCell>}
                <TableCell>{s.month}</TableCell>
                <TableCell className="text-right">{money(s.gross ?? s.amount)}</TableCell>
                <TableCell className="text-right text-red-600">{s.lwp_days ? `${s.lwp_days}d · ${money(s.lwp_amount)}` : "—"}</TableCell>
                <TableCell className="text-right font-semibold">{money(s.amount)}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-right space-x-2">
                  {s.status === "pending" && isPrincipal && <Button data-testid={`pay-salary-${s.id}`} size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => pay(s.id)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Pay</Button>}
                  {s.status === "paid" && <Button data-testid={`slip-${s.id}`} size="sm" variant="outline" onClick={() => slip(s.id)}><Download className="h-3.5 w-3.5 mr-1" />Slip</Button>}
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
