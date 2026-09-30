import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getAppOrigin } from "@/lib/appOrigin";
import { Loader2 } from "lucide-react";

/** Private payment link emailed to an approved practitioner-training applicant. */
export default function TrainingPayment() {
  const { applicationId } = useParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const origin = getAppOrigin();
    supabase.functions.invoke("create-checkout", {
      body: {
        application_id: applicationId,
        successUrl: `${origin}/dashboard?purchase=success`,
        cancelUrl: `${origin}/dashboard`,
      },
    }).then(({ data, error }) => {
      const url = (data as any)?.url;
      if (url) { window.location.href = url; return; }
      setError((data as any)?.message || (data as any)?.error || error?.message || "This payment link couldn't be opened.");
    });
  }, [applicationId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      {error ? (
        <div className="max-w-md text-center space-y-3">
          <h1 className="font-display text-2xl">Payment link problem</h1>
          <p className="text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground">Make sure you're signed in with the email you applied with, or contact us.</p>
          <Link to="/dashboard" className="text-primary underline">Go to your dashboard</Link>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Opening secure checkout…</p>
      )}
    </div>
  );
}
