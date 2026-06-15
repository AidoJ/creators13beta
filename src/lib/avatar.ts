import { supabase } from "@/integrations/supabase/client";

/**
 * Stock avatars — the 13 Creator Type watercolour silhouettes on tinted
 * discs, served from /public/stock-avatars/{key}.svg. When a member hides
 * their photo, community RPCs surface their chosen stock avatar as a
 * "stock:<key>" ref in the avatar_url field.
 */
export const STOCK_AVATAR_PREFIX = "stock:";

/** Curated "people" stock avatars (illustrations). Keyed by slug → PNG file. */
export const PEOPLE_STOCK_AVATARS: { key: string; label: string }[] = [
  { key: "woman-blue-scarf", label: "Woman with blue scarf" },
  { key: "man-glasses", label: "Man with glasses" },
  { key: "man-brown-hair", label: "Man with brown hair" },
  { key: "woman-teacher", label: "Woman with reading glasses" },
  { key: "anime-boy", label: "Anime-style young man" },
  { key: "girl-buns", label: "Girl with space buns" },
  { key: "teddy-bear", label: "Purple teddy bear" },
  { key: "penguin", label: "Penguin" },
];

const PEOPLE_KEYS = new Set(PEOPLE_STOCK_AVATARS.map((a) => a.key));

export function isStockAvatarRef(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(STOCK_AVATAR_PREFIX);
}

/** Accepts either a bare key ("fire", "penguin") or a ref ("stock:penguin"). */
export function stockAvatarUrl(keyOrRef: string): string {
  const key = keyOrRef.replace(/^stock:/, "").toLowerCase();
  if (PEOPLE_KEYS.has(key)) return `/stock-avatars/people/${key}.png`;
  return `/stock-avatars/${key}.svg`;
}

/**
 * Returns a display URL for an avatar value stored in profiles.avatar_url.
 * - "stock:<key>" refs resolve to the bundled stock avatar image.
 * - If the value is already an absolute URL (http/https), it's returned as-is
 *   (covers legacy avatars, gravatar, OAuth provider URLs, etc.).
 * - Otherwise it's treated as a storage key inside the `profile-avatars`
 *   bucket and a long-lived signed URL is generated.
 */
export async function resolveAvatarUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (isStockAvatarRef(v)) return stockAvatarUrl(v);
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
