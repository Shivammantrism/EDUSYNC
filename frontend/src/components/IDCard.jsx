import { QRCodeSVG } from "qrcode.react";
import { fileUrl } from "@/lib/api";

// CR80 ID card — landscape & portrait, front & back, per-institute theme colors.
const DEF_PRIMARY = "#001E4D", DEF_ACCENT = "#047857", GOLD = "#C9A227";
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export default function IDCard({ student, institute, variant = "student", orientation = "landscape", side = "front" }) {
  const isFaculty = variant === "faculty";
  const isLandscape = orientation !== "portrait";
  const inst = typeof institute === "object" && institute ? institute : { name: institute || "EduSync" };
  const instName = inst.name || "EduSync";
  const P = inst.id_card_primary || DEF_PRIMARY;
  const A = inst.id_card_accent || DEF_ACCENT;
  const idValue = isFaculty ? student.faculty_id : student.student_id;
  const heading = isFaculty ? "STAFF IDENTITY CARD" : "STUDENT IDENTITY CARD";
  const cls = student.class_name || student.batch_name || student.grade || "";
  const section = student.section || "";
  const contact = student.emergency_contact || student.parent_phone || student.phone || "";
  const address = student.address || inst.address || "";

  const rows = (isFaculty
    ? [["Staff ID", idValue], ["Designation", student.designation || "Teacher"], ["Subjects", (student.subjects || []).join(", ")], ["Blood Group", student.blood_group]]
    : [["Roll No", student.roll_no], ["Class / Sec", cls ? `${cls}${section ? " - " + section : ""}` : section], ["Father's Name", student.parent_name], ["DOB", student.dob], ["Blood Group", student.blood_group]]
  ).filter(([, v]) => v && String(v).trim());

  const W = isLandscape ? "85.6mm" : "54mm";
  const H = isLandscape ? "54mm" : "85.6mm";

  const cardBase = {
    width: W, height: H, borderRadius: "3mm", boxShadow: "0 6px 24px rgba(2,30,60,0.25)",
    fontFamily: FONT, color: P, overflow: "hidden", position: "relative",
  };

  // ---------- BACK SIDE ----------
  if (side === "back") {
    const barcode = (idValue || "EDUSYNC").split("").flatMap((ch) => {
      const c = ch.charCodeAt(0);
      return [(c % 3) + 1, (Math.floor(c / 3) % 3) + 1, (c % 2) + 1];
    });
    return (
      <div id="id-card" data-testid={isFaculty ? "faculty-id-card-back" : "id-card-back"} className="id-card-cr80 mx-auto"
        style={{ ...cardBase, background: "#fff", border: `0.5mm solid ${P}` }}>
        <div style={{ background: P, color: "#fff", padding: "1.6mm 3mm", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 800, fontSize: "2.4mm", letterSpacing: "0.2mm" }}>{instName}</span>
          <span style={{ fontSize: "1.7mm", color: GOLD, fontWeight: 700 }}>{isFaculty ? "STAFF CARD" : "STUDENT CARD"}</span>
        </div>
        <div style={{ padding: "2.4mm 3mm", display: "flex", flexDirection: "column", gap: "1.8mm", height: "calc(100% - 6mm)" }}>
          {/* Barcode */}
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", height: "8mm", gap: "0.25mm" }}>
              {barcode.slice(0, 46).map((w, i) => (
                <div key={i} style={{ width: `${w * 0.28}mm`, height: "100%", background: i % 2 ? "#fff" : P }} />
              ))}
            </div>
            <p style={{ margin: "0.6mm 0 0", fontSize: "2mm", letterSpacing: "0.6mm", fontWeight: 700, color: P }}>{idValue}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: "1.7mm", color: "#5b6b7f", textTransform: "uppercase", letterSpacing: "0.15mm" }}>Emergency Contact</p>
            <p style={{ margin: "0.2mm 0 0", fontSize: "2.3mm", fontWeight: 700, color: P }}>{contact || "—"}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: "1.7mm", color: "#5b6b7f", textTransform: "uppercase", letterSpacing: "0.15mm" }}>Terms of Use</p>
            <p style={{ margin: "0.3mm 0 0", fontSize: "1.75mm", lineHeight: 1.35, color: "#334155" }}>
              This card is the property of {instName}. If found, please return to the school office. Not transferable. Report loss immediately. Must be carried on campus at all times.
            </p>
          </div>
          <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ height: "5mm", width: "34mm", borderBottom: `0.35mm solid ${P}` }} />
              <p style={{ margin: "0.5mm 0 0", fontSize: "1.7mm", color: "#5b6b7f" }}>Principal / Authorised Signatory</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- FRONT SIDE ----------
  const bg = isLandscape ? "/id-template-h.png" : "/id-template-v.png";

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
          <span style={{ fontSize: fs.k, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1mm", width: labelW, flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: fs.v, color: P, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
        </div>
      ))}
    </div>
  );

  const ContactLine = ({ fs }) => contact ? (
    <div>
      <span style={{ fontSize: fs.k, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1mm" }}>Contact </span>
      <span style={{ fontSize: fs.v, color: P, fontWeight: 700 }}>{contact}</span>
    </div>
  ) : null;

  const AddressLine = ({ fs, w }) => address ? (
    <div style={{ maxWidth: w }}>
      <span style={{ fontSize: fs.k, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1mm" }}>Address</span>
      <p style={{ fontSize: fs.v, color: P, fontWeight: 500, margin: "0.1mm 0 0", lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{address}</p>
    </div>
  ) : null;

  const QR = ({ style, size }) => (
    <div style={{ ...style, position: "absolute", background: "#fff", padding: "0.6mm", borderRadius: "1mm", border: `0.3mm solid ${GOLD}`, lineHeight: 0 }}>
      <QRCodeSVG value={idValue || "EDUSYNC"} size={size} fgColor={P} />
    </div>
  );

  const NameId = ({ nameFs, idFs }) => (
    <>
      <p style={{ fontWeight: 800, color: P, fontSize: nameFs, lineHeight: 1.05, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{student.name}</p>
      <p style={{ fontSize: idFs, fontWeight: 800, letterSpacing: "0.3mm", color: A, margin: "0.4mm 0 0" }}>{idValue}</p>
    </>
  );

  return (
    <div id="id-card" data-testid={isFaculty ? "faculty-id-card" : "id-card"} className="id-card-cr80 mx-auto"
      style={{ ...cardBase, backgroundImage: `url(${bg})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}>

      {isLandscape ? (
        <>
          <div style={{ position: "absolute", top: "5%", left: "30%", width: "52%" }}>
            <p style={{ fontWeight: 800, color: P, fontSize: "3.3mm", lineHeight: 1.05, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{instName}</p>
            <p style={{ fontSize: "1.9mm", letterSpacing: "0.35mm", color: A, fontWeight: 700, margin: "0.7mm 0 0" }}>{heading}</p>
          </div>
          <Photo style={{ left: "8.2%", top: "29%", width: "22.5%", height: "45%", border: `0.5mm solid ${P}` }} />
          <div style={{ position: "absolute", left: "33.5%", top: "24%", width: "43%" }}>
            <NameId nameFs="3.7mm" idFs="2.6mm" />
            <div style={{ marginTop: "1.2mm" }}><Rows labelW="16mm" fs={{ k: "1.75mm", v: "1.9mm" }} /></div>
          </div>
          {/* Footer: Contact + Address (left), QR (right corner) */}
          <div style={{ position: "absolute", left: "6%", bottom: "5%", width: "70%" }}>
            <ContactLine fs={{ k: "1.7mm", v: "1.9mm" }} />
            <AddressLine fs={{ k: "1.6mm", v: "1.7mm" }} w="52mm" />
          </div>
          <QR style={{ right: "3.5%", bottom: "8%" }} size={42} />
        </>
      ) : (
        <>
          <div style={{ position: "absolute", top: "1.6%", left: "22%", width: "66%", textAlign: "center" }}>
            <p style={{ fontWeight: 800, color: "#fff", fontSize: "2.5mm", lineHeight: 1.1, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 0.3mm 0.6mm rgba(0,0,0,0.45)" }}>{instName}</p>
          </div>
          <Photo style={{ left: "37.5%", top: "7.5%", width: "25%", height: "13.5%", border: `0.5mm solid ${GOLD}` }} />
          <div style={{ position: "absolute", left: "10%", top: "54%", width: "80%", textAlign: "center" }}>
            <p style={{ fontSize: "1.6mm", letterSpacing: "0.3mm", color: A, fontWeight: 700, margin: 0 }}>{heading}</p>
            <NameId nameFs="3mm" idFs="2.3mm" />
          </div>
          <div style={{ position: "absolute", left: "13%", top: "70%", width: "74%", textAlign: "left" }}>
            <Rows labelW="13mm" fs={{ k: "1.6mm", v: "1.75mm" }} />
          </div>
          <div style={{ position: "absolute", left: "13%", bottom: "3.5%", width: "56%", textAlign: "left" }}>
            <AddressLine fs={{ k: "1.5mm", v: "1.65mm" }} w="30mm" />
          </div>
          <QR style={{ right: "8%", bottom: "3.5%" }} size={34} />
        </>
      )}
    </div>
  );
}
