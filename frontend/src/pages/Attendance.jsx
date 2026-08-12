import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { formatErr, fmtDate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { QrCode, Camera, CheckCircle2, UserCheck, ScanLine } from "lucide-react";

export default function Attendance() {
  const { user } = useAuth();
  const isStaff = user.role !== "student";
  const [sp] = useSearchParams();
  const [records, setRecords] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cls, setCls] = useState(sp.get("class") || "");
  const [batches, setBatches] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [manualCode, setManualCode] = useState("");
  const [selfMarked, setSelfMarked] = useState(false);
  const scannerRef = useRef(null);

  const load = () => api.get("/attendance", { params: { date_str: date, ...(cls ? { batch_id: cls } : {}) } }).then((r) => setRecords(r.data));
  useEffect(() => { load(); }, [date, cls]);
  useEffect(() => { if (isStaff) api.get("/batches").then((r) => setBatches(r.data)).catch(() => {}); }, []);

  const startScan = async () => {
    setScanning(true);
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    try {
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
        async (decoded) => { await submitCode(decoded); },
        () => {});
    } catch (e) { toast.error("Camera unavailable. Use manual entry."); setScanning(false); }
  };
  const stopScan = async () => {
    if (scannerRef.current) { try { await scannerRef.current.stop(); } catch {} scannerRef.current = null; }
    setScanning(false);
  };
  useEffect(() => () => { if (scannerRef.current) scannerRef.current.stop().catch(() => {}); }, []);

  const submitCode = async (code) => {
    try {
      const { data } = await api.post("/attendance/scan", { code: code.trim() });
      setLastScan(data.student); toast.success(data.message); load();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const markSelf = async () => { const { data } = await api.post("/teacher-attendance/mark"); toast.success(data.message); setSelfMarked(true); };

  if (!records) return <Loader />;

  return (
    <div>
      <PageHeader title={isStaff ? "Attendance" : "My Attendance"} subtitle="QR scan marks students instantly" actions={
        isStaff && <Button data-testid="self-attendance-btn" variant="outline" onClick={markSelf}><UserCheck className="h-4 w-4 mr-2" />Mark My Attendance</Button>
      } />

      {isStaff && (
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <Card className="p-6 border-slate-200 lg:col-span-1">
            <h3 className="font-semibold mb-4 font-heading flex items-center gap-2"><ScanLine className="h-4 w-4 text-blue-600" />QR Scanner</h3>
            <div id="qr-reader" className="rounded-xl overflow-hidden bg-slate-900 min-h-[200px] flex items-center justify-center">
              {!scanning && <QrCode className="h-16 w-16 text-slate-600" />}
            </div>
            {!scanning ? (
              <Button data-testid="start-scan-btn" onClick={startScan} className="w-full mt-4 btn-gradient"><Camera className="h-4 w-4 mr-2" />Start Camera Scan</Button>
            ) : (
              <Button data-testid="stop-scan-btn" onClick={stopScan} variant="outline" className="w-full mt-4">Stop Scanning</Button>
            )}
            <div className="mt-4 flex gap-2">
              <Input data-testid="manual-code-input" placeholder="Enter Student ID" value={manualCode} onChange={(e) => setManualCode(e.target.value)} />
              <Button data-testid="manual-mark-btn" onClick={() => { submitCode(manualCode); setManualCode(""); }} variant="outline">Mark</Button>
            </div>
            {lastScan && (
              <div className="mt-4 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <div><p className="font-semibold text-sm text-slate-800">{lastScan.name}</p><p className="text-xs text-slate-500">{lastScan.student_id} · Marked present</p></div>
              </div>
            )}
          </Card>
          <Card className="p-6 border-slate-200 lg:col-span-2">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h3 className="font-semibold font-heading">Attendance Records</h3>
              <div className="flex items-center gap-2">
                <Select value={cls || "all"} onValueChange={(v) => setCls(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="attendance-class-filter" className="w-auto min-w-[150px]"><SelectValue placeholder="All classes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" data-testid="attendance-date" />
              </div>
            </div>
            <RecordsTable records={records} />
          </Card>
        </div>
      )}

      {!isStaff && (
        <Card className="p-6 border-slate-200">
          <RecordsTable records={records} hideName />
        </Card>
      )}
    </div>
  );
}

function RecordsTable({ records, hideName }) {
  if (records.length === 0) return <p className="text-sm text-slate-400 py-8 text-center">No records for this date.</p>;
  return (
    <Table>
      <TableHeader><TableRow>{!hideName && <TableHead>Student</TableHead>}<TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Marked At</TableHead></TableRow></TableHeader>
      <TableBody>
        {records.map((r) => (
          <TableRow key={r.id}>
            {!hideName && <TableCell className="font-medium">{r.student_name}</TableCell>}
            <TableCell>{fmtDate(r.date)}</TableCell>
            <TableCell><StatusBadge status={r.status} /></TableCell>
            <TableCell className="text-slate-400 text-xs">{new Date(r.marked_at).toLocaleTimeString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
