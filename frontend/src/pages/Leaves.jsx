import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { PlaneTakeoff, Plus, Check, X } from "lucide-react";

export default function Leaves() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ from_date: "", to_date: "", reason: "" });

  const load = () => api.get("/leaves").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);
  const apply = async () => {
    try { await api.post("/leaves", form); toast.success("Leave applied"); setOpen(false); setForm({ from_date: "", to_date: "", reason: "" }); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const decide = async (id, status) => { await api.put(`/leaves/${id}`, { status }); toast.success(`Leave ${status}`); load(); };

  if (!items) return <Loader />;
  return (
    <div>
      <PageHeader title={isPrincipal ? "Leave Requests" : "My Leaves"} subtitle={isPrincipal ? "Approve or reject teacher leaves" : `Balance: ${user.leave_balance ?? ""} — apply for leave`} actions={
        user.role === "teacher" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="apply-leave-btn" className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-2" />Apply for Leave</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>From</Label><Input data-testid="leave-from" type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} /></div>
                  <div><Label>To</Label><Input data-testid="leave-to" type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></div>
                </div>
                <div><Label>Reason</Label><Textarea data-testid="leave-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
              </div>
              <DialogFooter><Button data-testid="save-leave-btn" onClick={apply} disabled={!form.from_date || !form.to_date} className="bg-blue-600 hover:bg-blue-700">Apply</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />
      <Card className="border-slate-200">
        {items.length === 0 ? <Empty icon={PlaneTakeoff} title="No leave requests" /> : (
          <Table>
            <TableHeader><TableRow>{isPrincipal && <TableHead>Teacher</TableHead>}<TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead>{isPrincipal && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader>
            <TableBody>{items.map((l) => (
              <TableRow key={l.id} data-testid={`leave-row-${l.id}`}>
                {isPrincipal && <TableCell className="font-medium">{l.teacher_name}</TableCell>}
                <TableCell>{l.from_date}</TableCell><TableCell>{l.to_date}</TableCell><TableCell className="text-slate-500">{l.reason}</TableCell>
                <TableCell><StatusBadge status={l.status} /></TableCell>
                {isPrincipal && <TableCell className="text-right space-x-2">
                  {l.status === "pending" && <>
                    <Button data-testid={`approve-${l.id}`} size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => decide(l.id, "approved")}><Check className="h-3.5 w-3.5" /></Button>
                    <Button data-testid={`reject-${l.id}`} size="sm" variant="outline" onClick={() => decide(l.id, "rejected")}><X className="h-3.5 w-3.5" /></Button>
                  </>}
                </TableCell>}
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
