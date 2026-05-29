import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HelpCircle, Loader2, Users, BookOpen, Maximize2, ChevronUp, ChevronDown, LayoutDashboard, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Copy } from "lucide-react";
import { fetchAllCards, type GameCard } from "@/lib/gameCards";
import {
  buildDeck,
  createMatch,
  drawInitialFive,
  pickFromDraw,
  pickFromUsed,
  placeOnEcosystem,
  discardCard,
  playDisaster,
  playSkyCreatureSteal,
  resolveDisaster,
  botStep,
  rotateMyPlacedHex,
  moveMyPlacedHex,
  skipDraws,
  endTurnEarly,
} from "@/lib/game";
import {
  createMatchRow,
  loadMatch,
  saveMatchState,
  inviteUrl,
  type GameMatchRow,
} from "@/lib/game/persistence";
import { recordProgressDiff } from "@/lib/game/progress";
import { useMatchRealtime } from "@/hooks/useMatchRealtime";
import { useAuth } from "@/contexts/AuthContext";
import { DISCORD_INVITE_URL } from "@/config/discordChat";
import type { Axial, DeckCard, MatchState } from "@/lib/game/types";
import { Ecosystem } from "@/components/game/Ecosystem";
import { PlayerHand } from "@/components/game/PlayerHand";
import { ScorePanel } from "@/components/game/ScorePanel";
import { BoardHexPiece } from "@/components/game/BoardHexPiece";
import { MatchOverDialog } from "@/components/game/MatchOverDialog";
import { TutorialOverlay, resetTutorial } from "@/components/game/TutorialOverlay";
import { MultiplayerLobby } from "@/components/game/MultiplayerLobby";
import { HandTile } from "@/components/game/cards/HandTile";
import { RuleBookSheet } from "@/components/game/RuleBookSheet";
import { OpponentPanel } from "@/components/game/OpponentPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { fetchPlayerDisplayName } from "@/lib/playerName";

type Mode = "place" | "disaster" | "steal" | "move";

const LOCAL_STORAGE_KEY = "creators13.play.local-match.v1";

export default function Play() {
  const { matchId: routeMatchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [allCards, setAllCards] = useState<GameCard[] | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [matchRow, setMatchRow] = useState<GameMatchRow | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("place");
  const [error, setError] = useState<string | null>(null);
  
  const [showPiles, setShowPiles] = useState(false);
  const [ribbonHidden, setRibbonHidden] = useState(false);
  const [opponentPanelOpen, setOpponentPanelOpen] = useState(false);
  const [ruleBookOpen, setRuleBookOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [waitingForGuest, setWaitingForGuest] = useState(false);
  const [moveFromKey, setMoveFromKey] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const saveSeqRef = useRef(0);
  const undoStackRef = useRef<MatchState[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  function pushUndo(snapshot: MatchState | null) {
    if (!snapshot) return;
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
  }
  function onUndo() {
    const prev = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    if (!prev) return;
    setState(prev);
    setSelectedUid(null);
    setMoveFromKey(null);
    setMode("place");
    if (matchRow && user) {
      saveMatchState({ matchId: matchRow.id, actingUserId: user.id, state: prev }).catch(() => {});
    } else {
      persistLocalMatch(prev);
    }
  }

  // Derived: identity inside the match.
  const isPvp = matchRow?.mode === "pvp";
  const selfSlot = useMemo(() => {
    if (!matchRow) return "you";
    if (isPvp) {
      return user?.id === matchRow.host_user_id ? "host" : "guest";
    }
    return "you";
  }, [matchRow, user, isPvp]);

  /* ----------- Load cards then bootstrap the match ----------- */

  useEffect(() => {
    let cancelled = false;
    fetchAllCards()
      .then((cards) => {
        if (cancelled) return;
        setAllCards(cards);
        // Warm the browser cache so board pieces render instantly.
        for (const c of cards) {
          if (!c.art_url) continue;
          const img = new Image();
          img.decoding = "async";
          img.src = c.art_url;
        }
      })
      .catch((e) => setError(e.message ?? String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Load from URL match id, OR build a local/persistent solo match.
  useEffect(() => {
    if (!allCards) return;
    let cancelled = false;

    (async () => {
      try {
        if (routeMatchId) {
          const { row, state } = await loadMatch(routeMatchId);
          if (cancelled) return;

          // Sync the live player names in the match state with the latest
          // host_name / guest_name on the row (which the join flow updates).
          // This means a freshly-joined guest sees their real name instead
          // of the "Waiting…" placeholder the host first put there.
          let patched = state;
          let mutated = false;
          const nextPlayers = state.players.map((p) => {
            if (p.id === "host" && row.host_name && p.name !== row.host_name) {
              mutated = true;
              return { ...p, name: row.host_name };
            }
            if (p.id === "guest" && row.guest_name && p.name !== row.guest_name) {
              mutated = true;
              return { ...p, name: row.guest_name };
            }
            return p;
          });
          if (mutated) {
            patched = { ...state, players: nextPlayers };
            if (user) {
              saveMatchState({ matchId: row.id, actingUserId: user.id, state: patched }).catch(() => {});
            }
          }

          setMatchRow(row);
          setState(patched);
          setWaitingForGuest(row.mode === "pvp" && row.status === "waiting");
          return;
        }

        // No route id — solo vs Bot path.
        const youName = user ? await fetchPlayerDisplayName(user) : "You";
        if (cancelled) return;
        const deck = buildDeck(allCards);
        const fresh = createMatch({
          deck,
          players: [
            { id: "you", name: youName },
            { id: "bot", name: "Tutorial Bot" },
          ],
        });
        // Try to restore an in-progress solo match from localStorage.
        const restored = restoreLocalMatch(allCards, youName);
        if (restored) {
          if (cancelled) return;
          setState(restored);
          return;
        }
        if (cancelled) return;
        setState(fresh);
        persistLocalMatch(fresh);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allCards, routeMatchId, user]);

  /* ----------- Realtime: opponent's moves ----------- */

  const handleRemote = useCallback(
    (remoteState: MatchState, row: GameMatchRow) => {
      setState(remoteState);
      setMatchRow(row);
      if (row.status === "active") setWaitingForGuest(false);
    },
    [],
  );
  useMatchRealtime(
    isPvp ? matchRow?.id ?? null : null,
    user?.id ?? null,
    handleRemote,
  );

  /* ----------- Bot driver — only for solo (matchRow null OR mode='solo') ----------- */

  useEffect(() => {
    if (!state || state.finished) return;
    if (isPvp) return;
    if (state.players[state.turn].id !== "bot") return;
    const t = setTimeout(() => {
      try {
        setState((s) => {
          if (!s) return s;
          const next = botStep(s);
          schedulePersist(next);
          return next;
        });
      } catch {
        /* skip */
      }
    }, 750);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isPvp]);

  /* ----------- Persistence helpers ----------- */

  function schedulePersist(next: MatchState) {
    const prev = state;
    const alreadyFinishedBefore = !!prev?.finished;
    const isBotMatch = !matchRow || matchRow.mode === "solo";
    if (user && !isBotMatch) {
      // Update player_progress (points / types seen / streak / ELO) for the signed-in player.
      // Note: no points are earned when playing the Bot — encourage real-player matches.
      recordProgressDiff({
        userId: user.id,
        selfSlot,
        prev,
        next,
        alreadyFinishedBefore,
      });
    }
    if (matchRow && user) {
      const seq = ++saveSeqRef.current;
      // Compute winner user id for pvp.
      let winnerUserId: string | null = null;
      if (next.finished && next.winnerId && matchRow.mode === "pvp") {
        winnerUserId =
          next.winnerId === "host" ? matchRow.host_user_id
          : next.winnerId === "guest" ? matchRow.guest_user_id
          : null;
      }
      saveMatchState({ matchId: matchRow.id, actingUserId: user.id, state: next, winnerUserId })
        .catch((e) => {
          if (seq === saveSeqRef.current) console.error("Save failed", e);
        });
    } else {
      persistLocalMatch(next);
    }
  }

  /* ----------- Derived view-model ----------- */

  const selfPlayer = state?.players.find((p) => p.id === selfSlot);
  const opponent = state?.players.find((p) => p.id !== selfSlot);
  const isYourTurn =
    !!state && !state.finished && state.players[state.turn].id === selfSlot && !waitingForGuest;
  const selectedCard: DeckCard | undefined = useMemo(
    () => selfPlayer?.hand.find((c) => c.uid === selectedUid),
    [selfPlayer, selectedUid],
  );
  const usedTop = state?.used[state.used.length - 1];

  const guarded = (fn: () => MatchState) => {
    try {
      const snap = state;
      const next = fn();
      pushUndo(snap);
      setState(next);
      schedulePersist(next);
      setSelectedUid(null);
      setMode("place");
    } catch (e: any) {
      toast.error(e?.message ?? "Illegal move");
    }
  };

  function onPickDraw() { if (state) guarded(() => pickFromDraw(state)); }
  function onPickUsed() { if (state) guarded(() => pickFromUsed(state)); }
  function onDrawOne() {
    if (state) guarded(() => pickFromDraw(state));
  }
  function onPlace(pos: Axial, draggedUid?: string) {
    if (!state) return;
    const dragMoveKey = draggedUid?.startsWith("move:") ? draggedUid.slice(5) : null;
    const fromKey = dragMoveKey ?? (mode === "move" ? moveFromKey : null);
    if (fromKey) {
      try {
        const snap = state;
        const next = moveMyPlacedHex(state, selfSlot, fromKey, pos);
        pushUndo(snap);
        setState(next);
        schedulePersist(next);
        setMoveFromKey(null);
      } catch (e: any) {
        toast.error(e?.message ?? "Cannot move here");
      }
      return;
    }
    const cardUid = draggedUid ?? selectedUid;
    if (!cardUid) return;
    guarded(() => placeOnEcosystem(state, cardUid, pos));
  }
  function onDiscard() { if (state && selectedUid) guarded(() => discardCard(state, selectedUid)); }
  function onDiscardUid(uid: string) {
    if (!state) return;
    if (uid.startsWith("move:")) return; // ignore ecosystem drags
    if (state.phase !== "place") {
      toast.error("Pick up your 2 cards first, then drop a card on the Used/Discarded Pile to discard.");
      return;
    }
    guarded(() => discardCard(state, uid));
  }
  function onSkipDraws() { if (state) guarded(() => skipDraws(state)); }
  function onEndTurn() { if (state) guarded(() => endTurnEarly(state)); }
  function onPlacedHexClick(posKey: string) {
    if (!state || !selfPlayer) return;
    if (mode === "move") {
      // Toggle: pick up or drop-on-self (no-op)
      setMoveFromKey((cur) => (cur === posKey ? null : posKey));
      return;
    }
    // Default: rotate
    setState((s) => {
      if (!s) return s;
      pushUndo(s);
      const next = rotateMyPlacedHex(s, selfSlot, posKey);
      schedulePersist(next);
      return next;
    });
  }
  function onDisaster() { if (state && selectedUid) guarded(() => playDisaster(state, selectedUid)); }
  function onStealHex(posKey: string) {
    if (!state || !selectedUid || !opponent) return;
    guarded(() => playSkyCreatureSteal(state, selectedUid, opponent.id, posKey));
  }

  function onCloseResumeLater() {
    // PvP rows stay 'active' in the DB — they'll show up under "Resume" on the dashboard.
    // Solo local matches stay in localStorage and resume on next visit.
    navigate("/dashboard");
  }

  async function onCloseAbandon() {
    const ok = window.confirm(
      isPvp
        ? "Abandon this match? It will be marked finished for both players and removed from your resume list."
        : "Abandon this match? Your current solo game will be discarded.",
    );
    if (!ok) return;

    if (matchRow && user && isPvp && state) {
      // Forfeit: mark finished, opponent wins.
      const opponentSlot = selfSlot === "host" ? "guest" : "host";
      const opponentUserId =
        opponentSlot === "host" ? matchRow.host_user_id : matchRow.guest_user_id;
      const finishedState: MatchState = {
        ...state,
        finished: true,
        winnerId: opponentSlot,
      };
      try {
        await saveMatchState({
          matchId: matchRow.id,
          actingUserId: user.id,
          state: finishedState,
          winnerUserId: opponentUserId,
        });
      } catch (e) {
        console.error("[abandon] save failed", e);
      }
    } else {
      // Solo — drop the local snapshot.
      try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch {}
    }
    navigate("/dashboard");
  }

  async function onNewGame() {

    if (!allCards) return;
    if (routeMatchId) {
      // PvP / persisted match — leaving back to a fresh solo.
      navigate("/play");
      return;
    }
    const youName = user ? await fetchPlayerDisplayName(user) : "You";
    const deck = buildDeck(allCards);
    const fresh = createMatch({
      deck,
      players: [
        { id: "you", name: youName },
        { id: "bot", name: "Tutorial Bot" },
      ],
    });
    setState(fresh);
    setSelectedUid(null);
    setMode("place");
    if (!user) persistLocalMatch(fresh);
  }

  function onOpenMultiplayer() {
    if (!user) {
      toast.error("Sign in to play multiplayer");
      navigate(`/auth?returnTo=${encodeURIComponent("/play")}`);
      return;
    }
    setLobbyOpen(true);
  }

  async function handleCreatePvp() {
    if (!user || !allCards) throw new Error("Not ready");
    const deck = buildDeck(allCards);
    const hostName = await fetchPlayerDisplayName(user);
    const initial = createMatch({
      deck,
      players: [
        { id: "host", name: hostName },
        { id: "guest", name: "Waiting…" },
      ],
    });
    const row = await createMatchRow({
      mode: "pvp",
      hostUserId: user.id,
      hostName,
      state: initial,
    });
    return { matchId: row.id, token: row.invite_token! };
  }

  /* ----------- Render ----------- */

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h2 className="text-xl mb-2 font-display">Could not load match</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button className="mt-4" onClick={() => navigate("/play")}>Back to Play</Button>
        </div>
      </div>
    );
  }
  if (!state || !selfPlayer || !opponent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  let phaseHint = "";
  if (waitingForGuest) {
    phaseHint = "Waiting for your friend to join…";
  } else if (state.finished) {
    phaseHint = `Match over — winner: ${state.players.find((p) => p.id === state.winnerId)?.name ?? "—"}`;
  } else if (!isYourTurn) {
    phaseHint = `${opponent.name} is ${isPvp ? "thinking" : "thinking…"}`;
  } else if (state.phase === "draw") {
    phaseHint = `Pick up to ${2 - state.drawnThisTurn} card${2 - state.drawnThisTurn === 1 ? "" : "s"} (draw 1 at a time from either pile) — or skip pick-up and play straight from your hand.`;
  } else if (mode === "steal") {
    phaseHint = `Click an animal in ${opponent.name}'s ecosystem to steal it.`;
  } else if (mode === "move") {
    phaseHint = moveFromKey
      ? "Drop onto a glowing hex or anywhere on your board to snap it in place — cards can't leave your ecosystem."
      : "Drag any placed card to reposition it on your board, or click one first to move it.";
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

  const handAtLimit = selfPlayer.hand.length >= 10; // HAND_LIMIT
  const canDrawOne = isYourTurn && state.phase === "draw" && (state.draw.length > 0 || state.used.length > 0) && state.drawnThisTurn < 2 && !handAtLimit;

  const opponentBlock = (
    <Card className="p-3">
      <button
        type="button"
        onClick={() => setOpponentPanelOpen(true)}
        className="w-full flex items-center justify-between gap-2 mb-2 group"
        aria-label={`Pop out ${opponent.name}'s ecosystem`}
      >
        <span className="text-xs uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
          {opponent.name}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
          Pop out <Maximize2 className="w-3 h-3" />
        </span>
      </button>
      <button
        type="button"
        onClick={() => setOpponentPanelOpen(true)}
        className="block w-full rounded-md hover:ring-2 hover:ring-primary/40 transition-all"
        aria-label="Pop out opponent ecosystem"
      >
        <Ecosystem eco={opponent.ecosystem} size={isMobile ? 28 : 36} minHeight={isMobile ? 140 : 180} showEmpties={false} />
      </button>
    </Card>
  );

  const pilesBlock = (
    <Card
      className="p-3 transition-colors data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-destructive/60"
      onDragOver={(e) => {
        if (!isYourTurn || state.phase !== "place") return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.dataset.dropTarget = "true";
      }}
      onDragLeave={(e) => { delete e.currentTarget.dataset.dropTarget; }}
      onDrop={(e) => {
        delete e.currentTarget.dataset.dropTarget;
        const uid = e.dataTransfer.getData("text/plain");
        if (uid) onDiscardUid(uid);
      }}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Used/Discarded Pile</div>
      <Button variant="outline" size="sm" className="w-full text-xs"
        disabled={!isYourTurn || state.phase !== "draw" || state.used.length === 0}
        onClick={onPickUsed}>
        Take top card ({state.used.length})
      </Button>
      <div className="mt-3 flex flex-col items-center gap-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Top of used pile
        </div>
        {usedTop ? (
          <>
            <BoardHexPiece card={usedTop} size={72} />
            <div className="text-[11px] text-center text-foreground/80 leading-tight truncate max-w-full">
              {usedTop.name}
            </div>
          </>
        ) : (
          <div className="text-[10px] text-muted-foreground italic text-center py-2">
            Empty — nothing discarded yet
          </div>
        )}
        <div className="text-[10px] text-muted-foreground italic text-center mt-1">
          Drag a card here to discard
        </div>
      </div>
    </Card>
  );

  const actionsBlock = (
    <Card className="p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Card actions</div>
      <div className="flex flex-col gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={undoCount === 0}
          onClick={onUndo}
          className="h-auto py-1.5 px-2 text-[11px] leading-tight"
        >
          ↶ Undo last move {undoCount > 0 ? `(${undoCount})` : ""}
        </Button>
        <Button
          size="sm"
          disabled={!canDrawOne || state.draw.length === 0}
          onClick={onDrawOne}
          className="h-auto py-2.5 px-2 whitespace-normal text-xs leading-tight text-center font-semibold"
        >
          Draw 1 from Draw Pile ({state.draw.length} left) — {2 - state.drawnThisTurn} pick{2 - state.drawnThisTurn === 1 ? "" : "s"} left{handAtLimit ? " — hand full (10 max)" : ""}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!isYourTurn || state.phase !== "draw"}
          onClick={onSkipDraws}
          className="h-auto py-2 px-2 whitespace-normal text-xs leading-tight text-center"
        >
          Skip pick-up → play from hand
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!isYourTurn || state.phase !== "place" || state.placedThisTurn >= 2}
          onClick={onEndTurn}
          className="h-auto py-2 px-2 whitespace-normal text-xs leading-tight text-center"
        >
          End turn early
        </Button>
        <Button size="sm" variant="secondary" disabled={!canDisaster} onClick={onDisaster}
          className="h-auto py-2 px-2 whitespace-normal text-xs leading-tight text-center">
          Play as Disaster
        </Button>
        <Button size="sm" variant={mode === "steal" ? "default" : "secondary"}
          disabled={!canSteal}
          onClick={() => setMode(mode === "steal" ? "place" : "steal")}
          className="h-auto py-2 px-2 whitespace-normal text-xs leading-tight text-center">
          {mode === "steal" ? "Cancel steal" : "Steal with Sky Creature"}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => setRuleBookOpen(true)}
        className="text-[10px] text-primary hover:underline mt-3 inline-flex items-center gap-1"
      >
        <BookOpen className="w-3 h-3" /> Open Rule Book
      </button>
    </Card>
  );

  const selectedBlock = mode === "steal" ? (
    <Card className="p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Click an animal to steal</div>
      <Ecosystem eco={opponent.ecosystem} size={isMobile ? 27 : 42} showEmpties={false}
        onStealClick={onStealHex} minHeight={isMobile ? 150 : 225} />
    </Card>
  ) : (
    <Card className="p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Selected</div>
      {selectedCard ? (
        <div className="flex flex-col items-center gap-1.5">
          <HandTile card={selectedCard} size={105} selected />
          <div className="text-[10px] text-muted-foreground text-center">Tap the ⓘ to flip the card.</div>
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">Click a card in your hand.</div>
      )}
    </Card>
  );


  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">

      {!ribbonHidden && <ScorePanel state={state} />}

      {!ribbonHidden && (
        <div className="px-3 py-2 bg-card/30 border-b border-border/40 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm flex-1 min-w-0">
            {phaseHint}
            {isYourTurn && state.phase === "place" && mode !== "steal" && (
              <span className="ml-2 text-muted-foreground hidden md:inline">
                · Tip: click any placed hex to rotate its colours.
              </span>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={onCloseResumeLater}
              title="Leave the board — your match is saved and you can come back to it from the dashboard."
            >
              <LayoutDashboard className="w-4 h-4 mr-1" /> Close & resume later
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCloseAbandon}
              className="text-destructive hover:text-destructive"
              title="Forfeit this match. It will be marked finished for both players."
            >
              Close & abandon
            </Button>
            <Button
              size="sm"
              variant="outline"
              asChild
            >
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-4 h-4 mr-1" /> Discord
              </a>
            </Button>
            {isPvp ? (
              <Button size="sm" variant="outline" onClick={() => navigate("/play")}>
                Solo vs Bot
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={onOpenMultiplayer}>
                <Users className="w-4 h-4 mr-1" /> Multiplayer
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setRuleBookOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm font-semibold"
            >
              <BookOpen className="w-4 h-4 mr-1" /> Rule Book
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { resetTutorial(); window.location.reload(); }}>
              <HelpCircle className="w-4 h-4 mr-1" /> Help
            </Button>
            {(state.finished || !isPvp) && (
              <Button size="sm" onClick={onNewGame}>New game</Button>
            )}
          </div>
        </div>
      )}

      {/* Hide/Show ribbon toggle strip */}
      <button
        type="button"
        onClick={() => setRibbonHidden((v) => !v)}
        className="w-full flex items-center justify-center gap-1 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground bg-card/40 hover:bg-card/60 border-b border-border/40 transition-colors"
        aria-label={ribbonHidden ? "Show ribbon" : "Hide ribbon"}
      >
        {ribbonHidden ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        {ribbonHidden ? "Show ribbon" : "Hide ribbon"}
      </button>


      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[240px_1fr_195px] gap-2 p-2 min-h-0 overflow-hidden">
        {/* Mobile compact bar: opponent + piles toggles */}
        <div className="lg:hidden flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setOpponentPanelOpen(true)}
          >
            <Maximize2 className="w-3.5 h-3.5 mr-1" /> {opponent.name}
          </Button>
          <Collapsible open={showPiles} onOpenChange={setShowPiles} className="flex-1">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                {showPiles ? "Hide" : "Show"} piles
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {pilesBlock}
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Left column (desktop): opponent + piles */}
        <div className="hidden lg:flex lg:flex-col lg:gap-2 lg:col-start-1 lg:min-h-0 lg:overflow-y-auto">
          {opponentBlock}
          {pilesBlock}
        </div>

        {/* Centre: board */}
        <div className="flex flex-col min-w-0 min-h-0 lg:col-start-2">
          <Card className="flex-1 p-1 flex flex-col min-h-0 bg-transparent border-0 shadow-none">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 px-1">Your ecosystem</div>
            <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center">
              <Ecosystem
                eco={selfPlayer.ecosystem}
                size={isMobile ? 64 : 110}
                autoFit
                selectable={isYourTurn || canUseBoard}
                onPlace={onPlace}
                showEmpties
                onStealClick={undefined}
                onRotateClick={isYourTurn ? onPlacedHexClick : undefined}
                onMoveDragStart={isYourTurn ? (posKey) => setMoveFromKey(posKey) : undefined}
                onMoveDragEnd={isYourTurn ? () => setMoveFromKey(null) : undefined}
                minHeight={0}
                moveFromKey={moveFromKey}
              />

            </div>
          </Card>
        </div>

        {/* Right column: Selected (top) → Card actions with Draw 2 (below) */}
        <div className="lg:col-start-3 min-w-0 min-h-0 overflow-y-auto flex flex-col gap-2">
          {selectedBlock}
          {actionsBlock}
        </div>

      </div>

      <PlayerHand
        hand={selfPlayer.hand}
        selectedUid={selectedUid}
        onSelect={(uid) => setSelectedUid(uid)}
        disabled={!isYourTurn || state.phase !== "place"}
        size={isMobile ? 65 : 95}
      />

      <MatchOverDialog state={state} onPlayAgain={onNewGame} />
      <TutorialOverlay />
      <RuleBookSheet open={ruleBookOpen} onOpenChange={setRuleBookOpen} />
      <OpponentPanel open={opponentPanelOpen} onClose={() => setOpponentPanelOpen(false)} player={opponent} />
      <MultiplayerLobby
        open={lobbyOpen}
        onOpenChange={setLobbyOpen}
        onCreate={handleCreatePvp}
        onOpenMatch={(matchId) => {
          setLobbyOpen(false);
          navigate(`/play/m/${matchId}`);
        }}
      />

      {/* PvP waiting overlay (host) */}
      {waitingForGuest && matchRow?.invite_token && (
        <Dialog open onOpenChange={(o) => { if (!o) setWaitingForGuest(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Waiting for your friend…</DialogTitle>
              <DialogDescription>
                Share this link. The match starts the moment they open it.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input value={inviteUrl(matchRow.invite_token)} readOnly onFocus={(e) => e.currentTarget.select()} />
              <Button
                size="icon"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl(matchRow.invite_token!));
                  toast.success("Invite link copied");
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex justify-end gap-2 mt-2 flex-wrap">
              <Button variant="ghost" onClick={() => setWaitingForGuest(false)}>
                Keep waiting in background
              </Button>
              <Button variant="outline" onClick={() => { setWaitingForGuest(false); navigate("/play"); }}>
                Cancel & play solo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ----------- Local-only persistence (signed-out users) ----------- */

function persistLocalMatch(state: MatchState) {
  try {
    const payload = {
      v: 1,
      players: state.players.map((p) => ({
        ...p,
        ecosystem: { placed: Array.from(p.ecosystem.placed.entries()) },
      })),
      turn: state.turn,
      draw: state.draw,
      used: state.used,
      phase: state.phase,
      drawnThisTurn: state.drawnThisTurn,
      placedThisTurn: state.placedThisTurn,
      turnNumber: state.turnNumber,
      finished: state.finished,
      winnerId: state.winnerId,
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function restoreLocalMatch(_cards: GameCard[], currentPlayerName?: string): MatchState | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j.v !== 1) return null;
    if (j.finished) return null;
    const restored = {
      ...j,
      players: j.players.map((p: any) => ({
        ...p,
        ecosystem: { placed: new Map(p.ecosystem.placed) },
      })),
    } as MatchState;
    if (currentPlayerName) {
      restored.players = restored.players.map((p) =>
        p.id === "you" ? { ...p, name: currentPlayerName } : p,
      );
    }
    return restored;
  } catch {
    return null;
  }
}
