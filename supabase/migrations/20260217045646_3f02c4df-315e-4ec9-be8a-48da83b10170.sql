
-- Add audience column to differentiate client vs practitioner FAQs
ALTER TABLE public.faqs ADD COLUMN audience TEXT NOT NULL DEFAULT 'practitioner';

-- Update existing FAQs to be practitioner-targeted
UPDATE public.faqs SET audience = 'practitioner' WHERE audience = 'practitioner';
