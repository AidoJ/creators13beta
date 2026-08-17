/**
 * CoachBar — the coached first match's prompt surface.
 *
 * Bottom sheet on phones, floating card on desktop. Non-blocking by design:
 * it never covers the hand or the deck, and it never traps focus. Everything
 * it says comes from `coachScript.ts`.
 */
import { GraduationCap, X, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CoachApi } from "@/hooks/useCoach";
import { topicById, parseBold } from "@/lib/game/learnContent";

interface Props {
  coach: CoachApi;
  /** Opens the Rule Book at the step's related topic. */
  onOpenTopic: (topicId: string) => void;
}

function Rich({ text }: { text: string }) {
  return (
    <>
      {parseBold(text).map((seg, i) =>
        seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

export function CoachBar({ coach, onOpenTopic }: Props) {
  if (!coach.active || !coach.step) return null;
  const step = coach.step;
  const topic = step.topicId ? topicById(step.topicId) : undefined;
  const isLast = coach.index === coach.total - 1;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none px-2 pb-2 sm:px-4 sm:pb-4">
      <div className="pointer-events-auto mx-auto w-full max-w-xl rounded-2xl border border-primary/40 bg-card/95 backdrop-blur shadow-lg shadow-primary/10">
        <div className="flex items-start gap-2 px-3 pt-2.5 sm:px-4 sm:pt-3">
          <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center">
            <GraduationCap className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm sm:text-base leading-tight">{step.title}</p>
            <p className="mt-1 text-[0.72rem] sm:text-sm text-muted-foreground leading-snug">
              <Rich text={step.prompt} />
            </p>
            {coach.redirectText && (
              <p className="mt-1.5 text-[0.72rem] sm:text-sm text-primary leading-snug">
                {coach.redirectText}
              </p>
            )}
            {coach.confirmText && (
              <p className="mt-1.5 flex items-start gap-1 text-[0.72rem] sm:text-sm text-emerald-600 dark:text-emerald-400 leading-snug">
                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{coach.confirmText}</span>
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Exit coaching"
            onClick={coach.exit}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-center gap-1 py-2">
          {Array.from({ length: coach.total }).map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === coach.index ? "w-5 bg-primary" : i < coach.index ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5 sm:px-4 sm:pb-3">
          {topic && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-9 text-xs"
              onClick={() => onOpenTopic(topic.id)}
            >
              Tell me more
            </Button>
          )}
          {!step.ack && (
            <Button variant="ghost" size="sm" className="min-h-9 text-xs" onClick={coach.showMe}>
              Show me
            </Button>
          )}
          <div className="flex-1" />
          {!step.ack && (
            <Button variant="outline" size="sm" className="min-h-9 text-xs" onClick={coach.skipStep}>
              Skip this bit
            </Button>
          )}
          {step.ack && (
            <Button size="sm" className="min-h-9 text-xs" onClick={coach.ack}>
              {isLast ? "Finish on my own" : "Got it"}
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CoachBar;
