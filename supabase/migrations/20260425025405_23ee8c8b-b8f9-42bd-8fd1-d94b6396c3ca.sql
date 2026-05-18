-- Add a column to track when reminder was sent so we don't double-send
ALTER TABLE public.client_invitations
ADD COLUMN IF NOT EXISTS reminder_sent_at timestamp with time zone;

-- Seed the case study invite reminder email template
INSERT INTO public.email_templates (template_key, subject, html_body, description)
VALUES (
  'case_study_invite_reminder',
  'Reminder: Complete Your Case Study Invitation',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reminder</title></head>
<body style="margin:0;padding:0;background:#FAF7F4;font-family:Arial,sans-serif;color:#3a2a20;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#FAF7F4;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#BB1B56,#8b1340);padding:32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">A friendly reminder</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.5;">Hi {{clientName}},</p>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#5A3A28;">
            We noticed you haven''t yet completed your case study invitation from <strong>{{practitionerName}}</strong>.
            It only takes a few minutes to get started — your photos help us create your personalised Creator Type profile.
          </p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#5A3A28;">
            Click the button below to continue where you left off:
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="{{inviteLink}}" style="display:inline-block;background:#BB1B56;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
              Complete Your Invitation →
            </a>
          </div>
          <p style="margin:24px 0 0 0;font-size:13px;line-height:1.5;color:#8B6F5E;">
            If the button doesn''t work, copy and paste this link into your browser:<br/>
            <a href="{{inviteLink}}" style="color:#BB1B56;word-break:break-all;">{{inviteLink}}</a>
          </p>
          <p style="margin:24px 0 0 0;font-size:13px;line-height:1.5;color:#8B6F5E;">
            If you have any questions, simply reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>',
  'Sent automatically 7 days after a case study invitation if the invitee has not clicked the link or uploaded photos.'
)
ON CONFLICT (template_key) DO NOTHING;