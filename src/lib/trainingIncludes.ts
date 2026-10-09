// Practitioner training includes a membership while its access is active.
// Keep in sync with TRAINING_COVERS in supabase/functions/_shared/membership.ts.
export const MEMBERSHIP_RANK: Record<string, number> = { taster: 1, creator: 2, co_creator: 3 };
export const TRAINING_COVERS: Record<string, number> = { prac_l1_trainee: 2, prac_l2_trainee: 3, prac_l3_trainee: 3 };

/** The training level (1/2/3) that includes this membership, or null. */
export function includedByTraining(levelKey: string, held: Iterable<string>): number | null {
  const rank = MEMBERSHIP_RANK[levelKey] ?? 0;
  if (!rank) return null;
  let best: number | null = null;
  for (const k of held) {
    const cover = TRAINING_COVERS[k];
    if (cover && cover >= rank) {
      const lvl = Number(k.match(/prac_l(\d)/)?.[1]);
      if (best === null || lvl > best) best = lvl;
    }
  }
  return best;
}

export const includedLabel = (level: number) => `Included in your Level ${level} training`;
