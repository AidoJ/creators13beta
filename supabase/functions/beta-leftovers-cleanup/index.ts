import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const targets = [
  ["email-assets", "tmp/quiz-bank-v2.json", "bc8e8523-4709-42fd-b417-fe001062711d"],
  ["game-card-art", "cards/animal-arctic-hare.png", "e83b330b-d015-41da-ad93-bbbf9beb2fad"],
  ["game-card-art", "cards/animal-knome.png", "a381600b-fe9a-4dc3-b6d3-1feff1641fd5"],
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
      const { data, error } = await db.schema("storage").from("objects").select("id,name,bucket_id,owner_id").eq("id", id).maybeSingle();
      if (error) throw new Error("Ownership check failed");
      if (!data) continue; // Safe retry after an already-completed removal.
      if (data.name !== path || data.bucket_id !== bucket || data.owner_id !== null) throw new Error("Unexpected ownership/path change");
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