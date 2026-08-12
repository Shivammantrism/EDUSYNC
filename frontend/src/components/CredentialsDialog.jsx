import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Mail, MailX, Copy, KeyRound } from "lucide-react";

export default function CredentialsDialog({ result, onClose }) {
  if (!result) return null;
  const { name, loginId, loginIdLabel, temp_password, email_sent, email_recipients = [], roleLabel } = result;

  const copyAll = () => {
    navigator.clipboard.writeText(`${loginIdLabel}: ${loginId}\nTemporary Password: ${temp_password}`);
    toast.success("Credentials copied");
  };

  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="credentials-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="h-5 w-5" /></span>
            {roleLabel} account created
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 min-w-0 ${email_sent ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} data-testid="cred-email-status">
            {email_sent ? <Mail className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <MailX className="h-4 w-4 flex-shrink-0 mt-0.5" />}
            {email_sent
              ? <span className="break-all min-w-0">Welcome email sent to {email_recipients.join(", ")}</span>
              : <span className="break-all min-w-0">{email_recipients.length ? "Couldn't email automatically. Share these credentials manually." : "No email on file — share these credentials manually."}</span>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{loginIdLabel}</p>
              <p className="font-mono font-bold text-slate-800 text-lg" data-testid="cred-login-id">{loginId}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 flex items-center gap-1"><KeyRound className="h-3 w-3" /> Temporary Password</p>
              <p className="font-mono font-bold text-blue-700 text-lg" data-testid="cred-temp-password">{temp_password}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">Ask {name} to change this password after first login.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" data-testid="cred-copy-btn" onClick={copyAll}><Copy className="h-4 w-4 mr-2" />Copy</Button>
          <Button data-testid="cred-done-btn" className="btn-gradient" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
