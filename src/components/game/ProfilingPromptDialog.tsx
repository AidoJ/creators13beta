import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Trigger = "quiz" | "games";

interface Props {
  userId: string;
  /** True when the just-ended MatchOverDialog has been dismissed and we can surface the prompt. */
  ready: boolean;
}

/**
 * Milestone-triggered profiling CTA.
 * - Player-path users only.
 * - Fires once, at match-end, after MatchOverDialog closes.
 * - Trigger (whichever comes first): 3rd Creator mastered / first quiz bonus, or 6th game.
 * - Never popup again after dismiss/tap — dashboard card takes the memory.
 */
export default function ProfilingPromptDialog({ userId, ready }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [masteredCount, setMasteredCount] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!ready || !userId || checking) return;
    setChecking(true);
    let cancelled = false;
    (async () => {
      try {
        // 1. Player-path guard + prior-prompt guard.
        const [subRes, profRes, settingsRes] = await Promise.all([
          supabase.from("subscriptions").select("signup_path").eq("user_id", userId).maybeSingle(),
          supabase
            .from("profiles")
            .select("profiling_prompt_shown_at, profiling_prompt_dismissed_at, profiling_prompt_tapped_at")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("game_settings" as any)
            .select("profiling_prompt_quiz_mastery_threshold, profiling_prompt_games_threshold")
            .eq("id", "global")
            .maybeSingle(),
        ]);
        if (cancelled) return;
        if ((subRes.data as any)?.signup_path !== "player") return;
        const prof = (profRes.data as any) ?? {};
        if (prof.profiling_prompt_shown_at || prof.profiling_prompt_dismissed_at || prof.profiling_prompt_tapped_at) return;

        const quizThreshold = (settingsRes.data as any)?.profiling_prompt_quiz_mastery_threshold ?? 3;
        const gamesThreshold = (settingsRes.data as any)?.profiling_prompt_games_threshold ?? 6;

        // 2. Compute masteredTypes distinct count + bonus_points + games count in parallel.
        const [masteryRes, progressRes, gamesRes] = await Promise.all([
          supabase.rpc("get_player_quiz_stats", { _user_id: userId }),
          supabase.from("player_progress").select("bonus_points").eq("user_id", userId).maybeSingle(),
          supabase
            .from("game_matches")
            .select("id", { count: "exact", head: true })
            .or(`host_user_id.eq.${userId},guest_user_id.eq.${userId}`)
            .eq("status", "finished"),
        ]);
        if (cancelled) return;

        const byType = ((masteryRes.data as any)?.by_type ?? []) as Array<{ correct: number }>;
        const distinctMastered = byType.filter((t) => (t.correct ?? 0) > 0).length;
        const bonusPoints = (progressRes.data as any)?.bonus_points ?? 0;
        const gamesPlayed = gamesRes.count ?? 0;

        const quizHit = distinctMastered >= quizThreshold || bonusPoints > 0;
        const gamesHit = gamesPlayed >= gamesThreshold;
        if (!quizHit && !gamesHit) return;

        const trig: Trigger = quizHit ? "quiz" : "games";
        setTrigger(trig);
        setMasteredCount(distinctMastered);

        // Record shown + trigger.
        await supabase
          .from("profiles")
          .update({
            profiling_prompt_shown_at: new Date().toISOString(),
            profiling_prompt_trigger: trig,
          } as any)
          .eq("user_id", userId);
        if (!cancelled) setOpen(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId]);

  const dismiss = async () => {
    setOpen(false);
    await supabase
      .from("profiles")
      .update({ profiling_prompt_dismissed_at: new Date().toISOString() } as any)
      .eq("user_id", userId);
  };

  const tap = async () => {
    setOpen(false);
    await supabase
      .from("profiles")
      .update({ profiling_prompt_tapped_at: new Date().toISOString() } as any)
      .eq("user_id", userId);
    // Player-path users routed to /enroll see the two-option (no game card) chooser.
    navigate("/enroll?upgrade=true");
  };

  if (!trigger) return null;

  const title = trigger === "quiz"
    ? `You've learned ${masteredCount} of the 13 Creators — curious which one YOU are?`
    : `You've played a few matches — ready to discover YOUR Creator Type?`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary shrink-0" />
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-relaxed">
            You've earned a <strong className="text-foreground">20% discount</strong> on
            your profiling assessment. Get profiled with a certified practitioner and
            find out which of the 13 Creator Types you are.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
          One-time offer, unlocked at this milestone. No pressure — you can come back to it any time from your dashboard.
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2">
          <Button variant="outline" onClick={dismiss}>Maybe later</Button>
          <Button onClick={tap} className="font-semibold">
            Explore profiling →
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
