/**
 * "You've seen X of 13 Creators!" prompt.
 *
 * Reuses `player_progress.types_seen` — the same column the upgrade nudge
 * and the Play-dashboard's detailed types tile already read. No new
 * tracking, no parallel counter. Lowercase-normalises at the count step
 * (does NOT rewrite stored data) so "Fire" and "fire" never double-count.
 */
import { useEffect, useState } from "react";
import { Sparkles, PartyPopper } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string;
}

export default function CreatorsSeenPrompt({ userId }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("player_progress")
        .select("types_seen")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const seen = new Set<string>();
      (data?.types_seen ?? []).forEach((t: string) => {
        const k = t?.trim().toLowerCase();
        if (k) seen.add(k);
      });
      // Cap at 13 — even if a stray type-name ever slipped in, the prompt's
      // job is an honest "out of 13" count, never 14+.
      setCount(Math.min(13, seen.size));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (count === null) return null;

  const complete = count >= 13;
  const pct = Math.round((count / 13) * 100);

  return (
    <Card
      className={`p-4 sm:p-5 flex items-center gap-4 ${
        complete
          ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-primary/5"
          : "border-primary/20 bg-primary/5"
      }`}
    >
      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        {complete ? (
          <PartyPopper className="h-5 w-5 text-amber-600" />
        ) : (
          <Sparkles className="h-5 w-5 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm sm:text-base font-display font-semibold text-foreground leading-tight">
          {complete
            ? "You've met all 13 Creators!"
            : `You've seen ${count} of 13 Creators!`}
        </p>
        <div className="h-1.5 mt-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              complete ? "bg-amber-500" : "bg-gradient-to-r from-secondary to-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Card>
  );
}
