-- Add new enrollment step for case study subjects awaiting profiling approval
ALTER TYPE public.enrollment_step ADD VALUE 'awaiting_profiling' AFTER 'booking_made';