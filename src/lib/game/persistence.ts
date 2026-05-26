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
      state: serializeMatch(args.state) as any,
      last_action_by: args.hostUserId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as GameMatchRow;
}

export async function loadMatch(matchId: string): Promise<{ row: GameMatchRow; state: MatchState }> {
  const { data, error } = await supabase
    .from("game_matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (error) throw error;
  const row = data as unknown as GameMatchRow;
  return { row, state: deserializeMatch(row.state) };
}

export async function saveMatchState(args: {
  matchId: string;
  actingUserId: string;
  state: MatchState;
  /** For pvp, caller maps slot ("host"/"guest") to a real user_id. */
  winnerUserId?: string | null;
}): Promise<void> {
  const status: MatchStatus = args.state.finished ? "finished" : "active";
  const { error } = await supabase
    .from("game_matches")
    .update({
      state: serializeMatch(args.state) as any,
      status,
      winner_user_id: args.state.finished ? args.winnerUserId ?? null : null,
      last_action_by: args.actingUserId,
    })
    .eq("id", args.matchId);
  if (error) throw error;
}

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
    .select("*")
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
