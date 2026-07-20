/**
 * Practice rung — small no-stakes warm-up vs the bot before a new player's
 * first live match. Reuses the existing solo-bot infra:
 *   - launches /play/new?practice=1 (Play.tsx auto-starts a bot game and
 *     skips the bot-stats bump while the flag is set)
 *   - completion / skip writes `player_progress.practice_completed_at`
 *
 * Card hides itself once `practice_completed_at` is set.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  userId: string;
}

const PRACTICE_TARGET = 3;

export default function PracticeRungCard({ userId }: Props) {
  const navigate = useNavigate();
  const [played, setPlayed] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("player_progress")
        .select("practice_games_played, practice_completed_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setPlayed((data as any)?.practice_games_played ?? 0);
      setCompletedAt((data as any)?.practice_completed_at ?? null);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (played === null || completedAt) return null;

  const remaining = Math.max(0, PRACTICE_TARGET - played);

  async function onSkip() {
    setSkipping(true);
    // Upsert covers the case where the user has never played and therefore
    // has no player_progress row yet.
    const { error } = await supabase
      .from("player_progress")
      .upsert(
        { user_id: userId, practice_completed_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    setSkipping(false);
    if (error) {
      toast.error("Could not skip practice — try again.");
      return;
    }
    setCompletedAt(new Date().toISOString());
    toast.success("Skipped — jumping into live matches.");
  }

  return (
    <Card className="p-4 sm:p-5 border-secondary/40 bg-gradient-to-br from-secondary/10 to-primary/5 overflow-hidden">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-secondary/15 flex items-center justify-center flex-shrink-0">
          <Bot className="h-5 w-5 text-secondary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[0.8rem] sm:text-base font-display font-semibold text-foreground leading-tight break-words">
            Warm up against the bot — no points at stake.
          </p>
          <p className="text-[0.65rem] sm:text-xs text-muted-foreground mt-1.5 break-words">
            Play {PRACTICE_TARGET} quick practice games before your first live match. These don't
            affect your points, ELO, or win-loss record.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button
              size="sm"
              onClick={() => navigate("/play/new?practice=1")}
              className="bg-primary text-primary-foreground max-w-full whitespace-normal h-auto py-2 text-left"
            >
              <span className="break-words">
                {played === 0 ? "Start practice" : `Continue practice (${remaining} left)`}
              </span>
              <ArrowRight className="ml-1.5 h-4 w-4 flex-shrink-0" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onSkip}
              disabled={skipping}
              className="text-muted-foreground max-w-full whitespace-normal h-auto py-2 text-left"
            >
              {skipping ? "Skipping…" : "Skip — I'm ready for live"}
            </Button>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {played} of {PRACTICE_TARGET} done
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
