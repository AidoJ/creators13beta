
-- Add unique constraint on client_practitioner so upserts work
ALTER TABLE public.client_practitioner
ADD CONSTRAINT client_practitioner_client_practitioner_unique UNIQUE (client_id, practitioner_id);
