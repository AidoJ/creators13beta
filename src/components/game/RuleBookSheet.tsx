/**
 * Rule Book — the look-it-up manual.
 *
 * Topic grid (tap a topic, breadcrumb back) rendered from `learnContent.ts`,
 * the same module the coached match teaches from.
 */
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LEARN_TOPICS, topicById } from "@/lib/game/learnContent";
import { TopicBody, TopicCard } from "@/components/game/TopicView";

interface RuleBookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open straight onto a topic (used by the coach's "Tell me more"). */
  initialTopicId?: string | null;
}

export function RuleBookSheet({ open, onOpenChange, initialTopicId }: RuleBookSheetProps) {
  const [topicId, setTopicId] = useState<string | null>(initialTopicId ?? null);

  useEffect(() => {
    if (open) setTopicId(initialTopicId ?? null);
  }, [open, initialTopicId]);

  const topic = topicId ? topicById(topicId) : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          {topic ? (
            <>
              <button
                type="button"
                onClick={() => setTopicId(null)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground min-h-9 -ml-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> All topics
              </button>
              <SheetTitle className="font-display text-xl text-left">{topic.title}</SheetTitle>
              <SheetDescription className="text-left">{topic.summary}</SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle className="font-display text-xl text-left">Rule Book</SheetTitle>
              <SheetDescription className="text-left">
                BCreators Card Game — tap a topic to read it.
              </SheetDescription>
            </>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-stable px-5 py-4">
          {topic ? (
            <>
              <TopicBody topic={topic} />
              <Button
                variant="outline"
                size="sm"
                className="mt-5 min-h-11 w-full"
                onClick={() => setTopicId(null)}
              >
                Back to all topics
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              {LEARN_TOPICS.map((t) => (
                <TopicCard key={t.id} topic={t} onClick={() => setTopicId(t.id)} />
              ))}
              <p className="text-[11px] text-muted-foreground italic pt-3">
                Ages 8–80+ · 2–4 players · 13Creators presents
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
