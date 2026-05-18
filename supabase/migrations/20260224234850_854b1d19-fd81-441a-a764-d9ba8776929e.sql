
-- Training call events table for timeline tracking
CREATE TABLE public.training_call_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.training_calls(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'created', 'invites_sent', 'reminder_sent', 'updated', 'cancelled', 'completed'
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_call_events_call_id ON public.training_call_events(call_id);

ALTER TABLE public.training_call_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can manage call events" ON public.training_call_events
  FOR ALL USING (has_role(auth.uid(), 'trainer'::app_role));

CREATE POLICY "Practitioners can view call events" ON public.training_call_events
  FOR SELECT USING (has_role(auth.uid(), 'practitioner'::app_role) OR has_role(auth.uid(), 'trainee'::app_role));

CREATE POLICY "Admins can view call events" ON public.training_call_events
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert events" ON public.training_call_events
  FOR INSERT WITH CHECK (true);

-- Seed the reminder email template
INSERT INTO public.email_templates (template_key, subject, html_body, description)
VALUES (
  'training_call_reminder',
  '⏰ Reminder: {{title}} tomorrow',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f5f0eb;font-family:Georgia,serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f0eb;"><tr><td align="center" style="padding:40px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);"><tr><td style="background:linear-gradient(135deg,#BB1B56,#8B1440);padding:32px 32px 24px 32px;text-align:center;"><h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">⏰ Training Reminder</h1></td></tr><tr><td style="padding:32px;"><p style="color:#333;font-size:15px;margin:0 0 16px 0;">Hi {{firstName}},</p><p style="color:#333;font-size:15px;margin:0 0 16px 0;">This is a reminder that your training session is coming up tomorrow:</p><div style="background:#f9f5f1;border-radius:12px;padding:20px;margin:0 0 20px 0;"><h2 style="margin:0 0 8px 0;color:#333;font-size:17px;">{{title}}</h2>{{description}}<p style="color:#666;font-size:14px;margin:0 0 4px 0;">📅 {{localTime}}</p><p style="color:#666;font-size:14px;margin:0 0 4px 0;">⏱ {{durationMinutes}} minutes</p><p style="color:#888;font-size:12px;margin:0;">Timezone: {{timezone}}</p>{{recurrenceText}}</div>{{zoomButton}}</td></tr><tr><td style="padding:0 32px 32px 32px;text-align:center;"><p style="color:#999;font-size:11px;margin:0;">13 Creators • Training Platform</p></td></tr></table></td></tr></table></body></html>',
  'Sent automatically 24 hours before a scheduled training call. Variables: {{firstName}}, {{title}}, {{description}}, {{localTime}}, {{durationMinutes}}, {{timezone}}, {{recurrenceText}}, {{zoomButton}}'
);
