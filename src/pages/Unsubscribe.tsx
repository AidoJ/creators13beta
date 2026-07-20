import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

/**
 * Public, no-login unsubscribe. Reads ?token= and calls the SECURITY DEFINER
 * marketing_unsubscribe RPC which flips marketing_opt_in=false, stamps
 * unsubscribed_at, and rotates the token so the link is single-use.
 */
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token")?.trim() ?? "";
  const [status, setStatus] = useState<"loading" | "ok" | "invalid">("loading");

  useEffect(() => {
    if (!token || token.length < 20) {
      setStatus("invalid");
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("marketing_unsubscribe" as never, { _token: token } as never);
      setStatus(!error && data === true ? "ok" : "invalid");
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 text-muted-foreground mx-auto animate-spin" />
            <h1 className="font-display text-2xl">Processing…</h1>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <h1 className="font-display text-2xl">You're unsubscribed</h1>
            <p className="text-sm text-muted-foreground">
              You won't receive any more marketing emails from Creator Types. You'll still
              receive essential account emails (security, billing, verification).
            </p>
            <p className="text-xs text-muted-foreground">
              Changed your mind? Contact us or opt back in from your account settings.
            </p>
          </>
        )}
        {status === "invalid" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="font-display text-2xl">Link not valid</h1>
            <p className="text-sm text-muted-foreground">
              This unsubscribe link is invalid or has already been used. If you're still
              receiving marketing emails, please contact us.
            </p>
          </>
        )}
        <Link to="/" className="inline-block text-sm text-primary hover:underline pt-2">
          Return to home →
        </Link>
      </Card>
    </div>
  );
}
