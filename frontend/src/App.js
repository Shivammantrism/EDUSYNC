import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Students from "@/pages/Students";
import StudentDetail from "@/pages/StudentDetail";
import Batches from "@/pages/Batches";
import Teachers from "@/pages/Teachers";
import Attendance from "@/pages/Attendance";
import Timetable from "@/pages/Timetable";
import Fees from "@/pages/Fees";
import Exams from "@/pages/Exams";
import Homework from "@/pages/Homework";
import Salary from "@/pages/Salary";
import Leaves from "@/pages/Leaves";
import Announcements from "@/pages/Announcements";
import Complaints from "@/pages/Complaints";
import Enquiries from "@/pages/Enquiries";
import IDCardPage from "@/pages/IDCardPage";
import Branding from "@/pages/Branding";
import BulkIDCards from "@/pages/BulkIDCards";
import FacultyIDCards from "@/pages/FacultyIDCards";
import Quizzes from "@/pages/Quizzes";
import Gallery from "@/pages/Gallery";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import Terms from "@/pages/Terms";
import SuperAdmin from "@/pages/SuperAdmin";
import ChangePassword from "@/pages/ChangePassword";
import AIAssistant from "@/pages/AIAssistant";
import Certificates from "@/pages/Certificates";
import Analytics from "@/pages/Analytics";
import ClassFees from "@/pages/ClassFees";
import VerifyCertificate from "@/pages/VerifyCertificate";
import { Loader } from "@/components/common";

function Protected({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader /></div>;
  if (!user) return <Navigate to="/" replace />;
  if (user.must_change_password && loc.pathname !== "/app/change-password")
    return <Navigate to="/app/change-password" replace />;
  return children;
}

function Public({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader /></div>;
  if (user) return <Navigate to={user.role === "super_admin" ? "/super-admin" : "/app/dashboard"} replace />;
  return children;
}

function SuperAdminGate({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader /></div>;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== "super_admin" && user.email !== "founder@privamsolutions.in") return <Navigate to="/app/dashboard" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Public><Landing /></Public>} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/verify-cert/:code" element={<VerifyCertificate />} />
            <Route path="/super-admin" element={<SuperAdminGate><SuperAdmin /></SuperAdminGate>} />
            <Route path="/app" element={<Protected><Layout /></Protected>}>
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="students" element={<Students />} />
              <Route path="students/:id" element={<StudentDetail />} />
              <Route path="batches" element={<Batches />} />
              <Route path="teachers" element={<Teachers />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="timetable" element={<Timetable />} />
              <Route path="fees" element={<Fees />} />
              <Route path="exams" element={<Exams />} />
              <Route path="quizzes" element={<Quizzes />} />
              <Route path="homework" element={<Homework />} />
              <Route path="salary" element={<Salary />} />
              <Route path="leaves" element={<Leaves />} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="complaints" element={<Complaints />} />
              <Route path="enquiries" element={<Enquiries />} />
              <Route path="idcard" element={<IDCardPage />} />
              <Route path="settings" element={<Branding />} />
              <Route path="print-ids/:batchId" element={<BulkIDCards />} />
              <Route path="faculty-ids" element={<FacultyIDCards />} />
              <Route path="gallery" element={<Gallery />} />
              <Route path="change-password" element={<ChangePassword />} />
              <Route path="assistant" element={<AIAssistant />} />
              <Route path="certificates" element={<Certificates />} />
              <Route path="class-fees" element={<ClassFees />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
