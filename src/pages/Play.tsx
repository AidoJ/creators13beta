import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { HelpCircle, Loader2, Users, BookOpen, Maximize2, ChevronUp, ChevronDown, LayoutDashboard, X, Plus, Swords, Clock, WifiOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DeckTile } from "@/components/game/DeckTile";

import { Copy } from "lucide-react";
import { fetchAllCards, fetchSpecialCards, type GameCard, type SpecialCard } from "@/lib/gameCards";
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
  legalEcoCells,
  placementMatchesNeighbours,
  placementReason,
  hasAnyLegalAction,


  resolveDisaster,
  botStep,
  rotateMyPlacedHex,
  moveMyPlacedHex,
  skipDraws,
  endTurnEarly,
} from "@/lib/game";
import {
  createMatchRow,
  createLobbyMatch,
  loadMatch,
  inviteUrl,
  type GameMatchRow,
} from "@/lib/game/persistence";
import { isPaidTier } from "@/lib/clientClassification";
import { type ServerMove } from "@/lib/game/serverMoves";
import { logClientStateChange } from "@/lib/game/debugLog";
import { deserializeMatch } from "@/lib/game/serialize";
import { recordProgressDiff } from "@/lib/game/progress";
import type { BotDifficulty } from "@/lib/game/bot";
import { supabase } from "@/integrations/supabase/client";
import { useMatchRealtime } from "@/hooks/useMatchRealtime";
import { usePvpReconcile } from "@/hooks/usePvpReconcile";
import { useBeatTheClockTimer } from "@/hooks/useBeatTheClockTimer";
import { useAuth } from "@/contexts/AuthContext";

import type { Axial, DeckCard, GameConfig, GameMode, MatchState } from "@/lib/game/types";
import { Ecosystem } from "@/components/game/Ecosystem";
import { PlayerHand } from "@/components/game/PlayerHand";
import { ScorePanel } from "@/components/game/ScorePanel";
import { BoardHexPiece } from "@/components/game/BoardHexPiece";
import { MatchOverDialog } from "@/components/game/MatchOverDialog";

import { TutorialOverlay, resetTutorial } from "@/components/game/TutorialOverlay";
// (legacy MultiplayerLobby dialog removed in Batch B — multiplayer now flows
// through the route-based /play/lobby/:matchId page.)
import { HandTile } from "@/components/game/cards/HandTile";
import { RuleBookSheet } from "@/components/game/RuleBookSheet";
import PlayerProfileDiscountCTA from "@/components/dashboard/PlayerProfileDiscountCTA";
import { OpponentPanel } from "@/components/game/OpponentPanel";
import { useMatchPresence } from "@/hooks/useMatchPresence";
import { GameModeSelector } from "@/components/game/GameModeSelector";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { fetchPlayerShortName } from "@/lib/playerName";
import { NamePrompt } from "@/components/game/NamePrompt";
import { useGameSettings } from "@/lib/game/settings";

type Mode = "place" | "disaster" | "steal" | "move";

const LOCAL_STORAGE_KEY = "creators13.play.local-match.v1";

export default function Play() {
  const { matchId: routeMatchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  // Practice rung — set on /play/new?practice=1. While true, the post-game
  // path skips `bump_bot_match_stats` (no pollution of the bot-record panel)
  // and instead bumps `player_progress.practice_games_played`.
  const practiceRef = useRef<boolean>(searchParams.get("practice") === "1");
  const PRACTICE_TARGET = 3;

  const [allCards, setAllCards] = useState<GameCard[] | null>(null);
  const [specialCards, setSpecialCards] = useState<SpecialCard[]>([]);
  const [state, setState] = useState<MatchState | null>(null);
  const [matchRow, setMatchRow] = useState<GameMatchRow | null>(null);
  const [rosterSlot, setRosterSlot] = useState<number | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("place");
  const [error, setError] = useState<string | null>(null);
  
  const [showPiles, setShowPiles] = useState(false);
  const [ribbonHidden, setRibbonHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    // Auto-hide ribbon on small screens so the board has room.
    return window.matchMedia?.("(max-width: 768px)").matches ?? false;
  });

  const [opponentPanelOpen, setOpponentPanelOpen] = useState(false);
  const [expandedOpponentId, setExpandedOpponentId] = useState<string | null>(null);

  // A.4 — realtime presence for the current PvP match. No-op for solo bot
  // matches (enabled=false when not PvP). The same channel name and payload
  // shape will be consumed by the B lobby and the C in-match indicators.
  const presence = useMatchPresence({
    matchId: matchRow?.id ?? null,
    userId: user?.id ?? null,
    seat: rosterSlot ?? undefined,
    enabled: matchRow?.mode === "pvp",
  });

  // Fire an immediate report-presence "join" the instant the board mounts
  // with a known PvP match + user — do not wait for the realtime channel
  // SUBSCRIBED handshake (can take seconds on slow connections). This is the
  // core fix for the post-start sweep race: it clears any stale
  // disconnected_at carried over from the lobby and bumps last_seen_at now,
  // long before the next sweep tick.
  useEffect(() => {
    if (matchRow?.mode !== "pvp") return;
    if (!matchRow?.id || !user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        await supabase.functions.invoke("report-presence", {
          body: { match_id: matchRow.id, event: "join" },
        });
      } catch (e) {
        if (!cancelled) console.warn("[play] immediate presence ping failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [matchRow?.id, matchRow?.mode, user?.id]);
  // Resizable opponents-rail width (% of stage). Persisted across sessions.
  const [opponentPct, setOpponentPct] = useState<number>(() => {
    if (typeof window === "undefined") return 40;
    const v = Number(window.localStorage.getItem("play.opponentPct"));
    return Number.isFinite(v) && v >= 20 && v <= 55 ? v : 40;
  });
  useEffect(() => {
    try { window.localStorage.setItem("play.opponentPct", String(opponentPct)); } catch { /* ignore */ }
  }, [opponentPct]);
  const splitDragRef = useRef<HTMLDivElement | null>(null);
  const onSplitPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = splitDragRef.current?.parentElement;
    if (!container) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const rect = container.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setOpponentPct(Math.max(20, Math.min(55, pct)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  const [ruleBookOpen, setRuleBookOpen] = useState(false);
  
  const [waitingForGuest, setWaitingForGuest] = useState(false);
  const [moveFromKey, setMoveFromKey] = useState<string | null>(null);
  const [stealVictimKey, setStealVictimKey] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { settings: gameSettings } = useGameSettings();
  // (turnStartedAtRef declared below, alongside other refs.)
  const undoStackRef = useRef<MatchState[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const botDifficultyRef = useRef<BotDifficulty>("medium");
  const botStatsRecordedRef = useRef(false);
  const [quickUndoUntil, setQuickUndoUntil] = useState<number>(0);
  const [, setNowTick] = useState(0);
  const [modeSelectorOpen, setModeSelectorOpen] = useState(false);
  const turnStartedAtRef = useRef<number>(Date.now());

  // Tick every 250ms while quick-undo is active so the countdown re-renders.
  useEffect(() => {
    if (quickUndoUntil <= 0) return;
    const id = setInterval(() => {
      if (Date.now() >= quickUndoUntil) {
        setQuickUndoUntil(0);
      } else {
        setNowTick((n) => n + 1);
      }
    }, 250);
    return () => clearInterval(id);
  }, [quickUndoUntil]);

  function armQuickUndo() {
    setQuickUndoUntil(Date.now() + 5000);
  }

  function pushUndo(snapshot: MatchState | null) {
    if (!snapshot) return;
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
  }
  function onUndo() {
    const prev = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    setQuickUndoUntil(0);
    if (!prev) return;
    setState(prev);
    setSelectedUid(null);
    setMoveFromKey(null);
    setMode("place");
    // Undo is solo-only by design. PvP matches are server-authoritative and
    // there's no "rewind the server" move — undo button isn't surfaced for
    // PvP, but defend against it firing anyway.
    if (matchRow?.mode === "pvp") return;
    persistLocalMatch(prev);
  }

  // Derived: identity inside the match.
  const isPvp = matchRow?.mode === "pvp";
  const selfSlot = useMemo(() => {
    if (!matchRow) return "you";
    if (isPvp) {
      if (typeof rosterSlot === "number" && state?.players[rosterSlot]?.id) {
        return state.players[rosterSlot].id;
      }
      return user?.id === matchRow.host_user_id ? "host" : "guest";
    }
    return "you";
  }, [matchRow, user, isPvp, rosterSlot, state]);

  /* ----------- Load cards then bootstrap the match ----------- */

  useEffect(() => {
    let cancelled = false;
    fetchAllCards()
      .then((cards) => {
        if (cancelled) return;
        setAllCards(cards);
        for (const c of cards) {
          if (!c.art_url) continue;
          const img = new Image();
          img.decoding = "async";
          img.src = c.art_url;
        }
      })
      .catch((e) => setError(e.message ?? String(e)));
    fetchSpecialCards()
      .then((s) => { if (!cancelled) setSpecialCards(s); })
      .catch(() => { /* non-fatal — fall back to generated specials */ });
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

          let myRosterSlot: number | null = null;
          if (row.mode === "pvp" && user) {
            const { data: rosterRow } = await supabase
              .from("game_match_players")
              .select("slot")
              .eq("match_id", routeMatchId)
              .eq("user_id", user.id)
              .maybeSingle();
            if (!cancelled) myRosterSlot = typeof rosterRow?.slot === "number" ? rosterRow.slot : null;
          }

          // Sync the live player names in the match state with the latest
          // host_name / guest_name on the row (which the join flow updates).
          // PURELY local — the server now also patches names from the row
          // inside apply-move, so we don't need (and aren't allowed) to
          // write the state column back from the client.
          let patched = state;
          const nextPlayers = state.players.map((p) => {
            if (p.id === "host" && row.host_name && p.name !== row.host_name) {
              return { ...p, name: row.host_name };
            }
            if (p.id === "guest" && row.guest_name && p.name !== row.guest_name) {
              return { ...p, name: row.guest_name };
            }
            return p;
          });
          if (nextPlayers.some((p, i) => p.name !== state.players[i].name)) {
            patched = { ...state, players: nextPlayers };
          }

          setMatchRow(row);
          setRosterSlot(myRosterSlot);
          setState(patched);
          setWaitingForGuest(row.mode === "pvp" && row.status === "waiting");
          return;
        }

        // No route id — solo vs Bot path.
        const youName = user ? await fetchPlayerShortName(user) : "You";
        if (cancelled) return;
        // Try to restore an in-progress solo match from localStorage.
        const restored = restoreLocalMatch(allCards, youName);
        if (restored) {
          if (cancelled) return;
          setState(restored);
          return;
        }
        // No restored match.
        if (cancelled) return;
        if (practiceRef.current) {
          // Practice rung: skip the mode selector, auto-start a quick
          // easy-difficulty End of Days bot match. No new engine work —
          // reuses startSoloMatch with a sensible default config.
          startSoloMatch("end_of_days", {}, "easy");
        } else {
          // Let the player pick a Game Type.
          setModeSelectorOpen(true);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allCards, routeMatchId, user]);

  /* ----------- PvP server reconcile (seq + submit) ----------- */
  const { serverSeqRef, submitServerMove } = usePvpReconcile({
    matchRow,
    setMatchRow,
    setState,
  });
  const setLoggedState = useCallback(
    (next: MatchState, source: "optimistic_engine", seq = serverSeqRef.current) => {
      if (isPvp) logClientStateChange(source, seq, next);
      setState(next);
    },
    [isPvp, serverSeqRef],
  );

  /* ----------- Realtime: opponent's moves ----------- */

  const handleRemote = useCallback(
    (remoteState: MatchState, row: GameMatchRow) => {
      logClientStateChange("realtime_push", Number(row.seq ?? 0), remoteState);
      setState(remoteState);
      setMatchRow(row);
      serverSeqRef.current = Number(row.seq ?? 0);
      if (row.status === "active") setWaitingForGuest(false);
    },
    [serverSeqRef],
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
    // If a disaster is pending against the bot, auto-activate its hive
    // (always optimal — saves placed animals at the cost of one hive).
    if (state.pendingDisaster && state.pendingDisaster.victimId === "bot") {
      const t = setTimeout(() => {
        try {
          setState((s) => {
            if (!s) return s;
            const next = resolveDisaster(s, true);
            schedulePersist(next);
            return next;
          });
        } catch {
          /* skip */
        }
      }, 600);
      return () => clearTimeout(t);
    }
    if (state.pendingDisaster) return; // waiting on human player
    if (state.players[state.turn].id !== "bot") return;
    const t = setTimeout(() => {
      try {
        setState((s) => {
          if (!s) return s;
          let next = botStep(s, botDifficultyRef.current);
          // Safety net: if the bot couldn't make any progress, force-end its
          // turn so the game doesn't deadlock.
          if (next === s) {
            try { next = endTurnEarly(s); } catch { /* still stuck — leave as-is */ }
          }
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

  function schedulePersist(next: MatchState, move?: ServerMove) {
    const prev = state;
    const alreadyFinishedBefore = !!prev?.finished;
    const isBotMatch = !matchRow || matchRow.mode === "solo";
    // Solo bot matches: client tracks lifetime stats (no ELO / no ladder).
    // PvP matches: the server-side `finalise_ranked_match` RPC, invoked from
    // `apply-move` when the match transitions to finished, is the ONLY thing
    // that touches player_progress for ranked play. The client never writes.
    if (user && isBotMatch) {
      // No ranked progress for bot matches — discoverable types still get
      // synced to the player so the Creators dex updates locally.
      recordProgressDiff({
        userId: user.id,
        selfSlot,
        prev,
        next,
        alreadyFinishedBefore,
      });
    }
    // Bot-match lifetime stats (no points / no ELO — practice only).
    if (user && isBotMatch && next.finished && !alreadyFinishedBefore && !botStatsRecordedRef.current) {
      botStatsRecordedRef.current = true;
      const youSlot = "you";
      const youPlayer = next.players.find((p) => p.id === youSlot);
      const won = next.winnerId == null ? null : next.winnerId === youSlot;
      const perfectEco = (youPlayer?.ecosystem.placed.size ?? 0) >= 16 && won === true;
      if (practiceRef.current) {
        // Practice rung: deliberately excluded from `bot_match_stats` so
        // the bot-record panel keeps meaning ("record once you started
        // playing for real"). Instead, advance the practice counter and
        // mark complete once the target is hit. Best-effort, never blocks.
        (async () => {
          try {
            const { data: pp } = await supabase
              .from("player_progress")
              .select("practice_games_played, practice_completed_at")
              .eq("user_id", user.id)
              .maybeSingle();
            const prev = (pp as any)?.practice_games_played ?? 0;
            const already = (pp as any)?.practice_completed_at ?? null;
            const nextCount = prev + 1;
            const patch: { practice_games_played: number; practice_completed_at?: string } = {
              practice_games_played: nextCount,
            };
            if (!already && nextCount >= PRACTICE_TARGET) {
              patch.practice_completed_at = new Date().toISOString();
            }
            await supabase
              .from("player_progress")
              .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
          } catch (e) {
            console.warn("practice counter bump failed", e);
          }
        })();
      } else {
        supabase.rpc("bump_bot_match_stats", {
          _difficulty: botDifficultyRef.current,
          _won: won,
          _perfect_eco: perfectEco,
        }).then(({ error }) => { if (error) console.warn("bump_bot_match_stats failed", error); });
      }
    }
    if (matchRow && user) {
      // PvP is fully server-authoritative now: clients no longer have UPDATE
      // privilege on game_matches.state / public_state / seq / winner.
      // Every PvP write must come with a structured Move and goes through
      // the apply-move edge function.
      if (matchRow.mode === "pvp") {
        if (move) submitServerMove(move);
        // No fallback — if a code path produces a state mutation without
        // a Move, that's a bug. Log loudly so we catch it.
        else console.error("[play] PvP state mutation without a Move — dropped", next.lastEvent);
        return;
      }
      // Solo matches (with or without a row) persist locally only.
      persistLocalMatch(next);
    } else {
      persistLocalMatch(next);
    }
  }

  /* ----------- Beat-the-Clock timer (extracted to a hook) ----------- */
  useBeatTheClockTimer({
    state,
    selfSlot,
    turnStartedAtRef,
    onTick: () => setNowTick((n) => n + 1),
    onMatchEnd: (next) => {
      setLoggedState(next, "optimistic_engine");
      schedulePersist(next, { type: "finalise_by_score" });
    },
    onTurnExpired: (next) => {
      setLoggedState(next, "optimistic_engine");
      schedulePersist(next, { type: "end_turn" });
    },
    onDrawExpired: () => {
      // Beat-the-Clock draw-phase timeout. Force the engine forward so the
      // game keeps moving:
      //  - on the player's very first turn, auto-deal the opening 5
      //  - otherwise just skip the pick-up (the player forfeits new cards
      //    as the time penalty — same 1-move cost as a manual skip).
      const s = state;
      if (!s) return;
      const me = s.players[s.turn];
      if (!me || me.id !== selfSlot) return;
      if (s.phase !== "draw") return;
      try {
        if (!me.firstPickupDone) {
          const next = drawInitialFive(s);
          setLoggedState(next, "optimistic_engine");
          schedulePersist(next, { type: "draw_initial_5" });
        } else {
          const next = skipDraws(s);
          setLoggedState(next, "optimistic_engine");
          schedulePersist(next, { type: "skip_draws" });
        }
      } catch {/* ignore — state likely already advanced via realtime */}
    },
  });



  /* ----------- Derived view-model ----------- */

  const selfPlayer = state?.players.find((p) => p.id === selfSlot);
  const opponent = state?.players.find((p) => p.id !== selfSlot);
  const opponents = useMemo(
    () => state?.players.filter((p) => p.id !== selfSlot) ?? [],
    [state, selfSlot],
  );
  const expandedOpponent =
    opponents.find((p) => p.id === expandedOpponentId) ?? opponent ?? null;
  const isYourTurn =
    !!state && !state.finished && state.players[state.turn].id === selfSlot && !waitingForGuest;
  const getPresenceStatusForPlayer = useCallback(
    (playerId: string | null | undefined) => {
      if (matchRow?.mode !== "pvp" || !playerId) return null;
      const slot = state?.players.findIndex((p) => p.id === playerId) ?? -1;
      const uid =
        slot === 0
          ? matchRow.host_user_id
          : slot === 1
            ? matchRow.guest_user_id ?? presence.userIdForSlot(slot)
            : slot > 1
              ? presence.userIdForSlot(slot)
            : null;
      if (!uid) return null;
      const status = presence.statusFor(uid);
      if (status) return status;
      return null;
    },
    [matchRow, state?.players, presence],
  );
  const selectedCard: DeckCard | undefined = useMemo(
    () => selfPlayer?.hand.find((c) => c.uid === selectedUid),
    [selfPlayer, selectedUid],
  );
  const usedTop = state?.used[state.used.length - 1];

  /** Per-cell predicate used by the board to grey out cells where the
   *  selected card cannot legally be placed (adjacency-type mismatch). */
  const legalForSelectedCard = useMemo(() => {
    if (!selectedCard || !selfPlayer) return undefined;
    return (pos: Axial) => placementMatchesNeighbours(selfPlayer.ecosystem, selectedCard, pos);
  }, [selectedCard, selfPlayer]);

  /** Hand-card uids whose only legal action this turn is discard. Pure
   *  function of state — never cached as its own piece of state. */
  const stuckUids = useMemo(() => {
    const out = new Set<string>();
    if (!state || !selfPlayer || state.finished || state.phase !== "place") return out;
    if (state.players[state.turn].id !== selfSlot) return out;
    for (const c of selfPlayer.hand) {
      if (!hasAnyLegalAction(state, selfSlot, c)) out.add(c.uid);
    }
    return out;
  }, [state, selfPlayer, selfSlot]);



  /** True when EVERY hand card has only discard available (legacy banner). */
  const isStuck = useMemo(() => {
    if (!state || !selfPlayer) return false;
    if (state.finished) return false;
    if (state.phase !== "place") return false;
    if (state.players[state.turn].id !== selfSlot) return false;
    const playable = selfPlayer.hand.filter((c) => c.kind !== "golden_hive");
    if (playable.length === 0) return false;
    const cells = legalEcoCells(selfPlayer.ecosystem);
    if (cells.length === 0) return false;
    return !playable.some((c) =>
      cells.some((cell) => placementMatchesNeighbours(selfPlayer.ecosystem, c, cell)),
    );
  }, [state, selfPlayer, selfSlot]);


  const guarded = (fn: () => MatchState, move?: ServerMove) => {
    try {
      const snap = state;
      const next = fn();
      pushUndo(snap);
      setLoggedState(next, "optimistic_engine");
      schedulePersist(next, move);
      setSelectedUid(null);
      setMode("place");
      setStealVictimKey(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Illegal move");
    }
  };

  function onPickDraw() {
    if (state) guarded(() => pickFromDraw(state), { type: "pickup_from_draw" });
  }
  function onPickUsed() {
    if (!state) return;
    const top = state.used[state.used.length - 1];
    if (!top) return;
    guarded(() => pickFromUsed(state), { type: "pickup_from_used", uid: top.uid });
  }
  function onDrawOne() {
    if (state) guarded(() => pickFromDraw(state), { type: "pickup_from_draw" });
  }
  function onDrawOpening() {
    if (state) guarded(() => drawInitialFive(state), { type: "draw_initial_5" });
  }
  function onResolveDisaster(useHive: boolean) {
    if (!state) return;
    guarded(() => resolveDisaster(state, useHive), { type: "resolve_disaster", use_hive: useHive });
  }
  function onPlace(pos: Axial, draggedUid?: string) {
    if (!state) return;
    // Steal stage 2: a victim animal was chosen — this click picks where to
    // place the stolen card on YOUR board.
    if (mode === "steal" && stealVictimKey && opponent && selectedUid) {
      const victimKey = stealVictimKey;
      guarded(
        () => playSkyCreatureSteal(state, selectedUid, opponent.id, victimKey, pos),
        {
          type: "play_sky_steal",
          uid: selectedUid,
          from_player_id: opponent.id,
          victim_pos_key: victimKey,
          place_at: pos,
        },
      );
      return;
    }
    const dragMoveKey = draggedUid?.startsWith("move:") ? draggedUid.slice(5) : null;
    // moveFromKey is set either by tap-to-move (mode === "move") or by an
    // active drag (HTML5 or touch fallback); honour either source.
    const fromKey = dragMoveKey ?? moveFromKey;
    if (fromKey) {
      // Server-authoritative in PvP, legacy save for solo.
      try {
        const snap = state;
        const next = moveMyPlacedHex(state, selfSlot, fromKey, pos);
        pushUndo(snap);
        setLoggedState(next, "optimistic_engine");
        schedulePersist(next, { type: "move_hex", from_key: fromKey, to_pos: pos });
        setMoveFromKey(null);
        armQuickUndo();
      } catch (e: any) {
        toast.error(e?.message ?? "Cannot move here");
      }
      return;
    }
    const cardUid = draggedUid ?? selectedUid;
    if (!cardUid) return;
    const before = undoStackRef.current.length;
    guarded(() => placeOnEcosystem(state, cardUid, pos), {
      type: "place",
      uid: cardUid,
      pos,
    });
    if (undoStackRef.current.length > before) armQuickUndo();
  }
  function onDiscard() {
    if (state && selectedUid) {
      guarded(() => discardCard(state, selectedUid), { type: "discard", uid: selectedUid });
    }
  }
  function onDiscardUid(uid: string) {
    if (!state) return;
    if (uid.startsWith("move:")) return; // ignore ecosystem drags
    if (state.phase !== "place") {
      toast.error("Pick up your 2 cards first, then drop a card on the Used/Discarded Pile to discard.");
      return;
    }
    guarded(() => discardCard(state, uid), { type: "discard", uid });
  }
  function onSkipDraws() {
    if (state) guarded(() => skipDraws(state), { type: "skip_draws" });
  }
  function onEndTurn() {
    if (state) guarded(() => endTurnEarly(state), { type: "end_turn" });
  }
  function onPlacedHexClick(posKey: string) {
    if (!state || !selfPlayer) return;
    if (mode === "move") {
      setMoveFromKey((cur) => (cur === posKey ? null : posKey));
      return;
    }
    // Rotate: presentation-only. Server-authoritative in PvP, legacy save for solo.
    setState((s) => {
      if (!s) return s;
      pushUndo(s);
      const next = rotateMyPlacedHex(s, selfSlot, posKey);
      if (isPvp) logClientStateChange("optimistic_engine", serverSeqRef.current, next);
      schedulePersist(next, { type: "rotate_hex", pos_key: posKey });
      return next;
    });
  }
  function onDisaster() {
    if (state && selectedUid) {
      guarded(() => playDisaster(state, selectedUid), { type: "play_disaster", uid: selectedUid });
    }
  }
  function onStealHex(posKey: string) {
    if (!state || !selectedUid || !opponent || !selfPlayer) return;
    const target = opponent.ecosystem.placed.get(posKey);
    if (!target) return;
    const k = target.card.kind;
    if (k === "golden_body") {
      toast.error("Golden Body is a wildcard treasure and cannot be stolen.");
      return;
    }
    if (k !== "animal" && k !== "sky_creature") {
      toast.error("Sky Creatures can only steal animals.");
      return;
    }
    // Make sure the stolen card has at least one legal landing spot.
    const cells = legalEcoCells(selfPlayer.ecosystem);
    const hasSpot = cells.some((c) =>
      placementMatchesNeighbours(selfPlayer.ecosystem, target.card, c),
    );
    if (!hasSpot) {
      toast.error(`${target.card.name} has no legal spot on your board — it needs at least one neighbour that shares a Creator Type.`);
      return;
    }
    // Stage 2: player now picks where to place the stolen card on their board.
    setStealVictimKey(posKey);
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
      // Forfeit — server-authoritative `concede` move via the reconcile
      // hook. Any rejection is toasted + reconciled inside; we always
      // navigate away after firing.
      await submitServerMove({ type: "concede" });
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
    // Open selector to pick the game type for the new solo match.
    setModeSelectorOpen(true);
  }

  async function startSoloMatch(mode: GameMode, config: GameConfig, difficulty: BotDifficulty) {
    if (!allCards) return;
    const youName = user ? await fetchPlayerShortName(user) : "You";
    const deck = buildDeck(allCards, specialCards);
    const botLabel = difficulty === "easy" ? "Bot · Easy" : difficulty === "hard" ? "Bot · Hard" : "Bot · Medium";
    const fresh = createMatch({
      deck,
      players: [
        { id: "you", name: youName },
        { id: "bot", name: botLabel },
      ],
      gameMode: mode,
      gameConfig: config,
    });
    botDifficultyRef.current = difficulty;
    botStatsRecordedRef.current = false;
    setState(fresh);
    setSelectedUid(null);
    setMode("place");
    turnStartedAtRef.current = Date.now();
    if (!user) persistLocalMatch(fresh);
    setModeSelectorOpen(false);
  }

  function onOpenMultiplayer() {
    if (!user) {
      toast.error("Sign in to play multiplayer");
      navigate(`/auth?returnTo=${encodeURIComponent("/play")}`);
      return;
    }
    // Reuse GameModeSelector — its onChooseMultiplayer callback takes the
    // selected mode/config and routes to lobby creation. Solo "Start match"
    // still works alongside.
    setModeSelectorOpen(true);
  }

  /**
   * Batch B — create a multiplayer lobby and navigate to /play/lobby/:id.
   * Host tier sets the lobby capacity (free → 2, paid → 4).
   */
  async function createMultiplayerLobby(mode: GameMode, config: GameConfig) {
    if (!user || !allCards) {
      toast.error("Not ready yet");
      return;
    }
    try {
      // Tier lookup — gates capacity. Only the host's tier matters.
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("tier")
        .eq("user_id", user.id)
        .maybeSingle();
      const playerCount: 2 | 4 = isPaidTier(sub?.tier ?? null) ? 4 : 2;

      const hostName = await fetchPlayerShortName(user);
      const deck = buildDeck(allCards, specialCards);

      // Build N player slots up-front; invitees fill via accept_game_invite.
      const players = Array.from({ length: playerCount }, (_, i) =>
        i === 0
          ? { id: "host", name: hostName }
          : { id: `guest${i}`, name: `Waiting ${i}…` },
      );
      const initial = createMatch({
        deck,
        players,
        gameMode: mode,
        gameConfig: config,
      });
      const row = await createLobbyMatch({
        hostUserId: user.id,
        hostName,
        playerCount,
        state: initial,
      });
      setModeSelectorOpen(false);
      navigate(`/play/lobby/${row.id}`);
    } catch (e: any) {
      console.error("[multiplayer-lobby] create failed", e);
      toast.error(e?.message ?? "Could not create lobby");
    }
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        {allCards && modeSelectorOpen ? (
          <GameModeSelector
            open
            onCancel={() => { setModeSelectorOpen(false); navigate("/dashboard"); }}
            onChoose={(m, c, d) => startSoloMatch(m, c, d)}
            onChooseMultiplayer={(m, c) => createMultiplayerLobby(m, c)}
          />
        ) : (
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        )}
      </div>
    );
  }

  let phaseHint = "";
  if (waitingForGuest) {
    phaseHint = "Waiting for your friend to join…";
  } else if (state.finished) {
    phaseHint = `Match over — winner: ${state.players.find((p) => p.id === state.winnerId)?.name ?? "—"}`;
  } else if (!isYourTurn) {
    const turnPlayer = state.players[state.turn] ?? opponent;
    const turnPresence = getPresenceStatusForPlayer(turnPlayer?.id);
    if (turnPresence === "reconnecting") {
      phaseHint = `${turnPlayer.name} is reconnecting…`;
    } else if (turnPresence === "disconnected" || turnPresence === "missing") {
      phaseHint = `${turnPlayer.name} disconnected — waiting to reconnect…`;
    } else {
      phaseHint = `${turnPlayer.name} is ${isPvp ? "thinking" : "thinking…"}`;
    }
  } else if (state.phase === "draw") {
    phaseHint = `Pick up ${2 - state.drawnThisTurn} more card${2 - state.drawnThisTurn === 1 ? "" : "s"} (draw 1 at a time from either pile).`;
  } else if (mode === "steal") {
    phaseHint = stealVictimKey
      ? "Now click a glowing hex on YOUR board to place the stolen animal."
      : `Click an animal in ${opponent.name}'s ecosystem to steal it.`;
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
  // Stage 2 of a steal: the stolen card waiting to be placed on your board.
  const stolenPendingCard: DeckCard | undefined =
    mode === "steal" && stealVictimKey
      ? opponent.ecosystem.placed.get(stealVictimKey)?.card
      : undefined;
  const canDiscard = isYourTurn && state.phase === "place" && !!selectedCard;
  const canDisaster = isYourTurn && state.phase === "place" && !!selectedCard
    && (selectedCard.kind === "creator" || selectedCard.kind === "sky_creator");
  const canSteal = isYourTurn && state.phase === "place" && !!selectedCard
    && selectedCard.kind === "sky_creature";

  const handAtLimit = selfPlayer.hand.length >= 5; // HAND_LIMIT
  const needsOpeningDraw = !selfPlayer.firstPickupDone && state.phase === "draw" && isYourTurn;
  const canDrawOne = isYourTurn && state.phase === "draw" && selfPlayer.firstPickupDone && (state.draw.length > 0 || state.used.length > 0) && state.drawnThisTurn < 2 && !handAtLimit;


  const canTapDiscard = isYourTurn && state.phase === "place" && !!selectedUid;
  const pilesBlock = (
    <Card
      className={
        "p-3 transition-colors data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-destructive/60 " +
        (isStuck
          ? "ring-2 ring-destructive bg-destructive/10 animate-pulse cursor-pointer "
          : canTapDiscard
            ? "ring-2 ring-destructive/50 cursor-pointer hover:bg-destructive/5"
            : "")
      }
      role={canTapDiscard ? "button" : undefined}
      aria-label={canTapDiscard ? "Discard selected card" : undefined}
      onClick={() => {
        if (canTapDiscard && selectedUid) onDiscardUid(selectedUid);
      }}
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
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
        Used/Discarded Pile
        {isStuck && (
          <span className="ml-2 text-destructive font-bold normal-case tracking-normal">
            · No legal placement — discard here
          </span>
        )}
      </div>
      <Button variant="outline" size="sm" className="w-full text-xs"
        disabled={!isYourTurn || state.phase !== "draw" || state.used.length === 0}
        onClick={(e) => { e.stopPropagation(); onPickUsed(); }}>
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
        <div className={"text-[10px] italic text-center mt-1 " + (isStuck ? "text-destructive font-semibold" : "text-muted-foreground")}>
          {isStuck
            ? "Tap a card in your hand, then tap here to discard — it still counts as one of your 2 plays."
            : canTapDiscard ? "Tap here to discard the selected card" : "Tap a card, then tap here to discard (or drag)"}
        </div>
      </div>
    </Card>
  );


  const actionsBlock = (
    <Card className="p-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1 px-0.5">Card actions</div>
      <div className="flex flex-col gap-1">
        {(() => {
          const quickActive = quickUndoUntil > 0 && Date.now() < quickUndoUntil;
          const secsLeft = quickActive ? Math.max(1, Math.ceil((quickUndoUntil - Date.now()) / 1000)) : 0;
          return (
            <Button
              size="sm"
              variant={quickActive ? "default" : "outline"}
              disabled={undoCount === 0}
              onClick={onUndo}
              className={
                "h-7 py-0 px-2 text-[11px] leading-tight transition-all " +
                (quickActive
                  ? "bg-amber-400 text-black hover:bg-amber-300 ring-2 ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.85)] animate-pulse"
                  : "")
              }
            >
              {quickActive
                ? `⚡ Undo (${secsLeft}s)`
                : `↶ Undo${undoCount > 0 ? ` (${undoCount})` : ""}`}
            </Button>
          );
        })()}
        <Button size="sm" variant="secondary" disabled={!canDisaster} onClick={onDisaster}
          className="h-7 py-0 px-2 text-[11px] leading-tight">
          Play as Disaster
        </Button>
        <Button size="sm" variant={mode === "steal" ? "default" : "secondary"}
          disabled={!canSteal}
          onClick={() => {
            setStealVictimKey(null);
            setMode(mode === "steal" ? "place" : "steal");
          }}
          className="h-7 py-0 px-2 text-[11px] leading-tight">
          {mode === "steal" ? "Cancel steal" : "Steal w/ Sky Creature"}
        </Button>
      </div>
    </Card>
  );


  const selectedBlock = mode === "steal" ? (
    <Card className="p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {stealVictimKey ? "Stealing — pick a hex on YOUR board" : "Click an animal to steal"}
      </div>
      {stealVictimKey && stolenPendingCard && (
        <div className="mb-1.5 text-[11px] text-foreground/90 text-center">
          Stealing <strong>{stolenPendingCard.name}</strong> — click a glowing hex on your board to place it.
        </div>
      )}
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


  /* ----------- Beat-the-Clock countdown labels ----------- */
  const isBeatClock = state.gameMode === "beat_clock";
  const matchEndsAt = state.gameConfig?.matchEndsAt ?? 0;
  const turnSecs = state.gameConfig?.turnSeconds ?? 0;
  const drawSecs = state.gameConfig?.drawSeconds ?? 0;
  const matchSecondsLeft = isBeatClock && matchEndsAt
    ? Math.max(0, Math.ceil((matchEndsAt - Date.now()) / 1000))
    : 0;
  const turnSecondsLeft = isBeatClock && turnSecs > 0 && isYourTurn && state.phase === "place"
    ? Math.max(0, Math.ceil((turnStartedAtRef.current + turnSecs * 1000 - Date.now()) / 1000))
    : 0;
  const drawSecondsLeft = isBeatClock && drawSecs > 0 && isYourTurn && state.phase === "draw"
    ? Math.max(0, Math.ceil((turnStartedAtRef.current + drawSecs * 1000 - Date.now()) / 1000))
    : 0;
  const phaseSecondsLeft = drawSecondsLeft || turnSecondsLeft;
  const phaseLabel = state.phase === "draw" ? "Pick up" : "Your turn";
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };


  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      {user && <PlayerProfileDiscountCTA userId={user.id} />}


      {gameSettings.maintenance_banner_enabled && gameSettings.maintenance_banner_text && (
        <div className="px-3 py-1.5 text-xs sm:text-sm text-center bg-amber-500/15 text-amber-200 border-b border-amber-500/30">
          {gameSettings.maintenance_banner_text}
        </div>
      )}

      {practiceRef.current && (
        <div className="px-3 py-1.5 text-xs sm:text-sm text-center bg-secondary/15 text-secondary-foreground border-b border-secondary/30">
          Warm up against the bot — no points at stake.
        </div>
      )}

      {gameSettings.play_disabled ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-3">
            <h2 className="font-display text-2xl">Game offline</h2>
            <p className="text-sm text-muted-foreground">{gameSettings.play_disabled_message}</p>
          </div>
        </div>
      ) : (<>

      {!ribbonHidden && gameSettings.show_score_panel && (
        <ScorePanel
          state={state}
          playerUserIds={
            matchRow?.mode === "pvp"
              ? state.players.map((p) =>
                  p.id === "host" ? matchRow.host_user_id : p.id === "guest" ? matchRow.guest_user_id : null,
                )
              : state.players.map((p) => (p.id === "you" ? user?.id ?? null : null))
          }
        />
      )}

      {/* Prominent Beat-the-Clock countdown */}
      {isBeatClock && !state.finished && (
        <div className={
          "px-3 py-2 flex items-center justify-center gap-6 border-b border-border/40 " +
          (matchSecondsLeft <= 30 ? "bg-destructive/20 animate-pulse" : "bg-amber-500/10")
        }>
          <div className="flex items-center gap-2">
            <Clock className={"w-5 h-5 " + (matchSecondsLeft <= 30 ? "text-destructive" : "text-amber-300")} />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Match</span>
            <span className={
              "font-mono text-2xl font-bold tabular-nums " +
              (matchSecondsLeft <= 30 ? "text-destructive" : "text-foreground")
            }>
              {fmt(matchSecondsLeft)}
            </span>
          </div>
          {isYourTurn && phaseSecondsLeft > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{phaseLabel}</span>
              <span className={
                "font-mono text-xl font-semibold tabular-nums px-2 py-0.5 rounded " +
                (phaseSecondsLeft <= 5 ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-card text-foreground")
              }>
                {phaseSecondsLeft}s
              </span>
            </div>
          )}
        </div>
      )}


      {!ribbonHidden && (
        <div className="px-3 py-1.5 bg-card/30 border-b border-border/40 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs sm:text-sm flex-1 min-w-0 truncate">
            {phaseHint}
          </div>

          {/* Beat-the-Clock countdowns */}
          {isBeatClock && (
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="inline-flex items-center gap-1 text-foreground/90">
                <Clock className="w-3.5 h-3.5" /> {fmt(matchSecondsLeft)}
              </span>
              {phaseSecondsLeft > 0 && (
                <span className={
                  "inline-flex items-center gap-1 px-1.5 rounded " +
                  (phaseSecondsLeft <= 5 ? "bg-destructive/20 text-destructive animate-pulse" : "text-muted-foreground")
                }>
                  {state.phase === "draw" ? "draw" : "turn"} {phaseSecondsLeft}s
                </span>
              )}
            </div>
          )}

          <div className="flex gap-1 items-center">
            {state.finished ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => navigate("/dashboard")}
                      className="h-8 w-8"
                      aria-label="Back to dashboard"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Back to dashboard</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={onNewGame}
                      className="h-8 w-8"
                      aria-label="Play again"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Play again</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={onCloseResumeLater}
                      className="h-8 w-8"
                      aria-label="Close and resume later"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Close &amp; resume later</TooltipContent>
                </Tooltip>

                {/* Hide Abandon once the local player has finalised — they're
                    already locked in and just spectating. */}
                {state.players.find((p) => p.id === selfSlot)?.status !== "finalised" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={onCloseAbandon}
                        className="h-8 w-8"
                        aria-label="Close and abandon"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Close &amp; abandon</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}


            {isPvp ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => navigate("/play")} aria-label="Solo vs Bot">
                    <Swords className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Solo vs Bot</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={onOpenMultiplayer} aria-label="Multiplayer">
                    <Users className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Multiplayer</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setRuleBookOpen(true)}
                  className="h-8 w-8"
                  aria-label="Rule Book"
                >
                  <BookOpen className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rule Book</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { resetTutorial(); window.location.reload(); }} aria-label="Help">
                  <HelpCircle className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Replay the tutorial</TooltipContent>
            </Tooltip>

            {(state.finished || !isPvp) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={onNewGame} aria-label="New game">
                    <Plus className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New game</TooltipContent>
              </Tooltip>
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


      {/* ============ MOBILE LAYOUT ============ */}
      {isMobile ? (
        <>
          {/* Top utility row: opponent peek + draw/discard quick access */}
          <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 border-b border-border/40">
            <Button
              variant="outline"
              size="sm"
              className={
                "flex-1 min-h-7 h-auto text-[11px] px-2 justify-start " +
                ((getPresenceStatusForPlayer(opponent.id) === "disconnected" || getPresenceStatusForPlayer(opponent.id) === "missing")
                  ? "border-destructive/60 bg-destructive/10 text-destructive"
                  : getPresenceStatusForPlayer(opponent.id) === "reconnecting"
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                    : "")
              }
              onClick={() => { setExpandedOpponentId(opponent.id); setOpponentPanelOpen(true); }}
            >
              <span className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-1 min-w-0">
                  <Maximize2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">{opponent.name}</span>
                </span>
                {(getPresenceStatusForPlayer(opponent.id) === "disconnected" || getPresenceStatusForPlayer(opponent.id) === "missing") && (
                  <span className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide">
                    <WifiOff className="w-2.5 h-2.5" /> Disconnected
                  </span>
                )}
                {getPresenceStatusForPlayer(opponent.id) === "reconnecting" && (
                  <span className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> Reconnecting
                  </span>
                )}
              </span>
            </Button>
            <button
              type="button"
              onClick={() => {
                if (needsOpeningDraw) onDrawOpening();
                else if (canDrawOne) onDrawOne();
              }}
              disabled={!needsOpeningDraw && !canDrawOne}
              className={
                "shrink-0 h-7 px-2 rounded-md border text-[11px] font-semibold transition " +
                (needsOpeningDraw || canDrawOne
                  ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/50"
                  : "border-border/60 bg-card/60 text-muted-foreground opacity-70")
              }
              aria-label="Draw from deck"
            >
              {needsOpeningDraw ? "Draw 5" : canDrawOne ? `Draw 1 (${Math.max(0, 2 - state.drawnThisTurn)})` : `D ${state.draw.length}`}
            </button>
            <Collapsible open={showPiles} onOpenChange={setShowPiles}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                  Piles
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>

          {showPiles && (
            <div className="px-2 py-1 border-b border-border/40 bg-card/30">
              {pilesBlock}
            </div>
          )}

          {/* Board takes all remaining space */}
          <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center px-1 py-1">
            <Ecosystem
              eco={selfPlayer.ecosystem}
              size={72}
              autoFit
              selectable={isYourTurn || canUseBoard}
              onPlace={onPlace}
              showEmpties
              onRotateClick={isYourTurn ? onPlacedHexClick : undefined}
              onMoveDragStart={isYourTurn ? (posKey) => setMoveFromKey(posKey) : undefined}
              onMoveDragEnd={isYourTurn ? () => setMoveFromKey(null) : undefined}
              minHeight={0}
              moveFromKey={moveFromKey}
              legalForCard={
                mode === "place"
                  ? legalForSelectedCard
                  : stolenPendingCard
                    ? (pos: Axial) => placementMatchesNeighbours(selfPlayer.ecosystem, stolenPendingCard, pos)
                    : undefined
              }
              illegalReason={
                stolenPendingCard
                  ? `${stolenPendingCard.name} needs at least one neighbour that shares a Creator Type`
                  : selectedCard
                    ? `${selectedCard.name} needs at least one neighbour that shares a Creator Type`
                    : undefined
              }
              tooltipForCell={(() => {
                const cardForTip = mode === "place" ? selectedCard : stolenPendingCard;
                if (!cardForTip) return undefined;
                return (pos: Axial) =>
                  placementReason(selfPlayer.ecosystem, cardForTip, pos).text;
              })()}
            />
          </div>

          {/* Compact action chips (Undo / Disaster / Steal) */}
          <div className="flex items-center gap-1 px-2 py-1 border-t border-border/40 bg-card/30 overflow-x-auto">
            <Button size="sm" variant="outline" disabled={undoCount === 0} onClick={onUndo}
              className="h-7 px-2 text-[11px] shrink-0">
              ↶ Undo{undoCount > 0 ? ` (${undoCount})` : ""}
            </Button>
            <Button size="sm" variant="secondary" disabled={!canDisaster} onClick={onDisaster}
              className="h-7 px-2 text-[11px] shrink-0">
              Disaster
            </Button>
            <Button size="sm" variant={mode === "steal" ? "default" : "secondary"} disabled={!canSteal}
              onClick={() => { setStealVictimKey(null); setMode(mode === "steal" ? "place" : "steal"); }}
              className="h-7 px-2 text-[11px] shrink-0">
              {mode === "steal" ? "Cancel" : "Steal"}
            </Button>
            {(mode === "steal" || stealVictimKey) && (
              <div className="text-[10px] text-muted-foreground truncate flex-1 px-1">
                {stealVictimKey ? "Pick a hex on YOUR board" : "Tap an opponent's animal"}
              </div>
            )}
          </div>

          {/* Bottom hand dock */}
          <PlayerHand
            hand={selfPlayer.hand}
            selectedUid={selectedUid}
            onSelect={(uid) => setSelectedUid(uid)}
            disabled={!isYourTurn || state.phase !== "place"}
            size={62}
            stuckUids={stuckUids}
          />
        </>

      ) : (
        /* ============ DESKTOP SPLIT LAYOUT (60/40) ============ */
        <>
          <div
            className="flex-1 grid gap-2 p-2 min-h-0 overflow-hidden"
            style={{ gridTemplateColumns: `${opponentPct}fr 6px ${100 - opponentPct}fr` }}
          >

            {/* Left rail (40%): opponents */}
            <div
              className={
                "min-h-0 min-w-0 " +
                (opponents.length >= 4
                  ? "grid grid-cols-2 grid-rows-2 gap-2"
                  : "flex flex-col gap-2")
              }
            >
              {opponents.map((op) => {
                const isMulti = opponents.length >= 2;
                const hexSize = opponents.length >= 4 ? 36 : opponents.length === 3 ? 44 : isMulti ? 52 : 60;
                const opPresence = getPresenceStatusForPlayer(op.id);
                const isReconnecting = opPresence === "reconnecting";
                const isDisconnected = opPresence === "disconnected" || opPresence === "missing";
                return (
                  <Card
                    key={op.id}
                    className={
                      "p-2 flex flex-col min-h-0 min-w-0 " +
                      (isDisconnected
                        ? "ring-2 ring-destructive/60 bg-destructive/5"
                        : isReconnecting
                          ? "ring-2 ring-amber-500/60 bg-amber-500/5"
                          : "")
                    }
                  >
                    <button
                      type="button"
                      onClick={() => { setExpandedOpponentId(op.id); setOpponentPanelOpen(true); }}
                      className="w-full flex items-center justify-between gap-2 mb-1 group text-left"
                      aria-label={`Pop out ${op.name}'s ecosystem`}
                    >
                      <span className="font-display text-sm group-hover:text-foreground transition-colors min-w-0 flex flex-col items-start gap-0.5">
                        <span className="truncate max-w-full">{op.name}</span>
                        {isDisconnected && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide border border-destructive/50 bg-destructive/15 text-destructive shrink-0"
                            title="Player is disconnected"
                          >
                            <WifiOff className="w-2.5 h-2.5" /> Disconnected
                          </span>
                        )}
                        {isReconnecting && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide border border-amber-500/50 bg-amber-500/15 text-amber-300 shrink-0"
                            title="Player is reconnecting"
                          >
                            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Reconnecting
                          </span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
                        {op.ecosystem.placed.size}/16 · {op.hand.length}h <Maximize2 className="w-3 h-3" />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setExpandedOpponentId(op.id); setOpponentPanelOpen(true); }}
                      className="flex-1 min-h-0 rounded-md hover:ring-2 hover:ring-primary/40 transition-all flex items-center justify-center overflow-hidden"
                      aria-label={`Expand ${op.name}'s ecosystem`}
                    >
                      <Ecosystem eco={op.ecosystem} size={hexSize} autoFit minHeight={0} showEmpties={false} />
                    </button>
                  </Card>
                );
              })}
            </div>

            {/* Draggable split divider */}
            <div
              ref={splitDragRef}
              role="separator"
              aria-orientation="vertical"
              aria-label={`Resize opponents area (${Math.round(opponentPct)}%)`}
              onPointerDown={onSplitPointerDown}
              onDoubleClick={() => setOpponentPct(40)}
              className="group relative h-full cursor-col-resize flex items-center justify-center"
              title={`Drag to resize · double-click to reset (${Math.round(opponentPct)}%)`}
            >
              <div className="w-[2px] h-full bg-border/60 group-hover:bg-primary/60 transition-colors" />
              <div className="absolute w-2 h-10 rounded-full bg-border group-hover:bg-primary/70 transition-colors" />
            </div>


            <Card className="p-1 flex flex-col min-h-0 min-w-0 bg-transparent border-0 shadow-none">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 px-1">Your ecosystem</div>
              <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center">
                <Ecosystem
                  eco={selfPlayer.ecosystem}
                  size={110}
                  autoFit
                  selectable={isYourTurn || canUseBoard}
                  onPlace={onPlace}
                  showEmpties
                  onRotateClick={isYourTurn ? onPlacedHexClick : undefined}
                  onMoveDragStart={isYourTurn ? (posKey) => setMoveFromKey(posKey) : undefined}
                  onMoveDragEnd={isYourTurn ? () => setMoveFromKey(null) : undefined}
                  minHeight={0}
                  moveFromKey={moveFromKey}
                  legalForCard={
                    mode === "place"
                      ? legalForSelectedCard
                      : stolenPendingCard
                        ? (pos: Axial) => placementMatchesNeighbours(selfPlayer.ecosystem, stolenPendingCard, pos)
                        : undefined
                  }
                  illegalReason={
                    stolenPendingCard
                      ? `${stolenPendingCard.name} needs at least one neighbour that shares a Creator Type`
                      : selectedCard
                        ? `${selectedCard.name} needs at least one neighbour that shares a Creator Type`
                        : undefined
                  }
                  tooltipForCell={(() => {
                    const cardForTip = mode === "place" ? selectedCard : stolenPendingCard;
                    if (!cardForTip) return undefined;
                    return (pos: Axial) =>
                      placementReason(selfPlayer.ecosystem, cardForTip, pos).text;
                  })()}
                />
              </div>
            </Card>
          </div>

          {/* Bottom DOCK: left = selected card (matches opponents width) · right = hand + piles + actions */}
          <div
            className="grid gap-2 px-2 pb-2 border-t border-border/40 pt-2 bg-card/30"
            style={{ gridTemplateColumns: `${opponentPct}fr 6px ${100 - opponentPct}fr` }}
          >

            {/* Dock-left: selected card preview (sits under opponents column) */}
            <div className="min-w-0">
              {selectedBlock}
            </div>

            {/* Spacer aligned with the stage divider */}
            <div aria-hidden className="h-full" />



            {/* Dock-right: hand · piles · actions */}
            <div className="flex items-stretch gap-2 min-w-0">
              <div className="flex-1 min-w-0 rounded-lg border border-border/40 bg-card/40 backdrop-blur overflow-x-auto self-end">
                <PlayerHand
                  hand={selfPlayer.hand}
                  selectedUid={selectedUid}
                  onSelect={(uid) => setSelectedUid(uid)}
                  disabled={!isYourTurn || state.phase !== "place"}
                  size={76}
                  stuckUids={stuckUids}
                />
              </div>

              {/* Piles: Deck + Discard inline */}
              <div className="flex items-end gap-1.5 shrink-0">
                {(() => {
                  const active = needsOpeningDraw || canDrawOne;
                  const picksLeft = Math.max(0, 2 - state.drawnThisTurn);
                  const label = needsOpeningDraw
                    ? "Draw your 5"
                    : canDrawOne
                      ? `Draw 1 (${picksLeft} left)`
                      : handAtLimit
                        ? "Hand full"
                        : "Deck";
                  return (
                    <DeckTile
                      count={state.draw.length}
                      active={active}
                      label={label}
                      onClick={() => {
                        if (needsOpeningDraw) onDrawOpening();
                        else if (canDrawOne) onDrawOne();
                      }}
                    />
                  );
                })()}



                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onContextMenu={(e) => { e.preventDefault(); if (canTapDiscard && selectedUid) onDiscardUid(selectedUid); }}
                      onDragOver={(e) => {
                        if (!isYourTurn || state.phase !== "place") return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        (e.currentTarget as HTMLElement).dataset.dropTarget = "true";
                      }}
                      onDragLeave={(e) => { delete (e.currentTarget as HTMLElement).dataset.dropTarget; }}
                      onDrop={(e) => {
                        delete (e.currentTarget as HTMLElement).dataset.dropTarget;
                        const uid = e.dataTransfer.getData("text/plain");
                        if (uid) onDiscardUid(uid);
                      }}
                      className={
                        "flex flex-col items-center justify-between gap-1 w-[72px] h-[112px] rounded-md border " +
                        "px-1.5 py-1.5 text-[10px] transition " +
                        "data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-destructive/60 " +
                        (isStuck
                          ? "border-destructive bg-destructive/10 animate-pulse "
                          : canTapDiscard
                            ? "border-destructive/50 bg-destructive/5 hover:bg-destructive/10 "
                            : "border-border/60 bg-card/60 hover:bg-card/80 ")
                      }
                      aria-label="Discard pile — click to peek top card"
                    >
                      <span className="uppercase tracking-wider text-muted-foreground">Discard</span>
                      <span className="font-display text-2xl leading-none">{state.used.length}</span>
                      <span className={"font-semibold " + (canTapDiscard ? "text-destructive" : "text-muted-foreground")}>
                        {canTapDiscard ? "Drop here" : "Peek"}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" className="w-auto p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 text-center">
                      Top of discard pile
                    </div>
                    {usedTop ? (
                      <div className="flex flex-col items-center gap-1">
                        <BoardHexPiece card={usedTop} size={84} />
                        <div className="text-xs text-foreground/90 max-w-[120px] truncate text-center">
                          {usedTop.name}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1 h-7 text-[11px]"
                          disabled={!isYourTurn || state.phase !== "draw" || state.used.length === 0}
                          onClick={onPickUsed}
                        >
                          Take top card
                        </Button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic px-3 py-2">
                        Empty — nothing discarded yet
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Actions panel */}
              <div className="shrink-0 w-[160px]">
                {actionsBlock}
              </div>

            </div>
          </div>
        </>
      )}



      <MatchOverDialog state={state} onPlayAgain={onNewGame} />
      {gameSettings.prompt_player_name && <NamePrompt />}
      {modeSelectorOpen && (
        <GameModeSelector
          open
          onCancel={() => setModeSelectorOpen(false)}
          onChoose={(m, c, d) => startSoloMatch(m, c, d)}
          onChooseMultiplayer={(m, c) => createMultiplayerLobby(m, c)}
        />
      )}


      {/* Golden Hive prompt — shown to the targeted victim when an opponent
          plays a Disaster while you hold an unspent Hive. */}
      {state.pendingDisaster && state.pendingDisaster.victimId === selfSlot && (
        <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none flex justify-center px-3 pb-3 sm:pb-4">
          <div className="pointer-events-auto w-full max-w-lg rounded-xl border border-amber-400/60 bg-card/95 backdrop-blur-md shadow-2xl p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm sm:text-base leading-tight text-amber-200">
                  Use your Golden Hive Card?
                </div>
                <div className="text-[11px] sm:text-xs text-muted-foreground mt-1 leading-snug">
                  {state.players.find((p) => p.id === state.pendingDisaster!.attackerId)?.name ?? "Opponent"} played a{" "}
                  <strong className="text-foreground">{state.pendingDisaster.creator.name} Disaster</strong>. Review your ecosystem above, then choose. Activating the Hive blocks the steal but discards the Hive.
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <Button size="sm" onClick={() => onResolveDisaster(true)}>
                  Activate Now
                </Button>
                <Button size="sm" variant="outline" onClick={() => onResolveDisaster(false)}>
                  Save for Later
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameSettings.show_tutorial_overlay && <TutorialOverlay />}
      <RuleBookSheet open={ruleBookOpen} onOpenChange={setRuleBookOpen} />
      <OpponentPanel
        open={opponentPanelOpen}
        onClose={() => setOpponentPanelOpen(false)}
        player={expandedOpponent}
        opponentUserId={
          matchRow && matchRow.mode === "pvp" && expandedOpponent
            ? (() => {
                const slot = state.players.findIndex((p) => p.id === expandedOpponent.id);
                return slot === 0
                  ? matchRow.host_user_id
                  : slot === 1
                    ? matchRow.guest_user_id ?? presence.userIdForSlot(slot)
                    : presence.userIdForSlot(slot);
              })()
            : null
        }
        presenceStatus={(() => {
          if (!expandedOpponent) return null;
          return getPresenceStatusForPlayer(expandedOpponent.id);
        })()}
      />
      {/* MultiplayerLobby dialog removed in Batch B — multiplayer now flows
          through /play/lobby/:matchId. */}

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
      </>)}
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
      pendingDisaster: state.pendingDisaster ?? null,
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
        firstPickupDone: p.firstPickupDone ?? true,
        ecosystem: { placed: new Map(p.ecosystem.placed) },
      })),
      pendingDisaster: j.pendingDisaster ?? null,
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
