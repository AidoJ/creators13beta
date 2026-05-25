import { useEffect, useState, useCallback } from "react";
import { fetchAllCards, type GameCard } from "@/lib/gameCards";
import { createMatch, placeCard, discardCard } from "@/lib/game/engine";
import type { MatchState, Axial } from "@/lib/game/types";
import { pickBotMove } from "@/lib/game/bot";
import { GameBoard } from "@/components/game/GameBoard";
import { PlayerHand } from "@/components/game/PlayerHand";
import { ScorePanel } from "@/components/game/ScorePanel";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

const HUMAN_ID = "you";
const BOT_ID = "bot";

export default function Play() {
  const [allCards, setAllCards] = useState<GameCard[] | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [hexSize, setHexSize] = useState(110);

  // Initial fetch
  useEffect(() => {
    fetchAllCards()
      .then((cards) => {
        setAllCards(cards);
      })
      .catch((err) => {
        console.error(err);
        toast({ title: "Failed to load cards", description: String(err), variant: "destructive" });
      });
  }, []);

  const newMatch = useCallback(() => {
    if (!allCards) return;
    const m = createMatch({
      players: [
        { id: HUMAN_ID, name: "You" },
        { id: BOT_ID, name: "Bot" },
      ],
      deck: allCards,
    });
    setState(m);
    setSelectedSlug(null);
  }, [allCards]);

  // Start a match once cards are loaded.
  useEffect(() => {
    if (allCards && !state) newMatch();
  }, [allCards, state, newMatch]);

  // Bot turn driver
  useEffect(() => {
    if (!state || state.finished) return;
    const current = state.players[state.turn];
    if (current.id !== BOT_ID) return;

    const handle = setTimeout(() => {
      const move = pickBotMove(state);
      try {
        if (move.kind === "place") {
          const { state: next, pointsAwarded } = placeCard(
            state,
            move.cardSlug,
            move.pos,
            move.rotation,
          );
          setState(next);
          if (pointsAwarded > 0) {
            toast({ title: `Bot matched ${pointsAwarded} edge${pointsAwarded > 1 ? "s" : ""}` });
          }
        } else {
          setState(discardCard(state, move.cardSlug));
          toast({ title: "Bot discarded a card" });
        }
      } catch (err) {
        console.error("bot move failed", err);
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [state]);

  if (!allCards || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading deck…
      </div>
    );
  }

  const human = state.players.find((p) => p.id === HUMAN_ID)!;
  const isHumanTurn = state.players[state.turn]?.id === HUMAN_ID && !state.finished;
  const selectedCard = human.hand.find((c) => c.slug === selectedSlug) ?? null;

  const handlePlace = (pos: Axial) => {
    if (!isHumanTurn || !selectedCard) return;
    try {
      const { state: next, pointsAwarded } = placeCard(state, selectedCard.slug, pos);
      setState(next);
      setSelectedSlug(null);
      if (pointsAwarded > 0) {
        toast({ title: `+${pointsAwarded} point${pointsAwarded > 1 ? "s" : ""}` });
      }
    } catch (err: any) {
      toast({ title: "Illegal move", description: err?.message, variant: "destructive" });
    }
  };

  const handleDiscard = () => {
    if (!isHumanTurn || !selectedCard) return;
    setState(discardCard(state, selectedCard.slug));
    setSelectedSlug(null);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <ScorePanel state={state} />

      <div className="flex-1 overflow-auto p-6">
        <div className="flex justify-between items-center mb-4 max-w-5xl mx-auto">
          <p className="text-xs text-muted-foreground">
            {isHumanTurn
              ? selectedCard
                ? "Click a glowing hex to place — rotation is chosen automatically to maximise matches."
                : "Pick a card from your hand."
              : "Bot is thinking…"}
          </p>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted-foreground">Hex size</label>
            <input
              type="range"
              min={70}
              max={160}
              value={hexSize}
              onChange={(e) => setHexSize(Number(e.target.value))}
            />
            <Button size="sm" variant="outline" onClick={newMatch}>
              New match
            </Button>
          </div>
        </div>

        <GameBoard
          state={state}
          size={hexSize}
          selectedCard={isHumanTurn ? selectedCard : null}
          onPlace={handlePlace}
        />
      </div>

      <PlayerHand
        hand={human.hand}
        selectedSlug={selectedSlug}
        onSelect={(slug) => setSelectedSlug((cur) => (cur === slug ? null : slug))}
        onDiscard={handleDiscard}
        disabled={!isHumanTurn}
      />
    </div>
  );
}
