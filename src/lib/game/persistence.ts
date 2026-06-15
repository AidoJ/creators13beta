/**
 * Supabase persistence for game matches.
 *
 * A.1 (N-player schema foundations): match rosters now live in
 * `game_match_players` and per-player redacted views in
 * `game_match_player_states`. The legacy `host_user_id` / `guest_user_id` /
 * `host_name` / `guest_name` columns on `game_matches` are kept readable
 * for backwards compatibility but new code should not depend on them; they
 * are scheduled for removal in a later batch.
 */

import { supabase } from "@/integrations/supabase/client";
import type { MatchState } from "./types";
import { deserializeMatch, serializeMatch, type SerializedMatchState } from "./serialize";

export type MatchMode = "solo" | "pvp";
export type MatchStatus = "waiting" | "active" | "finished";

export interface GameMatchRow {
  id: string;
  mode: MatchMode;
  status: MatchStatus;
  /** @deprecated A.1 — use game_match_players. Kept for readback only. */
  host_user_id: string;
  /** @deprecated A.1 — use game_match_players.display_name. */
  host_name: string;
  /** @deprecated A.1 — use game_match_players. */
  guest_user_id: string | null;
  /** @deprecated A.1 — use game_match_players.display_name. */
  guest_name: string | null;
  invite_token: string | null;
  state: SerializedMatchState;
  /** Server-managed monotonic sequence. Bumped by `commit_move`. */
  seq: number;
  /** True for pvp matches with ELO impact. Solo bot matches set this false. */
  is_ranked: boolean;
  /** Number of players in the match (2..4). Defaults to 2 for legacy rows. */
  player_count: number;
  winner_user_id: string | null;
  last_action_by: string | null;
  created_at: string;
  updated_at: string;
}

function makeToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createMatchRow(args: {
  mode: MatchMode;
  hostUserId: string;
  hostName: string;
  guestName?: string;
  state: MatchState;
}): Promise<GameMatchRow> {
  const inviteToken = args.mode === "pvp" ? makeToken() : null;
  const status: MatchStatus = args.mode === "pvp" ? "waiting" : "active";
  const { data, error } = await supabase
    .from("game_matches")
    .insert({
      mode: args.mode,
      status,
      host_user_id: args.hostUserId,
      host_name: args.hostName,
      guest_name: args.guestName ?? null,
      invite_token: inviteToken,
      is_ranked: args.mode === "pvp",
      state: serializeMatch(args.state) as any,
      last_action_by: args.hostUserId,
    })
    .select("*")
    .single();
  if (error) throw error;

  // Seed the host roster row for PvP matches. Solo bot matches don't get a
  // roster (the bot has no user_id); the apply-move path is bypassed for
  // them entirely.
  if (args.mode === "pvp") {
    const { error: rosterErr } = await supabase
      .from("game_match_players")
      .insert({
        match_id: (data as any).id,
        user_id: args.hostUserId,
        slot: 0,
        display_name: args.hostName,
      });
    if (rosterErr) console.error("[createMatchRow] roster insert failed", rosterErr);
  }

  return data as unknown as GameMatchRow;
}

const NON_STATE_COLS =
  "id, mode, status, host_user_id, host_name, guest_user_id, guest_name, invite_token, seq, is_ranked, player_count, winner_user_id, last_action_by, created_at, updated_at";

export async function loadMatch(matchId: string): Promise<{ row: GameMatchRow; state: MatchState }> {
  const [rowRes, stateRes] = await Promise.all([
    supabase.from("game_matches").select(NON_STATE_COLS).eq("id", matchId).single(),
    supabase.rpc("get_match_state", { _match_id: matchId }),
  ]);
  if (rowRes.error) throw rowRes.error;
  if (stateRes.error) throw stateRes.error;
  const row = { ...(rowRes.data as any), state: stateRes.data } as unknown as GameMatchRow;
  return { row, state: deserializeMatch(stateRes.data as unknown as SerializedMatchState) };
}

export async function acceptInvite(token: string, guestName: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_game_invite", {
    _token: token,
    _guest_name: guestName,
  });
  if (error) throw error;
  return data as string;
}

export async function listMyActiveMatches(_userId: string): Promise<GameMatchRow[]> {
  // Uses the new roster-aware RPC (A.1). `_userId` is ignored — the RPC
  // derives the caller from auth.uid().
  const { data, error } = await supabase.rpc("list_my_active_matches");
  if (error) throw error;
  return ((data ?? []) as unknown as GameMatchRow[]).map((r) => ({
    ...r,
    player_count: r.player_count ?? 2,
  }));
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/play/join/${token}`;
}
