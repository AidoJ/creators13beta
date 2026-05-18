import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { photos } = await req.json() as {
      photos: { user_id: string; photo_type: string; dropbox_url: string }[];
    };

    const results: { user_id: string; photo_type: string; status: string; error?: string }[] = [];

    for (const photo of photos) {
      try {
        // Convert Dropbox share URL to direct download
        const dlUrl = photo.dropbox_url.replace("dl=0", "dl=1");
        
        console.log(`Downloading ${photo.photo_type} for ${photo.user_id}...`);
        const response = await fetch(dlUrl, { redirect: "follow" });
        
        if (!response.ok) {
          results.push({ user_id: photo.user_id, photo_type: photo.photo_type, status: "error", error: `Download failed: ${response.status}` });
          continue;
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const fileBytes = new Uint8Array(arrayBuffer);
        
        const ext = photo.dropbox_url.includes(".png") ? "png" : "jpg";
        const storagePath = `${photo.user_id}/${photo.photo_type}.${ext}`;

        // Upload to storage (upsert)
        const { error: uploadError } = await supabaseAdmin.storage
          .from("profiling-photos")
          .upload(storagePath, fileBytes, {
            contentType: `image/${ext === "png" ? "png" : "jpeg"}`,
            upsert: true,
          });

        if (uploadError) {
          results.push({ user_id: photo.user_id, photo_type: photo.photo_type, status: "error", error: uploadError.message });
          continue;
        }

        // Upsert DB record
        const { error: dbError } = await supabaseAdmin
          .from("profiling_photos")
          .upsert(
            { user_id: photo.user_id, photo_type: photo.photo_type, storage_path: storagePath },
            { onConflict: "user_id,photo_type" }
          );

        if (dbError) {
          results.push({ user_id: photo.user_id, photo_type: photo.photo_type, status: "error", error: dbError.message });
          continue;
        }

        results.push({ user_id: photo.user_id, photo_type: photo.photo_type, status: "ok" });
        console.log(`✓ ${photo.photo_type} for ${photo.user_id}`);
      } catch (e) {
        results.push({ user_id: photo.user_id, photo_type: photo.photo_type, status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-dropbox-photos error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
