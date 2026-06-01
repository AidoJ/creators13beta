import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RuleBookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RuleBookSheet({ open, onOpenChange }: RuleBookSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <SheetTitle className="font-display text-xl">Rule Book</SheetTitle>
          <SheetDescription>
            13 Creators Card Game — build your hue-man ecosystem.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-6 text-sm leading-relaxed">

            <section>
              <h3 className="font-display text-base mb-1">Goal</h3>
              <p>
                Be the first to build an ecosystem of <strong>16 cards</strong>:
                4 Creator Cards (one of each element — Earth, Fire, Air, Water) plus
                12 matching Animal Cards (3 per Creator).
              </p>
              <p className="mt-2 text-muted-foreground text-xs">
                A <strong>Sky Creator</strong> substitutes for any element. A <strong>Golden Body</strong> is
                a wildcard animal. You must also have <strong>no Creator cards left in your hand</strong> when
                you reach 16. If both piles empty out, the highest score wins
                (3 pts per Creator placed, 1 pt per Animal placed).
              </p>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">Set up</h3>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Shuffle the deck (Draw Pile).</li>
                <li>Each player is dealt <strong>5 cards</strong>.</li>
                <li>Used Pile starts empty.</li>
                <li>First player is chosen; turn order is fixed.</li>
              </ol>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">Hand limit</h3>
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                <li>Hand cap is <strong>5 cards</strong>. You should never end your turn holding more than 5.</li>
                <li>You must play or discard 2 cards each turn before drawing 2 new ones.</li>
                <li>Animals gained from a Disaster go <strong>straight onto your board</strong>, never into your hand. If they don't connect to your ecosystem they still go on the board (visible, but as a removed/empty space that future cards can fill).</li>
              </ul>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">On your turn</h3>
              <ol className="list-decimal pl-5 space-y-1">
                <li><strong>Pick up 2</strong> cards — any mix from the top of the Draw Pile and the Used Pile.</li>
                <li><strong>Play 2</strong> — each action is either placing a card on a legal hex, discarding to the Used Pile, playing a Disaster, playing a Sky Creature steal, or playing a Hive to block a Disaster.</li>
              </ol>
              <p className="mt-2 text-muted-foreground text-xs">
                You must take both placement actions every turn — you can't end early. New cards acquired
                any way other than the Draw Pile go directly onto your board.
              </p>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">Free actions</h3>
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                <li>Move any of your already-placed cards to another legal empty hex (still touching your ecosystem). Cards can be repositioned but never removed.</li>
                <li>Rotate a placed hex (+60° clockwise) to colour-match neighbours.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">Placement rules</h3>
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                <li>The first card may be placed on the central hex.</li>
                <li>Every other card must go on an <strong>empty hex adjacent to your ecosystem</strong> — the only exception is animals dropped on your board from a Disaster, which can land disconnected.</li>
                <li>Animals don't have to be placed next to their matching Creator (adjacency is ideal but only verified at win-check).</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h3 className="font-display text-base">Card powers</h3>

              <div>
                <h4 className="font-semibold text-sm">Creator Cards (Earth / Fire / Air / Water)</h4>
                <p className="text-muted-foreground text-xs">
                  Form the centre of your ecosystem — you need one of each element. <strong>Once all 4 of
                  your own Creators are on the board</strong>, any further Creator in your hand can be played
                  as a Disaster.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Disaster (Creator → Used Pile)</h4>
                <p className="text-muted-foreground text-xs">
                  Wipes every Animal matching that Creator's element from rivals' ecosystems. Those animals
                  go <strong>straight onto the disaster-player's board</strong>. A Golden Hive on the victim
                  absorbs the disaster entirely (Hive is consumed to the Used Pile).
                </p>
                <p className="mt-1 text-[11px] italic text-muted-foreground/80">
                  The Creator card sits on top of the Used Pile and can be picked up by other players.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Sky Creator Cards</h4>
                <p className="text-muted-foreground text-xs">
                  Substitutes for a Creator of any element. When played as a Disaster
                  it <strong>only wipes Mystical Creature cards bearing the Sky symbol</strong>.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Animal Cards</h4>
                <p className="text-muted-foreground text-xs">
                  Each Animal belongs to 1 or 2 Creator Types. 3 matching Animals are required per Creator.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Golden Body Card</h4>
                <p className="text-muted-foreground text-xs">
                  Counts as a matching Animal for any Creator.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Golden Hive Card</h4>
                <p className="text-muted-foreground text-xs">
                  Cannot be placed on the board. Can only be discarded when used to shield against a
                  Disaster played against you — it absorbs the next Disaster, then is consumed to the
                  Used Pile (and cannot be picked back up).
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Sky Creature Cards</h4>
                <p className="text-muted-foreground text-xs">
                  Place as an Animal (counts toward any matching Creator they share a type with), OR
                  play as a Stealer: discard to the Used Pile and steal one Animal from any opponent's
                  ecosystem into your hand. Stealer cards in the Used Pile cannot be picked up.
                </p>
              </div>
            </section>

            <p className="text-[11px] text-muted-foreground italic pt-2 border-t border-border/40">
              Ages 8–80+ · 2–4 players · 13Creators presents
            </p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
