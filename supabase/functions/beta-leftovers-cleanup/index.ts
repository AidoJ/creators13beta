import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const targets = [
  ["email-assets", "tmp/quiz-bank-v2.json", "bc8e8523-4709-42fd-b417-fe001062711d"],
  ["game-card-art", "cards/animal-arctic-hare.png", "e83b330b-d015-41da-ad93-bbbf9beb2fad"],
  ["game-card-art", "cards/animal-knome.png", "a381600b-fe9a-4dc3-b6d3-1feff1641fd5"],
  ["game-card-art", "famous/lake.png", "6dc495c6-1ad7-47d6-924c-6434011b5707"],
  ["game-card-art", "famous/lava.png", "ebf3d911-1242-4d7a-a0a6-9087607c32d9"],
  ["game-card-art", "famous/lightning.png", "add5265f-0a87-4a76-a0d5-1f3ab371a751"],
  ["game-card-art", "famous/mountain.png", "e22938f4-c1c4-4ef4-9a50-d48aa0dd2431"],
  ["game-card-art", "famous/ocean.png", "356866ae-ad3d-4c98-9b50-eeeed3ecf327"],
  ["game-card-art", "famous/river.png", "7254b7e4-8498-4942-abca-919f495c7613"],
  ["game-card-art", "famous/soil.png", "0b6a0420-f1cd-4b28-aecc-5aad63e13fe6"],
  ["game-card-art", "famous/sun.png", "26c199a1-e7c2-40bd-b468-79b7d2781d08"],
  ["game-card-art", "famous/tree.png", "e3d047e8-d300-4347-a93f-5194e8a41a30"],
  ["game-card-art", "famous/whirlwind.png", "2bd21b4e-9eb3-4760-98b0-7267253c245b"],
  ["game-card-art", "silhouettes/fire.svg", "a98fbc0c-23b8-4fa6-8ac2-f1c301237a90"],
  ["game-card-art", "silhouettes/lake.svg", "5bcc839b-0e78-4b9c-9b67-d077ea54887e"],
  ["game-card-art", "silhouettes/lava.svg", "787634bc-084a-46e0-83ca-e93389a2ee38"],
  ["game-card-art", "silhouettes/lightning.svg", "6132fd66-99a1-4696-8767-0bbb15c1052b"],
  ["game-card-art", "silhouettes/mountain.svg", "13fd77e9-2143-4d15-bd2a-c5c40aa0b32f"],
  ["game-card-art", "silhouettes/ocean.svg", "7436d965-817d-4ef2-b3b7-bb8b841512a6"],
  ["game-card-art", "silhouettes/river.svg", "d0574ffe-84fc-427d-b3bc-14c90378052a"],
  ["game-card-art", "silhouettes/sky.svg", "5130f89c-964c-4a7e-b2f8-442de93484c7"],
  ["game-card-art", "silhouettes/snow.svg", "29417a99-8441-4377-b0d2-c3984598c556"],
  ["game-card-art", "silhouettes/soil.svg", "bf5325dc-cadc-4e34-8692-3800b2f5a3ef"],
  ["game-card-art", "silhouettes/sun.svg", "fb82fcad-8f91-40b0-a697-52e095310a52"],
  ["game-card-art", "silhouettes/tree.svg", "3f891d85-9bef-4869-8a5b-bcb60b09f3f4"],
  ["game-card-art", "silhouettes/whirlwind.svg", "94364dd6-d259-45fc-b46b-c4eca9b3f312"],
  ["prospectus-assets", "defaults/pink-texture.jpg", "80dc49f2-6976-4da8-9750-9f829153584d"],
] as const;
const tables = "access_grid access_levels assessment_results assessments bookings bot_match_stats case_studies client_invitations client_practitioner client_recordings client_session_images community_posts contact_requests courses creator_type_family_map creator_type_profiles creator_types email_templates enrollment_recovery_episodes enrollment_recovery_events entitlements faqs features game_cards game_match_moves game_match_player_states game_match_players game_matches game_scores game_settings lesson_progress lessons member_animals member_match_scores modules onboarding_state onboarding_steps orders payment_subscriptions payments player_progress practitioner_applications products profile_discount_codes profiles profiling_photos project_co_creators projects prospectus_sections quiz_match_progress quiz_player_mastery quiz_questions seat_reservations special_cards staff_guide_steps stripe_webhook_events subscriptions system_settings training_call_events training_call_invitees training_call_tier_access training_call_tier_invites training_calls training_resources user_roles zoom_recordings".split(" ");
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" || Date.now() > Date.parse("2026-10-20T08:00:00Z")) return reply({ error: "Closed" }, 403);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("authorization");
  if (!url || !key || !authorization?.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401);
  const db = createClient(url, key);
  const { data: user, error: authError } = await db.auth.getUser(authorization.slice(7));
  if (authError || !user.user || user.user.id !== "9984d71c-5bf8-4942-b9bf-30c43b7702f8") return reply({ error: "Unauthorized" }, 401);
  const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", user.user.id).eq("role", "admin");
  if (roleError || !roles?.length) return reply({ error: "Admin required" }, 403);
  const removed: unknown[] = [];
  try {
    // Complete reference scan before deleting any file, including nested JSON and URL values.
    let text = "";
    for (const table of tables) {
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await db.from(table).select("*").range(offset, offset + 499);
        if (error) throw new Error(`Reference scan failed: ${table}`);
        text += JSON.stringify(data);
        if (!data || data.length < 500) break;
      }
    }
    for (const [bucket, path, id] of targets) {
      const parts = path.split("/");
      const filename = parts.pop();
      const { data: listing, error } = await db.storage.from(bucket).list(parts.join("/"), { limit: 1000, search: filename });
      const data = listing?.find((item) => item.name === filename);
      if (error) throw new Error("Ownership check failed");
      if (!data) continue; // Safe retry after an already-completed removal.
      if (data.id !== id) throw new Error("Unexpected object change");
      if (text.includes(path) || text.includes(path.split("/").pop() ?? path)) throw new Error("Unexpected file reference");
    }
    for (const [bucket, path] of targets) {
      const { data, error } = await db.storage.from(bucket).remove([path]);
      if (error) throw new Error(`Removal failed: ${bucket}/${path}`);
      removed.push({ bucket, path, count: data.length });
    }
    return reply({ removed });
  } catch (error) {
    return reply({ removed, error: error instanceof Error ? error.message : "Stopped" }, 409);
  }
});