import { QRCodeSVG } from "qrcode.react";
import { fileUrl } from "@/lib/api";

// CR80 portrait ID card (54mm x 85.6mm) — master template: navy / emerald / gold.
export default function IDCard({ student, institute, variant = "student" }) {
  const isFaculty = variant === "faculty";
  const instName = (typeof institute === "string" ? institute : institute?.name) || "EduSync";
  const code = typeof institute === "object" ? institute?.code : null;
  const logo = institute?.logo_url ? fileUrl(institute.logo_url) : "/edusync-logo.png";
  const idValue = isFaculty ? student.faculty_id : student.student_id;
  const heading = isFaculty ? "FACULTY IDENTITY CARD" : "STUDENT IDENTITY CARD";
  const cls = student.class_name || student.batch_name || student.grade || "—";
  const section = student.section || "—";
  const emergency = student.parent_phone || student.phone || student.emergency_contact || "—";

  const NAVY = "#001E4D", GREEN = "#047857", GOLD = "#C9A227";

  return (
    <div id="id-card" data-testid={isFaculty ? "faculty-id-card" : "id-card"}
      className="id-card-cr80 relative mx-auto overflow-hidden bg-white"
      style={{ width: "54mm", height: "85.6mm", borderRadius: "3mm", boxShadow: "0 6px 24px rgba(2,30,60,0.25)", border: `0.4mm solid ${GOLD}` }}>

      {/* top banner */}
      <div style={{ background: `linear-gradient(115deg, ${NAVY} 60%, ${GREEN})`, height: "17mm", position: "relative" }}>
        <div style={{ position: "absolute", top: "2mm", left: "50%", transform: "translateX(-50%)", width: "9mm", height: "1.4mm", background: "rgba(255,255,255,0.5)", borderRadius: "1mm" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "2mm", padding: "4mm 3mm 0" }}>
          <div style={{ height: "8mm", width: "8mm", borderRadius: "1.6mm", background: "#fff", padding: "0.6mm", flexShrink: 0, display: "flex", border: `0.3mm solid ${GOLD}` }}>
            <img src={logo} alt="" style={{ height: "100%", width: "100%", objectFit: "contain" }} />
          </div>
          <div style={{ minWidth: 0, color: "#fff" }}>
            <p style={{ fontWeight: 800, fontSize: "2.6mm", lineHeight: 1.1, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{instName}</p>
            <p style={{ fontSize: "1.7mm", letterSpacing: "0.3mm", color: GOLD, margin: "0.4mm 0 0" }}>{heading}</p>
          </div>
        </div>
      </div>

      {/* photo in white frame (left) */}
      <div style={{ display: "flex", padding: "3mm", gap: "3mm" }}>
        <div style={{ height: "26mm", width: "22mm", borderRadius: "2mm", overflow: "hidden", background: "#f1f5f9", border: `0.6mm solid ${NAVY}`, boxShadow: `0 0 0 0.4mm ${GOLD}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {student.photo_url ? <img src={fileUrl(student.photo_url)} alt="" style={{ height: "100%", width: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: "10mm", fontWeight: 800, color: "#cbd5e1" }}>{(student.name || "?")[0]}</span>}
        </div>
        <div style={{ minWidth: 0, paddingTop: "1mm" }}>
          <p style={{ fontWeight: 800, color: NAVY, fontSize: "3.4mm", lineHeight: 1.1, margin: 0 }}>{student.name}</p>
          <p style={{ fontSize: "2mm", color: "#64748b", margin: "1mm 0 0" }}>ID</p>
          <p style={{ fontSize: "2.6mm", fontWeight: 700, fontFamily: "monospace", color: GREEN, margin: 0 }}>{idValue}</p>
        </div>
      </div>

      {/* detail rows */}
      <div style={{ padding: "0 3mm" }}>
        {(isFaculty
          ? [["Designation", "Teacher"], ["Subjects", (student.subjects || []).join(", ") || "—"], ["Emergency", emergency]]
          : [["Class", cls], ["Section", section], ["Emergency Contact", emergency]]
        ).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "2mm", borderBottom: "0.2mm solid #eef2f7", padding: "1.3mm 0" }}>
            <span style={{ fontSize: "2mm", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.2mm" }}>{k}</span>
            <span style={{ fontSize: "2.3mm", color: NAVY, fontWeight: 600, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "30mm" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* QR + footer */}
      <div style={{ position: "absolute", bottom: "0", left: 0, right: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 3mm 2mm" }}>
          <div style={{ background: "#fff", padding: "1mm", borderRadius: "1.4mm", border: "0.3mm solid #e2e8f0" }}>
            <QRCodeSVG value={idValue || "EDUSYNC"} size={44} fgColor={NAVY} />
          </div>
          <div style={{ textAlign: "right" }}>
            {code && <p style={{ fontSize: "1.9mm", fontFamily: "monospace", fontWeight: 700, color: GREEN, margin: 0 }}>{code}</p>}
            <p style={{ fontSize: "1.7mm", color: "#94a3b8", margin: "0.4mm 0 0" }}>{isFaculty ? "Scan to verify" : "Scan for attendance"}</p>
            {institute?.phone && <p style={{ fontSize: "1.7mm", color: "#94a3b8", margin: 0 }}>{institute.phone}</p>}
          </div>
        </div>
        <div style={{ height: "3.5mm", background: `linear-gradient(90deg, ${NAVY}, ${GREEN})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: "1.7mm", letterSpacing: "0.3mm" }}>Powered by EduSync — Privam Solutions</span>
        </div>
      </div>
    </div>
  );
}
