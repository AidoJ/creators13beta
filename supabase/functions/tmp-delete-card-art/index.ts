// Temporary maintenance function: removes an obsolete card art object.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.storage
    .from("game-card-art")
    .remove(["cards/animal-snow-leopard.png"]);
  return new Response(JSON.stringify({ data, error }), {
    headers: { "Content-Type": "application/json" },
  });
});
