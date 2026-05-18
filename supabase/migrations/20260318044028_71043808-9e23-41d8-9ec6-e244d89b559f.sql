UPDATE email_templates
SET html_body = '<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background-color:#f5f0eb;font-family:''Questrial'',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f0eb;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(90,58,40,0.08);">
        <tr><td style="background:linear-gradient(135deg,#b5314e,#c9544e);padding:32px 24px;text-align:center;">
          <h1 style="margin:0;font-size:24px;color:#ffffff;font-family:''Cormorant Garamond'',Georgia,serif;font-weight:700;">Creator Profiling Report</h1>
          <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">Prepared for {{firstName}}</p>
        </td></tr>
        <tr><td style="padding:32px 24px;">
          <p style="font-size:15px;color:#5a3a28;line-height:1.6;margin:0 0 8px;">Hi {{firstName}},</p>
          <p style="font-size:15px;color:#5a3a28;line-height:1.6;margin:0 0 24px;">It was such a pleasure working with you through this process.

What you''re about to explore is a unique reflection of you—both seen and unseen. The face splitting and body profiling work are designed to gently reveal patterns, tendencies, and deeper layers that often sit just beneath our everyday awareness. There''s no judgment here—only insight, curiosity, and the opportunity to better understand yourself.

In the face analysis, you''ll notice three images: your original photo, and two mirrored versions created from each side of your face. These can sometimes highlight subtle differences between how you present to the world and what may be held more internally. It''s less about "right or wrong" and more about observing what resonates for you.

The body profiling section offers another layer—connecting physical patterns with behavioural, emotional, or energetic tendencies. Again, take what feels relevant and leave anything that doesn''t. Your own awareness is always the most important guide.
You''ll find my notes throughout to support your interpretation and give context to what you''re seeing.

</p>
          <div style="text-align:center;margin-bottom:28px;padding:16px;background:#faf7f4;border-radius:12px;">
            <p style="font-size:11px;color:#8b6f5e;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;">Creator Types Identified</p>
            <p style="font-size:18px;font-weight:700;color:#b5314e;margin:0;font-family:''Cormorant Garamond'',Georgia,serif;">{{creatorTypes}}</p>
          </div>
          <h2 style="font-size:18px;color:#5a3a28;font-family:''Cormorant Garamond'',Georgia,serif;margin:0 0 16px;border-bottom:2px solid #e8ddd4;padding-bottom:8px;">Face Symmetry Analysis</h2>
          <div style="background:#faf7f4;border:2px solid #e8ddd4;border-radius:16px;padding:16px 8px;margin-bottom:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
              <tr>
                <td width="33%" style="padding:4px;text-align:center;vertical-align:top;">
                  <p style="font-size:11px;color:#8b6f5e;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">Left Mirrored</p>
                  <img src="{{leftMirroredUrl}}" alt="Left Mirrored" width="160" style="max-width:160px;width:100%;height:auto;border-radius:10px;border:1px solid #d4c8be;display:block;margin:0 auto;" />
                </td>
                <td width="34%" style="padding:4px;text-align:center;vertical-align:top;">
                  <p style="font-size:11px;color:#8b6f5e;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">Original</p>
                  <img src="{{originalImageUrl}}" alt="Original" width="160" style="max-width:160px;width:100%;height:auto;border-radius:10px;border:1px solid #d4c8be;display:block;margin:0 auto;" />
                </td>
                <td width="33%" style="padding:4px;text-align:center;vertical-align:top;">
                  <p style="font-size:11px;color:#8b6f5e;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">Right Mirrored</p>
                  <img src="{{rightMirroredUrl}}" alt="Right Mirrored" width="160" style="max-width:160px;width:100%;height:auto;border-radius:10px;border:1px solid #d4c8be;display:block;margin:0 auto;" />
                </td>
              </tr>
            </table>
          </div>
          <div style="margin-top:24px;padding:20px;background:#faf7f4;border-radius:12px;border-left:4px solid #b5314e;">
            <h3 style="margin:0 0 8px 0;font-size:14px;color:#b5314e;font-weight:600;">Face Symmetry Notes</h3>
            <p style="margin:0;font-size:14px;color:#5a3a28;line-height:1.7;white-space:pre-wrap;">{{faceSplitNotes}}</p>
          </div>
          <h2 style="font-size:18px;color:#5a3a28;font-family:''Cormorant Garamond'',Georgia,serif;margin:28px 0 16px;border-bottom:2px solid #e8ddd4;padding-bottom:8px;">Body Annotation</h2>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="text-align:center;padding:8px;">
                <img src="{{bodyAnnotatedUrl}}" alt="Body Annotation" width="400" style="max-width:400px;width:100%;height:auto;border-radius:12px;border:2px solid #e8ddd4;display:block;margin:0 auto;" />
              </td>
            </tr>
          </table>
          <div style="margin-top:24px;padding:20px;background:#faf7f4;border-radius:12px;border-left:4px solid #b5314e;">
            <h3 style="margin:0 0 8px 0;font-size:14px;color:#b5314e;font-weight:600;">Body Annotation Notes</h3>
            <p style="margin:0;font-size:14px;color:#5a3a28;line-height:1.7;white-space:pre-wrap;">{{bodyAnnotationNotes}}</p>
          </div>
          <div style="margin-top:32px;padding:24px;background:#faf7f4;border-radius:12px;">
            <p style="font-size:14px;color:#5a3a28;line-height:1.7;margin:0 0 16px;">As you go through everything, take your time with it. You might notice immediate insights, or things may land more gradually over the coming days. Both are completely natural.</p>
            <p style="font-size:14px;color:#5a3a28;line-height:1.7;margin:0 0 16px;">If anything sparks curiosity, questions, or even a "that''s interesting…" moment, feel free to reach out—I''m always happy to explore it further with you.</p>
            <p style="font-size:14px;color:#5a3a28;line-height:1.7;margin:0 0 16px;">Thank you again for your openness and trust in this process.</p>
            <p style="font-size:14px;color:#5a3a28;line-height:1.7;margin:0;">Warmly,<br/><strong>{{practitionerName}}</strong></p>
          </div>
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e8ddd4;text-align:center;">
            <a href="https://creators13.lovable.app/dashboard" style="display:inline-block;background:#b5314e;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">View Your Dashboard</a>
          </div>
        </td></tr>
        <tr><td style="padding:20px 24px;background:#faf7f4;text-align:center;">
          <p style="margin:0;font-size:12px;color:#8b6f5e;">© 2026 13 Creators · This report is confidential</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>',
description = 'Placeholders: {{firstName}}, {{practitionerName}}, {{creatorTypes}}, {{faceSplitNotes}}, {{bodyAnnotationNotes}}, {{originalImageUrl}}, {{leftMirroredUrl}}, {{rightMirroredUrl}}, {{bodyAnnotatedUrl}}',
updated_at = now()
WHERE template_key = 'profiling_report'