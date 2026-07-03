// Initiates the Discord OAuth account-link flow.
// Requires a signed-in user. Generates a cryptographically random single-use
// state token, persists it against the caller's user_id with a 10-minute TTL,
// and returns the Discord authorize URL to redirect to.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser, AuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_CLIENT_ID = Deno.env.get("DISCORD_APPLICATION_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SAFE_HOSTS = /\.lovable\.app$/;

function getSafeRedirectBase(value: string | null | undefined): string {
  if (!value) return "https://creators13.lovable.app";
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" && SAFE_HOSTS.test(parsed.hostname)) return parsed.origin;
  } catch (_) { /* fall through */ }
  return "https://creators13.lovable.app";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const redirectBase = getSafeRedirectBase(body?.redirectBase);

    // Random 256-bit token, base64url-encoded.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await admin.from("discord_oauth_states").insert({
      token, user_id: user.id, redirect_base: redirectBase,
    });
    if (error) throw error;

    // Best-effort cleanup of expired tokens.
    await admin.from("discord_oauth_states").delete().lt("expires_at", new Date().toISOString());

    const redirectUri = `${SUPABASE_URL}/functions/v1/discord-oauth-callback`;
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      response_type: "code",
      scope: "identify guilds.join",
      redirect_uri: redirectUri,
      state: token,
      prompt: "consent",
    });
    const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("discord-oauth-init error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
