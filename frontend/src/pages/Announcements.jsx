import { useEffect, useState } from "react";
import api, { fileUrl, formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Megaphone, Plus, Trash2, Paperclip, FileText, Loader2 } from "lucide-react";

export default function Announcements() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const canPost = isPrincipal || user.role === "teacher";
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all", attachment_url: "" });

  const load = () => api.get("/announcements").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const uploadPdf = async (file) => {
    setUploading(true);
    try { const fd = new FormData(); fd.append("file", file); const { data } = await api.post("/upload", fd); setForm((f) => ({ ...f, attachment_url: data.url })); toast.success("PDF attached"); }
    catch (e) { toast.error("Upload failed"); } finally { setUploading(false); }
  };
  const create = async () => {
    try { await api.post("/announcements", form); toast.success("Announcement posted"); setOpen(false); setForm({ title: "", body: "", audience: "all", attachment_url: "" }); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const del = async (id) => { try { await api.delete(`/announcements/${id}`); load(); } catch (e) { toast.error(formatErr(e.response?.data?.detail)); } };

  if (!items) return <Loader />;
  return (
    <div>
      <PageHeader title="Announcement Board" subtitle="Notices & documents for teachers & students" actions={
        canPost && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-announcement-btn" className="btn-gradient"><Plus className="h-4 w-4 mr-2" />Post Notice</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Post Announcement</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input data-testid="ann-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Message</Label><Textarea data-testid="ann-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} /></div>
                <div><Label>Audience</Label>
                  <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
                    <SelectTrigger data-testid="ann-audience"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Everyone</SelectItem><SelectItem value="teachers">Teachers only</SelectItem><SelectItem value="students">Students only</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Attach PDF (optional)</Label>
                  <label className="mt-1.5 flex items-center gap-2 text-sm px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-slate-50 text-slate-600">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    {form.attachment_url ? "PDF attached — replace" : "Choose PDF file"}
                    <input data-testid="ann-pdf-input" type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files[0] && uploadPdf(e.target.files[0])} />
                  </label>
                </div>
              </div>
              <DialogFooter><Button data-testid="save-announcement-btn" onClick={create} disabled={!form.title || uploading} className="btn-gradient">Post</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />
      {items.length === 0 ? <Empty icon={Megaphone} title="No announcements" /> : (
        <div className="space-y-4">
          {items.map((a) => {
            const canDelete = isPrincipal || (user.role === "teacher" && a.author === user.name);
            return (
            <Card key={a.id} data-testid={`announcement-${a.id}`} className="p-5 border-slate-200 border-l-4 border-l-blue-600">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Megaphone className="h-5 w-5" /></div>
                  <div>
                    <p className="font-bold text-slate-900 font-heading">{a.title}</p>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{a.body}</p>
                    {a.attachment_url && (
                      <a data-testid={`ann-attachment-${a.id}`} href={fileUrl(a.attachment_url)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 mt-2">
                        <FileText className="h-3.5 w-3.5" /> View / Download PDF
                      </a>
                    )}
                    <p className="text-xs text-slate-400 mt-2">By {a.author}{a.author_role ? ` (${a.author_role})` : ""} · {new Date(a.created_at).toLocaleDateString()} · {a.audience}</p>
                  </div>
                </div>
                {canDelete && <button data-testid={`del-ann-${a.id}`} onClick={() => del(a.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
              </div>
            </Card>
          );})}
        </div>
      )}
    </div>
  );
}
