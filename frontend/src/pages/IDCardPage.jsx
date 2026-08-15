import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader } from "@/components/common";
import IDCard from "@/components/IDCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer } from "lucide-react";

export default function IDCardPage() {
  const { user, institute } = useAuth();
  const [s, setS] = useState(null);
  const [orientation, setOrientation] = useState("landscape");
  useEffect(() => { api.get(`/students/${user.id}`).then((r) => setS(r.data)); }, [user.id]);
  if (!s) return <Loader />;
  return (
    <div>
      <PageHeader title="Digital ID Card" subtitle="Your official student identity card" actions={
        <Select value={orientation} onValueChange={setOrientation}>
          <SelectTrigger data-testid="id-orientation" className="h-9 w-[190px] no-print"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="landscape">Horizontal (Landscape)</SelectItem>
            <SelectItem value="portrait">Vertical (Portrait)</SelectItem>
          </SelectContent>
        </Select>
      } />
      <div className="flex flex-col items-center gap-6">
        <IDCard student={s} institute={institute} orientation={orientation} />
        <Button data-testid="print-idcard-btn" onClick={() => window.print()} className="no-print btn-gradient"><Printer className="h-4 w-4 mr-2" />Print / Save as PDF</Button>
      </div>
    </div>
  );
}
