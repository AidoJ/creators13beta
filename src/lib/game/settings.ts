/**
 * Global game settings — single 'global' row in public.game_settings.
 * Admin/Trainer configurable; everyone reads.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GameSettings {
  points_per_win: number;
  /** PvP scoring — admin-configurable per player count. */
  points_win_2p: number;
  points_win_3p: number;
  points_win_4p: number;
  /** Consolation points for every non-winner in any ranked PvP match. */
  points_runner_up: number;
  elo_win: number;
  elo_loss: number;
  perfect_eco_bonus: number;
  top_score_default: number;
  beat_clock_match_minutes: number;
  beat_clock_turn_seconds: number;
  beat_clock_draw_seconds: number;
  /** Baseline per-turn idle timeout (End-of-Days + Top Score). Beat-the-Clock
   *  uses its own turn timer instead. Seconds of inactivity on a turn before
   *  the sweep auto-passes the seat (and counts a strike). */
  idle_turn_seconds: number;
  /** Consecutive idle-timeout strikes before the player is treated as
   *  departed (reuses the disconnect rank-by-score path). Resets to 0 on any
   *  real action by that player. */
  idle_turn_strikes_limit: number;
  /** Grace seconds after a player's disconnect is stamped before the match
   *  is auto-ended. In 2-player matches the survivor wins once this elapses. */
  disconnect_grace_seconds: number;

  mode_end_of_days_enabled: boolean;
  mode_top_score_enabled: boolean;
  mode_beat_clock_enabled: boolean;
  default_mode: "end_of_days" | "first_to_50" | "beat_clock";
  hand_size: number;
  hand_limit: number;
  ecosystem_target: number;
  creators_needed: number;
  animals_per_creator: number;
  enable_disasters: boolean;
  enable_golden_hive: boolean;
  enable_sky_creator: boolean;
  enable_golden_body: boolean;
  enable_sky_creature_steal: boolean;
  // Bots & matchmaking
  bot_difficulty: "easy" | "medium" | "hard";
  bot_think_ms: number;
  allow_guest_play: boolean;
  allow_solo_vs_bot: boolean;
  max_players_per_match: number;
  bot_easy_enabled: boolean;
  bot_medium_enabled: boolean;
  bot_hard_enabled: boolean;
  // UI / UX
  show_tutorial_overlay: boolean;
  
  show_review_boards: boolean;
  prompt_player_name: boolean;
  show_score_panel: boolean;
  /** Playability aids — presentation only; engine still enforces all rules. */
  highlight_playable_cards: boolean;
  highlight_valid_placements: boolean;
  featured_mode: "end_of_days" | "first_to_50" | "beat_clock" | null;
  // Live ops
  maintenance_banner_enabled: boolean;
  maintenance_banner_text: string;
  play_disabled: boolean;
  play_disabled_message: string;
  // Profile-discount CTA shown on the Player dashboard
  profile_discount_enabled: boolean;
  profile_discount_cta_title: string;
  profile_discount_cta_body: string;
  profile_discount_threshold_1: number;
  profile_discount_percent_1: number;
  profile_discount_threshold_2: number;
  profile_discount_percent_2: number;
  profile_discount_threshold_3: number;
  profile_discount_percent_3: number;

  // Creator Quiz
  quiz_enabled: boolean;
  quiz_bonus_points: number;         // Points awarded per 4 correct answers (1–5)
  quiz_questions_per_match: 4 | 8 | 12; // Max questions any player is served per match
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  points_per_win: 3,
  elo_win: 20,
  elo_loss: -15,
  perfect_eco_bonus: 0,
  top_score_default: 50,
  beat_clock_match_minutes: 20,
  beat_clock_turn_seconds: 20,
  beat_clock_draw_seconds: 10,
  idle_turn_seconds: 90,
  idle_turn_strikes_limit: 3,
  disconnect_grace_seconds: 300,

  mode_end_of_days_enabled: true,
  mode_top_score_enabled: true,
  mode_beat_clock_enabled: true,
  default_mode: "end_of_days",
  hand_size: 5,
  hand_limit: 10,
  ecosystem_target: 16,
  creators_needed: 4,
  animals_per_creator: 3,
  enable_disasters: true,
  enable_golden_hive: true,
  enable_sky_creator: true,
  enable_golden_body: true,
  enable_sky_creature_steal: true,
  bot_difficulty: "medium",
  bot_think_ms: 800,
  allow_guest_play: true,
  allow_solo_vs_bot: true,
  max_players_per_match: 2,
  bot_easy_enabled: true,
  bot_medium_enabled: true,
  bot_hard_enabled: true,
  show_tutorial_overlay: true,
  
  show_review_boards: true,
  prompt_player_name: true,
  show_score_panel: true,
  highlight_playable_cards: true,
  highlight_valid_placements: true,
  featured_mode: null,
  maintenance_banner_enabled: false,
  maintenance_banner_text: "",
  play_disabled: false,
  play_disabled_message: "The game is briefly offline for maintenance. Please check back soon.",
  profile_discount_enabled: true,
  profile_discount_cta_title: "Unlock your Creator Type",
  profile_discount_cta_body:
    "You've earned a discount on getting personally profiled. Find out which of the 13 Creators you really are.",
  profile_discount_threshold_1: 50,
  profile_discount_percent_1: 10,
  profile_discount_threshold_2: 100,
  profile_discount_percent_2: 25,
  profile_discount_threshold_3: 200,
  profile_discount_percent_3: 50,
  quiz_enabled: true,
  quiz_bonus_points: 1,
  quiz_questions_per_match: 4,
};

let cached: GameSettings | null = null;

export async function fetchGameSettings(): Promise<GameSettings> {
  if (cached) return cached;
  try {
    const { data } = await supabase
      .from("game_settings" as any)
      .select("*")
      .eq("id", "global")
      .maybeSingle();
    cached = { ...DEFAULT_GAME_SETTINGS, ...((data as any) || {}) };
    return cached;
  } catch {
    return DEFAULT_GAME_SETTINGS;
  }
}

export function invalidateGameSettings() {
  cached = null;
}

export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchGameSettings().then((s) => {
      if (alive) {
        setSettings(s);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return { settings, loading };
}
