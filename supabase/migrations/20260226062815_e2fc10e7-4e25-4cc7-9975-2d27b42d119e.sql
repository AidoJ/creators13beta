UPDATE email_templates
SET html_body = REPLACE(
  html_body,
  '<td style="background-color:#f5f0eb;padding:24px 32px;text-align:center;">
              <a href="https://www.youtube.com/watch?v=N_hAuOoWFjM" target="_blank" style="display:inline-block;">
                <img src="https://img.youtube.com/vi/N_hAuOoWFjM/hqdefault.jpg" alt="Watch: 12 Creator Types In 12 Minutes" width="480" style="max-width:100%;border-radius:12px;border:2px solid #d4c5a9;" />
              </a>
              <p style="margin:12px 0 0;font-size:12px;color:#888;font-style:italic;">Watch: 12 Creator Types In 12 Minutes</p>
            </td>',
  '<td style="background-color:#f5f0eb;padding:24px 32px;text-align:center;">
              <a href="https://www.youtube.com/watch?v=N_hAuOoWFjM" target="_blank" style="display:block;max-width:480px;margin:0 auto;text-decoration:none;">
                <div style="background:url(''https://img.youtube.com/vi/N_hAuOoWFjM/hqdefault.jpg'') center/cover no-repeat;border-radius:12px;border:2px solid #d4c5a9;max-width:480px;margin:0 auto;text-align:center;">
                  <div style="padding:100px 0;">
                    <img src="https://creators13.lovable.app/email/play-button.png" alt="Play Video" width="68" height="48" style="border:0;display:inline-block;" />
                  </div>
                </div>
              </a>
              <p style="margin:12px 0 0;font-size:12px;color:#888;font-style:italic;">▶ Watch: 12 Creator Types In 12 Minutes</p>
            </td>'
),
updated_at = now()
WHERE template_key = 'case_study_invite';