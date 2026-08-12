import { QRCodeSVG } from "qrcode.react";
import { fileUrl } from "@/lib/api";

const TEMPLATES = {
  classic: { grad: "from-blue-600 to-blue-800", accent: "#2563eb" },
  modern: { grad: "from-indigo-600 to-purple-700", accent: "#4f46e5" },
  minimal: { grad: "from-slate-700 to-slate-900", accent: "#334155" },
};

export default function IDCard({ student, institute, variant = "student" }) {
  const isFaculty = variant === "faculty";
  const t = TEMPLATES[student.template || institute?.id_template] || TEMPLATES.classic;
  const instName = (typeof institute === "string" ? institute : institute?.name) || "EduSync";
  const code = typeof institute === "object" ? institute?.code : null;
  const logo = institute?.logo_url ? fileUrl(institute.logo_url) : "/edusync-logo.png";
  const idValue = isFaculty ? student.faculty_id : student.student_id;
  const heading = isFaculty ? "FACULTY IDENTITY CARD" : "STUDENT IDENTITY CARD";
  const designation = isFaculty ? ((student.subjects || []).join(", ") || "Faculty") : null;

  return (
    <div id="id-card" data-testid={isFaculty ? "faculty-id-card" : "id-card"} className="w-[340px] rounded-2xl overflow-hidden shadow-lg border border-slate-200 bg-white mx-auto">
      <div className={`bg-gradient-to-r ${t.grad} p-4 text-white flex items-center gap-2.5`}>
        <div className="h-10 w-10 rounded-lg bg-white p-0.5 flex items-center justify-center overflow-hidden shrink-0">
          <img src={logo} alt="" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm leading-tight font-heading truncate">{instName}</p>
          <p className="text-[10px] text-white/80 tracking-wide">{heading}</p>
        </div>
        {code && <span className="ml-auto shrink-0 text-[10px] font-mono font-semibold bg-white/20 px-1.5 py-0.5 rounded">{code}</span>}
      </div>
      <div className="p-5 flex gap-4">
        <div className="h-24 w-24 rounded-xl overflow-hidden bg-slate-100 border-2 flex items-center justify-center shrink-0" style={{ borderColor: t.accent }}>
          {student.photo_url ? <img src={fileUrl(student.photo_url)} alt="" className="h-full w-full object-cover" /> : <span className="text-3xl font-bold text-slate-300">{(student.name || "?")[0]}</span>}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-slate-900 text-lg leading-tight font-heading truncate">{student.name}</p>
          <p className="text-xs text-slate-500 mt-1">ID: <span className="font-mono font-semibold" style={{ color: t.accent }}>{idValue}</span></p>
          {isFaculty ? (
            <>
              <p className="text-xs text-slate-500 mt-0.5">Designation: Teacher</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">Subjects: {designation}</p>
              {student.phone && <p className="text-xs text-slate-500 mt-0.5">Ph: {student.phone}</p>}
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500 mt-0.5">Age: {student.age} · {student.gender}</p>
              <p className="text-xs text-slate-500 mt-0.5">Guardian: {student.parent_name || "—"}</p>
            </>
          )}
        </div>
      </div>
      <div className="px-5 pb-5 flex items-center justify-between">
        <div className="bg-white p-1.5 rounded-lg border border-slate-200">
          <QRCodeSVG value={idValue || "EDUSYNC"} size={72} fgColor={t.accent} />
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400">{isFaculty ? "Scan to verify" : "Scan for attendance"}</p>
          {institute?.phone && <p className="text-[10px] text-slate-400 mt-0.5">{institute.phone}</p>}
          <p className="text-[10px] text-slate-400 mt-0.5">Powered by EduSync</p>
        </div>
      </div>
      <div className={`h-2 bg-gradient-to-r ${t.grad}`} />
    </div>
  );
}
