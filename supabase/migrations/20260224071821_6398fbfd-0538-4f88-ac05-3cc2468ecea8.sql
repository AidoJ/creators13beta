
CREATE TABLE public.training_call_invitees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.training_calls(id) ON DELETE CASCADE,
  user_id UUID,
  email TEXT NOT NULL,
  name TEXT,
  invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_call_invitees_call_id ON public.training_call_invitees(call_id);

ALTER TABLE public.training_call_invitees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can manage call invitees" ON public.training_call_invitees
  FOR ALL USING (has_role(auth.uid(), 'trainer'::app_role));

CREATE POLICY "Practitioners can view call invitees" ON public.training_call_invitees
  FOR SELECT USING (has_role(auth.uid(), 'practitioner'::app_role) OR has_role(auth.uid(), 'trainee'::app_role));

CREATE POLICY "Admins can view call invitees" ON public.training_call_invitees
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
