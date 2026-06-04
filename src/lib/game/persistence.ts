/**
 * Supabase persistence for game matches.
 *
 * Single match row per game; we upsert the whole serialized state on every
 * action. For the volume this game ever sees (one row updated per turn)
 * that's perfectly fine.
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
  host_user_id: string;
  host_name: string;
  guest_user_id: string | null;
  guest_name: string | null;
  invite_token: string | null;
  state: SerializedMatchState;
  /** Server-managed monotonic sequence. Bumped by `commit_move`. */
  seq: number;
  /** True for pvp matches with ELO impact. Solo bot matches set this false. */
  is_ranked: boolean;
  /** Opponent-redacted copy of `state` written by the server. */
  public_state: SerializedMatchState | null;
  winner_user_id: string | null;
  last_action_by: string | null;
  created_at: string;
  updated_at: string;
}

function makeToken(): string {
  // 24-char URL-safe token. Good enough as a non-guessable invite secret.
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
      // Solo bot matches are non-ranked — kept client-authoritative.
      is_ranked: args.mode === "pvp",
      state: serializeMatch(args.state) as any,
      last_action_by: args.hostUserId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as GameMatchRow;
}

const NON_STATE_COLS =
  "id, mode, status, host_user_id, host_name, guest_user_id, guest_name, invite_token, seq, is_ranked, public_state, winner_user_id, last_action_by, created_at, updated_at";

export async function loadMatch(matchId: string): Promise<{ row: GameMatchRow; state: MatchState }> {
  // `state` is no longer in the SELECT grant for `authenticated`; fetch the
  // row (sans state) and resolve the caller's redacted view via RPC.
  const [rowRes, stateRes] = await Promise.all([
    supabase.from("game_matches").select(NON_STATE_COLS).eq("id", matchId).single(),
    supabase.rpc("get_match_state", { _match_id: matchId }),
  ]);
  if (rowRes.error) throw rowRes.error;
  if (stateRes.error) throw stateRes.error;
  const row = { ...(rowRes.data as any), state: stateRes.data } as unknown as GameMatchRow;
  return { row, state: deserializeMatch(stateRes.data as unknown as SerializedMatchState) };
}

// saveMatchState was the legacy client-authoritative writer for game_matches.
// PvP now goes through the apply-move edge function; solo bot matches persist
// via localStorage. Clients no longer have UPDATE privilege on
// game_matches.state, so any call here would throw RLS. Removed.

export async function acceptInvite(token: string, guestName: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_game_invite", {
    _token: token,
    _guest_name: guestName,
  });
  if (error) throw error;
  return data as string;
}

export async function listMyActiveMatches(userId: string): Promise<GameMatchRow[]> {
  const { data, error } = await supabase
    .from("game_matches")
    .select(NON_STATE_COLS)
    .or(`host_user_id.eq.${userId},guest_user_id.eq.${userId}`)
    .neq("status", "finished")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as unknown as GameMatchRow[];
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/play/join/${token}`;
}
