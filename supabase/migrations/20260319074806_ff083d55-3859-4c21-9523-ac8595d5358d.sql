-- Fix case_study_welcome: space-prefixed Arial and Georgia heading fonts
UPDATE email_templates 
SET html_body = replace(
  replace(html_body, 'font-family: Arial,sans-serif', 'font-family:''Questrial'',Arial,sans-serif'),
  'font-family:Georgia,serif', 'font-family:''Questrial'',Arial,sans-serif'
), updated_at = now()
WHERE template_key = 'case_study_welcome';
