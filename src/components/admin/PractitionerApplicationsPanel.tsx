import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Application {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  level: number;
  message: string | null;
  status: string;
  created_at: string;
}

const STATUSES = ["new", "contacted", "accepted", "declined"];

export default function PractitionerApplicationsPanel() {
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("practitioner_applications" as any)
      .select("id, name, email, phone, level, message, status, created_at")
      .order("created_at", { ascending: false });
    setRows((data as unknown as Application[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: string) {
    const { error } = await supabase
      .from("practitioner_applications" as any)
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      return;
    }
    setRows((r) => r.map((a) => (a.id === id ? { ...a, status } : a)));
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading applications…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No practitioner applications yet.</p>;

  return (
    <div className="space-y-3">
      {rows.map((a) => (
        <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-foreground">{a.name}</span>
            <Badge variant="outline">Level {a.level}</Badge>
            <Badge variant={a.status === "new" ? "default" : "secondary"}>{a.status}</Badge>
            <span className="ml-auto text-xs text-muted-foreground">
              {new Date(a.created_at).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {a.email}{a.phone ? ` · ${a.phone}` : ""}
          </p>
          {a.message && <p className="text-sm mt-2 whitespace-pre-wrap">{a.message}</p>}
          <div className="flex flex-wrap gap-2 mt-3">
            {STATUSES.filter((s) => s !== a.status).map((s) => (
              <Button key={s} size="sm" variant="outline" className="text-xs" onClick={() => setStatus(a.id, s)}>
                Mark {s}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
