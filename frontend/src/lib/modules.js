// Per-module accent colors used across sidebar + pages
export const MODULE_ACCENTS = {
  dashboard: { hex: "#2563eb", soft: "rgba(37,99,235,0.10)" },
  students: { hex: "#2563eb", soft: "rgba(37,99,235,0.10)" },
  batches: { hex: "#4f46e5", soft: "rgba(79,70,229,0.10)" },
  teachers: { hex: "#4f46e5", soft: "rgba(79,70,229,0.10)" },
  attendance: { hex: "#16a34a", soft: "rgba(22,163,74,0.10)" },
  timetable: { hex: "#0ea5e9", soft: "rgba(14,165,233,0.10)" },
  fees: { hex: "#f97316", soft: "rgba(249,115,22,0.10)" },
  exams: { hex: "#9333ea", soft: "rgba(147,51,234,0.10)" },
  homework: { hex: "#0d9488", soft: "rgba(13,148,136,0.10)" },
  salary: { hex: "#d97706", soft: "rgba(217,119,6,0.10)" },
  leaves: { hex: "#0284c7", soft: "rgba(2,132,199,0.10)" },
  announcements: { hex: "#2563eb", soft: "rgba(37,99,235,0.10)" },
  complaints: { hex: "#dc2626", soft: "rgba(220,38,38,0.10)" },
  enquiries: { hex: "#7c3aed", soft: "rgba(124,58,237,0.10)" },
  idcard: { hex: "#2563eb", soft: "rgba(37,99,235,0.10)" },
};

export function accentFor(path) {
  const key = (path || "").split("/").filter(Boolean).pop();
  return MODULE_ACCENTS[key] || MODULE_ACCENTS.dashboard;
}
