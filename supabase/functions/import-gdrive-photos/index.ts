import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
      photos: { user_id: string; photo_type: string; gdrive_url: string }[];
    };

    const results: { user_id: string; photo_type: string; status: string; error?: string }[] = [];

    for (const photo of photos) {
      try {
        // Extract file ID from Google Drive URL
        const match = photo.gdrive_url.match(/id=([a-zA-Z0-9_-]+)/);
        if (!match) {
          results.push({ user_id: photo.user_id, photo_type: photo.photo_type, status: "error", error: "Could not extract file ID" });
          continue;
        }
        const fileId = match[1];
        const dlUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

        console.log(`Downloading ${photo.photo_type} for ${photo.user_id} (file ${fileId})...`);
        const response = await fetch(dlUrl, { redirect: "follow" });

        if (!response.ok) {
          results.push({ user_id: photo.user_id, photo_type: photo.photo_type, status: "error", error: `Download failed: ${response.status}` });
          continue;
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const fileBytes = new Uint8Array(arrayBuffer);

        // Determine extension from content type
        const contentType = response.headers.get("content-type") || "image/jpeg";
        const ext = contentType.includes("png") ? "png" : "jpg";
        const storagePath = `${photo.user_id}/${photo.photo_type}.${ext}`;

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
        results.push({ user_id: photo.user_id, photo_type: photo.photo_type, status: "error", error: e.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-gdrive-photos error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
