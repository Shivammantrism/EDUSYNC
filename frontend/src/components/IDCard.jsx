import { QRCodeSVG } from "qrcode.react";
import { fileUrl } from "@/lib/api";
import { MapPin, Phone, Mail, Globe } from "lucide-react";

// CR80 ID card — premium landscape (Shivam-Mantri style) + portrait + back, per-institute theme.
const DEF_PRIMARY = "#001E4D", DEF_ACCENT = "#047857", GOLD = "#C9A227";
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export default function IDCard({ student, institute, variant = "student", orientation = "landscape", side = "front" }) {
  const isFaculty = variant === "faculty";
  const isLandscape = orientation !== "portrait";
  const inst = typeof institute === "object" && institute ? institute : { name: institute || "EduSync" };
  const instName = inst.name || "EduSync";
  const P = inst.id_card_primary || DEF_PRIMARY;
  const A = inst.id_card_accent || DEF_ACCENT;
  const tagline = inst.tagline || "Innovation That Matters";
  const idValue = isFaculty ? student.faculty_id : student.student_id;
  const heading = isFaculty ? "STAFF IDENTITY CARD" : "STUDENT IDENTITY CARD";
  const cls = student.class_name || student.batch_name || student.grade || "";
  const section = student.section || "";
  const contact = student.emergency_contact || student.parent_phone || student.phone || "";
  const email = student.email || student.parent_email || "";
  const schoolAddress = inst.address || "";
  const studentAddress = student.address || "";
  const logo = inst.logo_url ? fileUrl(inst.logo_url) : null;
  const seal = inst.seal_url ? fileUrl(inst.seal_url) : null;
  const website = inst.website || "";
  const tint = (hex, a) => { const h = (hex || "#000").replace("#", ""); const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h; const n = parseInt(f, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  const fields = isFaculty
    ? [["Name", student.name], ["Staff ID", idValue], ["Designation", student.designation || "Teacher"], ["DOB", student.dob], ["Subjects", (student.subjects || []).join(", ")], ["Blood Group", student.blood_group], ["Mobile", contact], ["Email", email], ["Address", studentAddress]]
    : [["Name", student.name], ["Roll No", student.roll_no], ["Class / Sec", cls ? `${cls}${section ? " - " + section : ""}` : section], ["DOB", student.dob], ["Father's Name", student.parent_name], ["Blood Group", student.blood_group], ["Mobile", contact], ["Email", email], ["Address", studentAddress]];

  const W = isLandscape ? "85.6mm" : "54mm";
  const H = isLandscape ? "54mm" : "85.6mm";
  const base = { width: W, height: H, borderRadius: "3mm", boxShadow: "0 6px 24px rgba(2,30,60,0.25)", fontFamily: FONT, color: P, overflow: "hidden", position: "relative" };

  // ---------- BACK ----------
  if (side === "back") {
    const barcode = (idValue || "EDUSYNC").split("").flatMap((ch) => { const c = ch.charCodeAt(0); return [(c % 3) + 1, (Math.floor(c / 3) % 3) + 1, (c % 2) + 1]; });
    return (
      <div id="id-card" data-testid={isFaculty ? "faculty-id-card-back" : "id-card-back"} className="id-card-cr80 mx-auto" style={{ ...base, background: "#fff", border: `0.5mm solid ${P}` }}>
        <div style={{ background: P, color: "#fff", padding: "1.6mm 3mm", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 800, fontSize: "2.4mm" }}>{instName}</span>
          <span style={{ fontSize: "1.7mm", color: GOLD, fontWeight: 700 }}>{isFaculty ? "STAFF CARD" : "STUDENT CARD"}</span>
        </div>
        <div style={{ padding: "2.4mm 3mm", display: "flex", flexDirection: "column", gap: "1.8mm", height: "calc(100% - 6mm)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", height: "8mm", gap: "0.25mm" }}>
              {barcode.slice(0, 46).map((w, i) => <div key={i} style={{ width: `${w * 0.28}mm`, height: "100%", background: i % 2 ? "#fff" : P }} />)}
            </div>
            <p style={{ margin: "0.6mm 0 0", fontSize: "2mm", letterSpacing: "0.6mm", fontWeight: 700, color: P }}>{idValue}</p>
          </div>
          <div><p style={{ margin: 0, fontSize: "1.7mm", color: "#5b6b7f", textTransform: "uppercase" }}>Emergency Contact</p><p style={{ margin: "0.2mm 0 0", fontSize: "2.3mm", fontWeight: 700, color: P }}>{contact || "—"}</p></div>
          <div><p style={{ margin: 0, fontSize: "1.7mm", color: "#5b6b7f", textTransform: "uppercase" }}>Terms of Use</p><p style={{ margin: "0.3mm 0 0", fontSize: "1.75mm", lineHeight: 1.35, color: "#334155" }}>This card is the property of {instName}. If found, please return to the school office. Not transferable. Report loss immediately. Must be carried on campus at all times.</p></div>
          <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}><div style={{ textAlign: "center" }}><div style={{ height: "5mm", width: "34mm", borderBottom: `0.35mm solid ${P}` }} /><p style={{ margin: "0.5mm 0 0", fontSize: "1.7mm", color: "#5b6b7f" }}>Principal / Authorised Signatory</p></div></div>
        </div>
      </div>
    );
  }

  const QR = ({ size }) => (
    <div style={{ background: "#fff", padding: "0.6mm", borderRadius: "1mm", border: `0.3mm solid ${GOLD}`, lineHeight: 0 }}>
      <QRCodeSVG value={idValue || "EDUSYNC"} size={size} fgColor={P} />
    </div>
  );

  const Photo = ({ style }) => (
    <div style={{ ...style, overflow: "hidden", borderRadius: "2mm", background: "#eef2f7", border: `0.6mm solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {student.photo_url ? <img src={fileUrl(student.photo_url)} alt="" style={{ height: "100%", width: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "9mm", fontWeight: 800, color: "#cbd5e1" }}>{(student.name || "?")[0]}</span>}
    </div>
  );

  // ---------- LANDSCAPE FRONT (premium custom layout) ----------
  if (isLandscape) {
    return (
      <div id="id-card" data-testid={isFaculty ? "faculty-id-card" : "id-card"} className="id-card-cr80 mx-auto"
        style={{ ...base, background: `linear-gradient(135deg,#ffffff 0%,#f7f9fc 52%,${tint(P, 0.10)} 100%)`, border: `0.4mm solid ${tint(P, 0.25)}` }}>
        {/* premium accent glows */}
        <div style={{ position: "absolute", top: "-7mm", right: "-7mm", width: "26mm", height: "26mm", borderRadius: "50%", background: tint(A, 0.10), pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "9mm", left: "-6mm", width: "22mm", height: "22mm", borderRadius: "50%", background: tint(P, 0.06), pointerEvents: "none" }} />
        {/* faint watermark initial */}
        <div style={{ position: "absolute", right: "3mm", bottom: "10.5mm", fontSize: "22mm", fontWeight: 900, color: tint(P, 0.05), lineHeight: 1, pointerEvents: "none", userSelect: "none" }}>{(instName || "E")[0]}</div>
        {/* Premium branded header band */}
        <div style={{ display: "flex", alignItems: "center", gap: "2.4mm", padding: "1.8mm 3mm", background: P, borderBottom: `0.6mm solid ${GOLD}` }}>
          <div style={{ height: "9mm", width: "9mm", borderRadius: "1.6mm", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", border: `0.3mm solid ${GOLD}` }}>
            {logo ? <img src={logo} alt="" style={{ height: "100%", width: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: "4.5mm", fontWeight: 800, color: P }}>{(instName || "E")[0]}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 800, color: "#fff", fontSize: "3mm", lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{instName}</p>
            <p style={{ margin: "0.6mm 0 0", fontSize: "1.6mm", letterSpacing: "0.7mm", color: GOLD, fontWeight: 700 }}>{heading}</p>
          </div>
          <div style={{ flexShrink: 0 }}><QR size={40} /></div>
        </div>
        {/* Body */}
        <div style={{ display: "flex", gap: "3mm", padding: "0.6mm 3mm 0", height: "calc(100% - 13mm - 9mm)", alignItems: "flex-start", position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8mm", flexShrink: 0 }}>
            <Photo style={{ width: "20mm", height: "23mm" }} />
            <span style={{ fontSize: "1.4mm", fontWeight: 700, letterSpacing: "0.3mm", color: A, textTransform: "uppercase" }}>{idValue}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.55mm", paddingTop: "0.4mm" }}>
            {fields.filter(([, v]) => v && String(v).trim()).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "baseline", fontSize: k === "Name" ? "2.5mm" : "1.85mm", lineHeight: 1.28 }}>
                <span style={{ width: "22mm", flexShrink: 0, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05mm", fontSize: "1.65mm" }}>{k}</span>
                <span style={{ color: P, fontWeight: 800 }}>:&nbsp;</span>
                <span style={{ color: P, fontWeight: k === "Name" ? 800 : 600, overflow: "hidden", textOverflow: k === "Address" ? "clip" : "ellipsis", whiteSpace: k === "Address" ? "normal" : "nowrap", flex: 1 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Footer */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "9mm", background: P, color: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.6mm", padding: "0 3mm", fontSize: "1.5mm" }}>
          {schoolAddress && <span style={{ display: "flex", alignItems: "flex-start", gap: "0.8mm", lineHeight: 1.15 }}><MapPin size={7} color={GOLD} style={{ flexShrink: 0, marginTop: "0.2mm" }} /><span>{schoolAddress}</span></span>}
          <span style={{ display: "flex", flexWrap: "wrap", gap: "0.6mm 3mm" }}>
            {contact && <span style={{ display: "flex", alignItems: "center", gap: "0.8mm" }}><Phone size={7} color={GOLD} />{contact}</span>}
            {(inst.email || email) && <span style={{ display: "flex", alignItems: "center", gap: "0.8mm" }}><Mail size={7} color={GOLD} />{inst.email || email}</span>}
            {website && <span style={{ display: "flex", alignItems: "center", gap: "0.8mm" }}><Globe size={7} color={GOLD} />{website}</span>}
          </span>
        </div>
      </div>
    );
  }

  // ---------- PORTRAIT FRONT ----------
  const Rows = ({ labelW, fs }) => (
    <div>{fields.slice(1).filter(([, v]) => v && String(v).trim()).map(([k, v]) => (
      <div key={k} style={{ display: "flex", alignItems: "baseline", gap: "1.5mm", padding: "0.45mm 0", borderBottom: "0.12mm solid rgba(0,30,77,0.10)" }}>
        <span style={{ fontSize: fs.k, color: "#475569", textTransform: "uppercase", width: labelW, flexShrink: 0 }}>{k}</span>
        <span style={{ fontSize: fs.v, color: P, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
      </div>
    ))}</div>
  );
  return (
    <div id="id-card" data-testid={isFaculty ? "faculty-id-card" : "id-card"} className="id-card-cr80 mx-auto" style={{ ...base, backgroundImage: "url(/id-template-v.png)", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}>
      <div style={{ position: "absolute", top: "1.6%", left: "22%", width: "66%", textAlign: "center" }}><p style={{ fontWeight: 800, color: "#fff", fontSize: "2.5mm", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 0.3mm 0.6mm rgba(0,0,0,0.45)" }}>{instName}</p></div>
      <Photo style={{ position: "absolute", left: "37.5%", top: "7.5%", width: "25%", height: "13.5%" }} />
      <div style={{ position: "absolute", left: "10%", top: "54%", width: "80%", textAlign: "center" }}>
        <p style={{ fontSize: "1.6mm", letterSpacing: "0.3mm", color: A, fontWeight: 700, margin: 0 }}>{heading}</p>
        <p style={{ fontWeight: 800, color: P, fontSize: "3mm", margin: "0.6mm 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{student.name}</p>
        <p style={{ fontSize: "2.3mm", fontWeight: 800, letterSpacing: "0.3mm", color: A, margin: "0.3mm 0 0" }}>{idValue}</p>
      </div>
      <div style={{ position: "absolute", left: "13%", top: "70%", width: "74%", textAlign: "left" }}><Rows labelW="13mm" fs={{ k: "1.6mm", v: "1.75mm" }} /></div>
      <div style={{ position: "absolute", right: "8%", bottom: "3.5%", background: "#fff", padding: "0.6mm", borderRadius: "1mm", border: `0.3mm solid ${GOLD}`, lineHeight: 0 }}><QRCodeSVG value={idValue || "EDUSYNC"} size={30} fgColor={P} /></div>
    </div>
  );
}
