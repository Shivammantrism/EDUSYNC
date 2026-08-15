import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, Loader, Empty, money } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Save, Banknote } from "lucide-react";

const GRADES = ["Nursery", "LKG", "UKG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];

export default function ClassFees() {
  const [structures, setStructures] = useState(null);
  const [grade, setGrade] = useState("Class 1");
  const [comps, setComps] = useState([{ name: "Tuition Fee", amount: "" }]);
  const [saving, setSaving] = useState(false);
  const load = () => api.get("/fee-structures").then((r) => setStructures(r.data));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!structures) return;
    const ex = structures.find((s) => s.grade === grade);
    setComps(ex && ex.components.length ? ex.components.map((c) => ({ name: c.name, amount: c.amount })) : [{ name: "Tuition Fee", amount: "" }]);
  }, [grade, structures]);

  const total = comps.reduce((a, c) => a + (Number(c.amount) || 0), 0);
  const setC = (i, k, v) => setComps(comps.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const save = async () => {
    const valid = comps.filter((c) => c.name.trim() && Number(c.amount) > 0);
    if (!valid.length) return toast.error("Add at least one component with an amount");
    setSaving(true);
    try { await api.post("/fee-structures", { grade, components: valid.map((c) => ({ name: c.name, amount: Number(c.amount) })), frequency: "monthly" }); toast.success(`Fee structure saved for ${grade}`); await load(); }
    catch (e) { toast.error("Could not save"); } finally { setSaving(false); }
  };
  const del = async (id) => { await api.delete(`/fee-structures/${id}`); toast.success("Removed"); load(); };

  if (!structures) return <Loader />;
  return (
    <div>
      <PageHeader title="Class Fee Setup" subtitle="Define fee components per class — auto-applied on admission" />
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 border-slate-200">
          <div className="mb-4"><Label>Class / Grade</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger data-testid="cf-grade"><SelectValue /></SelectTrigger>
              <SelectContent>{GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Label>Fee Components <span className="text-xs text-slate-400">(Tuition, Transport, Lab, Exam, Sports…)</span></Label>
          <div className="space-y-2 mt-1.5">
            {comps.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input data-testid={`cf-name-${i}`} placeholder="Component name" value={c.name} onChange={(e) => setC(i, "name", e.target.value)} />
                <Input data-testid={`cf-amt-${i}`} type="number" placeholder="₹" className="w-28" value={c.amount} onChange={(e) => setC(i, "amount", e.target.value)} />
                <button data-testid={`cf-del-${i}`} onClick={() => setComps(comps.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500 px-1"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button data-testid="cf-add-row" onClick={() => setComps([...comps, { name: "", amount: "" }])} className="text-sm text-blue-600 hover:underline mt-2 inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" />Add component</button>
          <div className="flex items-center justify-between border-t mt-4 pt-3">
            <span className="font-semibold">Total / month</span><span data-testid="cf-total" className="font-extrabold text-emerald-600">{money(total)}</span>
          </div>
          <Button data-testid="cf-save" onClick={save} disabled={saving} className="btn-gradient mt-4 w-full"><Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : `Save ${grade} Structure`}</Button>
        </Card>
        <Card className="p-6 border-slate-200">
          <h3 className="font-semibold text-slate-700 mb-3">Configured Classes</h3>
          {structures.length === 0 ? <Empty icon={Banknote} title="No fee structures yet" /> : (
            <div className="space-y-2">
              {structures.map((s) => (
                <div key={s.id} data-testid={`cf-row-${s.grade}`} className="flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3">
                  <div className="min-w-0"><p className="font-semibold text-slate-800">{s.grade}</p><p className="text-xs text-slate-400 truncate">{(s.components || []).map((c) => c.name).join(", ")}</p></div>
                  <div className="flex items-center gap-3 shrink-0"><span className="font-bold text-emerald-600">{money(s.total)}</span><button data-testid={`cf-remove-${s.grade}`} onClick={() => del(s.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
