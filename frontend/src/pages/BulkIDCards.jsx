import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Loader, Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import IDCard from "@/components/IDCard";
import { Printer, IdCard as IdIcon } from "lucide-react";

export default function BulkIDCards() {
  const { batchId } = useParams();
  const { institute } = useAuth();
  const [students, setStudents] = useState(null);
  const [batch, setBatch] = useState(null);

  useEffect(() => {
    api.get("/students", { params: { batch_id: batchId } }).then((r) => setStudents(r.data));
    api.get("/batches").then((r) => setBatch(r.data.find((b) => b.id === batchId)));
  }, [batchId]);

  if (!students) return <Loader />;
  return (
    <div>
      <div className="no-print">
        <PageHeader title="Batch ID Cards" subtitle={`${batch?.name || ""} · ${students.length} cards ready to print`} actions={
          <Button data-testid="print-batch-btn" onClick={() => window.print()} className="btn-gradient"><Printer className="h-4 w-4 mr-2" />Print All Cards</Button>
        } />
      </div>
      {students.length === 0 ? <Empty icon={IdIcon} title="No students in this batch" /> : (
        <div className="flex flex-wrap gap-6 justify-center">
          {students.map((s) => <IDCard key={s.id} student={s} institute={institute} />)}
        </div>
      )}
    </div>
  );
}
