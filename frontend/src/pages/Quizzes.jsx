import { useEffect, useMemo, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ListChecks, Plus, Trash2, Trophy, Clock, Sparkles, Loader2, CheckCircle2, XCircle, Play, Timer } from "lucide-react";

/* ----------------------------- Teacher: builder ----------------------------- */
function QuizBuilder({ batches, onSaved }) {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState({ name: "", batch_id: "", subject: "", duration_min: 20, marks_per_correct: 1, negative_marks: 0.25 });
  const [questions, setQuestions] = useState([]);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setMeta({ name: "", batch_id: "", subject: "", duration_min: 20, marks_per_correct: 1, negative_marks: 0.25 }); setQuestions([]); setAiTopic(""); };
  const addBlank = () => setQuestions((q) => [...q, { text: "", options: ["", "", "", ""], correct: 0 }]);
  const updateQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const updateOpt = (i, oi, val) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, options: q.options.map((o, j) => (j === oi ? val : o)) } : q)));
  const removeQ = (i) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));

  const aiGenerate = async () => {
    if (!aiTopic) return;
    setAiLoading(true);
    try {
      const { data } = await api.post("/quizzes/ai-generate", { topic: aiTopic, count: Number(aiCount), subject: meta.subject });
      setQuestions((q) => [...q, ...data.questions]);
      toast.success(`Added ${data.questions.length} AI question(s)`);
    } catch (e) { toast.error(formatErr(e.response?.data?.detail) || "AI generation failed"); }
    finally { setAiLoading(false); }
  };

  const valid = meta.name && meta.batch_id && questions.length > 0 &&
    questions.every((q) => q.text.trim() && q.options.every((o) => o.trim() !== ""));

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/quizzes", {
        ...meta, duration_min: Number(meta.duration_min), marks_per_correct: Number(meta.marks_per_correct),
        negative_marks: Number(meta.negative_marks), questions,
      });
      toast.success("Test published"); setOpen(false); reset(); onSaved();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild><Button data-testid="add-quiz-btn" className="btn-gradient"><Plus className="h-4 w-4 mr-2" />Create Online Test</Button></DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create MCQ Online Test</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Test Name</Label><Input data-testid="quiz-name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Algebra Unit Test" /></div>
            <div><Label>Class</Label>
              <Select value={meta.batch_id} onValueChange={(v) => { const b = batches.find((x) => x.id === v); setMeta({ ...meta, batch_id: v, subject: b?.subject || "" }); }}>
                <SelectTrigger data-testid="quiz-batch"><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>{batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div><Label>Subject</Label><Input value={meta.subject} onChange={(e) => setMeta({ ...meta, subject: e.target.value })} /></div>
            <div><Label>Duration (min)</Label><Input data-testid="quiz-duration" type="number" value={meta.duration_min} onChange={(e) => setMeta({ ...meta, duration_min: e.target.value })} /></div>
            <div><Label>Marks / correct</Label><Input data-testid="quiz-mpc" type="number" step="0.25" value={meta.marks_per_correct} onChange={(e) => setMeta({ ...meta, marks_per_correct: e.target.value })} /></div>
            <div><Label>Negative / wrong</Label><Input data-testid="quiz-neg" type="number" step="0.25" value={meta.negative_marks} onChange={(e) => setMeta({ ...meta, negative_marks: e.target.value })} /></div>
          </div>

          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-violet-700"><Sparkles className="h-4 w-4" />AI Question Generator</div>
            <div className="flex gap-2">
              <Input data-testid="ai-topic" className="flex-1 bg-white" placeholder="Topic e.g. Photosynthesis" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} />
              <Input data-testid="ai-count" type="number" className="w-20 bg-white" min={1} max={15} value={aiCount} onChange={(e) => setAiCount(e.target.value)} />
              <Button data-testid="ai-generate-btn" type="button" variant="outline" onClick={aiGenerate} disabled={aiLoading || !aiTopic}>{aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}</Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Questions ({questions.length})</Label>
              <Button data-testid="add-question-btn" type="button" size="sm" variant="outline" onClick={addBlank}><Plus className="h-3.5 w-3.5 mr-1" />Add Question</Button>
            </div>
            {questions.length === 0 && <p className="text-sm text-slate-400">No questions yet — add manually or generate with AI.</p>}
            {questions.map((q, i) => (
              <div key={i} data-testid={`question-block-${i}`} className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-xs font-bold text-slate-400">Q{i + 1}</span>
                  <Textarea data-testid={`q-text-${i}`} className="flex-1" rows={2} placeholder="Question text" value={q.text} onChange={(e) => updateQ(i, { text: e.target.value })} />
                  <button data-testid={`del-question-${i}`} onClick={() => removeQ(i)} className="mt-2 text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2 pl-6">
                  {q.options.map((o, oi) => (
                    <label key={oi} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 cursor-pointer ${q.correct === oi ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`}>
                      <input data-testid={`q-${i}-correct-${oi}`} type="radio" name={`correct-${i}`} checked={q.correct === oi} onChange={() => updateQ(i, { correct: oi })} className="text-emerald-600" />
                      <Input data-testid={`q-${i}-opt-${oi}`} className="h-8 border-0 shadow-none px-1 focus-visible:ring-0" placeholder={`Option ${oi + 1}`} value={o} onChange={(e) => updateOpt(i, oi, e.target.value)} />
                    </label>
                  ))}
                </div>
                <p className="pl-6 text-[11px] text-emerald-600">Correct: Option {q.correct + 1}</p>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter><Button data-testid="publish-quiz-btn" onClick={save} disabled={!valid || saving} className="btn-gradient">{saving ? "Publishing..." : "Publish Test"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Teacher: results ----------------------------- */
function QuizResults({ quiz, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/quizzes/${quiz.id}/results`).then((r) => setData(r.data)); }, [quiz.id]);
  const a = data?.analytics;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="quiz-results-dialog">
        <DialogHeader><DialogTitle>Results — {quiz.name}</DialogTitle></DialogHeader>
        {!data ? <Loader /> : (
          <>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[["Attempts", a.attempts], ["Avg %", a.avg_percentage], ["Top %", a.highest], ["Passed", a.pass_count]].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-slate-200 p-2.5 text-center"><p className="text-lg font-extrabold text-slate-800">{v}</p><p className="text-[11px] text-slate-400">{k}</p></div>
              ))}
            </div>
            {data.attempts.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No attempts yet.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Student</TableHead><TableHead className="text-right">Score</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
                <TableBody>{data.attempts.map((at, i) => (
                  <TableRow key={at.id}><TableCell className="font-bold">#{i + 1}</TableCell><TableCell>{at.student_name}</TableCell><TableCell className="text-right">{at.score}/{at.total}</TableCell><TableCell className="text-right font-semibold">{at.percentage}%</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Student: attempt ----------------------------- */
function AttemptView({ quiz, onDone }) {
  const [answers, setAnswers] = useState({});
  const [secs, setSecs] = useState((quiz.duration_min || 20) * 60);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState(quiz.my_attempt || null);

  const submit = async (auto = false) => {
    if (submitting || score) return;
    setSubmitting(true);
    try {
      const { data } = await api.post("/quizzes/attempt", { quiz_id: quiz.id, answers });
      setScore(data);
      if (auto) toast.info("Time's up — test auto-submitted");
      else toast.success("Test submitted");
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); onDone(); }
    finally { setSubmitting(false); }
  };

  useEffect(() => {
    if (score) return;
    if (secs <= 0) { submit(true); return; }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs, score]);

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const answered = Object.keys(answers).length;

  if (score) return <ScoreCard score={score} onDone={onDone} />;

  return (
    <div data-testid="attempt-view">
      <div className="flex items-center justify-between mb-5 sticky top-0 z-10 bg-slate-50/80 backdrop-blur py-2">
        <div>
          <h2 className="text-xl font-bold font-heading text-slate-900">{quiz.name}</h2>
          <p className="text-sm text-slate-400">{quiz.subject} · {quiz.questions.length} questions · {answered}/{quiz.questions.length} answered</p>
        </div>
        <div data-testid="quiz-timer" className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-lg font-bold ${secs < 60 ? "bg-red-100 text-red-600" : "bg-slate-900 text-white"}`}>
          <Timer className="h-4 w-4" />{mm}:{ss}
        </div>
      </div>
      <div className="space-y-4">
        {quiz.questions.map((q, i) => (
          <Card key={i} data-testid={`attempt-q-${i}`} className="p-5 border-slate-200">
            <p className="font-medium text-slate-800 mb-3"><span className="text-slate-400 mr-2">Q{i + 1}.</span>{q.text}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {q.options.map((o, oi) => (
                <label key={oi} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${answers[i] === oi ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input data-testid={`attempt-q-${i}-opt-${oi}`} type="radio" name={`q-${i}`} checked={answers[i] === oi} onChange={() => setAnswers({ ...answers, [i]: oi })} className="text-violet-600" />
                  <span className="text-sm text-slate-700">{o}</span>
                </label>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <div className="sticky bottom-0 mt-6 flex justify-end gap-3 bg-slate-50/80 backdrop-blur py-3">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button data-testid="submit-attempt-btn" onClick={() => submit(false)} disabled={submitting} className="btn-gradient">{submitting ? "Submitting..." : "Submit Test"}</Button>
      </div>
    </div>
  );
}

function ScoreCard({ score, onDone }) {
  return (
    <div data-testid="scorecard">
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 p-8 text-white text-center mb-6">
        <p className="text-sm opacity-80">Your Score</p>
        <p className="text-5xl font-extrabold my-2" data-testid="scorecard-score">{score.score} / {score.total}</p>
        <p className="text-lg font-semibold">{score.percentage}%</p>
        <div className="flex justify-center gap-6 mt-4 text-sm">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />{score.correct} correct</span>
          <span className="flex items-center gap-1"><XCircle className="h-4 w-4" />{score.wrong} wrong</span>
          <span className="opacity-80">{score.unattempted} skipped</span>
        </div>
      </div>
      <h3 className="font-semibold text-slate-800 mb-3 font-heading">Answer Review</h3>
      <div className="space-y-3">
        {score.review.map((r, i) => (
          <Card key={i} data-testid={`review-q-${i}`} className="p-4 border-slate-200">
            <p className="font-medium text-slate-800 mb-2"><span className="text-slate-400 mr-2">Q{i + 1}.</span>{r.text}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {r.options.map((o, oi) => {
                const isCorrect = oi === r.correct;
                const isSelected = oi === r.selected;
                let cls = "border-slate-200 text-slate-600";
                if (isCorrect) cls = "border-emerald-400 bg-emerald-50 text-emerald-700";
                else if (isSelected) cls = "border-red-400 bg-red-50 text-red-700";
                return (
                  <div key={oi} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`}>
                    {isCorrect ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : isSelected ? <XCircle className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0" />}
                    {o}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      <div className="flex justify-end mt-6"><Button data-testid="back-to-tests-btn" onClick={onDone} className="btn-gradient">Back to Tests</Button></div>
    </div>
  );
}

/* ----------------------------- Main page ----------------------------- */
export default function Quizzes() {
  const { user } = useAuth();
  const isStaff = user.role !== "student";
  const [quizzes, setQuizzes] = useState(null);
  const [batches, setBatches] = useState([]);
  const [resultsFor, setResultsFor] = useState(null);
  const [attempting, setAttempting] = useState(null);
  const [reviewing, setReviewing] = useState(null);

  const load = () => api.get("/quizzes").then((r) => setQuizzes(r.data));
  useEffect(() => { load(); if (isStaff) api.get("/batches").then((r) => setBatches(r.data)); }, []);

  const startTest = async (qz) => {
    const { data } = await api.get(`/quizzes/${qz.id}`);
    setAttempting(data);
  };
  const viewAnswers = async (qz) => {
    const { data } = await api.get(`/quizzes/${qz.id}`);
    if (data.my_attempt) setReviewing(data.my_attempt);
  };
  const del = async (id) => { await api.delete(`/quizzes/${id}`); toast.success("Test deleted"); load(); };

  if (!quizzes) return <Loader />;

  if (attempting) {
    return <AttemptView quiz={attempting} onDone={() => { setAttempting(null); load(); }} />;
  }
  if (reviewing) {
    return <ScoreCard score={reviewing} onDone={() => setReviewing(null)} />;
  }

  return (
    <div>
      <PageHeader title="Online Tests (MCQ)" subtitle={isStaff ? `${quizzes.length} tests` : "Attempt timed multiple-choice tests"}
        actions={isStaff ? <QuizBuilder batches={batches} onSaved={load} /> : null} />

      {quizzes.length === 0 ? <Empty icon={ListChecks} title={isStaff ? "No tests yet" : "No tests assigned"} /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {quizzes.map((qz) => (
            <Card key={qz.id} data-testid={`quiz-card-${qz.id}`} className="p-5 border-slate-200 stat-card flex flex-col">
              <div className="h-10 w-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-3"><ListChecks className="h-5 w-5" /></div>
              <p className="font-bold text-slate-900 font-heading">{qz.name}</p>
              <p className="text-sm text-slate-500 mt-0.5">{qz.subject}</p>
              <div className="flex flex-wrap gap-2 mt-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 bg-slate-100 rounded-md px-2 py-1"><ListChecks className="h-3 w-3" />{qz.question_count} Q</span>
                <span className="inline-flex items-center gap-1 bg-slate-100 rounded-md px-2 py-1"><Clock className="h-3 w-3" />{qz.duration_min}m</span>
                <span className="inline-flex items-center gap-1 bg-slate-100 rounded-md px-2 py-1">{qz.total_marks} marks</span>
                {qz.negative_marks > 0 && <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 rounded-md px-2 py-1">-{qz.negative_marks}/wrong</span>}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                {isStaff ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{qz.attempt_count} attempt(s)</span>
                    <div className="flex gap-2">
                      <Button data-testid={`quiz-results-${qz.id}`} size="sm" variant="outline" onClick={() => setResultsFor(qz)}><Trophy className="h-3.5 w-3.5 mr-1" />Results</Button>
                      <button data-testid={`del-quiz-${qz.id}`} onClick={() => del(qz.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ) : qz.my_attempt ? (
                  <div className="flex items-center justify-between gap-2">
                    <span data-testid={`quiz-score-${qz.id}`} className="text-sm font-bold text-slate-800">{qz.my_attempt.score}/{qz.my_attempt.total} · {qz.my_attempt.percentage}%</span>
                    <Button data-testid={`view-answers-${qz.id}`} size="sm" variant="outline" onClick={() => viewAnswers(qz)}>View Answers</Button>
                  </div>
                ) : (
                  <Button data-testid={`start-quiz-${qz.id}`} size="sm" className="w-full btn-gradient" onClick={() => startTest(qz)}><Play className="h-3.5 w-3.5 mr-1" />Start Test</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {resultsFor && <QuizResults quiz={resultsFor} onClose={() => setResultsFor(null)} />}
    </div>
  );
}
