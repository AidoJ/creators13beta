// Serves the admin-generated prospectus PDF. Same access as the public /prospectus page
// (open to signed-out visitors), so it returns a short-lived download link to the stored file.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const bucket = admin.storage.from("prospectus-assets");
  const { data, error } = await bucket.createSignedUrl("generated/prospectus.pdf", 600, { download: "13CREATORS-Practitioner-Prospectus.pdf" });
  if (error || !data?.signedUrl) return json({ ready: false }, 404);
  return json({ ready: true, url: data.signedUrl });
});
