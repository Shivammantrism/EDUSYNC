import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { PageHeader, Loader, Empty, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { UserPlus, Plus } from "lucide-react";

export default function Enquiries() {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", course: "", notes: "" });

  const load = () => api.get("/enquiries").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => {
    try { await api.post("/enquiries", form); toast.success("Enquiry logged"); setOpen(false); setForm({ name: "", phone: "", email: "", course: "", notes: "" }); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const setStatus = async (id, status) => { await api.put(`/enquiries/${id}`, { status }); toast.success(status === "converted" ? "Converted to admission!" : "Updated"); load(); };

  if (!items) return <Loader />;
  return (
    <div>
      <PageHeader title="Admission Enquiries" subtitle={`${items.length} leads`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-enquiry-btn" className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-2" />Log Enquiry</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Admission Enquiry</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input data-testid="enq-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input data-testid="enq-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Course/Class</Label><Input value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} /></div>
              </div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button data-testid="save-enquiry-btn" onClick={create} disabled={!form.name || !form.phone} className="bg-blue-600 hover:bg-blue-700">Log</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Card className="border-slate-200">
        {items.length === 0 ? <Empty icon={UserPlus} title="No enquiries" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Course</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{items.map((e) => (
              <TableRow key={e.id} data-testid={`enquiry-row-${e.id}`}>
                <TableCell className="font-medium">{e.name}</TableCell><TableCell className="text-slate-500">{e.phone}</TableCell><TableCell>{e.course}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
                <TableCell className="text-right space-x-2">
                  {e.status !== "converted" && <>
                    <Button data-testid={`followup-${e.id}`} size="sm" variant="outline" onClick={() => setStatus(e.id, "follow_up")}>Follow-up</Button>
                    <Button data-testid={`convert-${e.id}`} size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setStatus(e.id, "converted")}>Convert</Button>
                  </>}
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
