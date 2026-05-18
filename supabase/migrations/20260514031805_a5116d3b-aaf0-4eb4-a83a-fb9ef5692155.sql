UPDATE public.email_templates
SET html_body = replace(
  html_body,
  '<a href="{{inviteLink}}"',
  '<p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px 0;text-align:center;">Your Practitioner''s code: <strong style="color:#1a1a2e;font-size:16px;">{{practitionerCode}}</strong></p><a href="{{inviteLink}}"'
)
WHERE template_key = 'case_study_invite'
  AND html_body NOT LIKE '%{{practitionerCode}}%';

UPDATE public.email_templates
SET html_body = replace(
  html_body,
  'Password: The password you chose during sign-up</p></div>',
  'Password: The password you chose during sign-up</p><p style="margin:8px 0 0 0;font-size:14px;color:#555;">Your Practitioner''s code: <strong style="color:#1a1a2e;">{{practitionerCode}}</strong></p></div>'
)
WHERE template_key = 'case_study_welcome'
  AND html_body NOT LIKE '%{{practitionerCode}}%';