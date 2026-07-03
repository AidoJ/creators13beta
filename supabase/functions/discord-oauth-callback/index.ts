import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_CLIENT_ID = Deno.env.get("DISCORD_APPLICATION_ID")!;
const DISCORD_CLIENT_SECRET = Deno.env.get("DISCORD_CLIENT_SECRET")!;
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
const DISCORD_GUILD_ID = Deno.env.get("DISCORD_GUILD_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TIER_ROLE_IDS: Record<string, string> = {
  wren: "1506466229576142870",
  robin: "1506466135883649124",
  cockatoo: "1506466059795042374",
  owl: "1506465736766525543",
};

const getSafeRedirectBase = (value: string | null) => {
  if (!value) return "https://creators13.lovable.app";
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" && parsed.hostname.endsWith(".lovable.app")) return parsed.origin;
  } catch (_) {
    // Ignore malformed redirect values and use the production fallback.
  }
  return "https://creators13.lovable.app";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Consume the single-use state nonce. Must exist, not be expired, and
    // is deleted immediately after read to prevent replay. Legacy state
    // formats (raw user_id or JSON blobs) are intentionally rejected — they
    // were the vulnerability that allowed account-link hijacking.
    const { data: stateRow, error: stateErr } = await admin
      .from("discord_oauth_states")
      .select("user_id, redirect_base, expires_at")
      .eq("token", state)
      .maybeSingle();
    if (stateErr) {
      console.error("discord state lookup failed", stateErr);
      return new Response("Invalid state", { status: 400, headers: corsHeaders });
    }
    if (!stateRow) {
      return new Response("Invalid or expired state", { status: 400, headers: corsHeaders });
    }
    // Delete immediately (single-use).
    await admin.from("discord_oauth_states").delete().eq("token", state);
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      return new Response("State expired", { status: 400, headers: corsHeaders });
    }

    const userId = stateRow.user_id as string;
    const redirectBase = getSafeRedirectBase(stateRow.redirect_base);

    const redirectUri = `${SUPABASE_URL}/functions/v1/discord-oauth-callback`;


    // Exchange code for token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("Token exchange failed", t);
      return new Response("Discord token exchange failed", { status: 400, headers: corsHeaders });
    }
    const tokenData = await tokenRes.json();

    // Get Discord user info
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();
    const discordUserId = discordUser.id;
    const discordUsername = discordUser.username;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up user's subscription tier
    const { data: sub } = await admin
      .from("subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();
    const tier = (sub?.tier || "wren").toLowerCase();
    const roleId = TIER_ROLE_IDS[tier];

    // Add user to guild (if not already) + assign role
    await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: tokenData.access_token }),
    });

    if (roleId) {
      const roleRes = await fetch(
        `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`,
        { method: "PUT", headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
      );
      if (!roleRes.ok) console.error("Role assign failed", await roleRes.text());
    }

    // Store the link
    await admin.from("discord_links").upsert(
      {
        user_id: userId,
        discord_user_id: discordUserId,
        discord_username: discordUsername,
        linked_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        last_synced_role: tier,
      },
      { onConflict: "user_id" }
    );

    // Redirect back to dashboard
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: `${redirectBase}/dashboard?discord=linked` },
    });
  } catch (e) {
    console.error("discord-oauth-callback error", e);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
