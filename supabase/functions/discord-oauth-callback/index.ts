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
  falcon: "1506466059795042374",
  owl: "1506465736766525543",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // user_id passed from client
    const redirectBase = url.searchParams.get("redirect_base") || "https://creators13.lovable.app";

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400, headers: corsHeaders });
    }

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
      .eq("user_id", state)
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
        user_id: state,
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
