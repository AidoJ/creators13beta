import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
const DISCORD_GUILD_ID = Deno.env.get("DISCORD_GUILD_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Canonical tier → Discord role ID map. Must stay in sync with discord-oauth-callback.
const TIER_ROLE_IDS: Record<string, string> = {
  wren: "1506466229576142870",
  robin: "1506466135883649124",
  cockatoo: "1506466059795042374",
  owl: "1506465736766525543",
};
const ALL_TIER_ROLE_IDS = Object.values(TIER_ROLE_IDS);

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SYNC-DISCORD-ROLE] ${step}${d}`);
};

async function syncOne(
  admin: ReturnType<typeof createClient>,
  userId: string
): Promise<{ userId: string; synced: boolean; reason?: string; tier?: string }> {
  // Look up Discord link
  const { data: link } = await admin
    .from("discord_links")
    .select("discord_user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!link?.discord_user_id) {
    return { userId, synced: false, reason: "no_discord_link" };
  }

  // Look up subscription tier (default to wren if no active sub)
  const { data: sub } = await admin
    .from("subscriptions")
    .select("tier, status")
    .eq("user_id", userId)
    .maybeSingle();

  const isActive = sub?.status === "active" || sub?.status === "trialing";
  const tier = (isActive && sub?.tier ? sub.tier : "wren").toLowerCase();
  const targetRoleId = TIER_ROLE_IDS[tier];

  if (!targetRoleId) {
    return { userId, synced: false, reason: `unknown_tier:${tier}` };
  }

  const discordUserId = link.discord_user_id;
  const headers = { Authorization: `Bot ${DISCORD_BOT_TOKEN}` };

  // Clean-ladder: remove all OTHER tier roles, then add the target one.
  for (const roleId of ALL_TIER_ROLE_IDS) {
    if (roleId === targetRoleId) continue;
    const res = await fetch(
      `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`,
      { method: "DELETE", headers }
    );
    // 204 = removed, 404 = didn't have it (fine). Anything else: log.
    if (!res.ok && res.status !== 404) {
      log("role_remove_failed", { userId, roleId, status: res.status, body: await res.text() });
    }
  }

  const addRes = await fetch(
    `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}/roles/${targetRoleId}`,
    { method: "PUT", headers }
  );
  if (!addRes.ok) {
    log("role_add_failed", { userId, targetRoleId, status: addRes.status, body: await addRes.text() });
    return { userId, synced: false, reason: `add_failed:${addRes.status}`, tier };
  }

  await admin
    .from("discord_links")
    .update({ last_synced_at: new Date().toISOString(), last_synced_role: tier })
    .eq("user_id", userId);

  return { userId, synced: true, tier };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let userId: string | undefined;
    let syncAll = false;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      userId = body.user_id;
      syncAll = !!body.sync_all;
    } else {
      const url = new URL(req.url);
      userId = url.searchParams.get("user_id") || undefined;
      syncAll = url.searchParams.get("sync_all") === "true";
    }

    // Single-user mode (called from Stripe webhook)
    if (userId && !syncAll) {
      const result = await syncOne(admin, userId);
      log("single_sync_complete", result);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Bulk mode (called from nightly cron)
    if (syncAll) {
      const { data: links } = await admin.from("discord_links").select("user_id");
      const results = [];
      for (const link of links || []) {
        try {
          const r = await syncOne(admin, link.user_id);
          results.push(r);
        } catch (e) {
          results.push({ userId: link.user_id, synced: false, reason: String(e) });
        }
        // Gentle rate-limit pause (Discord allows ~50 req/s globally).
        await new Promise((r) => setTimeout(r, 50));
      }
      const summary = {
        total: results.length,
        synced: results.filter((r) => r.synced).length,
        skipped: results.filter((r) => !r.synced).length,
      };
      log("bulk_sync_complete", summary);
      return new Response(JSON.stringify({ summary, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(
      JSON.stringify({ error: "Provide user_id or sync_all=true" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (e) {
    log("error", { message: String(e) });
    return new Response(JSON.stringify({ error: String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
