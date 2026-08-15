import { useEffect, useState } from "react";
import api, { API, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Award, Download, Link2 } from "lucide-react";

const TYPES = [["achievement", "Achievement"], ["participation", "Participation"], ["sports", "Sports"], ["bonafide", "Bonafide"], ["character", "Character"], ["transfer", "Transfer"]];

export default function Certificates() {
  const { institute, refreshInstitute } = useAuth();
  const [sealBusy, setSealBusy] = useState(false);
  const [students, setStudents] = useState([]);
  const [certs, setCerts] = useState(null);
  const [form, setForm] = useState({ student_id: "", type: "bonafide", session: "2025-26", remarks: "", signatory_name: "", signatory_designation: "" });
  const [batches, setBatches] = useState([]);
  const [bulkBatch, setBulkBatch] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/certificates").then((r) => setCerts(r.data));
  useEffect(() => { api.get("/students").then((r) => setStudents(r.data)); api.get("/batches").then((r) => setBatches(r.data)).catch(() => {}); load(); }, []);

  const openPdf = (id) => {
    const token = localStorage.getItem("edusync_token");
    fetch(`${API}/certificates/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((b) => window.open(URL.createObjectURL(b))).catch(() => toast.error("Could not open PDF"));
  };
  const gen = async () => {
    if (!form.student_id) return toast.error("Select a student");
    setBusy(true);
    try { const { data } = await api.post("/certificates", form); toast.success(`${data.type_label} generated`); await load(); openPdf(data.id); }
    catch (e) { toast.error("Could not generate certificate"); } finally { setBusy(false); }
  };
  const copyLink = (code) => { navigator.clipboard.writeText(`${window.location.origin}/verify-cert/${code}`); toast.success("Verification link copied"); };
  const uploadSeal = async (file) => {
    if (!file) return;
    setSealBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/upload", fd);
      await api.put("/institute", { seal_url: data.url, seal_path: data.path });
      await refreshInstitute?.();
      toast.success("Seal / signature updated — it will appear on new certificates");
    } catch (e) { toast.error("Could not upload seal"); } finally { setSealBusy(false); }
  };
  const doBulk = async () => {
    if (!bulkBatch) return toast.error("Select a class");
    setBulkBusy(true);
    try { const { data } = await api.post("/certificates/bulk", { batch_id: bulkBatch, type: form.type, session: form.session, remarks: form.remarks, signatory_name: form.signatory_name, signatory_designation: form.signatory_designation }); toast.success(`Issued ${data.count} certificate(s) to the class`); await load(); }
    catch (e) { toast.error("Could not bulk-issue"); } finally { setBulkBusy(false); }
  };

  if (!certs) return <Loader />;
  return (
    <div>
      <PageHeader title="Certificate Generator" subtitle="Branded, QR-verified certificates" />
      <Card className="p-6 mb-6 border-slate-200" data-testid="cert-form">
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
          <div className="h-14 w-14 rounded-xl border border-slate-200 bg-slate-50 grid place-items-center overflow-hidden shrink-0">
            {institute?.seal_url ? <img src={fileUrl(institute.seal_url)} alt="seal" className="h-full w-full object-contain" data-testid="cert-seal-preview" /> : <span className="text-[10px] text-slate-400 text-center px-1">No seal</span>}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm">Official Seal / Signature</p>
            <p className="text-xs text-slate-400">Uploaded once, stamped on every certificate (falls back to logo)</p>
          </div>
          <label className="ml-auto text-sm px-3 py-2 border rounded-lg hover:bg-slate-50 cursor-pointer inline-flex items-center gap-2" data-testid="cert-seal-upload">
            {sealBusy ? "Uploading…" : "Upload"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadSeal(e.target.files[0])} />
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div><Label>Student</Label>
            <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
              <SelectTrigger data-testid="cert-student"><SelectValue placeholder="Select student" /></SelectTrigger>
              <SelectContent>{students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.student_id}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Certificate Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger data-testid="cert-type"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Academic Session</Label><Input data-testid="cert-session" value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })} placeholder="2025-26" /></div>
          <div><Label>Remarks / Achievement <span className="text-xs text-slate-400">(optional)</span></Label><Input data-testid="cert-remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="e.g. First prize in Science Quiz" /></div>
          <div><Label>Signatory Name <span className="text-xs text-slate-400">(optional)</span></Label><Input data-testid="cert-signatory-name" value={form.signatory_name} onChange={(e) => setForm({ ...form, signatory_name: e.target.value })} placeholder="e.g. Dr. Shivam Mantri" /></div>
          <div><Label>Signatory Designation <span className="text-xs text-slate-400">(optional)</span></Label><Input data-testid="cert-signatory-desig" value={form.signatory_designation} onChange={(e) => setForm({ ...form, signatory_designation: e.target.value })} placeholder="e.g. Principal" /></div>
        </div>
        <div className="flex flex-wrap items-end gap-3 mt-4">
          <Button data-testid="cert-generate-btn" onClick={gen} disabled={busy} className="btn-gradient"><Award className="h-4 w-4 mr-2" />{busy ? "Generating…" : "Generate Certificate"}</Button>
          <div className="flex items-end gap-2 ml-auto">
            <div><Label className="text-xs text-slate-400">Bulk issue to a class</Label>
              <Select value={bulkBatch} onValueChange={setBulkBatch}>
                <SelectTrigger data-testid="cert-bulk-batch" className="w-[180px]"><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button data-testid="cert-bulk-btn" variant="outline" onClick={doBulk} disabled={bulkBusy}>{bulkBusy ? "Issuing…" : "Issue to whole class"}</Button>
          </div>
        </div>
      </Card>
      <h3 className="font-semibold text-slate-700 mb-3">Recent Certificates</h3>
      {certs.length === 0 ? <Empty icon={Award} title="No certificates yet" /> : (
        <div className="space-y-2">
          {certs.map((ct) => (
            <div key={ct.id} data-testid={`cert-row-${ct.id}`} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
              <div className="min-w-0"><p className="font-semibold text-slate-800 truncate">{ct.type_label} · {ct.student_name}</p><p className="text-xs text-slate-400 font-mono">{ct.cert_no} · {ct.class_label}</p></div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" data-testid={`cert-link-${ct.id}`} onClick={() => copyLink(ct.verify_code)}><Link2 className="h-4 w-4" /></Button>
                <Button size="sm" data-testid={`cert-pdf-${ct.id}`} onClick={() => openPdf(ct.id)} className="btn-gradient"><Download className="h-4 w-4 mr-1" />PDF</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
