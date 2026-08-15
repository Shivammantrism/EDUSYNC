import { QRCodeSVG } from "qrcode.react";
import { fileUrl } from "@/lib/api";

// CR80 ID card (85.6mm x 54mm) — supports landscape & portrait, navy/emerald/gold theme.
const NAVY = "#001E4D", GREEN = "#047857", GOLD = "#C9A227";

export default function IDCard({ student, institute, variant = "student", orientation = "landscape" }) {
  const isFaculty = variant === "faculty";
  const isLandscape = orientation !== "portrait";
  const inst = typeof institute === "object" && institute ? institute : { name: institute || "EduSync" };
  const instName = inst.name || "EduSync";
  const idValue = isFaculty ? student.faculty_id : student.student_id;
  const heading = isFaculty ? "STAFF IDENTITY CARD" : "STUDENT IDENTITY CARD";
  const cls = student.class_name || student.batch_name || student.grade || "";
  const section = student.section || "";
  const emergency = student.emergency_contact || student.parent_phone || student.phone || "";

  const rows = (isFaculty
    ? [["Designation", "Teacher"], ["Staff ID", idValue], ["Subjects", (student.subjects || []).join(", ")], ["Phone", student.phone || emergency], ["Blood Group", student.blood_group]]
    : [["Roll No", student.roll_no], ["Class / Sec", cls ? `${cls}${section ? " / " + section : ""}` : ""], ["Father's Name", student.parent_name],
       ["DOB", student.dob], ["Blood Group", student.blood_group], ["Contact", emergency]]
  ).filter(([, v]) => v && String(v).trim()).slice(0, isLandscape ? 5 : 4);

  const bg = isLandscape ? "/id-template-h.png" : "/id-template-v.png";
  const W = isLandscape ? "85.6mm" : "54mm";
  const H = isLandscape ? "54mm" : "85.6mm";

  const Photo = ({ style }) => (
    <div style={{ ...style, position: "absolute", overflow: "hidden", borderRadius: "1.4mm", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {student.photo_url
        ? <img src={fileUrl(student.photo_url)} alt="" style={{ height: "100%", width: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: "8mm", fontWeight: 800, color: "#cbd5e1" }}>{(student.name || "?")[0]}</span>}
    </div>
  );

  const Rows = ({ labelW, fs }) => (
    <div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: "1.5mm", padding: "0.55mm 0", borderBottom: "0.12mm solid rgba(0,30,77,0.10)" }}>
          <span style={{ fontSize: fs.k, color: "#5b6b7f", textTransform: "uppercase", letterSpacing: "0.1mm", width: labelW, flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: fs.v, color: NAVY, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
        </div>
      ))}
    </div>
  );

  const QR = ({ style }) => (
    <div style={{ ...style, position: "absolute", background: "#fff", padding: "0.7mm", borderRadius: "1mm", border: `0.3mm solid ${GOLD}`, lineHeight: 0 }}>
      <QRCodeSVG value={idValue || "EDUSYNC"} size={isLandscape ? 42 : 40} fgColor={NAVY} />
    </div>
  );

  return (
    <div id="id-card" data-testid={isFaculty ? "faculty-id-card" : "id-card"}
      className="id-card-cr80 relative mx-auto overflow-hidden"
      style={{ width: W, height: H, borderRadius: "3mm", boxShadow: "0 6px 24px rgba(2,30,60,0.25)",
        backgroundImage: `url(${bg})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", fontFamily: "Arial, sans-serif" }}>

      {isLandscape ? (
        <>
          {/* Institute name top */}
          <div style={{ position: "absolute", top: "5%", left: "30%", width: "54%" }}>
            <p style={{ fontWeight: 800, color: NAVY, fontSize: "3.4mm", lineHeight: 1.05, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{instName}</p>
            <p style={{ fontSize: "1.9mm", letterSpacing: "0.35mm", color: GREEN, fontWeight: 700, margin: "0.8mm 0 0" }}>{heading}</p>
          </div>
          <Photo style={{ left: "8.2%", top: "29%", width: "22.5%", height: "45%", border: `0.5mm solid ${NAVY}` }} />
          {/* Name + ID + details */}
          <div style={{ position: "absolute", left: "35%", top: "27%", width: "60%" }}>
            <p style={{ fontWeight: 800, color: NAVY, fontSize: "4mm", lineHeight: 1.05, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{student.name}</p>
            <p style={{ fontSize: "3mm", fontWeight: 700, fontFamily: "monospace", color: GREEN, margin: "0.6mm 0 1.4mm" }}>{idValue}</p>
            <Rows labelW="20mm" fs={{ k: "1.85mm", v: "2mm" }} />
          </div>
          <QR style={{ right: "4%", bottom: "9%" }} />
        </>
      ) : (
        <>
          {/* Institute name top strip */}
          <div style={{ position: "absolute", top: "1.6%", left: "22%", width: "66%", textAlign: "center" }}>
            <p style={{ fontWeight: 800, color: "#fff", fontSize: "2.5mm", lineHeight: 1.1, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 0.3mm 0.6mm rgba(0,0,0,0.4)" }}>{instName}</p>
          </div>
          <Photo style={{ left: "37.5%", top: "7.5%", width: "25%", height: "13.5%", border: `0.5mm solid ${GOLD}` }} />
          {/* Details panel (lower cream area) */}
          <div style={{ position: "absolute", left: "16%", top: "57.5%", width: "68%", textAlign: "center" }}>
            <p style={{ fontSize: "1.65mm", letterSpacing: "0.3mm", color: GREEN, fontWeight: 700, margin: 0 }}>{heading}</p>
            <p style={{ fontWeight: 800, color: NAVY, fontSize: "3.1mm", lineHeight: 1.1, margin: "0.7mm 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{student.name}</p>
            <p style={{ fontSize: "2.4mm", fontWeight: 700, fontFamily: "monospace", color: GREEN, margin: "0.3mm 0 1.2mm" }}>{idValue}</p>
            <div style={{ textAlign: "left" }}><Rows labelW="13mm" fs={{ k: "1.7mm", v: "1.85mm" }} /></div>
          </div>
          <QR style={{ left: "50%", bottom: "2.5%", transform: "translateX(-50%)" }} />
        </>
      )}
    </div>
  );
}
