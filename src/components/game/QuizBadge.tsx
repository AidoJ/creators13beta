import { useState } from "react";
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
}

export function QuizBadge({ progress, question, settings, submit }: Props) {
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState<null | { correct: boolean; correct_option: string; explanation: string | null }>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!settings.enabled) return null;

  const correct = progress?.correct_count ?? 0;
  const wrong = progress?.wrong_count ?? 0;
  const bonusWon = progress?.bonus_awarded ?? false;
  const hasOpen = !!question && !!progress?.open_question_id;
  const threshold = settings.threshold;

  const onAnswer = async (choice: "a" | "b" | "c" | "d") => {
    if (submitting || answered) return;
    setSubmitting(true);
    try {
      const res = await submit(choice);
      if (!res) return;
      setAnswered({ correct: res.correct, correct_option: res.correct_option, explanation: res.explanation });
      if (res.bonus_just_awarded) {
        toast.success(`+${settings.bonus_points} bonus point unlocked!`, { duration: 4000 });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setOpen(false);
    setTimeout(() => setAnswered(null), 300);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={hasOpen ? "Answer quiz question for bonus points" : `Quiz progress: ${correct} of ${threshold}`}
            className={
              "relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition " +
              (bonusWon
                ? "bg-amber-500/15 border-amber-500/60 text-amber-700 dark:text-amber-300"
                : hasOpen
                  ? "bg-primary/15 border-primary/60 text-primary hover:bg-primary/25 animate-pulse"
                  : "bg-muted/50 border-border text-muted-foreground hover:bg-muted")
            }
          >
            {bonusWon ? <Sparkles className="h-3.5 w-3.5" /> : <HelpCircle className="h-3.5 w-3.5" />}
            <span className="tabular-nums">{correct}/{threshold}</span>
            {hasOpen && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px] text-xs">
          {hasOpen
            ? "A quiz question is waiting — answer for bonus points"
            : bonusWon
              ? `Bonus unlocked (+${settings.bonus_points})`
              : `Answer ${threshold - correct} more correctly to earn +${settings.bonus_points} bonus point this game`}
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Creator Quiz
              <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                {correct}/{threshold} correct · {wrong} wrong
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {bonusWon ? "Bonus already unlocked this match — keep learning for permanent mastery." : `Get ${threshold} correct to unlock +${settings.bonus_points} bonus point at the end of this match.`}
            </DialogDescription>
          </DialogHeader>

          {!question ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No open question. Play a card to get one.
            </div>
          ) : answered ? (
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
                  ? "Mastered — this question won't come back."
                  : "You'll see this one again in a future match."}
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={close}>Back to game</Button>
              </div>
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
