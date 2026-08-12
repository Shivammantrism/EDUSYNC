import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { fileUrl, API } from "@/lib/api";
import { PageHeader, Loader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import IDCard from "@/components/IDCard";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Upload, FileText, Printer, Trash2, Download, Sparkles, Loader2, File } from "lucide-react";

export default function StudentDetail() {
  const { id } = useParams();
  const { user, institute } = useAuth();
  const [s, setS] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [savingRemarks, setSavingRemarks] = useState(false);

  const load = () => api.get(`/students/${id}`).then((r) => {
    setS(r.data);
    setRemarks(r.data.remarks || "");
  });
  useEffect(() => { load(); }, [id]);
  if (!s) return <Loader />;

  const uploadDoc = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      await api.post(`/students/${id}/documents`, fd);
      toast.success("Document uploaded"); load();
    } catch (e) { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };
  const delDoc = async (docId) => { await api.delete(`/students/${id}/documents/${docId}`); load(); };

  const printCard = () => window.print();
  const downloadReport = () => {
    const token = localStorage.getItem("edusync_token");
    fetch(`${API}/students/${id}/report`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((b) => { const u = URL.createObjectURL(b); window.open(u); });
  };
  const genSummary = async () => {
    setAiLoading(true);
    try { const { data } = await api.post("/ai/report-summary", { student_id: id }); setSummary(data.summary); }
    catch (e) { toast.error("AI summary failed"); }
    finally { setAiLoading(false); }
  };
  const saveRemarks = async () => {
    setSavingRemarks(true);
    try { await api.put(`/students/${id}/remarks`, { remarks }); toast.success("Remarks saved — included in report card"); }
    catch (e) { toast.error("Failed to save remarks"); }
    finally { setSavingRemarks(false); }
  };

  return (
    <div>
      <PageHeader title={s.name} subtitle={`Student ID: ${s.student_id}`} actions={
        <Button data-testid="report-card-btn" variant="outline" onClick={downloadReport}><Download className="h-4 w-4 mr-2" />Report Card PDF</Button>
      } />
      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
          <TabsTrigger value="idcard" data-testid="tab-idcard">ID Card</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6 border-slate-200 flex flex-col items-center text-center">
              <div className="h-28 w-28 rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center mb-4">
                {s.photo_url ? <img src={fileUrl(s.photo_url)} alt="" className="h-full w-full object-cover" /> : <span className="text-4xl font-bold text-slate-300">{s.name[0]}</span>}
              </div>
              <p className="font-bold text-lg text-slate-900 font-heading">{s.name}</p>
              <p className="text-sm text-slate-400 font-mono">{s.student_id}</p>
            </Card>
            <Card className="p-6 border-slate-200 md:col-span-2">
              <h3 className="font-semibold mb-4 font-heading">Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[["Age", s.age], ["Gender", s.gender], ["Guardian", s.parent_name || "—"], ["Parent Phone", s.parent_phone || "—"], ["Monthly Fee", `₹${s.monthly_fee}`], ["Joined", s.join_month]].map(([k, v]) => (
                  <div key={k}><p className="text-xs uppercase tracking-wide text-slate-400">{k}</p><p className="font-medium text-slate-800 mt-0.5">{v}</p></div>
                ))}
              </div>
              {user.role !== "student" && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-500" />AI Performance Summary</h4>
                    <Button data-testid="ai-summary-btn" size="sm" variant="outline" onClick={genSummary} disabled={aiLoading}>{aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}</Button>
                  </div>
                  {summary && <p className="text-sm text-slate-600 bg-indigo-50 rounded-lg p-3 leading-relaxed">{summary}</p>}
                </div>
              )}
              {user.role !== "student" && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm">Teacher's Remarks <span className="text-xs font-normal text-slate-400">· shown on report card</span></h4>
                    <Button data-testid="save-remarks-btn" size="sm" variant="outline" onClick={saveRemarks} disabled={savingRemarks}>{savingRemarks ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
                  </div>
                  <Textarea data-testid="remarks-input" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Add remarks for the report card (e.g. conduct, strengths, areas to improve)..." />
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <Card className="p-6 border-slate-200">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold font-heading">Documents ({s.documents?.length || 0})</h3>
              {user.role !== "student" && (
                <label className="cursor-pointer">
                  <div className="inline-flex items-center gap-2 text-sm px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload PDF
                  </div>
                  <input data-testid="doc-upload-input" type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadDoc(e.target.files[0])} />
                </label>
              )}
            </div>
            {(!s.documents || s.documents.length === 0) ? <p className="text-sm text-slate-400 py-8 text-center">No documents uploaded.</p> : (
              <div className="grid sm:grid-cols-2 gap-3">
                {s.documents.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 border border-slate-200 rounded-xl p-3">
                    <div className="h-10 w-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><FileText className="h-5 w-5" /></div>
                    <a href={fileUrl(d.url)} target="_blank" rel="noreferrer" className="flex-1 text-sm font-medium text-slate-700 hover:text-blue-600 truncate">{d.name}</a>
                    {user.role !== "student" && <button data-testid={`del-doc-${d.id}`} onClick={() => delDoc(d.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="idcard">
          <div className="flex flex-col items-center gap-6">
            <IDCard student={s} institute={institute} />
            <Button data-testid="print-idcard-btn" onClick={printCard} className="no-print btn-gradient"><Printer className="h-4 w-4 mr-2" />Print ID Card</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
