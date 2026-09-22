import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, AlertTriangle, PhoneCall } from "lucide-react";

const AHARA_PHONE = "0412 293255";

/**
 * Step one of two for parent/guardian consent: the guardian clicks the emailed
 * link. This confirms the email address only — consent is not complete until
 * they have also phoned A'Hara and she has recorded it.
 */
export default function GuardianVerify() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");
  const [childName, setChildName] = useState<string | null>(null);
  const [verbalDone, setVerbalDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("confirm_guardian_email", { _token: token });

      if (cancelled) return;
      const res = data as { ok?: boolean; child_name?: string; verbal_done?: boolean } | null;
      if (error || !res?.ok) {
        setState("invalid");
        return;
      }
      setChildName(res.child_name ?? null);
      setVerbalDone(!!res.verbal_done);
      setState("ok");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl p-8 text-center">
        {state === "loading" && <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />}

        {state === "invalid" && (
          <>
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-display font-bold text-foreground mb-2">
              This link isn't valid
            </h1>
            <p className="text-muted-foreground">
              The confirmation link may have been mistyped or replaced by a newer one.
              Please call us on <span className="font-semibold text-foreground">{AHARA_PHONE}</span> and
              we'll sort it out with you.
            </p>
          </>
        )}

        {state === "ok" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-display font-bold text-foreground mb-2">
              Email address confirmed
            </h1>
            <p className="text-muted-foreground mb-6">
              Thank you. We've recorded that this email address is yours
              {childName ? <> for <span className="text-foreground font-semibold">{childName}</span>'s enrolment</> : null}.
            </p>

            {verbalDone ? (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-5 text-left">
                <p className="text-sm text-foreground">
                  Both confirmations are now complete. Consent is verified and the enrolment
                  can continue — nothing further is needed from you.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-destructive/60 bg-destructive/5 p-5 text-left">
                <p className="flex items-center gap-2 text-sm font-semibold text-destructive mb-2">
                  <PhoneCall className="h-4 w-4" /> One step still to go
                </p>
                <p className="text-sm text-foreground">
                  We take child safety very seriously. Please also call A'Hara on{" "}
                  <span className="font-semibold">{AHARA_PHONE}</span> to confirm your consent
                  verbally. The enrolment cannot be completed, and no photos can be uploaded,
                  until both steps are done.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
