
-- Add timezone to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Australia/Sydney';

-- Create training_calls table
CREATE TABLE public.training_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  zoom_link text,
  created_by uuid NOT NULL,
  recurrence_rule text DEFAULT 'none' CHECK (recurrence_rule IN ('none', 'weekly', 'fortnightly', 'monthly')),
  recurrence_end_date date,
  parent_call_id uuid REFERENCES public.training_calls(id) ON DELETE CASCADE,
  cancelled boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_calls ENABLE ROW LEVEL SECURITY;

-- Trainers can manage all calls
CREATE POLICY "Trainers can manage training calls"
  ON public.training_calls FOR ALL
  USING (has_role(auth.uid(), 'trainer'::app_role));

-- Practitioners and trainees can view calls
CREATE POLICY "Practitioners can view training calls"
  ON public.training_calls FOR SELECT
  USING (
    has_role(auth.uid(), 'practitioner'::app_role)
    OR has_role(auth.uid(), 'trainee'::app_role)
  );

-- Admins can view calls
CREATE POLICY "Admins can view training calls"
  ON public.training_calls FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
