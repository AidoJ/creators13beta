import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getAppOrigin } from "@/lib/appOrigin";
import { useAuth } from "@/contexts/AuthContext";
import { lookupEmailedLink, lockedAuthUrl, CLOSED_LINK_MESSAGES } from "@/lib/emailedLink";
import { forgetPendingBuyEverywhere } from "@/lib/pendingPurchase";
import { Loader2 } from "lucide-react";

/**
 * Private payment link emailed to an approved practitioner-training applicant.
 * Public route: a signed-out visitor is sent to sign-up (new applicant) or
 * sign-in (existing account) with the applicant's email locked, then back here.
 */
export default function TrainingPayment() {
  const { applicationId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const [closed, setClosed] = useState<keyof typeof CLOSED_LINK_MESSAGES | null>(null);

  useEffect(() => {
    if (loading) return;
    const here = `/pay/training/${applicationId}`;
    if (!user) {
      lookupEmailedLink("training", applicationId ?? "").then((info) => {
        if (info && info.state === "open") navigate(lockedAuthUrl(info.email, info.has_account, here), { replace: true });
        else if (info) setClosed(info.state as keyof typeof CLOSED_LINK_MESSAGES);
        else navigate(`/auth?returnTo=${encodeURIComponent(here)}`, { replace: true });
      });
      return;
    }
    // This explicit link overrides any saved storefront choice.
    void forgetPendingBuyEverywhere(user);
    const origin = getAppOrigin();
    supabase.functions.invoke("create-checkout", {
      body: {
        application_id: applicationId,
        successUrl: `${origin}/dashboard?purchase=success`,
        cancelUrl: `${origin}/dashboard`,
      },
    }).then(async ({ data, error }) => {
      const url = (data as any)?.url;
      if (url) { window.location.href = url; return; }
      // Non-2xx responses put the server's JSON on error.context, not data.
      let body: any = data;
      const ctx = (error as any)?.context;
      if (!body && ctx && typeof ctx.json === "function") {
        try { body = await ctx.json(); } catch { /* not JSON */ }
      }
      setErrorCode(body?.error ?? null);
      setError(body?.message || "This payment link couldn't be opened.");
    });
  }, [applicationId, user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      {closed ? (
        <div className="max-w-md text-center space-y-4">
          <h1 className="font-display text-2xl">{CLOSED_LINK_MESSAGES[closed].title}</h1>
          <p className="text-muted-foreground">{CLOSED_LINK_MESSAGES[closed].body}</p>
          <Link to="/auth?returnTo=%2Fdashboard" className="inline-block rounded-full bg-primary text-primary-foreground px-6 py-2">Sign in</Link>
        </div>
      ) : error ? (
        <div className="max-w-md text-center space-y-3">
          <h1 className="font-display text-2xl">Payment link problem</h1>
          <p className="text-muted-foreground">{error}</p>
          {errorCode !== "sold_out" && errorCode !== "already_held" && (
            <p className="text-sm text-muted-foreground">Make sure you're signed in with the email you applied with, or contact us.</p>
          )}
          <Link to="/dashboard" className="text-primary underline">Go to your dashboard</Link>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Opening secure checkout…</p>
      )}
    </div>
  );
}
