-- Standardise all email template body fonts to Questrial
-- case_study_approved
UPDATE email_templates SET html_body = replace(html_body, 'font-family:Arial,sans-serif', 'font-family:''Questrial'',Arial,sans-serif'), updated_at = now() WHERE template_key = 'case_study_approved';

-- case_study_invite
UPDATE email_templates SET html_body = replace(html_body, 'font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Oxygen,Ubuntu,sans-serif', 'font-family:''Questrial'',Arial,sans-serif'), updated_at = now() WHERE template_key = 'case_study_invite';

-- case_study_submitted
UPDATE email_templates SET html_body = replace(html_body, 'font-family:Arial,sans-serif', 'font-family:''Questrial'',Arial,sans-serif'), updated_at = now() WHERE template_key = 'case_study_submitted';

-- case_study_welcome
UPDATE email_templates SET html_body = replace(html_body, 'font-family:Arial,sans-serif', 'font-family:''Questrial'',Arial,sans-serif'), updated_at = now() WHERE template_key = 'case_study_welcome';

-- photos_uploaded_notification
UPDATE email_templates SET html_body = replace(html_body, 'font-family:Arial,sans-serif', 'font-family:''Questrial'',Arial,sans-serif'), updated_at = now() WHERE template_key = 'photos_uploaded_notification';

-- training_call_cancelled
UPDATE email_templates SET html_body = replace(html_body, 'font-family:Georgia,serif', 'font-family:''Questrial'',Arial,sans-serif'), updated_at = now() WHERE template_key = 'training_call_cancelled';

-- training_call_invite (system font stack)
UPDATE email_templates SET html_body = replace(html_body, 'font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif', 'font-family:''Questrial'',Arial,sans-serif'), updated_at = now() WHERE template_key = 'training_call_invite';

-- training_call_reminder
UPDATE email_templates SET html_body = replace(html_body, 'font-family:Georgia,serif', 'font-family:''Questrial'',Arial,sans-serif'), updated_at = now() WHERE template_key = 'training_call_reminder';

-- training_call_rescheduled
UPDATE email_templates SET html_body = replace(html_body, 'font-family:Georgia,serif', 'font-family:''Questrial'',Arial,sans-serif'), updated_at = now() WHERE template_key = 'training_call_rescheduled';
