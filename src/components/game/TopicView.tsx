/**
 * Shared renderer for a `learnContent.ts` topic — used by both the Rule Book
 * sheet and the "How to play" panel so the two can never drift.
 */
import { parseBold, type LearnTopic } from "@/lib/game/learnContent";

function Rich({ text }: { text: string }) {
  return (
    <>
      {parseBold(text).map((seg, i) =>
        seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

export function TopicBody({ topic }: { topic: LearnTopic }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {topic.blocks.map((block, i) => {
        if (block.kind === "text") {
          return (
            <p key={i}>
              <Rich text={block.text} />
            </p>
          );
        }
        if (block.kind === "bullets") {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1.5">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Rich text={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-xs text-muted-foreground">
            <Rich text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

export function TopicCard({
  topic,
  onClick,
}: {
  topic: LearnTopic;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-11 text-left rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors p-3"
    >
      <p className="font-display text-sm leading-tight">{topic.title}</p>
      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{topic.summary}</p>
    </button>
  );
}
