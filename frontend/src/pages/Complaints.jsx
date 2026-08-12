import { useEffect, useState } from "react";
import api, { fileUrl, formatErr } from "@/lib/api";
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
import { MessageSquareWarning, Plus, Paperclip, FileText, Image as ImageIcon, Loader2, History } from "lucide-react";

const DIRECTIONS = { principal: "Principal", teacher: "Class Teacher", parent: "Parent", both: "Both" };

export default function Complaints() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", category: "general", direction: "principal", attachments: [] });
  const [uploading, setUploading] = useState(false);
  const [manage, setManage] = useState(null);
  const [resp, setResp] = useState({ status: "under_review", response: "", note: "" });

  const load = () => api.get("/complaints").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const uploadFile = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/upload", fd);
      const type = file.type.startsWith("image/") ? "image" : "pdf";
      setForm((f) => ({ ...f, attachments: [...f.attachments, { url: data.url, type, name: file.name }] }));
      toast.success(`${type === "image" ? "Image" : "PDF"} attached`);
    } catch (e) { toast.error("Upload failed"); } finally { setUploading(false); }
  };
  const create = async () => {
    try { await api.post("/complaints", { ...form, attachment_url: form.attachments[0]?.url || "" }); toast.success(`Complaint routed to ${DIRECTIONS[form.direction]}`); setOpen(false); setForm({ subject: "", description: "", category: "general", direction: "principal", attachments: [] }); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const update = async () => {
    try { await api.put(`/complaints/${manage.id}`, resp); toast.success("Status updated"); setManage(null); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  if (!items) return <Loader />;
  const dirOptions = user.role === "student" ? ["teacher", "principal", "both"] : ["principal", "parent", "both"];
  const canManage = (c) => isPrincipal || (user.role === "teacher" && (c.direction === "teacher" || c.direction === "both"));
  const attList = (c) => (c.attachments && c.attachments.length ? c.attachments : (c.attachment_url ? [{ url: c.attachment_url, type: "pdf" }] : []));

  return (
    <div>
      <PageHeader title="Complaint Management" subtitle={isPrincipal ? "Route, review & resolve with full audit trail" : "Raise & route issues with status tracking"} actions={
        !isPrincipal && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-complaint-btn" className="btn-gradient"><Plus className="h-4 w-4 mr-2" />Raise Complaint</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Raise a Complaint</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Subject</Label><Input data-testid="complaint-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                <div><Label>Route To</Label>
                  <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                    <SelectTrigger data-testid="complaint-direction"><SelectValue /></SelectTrigger>
                    <SelectContent>{dirOptions.map((d) => <SelectItem key={d} value={d}>{DIRECTIONS[d]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Description</Label><Textarea data-testid="complaint-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} /></div>
                <div>
                  <Label>Attach PDF or Image (optional)</Label>
                  <label className="mt-1.5 flex items-center gap-2 text-sm px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-slate-50 text-slate-600">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} Add attachment
                    <input data-testid="complaint-file-input" type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadFile(e.target.files[0])} />
                  </label>
                  {form.attachments.map((a, i) => (
                    <p key={i} className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">{a.type === "image" ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}{a.name || a.url}</p>
                  ))}
                </div>
              </div>
              <DialogFooter><Button data-testid="save-complaint-btn" onClick={create} disabled={!form.subject || uploading} className="btn-gradient">Submit</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />
      {items.length === 0 ? <Empty icon={MessageSquareWarning} title="No complaints" /> : (
        <div className="space-y-4">
          {items.map((c) => (
            <Card key={c.id} data-testid={`complaint-${c.id}`} className="p-5 border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <p className="font-bold text-slate-900">{c.subject}</p>
                    <StatusBadge status={c.status} />
                    {c.direction && <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">→ {DIRECTIONS[c.direction] || c.direction}</span>}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{c.description}</p>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {attList(c).map((a, i) => (
                      <a key={i} data-testid={`complaint-attachment-${c.id}-${i}`} href={fileUrl(a.url)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700">
                        {a.type === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />} {a.type === "image" ? "View image" : "View PDF"}
                      </a>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">By {c.raised_by} ({c.raised_by_role}) · {new Date(c.created_at).toLocaleDateString()}</p>
                  {c.response && <p className="text-sm text-blue-700 bg-blue-50 rounded-lg p-2 mt-2">Response: {c.response}</p>}
                  {(c.audit && c.audit.length > 0) && (
                    <div className="mt-3 border-t border-slate-100 pt-2">
                      <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-1"><History className="h-3.5 w-3.5" />Audit Trail</p>
                      {c.audit.map((a, i) => (
                        <p key={i} data-testid={`audit-${c.id}-${i}`} className="text-[11px] text-slate-500">
                          {a.by} ({a.by_role}) changed <b>{a.from_status || "—"}</b> → <b>{a.to_status}</b> · {new Date(a.at).toLocaleString()}{a.note ? ` · "${a.note}"` : ""}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                {canManage(c) && <Button data-testid={`manage-${c.id}`} size="sm" variant="outline" onClick={() => { setManage(c); setResp({ status: c.status === "pending" ? "under_review" : c.status, response: c.response || "", note: "" }); }}>Manage</Button>}
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
                <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="under_review">Under Review</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Audit Note (why the change)</Label><Input data-testid="complaint-note" value={resp.note} onChange={(e) => setResp({ ...resp, note: e.target.value })} placeholder="e.g. Spoke to parent, resolving" /></div>
            <div><Label>Response to complainant</Label><Textarea data-testid="complaint-response" value={resp.response} onChange={(e) => setResp({ ...resp, response: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter><Button data-testid="update-complaint-btn" onClick={update} className="btn-gradient">Update</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
