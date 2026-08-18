/**
 * finaliseRankedMatchWithRetry — reliability wrapper around the
 * `finalise_ranked_match` RPC.
 *
 * The RPC is fully idempotent: it tags `state.__finalised` and short-circuits
 * on subsequent calls, so retrying it can never double-pay. A single transient
 * failure (timeout, pool blip) would otherwise silently strand a finished
 * ranked match with no ELO/points ever applied.
 */
export async function finaliseRankedMatchWithRetry(
  svc: any,
  matchId: string,
  reason: string,
  placements: unknown,
  attempts = 3,
): Promise<{ ok: boolean; error?: unknown }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { error } = await svc.rpc("finalise_ranked_match", {
        _match_id: matchId,
        _reason: reason,
        _placements: (placements as any) ?? null,
      });
      if (!error) return { ok: true };
      lastError = error;
      console.error(
        `[finalise_ranked_match] attempt ${attempt}/${attempts} failed match=${matchId} reason=${reason}`,
        error,
      );
    } catch (e) {
      lastError = e;
      console.error(
        `[finalise_ranked_match] attempt ${attempt}/${attempts} threw match=${matchId} reason=${reason}`,
        e,
      );
    }
    if (attempt < attempts) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  console.error(
    `[finalise_ranked_match] giving up after ${attempts} attempts match=${matchId} reason=${reason}`,
    lastError,
  );
  return { ok: false, error: lastError };
}
