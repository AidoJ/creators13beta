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
  /** B — short 6-char human-typable code (Crockford base32, no look-alikes). */
  invite_code: string | null;
  /** B — true for matches created via the multiplayer lobby. Lobby matches
   *  stay in 'waiting' status until the host triggers `start_lobby_match`. */
  lobby_mode: boolean;
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

/**
 * B — create a multiplayer lobby match.
 *
 * Differs from `createMatchRow` in three ways:
 *   1. Always pvp + ranked, always status='waiting'.
 *   2. Sets `lobby_mode=true` so `accept_game_invite` does NOT auto-flip
 *      status to 'active' when the roster fills (the host's
 *      `start_lobby_match` move is the trigger).
 *   3. Stamps a short `invite_code` (6 chars) alongside the long token.
 *   4. Sizes `player_count` per host tier (free→2, paid→4).
 */
export async function createLobbyMatch(args: {
  hostUserId: string;
  hostName: string;
  playerCount: 2 | 3 | 4;
  state: MatchState;
}): Promise<GameMatchRow> {
  const inviteToken = makeToken();
  // Short invite code from the DB so collisions are server-checked.
  const { data: codeData, error: codeErr } = await supabase.rpc("generate_match_invite_code");
  if (codeErr) throw codeErr;
  const inviteCode = codeData as string;

  const { data, error } = await supabase
    .from("game_matches")
    .insert({
      mode: "pvp",
      status: "waiting",
      host_user_id: args.hostUserId,
      host_name: args.hostName,
      invite_token: inviteToken,
      invite_code: inviteCode,
      lobby_mode: true,
      is_ranked: true,
      player_count: args.playerCount,
      state: serializeMatch(args.state) as any,
      last_action_by: args.hostUserId,
    })
    .select("*")
    .single();
  if (error) throw error;

  // RLS blocks direct INSERT on game_match_players; bootstrap host slot via
  // a security-definer RPC that re-checks ownership server-side.
  const { error: rosterErr } = await supabase.rpc("register_lobby_host_roster", {
    _match_id: (data as any).id,
  });
  if (rosterErr) {
    console.error("[createLobbyMatch] host roster register failed", rosterErr);
    throw rosterErr;
  }

  return data as unknown as GameMatchRow;
}

const NON_STATE_COLS =
  "id, mode, status, host_user_id, host_name, guest_user_id, guest_name, invite_token, invite_code, lobby_mode, seq, is_ranked, player_count, winner_user_id, last_action_by, created_at, updated_at";

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

/** B — resolve a short 6-char invite code to the long invite token. */
export async function resolveInviteCode(code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("resolve_match_invite_code", { _code: code });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** B — host-only lobby cancel. Marks the lobby finished without a winner. */
export async function cancelLobby(matchId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_lobby_match", { _match_id: matchId });
  if (error) throw error;
}

export async function listMyActiveMatches(_userId: string): Promise<GameMatchRow[]> {
  const { data, error } = await supabase.rpc("list_my_active_matches");
  if (error) throw error;
  return ((data ?? []) as unknown as GameMatchRow[]).map((r) => ({
    ...r,
    player_count: r.player_count ?? 2,
    lobby_mode: (r as any).lobby_mode ?? false,
    invite_code: (r as any).invite_code ?? null,
  }));
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/play/join/${token}`;
}
