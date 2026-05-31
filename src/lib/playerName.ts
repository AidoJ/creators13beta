import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * Best-effort full display name for a player. Tries the user's profile
 * (first + last name, then display_name), falling back to user metadata
 * and finally the email prefix.
 */
export async function fetchPlayerDisplayName(user: User): Promise<string> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      const full = [data.first_name, data.last_name]
        .filter((s) => !!s && String(s).trim().length > 0)
        .join(" ")
        .trim();
      if (full) return full;
      if (data.display_name && data.display_name.trim()) return data.display_name.trim();
    }
  } catch {
    /* ignore */
  }
  const meta = (user.user_metadata as any) ?? {};
  if (meta.full_name) return String(meta.full_name);
  if (meta.name) return String(meta.name);
  return user.email?.split("@")[0] ?? "Player";
}

/** Short label for the board: "First L." (first name + last initial). Falls back
 *  to display name / email prefix when last name is missing. */
export async function fetchPlayerShortName(user: User): Promise<string> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      const first = (data.first_name ?? "").trim();
      const last = (data.last_name ?? "").trim();
      if (first && last) return `${first} ${last[0].toUpperCase()}.`;
      if (first) return first;
      if (data.display_name?.trim()) return data.display_name.trim();
    }
  } catch {
    /* ignore */
  }
  return user.email?.split("@")[0] ?? "Player";
}
