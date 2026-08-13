import { ShieldCheck, ArrowLeft, Mail, UserCog } from "lucide-react";

const SECTIONS = [
  { h: "1. Data We Collect", p: "To operate as a school-management platform, EduSync collects and processes student and staff information including names, dates of birth, guardian details, contact numbers, attendance records, academic grades and results, examination data, fee and payment records, generated Student/Faculty IDs, ID-card details, and uploaded documents/photographs. We follow data minimisation — collecting only what is necessary for the stated educational purpose." },
  { h: "2. Encrypted Cloud Storage", p: "All data is stored on secured, encrypted cloud servers. Information is encrypted both in transit (TLS/HTTPS) and at rest. Access is protected by authentication, role-based authorisation, and per-institute isolation. Student data tables are logically classified as RESTRICTED and are subject to high-security, role-scoped access controls. We never sell personal data." },
  { h: "3. 30-Day Data Retention Policy", p: "On account closure, student withdrawal, or a valid erasure request, associated personal data is deleted or irreversibly anonymised within 30 days, except where a specific record must be retained to comply with a legal or statutory obligation (e.g., certain financial/audit records). Active records are retained only for the duration they are needed to provide the service." },
  { h: "4. DPDP Act, 2023 Compliance", p: "We process personal data in line with India's Digital Personal Data Protection Act, 2023. Institutes act as Data Fiduciaries and EduSync (Privam Solutions) acts as a Data Processor. Data Principals — or their lawful guardians — have the right to access, correct, and erase their data, to withdraw consent, and to seek grievance redressal. We honour verifiable correction and erasure requests within the timelines above." },
  { h: "5. Verifiable Parental Consent for Minors", p: "For any student below 18 years, personal data is processed only after the institute obtains verifiable consent from a parent or lawful guardian, recorded at the time of registration. We do not undertake tracking, behavioural monitoring, or targeted advertising directed at children. Consent may be withdrawn at any time by contacting the institute administrator or our Grievance Officer." },
  { h: "6. Role-Based Access Control", p: "Access is strictly scoped by role. Principals see institute-wide data; teachers see only their assigned classes and students; students/parents see only their own records. Each institute workspace is isolated, preventing any cross-institute data access." },
  { h: "7. Payments & Financial Data", p: "Fee payments are processed securely via Razorpay. EduSync does not store full card numbers or UPI credentials; only transaction references and receipts are retained for accounting and audit purposes." },
];

export default function PrivacyPolicy() {
  return (
    <div data-testid="privacy-policy-page" className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-emerald-700 mb-8"><ArrowLeft className="h-4 w-4" />Back to Login</a>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-600 grid place-items-center"><ShieldCheck className="h-6 w-6 text-white" /></div>
          <h1 className="text-3xl font-extrabold font-heading text-slate-900">Privacy &amp; Compliance</h1>
        </div>
        <p className="text-sm text-slate-500 mb-8">EduSync by Privam Solutions · Last updated June 2026</p>
        <div className="space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.h} className="bg-white/80 backdrop-blur rounded-2xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-800 font-heading mb-2">{s.h}</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{s.p}</p>
            </section>
          ))}

          <section data-testid="grievance-officer-section" className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6">
            <div className="flex items-center gap-2 mb-2">
              <UserCog className="h-5 w-5 text-emerald-700" />
              <h2 className="font-bold text-slate-800 font-heading">Grievance Officer</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              In accordance with the DPDP Act, 2023, you may contact our Grievance Officer for any privacy concern or to exercise your data rights (access, correction, erasure, consent withdrawal).
            </p>
            <div className="text-sm text-slate-700 space-y-1">
              <p><span className="font-semibold">Name:</span> Shivam Mantri</p>
              <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-emerald-700" />
                <a href="mailto:founder@privamsolutions.in" className="font-semibold text-emerald-700 hover:underline" data-testid="grievance-email">founder@privamsolutions.in</a>
              </p>
            </div>
          </section>
        </div>
        <p className="text-xs text-slate-400 text-center mt-10">© 2026 Privam Solutions. All rights reserved.</p>
      </div>
    </div>
  );
}
