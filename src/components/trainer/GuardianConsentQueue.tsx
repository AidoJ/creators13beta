import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PhoneCall, ShieldCheck, Mail } from "lucide-react";

interface QueueRow {
  user_id: string;
  child_name: string | null;
  child_email: string | null;
  date_of_birth: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  status: "pending" | "email_confirmed" | "verified";
  email_confirmed_at: string | null;
  verbal_confirmed_at: string | null;
  verification_sent_at: string | null;
  days_waiting: number;
}

const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * A'Hara's queue of minor enrolments awaiting consent verification.
 * Trainer/admin only — deliberately never shown on the minor's own enrolment
 * form. The verbal tick cannot be recorded until the guardian has confirmed
 * their email, so the two confirmations can never collapse into one.
 */
export default function GuardianConsentQueue() {
  const { toast } = useToast();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as never as {
      rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("get_guardian_consent_queue");
    setLoading(false);
    if (error) {
      toast({ title: "Couldn't load the consent queue", variant: "destructive" });
      return;
    }
    setRows((data as QueueRow[]) ?? []);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmVerbal = async (row: QueueRow) => {
    setSaving(row.user_id);
    const { data, error } = await (supabase as never as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("confirm_guardian_verbal_consent", { _user_id: row.user_id });
    setSaving(null);

    const res = data as { ok?: boolean; reason?: string } | null;
    if (error || !res?.ok) {
      toast({
        title: "Not recorded",
        description:
          res?.reason === "email_not_confirmed"
            ? "The guardian hasn't confirmed their email address yet."
            : "Please try again.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Verbal consent recorded", description: `Consent for ${row.child_name || "this enrolment"} is now verified.` });
    load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-primary" />
        No minor enrolments are waiting on consent verification.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every under-18 enrolment needs two confirmations: the guardian clicks the emailed link,
        and you confirm consent with them by phone. Uploads stay blocked until both are recorded.
      </p>

      {rows.map((r) => (
        <div key={r.user_id} className="bg-card border border-border rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-semibold text-foreground">{r.child_name || r.child_email || "—"}</p>
              <p className="text-xs text-muted-foreground">{r.child_email}</p>
            </div>
            {r.status === "email_confirmed" ? (
              <Badge variant="secondary">Email confirmed · waiting {r.days_waiting} days</Badge>
            ) : (
              <Badge variant="outline">Awaiting guardian email confirmation</Badge>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <p className="text-xs text-muted-foreground">Guardian</p>
              <p className="text-foreground font-medium">{r.guardian_name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-foreground font-medium flex items-center gap-1.5">
                <PhoneCall className="h-3.5 w-3.5 text-primary" />
                {r.guardian_phone || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Guardian email</p>
              <p className="text-foreground font-medium flex items-center gap-1.5 break-all">
                <Mail className="h-3.5 w-3.5 text-primary" />
                {r.guardian_email || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email confirmed</p>
              <p className="text-foreground font-medium">{fmt(r.email_confirmed_at)}</p>
            </div>
          </div>

          <Button
            size="sm"
            disabled={r.status !== "email_confirmed" || saving === r.user_id}
            onClick={() => confirmVerbal(r)}
            className="rounded-full"
          >
            {saving === r.user_id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mr-1.5" />
                Verbal consent received — confirmed by phone
              </>
            )}
          </Button>
          {r.status !== "email_confirmed" && (
            <p className="text-xs text-muted-foreground mt-2">
              Available once the guardian has confirmed their email address
              {r.verification_sent_at ? ` (link sent ${fmt(r.verification_sent_at)})` : ""}.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
