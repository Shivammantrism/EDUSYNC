import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, StatusBadge } from "@/components/common";
import { Card } from "@/components/ui/card";
import IDCard from "@/components/IDCard";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export default function IDCardPage() {
  const { user, institute } = useAuth();
  const [s, setS] = useState(null);
  useEffect(() => { api.get(`/students/${user.id}`).then((r) => setS(r.data)); }, [user.id]);
  if (!s) return <Loader />;
  return (
    <div>
      <PageHeader title="Digital ID Card" subtitle="Your official student identity card" />
      <div className="flex flex-col items-center gap-6">
        <IDCard student={s} institute={institute} />
        <Button data-testid="print-idcard-btn" onClick={() => window.print()} className="no-print btn-gradient"><Printer className="h-4 w-4 mr-2" />Print / Save as PDF</Button>
      </div>
    </div>
  );
}
