import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("edusync_install_dismissed") === "1");

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setDeferred(null); localStorage.setItem("edusync_install_dismissed", "1"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };
  const dismiss = () => { setDismissed(true); localStorage.setItem("edusync_install_dismissed", "1"); };

  if (!deferred || dismissed) return null;

  return (
    <div data-testid="install-prompt" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center gap-3 rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 px-4 py-3">
        <div className="h-10 w-10 rounded-xl bg-white ring-1 ring-slate-100 p-1 flex items-center justify-center flex-shrink-0">
          <img src="/edusync-logo.png" alt="EduSync" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 leading-tight">Install EduSync</p>
          <p className="text-xs text-slate-500 leading-tight">Add to your home screen for quick access & alerts.</p>
        </div>
        <button data-testid="install-app-btn" onClick={install}
          className="flex items-center gap-1.5 text-sm font-semibold text-white px-3.5 py-2 rounded-xl flex-shrink-0"
          style={{ background: "linear-gradient(90deg,#1E3A8A,#059669)" }}>
          <Download className="h-4 w-4" /> Install
        </button>
        <button data-testid="install-dismiss-btn" onClick={dismiss} className="text-slate-300 hover:text-slate-500 flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
