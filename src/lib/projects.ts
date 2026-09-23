import { supabase } from "@/integrations/supabase/client";

/** All 13 Creator Types, canonical order. Sky is included — all forces are equal. */
export const CREATOR_TYPES = [
  "Lava",
  "Fire",
  "Whirlwind",
  "Snow",
  "Lightning",
  "Sun",
  "Lake",
  "Ocean",
  "Tree",
  "Mountain",
  "Soil",
  "River",
  "Sky",
] as const;

/**
 * Seeking Team Roles is a plain tick list of exactly three options.
 * "The Adaptor" (Sky's stored team_role value) is never a fourth checkbox here —
 * Adaptor flexing belongs to person-matching, a separate feature.
 */
export const TEAM_ROLES = ["Director", "Stabilizer", "Integrator"] as const;

export const FUNDING_STATUSES = ["Funding", "Seeking Funding", "Pro Bono"] as const;
export const PROXIMITIES = ["Remote", "In-person", "Remote + In-person"] as const;
export const DURATION_UNITS = ["weeks", "months"] as const;

export const THUMBNAIL_BUCKET = "project-thumbnails";
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
export const ALLOWED_THUMBNAIL_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface Project {
  id: string;
  creator_id: string;
  name: string;
  thumbnail_url: string | null;
  location_label: string;
  location_lat: number | null;
  location_lng: number | null;
  proximity: string;
  url: string | null;
  description: string;
  start_date: string;
  duration_value: number;
  duration_unit: string;
  funding_status: string;
  seeking_creator_types: string[];
  seeking_team_roles: string[];
  seeking_skills: string | null;
  other_info: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoCreator {
  project_id: string;
  user_id: string;
  added_by: string | null;
}

/** Thumbnails live in a private bucket; resolve a temporary viewing link. */
export async function signedThumbnailUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from(THUMBNAIL_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export function formatDuration(value: number, unit: string): string {
  const n = Number(value);
  const singular = unit.replace(/s$/, "");
  return `${n} ${n === 1 ? singular : `${singular}s`}`;
}
