import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, AuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // Admin / trainer only — this writes into another user's photo storage.
    const { admin } = await requireRole(req, ["admin", "trainer"]);

    const { user_id, photo_type, base64, content_type, ext } = await req.json();
    if (!user_id || !photo_type || !base64) {
      return new Response(JSON.stringify({ error: "user_id, photo_type, base64 required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const path = `${user_id}/${photo_type}.${ext || "jpg"}`;
    const { error: upErr } = await admin.storage.from("profiling-photos").upload(path, bin, {
      contentType: content_type || "image/jpeg",
      upsert: true,
    });
    if (upErr) throw upErr;
    const { error: dbErr } = await admin.from("profiling_photos").upsert(
      { user_id, photo_type, storage_path: path },
      { onConflict: "user_id,photo_type" }
    );
    if (dbErr) throw dbErr;
    return new Response(JSON.stringify({ ok: true, path }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
