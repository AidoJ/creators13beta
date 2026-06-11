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
            BCreators Card Game — complete rules by game type.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-6 text-sm leading-relaxed">

            <section>
              <p className="text-xs text-muted-foreground">
                This is the canonical rule set used by both human players and bots inside
                BCreators. Section 1 covers the rules that apply to every match. Sections
                2–4 cover the three available Game Types and how each one ends.
              </p>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">1. Shared rules (all game types)</h3>
            </section>

            <section>
              <h4 className="font-semibold text-sm mb-1">Goal</h4>
              <p>
                Be the first to build an ecosystem of <strong>16 cards</strong>:
                4 Creator Cards (one of each element — Earth, Fire, Air, Water) plus
                12 matching Animal Cards (3 per Creator).
              </p>
              <p className="mt-2 text-muted-foreground text-xs">
                A <strong>Sky Creator</strong> substitutes for any element. A <strong>Golden Body</strong> is
                a wildcard animal. You must also have <strong>no Creator cards left in your hand</strong> when
                you reach 16, and each animal must <strong>touch</strong> the Creator it counts for. In
                End of Days, if both piles empty before anyone completes their ecosystem the match is
                a draw (each player earns half points). Top Score and Beat the Clock fall back to
                highest score.
              </p>
            </section>

            <section>
              <h4 className="font-semibold text-sm mb-1">Set up</h4>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Shuffle the deck (Draw Pile).</li>
                <li>Each player is dealt <strong>5 cards</strong>.</li>
                <li>Used Pile starts empty.</li>
                <li>First player is chosen; turn order is fixed.</li>
              </ol>
            </section>

            <section>
              <h4 className="font-semibold text-sm mb-1">Hand limit</h4>
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                <li>Hand cap is <strong>5 cards</strong> at end-of-turn. Drawing 2 + placing 2 every turn keeps the count steady.</li>
                <li>You must place or discard 2 cards every turn — no skipping, no ending early.</li>
                <li>Animals gained from a Disaster go <strong>straight onto your board</strong>, never into your hand. If they don't connect to your ecosystem they still go on the board (visible, but as a removed/empty space that future cards can fill).</li>
                <li><strong>Golden Hive</strong> cannot be discarded — it stays in your hand until you choose to spend it to block an incoming Disaster.</li>
              </ul>
            </section>

            <section>
              <h4 className="font-semibold text-sm mb-1">On your turn</h4>
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
              <h4 className="font-semibold text-sm mb-1">Free actions</h4>
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                <li>Move any of your already-placed cards to another legal empty hex (still touching your ecosystem). Cards can be repositioned but never removed.</li>
                <li>Rotate a placed hex (+60° clockwise) to colour-match neighbours.</li>
              </ul>
            </section>

            <section>
              <h4 className="font-semibold text-sm mb-1">Placement rules</h4>
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                <li>The first card may be placed on the central hex.</li>
                <li>Every other card must go on an <strong>empty hex adjacent to your ecosystem</strong> — the only exception is animals dropped on your board from a Disaster, which can land disconnected.</li>
                <li><strong>Adjacency:</strong> <em>at least one neighbour must share a Creator Type</em> with the card you're placing — only one side has to match. Non-matching neighbours are simply ignored and never block a placement.</li>
                <li><strong>Creator cards are anchors:</strong> Creators may always sit beside other Creators, and never block an incoming animal regardless of element.</li>
                <li><strong>Wildcards:</strong> <strong>Sky Creator</strong> and <strong>Golden Body</strong> match anything for adjacency. Regular animals and Sky Creatures still need to share a type with at least one neighbour.</li>
                <li><strong>Animals must be touching their matching Creator to count toward the win.</strong> A scattered matching animal still sits on the board but does not satisfy the 3-per-Creator requirement until it's adjacent to that Creator's hex.</li>
                <li><strong>Hover a hex</strong> while a card is selected to see why a placement is legal ("Shares Snow with Snow Creator") or illegal ("None of the neighbours share Snow or Sun").</li>
                <li><strong>Stuck cards in your hand</strong> are shown muted — they have no legal board play, Disaster, or steal available this turn, so your only action with them is to discard. Discarding is never blocked by the adjacency rule.</li>
              </ul>

            </section>

            <section className="space-y-4">
              <h4 className="font-semibold text-sm">Card powers</h4>

              <div>
                <h5 className="font-semibold text-sm">Creator Cards (Earth / Fire / Air / Water)</h5>
                <p className="text-muted-foreground text-xs">
                  Form the centre of your ecosystem — you need one of each element. <strong>Once all 4 of
                  your own Creators are on the board</strong>, any further Creator in your hand can be played
                  as a Disaster.
                </p>
              </div>

              <div>
                <h5 className="font-semibold text-sm">Disaster (Creator → Used Pile)</h5>
                <p className="text-muted-foreground text-xs">
                  Wipes every Animal matching that Creator's element from rivals' ecosystems. Those animals
                  go <strong>straight onto the disaster-player's board</strong>. A Golden Hive on the victim
                  absorbs the disaster entirely (Hive is consumed to the Used Pile). The Creator card sits
                  on top of the Used Pile and can be picked up by other players.
                </p>
              </div>

              <div>
                <h5 className="font-semibold text-sm">Sky Creator Cards</h5>
                <p className="text-muted-foreground text-xs">
                  Substitutes for a Creator of any element. When played as a Disaster
                  it <strong>only wipes Mystical Creature cards bearing the Sky symbol</strong>.
                </p>
              </div>

              <div>
                <h5 className="font-semibold text-sm">Animal Cards</h5>
                <p className="text-muted-foreground text-xs">
                  Each Animal belongs to 1 or 2 Creator Types. 3 matching Animals are required per Creator.
                </p>
              </div>

              <div>
                <h5 className="font-semibold text-sm">Golden Body Card</h5>
                <p className="text-muted-foreground text-xs">
                  Counts as a matching Animal for any Creator.
                </p>
              </div>

              <div>
                <h5 className="font-semibold text-sm">Golden Hive Card</h5>
                <p className="text-muted-foreground text-xs">
                  Cannot be placed on the board. Can only be discarded when used to shield against a
                  Disaster played against you — it absorbs the next Disaster, then is consumed to the
                  Used Pile (and cannot be picked back up).
                </p>
              </div>

              <div>
                <h5 className="font-semibold text-sm">Sky Creature Cards</h5>
                <p className="text-muted-foreground text-xs">
                  Place as an Animal (counts toward any matching Creator they share a type with), OR
                  play as a Stealer: discard to the Used Pile and steal one Animal from any opponent's
                  ecosystem into your hand. Stealer cards in the Used Pile cannot be picked up.
                </p>
              </div>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">2. Game Type: End of Days</h3>
              <p className="text-xs italic text-muted-foreground mb-2">
                Classic full game — build your complete ecosystem to win.
              </p>
              <h4 className="font-semibold text-sm mb-1">How this game type ends</h4>
              <p className="text-xs">
                The match ends the moment a player assembles a valid 16-card ecosystem: 4 Creators
                covering all four elements (Earth / Fire / Air / Water — with Sky Creators acting as
                wildcards), 12 Animals (3 per Creator, each animal <strong>touching</strong> the Creator
                it counts for, Golden Body as a wildcard animal), AND no Creator or Sky Creator cards
                remaining in their hand. If the Draw and Used piles both empty before anyone completes
                the ecosystem, the match is a <strong>draw</strong> — each player earns half points
                toward their profile. There is no "highest score wins" fallback in End of Days.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-muted-foreground">
                <li>No timer. No score target. Pure ecosystem race.</li>
                <li>All standard placement, disaster, hive and steal rules apply.</li>
                <li>Bots are held to exactly the same win validation as human players, including the adjacency rule.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">3. Game Type: Top Score (First-to-Target)</h3>
              <p className="text-xs italic text-muted-foreground mb-2">
                First player to reach the configured top score wins — or completes a valid 16-card ecosystem first.
              </p>
              <h4 className="font-semibold text-sm mb-1">How this game type ends</h4>
              <p className="text-xs">
                A player wins the instant either condition is met: (a) their total score reaches the target
                (default 50), <strong>or</strong> (b) they complete a valid ecosystem (4 Creators covering all
                four elements + 12 Animals correctly assigned, 3 per Creator) before hitting the target. For
                example, completing the ecosystem at 45 pts in a 50-pt match still wins.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-muted-foreground">
                <li>Score = 2 pts per placed card + engine bonus points (e.g. disaster wipes).</li>
                <li>Target score is configurable in admin (default 50).</li>
                <li>Early ecosystem completion wins immediately, even below the target score.</li>
                <li>If both piles run out before anyone wins, the highest score wins.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-display text-base mb-1">4. Game Type: Beat the Clock</h3>
              <p className="text-xs italic text-muted-foreground mb-2">
                Match timer + per-turn timer. Highest score on time-up.
              </p>
              <h4 className="font-semibold text-sm mb-1">How this game type ends</h4>
              <p className="text-xs">
                The match auto-ends when the overall match timer hits zero. Each turn is capped by a
                per-turn timer — if it expires, the current player's turn ends automatically. When the
                match timer runs out, the player with the highest total score wins. A player can still
                win early by completing a valid 16-card ecosystem.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-muted-foreground">
                <li>Match length and per-turn seconds are configured in admin (defaults: 20 min match, 20 sec per turn).</li>
                <li>If the per-turn timer expires mid-turn, any required placements are forced/auto-discarded by the engine.</li>
                <li>Tie on time-up is broken by ecosystem completeness, then card count, then most recent placement.</li>
              </ul>
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
