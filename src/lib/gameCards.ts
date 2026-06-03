import { supabase } from "@/integrations/supabase/client";

export type CreatorTypeName =
  | "Lava" | "Fire" | "Whirlwind" | "Snow" | "Lightning" | "Sun"
  | "Lake" | "Ocean" | "Tree" | "Mountain" | "Soil" | "River" | "Sky";

export interface GameCard {
  id: string;
  slug: string;
  name: string;
  type_a: CreatorTypeName;
  type_b: CreatorTypeName;
  types: [CreatorTypeName, CreatorTypeName];
  /** 4-char first+last-letter code (e.g. Snow+Soil → "SwSl"). DB-generated. */
  code: string | null;
  mythical: boolean;
  descriptor: string | null;
  art_path: string | null;
  art_url: string | null;
  sort_order: number;
}

const ART_BUCKET = "game-card-art";

function decorate(row: any): GameCard {
  // Request a small, webp-encoded variant via Supabase image transforms.
  // Board hexes render at ~110px CSS (≤220px @2x), so 320px is plenty.
  // This typically cuts payload from MBs to ~20-60 KB per card.
  const art_url = row.art_path
    ? supabase.storage.from(ART_BUCKET).getPublicUrl(row.art_path, {
        transform: { width: 320, height: 320, resize: "contain", quality: 80 },
      }).data.publicUrl
    : null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type_a: row.type_a,
    type_b: row.type_b,
    types: [row.type_a, row.type_b],
    code: row.code ?? null,
    mythical: row.mythical,
    descriptor: row.descriptor,
    art_path: row.art_path,
    art_url,
    sort_order: row.sort_order,
  };
}

/** Fetch all 80 animal cards in canonical order. */
export async function fetchAllCards(): Promise<GameCard[]> {
  const { data, error } = await supabase
    .from("game_cards")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(decorate);
}

/** Fetch a single card by slug. */
export async function fetchCardBySlug(slug: string): Promise<GameCard | null> {
  const { data, error } = await supabase
    .from("game_cards")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? decorate(data) : null;
}

/** Cards that have a given Creator Type on either side. */
export async function fetchCardsForType(type: CreatorTypeName): Promise<GameCard[]> {
  const { data, error } = await supabase
    .from("game_cards")
    .select("*")
    .or(`type_a.eq.${type},type_b.eq.${type}`)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(decorate);
}

/** Admin-only: update the descriptor (reverse-side text) for a card. */
export async function updateCardDescriptor(slug: string, descriptor: string) {
  const { error } = await supabase
    .from("game_cards")
    .update({ descriptor })
    .eq("slug", slug);
  if (error) throw error;
}

/* ─── Special (non-animal) cards: Creator x12, Sky Creator, Golden Body, Golden Hive ─── */

export interface SpecialCard {
  id: string;
  slug: string;
  kind: "creator" | "sky_creator" | "golden_body" | "golden_hive";
  name: string;
  descriptor: string | null;
  art_path: string | null;
  art_url: string | null;
  color_hex: string | null;
  sort_order: number;
}

function decorateSpecial(row: any): SpecialCard {
  const art_url = row.art_path
    ? supabase.storage.from(ART_BUCKET).getPublicUrl(row.art_path, {
        transform: { width: 320, height: 320, resize: "contain", quality: 80 },
      }).data.publicUrl
    : null;
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    name: row.name,
    descriptor: row.descriptor,
    art_path: row.art_path,
    art_url,
    color_hex: row.color_hex,
    sort_order: row.sort_order,
  };
}

export async function fetchSpecialCards(): Promise<SpecialCard[]> {
  const { data, error } = await supabase
    .from("special_cards")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(decorateSpecial);
}

