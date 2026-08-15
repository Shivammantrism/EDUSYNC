import { useEffect, useState } from "react";
import api, { API } from "@/lib/api";
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
  const [students, setStudents] = useState([]);
  const [certs, setCerts] = useState(null);
  const [form, setForm] = useState({ student_id: "", type: "bonafide", session: "2025-26", remarks: "" });
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/certificates").then((r) => setCerts(r.data));
  useEffect(() => { api.get("/students").then((r) => setStudents(r.data)); load(); }, []);

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

  if (!certs) return <Loader />;
  return (
    <div>
      <PageHeader title="Certificate Generator" subtitle="Branded, QR-verified certificates" />
      <Card className="p-6 mb-6 border-slate-200" data-testid="cert-form">
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
        </div>
        <Button data-testid="cert-generate-btn" onClick={gen} disabled={busy} className="btn-gradient mt-4"><Award className="h-4 w-4 mr-2" />{busy ? "Generating…" : "Generate Certificate"}</Button>
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
