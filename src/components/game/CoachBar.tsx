/**
 * CoachBar — the coached first match's prompt surface.
 *
 * DOCKED, never overlaid: this renders in normal page flow above the board so
 * it can never cover the deck, the hand or the piles.
 *
 * Rhythm: prompt → the player acts → an explicit success state with a green
 * tick that HOLDS until they tap Next → the next lesson. No timed advances.
 *
 * Closing collapses to a slim strip (never strands the player); Restart and
 * Exit live in the strip's menu.
 */
import {
  GraduationCap,
  X,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  MoreVertical,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** Slim always-present strip: collapsed mid-lesson, or after exiting. */
function CoachStrip({
  label,
  action,
  onAction,
  onRestart,
}: {
  label: string;
  action: string;
  onAction: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="shrink-0 w-full flex items-center gap-2 px-3 py-1.5 border-b border-primary/30 bg-primary/10">
      <GraduationCap className="h-4 w-4 text-primary shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[0.7rem] sm:text-xs text-muted-foreground">{label}</span>
      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={onRestart}>
        <RotateCcw className="mr-1 h-3.5 w-3.5" />
        Start over
      </Button>
      <Button size="sm" className="h-8 px-3 text-xs" onClick={onAction}>
        {action}
        <ChevronUp className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function CoachBar({ coach, onOpenTopic }: Props) {
  if (coach.retired) {
    return (
      <CoachStrip
        label="Coaching is off — you're playing solo."
        action="Resume coaching"
        onAction={coach.resume}
        onRestart={coach.restart}
      />
    );
  }

  if (!coach.step) return null;

  if (coach.collapsed) {
    return (
      <CoachStrip
        label={`Coach · step ${coach.index + 1} of ${coach.total} — ${coach.step.title}`}
        action="Show coach"
        onAction={coach.resume}
        onRestart={coach.restart}
      />
    );
  }

  const step = coach.step;
  const topic = step.topicId ? topicById(step.topicId) : undefined;
  const isLast = coach.index === coach.total - 1;
  const success = coach.awaitingNext;

  return (
    <div
      className={
        "shrink-0 w-full border-b px-2 py-2 sm:px-4 " +
        (success
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-primary/30 bg-primary/5")
      }
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start gap-2">
          <div
            className={
              "mt-0.5 h-7 w-7 shrink-0 rounded-lg flex items-center justify-center " +
              (success ? "bg-emerald-500/20" : "bg-primary/15")
            }
          >
            {success ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <GraduationCap className="h-4 w-4 text-primary" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-sm sm:text-base leading-tight">
              {success ? "Yes — you got it" : step.title}
            </p>
            <p className="mt-0.5 text-[0.72rem] sm:text-sm text-muted-foreground leading-snug">
              {success ? (
                <span className="text-emerald-600 dark:text-emerald-400">{coach.successText}</span>
              ) : (
                <Rich text={step.prompt} />
              )}
            </p>
            {!success && coach.redirectText && (
              <p className="mt-1 text-[0.72rem] sm:text-sm text-primary leading-snug">{coach.redirectText}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <span className="hidden sm:inline text-[0.65rem] text-muted-foreground tabular-nums px-1">
              {coach.index + 1}/{coach.total}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Coaching options">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 bg-popover">
                <DropdownMenuItem onClick={coach.restart}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Start coaching over
                </DropdownMenuItem>
                <DropdownMenuItem onClick={coach.exit}>
                  <X className="mr-2 h-4 w-4" />
                  Exit coaching
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Collapse coach"
              onClick={coach.collapse}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="flex flex-1 items-center gap-1 overflow-hidden">
            {Array.from({ length: coach.total }).map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === coach.index
                    ? "w-5 bg-primary"
                    : i < coach.index
                      ? "w-1.5 bg-primary/40"
                      : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          {success ? (
            <Button size="sm" className="min-h-9 text-xs" onClick={coach.next}>
              {isLast ? "Finish on my own" : "Next"}
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          ) : (
            <>
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
                <>
                  <Button variant="ghost" size="sm" className="min-h-9 text-xs" onClick={coach.showMe}>
                    Show me
                  </Button>
                  <Button variant="outline" size="sm" className="min-h-9 text-xs" onClick={coach.skipStep}>
                    Skip
                  </Button>
                </>
              )}
              {step.ack && (
                <Button size="sm" className="min-h-9 text-xs" onClick={coach.ack}>
                  {isLast ? "Finish on my own" : "Got it"}
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CoachBar;
