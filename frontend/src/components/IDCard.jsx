import { QRCodeSVG } from "qrcode.react";
import { fileUrl } from "@/lib/api";

// CR80 ID card (85.6mm x 54mm) — supports landscape & portrait, navy/emerald/gold theme.
const NAVY = "#001E4D", GREEN = "#047857", GOLD = "#C9A227";
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

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
  const address = student.address || inst.address || "";

  const prominent = isFaculty
    ? (student.designation || "Teacher")
    : (cls ? `Class ${cls}${section ? " • Sec " + section : ""}` : (section ? `Sec ${section}` : ""));

  const rows = (isFaculty
    ? [["Staff ID", idValue], ["Subjects", (student.subjects || []).join(", ")], ["Phone", student.phone || emergency], ["Blood Group", student.blood_group]]
    : [["Roll No", student.roll_no], ["Father's Name", student.parent_name], ["DOB", student.dob], ["Blood Group", student.blood_group], ["Contact", emergency]]
  ).filter(([, v]) => v && String(v).trim());

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
        <div key={k} style={{ display: "flex", alignItems: "baseline", gap: "1.5mm", padding: "0.5mm 0", borderBottom: "0.12mm solid rgba(0,30,77,0.10)" }}>
          <span style={{ fontSize: fs.k, color: "#5b6b7f", textTransform: "uppercase", letterSpacing: "0.1mm", width: labelW, flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: fs.v, color: NAVY, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
        </div>
      ))}
    </div>
  );

  const Address = ({ fs, lines = 2 }) => address ? (
    <div style={{ marginTop: "1.1mm" }}>
      <span style={{ fontSize: fs.k, color: "#5b6b7f", textTransform: "uppercase", letterSpacing: "0.1mm" }}>Address</span>
      <p style={{ fontSize: fs.v, color: NAVY, fontWeight: 500, margin: "0.2mm 0 0", lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{address}</p>
    </div>
  ) : null;

  const NameId = ({ nameFs, idFs, promFs, center }) => (
    <>
      <p style={{ fontWeight: 800, color: NAVY, fontSize: nameFs, lineHeight: 1.05, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{student.name}</p>
      <p style={{ fontSize: idFs, fontWeight: 800, letterSpacing: "0.3mm", color: GREEN, margin: "0.4mm 0 0" }}>{idValue}</p>
      {prominent && (
        <div style={{ display: "inline-block", margin: "0.9mm 0 0", padding: "0.5mm 1.6mm", borderRadius: "1mm", background: "rgba(0,30,77,0.07)" }}>
          <span style={{ fontSize: promFs, fontWeight: 800, color: NAVY }}>{prominent}</span>
        </div>
      )}
    </>
  );

  const QR = ({ style, size }) => (
    <div style={{ ...style, position: "absolute", background: "#fff", padding: "0.6mm", borderRadius: "1mm", border: `0.3mm solid ${GOLD}`, lineHeight: 0 }}>
      <QRCodeSVG value={idValue || "EDUSYNC"} size={size} fgColor={NAVY} />
    </div>
  );

  return (
    <div id="id-card" data-testid={isFaculty ? "faculty-id-card" : "id-card"}
      className="id-card-cr80 relative mx-auto overflow-hidden"
      style={{ width: W, height: H, borderRadius: "3mm", boxShadow: "0 6px 24px rgba(2,30,60,0.25)",
        backgroundImage: `url(${bg})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", fontFamily: FONT }}>

      {isLandscape ? (
        <>
          <div style={{ position: "absolute", top: "5%", left: "30%", width: "52%" }}>
            <p style={{ fontWeight: 800, color: NAVY, fontSize: "3.3mm", lineHeight: 1.05, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{instName}</p>
            <p style={{ fontSize: "1.9mm", letterSpacing: "0.35mm", color: GREEN, fontWeight: 700, margin: "0.7mm 0 0" }}>{heading}</p>
          </div>
          <Photo style={{ left: "8.2%", top: "29%", width: "22.5%", height: "45%", border: `0.5mm solid ${NAVY}` }} />
          {/* Name + ID + prominent line */}
          <div style={{ position: "absolute", left: "33.5%", top: "24%", width: "43%" }}>
            <NameId nameFs="3.8mm" idFs="2.7mm" promFs="2.2mm" />
          </div>
          {/* Detail rows */}
          <div style={{ position: "absolute", left: "33.5%", top: "50%", width: "43%" }}>
            <Rows labelW="17mm" fs={{ k: "1.8mm", v: "1.95mm" }} />
            <Address fs={{ k: "1.6mm", v: "1.75mm" }} lines={2} />
          </div>
          <QR style={{ right: "3.5%", bottom: "10%" }} size={44} />
        </>
      ) : (
        <>
          <div style={{ position: "absolute", top: "1.6%", left: "22%", width: "66%", textAlign: "center" }}>
            <p style={{ fontWeight: 800, color: "#fff", fontSize: "2.5mm", lineHeight: 1.1, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 0.3mm 0.6mm rgba(0,0,0,0.45)" }}>{instName}</p>
          </div>
          <Photo style={{ left: "37.5%", top: "7.5%", width: "25%", height: "13.5%", border: `0.5mm solid ${GOLD}` }} />
          {/* Heading + name + id + prominent (centered) */}
          <div style={{ position: "absolute", left: "10%", top: "53.5%", width: "80%", textAlign: "center" }}>
            <p style={{ fontSize: "1.6mm", letterSpacing: "0.3mm", color: GREEN, fontWeight: 700, margin: 0 }}>{heading}</p>
            <NameId nameFs="3mm" idFs="2.3mm" promFs="2mm" center />
          </div>
          {/* Rows */}
          <div style={{ position: "absolute", left: "13%", top: "74%", width: "74%", textAlign: "left" }}>
            <Rows labelW="13mm" fs={{ k: "1.65mm", v: "1.8mm" }} />
          </div>
          {/* Address bottom-left, QR bottom-right corner */}
          <div style={{ position: "absolute", left: "13%", bottom: "3.5%", width: "56%", textAlign: "left" }}>
            <Address fs={{ k: "1.55mm", v: "1.7mm" }} lines={2} />
          </div>
          <QR style={{ right: "8%", bottom: "3.5%" }} size={34} />
        </>
      )}
    </div>
  );
}
