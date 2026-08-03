/**
 * Multiplayer lobby page (Batch B).
 *
 * Mounted at /play/lobby/:matchId. Three lobby states are derived from the
 * match row + roster:
 *
 *   1. CREATED/WAITING — host just arrived; roster has only the host. UI
 *      shows the shareable link + 6-char code and "waiting for players".
 *   2. FILLING — invitees have joined; roster fills up to player_count.
 *      Host gets a "Begin match" button enabled once the roster is full.
 *   3. LIVE — host clicks Begin → apply-move start_lobby_match → server
 *      shuffles turn order, flips status='active', everyone navigates to
 *      /play/m/:matchId.
 *
 * Presence is read from the shared A.4 useMatchPresence hook — same channel
 * as in-match (match:{id}). We do not build a second presence layer.
 *
 * Invitees see the lobby until the host begins; we poll the match row every
 * 2s and navigate to the board the moment status flips to 'active'.
 *
 * Host left? Per spec, no host migration. The host can press "Cancel
 * lobby" → cancel_lobby_match RPC marks the match finished; invitees see
 * "Host cancelled the lobby" and a way back to /play.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Copy, Loader2, LogOut, Play as PlayIcon, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  cancelLobby,
  inviteUrl,
  loadMatch,
  type GameMatchRow,
} from "@/lib/game/persistence";
import { useMatchPresence } from "@/hooks/useMatchPresence";
import { applyMoveServer } from "@/lib/game/serverMoves";
import { supabase } from "@/integrations/supabase/client";

interface RosterEntry {
  user_id: string;
  slot: number;
  display_name: string;
}

export default function Lobby() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [row, setRow] = useState<GameMatchRow | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const isHost = !!(user && row && row.host_user_id === user.id);
  const mySeat = useMemo(() => {
    if (!user) return undefined;
    return roster.find((r) => r.user_id === user.id)?.slot;
  }, [user, roster]);

  const presence = useMatchPresence({
    matchId: matchId ?? null,
    userId: user?.id ?? null,
    seat: mySeat,
    enabled: !!matchId && !!user,
  });

  // Poll match row + roster every 2s. Cheaper than postgres_changes for the
  // short lifetime of a lobby (seconds-to-a-few-minutes).
  useEffect(() => {
    if (!matchId || authLoading) return;
    if (!user) {
      navigate(`/auth?returnTo=${encodeURIComponent(`/play/lobby/${matchId}`)}`);
      return;
    }
    let cancelled = false;

    const tick = async () => {
      try {
        const { row: r } = await loadMatch(matchId);
        if (cancelled) return;
        setRow(r);

        const { data: rosterData, error: rosterErr } = await supabase
          .from("game_match_players")
          .select("user_id, slot, display_name")
          .eq("match_id", matchId)
          .order("slot", { ascending: true });
        if (!cancelled && !rosterErr) {
          setRoster((rosterData ?? []) as RosterEntry[]);
        }

        // Status transitions →
        if (r.status === "active") {
          navigate(`/play/m/${matchId}`, { replace: true });
        } else if (r.status === "finished") {
          // Lobby cancelled (no winner means it never got past the lobby).
          if (!r.winner_user_id) {
            setError("The host cancelled this lobby.");
          } else {
            navigate(`/play/m/${matchId}`, { replace: true });
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not load lobby");
      }
    };

    void tick();
    const interval = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [matchId, user, authLoading, navigate]);

  const handleCopyLink = useCallback(async () => {
    if (!row?.invite_token) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(row.invite_token));
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy");
    }
  }, [row?.invite_token]);

  const handleCopyCode = useCallback(async () => {
    if (!row?.invite_code) return;
    try {
      await navigator.clipboard.writeText(row.invite_code);
      toast.success("Invite code copied");
    } catch {
      toast.error("Could not copy");
    }
  }, [row?.invite_code]);

  const handleStart = useCallback(async () => {
    if (!row || !matchId) return;
    setStarting(true);
    try {
      const result = await applyMoveServer(matchId, row.seq, { type: "start_lobby_match" });
      if (result.ok !== true) {
        const msg = (result as { message?: string }).message;
        toast.error(msg || "Could not start the match");
        setStarting(false);
        return;
      }
      // Status flip happens server-side; the poll will catch it and
      // navigate. Don't navigate here to avoid a race with the redirect.
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start the match");
      setStarting(false);
    }
  }, [row, matchId]);

  const handleCancel = useCallback(async () => {
    if (!matchId) return;
    if (!confirm("Cancel the lobby? Everyone will be kicked back to Play.")) return;
    setCancelling(true);
    try {
      await cancelLobby(matchId);
      navigate("/play", { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not cancel");
      setCancelling(false);
    }
  }, [matchId, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div className="max-w-sm flex flex-col gap-3 items-center">
          <h2 className="text-xl font-display">Lobby unavailable</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button onClick={() => navigate("/play")}>Back to Play</Button>
        </div>
      </div>
    );
  }

  if (!row || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Skeleton className="h-64 w-full max-w-md mx-4" />
      </div>
    );
  }

  const playerCount = row.player_count ?? 2;
  const filled = roster.length;
  const isFull = filled >= playerCount;
  // Host-start-with-2+: lobby is startable as soon as 2 players are present.
  // Empty slots are trimmed away at start by the server (commit_start_lobby),
  // so a paid host doesn't have to wait for a full 4-slot lobby to fill.
  const canStart = filled >= 2;
  const link = row.invite_token ? inviteUrl(row.invite_token) : "";

  // Render a fixed-size roster: filled slots show name + connection dot,
  // empty slots show a "waiting" placeholder.
  const slots = Array.from({ length: playerCount }, (_, i) => {
    const occupant = roster.find((r) => r.slot === i);
    if (!occupant) return { slot: i, occupant: null as RosterEntry | null };
    return { slot: i, occupant };
  });

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-gradient-to-b from-background via-background to-primary/5 flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl">
        <Card className="p-5 sm:p-6 overflow-hidden">

          <header className="mb-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">
              <Users className="h-3.5 w-3.5" /> Multiplayer lobby
            </div>
            <h1 className="font-display text-2xl">
              {canStart ? (isHost ? "Ready to start" : "Waiting for host…") : "Waiting for players…"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isHost
                ? canStart
                  ? `You can begin now with ${filled} player${filled === 1 ? "" : "s"}, or wait for up to ${playerCount}. Empty seats are removed at start.`
                  : `Share the invite. You can start once at least 2 players are in (up to ${playerCount}).`
                : "The host will begin the match shortly."}
            </p>
          </header>


          {/* Roster */}
          <section className="mb-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
              Players ({filled} / {playerCount})
            </div>
            <ul className="space-y-2">
              {slots.map(({ slot, occupant }) => {
                if (!occupant) {
                  return (
                    <li
                      key={`empty-${slot}`}
                      className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card/30 px-3 py-2 text-sm text-muted-foreground italic"
                    >
                      <span className="w-2 h-2 rounded-full bg-muted" />
                      Waiting for player {slot + 1}…
                    </li>
                  );
                }
                const status = presence.statusFor(occupant.user_id);
                const isMe = occupant.user_id === user?.id;
                const isHostSlot = slot === 0;
                const dot =
                  status === "connected"
                    ? "bg-green-500"
                    : status === "reconnecting"
                      ? "bg-yellow-500"
                      : status === "disconnected"
                        ? "bg-red-500"
                        : "bg-muted";
                return (
                  <li
                    key={occupant.user_id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm"
                  >
                    <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden />
                    <span className="font-medium text-foreground">{occupant.display_name}</span>
                    {isHostSlot && (
                      <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                        Host
                      </span>
                    )}
                    {isMe && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        you
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Invite controls (host only) */}
          {isHost && !isFull && (
            <section className="mb-5 space-y-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground font-semibold block mb-1">
                  Invite link
                </label>
                <div className="flex gap-2">
                  <Input value={link} readOnly onFocus={(e) => e.currentTarget.select()} className="min-w-0" />
                  <Button size="icon" variant="outline" className="shrink-0" onClick={handleCopyLink} aria-label="Copy invite link">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {row.invite_code && (
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground font-semibold block mb-1">
                    Or share the code
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={row.invite_code}
                      readOnly
                      onFocus={(e) => e.currentTarget.select()}
                      className="font-mono text-lg tracking-[0.3em] uppercase text-center"
                    />
                    <Button size="icon" variant="outline" className="shrink-0" onClick={handleCopyCode} aria-label="Copy invite code">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Players can join by typing this code on the Play screen.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Action row */}
          <footer className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-border">
            {isHost ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={cancelling || starting}
                >
                  {cancelling && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Cancel lobby
                </Button>
                <Button onClick={handleStart} disabled={!canStart || starting}>
                  {starting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  <PlayIcon className="w-4 h-4 mr-2" />
                  {canStart
                    ? isFull
                      ? "Begin match"
                      : `Begin with ${filled}`
                    : `Need ${2 - filled} more`}
                </Button>

              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/play")}
                >
                  <LogOut className="w-4 h-4 mr-2" /> Leave
                </Button>
                <span className="text-sm text-muted-foreground">
                  Waiting for host to begin…
                </span>
              </>
            )}
          </footer>

          <BuildStamp diagnostics={{ match: matchId ?? null }} className="pt-3" />
        </Card>
      </div>
    </div>
  );
}
