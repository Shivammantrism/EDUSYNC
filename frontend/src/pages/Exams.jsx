import { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileText, Plus, ClipboardEdit, Trophy } from "lucide-react";

export default function Exams() {
  const { user } = useAuth();
  const isStaff = user.role !== "student";
  const [exams, setExams] = useState(null);
  const [batches, setBatches] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", batch_id: "", subject: "", max_marks: 100, exam_date: new Date().toISOString().slice(0, 10) });
  const [marksExam, setMarksExam] = useState(null);
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [viewExam, setViewExam] = useState(null);
  const [results, setResults] = useState([]);

  const load = () => api.get("/exams").then((r) => setExams(r.data));
  useEffect(() => { load(); if (isStaff) api.get("/batches").then((r) => setBatches(r.data)); }, []);

  const create = async () => {
    try { await api.post("/exams", { ...form, max_marks: Number(form.max_marks) }); toast.success("Exam created"); setOpen(false); load(); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const openMarks = async (exam) => {
    setMarksExam(exam);
    const { data } = await api.get("/students", { params: { batch_id: exam.batch_id } });
    setStudents(data); setMarks({});
  };
  const saveMarks = async () => {
    try { await api.post("/results", { exam_id: marksExam.id, marks }); toast.success("Marks saved & ranked"); setMarksExam(null); }
    catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };
  const openResults = async (exam) => { setViewExam(exam); const { data } = await api.get("/results", { params: { exam_id: exam.id } }); setResults(data); };

  useEffect(() => { if (!isStaff) api.get("/results").then((r) => setResults(r.data)); }, []);

  if (!exams) return <Loader />;

  if (!isStaff) {
    return (
      <div>
        <PageHeader title="My Results" subtitle="Exam performance & grades" />
        <Card className="border-slate-200">
          {results.length === 0 ? <Empty icon={FileText} title="No results yet" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead className="text-right">Marks</TableHead><TableHead className="text-right">%</TableHead><TableHead>Grade</TableHead><TableHead>Rank</TableHead></TableRow></TableHeader>
              <TableBody>{results.map((r) => (
                <TableRow key={r.id}><TableCell className="font-medium">{r.subject}</TableCell><TableCell className="text-right">{r.marks}</TableCell><TableCell className="text-right">{r.percentage}%</TableCell><TableCell><StatusBadge status={r.grade === "F" ? "absent" : "resolved"} /><span className="ml-2 font-semibold">{r.grade}</span></TableCell><TableCell>#{r.rank}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Exams & Results" subtitle={`${exams.length} exams`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-exam-btn" className="btn-gradient"><Plus className="h-4 w-4 mr-2" />Create Exam</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Exam</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Exam Name</Label><Input data-testid="exam-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Unit Test 1" /></div>
              <div><Label>Class</Label>
                <Select value={form.batch_id} onValueChange={(v) => { const b = batches.find((x) => x.id === v); setForm({ ...form, batch_id: v, subject: b?.subject || "" }); }}>
                  <SelectTrigger data-testid="exam-batch"><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                <div><Label>Max Marks</Label><Input type="number" value={form.max_marks} onChange={(e) => setForm({ ...form, max_marks: e.target.value })} /></div>
              </div>
              <div><Label>Exam Date</Label><Input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} /></div>
            </div>
            <DialogFooter><Button data-testid="save-exam-btn" onClick={create} disabled={!form.name || !form.batch_id} className="btn-gradient">Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Card className="border-slate-200">
        {exams.length === 0 ? <Empty icon={FileText} title="No exams yet" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead>Date</TableHead><TableHead>Max</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{exams.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.name}</TableCell><TableCell>{e.subject}</TableCell><TableCell className="text-slate-500">{e.exam_date}</TableCell><TableCell>{e.max_marks}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button data-testid={`marks-${e.id}`} size="sm" variant="outline" onClick={() => openMarks(e)}><ClipboardEdit className="h-3.5 w-3.5 mr-1" />Enter Marks</Button>
                  <Button data-testid={`results-${e.id}`} size="sm" variant="outline" onClick={() => openResults(e)}><Trophy className="h-3.5 w-3.5 mr-1" />Results</Button>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>

      {/* Enter marks dialog */}
      <Dialog open={!!marksExam} onOpenChange={(v) => !v && setMarksExam(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Enter Marks — {marksExam?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {students.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">{s.name}</span>
                <Input data-testid={`marks-input-${s.id}`} type="number" className="w-24" placeholder="0" value={marks[s.id] || ""} onChange={(e) => setMarks({ ...marks, [s.id]: e.target.value })} />
              </div>
            ))}
            {students.length === 0 && <p className="text-sm text-slate-400">No students in this class.</p>}
          </div>
          <DialogFooter><Button data-testid="save-marks-btn" onClick={saveMarks} className="btn-gradient">Save & Rank</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results dialog */}
      <Dialog open={!!viewExam} onOpenChange={(v) => !v && setViewExam(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Results — {viewExam?.name}</DialogTitle></DialogHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Student</TableHead><TableHead className="text-right">Marks</TableHead><TableHead>Grade</TableHead></TableRow></TableHeader>
            <TableBody>{results.map((r) => (
              <TableRow key={r.id}><TableCell className="font-bold">#{r.rank}</TableCell><TableCell>{r.student_name}</TableCell><TableCell className="text-right">{r.marks} ({r.percentage}%)</TableCell><TableCell className="font-semibold">{r.grade}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
          {results.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No marks entered yet.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
