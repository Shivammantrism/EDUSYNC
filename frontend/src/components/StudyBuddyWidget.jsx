import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Sparkles, Send, Loader2, X, GraduationCap } from "lucide-react";

const SUGGESTIONS = [
  "Explain photosynthesis simply",
  "Help me solve 3x + 5 = 20",
  "What is the water cycle?",
];

export const StudyBuddyWidget = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [sessionId] = useState(
    () =>
      localStorage.getItem("edusync_ai_session") ||
      (() => {
        const s = "ai-" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("edusync_ai_session", s);
        return s;
      })()
  );
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!open || messages.length) return;
    api
      .get("/student/ai-assistant/history", { params: { session_id: sessionId } })
      .then((r) => setMessages(r.data.messages || []))
      .catch(() => {});
  }, [open, sessionId, messages.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const { data } = await api.post("/student/ai-assistant", { session_id: sessionId, message: q });
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
      setMessages((m) => m.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.button
        data-testid="study-buddy-fab"
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full grid place-items-center shadow-2xl text-white"
        style={{ backgroundImage: "linear-gradient(135deg,#2563eb,#059669)" }}
        aria-label="Open Study Buddy"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            data-testid="study-buddy-panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-24 right-6 z-50 w-[min(92vw,380px)] h-[70vh] max-h-[560px] flex flex-col rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/10 overflow-hidden"
          >
            <div
              className="px-4 py-3.5 flex items-center gap-3 text-white shrink-0"
              style={{ backgroundImage: "linear-gradient(135deg,#0b1e3b,#1a1240)" }}
            >
              <span className="h-9 w-9 rounded-xl grid place-items-center" style={{ backgroundImage: "linear-gradient(135deg,#2563eb,#059669)" }}>
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="leading-tight">
                <p className="font-heading font-bold text-sm">Study Buddy</p>
                <p className="text-[11px] text-blue-200/80">Your 24/7 AI tutor</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50">
              {messages.length === 0 && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-center px-4" data-testid="study-buddy-empty">
                  <GraduationCap className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500 mb-3">Hi {user?.name?.split(" ")[0]}! Ask me any study doubt.</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        data-testid="study-buddy-suggestion"
                        onClick={() => send(s)}
                        className="text-[12px] px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-700 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} data-testid={`study-buddy-msg-${m.role}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] whitespace-pre-wrap leading-relaxed ${
                      m.role === "user" ? "bg-blue-600 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-700 rounded-bl-sm"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2 text-slate-400 text-[13px]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking…
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-slate-100 flex items-center gap-2 shrink-0">
              <input
                data-testid="study-buddy-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your question…"
                disabled={loading}
                className="flex-1 h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <button
                data-testid="study-buddy-send"
                type="submit"
                disabled={loading || !input.trim()}
                className="h-11 w-11 rounded-xl grid place-items-center text-white disabled:opacity-40"
                style={{ backgroundImage: "linear-gradient(135deg,#2563eb,#059669)" }}
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default StudyBuddyWidget;
