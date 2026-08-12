import { FileText, ArrowLeft } from "lucide-react";

const SECTIONS = [
  { h: "1. Acceptance of Terms", p: "By accessing or using EduSync, you agree to these Terms of Service. If you are using EduSync on behalf of an institute, you represent that you are authorised to bind that institute to these terms." },
  { h: "2. Services", p: "EduSync provides a multi-institute management platform covering admissions, attendance, timetables, fees, salaries, academics, and communications. Features may evolve over time to improve the service." },
  { h: "3. Role-Based Access & Responsibilities", p: "Principals, teachers, and students/parents are granted access appropriate to their role. Account holders are responsible for keeping credentials confidential and for all activity under their account. Misuse, unauthorised access attempts, or sharing of another user's data is prohibited." },
  { h: "4. Student & Child Data", p: "Institutes are responsible for obtaining parental/guardian consent before adding data for students under 18, in accordance with our Privacy Policy and the DPDP Act, 2023. EduSync processes such data only on the institute's documented instructions." },
  { h: "5. Data Protection & Retention", p: "We apply role-based access control, per-institute data isolation, and defined retention periods. Financial records may be retained for statutory periods. Personal data is deleted or anonymised on valid request, subject to legal obligations." },
  { h: "6. Payments", p: "Fee payments are handled through Razorpay in a secure, PCI-compliant manner. Institutes are responsible for the accuracy of fee structures and for reconciling collections. Refunds are governed by the institute's own policy." },
  { h: "7. Acceptable Use", p: "You agree not to upload unlawful content, attempt to breach security, reverse-engineer the platform, or use it to harass or harm others. We may suspend accounts that violate these terms." },
  { h: "8. Limitation of Liability", p: "EduSync is provided on an 'as is' basis. To the maximum extent permitted by law, Privam Solutions is not liable for indirect or consequential damages arising from use of the service." },
  { h: "9. Changes & Governing Law", p: "We may update these terms; continued use constitutes acceptance. These terms are governed by the laws of India, with jurisdiction of the courts as applicable to Privam Solutions." },
];

export default function Terms() {
  return (
    <div data-testid="terms-page" className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-orange-50">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 hover:text-violet-700 mb-8"><ArrowLeft className="h-4 w-4" />Back to Login</a>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center"><FileText className="h-6 w-6 text-white" /></div>
          <h1 className="text-3xl font-extrabold font-heading text-slate-900">Terms of Service</h1>
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
