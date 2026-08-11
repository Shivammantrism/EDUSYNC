import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [institute, setInstitute] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInstitute = () => api.get("/institute").then((r) => setInstitute(r.data)).catch(() => {});

  useEffect(() => {
    const token = localStorage.getItem("edusync_token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me")
      .then((r) => { setUser(r.data); return fetchInstitute(); })
      .catch(() => { localStorage.removeItem("edusync_token"); })
      .finally(() => setLoading(false));
  }, []);

  const login = (token, userData) => {
    localStorage.setItem("edusync_token", token);
    setUser(userData);
    fetchInstitute();
  };
  const logout = () => {
    localStorage.removeItem("edusync_token");
    setUser(null);
    setInstitute(null);
  };

  return (
    <AuthContext.Provider value={{ user, institute, loading, login, logout, setUser, refreshInstitute: fetchInstitute }}>
      {children}
    </AuthContext.Provider>
  );
}
