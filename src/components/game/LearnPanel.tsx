/**
 * LearnPanel — the "How to play" entry surface.
 *
 * Two modes, deliberately different:
 *
 *   firstRun = true   A brand-new player gets ONE direct offer: play a quick
 *                     guided game, or explore on their own. No menu to parse.
 *
 *   firstRun = false  Returning players get the three-door chooser:
 *                     guided game / refresher topics / strategy tips.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, GraduationCap, BookOpen, Lightbulb, Gamepad2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { topicsFor, topicById } from "@/lib/game/learnContent";
import { TopicBody, TopicCard } from "@/components/game/TopicView";
import { resetCoach } from "@/hooks/useCoach";

/** Bump when the rules change enough that everyone should see the panel again. */
export const LEARN_PANEL_VERSION = "v1";
const SEEN_KEY = `creators13.learn.seen.${LEARN_PANEL_VERSION}`;
const DOOR_KEY = "creators13.learn.last-door";

export type LearnDoor = "guided" | "refresher" | "tips";

export function hasSeenLearnPanel(): boolean {
  try {
    return !!localStorage.getItem(SEEN_KEY);
  } catch {
    return true;
  }
}

export function markLearnPanelSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

function lastDoor(): LearnDoor {
  try {
    const v = localStorage.getItem(DOOR_KEY);
    return v === "guided" || v === "refresher" || v === "tips" ? v : "refresher";
  } catch {
    return "refresher";
  }
}

function rememberDoor(door: LearnDoor) {
  try {
    localStorage.setItem(DOOR_KEY, door);
  } catch {
    /* ignore */
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** New player with no completed practice game — show the direct offer. */
  firstRun?: boolean;
}

export default function LearnPanel({ open, onOpenChange, firstRun = false }: Props) {
  const navigate = useNavigate();
  const [door, setDoor] = useState<LearnDoor | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);

  function startGuided() {
    markLearnPanelSeen();
    rememberDoor("guided");
    resetCoach();
    onOpenChange(false);
    navigate("/play/new?practice=1&coach=1");
  }

  function close() {
    markLearnPanelSeen();
    setDoor(null);
    setTopicId(null);
    onOpenChange(false);
  }

  const topic = topicId ? topicById(topicId) : undefined;
  const activeDoor = door ?? (firstRun ? null : lastDoor());

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] max-h-[85dvh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60 text-left">
          <DialogTitle className="font-display text-lg sm:text-xl">
            {topic ? topic.title : firstRun && !door ? "New here? Let's play one together" : "How to play"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {topic
              ? topic.summary
              : firstRun && !door
                ? "The fastest way to learn BCreators is to play a short guided game — I'll coach you through each move."
                : "Learn by playing, look something up, or sharpen your game."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-3">
            {/* ── Topic reader ───────────────────────────────────────── */}
            {topic && (
              <>
                <button
                  type="button"
                  onClick={() => setTopicId(null)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground min-h-9 -ml-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </button>
                <TopicBody topic={topic} />
              </>
            )}

            {/* ── First-run direct offer ─────────────────────────────── */}
            {!topic && firstRun && !door && (
              <div className="space-y-3">
                <Button size="lg" className="w-full min-h-12" onClick={startGuided}>
                  <GraduationCap className="mr-2 h-5 w-5" /> Yes — teach me as I play
                </Button>
                <Button variant="outline" size="lg" className="w-full min-h-12" onClick={close}>
                  <Gamepad2 className="mr-2 h-5 w-5" /> I'll explore myself
                </Button>
                <button
                  type="button"
                  onClick={() => setDoor("refresher")}
                  className="w-full text-xs text-muted-foreground hover:text-foreground min-h-9"
                >
                  Just show me the rules
                </button>
              </div>
            )}

            {/* ── Three doors ────────────────────────────────────────── */}
            {!topic && (!firstRun || door) && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { id: "guided", label: "I'm new", hint: "Guided game", icon: GraduationCap },
                      { id: "refresher", label: "Refresher", hint: "Look it up", icon: BookOpen },
                      { id: "tips", label: "Tips", hint: "Win more", icon: Lightbulb },
                    ] as const
                  ).map((d) => {
                    const Icon = d.icon;
                    const selected = activeDoor === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          if (d.id === "guided") {
                            startGuided();
                            return;
                          }
                          rememberDoor(d.id);
                          setDoor(d.id);
                        }}
                        className={`min-h-16 rounded-xl border p-3 text-left transition-colors ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
                        }`}
                      >
                        <Icon className="h-4 w-4 text-primary" />
                        <p className="font-display text-sm mt-1.5 leading-tight">{d.label}</p>
                        <p className="text-[0.7rem] text-muted-foreground leading-snug">{d.hint}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2 pt-1">
                  {topicsFor(activeDoor === "tips" ? "tips" : "refresher").map((t) => (
                    <TopicCard key={t.id} topic={t} onClick={() => setTopicId(t.id)} />
                  ))}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
