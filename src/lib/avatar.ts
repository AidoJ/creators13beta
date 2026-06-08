import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a display URL for an avatar value stored in profiles.avatar_url.
 * - If the value is already an absolute URL (http/https), it's returned as-is
 *   (covers legacy avatars, gravatar, OAuth provider URLs, etc.).
 * - Otherwise it's treated as a storage key inside the `profile-avatars`
 *   bucket and a long-lived signed URL is generated.
 */
export async function resolveAvatarUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const { data, error } = await supabase
    .storage
    .from("profile-avatars")
    .createSignedUrl(v, 60 * 60 * 24 * 365); // 1 year
  if (error) {
    console.warn("avatar signed URL failed", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Standard storage key for a member's avatar. */
export function avatarStorageKey(userId: string, ext: string = "jpg"): string {
  return `${userId}/avatar.${ext.replace(/^\./, "")}`;
}
