import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * /unsubscribe/enrollment?token=... — reminder-only opt-out.
 *
 * Honest copy: only stops enrolment recovery reminders. Account/payment/auth
 * emails still send. Separate from marketing opt-out.
 */
export default function EnrollmentRemindersUnsubscribe() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<"working" | "ok" | "invalid">("working");

  useEffect(() => {
    const token = params.get("token") || "";
    if (!token) { setStatus("invalid"); return; }
    (async () => {
      const { data, error } = await (supabase as any).rpc("enrollment_reminders_unsubscribe", { _token: token });
      if (error || data !== true) setStatus("invalid");
      else setStatus("ok");
    })();
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-4">
        {status === "working" && <p>Working…</p>}
        {status === "ok" && (
          <>
            <h1 className="font-display text-2xl">You're unsubscribed from enrolment reminders</h1>
            <p className="text-sm text-muted-foreground">
              We won't nudge you again about finishing enrolment. You'll still receive
              account and payment emails — those aren't reminders, they're required
              for the service to work.
            </p>
          </>
        )}
        {status === "invalid" && (
          <>
            <h1 className="font-display text-2xl">Link invalid or expired</h1>
            <p className="text-sm text-muted-foreground">
              If you're already signed in, you can change your reminder preferences from your account settings.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
