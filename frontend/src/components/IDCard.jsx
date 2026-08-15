import { QRCodeSVG } from "qrcode.react";
import { fileUrl } from "@/lib/api";

// CR80 portrait ID card (54mm x 85.6mm) — master template: navy / emerald / gold.
export default function IDCard({ student, institute, variant = "student" }) {
  const isFaculty = variant === "faculty";
  const inst = typeof institute === "object" && institute ? institute : { name: institute || "EduSync" };
  const instName = inst.name || "EduSync";
  const logo = inst.logo_url ? fileUrl(inst.logo_url) : "/edusync-logo.png";
  const contactLine = [inst.phone, inst.email].filter(Boolean).join("  •  ");
  const idValue = isFaculty ? student.faculty_id : student.student_id;
  const heading = isFaculty ? "STAFF IDENTITY CARD" : "STUDENT IDENTITY CARD";
  const cls = student.class_name || student.batch_name || student.grade || "";
  const section = student.section || "";
  const emergency = student.emergency_contact || student.parent_phone || student.phone || "";
  const NAVY = "#001E4D", GREEN = "#047857", GOLD = "#C9A227";

  const rows = (isFaculty
    ? [["Designation", "Teacher"], ["Staff ID", idValue], ["Subjects", (student.subjects || []).join(", ")], ["Phone", student.phone || emergency]]
    : [["Roll No", student.roll_no], ["Class / Sec", cls ? `${cls}${section ? " / " + section : ""}` : ""], ["Father's Name", student.parent_name],
       ["DOB", student.dob], ["Blood Group", student.blood_group], ["Emergency", emergency]]
  ).filter(([, v]) => v && String(v).trim());
  const address = student.address || inst.address || "";

  return (
    <div id="id-card" data-testid={isFaculty ? "faculty-id-card" : "id-card"}
      className="id-card-cr80 relative mx-auto overflow-hidden bg-white"
      style={{ width: "54mm", height: "85.6mm", borderRadius: "3mm", boxShadow: "0 6px 24px rgba(2,30,60,0.25)", border: `0.4mm solid ${GOLD}`, fontFamily: "Arial, sans-serif" }}>

      {/* Header: school branding */}
      <div style={{ background: `linear-gradient(115deg, ${NAVY} 62%, ${GREEN})`, padding: "2.4mm 3mm", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
          <div style={{ height: "9mm", width: "9mm", borderRadius: "1.6mm", background: "#fff", padding: "0.6mm", flexShrink: 0, display: "flex", border: `0.3mm solid ${GOLD}` }}>
            <img src={logo} alt="" style={{ height: "100%", width: "100%", objectFit: "contain" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 800, fontSize: "3mm", lineHeight: 1.05, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{instName}</p>
            {inst.address && <p style={{ fontSize: "1.6mm", lineHeight: 1.2, margin: "0.5mm 0 0", opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inst.address}</p>}
            {contactLine && <p style={{ fontSize: "1.6mm", lineHeight: 1.2, margin: "0.3mm 0 0", color: "#ffe9a8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{contactLine}</p>}
          </div>
        </div>
        <p style={{ fontSize: "1.7mm", letterSpacing: "0.4mm", textAlign: "center", margin: "1.6mm 0 0", color: GOLD, fontWeight: 700 }}>{heading}</p>
      </div>

      {/* Photo + name/id */}
      <div style={{ display: "flex", padding: "2.4mm 3mm 1.5mm", gap: "3mm" }}>
        <div style={{ height: "21mm", width: "17mm", borderRadius: "1.6mm", overflow: "hidden", background: "#f1f5f9", border: `0.6mm solid ${NAVY}`, boxShadow: `0 0 0 0.4mm ${GOLD}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {student.photo_url ? <img src={fileUrl(student.photo_url)} alt="" style={{ height: "100%", width: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: "9mm", fontWeight: 800, color: "#cbd5e1" }}>{(student.name || "?")[0]}</span>}
        </div>
        <div style={{ minWidth: 0, paddingTop: "0.5mm" }}>
          <p style={{ fontWeight: 800, color: NAVY, fontSize: "3.6mm", lineHeight: 1.05, margin: 0 }}>{student.name}</p>
          <p style={{ fontSize: "1.8mm", color: "#94a3b8", margin: "1.2mm 0 0", textTransform: "uppercase", letterSpacing: "0.2mm" }}>{isFaculty ? "Staff ID" : "Student ID"}</p>
          <p style={{ fontSize: "2.7mm", fontWeight: 700, fontFamily: "monospace", color: GREEN, margin: 0 }}>{idValue}</p>
          {!isFaculty && cls && <p style={{ fontSize: "2.2mm", color: NAVY, fontWeight: 600, margin: "1mm 0 0" }}>{cls}{section ? ` · Sec ${section}` : ""}</p>}
        </div>
      </div>

      {/* Detail rows */}
      <div style={{ padding: "0 3mm" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "2mm", borderBottom: "0.15mm solid #eef2f7", padding: "0.85mm 0" }}>
            <span style={{ fontSize: "1.85mm", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.15mm", flexShrink: 0 }}>{k}</span>
            <span style={{ fontSize: "2.05mm", color: NAVY, fontWeight: 600, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "32mm" }}>{v}</span>
          </div>
        ))}
        {address && (
          <div style={{ padding: "1mm 0 0" }}>
            <span style={{ fontSize: "1.85mm", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.15mm" }}>Address</span>
            <p style={{ fontSize: "1.95mm", color: NAVY, fontWeight: 500, margin: "0.3mm 0 0", lineHeight: 1.25 }}>{address}</p>
          </div>
        )}
      </div>

      {/* Footer: QR + code */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 3mm 1.4mm" }}>
          <div style={{ background: "#fff", padding: "0.8mm", borderRadius: "1.2mm", border: "0.3mm solid #e2e8f0" }}>
            <QRCodeSVG value={idValue || "EDUSYNC"} size={38} fgColor={NAVY} />
          </div>
          <div style={{ textAlign: "right" }}>
            {inst.code && <p style={{ fontSize: "1.9mm", fontFamily: "monospace", fontWeight: 700, color: GREEN, margin: 0 }}>{inst.code}</p>}
            <p style={{ fontSize: "1.6mm", color: "#94a3b8", margin: "0.3mm 0 0" }}>{isFaculty ? "Scan to verify" : "Scan for attendance"}</p>
          </div>
        </div>
        <div style={{ height: "3.2mm", background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: "1.6mm", letterSpacing: "0.3mm" }}>Powered by EduSync — Privam Solutions</span>
        </div>
      </div>
    </div>
  );
}
