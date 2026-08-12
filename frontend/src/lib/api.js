import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("edusync_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function fileUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${BACKEND_URL}${path}`;
}

export function fmtDate(s) {
  if (!s) return "";
  const d = new Date(String(s).length <= 10 ? String(s) + "T00:00:00" : s);
  if (isNaN(d.getTime())) return String(s);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function formatErr(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export default api;
