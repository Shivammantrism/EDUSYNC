import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { Loader } from "@/components/common";
import { ShieldCheck, ShieldX } from "lucide-react";

export default function VerifyCertificate() {
  const { code } = useParams();
  const [res, setRes] = useState(null);
  useEffect(() => { api.get(`/certificates/verify/${code}`).then((r) => setRes(r.data)).catch(() => setRes({ valid: false })); }, [code]);
  if (!res) return <div className="min-h-screen grid place-items-center"><Loader /></div>;
  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ backgroundImage: "linear-gradient(135deg,#0b1e3b,#1a1240)" }}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center" data-testid="verify-result">
        {res.valid ? (
          <>
            <div className="h-16 w-16 rounded-full bg-emerald-100 grid place-items-center mx-auto mb-4"><ShieldCheck className="h-9 w-9 text-emerald-600" /></div>
            <h1 className="text-2xl font-extrabold text-slate-800">Certificate Verified</h1>
            <p className="text-sm text-emerald-600 font-semibold mb-5">This is a genuine certificate</p>
            <div className="text-left space-y-2 text-sm bg-slate-50 rounded-xl p-4">
              {[["Type", res.type], ["Certificate No", res.cert_no], ["Student", res.student_name], ["Class", res.class_label], ["Roll No", res.roll_no], ["Session", res.session], ["Institute", res.institute_name]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><span className="text-slate-400">{k}</span><span className="font-semibold text-slate-800 text-right">{v || "—"}</span></div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="h-16 w-16 rounded-full bg-red-100 grid place-items-center mx-auto mb-4"><ShieldX className="h-9 w-9 text-red-600" /></div>
            <h1 className="text-2xl font-extrabold text-slate-800">Not Found</h1>
            <p className="text-sm text-red-500 mt-2">This certificate could not be verified. It may be invalid or forged.</p>
          </>
        )}
        <p className="text-xs text-slate-400 mt-6">Powered by EduSync — Privam Solutions</p>
      </div>
    </div>
  );
}
