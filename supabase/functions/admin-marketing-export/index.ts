// Admin CSV export of the marketing audience. Admin-only. Filterable by
// signup_path and opt-in status. Returns CSV including a per-user tokenized
// unsubscribe URL so the external email tool can include it in every send.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Identify caller via anon client with the caller's JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claims.claims.sub as string;

    // 2. Admin/trainer only.
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const allowed = new Set((roles ?? []).map((r: { role: string }) => r.role));
    if (!allowed.has("admin") && !allowed.has("trainer")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Filters — default: player-path AND opted-in only. Pre-existing users
    // (marketing_opt_in IS NULL) are excluded by default per acceptance criteria.
    const url = new URL(req.url);
    const pathFilter = url.searchParams.get("signup_path") ?? "player";
    const optInOnly = url.searchParams.get("opt_in_only") !== "false";

    // 4. Pull the marketing segment. We join via edge-function service role,
    // because RLS on profiles restricts non-owning reads.
    let query = admin
      .from("profiles")
      .select(
        "user_id, email, first_name, created_at, marketing_opt_in, marketing_opt_in_at, marketing_unsubscribed_at, marketing_unsubscribe_token, profiling_prompt_shown_at, profiling_prompt_reached_checkout_at"
      );
    if (optInOnly) query = query.eq("marketing_opt_in", true);

    const { data: profiles, error: profErr } = await query;
    if (profErr) throw profErr;

    // 5. Filter by signup_path (lives on subscriptions table).
    const userIds = (profiles ?? []).map((p: any) => p.user_id);
    const { data: subs } = await admin
      .from("subscriptions")
      .select("user_id, signup_path")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const pathByUser = new Map<string, string>();
    for (const s of subs ?? []) pathByUser.set(s.user_id as string, (s.signup_path as string) ?? "");

    // 6. Per-user games count = multiplayer game_matches finished + bot_match_stats totals.
    const { data: gm } = await admin
      .from("game_matches")
      .select("host_user_id, guest_user_id")
      .eq("status", "finished")
      .or(
        `host_user_id.in.(${userIds.length ? userIds.join(",") : "00000000-0000-0000-0000-000000000000"}),guest_user_id.in.(${userIds.length ? userIds.join(",") : "00000000-0000-0000-0000-000000000000"})`
      );
    const gamesByUser = new Map<string, number>();
    for (const m of gm ?? []) {
      for (const uid of [m.host_user_id, m.guest_user_id] as (string | null)[]) {
        if (uid && userIds.includes(uid)) gamesByUser.set(uid, (gamesByUser.get(uid) ?? 0) + 1);
      }
    }
    const { data: bots } = await admin
      .from("bot_match_stats")
      .select("user_id, wins, losses, draws")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    for (const b of bots ?? []) {
      const n = (b.wins ?? 0) + (b.losses ?? 0) + (b.draws ?? 0);
      gamesByUser.set(b.user_id as string, (gamesByUser.get(b.user_id as string) ?? 0) + n);
    }

    // 7. Creators mastered = distinct types with any correct answers.
    const { data: mastery } = await admin
      .from("quiz_player_mastery")
      .select("user_id, creator_type_id, correct_answers")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const masteredByUser = new Map<string, Set<string>>();
    for (const row of mastery ?? []) {
      if ((row.correct_answers ?? 0) <= 0) continue;
      const s = masteredByUser.get(row.user_id as string) ?? new Set<string>();
      s.add(row.creator_type_id as string);
      masteredByUser.set(row.user_id as string, s);
    }

    // 8. Build filtered rows + CSV.
    const filtered = (profiles ?? []).filter((p: any) => {
      const sp = pathByUser.get(p.user_id) ?? "";
      return pathFilter === "*" ? true : sp === pathFilter;
    });

    const appOrigin = url.searchParams.get("app_origin") ?? "https://creators13.lovable.app";

    const rows: string[][] = [
      [
        "email",
        "first_name",
        "signup_date",
        "signup_path",
        "games_played",
        "creators_mastered",
        "profiling_status",
        "marketing_opt_in",
        "opt_in_at",
        "unsubscribed_at",
        "unsubscribe_url",
      ],
    ];
    for (const p of filtered) {
      const profilingStatus = p.profiling_prompt_reached_checkout_at
        ? "converted"
        : p.profiling_prompt_shown_at
          ? "prompted"
          : "none";
      const unsubUrl = p.marketing_unsubscribe_token
        ? `${appOrigin}/unsubscribe?token=${p.marketing_unsubscribe_token}`
        : "";
      rows.push([
        p.email ?? "",
        p.first_name ?? "",
        (p.created_at ?? "").slice(0, 10),
        pathByUser.get(p.user_id) ?? "",
        String(gamesByUser.get(p.user_id) ?? 0),
        String(masteredByUser.get(p.user_id)?.size ?? 0),
        profilingStatus,
        p.marketing_opt_in === null ? "unknown" : p.marketing_opt_in ? "true" : "false",
        p.marketing_opt_in_at ?? "",
        p.marketing_unsubscribed_at ?? "",
        unsubUrl,
      ]);
    }

    const escape = (v: string) =>
      /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = rows.map((r) => r.map(escape).join(",")).join("\n");

    // 9. Mint missing tokens so future exports have them. Fire and forget.
    const missing = filtered.filter((p: any) => !p.marketing_unsubscribe_token);
    for (const p of missing) {
      admin.rpc("ensure_marketing_unsubscribe_token", { _user_id: p.user_id }).then(() => {});
    }

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="marketing-audience-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    console.error("[admin-marketing-export]", err);
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
