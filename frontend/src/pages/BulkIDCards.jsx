import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import IDCard from "@/components/IDCard";
import { toast } from "sonner";
import { Printer, IdCard as IdIcon, QrCode } from "lucide-react";

export default function BulkIDCards() {
  const { batchId } = useParams();
  const { institute } = useAuth();
  const [students, setStudents] = useState(null);
  const [batch, setBatch] = useState(null);
  const [perPage, setPerPage] = useState("24");
  const [preset, setPreset] = useState("standard");

  useEffect(() => {
    api.get("/students", { params: { batch_id: batchId } }).then((r) => setStudents(r.data));
    api.get("/batches").then((r) => setBatch(r.data.find((b) => b.id === batchId)));
  }, [batchId]);

  const downloadStickers = () => {
    const token = localStorage.getItem("edusync_token");
    toast.info("Generating QR stickers…");
    fetch(`${API}/print/qr-stickers/students/${batchId}?per_page=${perPage}&preset=${preset}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((b) => { const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "qr-stickers-students.pdf"; a.click(); URL.revokeObjectURL(u); })
      .catch(() => toast.error("Could not generate QR stickers"));
  };

  if (!students) return <Loader />;
  return (
    <div>
      <div className="no-print">
        <PageHeader title="Batch ID Cards" subtitle={`${batch?.name || ""} · ${students.length} cards ready to print`} actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Select value={perPage} onValueChange={setPerPage}>
              <SelectTrigger data-testid="stickers-perpage" className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="12">12 / page</SelectItem><SelectItem value="24">24 / page</SelectItem><SelectItem value="30">30 / page</SelectItem></SelectContent>
            </Select>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger data-testid="stickers-preset" className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="standard">Standard (cut guides)</SelectItem><SelectItem value="avery">Avery labels (A4)</SelectItem></SelectContent>
            </Select>
            <Button data-testid="qr-stickers-btn" variant="outline" onClick={downloadStickers} disabled={students.length === 0}><QrCode className="h-4 w-4 mr-2" />Generate QR Stickers</Button>
            <Button data-testid="print-batch-btn" onClick={() => window.print()} className="btn-gradient"><Printer className="h-4 w-4 mr-2" />Print All Cards</Button>
          </div>
        } />
      </div>
      {students.length === 0 ? <Empty icon={IdIcon} title="No students in this batch" /> : (
        <div className="flex flex-wrap gap-6 justify-center">
          {students.map((s) => <IDCard key={s.id} student={s} institute={institute} />)}
        </div>
      )}
    </div>
  );
}
