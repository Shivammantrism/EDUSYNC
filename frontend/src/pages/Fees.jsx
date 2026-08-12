import { useEffect, useState } from "react";
import api, { formatErr, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty, StatusBadge, money } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Wallet, Plus, Bell, CheckCircle2, CreditCard, Loader2, Settings2, Trash2, Download, BellRing, Mail, MessageCircle } from "lucide-react";

function loadRzp() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}
const downloadPdf = (path) => {
  const token = localStorage.getItem("edusync_token");
  fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.blob()).then((b) => window.open(URL.createObjectURL(b)));
};

export default function Fees() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [fees, setFees] = useState(null);
  const [students, setStudents] = useState([]);
  const [components, setComponents] = useState([]);
  const [open, setOpen] = useState(false);
  const [compOpen, setCompOpen] = useState(false);
  const [partial, setPartial] = useState(null);
  const [partialAmt, setPartialAmt] = useState("");
  const [form, setForm] = useState({ student_id: "", month: new Date().toISOString().slice(0, 7), due_date: new Date().toISOString().slice(0, 10), selected: {} });
  const [newComp, setNewComp] = useState({ name: "", amount: "" });
  const [paying, setPaying] = useState(null);
  const [stats, setStats] = useState(null);

  const load = () => api.get("/fees").then((r) => setFees(r.data));
  useEffect(() => {
    load();
    if (isPrincipal) { api.get("/students").then((r) => setStudents(r.data)); api.get("/fee-components").then((r) => setComponents(r.data)); api.get("/fees/stats").then((r) => setStats(r.data)).catch(() => {}); }
  }, []);

  const selectedItems = () => components.filter((c) => form.selected[c.id]).map((c) => ({ name: c.name, amount: c.amount }));
  const selectedTotal = selectedItems().reduce((a, i) => a + i.amount, 0);

  const createFee = async () => {
    const items = selectedItems();
    if (!items.length) return toast.error("Select at least one fee component");
    try { await api.post("/fees", { student_id: form.student_id, items, month: form.month, due_date: form.due_date }); toast.success("Fee created"); setOpen(false); setForm({ ...form, student_id: "", selected: {} }); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const addComp = async () => {
    if (!newComp.name || !newComp.amount) return;
    const { data } = await api.post("/fee-components", { name: newComp.name, amount: Number(newComp.amount) });
    setComponents([...components, data]); setNewComp({ name: "", amount: "" });
  };
  const delComp = async (id) => { await api.delete(`/fee-components/${id}`); setComponents(components.filter((c) => c.id !== id)); };
  const markPaid = async (id) => { await api.post(`/fees/${id}/mark-paid`); toast.success("Marked as paid"); load(); };
  const doPartial = async () => {
    try { const { data } = await api.post(`/fees/${partial.id}/pay-partial`, { amount: Number(partialAmt) }); toast.success(`Recorded · balance ${money(data.remaining)}`); setPartial(null); setPartialAmt(""); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const remind = async (f) => {
    const { data } = await api.post(`/fees/${f.id}/reminder`);
    if (data.sms_sent) { toast.success(data.message); return; }
    toast.info(data.message);
    const np = window.prompt("Add or fix the parent phone (include country code, e.g. +9198...):", "");
    if (np && np.trim()) {
      try { await api.put(`/students/${f.student_id}`, { parent_phone: np.trim() }); const r2 = await api.post(`/fees/${f.id}/reminder`); (r2.data.sms_sent ? toast.success : toast.info)(r2.data.message); load(); }
      catch (e) { toast.error("Could not update phone"); }
    }
  };
  const remindAll = async () => { const { data } = await api.post("/fees/send-overdue-reminders"); toast.success(data.message); };
  const emailReceipt = async (id) => { try { const { data } = await api.post(`/fees/${id}/email-receipt`); toast.success(`Receipt emailed to ${data.to}`); } catch (e) { toast.error(formatErr(e.response?.data?.detail)); } };
  const waShare = (f) => {
    const digits = (f.parent_phone || "").replace(/\D/g, "");
    if (!digits) { toast.error("No parent phone on file — add one via the student profile"); return; }
    const due = (Number(f.amount) - Number(f.paid_amount || 0)).toFixed(0);
    const text = `Dear Parent, this is a fee reminder from EduSync. Fee of Rs.${due} for ${f.student_name} (${f.month}) is due. Kindly pay at the earliest. Thank you.`;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const payOnline = async (fee) => {
    setPaying(fee.id);
    const ok = await loadRzp();
    if (!ok) { toast.error("Could not load Razorpay"); setPaying(null); return; }
    try {
      const { data } = await api.post("/fees/razorpay/order", { fee_id: fee.id });
      const rzp = new window.Razorpay({
        key: data.key_id, amount: data.amount, currency: "INR", order_id: data.order_id,
        name: user.institute_name, description: `Fee ${fee.month}`,
        prefill: { name: data.student_name, contact: data.prefill_contact }, theme: { color: "#2563eb" },
        handler: async (resp) => {
          try { const { data: v } = await api.post("/fees/razorpay/verify", { fee_id: fee.id, ...resp }); toast.success(`Payment successful! Receipt ${v.receipt_no}`); load(); }
          catch (e) { toast.error("Verification failed"); }
        },
        modal: { ondismiss: () => setPaying(null) },
      });
      rzp.open();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    finally { setPaying(null); }
  };

  if (!fees) return <Loader />;
  const bal = (f) => Math.max(0, f.amount - (f.paid_amount || 0));
  const totalPending = fees.filter((f) => f.status !== "paid").reduce((a, f) => a + bal(f), 0);

  return (
    <div>
      <PageHeader title={isPrincipal ? "Fee Management" : "Fees & Receipts"} subtitle={`${money(totalPending)} outstanding`} actions={
        isPrincipal && (
          <div className="flex flex-wrap gap-2">
            <Button data-testid="remind-all-btn" variant="outline" onClick={remindAll}><BellRing className="h-4 w-4 mr-2" />Remind Overdue</Button>
            <Dialog open={compOpen} onOpenChange={setCompOpen}>
              <DialogTrigger asChild><Button data-testid="manage-components-btn" variant="outline"><Settings2 className="h-4 w-4 mr-2" />Fee Structure</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Fee Structure Components</DialogTitle></DialogHeader>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {components.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium">{c.name}</span>
                      <div className="flex items-center gap-3"><span className="text-sm">₹{c.amount}</span><button data-testid={`del-comp-${c.id}`} onClick={() => delComp(c.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>
                    </div>
                  ))}
                  {components.length === 0 && <p className="text-sm text-slate-400">No components yet. Add tuition, transport, lab fee etc.</p>}
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <Input data-testid="comp-name" placeholder="e.g. Transport Fee" value={newComp.name} onChange={(e) => setNewComp({ ...newComp, name: e.target.value })} />
                  <Input data-testid="comp-amount" type="number" placeholder="₹" className="w-28" value={newComp.amount} onChange={(e) => setNewComp({ ...newComp, amount: e.target.value })} />
                  <Button data-testid="add-comp-btn" onClick={addComp} className="btn-gradient"><Plus className="h-4 w-4" /></Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button data-testid="add-fee-btn" className="btn-gradient"><Plus className="h-4 w-4 mr-2" />Add Fee</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Create Fee (itemized)</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Student</Label>
                    <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
                      <SelectTrigger data-testid="fee-student"><SelectValue placeholder="Select student" /></SelectTrigger>
                      <SelectContent>{students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.student_id})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fee Components</Label>
                    <div className="mt-1.5 space-y-1.5 border border-slate-200 rounded-lg p-3">
                      {components.length === 0 && <p className="text-xs text-slate-400">Add components first via "Fee Structure".</p>}
                      {components.map((c) => (
                        <label key={c.id} className="flex items-center justify-between cursor-pointer">
                          <span className="flex items-center gap-2 text-sm">
                            <Checkbox data-testid={`fee-comp-${c.id}`} checked={!!form.selected[c.id]} onCheckedChange={(v) => setForm({ ...form, selected: { ...form.selected, [c.id]: v } })} />
                            {c.name}
                          </span>
                          <span className="text-sm text-slate-500">₹{c.amount}</span>
                        </label>
                      ))}
                      <div className="flex justify-between pt-2 border-t text-sm font-semibold"><span>Total</span><span data-testid="fee-total">{money(selectedTotal)}</span></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Month</Label><Input data-testid="fee-month" type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></div>
                    <div><Label>Due Date</Label><Input data-testid="fee-due-date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                  </div>
                </div>
                <DialogFooter><Button data-testid="save-fee-btn" onClick={createFee} disabled={!form.student_id} className="btn-gradient">Create</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )
      } />

      {isPrincipal && stats && stats.total > 0 && (
        <div data-testid="fee-split-card" className="rounded-2xl border border-slate-200 bg-white p-5 mb-6 stat-card">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-slate-800 font-heading flex items-center gap-2"><CreditCard className="h-4 w-4 text-violet-600" />Collections · Online vs Cash</p>
            <span className="text-sm font-bold text-slate-700">{money(stats.total)} total</span>
          </div>
          {stats.target > 0 && (
            <div data-testid="collection-goal" className="flex items-center gap-4 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
                <circle cx="32" cy="32" r="27" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                <circle cx="32" cy="32" r="27" fill="none" stroke="#7c3aed" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 27} strokeDashoffset={2 * Math.PI * 27 * (1 - Math.min(stats.target_pct, 100) / 100)}
                  transform="rotate(-90 32 32)" />
                <text x="32" y="37" textAnchor="middle" className="fill-slate-700 font-bold" fontSize="13">{Math.round(stats.target_pct)}%</text>
              </svg>
              <div>
                <p className="text-xs text-slate-500">This month's goal ({stats.current_month})</p>
                <p className="text-sm font-bold text-slate-800">{money(stats.this_month)} <span className="font-medium text-slate-400">of {money(stats.target)}</span></p>
              </div>
            </div>
          )}
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100">
            <div className="bg-violet-500 h-full" style={{ width: `${stats.online_pct}%` }} />
            <div className="bg-emerald-500 h-full" style={{ width: `${stats.cash_pct}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div data-testid="fee-split-online">
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />UPI / Online ({stats.online_count})</p>
              <p className="text-lg font-extrabold text-violet-700">{money(stats.online)} <span className="text-xs font-medium text-slate-400">{stats.online_pct}%</span></p>
            </div>
            <div data-testid="fee-split-cash">
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Cash / Manual ({stats.cash_count})</p>
              <p className="text-lg font-extrabold text-emerald-700">{money(stats.cash)} <span className="text-xs font-medium text-slate-400">{stats.cash_pct}%</span></p>
            </div>
          </div>
          {stats.monthly && stats.monthly.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100" data-testid="fee-monthly-trend">
              <p className="text-xs font-semibold text-slate-500 mb-3">Monthly trend · UPI vs Cash</p>
              <div className="flex items-end gap-3 h-24">
                {stats.monthly.map((m) => {
                  const tot = m.online + m.cash || 1;
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex flex-col justify-end h-16 rounded-md overflow-hidden bg-slate-100">
                        <div className="bg-violet-500" style={{ height: `${(m.online / tot) * 100}%` }} title={`UPI ${money(m.online)}`} />
                        <div className="bg-emerald-500" style={{ height: `${(m.cash / tot) * 100}%` }} title={`Cash ${money(m.cash)}`} />
                      </div>
                      <span className="text-[10px] text-slate-400">{m.month.slice(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <Card className="border-slate-200 card-premium">
        {fees.length === 0 ? <Empty icon={Wallet} title="No fee records" /> : (
          <Table>
            <TableHeader><TableRow>
              {isPrincipal && <TableHead>Student</TableHead>}
              <TableHead>Month</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {fees.map((f) => (
                <TableRow key={f.id} data-testid={`fee-row-${f.id}`}>
                  {isPrincipal && <TableCell className="font-medium">{f.student_name}</TableCell>}
                  <TableCell>{f.month}</TableCell>
                  <TableCell className="text-right font-semibold">₹{f.amount}</TableCell>
                  <TableCell className="text-right text-emerald-600">₹{f.paid_amount || 0}</TableCell>
                  <TableCell className="text-right text-red-600">₹{bal(f)}</TableCell>
                  <TableCell><StatusBadge status={f.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5 flex-wrap">
                      {f.status !== "paid" && (isPrincipal ? (
                        <>
                          <Button data-testid={`remind-${f.id}`} size="sm" variant="outline" onClick={() => remind(f)}><Bell className="h-3.5 w-3.5" /></Button>
                          <Button data-testid={`wa-${f.id}`} size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" title="Send free reminder on WhatsApp" onClick={() => waShare(f)}><MessageCircle className="h-3.5 w-3.5" /></Button>
                          <Button data-testid={`partial-${f.id}`} size="sm" variant="outline" onClick={() => setPartial(f)}>Partial</Button>
                          <Button data-testid={`markpaid-${f.id}`} size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => markPaid(f.id)}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                        </>
                      ) : (
                        <Button data-testid={`pay-${f.id}`} size="sm" className="btn-gradient" onClick={() => payOnline(f)} disabled={paying === f.id}>
                          {paying === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CreditCard className="h-3.5 w-3.5 mr-1" />Pay {money(bal(f))}</>}
                        </Button>
                      ))}
                      {(f.paid_amount > 0 || f.status === "paid") && <Button data-testid={`receipt-${f.id}`} size="sm" variant="outline" onClick={() => downloadPdf(`/fees/${f.id}/receipt`)}><Download className="h-3.5 w-3.5" /></Button>}
                      {(f.paid_amount > 0 || f.status === "paid") && isPrincipal && <Button data-testid={`email-receipt-${f.id}`} size="sm" variant="outline" onClick={() => emailReceipt(f.id)}><Mail className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!partial} onOpenChange={(v) => !v && setPartial(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Partial Payment</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">{partial?.student_name} · Balance {partial && money(bal(partial))}</p>
          <div><Label>Amount received (₹)</Label><Input data-testid="partial-amount" type="number" className="mt-1.5" value={partialAmt} onChange={(e) => setPartialAmt(e.target.value)} /></div>
          <DialogFooter><Button data-testid="save-partial-btn" onClick={doPartial} disabled={!partialAmt} className="btn-gradient">Record Payment</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
