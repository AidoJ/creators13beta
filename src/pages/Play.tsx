import { useEffect, useState, useCallback } from "react";
import { fetchAllCards, type GameCard } from "@/lib/gameCards";
import {
  buildDeck, createMatch, pickFromDraw, pickFromUsed,
  placeOnEcosystem, discardCard, playDisaster, playSkyCreatureSteal, botStep,
  ecosystemSummary,
} from "@/lib/game";
import type { MatchState, Axial, DeckCard } from "@/lib/game/types";
import { Ecosystem } from "@/components/game/Ecosystem";
import { PlayerHand } from "@/components/game/PlayerHand";
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
    }, 700);
    return () => clearTimeout(h);
  }, [state]);

  if (!allCards || !state) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading deck…</div>;
  }

  const human = state.players.find((p) => p.id === HUMAN_ID)!;
  const bot = state.players.find((p) => p.id === BOT_ID)!;
  const isHumanTurn = state.players[state.turn]?.id === HUMAN_ID && !state.finished;
  const selectedCard: DeckCard | null = human.hand.find((c) => c.uid === selectedUid) ?? null;
  const humanSum = ecosystemSummary(human.ecosystem);
  const botSum = ecosystemSummary(bot.ecosystem);

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
  const canPlace = isHumanTurn && state.phase === "place" && selectedCard &&
                   selectedCard.kind !== "golden_hive" && !canSteal;

  const phaseText =
    state.finished
      ? `Winner: ${state.players.find((p) => p.id === state.winnerId)?.name ?? "—"}`
      : !isHumanTurn
        ? "Bot is thinking…"
        : state.phase === "draw"
          ? `Pick up ${2 - state.drawnThisTurn} card${2 - state.drawnThisTurn === 1 ? "" : "s"} from the Draw or Used pile`
          : selectedCard
            ? canSteal && stealMode
              ? "Click an animal in the Bot's ecosystem to steal it"
              : canSteal
                ? "Choose Steal animal, Discard, or pick a different card"
                : canDisaster
                  ? "Place this Creator on a glowing hex, or Play as Disaster"
                  : selectedCard.kind === "golden_hive"
                    ? "Golden Hive — discard to arm your shield against the next Disaster"
                    : "Place on a glowing hex — or Discard"
            : `Select a card from your hand to play (${2 - state.placedThisTurn} action${2 - state.placedThisTurn === 1 ? "" : "s"} left)`;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/60 backdrop-blur">
        <div className="flex items-center gap-6">
          <h1 className="font-display text-xl text-primary">13 Creators</h1>
          <span className="text-sm text-muted-foreground">
            Turn {state.turnNumber} · Draw {state.draw.length} · Used {state.used.length}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={newMatch}>New match</Button>
      </header>

      {/* Instruction banner */}
      <div className="px-4 py-2 text-center text-sm bg-primary/10 border-b border-primary/30 font-medium">
        {phaseText}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3 p-3 overflow-auto">
        {/* Left rail — opponent + piles */}
        <aside className="flex flex-col gap-3">
          <section className="rounded-lg border border-border/40 bg-card/30 p-3">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-display text-base">Bot</h2>
              <span className="text-xs text-muted-foreground">{botSum.creators}/4 · {botSum.animals}/12</span>
            </div>
            <Ecosystem
              eco={bot.ecosystem}
              size={42}
              minHeight={180}
              onStealClick={stealMode && isHumanTurn ? handleStealTarget : undefined}
            />
            {stealMode && <p className="text-xs text-primary text-center mt-2">Click an animal to steal</p>}
          </section>

          <section className="rounded-lg border border-border/40 bg-card/30 p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Piles</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={!isHumanTurn || state.phase !== "draw" || state.draw.length === 0}
                onClick={() => guarded(() => pickFromDraw(state))}
                className="rounded-md border border-border/60 p-2 text-center hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <div className="font-display text-2xl">{state.draw.length}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New pile</div>
              </button>
              <button
                disabled={!isHumanTurn || state.phase !== "draw" || state.used.length === 0}
                onClick={() => guarded(() => pickFromUsed(state))}
                className="rounded-md border border-border/60 p-2 text-center hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition flex flex-col items-center"
              >
                {state.used.length > 0 ? (
                  <BoardHexPiece card={state.used[state.used.length - 1]} size={48} />
                ) : (
                  <div className="font-display text-2xl">0</div>
                )}
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Used pile</div>
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-border/40 bg-card/30 p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Card actions</div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="secondary"
                disabled={!isHumanTurn || !selectedCard || state.phase !== "place"}
                onClick={handleDiscard}>Discard selected</Button>
              <Button size="sm"
                disabled={!isHumanTurn || !canDisaster || state.phase !== "place"}
                onClick={handleDisaster}>🔥 Play as Disaster</Button>
              <Button size="sm"
                disabled={!isHumanTurn || !canSteal || state.phase !== "place"}
                onClick={() => setStealMode((s) => !s)}>
                {stealMode ? "Cancel steal" : "🦋 Steal animal"}
              </Button>
            </div>
          </section>
        </aside>

        {/* Centre stage — your ecosystem */}
        <section className="rounded-lg border border-border/40 bg-card/30 p-4 flex flex-col">
          <div className="flex items-baseline justify-between border-b border-border/30 pb-2 mb-3">
            <div>
              <h2 className="font-display text-2xl">Your ecosystem</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {humanSum.creators}/4 creators · {humanSum.animals}/12 animals
                {human.hiveShield && <span className="ml-2 text-primary">🛡 Hive shield armed</span>}
              </p>
            </div>
            <div className="text-right">
              <div className="font-display text-3xl text-primary">{Math.round(human.ecosystem.placed.size / 16 * 100)}%</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">complete</div>
            </div>
          </div>
          <div className="flex-1">
            <Ecosystem
              eco={human.ecosystem}
              size={84}
              minHeight={360}
              selectable={!!canPlace}
              onPlace={handlePlace}
            />
          </div>
        </section>
      </div>

      <PlayerHand
        hand={human.hand}
        selectedUid={selectedUid}
        onSelect={(uid) => { setSelectedUid((cur) => (cur === uid ? null : uid)); setStealMode(false); }}
        disabled={!isHumanTurn || state.phase !== "place"}
      />
    </div>
  );
}
