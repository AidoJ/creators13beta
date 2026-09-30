import { supabase } from "@/integrations/supabase/client";

export const EVENT_COVER_BUCKET = "event-covers";
export const MAX_EVENT_COVER_BYTES = 5 * 1024 * 1024;
export const ALLOWED_EVENT_COVER_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * cover_image_url may be a full external URL (https://…) or a storage path
 * inside the private event-covers bucket. Returns a displayable URL either way.
 */
export async function resolveEventCoverUrl(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const { data, error } = await supabase.storage
    .from(EVENT_COVER_BUCKET)
    .createSignedUrl(value, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
