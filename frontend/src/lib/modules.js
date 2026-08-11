// Per-module accent colors — premium tri-color palette (navy / emerald / purple)
const NAVY = "#1e3a8a";
const NAVY2 = "#1e40af";
const EMERALD = "#059669";
const EMERALD2 = "#10b981";
const PURPLE = "#7c3aed";
const PURPLE2 = "#8b5cf6";

const mk = (hex, rgb) => ({ hex, soft: `rgba(${rgb},0.10)` });

export const MODULE_ACCENTS = {
  dashboard: mk(NAVY, "30,58,138"),
  students: mk(PURPLE, "124,58,237"),
  batches: mk(EMERALD, "5,150,105"),
  teachers: mk(NAVY, "30,58,138"),
  attendance: mk(EMERALD2, "16,185,129"),
  timetable: mk(PURPLE, "124,58,237"),
  fees: mk(EMERALD, "5,150,105"),
  exams: mk(PURPLE2, "139,92,246"),
  homework: mk(NAVY2, "30,64,175"),
  salary: mk(EMERALD, "5,150,105"),
  leaves: mk(NAVY, "30,58,138"),
  announcements: mk(PURPLE, "124,58,237"),
  complaints: mk(PURPLE2, "139,92,246"),
  enquiries: mk(EMERALD, "5,150,105"),
  settings: mk(NAVY, "30,58,138"),
  idcard: mk(PURPLE, "124,58,237"),
};

export function accentFor(path) {
  const key = (path || "").split("/").filter(Boolean).pop();
  return MODULE_ACCENTS[key] || MODULE_ACCENTS.dashboard;
}
