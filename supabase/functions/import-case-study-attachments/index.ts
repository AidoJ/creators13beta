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

    const { attachments } = await req.json() as {
      attachments: {
        case_study_id: string;
        file_name: string;
        dropbox_url: string;
      }[];
    };

    const results: { case_study_id: string; file_name: string; status: string; error?: string; storage_path?: string }[] = [];

    for (const att of attachments) {
      try {
        const dlUrl = att.dropbox_url.replace("dl=0", "dl=1");
        console.log(`Downloading ${att.file_name} for case study ${att.case_study_id}...`);
        
        const response = await fetch(dlUrl, { redirect: "follow" });
        if (!response.ok) {
          results.push({ case_study_id: att.case_study_id, file_name: att.file_name, status: "error", error: `Download failed: ${response.status}` });
          continue;
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const fileBytes = new Uint8Array(arrayBuffer);

        const ext = att.file_name.includes(".png") ? "png" : "jpg";
        const storagePath = `case-study-attachments/${att.case_study_id}/${att.file_name}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from("profiling-photos")
          .upload(storagePath, fileBytes, {
            contentType: `image/${ext === "png" ? "png" : "jpeg"}`,
            upsert: true,
          });

        if (uploadError) {
          results.push({ case_study_id: att.case_study_id, file_name: att.file_name, status: "error", error: uploadError.message });
          continue;
        }

        // Update case study form_data to include attachment paths
        const { data: cs } = await supabaseAdmin
          .from("case_studies")
          .select("form_data")
          .eq("id", att.case_study_id)
          .single();

        const existingData = (cs?.form_data as Record<string, unknown>) || {};
        const existingAttachments = (existingData.attachments as string[]) || [];
        existingAttachments.push(storagePath);

        await supabaseAdmin
          .from("case_studies")
          .update({ form_data: { ...existingData, attachments: existingAttachments } })
          .eq("id", att.case_study_id);

        results.push({ case_study_id: att.case_study_id, file_name: att.file_name, status: "ok", storage_path: storagePath });
        console.log(`✓ ${att.file_name}`);
      } catch (e) {
        results.push({ case_study_id: att.case_study_id, file_name: att.file_name, status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-case-study-attachments error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
