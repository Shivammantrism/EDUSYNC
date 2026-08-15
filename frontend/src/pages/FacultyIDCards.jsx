import { useEffect, useState } from "react";
import api, { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import IDCard from "@/components/IDCard";
import { toast } from "sonner";
import { Printer, IdCard as IdIcon, QrCode } from "lucide-react";

export default function FacultyIDCards() {
  const { institute } = useAuth();
  const [teachers, setTeachers] = useState(null);
  const [perPage, setPerPage] = useState("24");
  const [preset, setPreset] = useState("standard");
  const [orientation, setOrientation] = useState("landscape");
  const [side, setSide] = useState("front");
  const [theme, setTheme] = useState({ id_card_primary: institute?.id_card_primary || "#001E4D", id_card_accent: institute?.id_card_accent || "#047857" });
  const [assets, setAssets] = useState({ logo_url: institute?.logo_url || "", seal_url: institute?.seal_url || "" });
  const saveTheme = async (t) => { setTheme(t); try { await api.put("/institute", t); toast.success("Card colors saved"); } catch { toast.error("Could not save colors"); } };
  const uploadAsset = async (field, file) => { try { const fd = new FormData(); fd.append("file", file); const { data } = await api.post("/upload", fd); const next = { ...assets, [field]: data.url }; setAssets(next); await api.put("/institute", { [field]: data.url }); toast.success(field === "logo_url" ? "Logo saved" : "Seal saved"); } catch { toast.error("Upload failed"); } };
  const instThemed = { ...institute, ...theme, ...assets };

  useEffect(() => { api.get("/teachers").then((r) => setTeachers(r.data)); }, []);

  const downloadStickers = () => {
    const token = localStorage.getItem("edusync_token");
    toast.info("Generating QR stickers…");
    fetch(`${API}/print/qr-stickers/faculty?per_page=${perPage}&preset=${preset}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((b) => { const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "qr-stickers-faculty.pdf"; a.click(); URL.revokeObjectURL(u); })
      .catch(() => toast.error("Could not generate QR stickers"));
  };

  if (!teachers) return <Loader />;
  return (
    <div>
      <div className="no-print">
        <PageHeader title="Faculty ID Cards" subtitle={`${teachers.length} faculty cards ready to print`} actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Select value={orientation} onValueChange={setOrientation}>
              <SelectTrigger data-testid="id-orientation-faculty" className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="landscape">Horizontal (Landscape)</SelectItem><SelectItem value="portrait">Vertical (Portrait)</SelectItem></SelectContent>
            </Select>
            <Select value={side} onValueChange={setSide}>
              <SelectTrigger data-testid="id-side-faculty" className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="front">Front</SelectItem><SelectItem value="back">Back</SelectItem></SelectContent>
            </Select>
            <label className="flex items-center gap-1 text-xs text-slate-500" title="Card theme colors">Theme
              <input data-testid="color-primary-faculty" type="color" value={theme.id_card_primary} onChange={(e) => saveTheme({ ...theme, id_card_primary: e.target.value })} className="h-7 w-8 rounded border cursor-pointer" />
              <input data-testid="color-accent-faculty" type="color" value={theme.id_card_accent} onChange={(e) => saveTheme({ ...theme, id_card_accent: e.target.value })} className="h-7 w-8 rounded border cursor-pointer" />
            </label>
            <label data-testid="upload-logo-label-faculty" className="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-slate-50 cursor-pointer">Logo
              <input data-testid="upload-logo-input-faculty" type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadAsset("logo_url", e.target.files[0])} />
            </label>
            <label data-testid="upload-seal-label-faculty" className="flex items-center gap-1 text-xs px-2 py-1.5 border rounded-lg hover:bg-slate-50 cursor-pointer">Seal
              <input data-testid="upload-seal-input-faculty" type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadAsset("seal_url", e.target.files[0])} />
            </label>
            <Select value={perPage} onValueChange={setPerPage}>
              <SelectTrigger data-testid="stickers-perpage-faculty" className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="12">12 / page</SelectItem><SelectItem value="24">24 / page</SelectItem><SelectItem value="30">30 / page</SelectItem></SelectContent>
            </Select>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger data-testid="stickers-preset-faculty" className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="standard">Standard (cut guides)</SelectItem><SelectItem value="avery">Avery labels (A4)</SelectItem></SelectContent>
            </Select>
            <Button data-testid="qr-stickers-faculty-btn" variant="outline" onClick={downloadStickers} disabled={teachers.length === 0}><QrCode className="h-4 w-4 mr-2" />Generate QR Stickers</Button>
            <Button data-testid="print-faculty-btn" onClick={() => window.print()} className="btn-gradient"><Printer className="h-4 w-4 mr-2" />Print All Cards</Button>
          </div>
        } />
      </div>
      {teachers.length === 0 ? <Empty icon={IdIcon} title="No faculty yet" /> : (
        <div className="flex flex-wrap gap-6 justify-center">
          {teachers.map((t) => <IDCard key={t.id} student={t} institute={instThemed} variant="faculty" orientation={orientation} side={side} />)}
        </div>
      )}
    </div>
  );
}
