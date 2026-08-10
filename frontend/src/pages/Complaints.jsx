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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquareWarning, Plus } from "lucide-react";

export default function Complaints() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", category: "general" });
  const [manage, setManage] = useState(null);
  const [resp, setResp] = useState({ status: "in_progress", response: "" });

  const load = () => api.get("/complaints").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => {
    try { await api.post("/complaints", form); toast.success("Complaint raised to Principal"); setOpen(false); setForm({ subject: "", description: "", category: "general" }); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const update = async () => {
    try { await api.put(`/complaints/${manage.id}`, resp); toast.success("Updated"); setManage(null); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  if (!items) return <Loader />;
  return (
    <div>
      <PageHeader title="Complaint Management" subtitle={isPrincipal ? "Resolve complaints from teachers & students" : "Raise issues to the Principal"} actions={
        !isPrincipal && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-complaint-btn" className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-2" />Raise Complaint</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Raise a Complaint</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Subject</Label><Input data-testid="complaint-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea data-testid="complaint-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} /></div>
              </div>
              <DialogFooter><Button data-testid="save-complaint-btn" onClick={create} disabled={!form.subject} className="bg-blue-600 hover:bg-blue-700">Submit</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />
      {items.length === 0 ? <Empty icon={MessageSquareWarning} title="No complaints" /> : (
        <div className="space-y-4">
          {items.map((c) => (
            <Card key={c.id} data-testid={`complaint-${c.id}`} className="p-5 border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3"><p className="font-bold text-slate-900">{c.subject}</p><StatusBadge status={c.status} /></div>
                  <p className="text-sm text-slate-600 mt-1">{c.description}</p>
                  <p className="text-xs text-slate-400 mt-2">By {c.raised_by} ({c.raised_by_role}) · {new Date(c.created_at).toLocaleDateString()}</p>
                  {c.response && <p className="text-sm text-blue-700 bg-blue-50 rounded-lg p-2 mt-2">Principal: {c.response}</p>}
                </div>
                {isPrincipal && <Button data-testid={`manage-${c.id}`} size="sm" variant="outline" onClick={() => { setManage(c); setResp({ status: c.status, response: c.response || "" }); }}>Manage</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!manage} onOpenChange={(v) => !v && setManage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage Complaint</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{manage?.subject}</p>
            <div><Label>Status</Label>
              <Select value={resp.status} onValueChange={(v) => setResp({ ...resp, status: v })}>
                <SelectTrigger data-testid="complaint-status"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Response</Label><Textarea data-testid="complaint-response" value={resp.response} onChange={(e) => setResp({ ...resp, response: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter><Button data-testid="update-complaint-btn" onClick={update} className="bg-blue-600 hover:bg-blue-700">Update</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
