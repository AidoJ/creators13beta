import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export interface MembershipStatus {
  product_name: string | null;
  cancel_at_period_end: boolean;
  access_until: string | null;
}

const MEMBER_SAFE_FALLBACK = "We couldn't open your billing page just now. Please try again, or contact us if it keeps happening.";

/** Reads a member-safe message from the billing function; never surfaces raw Stripe text. */
async function friendlyMessage(data: any, error: any): Promise<string> {
  if (data?.message) return data.message;
  try {
    const ctx = error?.context;
    if (ctx?.json) {
      const parsed = await ctx.json();
      if (parsed?.message) return parsed.message;
    }
  } catch { /* ignore */ }
  return MEMBER_SAFE_FALLBACK;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "the end of your paid period";

/** Live cancel-at-period-end state, refreshed on mount (incl. returning from Stripe). */
export function useMembershipStatus(enabled: boolean) {
  const [subs, setSubs] = useState<MembershipStatus[] | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const { data } = await supabase.functions.invoke("customer-portal", { body: { flow: "status" } });
    setSubs(((data as any)?.subscriptions as MembershipStatus[]) ?? []);
  }, [enabled]);
  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    if (params.has("portal")) {
      // Stripe can take a moment to record the change — re-check shortly after return.
      const t = setTimeout(refresh, 2500);
      return () => clearTimeout(t);
    }
  }, [refresh]);
  return { subs, refresh };
}

interface Props {
  enabled: boolean;
  fallbackName?: string;
  size?: "sm" | "default";
}

export default function MembershipCancelControls({ enabled, fallbackName = "Membership", size = "sm" }: Props) {
  const { toast } = useToast();
  const { subs, refresh } = useMembershipStatus(enabled);
  const [busy, setBusy] = useState(false);

  const openPortal = async (flow?: "cancel") => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("customer-portal", { body: flow ? { flow } : {} });
    if (error || !(data as any)?.url) {
      setBusy(false);
      toast({ title: "Billing unavailable", description: await friendlyMessage(data, error), variant: "destructive" });
      refresh();
      return;
    }
    window.location.href = (data as any).url;
  };

  const resume = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("customer-portal", { body: { flow: "resume" } });
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't resume", description: await friendlyMessage(data, error), variant: "destructive" });
    } else {
      toast({ title: "Membership resumed", description: "Your membership will continue as normal." });
    }
    refresh();
  };

  if (!enabled) return null;
  const cancelling = (subs ?? []).filter((s) => s.cancel_at_period_end);
  const hasActive = (subs ?? []).some((s) => !s.cancel_at_period_end);

  return (
    <div className="space-y-2">
      {cancelling.map((s, i) => (
        <div key={i} className="rounded-lg border border-banner-border bg-banner text-banner-foreground p-3 space-y-2">
          <p className="text-sm font-semibold">
            {s.product_name || fallbackName} - cancelled, access until {fmt(s.access_until)}
          </p>
          <Button size={size} className="w-full" onClick={resume} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Resume membership
          </Button>
        </div>
      ))}
      <div className={`grid gap-2 ${subs !== null && hasActive ? "grid-cols-2" : "grid-cols-1"}`}>
        <Button variant="outline" size={size} onClick={() => openPortal()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
          Manage billing
        </Button>
        {subs !== null && hasActive && (
          <Button variant="outline" size={size} onClick={() => openPortal("cancel")} disabled={busy}>
            Cancel membership
          </Button>
        )}
      </div>
      {subs !== null && hasActive && (
        <p className="text-xs text-muted-foreground text-center">
          If you cancel, you keep access until the end of the period you've paid for.
        </p>
      )}
    </div>
  );
}
