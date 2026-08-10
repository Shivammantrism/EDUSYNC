import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
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
import { Megaphone, Plus, Trash2 } from "lucide-react";

export default function Announcements() {
  const { user } = useAuth();
  const isPrincipal = user.role === "principal";
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all" });

  const load = () => api.get("/announcements").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => {
    try { await api.post("/announcements", form); toast.success("Posted to everyone"); setOpen(false); setForm({ title: "", body: "", audience: "all" }); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const del = async (id) => { await api.delete(`/announcements/${id}`); load(); };

  if (!items) return <Loader />;
  return (
    <div>
      <PageHeader title="Announcement Board" subtitle="Notices for teachers & students" actions={
        isPrincipal && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-announcement-btn" className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-2" />Post Notice</Button></DialogTrigger>
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
              </div>
              <DialogFooter><Button data-testid="save-announcement-btn" onClick={create} disabled={!form.title} className="bg-blue-600 hover:bg-blue-700">Post</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />
      {items.length === 0 ? <Empty icon={Megaphone} title="No announcements" /> : (
        <div className="space-y-4">
          {items.map((a) => (
            <Card key={a.id} data-testid={`announcement-${a.id}`} className="p-5 border-slate-200 border-l-4 border-l-blue-600">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Megaphone className="h-5 w-5" /></div>
                  <div>
                    <p className="font-bold text-slate-900 font-heading">{a.title}</p>
                    <p className="text-sm text-slate-600 mt-1">{a.body}</p>
                    <p className="text-xs text-slate-400 mt-2">By {a.author} · {new Date(a.created_at).toLocaleDateString()} · {a.audience}</p>
                  </div>
                </div>
                {isPrincipal && <button data-testid={`del-ann-${a.id}`} onClick={() => del(a.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
