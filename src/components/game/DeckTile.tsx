interface DeckTileProps {
  count: number;
  active: boolean;
  label: string;
  onClick: () => void;
}

/** Bottom-dock Deck pile.
 *  - Inactive (not your draw): shows the deck count, muted.
 *  - Active (your draw): replaces the count with the draw action label
 *    (e.g. "Draw 1") and glows — no flicker. */
export function DeckTile({ count, active, label, onClick }: DeckTileProps) {
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
      aria-label={active ? label : `Draw pile (${count} cards)`}
    >
      <span className="uppercase tracking-wider text-muted-foreground">Deck</span>
      <span
        className={
          "flex-1 flex items-center justify-center text-center " +
          (active
            ? "font-semibold text-[11px] leading-tight text-primary px-0.5"
            : "font-display text-2xl leading-none text-foreground/80")
        }
      >
        {active ? label : count}
      </span>
      <span className={"text-[9px] " + (active ? "text-primary/80" : "text-muted-foreground")}>
        {active ? `${count} left` : "\u00A0"}
      </span>
    </button>
  );
}
