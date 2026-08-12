import { ShieldCheck, ArrowLeft } from "lucide-react";

const SECTIONS = [
  { h: "1. Student Data Protection", p: "EduSync collects and processes student information (name, date of birth, guardian details, attendance, academic records, fee data and documents) solely to deliver institute-management services. Data is encrypted in transit, access-controlled, and never sold. We collect only what is necessary for the stated educational purpose (data minimisation)." },
  { h: "2. DPDP Act, 2023 Compliance", p: "We process personal data in line with India's Digital Personal Data Protection Act, 2023. Institutes act as Data Fiduciaries and EduSync (Privam Solutions) acts as a Data Processor. Data Principals (or their lawful guardians) have the right to access, correct, and erase their data, to withdraw consent, and to grievance redressal. We honour verifiable data-erasure and correction requests within statutory timelines." },
  { h: "3. Parental Consent for Child Data", p: "For any student below 18 years, personal data is processed only after obtaining verifiable consent from a parent or lawful guardian. We do not undertake tracking, behavioural monitoring, or targeted advertising directed at children. Consent can be withdrawn at any time by contacting the institute administrator." },
  { h: "4. Role-Based Access Control", p: "Access to data is strictly scoped by role. Principals see institute-wide data; teachers see only their assigned classes and students; students/parents see only their own records. Every workspace is isolated per institute, preventing cross-institute data access." },
  { h: "5. Data Retention Policy", p: "Active student and financial records are retained for the duration of enrolment and for a statutory period thereafter (typically up to 7 years for financial/fee records as required by law). On account closure or a valid erasure request, personal data is deleted or irreversibly anonymised, except where retention is legally mandated." },
  { h: "6. Payments & Financial Data", p: "Fee payments are processed securely via Razorpay. EduSync does not store full card numbers or UPI credentials; only transaction references and receipts are retained for accounting and audit purposes." },
  { h: "7. Grievances", p: "For any privacy concern or to exercise your rights under the DPDP Act, contact your institute's Data Protection point of contact, or write to Privam Solutions at privacy@privam.solutions." },
];

export default function PrivacyPolicy() {
  return (
    <div data-testid="privacy-policy-page" className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-orange-50">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 hover:text-violet-700 mb-8"><ArrowLeft className="h-4 w-4" />Back to Login</a>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center"><ShieldCheck className="h-6 w-6 text-white" /></div>
          <h1 className="text-3xl font-extrabold font-heading text-slate-900">Privacy Policy</h1>
        </div>
        <p className="text-sm text-slate-500 mb-8">EduSync by Privam Solutions · Last updated June 2026</p>
        <div className="space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.h} className="bg-white/80 backdrop-blur rounded-2xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-800 font-heading mb-2">{s.h}</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{s.p}</p>
            </section>
          ))}
        </div>
        <p className="text-xs text-slate-400 text-center mt-10">© 2026 Privam Solutions. All rights reserved.</p>
      </div>
    </div>
  );
}
