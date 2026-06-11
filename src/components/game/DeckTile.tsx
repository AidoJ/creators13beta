import { useEffect, useState } from "react";

interface DeckTileProps {
  count: number;
  active: boolean;
  label: string;
  onClick: () => void;
}

/** Bottom-dock Deck pile. When `active` (your turn to draw), the central
 *  slot alternates between the deck count and the action label so it's
 *  obvious it's the player's draw. When inactive, just shows the count. */
export function DeckTile({ count, active, label, onClick }: DeckTileProps) {
  const [showLabel, setShowLabel] = useState(false);
  useEffect(() => {
    if (!active) { setShowLabel(false); return; }
    const id = setInterval(() => setShowLabel((s) => !s), 750);
    return () => clearInterval(id);
  }, [active]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!active}
      className={
        "flex flex-col items-center justify-between gap-1 w-[72px] h-[112px] rounded-md border px-1.5 py-1.5 text-[10px] transition " +
        (active
          ? "border-primary bg-primary/15 ring-2 ring-primary/60 shadow-[0_0_14px_hsl(var(--primary)/0.5)] hover:bg-primary/25 cursor-pointer "
          : "border-border/60 bg-card/60 opacity-70 cursor-not-allowed ")
      }
      aria-label={active ? label : "Draw pile (not your draw)"}
    >
      <span className="uppercase tracking-wider text-muted-foreground">Deck</span>
      <span
        key={showLabel ? "label" : "count"}
        className={
          "flex-1 flex items-center justify-center text-center transition-opacity " +
          (active && showLabel
            ? "font-semibold text-[11px] leading-tight text-primary animate-in fade-in"
            : "font-display text-2xl leading-none " + (active ? "text-primary" : "text-foreground/80"))
        }
      >
        {active && showLabel ? label : count}
      </span>
      <span className="h-[1px]" />
    </button>
  );
}
