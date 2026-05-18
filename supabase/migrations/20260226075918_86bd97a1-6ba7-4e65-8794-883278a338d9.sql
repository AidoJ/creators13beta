UPDATE email_templates
SET html_body = REPLACE(
  html_body,
  E'<div style="padding:100px 0;">\n                    <img src="https://creators13.lovable.app/email/play-button.png" alt="Play Video" width="68" height="48" style="border:0;display:inline-block;" />\n                  </div>',
  E'<div style="padding:80px 0;text-align:center;">\n                    <div style="display:inline-block;width:68px;height:48px;background-color:#FF0000;border-radius:14px;text-align:center;line-height:48px;box-shadow:0 4px 15px rgba(0,0,0,0.3);">\n                      <div style="display:inline-block;width:0;height:0;border-top:14px solid transparent;border-bottom:14px solid transparent;border-left:22px solid #ffffff;margin-left:5px;vertical-align:middle;"></div>\n                    </div>\n                  </div>'
),
updated_at = now()
WHERE template_key = 'case_study_invite';