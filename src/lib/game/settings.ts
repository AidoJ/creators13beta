/**
 * Global game settings — single 'global' row in public.game_settings.
 * Admin/Trainer configurable; everyone reads.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GameSettings {
  points_per_win: number;
  elo_win: number;
  elo_loss: number;
  perfect_eco_bonus: number;
  top_score_default: number;
  beat_clock_match_minutes: number;
  beat_clock_turn_seconds: number;
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
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  points_per_win: 3,
  elo_win: 20,
  elo_loss: -15,
  perfect_eco_bonus: 0,
  top_score_default: 50,
  beat_clock_match_minutes: 20,
  beat_clock_turn_seconds: 20,
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
