import type { MatchState } from "./types";

export type ClientStateChangeSource = "move_response" | "realtime_push" | "optimistic_engine";

function firstHandUids(state: MatchState, playerIndex: number): string[] {
  return (state.players[playerIndex]?.hand ?? []).slice(0, 3).map((card) => card.uid);
}

export function logClientStateChange(
  source: ClientStateChangeSource,
  seq: number,
  state: MatchState,
) {
  const usedTop = state.used[state.used.length - 1] ?? null;
  console.log(
    `[client] state change from ${source}\n` +
      `  seq: ${seq}\n` +
      `  players[0].handLen: ${state.players[0]?.hand.length ?? 0}\n` +
      `  players[0].hand_uids: ${JSON.stringify(firstHandUids(state, 0))}\n` +
      `  players[1].handLen: ${state.players[1]?.hand.length ?? 0}\n` +
      `  draw_pile_count: ${state.draw.length}\n` +
      `  used_pile_count: ${state.used.length}\n` +
      `  used_top_uid: ${usedTop?.uid ?? null}`,
  );
}