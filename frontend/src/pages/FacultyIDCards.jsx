import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import IDCard from "@/components/IDCard";
import { Printer, IdCard as IdIcon } from "lucide-react";

export default function FacultyIDCards() {
  const { institute } = useAuth();
  const [teachers, setTeachers] = useState(null);

  useEffect(() => { api.get("/teachers").then((r) => setTeachers(r.data)); }, []);

  if (!teachers) return <Loader />;
  return (
    <div>
      <div className="no-print">
        <PageHeader title="Faculty ID Cards" subtitle={`${teachers.length} faculty cards ready to print`} actions={
          <Button data-testid="print-faculty-btn" onClick={() => window.print()} className="btn-gradient"><Printer className="h-4 w-4 mr-2" />Print All Cards</Button>
        } />
      </div>
      {teachers.length === 0 ? <Empty icon={IdIcon} title="No faculty yet" /> : (
        <div className="flex flex-wrap gap-6 justify-center">
          {teachers.map((t) => <IDCard key={t.id} student={t} institute={institute} variant="faculty" />)}
        </div>
      )}
    </div>
  );
}
