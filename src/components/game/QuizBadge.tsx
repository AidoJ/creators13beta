import { useEffect, useState } from "react";
import { HelpCircle, Sparkles, Check, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { QuizProgress, QuizQuestion, QuizSettings } from "@/hooks/useQuizProgress";

interface Props {
  progress: QuizProgress | null;
  question: QuizQuestion | null;
  settings: QuizSettings;
  submit: (chosen: "a" | "b" | "c" | "d") => Promise<any>;
  /** True while it's this player's turn and their actions aren't finished —
   *  the badge is dimmed and unclickable so the quiz can't burn the turn clock. */
  muted?: boolean;
}

export function QuizBadge({ progress, question, settings, submit, muted = false }: Props) {
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState<null | { correct: boolean; correct_option: string; explanation: string | null }>(null);
  const [hasNext, setHasNext] = useState(false);
  const [submitting, setSubmitting] = useState(false);


  const correct = progress?.correct_count ?? 0;
  const wrong = progress?.wrong_count ?? 0;
  const bonusPts = progress?.bonus_points_awarded ?? 0;
  const cap = settings.questions_per_match;
  const answeredCount = correct + wrong;
  const capReached = answeredCount >= cap;
  const hasOpen = !!question && !!progress?.open_question_id && !muted;
  const tier = Math.max(1, settings.bonus_threshold || 4);
  const toNextTier = tier - (correct % tier);

  // If a new turn starts while the quiz dialog is open, close it so the player
  // is looking at the board, not a question, when their clock starts.
  useEffect(() => {
    if (muted) { setOpen(false); setAnswered(null); setHasNext(false); }
  }, [muted]);

  if (!settings.enabled) return null;



  const onAnswer = async (choice: "a" | "b" | "c" | "d") => {
    if (submitting || answered) return;
    setSubmitting(true);
    try {
      const res = await submit(choice);
      if (!res) return;
      setAnswered({ correct: res.correct, correct_option: res.correct_option, explanation: res.explanation });
      setHasNext(!!res.next_question_id);

      if (res.bonus_gained && res.bonus_gained > 0) {
        toast.success(`+${res.bonus_gained} bonus point${res.bonus_gained === 1 ? "" : "s"} added to your match score!`, { duration: 4000 });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setOpen(false);
    setTimeout(() => { setAnswered(null); setHasNext(false); }, 300);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={muted}
            onClick={() => { if (!muted) setOpen(true); }}
            aria-label={muted ? "Quiz paused until your turn actions are complete" : hasOpen ? "Answer quiz question for bonus points" : `Quiz progress: ${correct} of ${cap}`}
            style={hasOpen ? { zIndex: 50, position: "relative", transformOrigin: "center", willChange: "transform" } : undefined}
            className={
              "relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 min-h-11 text-sm font-medium border transition origin-center " +
              (muted
                ? "bg-muted/30 border-border/50 text-muted-foreground/50 opacity-50 cursor-not-allowed"
                : bonusPts > 0
                  ? "bg-amber-500/15 border-amber-500/60 text-amber-700 dark:text-amber-300"
                  : hasOpen
                    ? "bg-primary border-primary text-primary-foreground shadow-lg animate-quiz-pop ring-2 ring-primary/50"
                    : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")
            }
          >

            {bonusPts > 0 && !muted ? <Sparkles className="h-4 w-4" /> : <HelpCircle className={"h-4 w-4" + (hasOpen ? " animate-quiz-bounce" : "")} />}
            <span className="tabular-nums">{correct}/{cap}</span>
            {bonusPts > 0 && <span className="ml-0.5 tabular-nums font-semibold">+{bonusPts}</span>}
            {hasOpen && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background animate-quiz-bounce" />}
          </button>
        </TooltipTrigger>

        <TooltipContent side="bottom" className="max-w-[240px] text-xs">
          {muted
            ? "Quiz is paused while you're taking your turn — it unlocks as soon as your actions are done, so it never eats your turn clock."
            : hasOpen
              ? "A quiz question is waiting — answer correctly to add bonus points to your match score"
              : capReached
                ? `All ${cap} questions used this match. +${bonusPts} bonus point${bonusPts === 1 ? "" : "s"} added to your match score.`
                : `${toNextTier} more correct = +${settings.bonus_points} bonus point${settings.bonus_points === 1 ? "" : "s"} added to your match score. Up to ${cap} questions per match.`}
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 pr-10">
              <HelpCircle className="h-5 w-5 text-primary" />
              Creator Quiz
              <span className="w-full sm:w-auto sm:ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                {correct}/{cap} correct · {wrong} wrong{bonusPts > 0 ? ` · +${bonusPts} pts` : ""}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {capReached
                ? `All ${cap} questions used this match — +${bonusPts} bonus point${bonusPts === 1 ? "" : "s"} added to your match score.`
                : `Every ${tier} correct answers adds +${settings.bonus_points} bonus point${settings.bonus_points === 1 ? "" : "s"} to your match score. Up to ${cap} questions this match.`}
            </DialogDescription>
          </DialogHeader>

          {answered ? (
            <div className="space-y-3">
              <div className={"flex items-center gap-2 font-medium " + (answered.correct ? "text-green-600" : "text-destructive")}>
                {answered.correct ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                {answered.correct ? "Correct!" : `Not quite — answer was ${answered.correct_option.toUpperCase()}.`}
              </div>
              {answered.explanation && (
                <div className="text-sm bg-muted/50 rounded-md p-3 italic">{answered.explanation}</div>
              )}
              <div className="text-xs text-muted-foreground">
                {answered.correct
                  ? `Mastered — this question won't come back. ${tier - (correct % tier) === tier ? `+${settings.bonus_points} bonus point${settings.bonus_points === 1 ? "" : "s"} just added to your match score.` : `${tier - (correct % tier)} more correct adds +${settings.bonus_points} bonus point${settings.bonus_points === 1 ? "" : "s"} to your match score.`}`
                  : "You'll see this one again in a future match."}
              </div>
              <div className="flex justify-end gap-2">
                {hasNext && (
                  <Button size="sm" onClick={() => { setAnswered(null); setHasNext(false); }}>
                    Next question
                  </Button>
                )}
                <Button size="sm" variant={hasNext ? "outline" : "default"} onClick={close}>Back to game</Button>
              </div>

            </div>
          ) : !question ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No open question. Play a card to get one.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{question.creator_type} · {question.category.replace(/_/g, " ")}</div>
              <div className="font-medium whitespace-pre-wrap">{question.prompt}</div>
              <div className="grid gap-2">
                {(["a", "b", "c", "d"] as const).map(k => (
                  <Button key={k} variant="outline" className="justify-start text-left h-auto py-2 whitespace-normal"
                    disabled={submitting} onClick={() => onAnswer(k)}>
                    <span className="mr-2 font-bold text-primary">{k.toUpperCase()}.</span>
                    {(question as any)[`option_${k}`]}
                  </Button>
                ))}
              </div>
              <div className="text-[11px] text-muted-foreground text-right">Available until you draw next turn.</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
