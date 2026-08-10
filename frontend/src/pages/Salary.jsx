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
import { Banknote, Plus, CheckCircle2, Download } from "lucide-react";

export default function Salary() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [salaries, setSalaries] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ teacher_id: "", month: new Date().toISOString().slice(0, 7), amount: 30000 });

  const load = () => api.get("/salaries").then((r) => setSalaries(r.data));
  useEffect(() => { load(); if (isPrincipal) api.get("/teachers").then((r) => setTeachers(r.data)); }, []);

  const create = async () => {
    try { await api.post("/salaries", { ...form, amount: Number(form.amount) }); toast.success("Salary record created"); setOpen(false); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const pay = async (id) => {
    try { const { data } = await api.put(`/salaries/${id}/pay`); toast.success(`Paid · Slip ${data.slip_no}`); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const slip = (id) => { const token = localStorage.getItem("edusync_token"); fetch(`${API}/salaries/${id}/slip`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.blob()).then((b) => window.open(URL.createObjectURL(b))); };

  if (!salaries) return <Loader />;
  return (
    <div>
      <PageHeader title={isPrincipal ? "Staff Salary" : "My Salary"} subtitle="Monthly payroll & slips" actions={
        isPrincipal && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-salary-btn" className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-2" />Add Salary</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Salary Record</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Teacher</Label>
                  <Select value={form.teacher_id} onValueChange={(v) => { const t = teachers.find((x) => x.id === v); setForm({ ...form, teacher_id: v, amount: t?.monthly_salary || 30000 }); }}>
                    <SelectTrigger data-testid="salary-teacher"><SelectValue placeholder="Select teacher" /></SelectTrigger>
                    <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Month</Label><Input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></div>
                  <div><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                </div>
              </div>
              <DialogFooter><Button data-testid="save-salary-btn" onClick={create} disabled={!form.teacher_id} className="bg-blue-600 hover:bg-blue-700">Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />
      <Card className="border-slate-200">
        {salaries.length === 0 ? <Empty icon={Banknote} title="No salary records" /> : (
          <Table>
            <TableHeader><TableRow>{isPrincipal && <TableHead>Teacher</TableHead>}<TableHead>Month</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{salaries.map((s) => (
              <TableRow key={s.id} data-testid={`salary-row-${s.id}`}>
                {isPrincipal && <TableCell className="font-medium">{s.teacher_name}</TableCell>}
                <TableCell>{s.month}</TableCell><TableCell className="text-right font-semibold">{money(s.amount)}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-right space-x-2">
                  {s.status === "pending" && isPrincipal && <Button data-testid={`pay-salary-${s.id}`} size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => pay(s.id)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Mark Paid</Button>}
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
