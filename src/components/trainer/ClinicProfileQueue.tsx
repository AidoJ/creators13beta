/**
 * Clinic Profile queue — clients referred in by a practitioner and paid for,
 * waiting to be profiled. Trainer/admin only (enforced inside the
 * get_clinic_profile_queue function, not just here).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Stethoscope, RefreshCw } from "lucide-react";

interface QueueRow {
  invitation_id: string;
  client_name: string | null;
  client_email: string | null;
  client_user_id: string | null;
  practitioner_name: string | null;
  paid_at: string | null;
  redeemed_at: string | null;
  client_phone: string | null;
  practitioner_id: string | null;
  photos_uploaded: number | null;
  creator_types_assigned: number | null;
  signup_status: string | null;
}

function stage(r: QueueRow) {
  if ((r.creator_types_assigned ?? 0) > 0) return { label: "Profiled", cls: "border-forest/40 text-forest" };
  if ((r.photos_uploaded ?? 0) > 0) return { label: "Ready to profile", cls: "border-primary/40 text-primary" };
  if (r.client_user_id) return { label: "Signed up — photos pending", cls: "border-secondary/40 text-secondary" };
  return { label: "Awaiting client signup", cls: "border-muted-foreground/40 text-muted-foreground" };
}

export default function ClinicProfileQueue({ onOpenClient }: { onOpenClient?: (userId: string, name: string) => void }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).rpc("get_clinic_profile_queue");
    setRows((data as QueueRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Clinic Profile queue</h3>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0" onClick={load} title="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground text-center">
          No Clinic Profile referrals yet.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => {
            const s = stage(r);
            return (
              <div key={r.invitation_id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.client_name || r.client_email}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.client_email}
                    {r.practitioner_name ? ` • referred by ${r.practitioner_name}` : ""}
                    {typeof r.photos_uploaded === "number" ? ` • ${r.photos_uploaded} photos` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${s.cls}`}>{s.label}</Badge>
                {r.client_user_id && onOpenClient && (
                  <Button variant="outline" size="sm" className="h-7 text-xs flex-shrink-0"
                    onClick={() => onOpenClient(r.client_user_id!, r.client_name || r.client_email || "Client")}>
                    Open
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
