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
          {teachers.map((t) => <IDCard key={t.id} student={t} institute={institute} variant="faculty" orientation={orientation} />)}
        </div>
      )}
    </div>
  );
}
