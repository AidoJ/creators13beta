/**
 * Profiling queue — everything A'Hara routes by hand:
 *  - Clinic Profile referrals (practitioner-initiated, paid)
 *  - Handoffs: clients whose own practitioner is Level 1/2 and so can't
 *    assign Creator Types, once their photos are in.
 * Trainer/admin only (enforced inside the database functions, not just here).
 *
 * The "Receives unassigned clients" list is the single eligibility concept:
 * it filters the practitioner picker for direct Body Profile buyers AND
 * backs the manual reassign control below.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Stethoscope, RefreshCw, Users } from "lucide-react";

interface QueueRow {
  entry_kind: "clinic" | "handoff";
  invitation_id: string | null;
  client_name: string | null;
  client_email: string | null;
  client_user_id: string | null;
  practitioner_name: string | null;
  practitioner_id: string | null;
  paid_at: string | null;
  photos_uploaded: number | null;
  creator_types_assigned: number | null;
}

interface EligibleRow {
  user_id: string;
  name: string;
  email: string;
  is_trainer: boolean;
  certification_level: number | null;
  eligible: boolean;
}

function stage(r: QueueRow) {
  if ((r.creator_types_assigned ?? 0) > 0) return { label: "Profiled", cls: "border-forest/40 text-forest" };
  if ((r.photos_uploaded ?? 0) > 0) return { label: "Ready to profile", cls: "border-primary/40 text-primary" };
  if (r.client_user_id) return { label: "Signed up — photos pending", cls: "border-secondary/40 text-secondary" };
  return { label: "Awaiting client signup", cls: "border-muted-foreground/40 text-muted-foreground" };
}

export default function ClinicProfileQueue({ onOpenClient }: { onOpenClient?: (userId: string, name: string) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [eligible, setEligible] = useState<EligibleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [q, e] = await Promise.all([
      (supabase as any).rpc("get_clinic_profile_queue"),
      (supabase as any).rpc("list_unassigned_eligibility"),
    ]);
    setRows((q.data as QueueRow[]) ?? []);
    setEligible((e.data as EligibleRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEligible = async (r: EligibleRow, v: boolean) => {
    setBusy(r.user_id);
    const { error } = await (supabase as any).rpc("set_unassigned_eligibility", { _user_id: r.user_id, _eligible: v });
    setBusy(null);
    if (error) { toast({ title: "Couldn't update", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const reassign = async (row: QueueRow, practitionerId: string) => {
    if (!row.client_user_id) return;
    setBusy(row.client_user_id);
    const { error } = await (supabase as any).rpc("reassign_client_profiler", { _client_id: row.client_user_id, _practitioner_id: practitionerId });
    setBusy(null);
    if (error) { toast({ title: "Couldn't reassign", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Client reassigned" });
    load();
  };

  if (loading) {
    return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const targets = eligible.filter((e) => e.eligible);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Profiling queue</h3>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0" onClick={load} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          Clinic Profile referrals, plus handoffs — clients whose practitioner is Level 1 or 2 and can't assign Creator Types.
        </p>
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">Nothing in the queue.</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => {
              const s = stage(r);
              const key = r.invitation_id ?? `h-${r.client_user_id}`;
              return (
                <div key={key} className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[12rem]">
                    <p className="text-sm font-medium text-foreground truncate">{r.client_name || r.client_email}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.client_email}
                      {r.practitioner_name ? ` • ${r.entry_kind === "handoff" ? "practitioner" : "referred by"} ${r.practitioner_name}` : ""}
                      {typeof r.photos_uploaded === "number" ? ` • ${r.photos_uploaded} photos` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">
                    {r.entry_kind === "handoff" ? "Handoff" : "Clinic Profile"}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${s.cls}`}>{s.label}</Badge>
                  {r.entry_kind === "handoff" && r.client_user_id && (
                    <Select disabled={busy === r.client_user_id} onValueChange={(v) => reassign(r, v)}>
                      <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Assign to Level 3…" /></SelectTrigger>
                      <SelectContent>
                        {targets.map((t) => (
                          <SelectItem key={t.user_id} value={t.user_id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
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

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Receives unassigned clients</h3>
        </div>
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          Ticked practitioners are shown to Body Profile buyers who have no practitioner yet, and can be picked when reassigning a handoff. Only trainers and Level 3 certified practitioners are listed.
        </p>
        <div className="divide-y divide-border">
          {eligible.map((e) => (
            <div key={e.user_id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{e.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {e.email} • {e.is_trainer ? "Trainer" : `Level ${e.certification_level ?? "?"} certified`}
                </p>
              </div>
              <Switch
                checked={e.eligible}
                disabled={busy === e.user_id}
                onCheckedChange={(v) => toggleEligible(e, v)}
                aria-label={`Receives unassigned clients: ${e.name}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
