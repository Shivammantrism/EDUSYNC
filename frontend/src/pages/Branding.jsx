import { useEffect, useState } from "react";
import api, { fileUrl, formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Loader2, Save } from "lucide-react";

export default function Branding() {
  const { institute, refreshInstitute } = useAuth();
  const [form, setForm] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (institute) setForm({ name: institute.name || "", address: institute.address || "", phone: institute.phone || "", email: institute.email || "", logo_url: institute.logo_url || "", logo_path: institute.logo_path || "", id_template: institute.id_template || "classic" });
  }, [institute]);
  if (!form) return <Loader />;

  const uploadLogo = async (file) => {
    setUploading(true);
    try { const fd = new FormData(); fd.append("file", file); const { data } = await api.post("/upload", fd); setForm((f) => ({ ...f, logo_url: data.url, logo_path: data.path })); toast.success("Logo uploaded — click Save to apply"); }
    catch (e) { toast.error("Upload failed"); } finally { setUploading(false); }
  };
  const save = async () => {
    setSaving(true);
    try { await api.put("/institute", form); await refreshInstitute(); toast.success("Branding saved — now appears on receipts, slips & ID cards"); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  const preview = form.logo_url ? fileUrl(form.logo_url) : "/edusync-logo.png";

  return (
    <div>
      <PageHeader title="Institute Branding" subtitle="Your logo & details auto-appear on all fee receipts, salary slips and ID cards" actions={
        <Button data-testid="save-branding-btn" onClick={save} disabled={saving} className="btn-gradient">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" />Save Branding</>}</Button>
      } />
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-6 border-slate-200 flex flex-col items-center text-center card-premium">
          <div className="h-32 w-32 rounded-2xl bg-white border border-slate-200 p-2 flex items-center justify-center mb-4">
            <img src={preview} alt="logo" className="h-full w-full object-contain" />
          </div>
          <label className="cursor-pointer">
            <div className="inline-flex items-center gap-2 text-sm px-3 py-2 border rounded-lg hover:bg-slate-50">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload Institute Logo</div>
            <input data-testid="logo-upload-input" type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadLogo(e.target.files[0])} />
          </label>
          <p className="text-xs text-slate-400 mt-3">Defaults to the EduSync logo until you upload your own.</p>
        </Card>
        <Card className="p-6 border-slate-200 md:col-span-2 card-premium space-y-4">
          <div><Label>Institute Name</Label><Input data-testid="brand-name" className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Address</Label><Textarea data-testid="brand-address" className="mt-1.5" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, City, State - PIN" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Phone</Label><Input data-testid="brand-phone" className="mt-1.5" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input data-testid="brand-email" className="mt-1.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div>
            <Label>Master ID Card Template</Label>
            <p className="text-xs text-slate-400 mb-2">Applied to every student ID card automatically.</p>
            <div className="grid grid-cols-3 gap-3">
              {[["classic", "Classic", "from-blue-600 to-blue-800"], ["modern", "Modern", "from-indigo-600 to-purple-700"], ["minimal", "Minimal", "from-slate-700 to-slate-900"]].map(([key, label, grad]) => (
                <button key={key} type="button" data-testid={`idtpl-${key}`} onClick={() => setForm({ ...form, id_template: key })}
                  className={`rounded-xl overflow-hidden border-2 text-left transition-all ${form.id_template === key ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className={`h-10 bg-gradient-to-r ${grad}`} />
                  <div className="p-2 text-xs font-semibold text-slate-700">{label}</div>
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
