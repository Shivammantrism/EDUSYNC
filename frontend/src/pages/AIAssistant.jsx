import { useEffect, useRef, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, Send, Loader2, GraduationCap } from "lucide-react";

const SUGGESTIONS = [
  "Explain photosynthesis simply",
  "Help me solve 3x + 5 = 20",
  "What is the water cycle?",
  "Tips to memorise multiplication tables",
];

export default function AIAssistant() {
  const { user } = useAuth();
  const [sessionId] = useState(() => localStorage.getItem("edusync_ai_session") || (() => { const s = "ai-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("edusync_ai_session", s); return s; })());
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { api.get("/student/ai-assistant/history", { params: { session_id: sessionId } }).then((r) => setMessages(r.data.messages || [])).catch(() => {}); }, [sessionId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const { data } = await api.post("/student/ai-assistant", { session_id: sessionId, message: q });
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); setMessages((m) => m.slice(0, -1)); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)]" data-testid="ai-assistant-page">
      <div className="flex items-center gap-3 mb-4">
        <span className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-600 grid place-items-center"><Sparkles className="h-6 w-6 text-white" /></span>
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-900">Study Buddy</h1>
          <p className="text-sm text-slate-500">Your 24/7 AI tutor — ask any study doubt</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6" data-testid="ai-empty">
            <GraduationCap className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-slate-500 mb-4">Ask me anything about your subjects — I'll explain it step by step.</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button key={s} data-testid="ai-suggestion" onClick={() => send(s)} className="text-sm px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-700 transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} data-testid={`ai-msg-${m.role}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "bg-blue-600 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-700 rounded-bl-sm"}`}>{m.text}</div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start"><div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Thinking…</div></div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-3 flex items-center gap-2">
        <Input data-testid="ai-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" className="h-12" disabled={loading} />
        <Button data-testid="ai-send" type="submit" disabled={loading || !input.trim()} className="h-12 px-5 btn-gradient"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
