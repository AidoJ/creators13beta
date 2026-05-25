// Admin-only: bulk upsert game cards (slug, name, type_a, type_b, mythical,
// descriptor, art_path, sort_order). Use to re-import the catalogue when the
// source spreadsheet changes. Optionally accepts inline base64 art per card to
// upload into the `game-card-art` bucket.
//
// POST body:
// {
//   "cards": [
//     {
//       "slug": "fox",
//       "name": "Fox",
//       "type_a": "Lava",
//       "type_b": "Fire",
//       "mythical": false,
//       "descriptor": "...",        // optional
//       "art_path": "cards/animal-fox.png",
//       "sort_order": 6,
//       "art_base64": "<png base64>", // optional — uploads to bucket
//       "art_content_type": "image/png"
//     }
//   ]
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_TYPES = new Set([
  "Lava","Fire","Whirlwind","Snow","Lightning","Sun",
  "Lake","Ocean","Tree","Mountain","Soil","River","Sky",
]);

const BUCKET = "game-card-art";

interface IncomingCard {
  slug: string;
  name: string;
  type_a: string;
  type_b: string;
  mythical?: boolean;
  descriptor?: string | null;
  art_path?: string | null;
  sort_order?: number;
  art_base64?: string;
  art_content_type?: string;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is an admin using their JWT.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: user.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const cards: IncomingCard[] = body?.cards ?? [];
    if (!Array.isArray(cards) || cards.length === 0) {
      return new Response(JSON.stringify({ error: "No cards provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errors: { slug: string; error: string }[] = [];
    const uploaded: string[] = [];
    const rows: any[] = [];

    for (const c of cards) {
      if (!c.slug || !c.name || !c.type_a || !c.type_b) {
        errors.push({ slug: c.slug ?? "?", error: "Missing required fields" });
        continue;
      }
      if (!VALID_TYPES.has(c.type_a) || !VALID_TYPES.has(c.type_b)) {
        errors.push({ slug: c.slug, error: `Invalid creator type` });
        continue;
      }
      let artPath = c.art_path ?? null;
      if (c.art_base64) {
        const path = artPath ?? `cards/animal-${c.slug}.png`;
        const bytes = b64ToBytes(c.art_base64);
        const { error: upErr } = await admin.storage.from(BUCKET).upload(
          path, bytes,
          { contentType: c.art_content_type ?? "image/png", upsert: true },
        );
        if (upErr) {
          errors.push({ slug: c.slug, error: `Upload failed: ${upErr.message}` });
          continue;
        }
        artPath = path;
        uploaded.push(path);
      }
      rows.push({
        slug: c.slug,
        name: c.name,
        type_a: c.type_a,
        type_b: c.type_b,
        mythical: c.mythical ?? false,
        descriptor: c.descriptor ?? null,
        art_path: artPath,
        sort_order: c.sort_order ?? 0,
      });
    }

    let upserted = 0;
    if (rows.length > 0) {
      const { error: upsertErr, count } = await admin
        .from("game_cards")
        .upsert(rows, { onConflict: "slug", count: "exact" });
      if (upsertErr) {
        return new Response(JSON.stringify({ error: upsertErr.message, errors, uploaded }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      upserted = count ?? rows.length;
    }

    return new Response(JSON.stringify({
      ok: true, upserted, uploaded: uploaded.length, errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
