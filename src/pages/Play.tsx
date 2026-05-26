import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchAllCards, type GameCard } from "@/lib/gameCards";
import {
  buildDeck,
  createMatch,
  pickFromDraw,
  pickFromUsed,
  placeOnEcosystem,
  discardCard,
  playDisaster,
  playSkyCreatureSteal,
  legalEcoCells,
  botStep,
} from "@/lib/game";
import type { Axial, DeckCard, MatchState } from "@/lib/game/types";
import { Ecosystem } from "@/components/game/Ecosystem";
import { PlayerHand } from "@/components/game/PlayerHand";
import { ScorePanel } from "@/components/game/ScorePanel";
import { BoardHexPiece } from "@/components/game/BoardHexPiece";
import { toast } from "sonner";

type Mode = "place" | "disaster" | "steal";

export default function Play() {
  const [allCards, setAllCards] = useState<GameCard[] | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("place");
  const [error, setError] = useState<string | null>(null);

  // Load cards + create match once
  useEffect(() => {
    let cancelled = false;
    fetchAllCards()
      .then((cards) => {
        if (cancelled) return;
        setAllCards(cards);
        const deck = buildDeck(cards);
        setState(
          createMatch({
            deck,
            players: [
              { id: "you", name: "You" },
              { id: "bot", name: "Tutorial Bot" },
            ],
          }),
        );
      })
      .catch((e) => setError(e.message ?? String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Drive the bot
  useEffect(() => {
    if (!state || state.finished) return;
    if (state.players[state.turn].id !== "bot") return;
    const t = setTimeout(() => {
      try {
        setState((s) => (s ? botStep(s) : s));
      } catch {
        /* skip */
      }
    }, 750);
    return () => clearTimeout(t);
  }, [state]);

  const you = state?.players[0];
  const bot = state?.players[1];
  const isYourTurn = state && state.players[state.turn].id === "you" && !state.finished;
  const selectedCard: DeckCard | undefined = useMemo(
    () => you?.hand.find((c) => c.uid === selectedUid),
    [you, selectedUid],
  );

  const usedTop = state?.used[state.used.length - 1];

  const guarded = (fn: () => MatchState) => {
    try {
      const next = fn();
      setState(next);
      setSelectedUid(null);
      setMode("place");
    } catch (e: any) {
      toast.error(e?.message ?? "Illegal move");
    }
  };

  function onPickDraw() {
    if (!state) return;
    guarded(() => pickFromDraw(state));
  }
  function onPickUsed() {
    if (!state) return;
    guarded(() => pickFromUsed(state));
  }
  function onPlace(pos: Axial, draggedUid?: string) {
    const cardUid = draggedUid ?? selectedUid;
    if (!state || !cardUid) return;
    guarded(() => placeOnEcosystem(state, cardUid, pos));
  }
  function onDiscard() {
    if (!state || !selectedUid) return;
    guarded(() => discardCard(state, selectedUid));
  }
  function onDisaster() {
    if (!state || !selectedUid) return;
    guarded(() => playDisaster(state, selectedUid));
  }
  function onStealHex(posKey: string) {
    if (!state || !selectedUid) return;
    guarded(() => playSkyCreatureSteal(state, selectedUid, "bot", posKey));
  }

  function onNewGame() {
    if (!allCards) return;
    const deck = buildDeck(allCards);
    setState(
      createMatch({
        deck,
        players: [
          { id: "you", name: "You" },
          { id: "bot", name: "Tutorial Bot" },
        ],
      }),
    );
    setSelectedUid(null);
    setMode("place");
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h2 className="text-xl mb-2 font-display">Could not load card deck</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }
  if (!state || !you || !bot) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Phase hint text
  let phaseHint = "";
  if (state.finished) {
    phaseHint = `Match over — winner: ${state.players.find((p) => p.id === state.winnerId)?.name ?? "—"}`;
  } else if (!isYourTurn) {
    phaseHint = "Tutorial Bot is thinking…";
  } else if (state.phase === "draw") {
    phaseHint = `Pick up ${2 - state.drawnThisTurn} card${2 - state.drawnThisTurn === 1 ? "" : "s"} (draw pile or top of used pile).`;
  } else if (mode === "steal") {
    phaseHint = "Click an animal in Bot's ecosystem to steal it.";
  } else if (selectedCard) {
    phaseHint = "Drag this card onto a glowing hex, click a glowing hex to snap it in, or use a card-power button.";
  } else {
    phaseHint = `Select a card from your hand to play it. (${2 - state.placedThisTurn} play${2 - state.placedThisTurn === 1 ? "" : "s"} left this turn.)`;
  }

  const canUseBoard = !!isYourTurn && state.phase === "place" && mode === "place";
  const canDiscard = isYourTurn && state.phase === "place" && !!selectedCard;
  const canDisaster = isYourTurn && state.phase === "place" && !!selectedCard
    && (selectedCard.kind === "creator" || selectedCard.kind === "sky_creator");
  const canSteal = isYourTurn && state.phase === "place" && !!selectedCard
    && selectedCard.kind === "sky_creature";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ScorePanel state={state} />

      <div className="px-4 py-2 bg-card/30 border-b border-border/40 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm">{phaseHint}</div>
        <div className="flex gap-2">
          {state.finished && (
            <Button size="sm" onClick={onNewGame}>New game</Button>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[220px_1fr_220px] gap-3 p-2 min-h-0">
        {/* LEFT RAIL */}
        <div className="flex flex-col gap-3 min-w-0">
          <Card className="p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Tutorial Bot</div>
            <Ecosystem eco={bot.ecosystem} size={36} minHeight={180} showEmpties={false} />
          </Card>

          <Card className="p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Piles</div>
            <div className="flex gap-2 items-center">
              <Button
                variant="outline" size="sm" className="flex-1"
                disabled={!isYourTurn || state.phase !== "draw" || state.draw.length === 0}
                onClick={onPickDraw}
              >
                Draw ({state.draw.length})
              </Button>
              <Button
                variant="outline" size="sm" className="flex-1"
                disabled={!isYourTurn || state.phase !== "draw" || state.used.length === 0}
                onClick={onPickUsed}
              >
                Used ({state.used.length})
              </Button>
            </div>
            {usedTop && (
              <div className="mt-3 flex justify-center">
                <BoardHexPiece card={usedTop} size={64} />
              </div>
            )}
          </Card>

          <Card className="p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Card actions</div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="secondary" disabled={!canDiscard} onClick={onDiscard}>
                Discard selected
              </Button>
              <Button size="sm" variant="secondary" disabled={!canDisaster} onClick={onDisaster}>
                Play as Disaster
              </Button>
              <Button
                size="sm" variant={mode === "steal" ? "default" : "secondary"}
                disabled={!canSteal}
                onClick={() => setMode(mode === "steal" ? "place" : "steal")}
              >
                {mode === "steal" ? "Cancel steal" : "Steal with Sky Creature"}
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              Creators ⇒ Disaster (after your 4 are placed). Sky Creature ⇒ Steal. Golden Hive ⇒ pick up to arm shield. Golden Body ⇒ wildcard animal.
            </div>
          </Card>
        </div>

        {/* CENTRE */}
        <div className="flex flex-col min-w-0">
          <Card className="flex-1 p-1 flex flex-col min-h-0 bg-[hsl(var(--board-surface))]">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 px-1">Your ecosystem</div>
            <div className="flex-1 overflow-hidden flex items-center justify-center">
              <div className="aspect-square h-[min(64vh,680px)] max-h-full max-w-full flex items-center justify-center bg-[hsl(var(--board-hex-ghost))]">
              <Ecosystem
                eco={you.ecosystem}
                size={116}
                selectable={canUseBoard}
                onPlace={onPlace}
                showEmpties
                onStealClick={undefined}
                minHeight={520}
              />
              </div>
            </div>
          </Card>
        </div>



        {/* RIGHT RAIL - bot ecosystem big for steal target */}
        {mode === "steal" && (
          <Card className="p-3 col-start-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Click an animal to steal
            </div>
            <Ecosystem
              eco={bot.ecosystem}
              size={56}
              showEmpties={false}
              onStealClick={onStealHex}
              minHeight={300}
            />
          </Card>
        )}
        {mode !== "steal" && (
          <Card className="p-3 col-start-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Selected</div>
            {selectedCard ? (
              <div className="flex flex-col items-center gap-2">
                <BoardHexPiece card={selectedCard} size={120} highlight="selected" />
                <div className="text-sm font-medium text-center">{selectedCard.name}</div>
                {selectedCard.source?.descriptor && (
                  <div className="text-xs text-muted-foreground text-center max-h-32 overflow-auto">
                    {selectedCard.source.descriptor}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Click a card in your hand.</div>
            )}
          </Card>
        )}
      </div>

      {/* HAND */}
      <PlayerHand
        hand={you.hand}
        selectedUid={selectedUid}
        onSelect={(uid) => setSelectedUid(uid)}
        disabled={!isYourTurn || state.phase !== "place"}
        size={84}
      />
    </div>
  );
}
