// Admin helper: issue signed download URLs + signed upload tokens
// for a user's HEIC profiling photos so a sandbox script can convert them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { user_id, action, photo_id, new_path, storage_path } = body;

    if (action === "signed_upload") {
      const { data: uploadToken, error } = await supabase.storage
        .from("profiling-photos")
        .createSignedUploadUrl(storage_path, { upsert: true });
      if (error) throw error;
      return new Response(JSON.stringify({ upload_url: uploadToken?.signedUrl, token: uploadToken?.token, path: storage_path }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: photos, error } = await supabase
        .from("profiling_photos")
        .select("id, photo_type, storage_path")
        .eq("user_id", user_id)
        .ilike("storage_path", "%.HEIC");
      if (error) throw error;

      const items = await Promise.all((photos ?? []).map(async (p) => {
        const { data: signed } = await supabase.storage
          .from("profiling-photos")
          .createSignedUrl(p.storage_path, 3600);
        const newPath = p.storage_path.replace(/\.HEIC$/i, ".jpeg");
        const { data: uploadToken } = await supabase.storage
          .from("profiling-photos")
          .createSignedUploadUrl(newPath);
        return {
          id: p.id,
          photo_type: p.photo_type,
          old_path: p.storage_path,
          new_path: newPath,
          download_url: signed?.signedUrl,
          upload_url: uploadToken?.signedUrl,
          upload_token: uploadToken?.token,
        };
      }));

      return new Response(JSON.stringify({ items }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "finalize") {
      // Update DB row to point to new path, delete old HEIC
      const { data: photo } = await supabase
        .from("profiling_photos").select("storage_path").eq("id", photo_id).single();
      const oldPath = photo?.storage_path;

      const { error: updErr } = await supabase
        .from("profiling_photos")
        .update({ storage_path: new_path })
        .eq("id", photo_id);
      if (updErr) throw updErr;

      if (oldPath && oldPath !== new_path) {
        await supabase.storage.from("profiling-photos").remove([oldPath]);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
