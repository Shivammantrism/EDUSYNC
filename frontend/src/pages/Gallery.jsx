import { useEffect, useState } from "react";
import api, { fileUrl, formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Images, Plus, Upload, Loader2, Trash2 } from "lucide-react";

export default function Gallery() {
  const { user } = useAuth();
  const isStaff = user.role !== "student";
  const [photos, setPhotos] = useState(null);
  const [classes, setClasses] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", class_id: "", image_url: "" });
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = () => api.get("/gallery").then((r) => setPhotos(r.data));
  useEffect(() => { load(); if (isStaff) api.get("/batches").then((r) => setClasses(r.data)).catch(() => {}); }, []);

  const uploadImg = async (file) => {
    setUploading(true);
    try { const fd = new FormData(); fd.append("file", file); const { data } = await api.post("/upload", fd); setForm((f) => ({ ...f, image_url: data.url })); toast.success("Photo ready — click Add"); }
    catch (e) { toast.error("Upload failed"); } finally { setUploading(false); }
  };
  const add = async () => {
    try { await api.post("/gallery", form); toast.success("Photo added"); setOpen(false); setForm({ title: "", class_id: "", image_url: "" }); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const del = async (id) => { await api.delete(`/gallery/${id}`); toast.success("Removed"); load(); };

  if (!photos) return <Loader />;
  const albums = ["all", "institute", ...classes.map((c) => c.id)];
  const albumName = (id) => id === "all" ? "All" : id === "institute" ? "Institute" : (classes.find((c) => c.id === id)?.name || "Class");
  const shown = filter === "all" ? photos : filter === "institute" ? photos.filter((p) => !p.class_id) : photos.filter((p) => p.class_id === filter);

  return (
    <div>
      <PageHeader title="Photo Gallery" subtitle="Institute & class moments" actions={
        isStaff && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-photo-btn" className="btn-gradient"><Plus className="h-4 w-4 mr-2" />Add Photo</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add a Photo</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title / Caption</Label><Input data-testid="photo-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Annual Day 2026" /></div>
                <div><Label>Album</Label>
                  <Select value={form.class_id || "institute"} onValueChange={(v) => setForm({ ...form, class_id: v === "institute" ? "" : v })}>
                    <SelectTrigger data-testid="photo-album"><SelectValue placeholder="Institute" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="institute">Institute (shared)</SelectItem>
                      {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Photo</Label>
                  <label className="mt-1.5 cursor-pointer flex items-center gap-2 text-sm px-3 py-2 border border-dashed rounded-lg hover:bg-slate-50 w-fit">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{form.image_url ? "Change photo" : "Upload photo"}
                    <input data-testid="photo-upload-input" type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadImg(e.target.files[0])} />
                  </label>
                  {form.image_url && <img src={fileUrl(form.image_url)} alt="" className="mt-2 h-28 rounded-lg object-cover" />}
                </div>
              </div>
              <DialogFooter><Button data-testid="save-photo-btn" onClick={add} disabled={!form.image_url} className="btn-gradient">Add Photo</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />

      <div className="flex flex-wrap gap-2 mb-5">
        {albums.map((a) => (
          <button key={a} data-testid={`album-${a}`} onClick={() => setFilter(a)}
            className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition-colors ${filter === a ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {albumName(a)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? <Empty icon={Images} title="No photos yet" /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {shown.map((p) => (
            <Card key={p.id} data-testid={`photo-${p.id}`} className="overflow-hidden border-slate-200 group relative">
              <img src={fileUrl(p.image_url)} alt={p.title} className="h-40 w-full object-cover" />
              <div className="p-3">
                <p className="text-sm font-semibold text-slate-800 truncate">{p.title || "Untitled"}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{p.class_name || "Institute"} · by {p.uploaded_by}</p>
              </div>
              {isStaff && <button data-testid={`del-photo-${p.id}`} onClick={() => del(p.id)} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-white/90 grid place-items-center text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="h-3.5 w-3.5" /></button>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
