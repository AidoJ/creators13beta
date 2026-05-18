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
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      client_email,
      client_name,
      practitioner_name,
      face_split_notes,
      body_annotation_notes,
      image_urls, // { original?, leftMirrored?, rightMirrored?, bodyAnnotated? }
      creator_types,
    } = await req.json();

    if (!client_email) throw new Error("client_email is required");

    const firstName = (client_name || "").split(" ")[0] || "there";

    // Load email template if exists
    const { data: tmpl } = await supabase
      .from("email_templates")
      .select("subject, html_body")
      .eq("template_key", "profiling_report")
      .maybeSingle();

    const subject = (tmpl?.subject || "Your Creator Profiling Report — 13 Creators")
      .replace(/\{\{clientName\}\}/g, client_name || "")
      .replace(/\{\{firstName\}\}/g, firstName)
      .replace(/\{\{practitionerName\}\}/g, practitioner_name || "");

    const htmlBody = tmpl?.html_body
      ? tmpl.html_body
          .replace(/\{\{clientName\}\}/g, client_name || "")
          .replace(/\{\{firstName\}\}/g, firstName)
          .replace(/\{\{practitionerName\}\}/g, practitioner_name || "")
          .replace(/\{\{creatorTypes\}\}/g, creator_types || "")
          .replace(/\{\{faceSplitNotes\}\}/g, face_split_notes || "")
          .replace(/\{\{bodyAnnotationNotes\}\}/g, body_annotation_notes || "")
          .replace(/\{\{originalImageUrl\}\}/g, image_urls?.original || "")
          .replace(/\{\{leftMirroredUrl\}\}/g, image_urls?.leftMirrored || "")
          .replace(/\{\{rightMirroredUrl\}\}/g, image_urls?.rightMirrored || "")
          .replace(/\{\{bodyAnnotatedUrl\}\}/g, image_urls?.bodyAnnotated || "")
      : buildDefaultHtml({
          client_name,
          practitioner_name,
          face_split_notes,
          body_annotation_notes,
          image_urls,
          creator_types,
        });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "13 Creators <noreply@connect.13creators.com>",
        to: [client_email],
        subject,
        html: htmlBody,
      }),
    });

    const resData = await res.json();
    if (!res.ok) {
      console.error("Resend error:", resData);
      throw new Error(`Resend error: ${JSON.stringify(resData)}`);
    }

    return new Response(JSON.stringify({ success: true, id: resData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-profiling-report error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface ReportData {
  client_name: string;
  practitioner_name: string;
  face_split_notes: string;
  body_annotation_notes: string;
  image_urls: {
    original?: string;
    leftMirrored?: string;
    rightMirrored?: string;
    bodyAnnotated?: string;
  };
  creator_types: string;
}

function buildDefaultHtml(data: ReportData): string {
  const {
    client_name,
    practitioner_name,
    face_split_notes,
    body_annotation_notes,
    image_urls,
    creator_types,
  } = data;

  const imageTd = (url: string | undefined, label: string) => {
    if (!url) return "";
    return `
      <td style="padding:8px;text-align:center;vertical-align:top;">
        <p style="font-size:12px;color:#8b6f5e;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">${label}</p>
        <img src="${url}" alt="${label}" width="160" style="max-width:160px;width:100%;height:auto;border-radius:12px;border:2px solid #e8ddd4;display:block;margin:0 auto;" />
      </td>
    `;
  };

  const notesSection = (title: string, notes: string) => {
    if (!notes) return "";
    return `
      <div style="margin-top:24px;padding:20px;background:#faf7f4;border-radius:12px;border-left:4px solid #b5314e;">
        <h3 style="margin:0 0 8px 0;font-size:14px;color:#b5314e;font-weight:600;">${title}</h3>
        <p style="margin:0;font-size:14px;color:#5a3a28;line-height:1.7;white-space:pre-wrap;">${notes}</p>
      </div>
    `;
  };

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background-color:#f5f0eb;font-family:'Questrial',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f0eb;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(90,58,40,0.08);">
        
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#b5314e,#c9544e);padding:32px 24px;text-align:center;">
          <h1 style="margin:0;font-size:24px;color:#ffffff;font-family:'Cormorant Garamond',Georgia,serif;font-weight:700;">
            Creator Profiling Report
          </h1>
          <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">
            Prepared for ${client_name || "Client"}
          </p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 24px;">
          
          <p style="font-size:15px;color:#5a3a28;line-height:1.6;margin:0 0 8px;">
            Dear ${client_name || "Client"},
          </p>
          <p style="font-size:15px;color:#5a3a28;line-height:1.6;margin:0 0 24px;">
            Please find below the profiling analysis from your session${practitioner_name ? ` with ${practitioner_name}` : ""}.
          </p>

          ${creator_types ? `
          <div style="text-align:center;margin-bottom:28px;padding:16px;background:#faf7f4;border-radius:12px;">
            <p style="font-size:11px;color:#8b6f5e;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;">Creator Types Identified</p>
            <p style="font-size:18px;font-weight:700;color:#b5314e;margin:0;font-family:'Cormorant Garamond',Georgia,serif;">${creator_types}</p>
          </div>
          ` : ""}

          <!-- Face Symmetry Section -->
          ${(image_urls?.original || image_urls?.leftMirrored || image_urls?.rightMirrored) ? `
          <h2 style="font-size:18px;color:#5a3a28;font-family:'Cormorant Garamond',Georgia,serif;margin:0 0 16px;border-bottom:2px solid #e8ddd4;padding-bottom:8px;">
            Face Symmetry Analysis
          </h2>
          <div style="background:#faf7f4;border:2px solid #e8ddd4;border-radius:16px;padding:16px 8px;margin-bottom:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
              <tr>
                ${image_urls?.leftMirrored ? `<td width="33%" style="padding:4px;text-align:center;vertical-align:top;">
                  <p style="font-size:11px;color:#8b6f5e;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">Left Mirrored</p>
                  <img src="${image_urls.leftMirrored}" alt="Left Mirrored" width="160" style="max-width:160px;width:100%;height:auto;border-radius:10px;border:1px solid #d4c8be;display:block;margin:0 auto;" />
                </td>` : ""}
                ${image_urls?.original ? `<td width="34%" style="padding:4px;text-align:center;vertical-align:top;">
                  <p style="font-size:11px;color:#8b6f5e;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">Original</p>
                  <img src="${image_urls.original}" alt="Original" width="160" style="max-width:160px;width:100%;height:auto;border-radius:10px;border:1px solid #d4c8be;display:block;margin:0 auto;" />
                </td>` : ""}
                ${image_urls?.rightMirrored ? `<td width="33%" style="padding:4px;text-align:center;vertical-align:top;">
                  <p style="font-size:11px;color:#8b6f5e;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">Right Mirrored</p>
                  <img src="${image_urls.rightMirrored}" alt="Right Mirrored" width="160" style="max-width:160px;width:100%;height:auto;border-radius:10px;border:1px solid #d4c8be;display:block;margin:0 auto;" />
                </td>` : ""}
              </tr>
            </table>
          </div>
          ` : ""}

          ${notesSection("Face Symmetry Notes", face_split_notes)}

          <!-- Body Annotation Section -->
          ${image_urls?.bodyAnnotated ? `
          <h2 style="font-size:18px;color:#5a3a28;font-family:'Cormorant Garamond',Georgia,serif;margin:28px 0 16px;border-bottom:2px solid #e8ddd4;padding-bottom:8px;">
            Body Annotation
          </h2>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="text-align:center;padding:8px;">
                <img src="${image_urls.bodyAnnotated}" alt="Body Annotation" width="400" style="max-width:400px;width:100%;height:auto;border-radius:12px;border:2px solid #e8ddd4;display:block;margin:0 auto;" />
              </td>
            </tr>
          </table>
          ` : ""}

          ${notesSection("Body Annotation Notes", body_annotation_notes)}

          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e8ddd4;text-align:center;">
            <a href="https://creators13.lovable.app/dashboard" style="display:inline-block;background:#b5314e;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
              View Your Dashboard
            </a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 24px;background:#faf7f4;text-align:center;">
          <p style="margin:0;font-size:12px;color:#8b6f5e;">
            © ${new Date().getFullYear()} 13 Creators · This report is confidential
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
