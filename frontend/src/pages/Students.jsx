import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatErr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { UserPlus, Users, Search, Upload, Loader2 } from "lucide-react";

export default function Students() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState(null);
  const [batches, setBatches] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const blank = { name: "", age: "", gender: "Male", batch_id: "", parent_name: "", parent_phone: "", monthly_fee: 2000, photo_url: "", template: "classic", password: "student123" };
  const [form, setForm] = useState(blank);

  const load = () => api.get("/students").then((r) => setStudents(r.data));
  useEffect(() => { load(); api.get("/batches").then((r) => setBatches(r.data)); }, []);

  const uploadPhoto = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/upload", fd);
      setForm((f) => ({ ...f, photo_url: data.url }));
      toast.success("Photo uploaded");
    } catch (e) { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/students", { ...form, age: Number(form.age), monthly_fee: Number(form.monthly_fee) });
      toast.success("Student registered");
      setOpen(false); setForm(blank); load();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  if (!students) return <Loader />;
  const filtered = students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.student_id.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="Students" subtitle={`${students.length} enrolled`} actions={
        user.role === "principal" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-student-btn" className="btn-gradient"><UserPlus className="h-4 w-4 mr-2" />Register Student</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Register New Student</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center border">
                    {form.photo_url ? <img src={fileUrl(form.photo_url)} alt="" className="h-full w-full object-cover" /> : <Users className="h-8 w-8 text-slate-300" />}
                  </div>
                  <label className="cursor-pointer">
                    <div className="inline-flex items-center gap-2 text-sm px-3 py-2 border rounded-lg hover:bg-slate-50">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload Photo
                    </div>
                    <input data-testid="student-photo-input" type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && uploadPhoto(e.target.files[0])} />
                  </label>
                </div>
                <div><Label>Full Name</Label><Input data-testid="student-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Age</Label><Input data-testid="student-age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></div>
                  <div><Label>Gender</Label>
                    <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                      <SelectTrigger data-testid="student-gender"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Class</Label>
                  <Select value={form.batch_id} onValueChange={(v) => setForm({ ...form, batch_id: v })}>
                    <SelectTrigger data-testid="student-batch"><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{b.class_name ? ` · ${b.class_name}${b.section ? "-" + b.section : ""}` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Parent Name</Label><Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} /></div>
                  <div><Label>Parent Phone</Label><Input data-testid="student-parent-phone" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Monthly Fee (₹)</Label><Input type="number" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} /></div>
                  <div><Label>ID Card Template</Label>
                    <Select value={form.template} onValueChange={(v) => setForm({ ...form, template: v })}>
                      <SelectTrigger data-testid="student-template"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="classic">Classic Blue</SelectItem><SelectItem value="modern">Modern Indigo</SelectItem><SelectItem value="minimal">Minimal</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-slate-400">Default login password: <span className="font-mono">student123</span></p>
              </div>
              <DialogFooter><Button data-testid="save-student-btn" onClick={save} disabled={saving || !form.name} className="btn-gradient">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )
      } />

      <Card className="border-slate-200">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input data-testid="student-search" placeholder="Search by name or ID..." value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 text-sm outline-none bg-transparent" />
        </div>
        {filtered.length === 0 ? <Empty icon={Users} title="No students found" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Student ID</TableHead><TableHead>Age</TableHead><TableHead>Parent Phone</TableHead><TableHead className="text-right">Fee</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} data-testid={`student-row-${s.id}`} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/app/students/${s.id}`)}>
                  <TableCell><div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold overflow-hidden">
                      {s.photo_url ? <img src={fileUrl(s.photo_url)} alt="" className="h-full w-full object-cover" /> : s.name[0]}
                    </div>
                    <span className="font-medium text-slate-800">{s.name}</span>
                  </div></TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{s.student_id}</TableCell>
                  <TableCell>{s.age}</TableCell>
                  <TableCell className="text-slate-500">{s.parent_phone}</TableCell>
                  <TableCell className="text-right">₹{s.monthly_fee}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
