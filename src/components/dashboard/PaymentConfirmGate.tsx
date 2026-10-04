import { ReactNode, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { loadMyAccess } from "@/lib/accessSummary";
import { forgetPendingBuyEverywhere } from "@/lib/pendingPurchase";

/**
 * After Stripe returns (/dashboard?purchase=success) the payment record can
 * land a few seconds later. Hold one stable "Confirming your payment…" screen
 * — no redirects, no gates rendering — until the new access arrives (max 30s),
 * then show the dashboard with its welcome panel.
 */
export function PaymentConfirmGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const active = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("purchase") === "success";
  const [done, setDone] = useState(!active);

  useEffect(() => {
    if (!active || !userId) return;
    let cancelled = false;
    void forgetPendingBuyEverywhere(user);
    (async () => {
      const deadline = Date.now() + 30_000;
      while (!cancelled && Date.now() < deadline) {
        const access = await loadMyAccess(userId).catch(() => []);
        if (access.some((a) => Date.now() - new Date(a.starts_at || 0).getTime() < 30 * 60 * 1000)) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) setDone(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userId]);

  if (done) return <>{children}</>;
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="font-display text-xl">Confirming your payment...</p>
      <p className="text-sm text-muted-foreground">This can take a few seconds.</p>
    </div>
  );
}
