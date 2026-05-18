INSERT INTO email_templates (template_key, subject, html_body, description)
VALUES (
  'photos_uploaded_notification',
  'Your client {{clientName}} has uploaded their photos',
  '<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;">
<div style="max-width:520px;margin:40px auto;padding:32px;border:1px solid #e5e5e5;border-radius:12px;">
<h1 style="font-size:20px;color:#1a1a1a;margin:0 0 16px 0;">New Photos Uploaded</h1>
<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px 0;">Hi {{practitionerName}},</p>
<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px 0;">Your client <strong>{{clientName}}</strong> has successfully uploaded their profiling photos. You can now view them in your practitioner dashboard.</p>
<div style="text-align:center;margin:24px 0;">
<a href="{{viewLink}}" style="display:inline-block;background:#BB1B56;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Photos →</a>
</div>
<p style="color:#999;font-size:12px;margin:24px 0 0 0;">— 13 Creators</p>
</div>
</body></html>',
  'Sent to the assigned practitioner when a client uploads profiling photos. Placeholders: {{clientName}}, {{practitionerName}}, {{viewLink}}'
)
ON CONFLICT (template_key) DO NOTHING;