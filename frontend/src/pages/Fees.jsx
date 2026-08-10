import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
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
import { Wallet, Plus, Bell, CheckCircle2, CreditCard, Loader2 } from "lucide-react";

function loadRzp() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function Fees() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [fees, setFees] = useState(null);
  const [students, setStudents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ student_id: "", amount: 2000, month: new Date().toISOString().slice(0, 7), due_date: new Date().toISOString().slice(0, 10) });
  const [paying, setPaying] = useState(null);

  const load = () => api.get("/fees").then((r) => setFees(r.data));
  useEffect(() => { load(); if (isPrincipal) api.get("/students").then((r) => setStudents(r.data)); }, []);

  const createFee = async () => {
    try { await api.post("/fees", { ...form, amount: Number(form.amount) }); toast.success("Fee record created"); setOpen(false); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const markPaid = async (id) => { await api.post(`/fees/${id}/mark-paid`); toast.success("Marked as paid"); load(); };
  const remind = async (id) => { const { data } = await api.post(`/fees/${id}/reminder`); toast.success(data.message); };

  const payOnline = async (fee) => {
    setPaying(fee.id);
    const ok = await loadRzp();
    if (!ok) { toast.error("Could not load Razorpay"); setPaying(null); return; }
    try {
      const { data } = await api.post("/fees/razorpay/order", { fee_id: fee.id });
      const rzp = new window.Razorpay({
        key: data.key_id, amount: data.amount, currency: "INR", order_id: data.order_id,
        name: user.institute_name, description: `Fee ${fee.month}`,
        prefill: { name: data.student_name, contact: data.prefill_contact },
        theme: { color: "#2563eb" },
        handler: async (resp) => {
          try {
            const { data: v } = await api.post("/fees/razorpay/verify", { fee_id: fee.id, ...resp });
            toast.success(`Payment successful! Receipt ${v.receipt_no}`); load();
          } catch (e) { toast.error("Verification failed"); }
        },
        modal: { ondismiss: () => setPaying(null) },
      });
      rzp.open();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    finally { setPaying(null); }
  };

  if (!fees) return <Loader />;
  const pending = fees.filter((f) => f.status === "pending");
  const totalPending = pending.reduce((a, f) => a + f.amount, 0);

  return (
    <div>
      <PageHeader title={isPrincipal ? "Fee Management" : "Fees & Receipts"} subtitle={`${money(totalPending)} pending across ${pending.length} records`} actions={
        isPrincipal && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-fee-btn" className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-2" />Add Fee</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Fee Record</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Student</Label>
                  <Select value={form.student_id} onValueChange={(v) => { const st = students.find((s) => s.id === v); setForm({ ...form, student_id: v, amount: st?.monthly_fee || 2000 }); }}>
                    <SelectTrigger data-testid="fee-student"><SelectValue placeholder="Select student" /></SelectTrigger>
                    <SelectContent>{students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.student_id})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                  <div><Label>Month</Label><Input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></div>
                </div>
                <div><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              </div>
              <DialogFooter><Button data-testid="save-fee-btn" onClick={createFee} disabled={!form.student_id} className="bg-blue-600 hover:bg-blue-700">Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />

      <Card className="border-slate-200">
        {fees.length === 0 ? <Empty icon={Wallet} title="No fee records" /> : (
          <Table>
            <TableHeader><TableRow>
              {isPrincipal && <TableHead>Student</TableHead>}
              <TableHead>Month</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead><TableHead>Receipt</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {fees.map((f) => (
                <TableRow key={f.id} data-testid={`fee-row-${f.id}`}>
                  {isPrincipal && <TableCell className="font-medium">{f.student_name}</TableCell>}
                  <TableCell>{f.month}</TableCell>
                  <TableCell className="text-slate-500">{f.due_date}</TableCell>
                  <TableCell className="text-right font-semibold">₹{f.amount}</TableCell>
                  <TableCell><StatusBadge status={f.status} /></TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">{f.receipt_no || "—"}</TableCell>
                  <TableCell className="text-right">
                    {f.status === "pending" ? (
                      isPrincipal ? (
                        <div className="flex justify-end gap-2">
                          <Button data-testid={`remind-${f.id}`} size="sm" variant="outline" onClick={() => remind(f.id)}><Bell className="h-3.5 w-3.5 mr-1" />Remind</Button>
                          <Button data-testid={`markpaid-${f.id}`} size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markPaid(f.id)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Paid</Button>
                        </div>
                      ) : (
                        <Button data-testid={`pay-${f.id}`} size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => payOnline(f)} disabled={paying === f.id}>
                          {paying === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CreditCard className="h-3.5 w-3.5 mr-1" />Pay via UPI</>}
                        </Button>
                      )
                    ) : <span className="text-xs text-emerald-600 font-medium">Paid ✓</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
