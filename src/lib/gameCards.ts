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
  mythical: boolean;
  descriptor: string | null;
  art_path: string | null;
  art_url: string | null;
  sort_order: number;
}

const ART_BUCKET = "game-card-art";

function decorate(row: any): GameCard {
  const art_url = row.art_path
    ? supabase.storage.from(ART_BUCKET).getPublicUrl(row.art_path).data.publicUrl
    : null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type_a: row.type_a,
    type_b: row.type_b,
    types: [row.type_a, row.type_b],
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
