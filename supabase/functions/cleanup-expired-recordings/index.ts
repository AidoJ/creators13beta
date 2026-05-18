import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const today = new Date().toISOString().split("T")[0];

  const [r1, r2] = await Promise.all([
    supabase.from("zoom_recordings").delete().lt("expires_at", today),
    supabase.from("client_recordings").delete().lt("expires_at", today),
  ]);

  const deleted = (r1.count ?? 0) + (r2.count ?? 0);
  console.log(`Cleanup: removed ${deleted} expired recordings`);

  return new Response(JSON.stringify({ ok: true, deleted }), {
    headers: { "Content-Type": "application/json" },
  });
});
