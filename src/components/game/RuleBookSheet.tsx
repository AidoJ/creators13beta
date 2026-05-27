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
            B Creators Card Game — Build your hue-man ecosystem.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-6 text-sm leading-relaxed">

            <section>
              <h3 className="font-display text-base mb-1">How to win</h3>
              <p>
                Be the first player to build an ecosystem of <strong>16 cards</strong>:
                4 Creator Cards (one of each element — Earth, Air, Fire, Water) surrounded by
                12 matching Animal Cards (3 animals per Creator).
              </p>
              <p className="mt-2 text-muted-foreground text-xs">
                Sky Creator Cards can substitute for any element. Golden Body Cards can substitute
                for any animal. You may have excess cards beyond 16 as long as no Creator Cards
                remain in your hand.
              </p>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">Set up</h3>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Shuffle the deck and place it face-down (the New Pile).</li>
                <li>Each player draws 5 cards into their hand, kept hidden.</li>
                <li>Decide who goes first; play proceeds in turns.</li>
                <li>Played cards go face-up on the Used Pile.</li>
              </ol>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">On your turn</h3>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Pick up <strong>2 cards</strong> from the New Pile and/or the Used Pile.</li>
                <li>Optionally <strong>move</strong> any of your already-placed ecosystem cards
                  to better positions (before putting your new cards down).</li>
                <li>Put down <strong>2 cards</strong> — into your ecosystem or onto the Used Pile.</li>
              </ol>
              <p className="mt-2 text-muted-foreground text-xs">
                You may also: play a Disaster Card, block one with a Hive Card, or play a
                Sky Creature Card to steal.
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="font-display text-base">Card powers</h3>

              <div>
                <h4 className="font-semibold text-sm">Creator Cards</h4>
                <p className="text-muted-foreground text-xs">
                  You need 4 Creator Cards to form the centre of your ecosystem. Once you have
                  your 4, any additional Creator Cards can be played as Disaster Cards by
                  placing them in the Used Pile.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Disaster Cards</h4>
                <p className="text-muted-foreground text-xs">
                  When a Creator Card is placed in the Used Pile, it wipes out all Animal Cards
                  linked to that Creator from other players. Those animals are given to the
                  player who triggered the Disaster, to place in their own ecosystem.
                </p>
                <p className="mt-1 text-[11px] italic text-muted-foreground/80">
                  Other players can pick up your Disaster Card from the Used Pile once you play it!
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Animal Cards</h4>
                <p className="text-muted-foreground text-xs">
                  Match these with your Creator Cards. Each Creator needs 3 matching Animals
                  around it.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Golden Body Cards</h4>
                <p className="text-muted-foreground text-xs">
                  Wildcard — can substitute for any animal to help you complete your ecosystem.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Golden Hive Card</h4>
                <p className="text-muted-foreground text-xs">
                  Provides immunity from a Disaster Card. Once used, it goes to the Used Pile and
                  cannot be used again or picked up by another player.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Sky Creator Cards</h4>
                <p className="text-muted-foreground text-xs">
                  Substitute for any Creator (Earth / Air / Fire / Water) in any combination.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm">Sky Creature Cards</h4>
                <p className="text-muted-foreground text-xs">
                  Can be used as Animal Cards in your ecosystem, OR played as Stealer cards:
                  place in the Used Pile and steal an Animal Card of your choice from any player.
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
