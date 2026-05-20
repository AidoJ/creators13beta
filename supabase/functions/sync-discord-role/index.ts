// Sync a user's Discord guild role to match their current subscription tier.
// Removes any previously-assigned tier roles, then assigns the role matching their active tier.
// Invoked by stripe-webhook on subscription create/update/delete, and by a nightly cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
const DISCORD_GUILD_ID = Deno.env.get("DISCORD_GUILD_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TIER_ROLE_IDS: Record<string, string> = {
  wren: "1506466229576142870",
  robin: "1506466135883649124",
  falcon: "1506466059795042374",
  owl: "1506465736766525543",
};
const ALL_TIER_ROLE_IDS = Object.values(TIER_ROLE_IDS);

const log = (step: string, details?: unknown) =>
  console.log(`[SYNC-DISCORD-ROLE] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

async function syncOne(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ user_id: string; ok: boolean; tier?: string; reason?: string }> {
  // 1. Get discord link
  const { data: link } = await admin
    .from("discord_links")
    .select("discord_user_id, last_synced_role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!link) return { user_id: userId, ok: false, reason: "no_discord_link" };

  // 2. Get current subscription tier (active only)
  const { data: sub } = await admin
    .from("subscriptions")
    .select("tier, status")
    .eq("user_id", userId)
    .maybeSingle();
  const isActive = sub?.status === "active";
  const tier = isActive ? (sub?.tier || "").toLowerCase() : null;
  const targetRoleId = tier ? TIER_ROLE_IDS[tier] : null;

  const discordUserId = link.discord_user_id;
  const memberUrl = `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}`;

  // 3. Remove all tier roles except the target (if any)
  for (const roleId of ALL_TIER_ROLE_IDS) {
    if (roleId === targetRoleId) continue;
    const res = await fetch(`${memberUrl}/roles/${roleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    });
    if (!res.ok && res.status !== 404) {
      log("Role remove failed (continuing)", { userId, roleId, status: res.status });
    }
  }

  // 4. Assign target role
  if (targetRoleId) {
    const res = await fetch(`${memberUrl}/roles/${targetRoleId}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    });
    if (!res.ok) {
      const t = await res.text();
      log("Role assign failed", { userId, targetRoleId, status: res.status, body: t });
      return { user_id: userId, ok: false, tier: tier ?? undefined, reason: "role_assign_failed" };
    }
  }

  // 5. Persist sync metadata
  await admin
    .from("discord_links")
    .update({
      last_synced_at: new Date().toISOString(),
      last_synced_role: tier ?? null,
    })
    .eq("user_id", userId);

  return { user_id: userId, ok: true, tier: tier ?? undefined };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { user_id, all } = body as { user_id?: string; all?: boolean };

    if (user_id) {
      const result = await syncOne(admin, user_id);
      log("Synced one", result);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (all) {
      // Nightly safety-net: sync every linked user
      const { data: links } = await admin.from("discord_links").select("user_id");
      const results: Array<Awaited<ReturnType<typeof syncOne>>> = [];
      for (const l of links ?? []) {
        results.push(await syncOne(admin, l.user_id as string));
        // small delay to be polite to Discord rate limits
        await new Promise((r) => setTimeout(r, 250));
      }
      log("Synced all", { count: results.length });
      return new Response(JSON.stringify({ count: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Provide user_id or all:true" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
