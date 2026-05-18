import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_TYPES = [
  "face_front_closed",
  "face_front_smiling",
  "face_side",
  "body_front",
  "body_back",
  "body_side",
  "feet",
  "hands",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { user_id } = await req.json() as { user_id: string };
    if (!user_id) throw new Error("user_id is required");

    // Fetch all photos for this user
    const { data: photos, error: fetchErr } = await supabaseAdmin
      .from("profiling_photos")
      .select("id, photo_type, storage_path")
      .eq("user_id", user_id);

    if (fetchErr) throw fetchErr;
    if (!photos || photos.length === 0) {
      return new Response(JSON.stringify({ message: "No photos found", reclassified: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get public URLs and build image data for AI
    const photoData: { id: string; currentType: string; storagePath: string; publicUrl: string }[] = [];
    for (const photo of photos) {
      const { data: urlData } = supabaseAdmin.storage
        .from("profiling-photos")
        .getPublicUrl(photo.storage_path);
      if (urlData?.publicUrl) {
        photoData.push({
          id: photo.id,
          currentType: photo.photo_type,
          storagePath: photo.storage_path,
          publicUrl: urlData.publicUrl,
        });
      }
    }

    // Call AI to classify all photos at once
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a photo classifier for a body profiling system. You will be shown ${photoData.length} photos of the same person.

Classify each photo into EXACTLY ONE of these categories:
- face_front_closed: Front-facing portrait with mouth closed, neutral expression
- face_front_smiling: Front-facing portrait with a smile showing teeth
- face_side: Side profile of the face
- body_front: Full body photo from the front
- body_back: Full body photo from the back
- body_side: Full body photo from the side
- feet: Photo showing the feet/soles
- hands: Photo showing the hands/palms

For each photo, respond with ONLY a JSON array of objects with "index" (0-based) and "type" (one of the categories above).
Example: [{"index": 0, "type": "face_front_closed"}, {"index": 1, "type": "body_side"}]

IMPORTANT: Each category should only be used once. If two photos look similar, pick the best match for each.
Respond with ONLY the JSON array, no other text.`;

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...photoData.map((p, i) => ({
            type: "image_url",
            image_url: { url: p.publicUrl },
          })),
        ],
      },
    ];

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits exhausted. Please top up Lovable AI credits in Workspace → Plans & Billing, then try again.",
            code: "ai_credits_exhausted",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limit reached, please try again in a moment.", code: "ai_rate_limited" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI API error: ${aiResponse.status} ${errText}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Could not parse AI classification response");

    const classifications: { index: number; type: string }[] = JSON.parse(jsonMatch[0]);

    // Validate and apply reclassifications
    const reclassified: { id: string; oldType: string; newType: string }[] = [];

    for (const c of classifications) {
      if (c.index < 0 || c.index >= photoData.length) continue;
      const validType = VALID_TYPES.find((t) => t === c.type);
      if (!validType) continue;

      const photo = photoData[c.index];
      if (photo.currentType === validType) continue; // Already correct

      // Update the photo_type in the database
      const { error: updateErr } = await supabaseAdmin
        .from("profiling_photos")
        .update({ photo_type: validType })
        .eq("id", photo.id);

      if (!updateErr) {
        // Also rename the file in storage to match new type
        const ext = photo.storagePath.split(".").pop() || "jpg";
        const newPath = `${user_id}/${validType}.${ext}`;

        if (newPath !== photo.storagePath) {
          // Copy to new path, then delete old
          const { data: fileData } = await supabaseAdmin.storage
            .from("profiling-photos")
            .download(photo.storagePath);

          if (fileData) {
            await supabaseAdmin.storage
              .from("profiling-photos")
              .upload(newPath, fileData, { contentType: `image/${ext === "png" ? "png" : "jpeg"}`, upsert: true });

            await supabaseAdmin.storage
              .from("profiling-photos")
              .remove([photo.storagePath]);

            // Update storage_path in DB
            await supabaseAdmin
              .from("profiling_photos")
              .update({ storage_path: newPath })
              .eq("id", photo.id);
          }
        }

        reclassified.push({ id: photo.id, oldType: photo.currentType, newType: validType });
        console.log(`✓ Reclassified ${photo.currentType} → ${validType} for ${user_id}`);
      }
    }

    return new Response(
      JSON.stringify({ message: `Reclassified ${reclassified.length} photos`, reclassified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("classify-photos error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
