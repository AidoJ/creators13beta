UPDATE email_templates
SET html_body = REPLACE(
  html_body,
  'background:linear-gradient(135deg,#8B6914,#5C4033)',
  'background:#B654AB'
),
updated_at = now()
WHERE template_key = 'case_study_invite';