import { useEffect, useState, useCallback } from "react";
import { fetchAllCards, type GameCard } from "@/lib/gameCards";
import {
  buildDeck, createMatch, pickFromDraw, pickFromUsed,
  placeOnEcosystem, discardCard, playDisaster, playSkyCreatureSteal, botStep,
} from "@/lib/game";
import type { MatchState, Axial, DeckCard } from "@/lib/game/types";
import { Ecosystem } from "@/components/game/Ecosystem";
import { PlayerHand } from "@/components/game/PlayerHand";
import { ScorePanel } from "@/components/game/ScorePanel";
import { BoardHexPiece } from "@/components/game/BoardHexPiece";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

const HUMAN_ID = "you";
const BOT_ID = "bot";

export default function Play() {
  const [allCards, setAllCards] = useState<GameCard[] | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [stealMode, setStealMode] = useState(false);

  useEffect(() => {
    fetchAllCards()
      .then(setAllCards)
      .catch((err) => toast({ title: "Failed to load cards", description: String(err), variant: "destructive" }));
  }, []);

  const newMatch = useCallback(() => {
    if (!allCards) return;
    const deck = buildDeck(allCards);
    setState(createMatch({
      players: [{ id: HUMAN_ID, name: "You" }, { id: BOT_ID, name: "Bot" }],
      deck,
    }));
    setSelectedUid(null); setStealMode(false);
  }, [allCards]);

  useEffect(() => { if (allCards && !state) newMatch(); }, [allCards, state, newMatch]);

  // Bot driver
  useEffect(() => {
    if (!state || state.finished) return;
    if (state.players[state.turn].id !== BOT_ID) return;
    const h = setTimeout(() => {
      try {
        const next = botStep(state);
        if (next !== state) {
          setState(next);
          if (next.lastEvent) toast({ title: next.lastEvent });
        }
      } catch (e) { console.error(e); }
    }, 600);
    return () => clearTimeout(h);
  }, [state]);

  if (!allCards || !state) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading deck…</div>;
  }

  const human = state.players.find((p) => p.id === HUMAN_ID)!;
  const bot = state.players.find((p) => p.id === BOT_ID)!;
  const isHumanTurn = state.players[state.turn]?.id === HUMAN_ID && !state.finished;
  const selectedCard: DeckCard | null = human.hand.find((c) => c.uid === selectedUid) ?? null;

  const guarded = (fn: () => MatchState) => {
    try {
      const next = fn();
      setState(next); setSelectedUid(null); setStealMode(false);
      if (next.lastEvent) toast({ title: next.lastEvent });
    } catch (err: any) {
      toast({ title: "Can't do that", description: err?.message, variant: "destructive" });
    }
  };

  const handlePlace = (pos: Axial) => {
    if (!isHumanTurn || !selectedCard) return;
    guarded(() => placeOnEcosystem(state, selectedCard.uid, pos));
  };
  const handleDiscard = () => {
    if (!isHumanTurn || !selectedCard) return;
    guarded(() => discardCard(state, selectedCard.uid));
  };
  const handleDisaster = () => {
    if (!isHumanTurn || !selectedCard) return;
    guarded(() => playDisaster(state, selectedCard.uid));
  };
  const handleStealTarget = (posKey: string) => {
    if (!isHumanTurn || !selectedCard || !stealMode) return;
    guarded(() => playSkyCreatureSteal(state, selectedCard.uid, BOT_ID, posKey));
  };

  const canDisaster = selectedCard && (selectedCard.kind === "creator" || selectedCard.kind === "sky_creator");
  const canSteal = selectedCard?.kind === "sky_creature";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <ScorePanel state={state} />

      <div className="flex-1 overflow-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bot ecosystem */}
        <section className="rounded-lg border border-border/40 bg-card/30 p-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-display text-lg">Bot's ecosystem</h2>
            {stealMode && <span className="text-xs text-primary">Click an animal to steal it</span>}
          </div>
          <Ecosystem eco={bot.ecosystem} size={70} onStealClick={stealMode ? handleStealTarget : undefined} />
        </section>

        {/* Human ecosystem */}
        <section className="rounded-lg border border-border/40 bg-card/30 p-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-display text-lg">Your ecosystem</h2>
            <Button size="sm" variant="outline" onClick={newMatch}>New match</Button>
          </div>
          <Ecosystem
            eco={human.ecosystem}
            size={90}
            selectable={isHumanTurn && !!selectedCard && state.phase === "place" && !stealMode &&
              selectedCard.kind !== "golden_hive" && !canSteal}
            onPlace={handlePlace}
          />
        </section>
      </div>

      {/* Piles + actions */}
      <div className="border-t border-border/40 bg-card/40 backdrop-blur p-3 flex flex-wrap gap-4 items-center justify-center">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">Draw ({state.draw.length})</span>
          <Button
            size="sm"
            variant="outline"
            disabled={!isHumanTurn || state.phase !== "draw" || state.draw.length === 0}
            onClick={() => guarded(() => pickFromDraw(state))}
          >Pick from draw</Button>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">Used ({state.used.length})</span>
          {state.used.length > 0 && (
            <div className="mb-1"><BoardHexPiece card={state.used[state.used.length - 1]} size={60} /></div>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!isHumanTurn || state.phase !== "draw" || state.used.length === 0}
            onClick={() => guarded(() => pickFromUsed(state))}
          >Pick from used</Button>
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="secondary" disabled={!isHumanTurn || !selectedCard || state.phase !== "place"} onClick={handleDiscard}>
            Discard selected
          </Button>
          <Button size="sm" disabled={!isHumanTurn || !canDisaster || state.phase !== "place"} onClick={handleDisaster}>
            🔥 Play as Disaster
          </Button>
          <Button size="sm" disabled={!isHumanTurn || !canSteal || state.phase !== "place"} onClick={() => setStealMode((s) => !s)}>
            {stealMode ? "Cancel steal" : "🦋 Steal animal"}
          </Button>
        </div>
      </div>

      <PlayerHand
        hand={human.hand}
        selectedUid={selectedUid}
        onSelect={(uid) => { setSelectedUid((cur) => (cur === uid ? null : uid)); setStealMode(false); }}
        disabled={!isHumanTurn}
      />
    </div>
  );
}
