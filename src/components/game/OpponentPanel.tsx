import { useEffect, useRef, useState } from "react";
import { GripHorizontal, X, Trophy, Bot, WifiOff, Loader2 } from "lucide-react";
import { Ecosystem } from "@/components/game/Ecosystem";
import type { PlayerState } from "@/lib/game/types";
import { supabase } from "@/integrations/supabase/client";
import type { PresenceStatus } from "@/hooks/useMatchPresence";

interface OpponentPanelProps {
  open: boolean;
  onClose: () => void;
  player: PlayerState | null;
  /** When set (PvP only), the panel fetches public stats (ELO + bot wins) for the opponent. */
  opponentUserId?: string | null;
  /** A.4 — realtime presence indicator. Omit for solo bot matches. */
  presenceStatus?: PresenceStatus | "missing" | null;
  /** When provided, opponent's placed animals become tappable (used during Sky-Creature
   *  steal mode on mobile, where the opponent's board is only visible in this panel). */
  onStealClick?: (posKey: string) => void;
  /** Optional banner text shown at the top of the panel (e.g. "Tap an animal to steal"). */
  banner?: string | null;
}

interface PublicStats {
  elo: number;
  total_bot_wins: number;
}

/**
 * Floating, draggable + resizable panel for previewing another player's ecosystem.
 * Drag the header to move; drag the bottom-right grip to resize.
 */
export function OpponentPanel({ open, onClose, player, opponentUserId, presenceStatus, onStealClick, banner }: OpponentPanelProps) {
  const [stats, setStats] = useState<PublicStats | null>(null);
  useEffect(() => {
    setStats(null);
    if (!open || !opponentUserId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_public_player_stats", { _user_id: opponentUserId });
      if (cancelled || error || !data?.length) return;
      const row = data[0] as any;
      setStats({ elo: row.elo ?? 1000, total_bot_wins: Number(row.total_bot_wins ?? 0) });
    })();
    return () => { cancelled = true; };
  }, [open, opponentUserId]);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 120, y: 100 });
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 640, h: 560 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null);
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  // Fit and re-clamp on open, rotation, and viewport resize so every control
  // remains reachable on phones, foldables, and tablets.
  useEffect(() => {
    if (!open) return;
    const fit = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setSize((current) => {
        const w = Math.min(current.w, 640, Math.max(280, vw - 16));
        const h = Math.min(current.h, 560, Math.max(240, vh - 16));
        setPos((currentPos) => ({
          x: Math.max(8, Math.min(currentPos.x, vw - w - 8)),
          y: Math.max(8, Math.min(currentPos.y, vh - h - 8)),
        }));
        return { w, h };
      });
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (dragRef.current) {
        setPos({
          x: Math.max(8, Math.min(window.innerWidth - size.w - 8, e.clientX - dragRef.current.dx)),
          y: Math.max(8, Math.min(window.innerHeight - size.h - 8, e.clientY - dragRef.current.dy)),
        });
      } else if (resizeRef.current) {
        const r = resizeRef.current;
        setSize({
          w: Math.max(280, Math.min(window.innerWidth - pos.x - 8, r.sw + (e.clientX - r.sx))),
          h: Math.max(240, Math.min(window.innerHeight - pos.y - 8, r.sh + (e.clientY - r.sy))),
        });
      }
    }
    function onUp() {
      dragRef.current = null;
      resizeRef.current = null;
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [pos.x, pos.y, size.w, size.h]);

  if (!open || !player) return null;
  const placed = player.ecosystem.placed.size;

  // Scale tiles to fit available space (rough heuristic).
  const tileSize = Math.max(36, Math.min(96, Math.floor((size.w - 48) / 10)));

  return (
    <div
      role="dialog"
      aria-label={`${player.name}'s ecosystem`}
      className="fixed z-50 rounded-lg border border-border bg-background shadow-2xl flex flex-col overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!t) return;
        swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        const s = swipeRef.current;
        swipeRef.current = null;
        const t = e.changedTouches[0];
        if (!s || !t) return;
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        const dt = Date.now() - s.t;
        // Swipe left: >60px horizontal, dominant axis, under 700ms.
        if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 700) onClose();
      }}
    >
      <div
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
            document.body.style.userSelect = "none";
          }
        }}
        onTouchEnd={(e) => {
          // Double-tap to close (touch path — independent of pointer/drag).
          if (e.changedTouches.length === 0) return;
          const now = Date.now();
          if (now - lastTapRef.current < 400) {
            e.preventDefault();
            onClose();
            lastTapRef.current = 0;
          } else {
            lastTapRef.current = now;
          }
        }}
        onDoubleClick={onClose}
        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/80 cursor-grab active:cursor-grabbing select-none touch-manipulation"
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap pointer-events-none">
          <GripHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="font-display text-base truncate">{player.name}</div>
          <div className="text-xs text-muted-foreground shrink-0">
            · {placed} placed · {player.hand.length} in hand
          </div>
          {stats && (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-secondary/40 bg-secondary/10 text-secondary-foreground">
                <Trophy className="w-3 h-3" /> ELO {stats.elo}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-border bg-card text-muted-foreground">
                <Bot className="w-3 h-3" /> {stats.total_bot_wins} bot win{stats.total_bot_wins === 1 ? "" : "s"}
              </span>
            </>
          )}
          {presenceStatus === "reconnecting" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-300">
              <Loader2 className="w-3 h-3 animate-spin" /> Connection issue — waiting…
            </span>
          )}
          {presenceStatus === "disconnected" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-destructive/40 bg-destructive/10 text-destructive">
              <WifiOff className="w-3 h-3" /> Disconnected
            </span>
          )}
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onClick={onClose}
          aria-label="Close"
          className="p-3 -m-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-manipulation pointer-events-auto"
        >
          <X className="w-6 h-6" />
        </button>
      </div>



      {banner && (
        <div className="px-3 py-1.5 border-b border-primary/40 bg-primary/10 text-primary text-xs font-semibold text-center">
          {banner}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden p-2 sm:p-3 flex items-stretch justify-stretch">
        <Ecosystem
          eco={player.ecosystem}
          size={tileSize}
          autoFit
          showEmpties={false}
          onStealClick={onStealClick}
        />
      </div>

      <div
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          resizeRef.current = { sx: e.clientX, sy: e.clientY, sw: size.w, sh: size.h };
          document.body.style.userSelect = "none";
        }}
        className="absolute bottom-0 right-0 min-w-11 min-h-11 cursor-nwse-resize flex items-end justify-end p-2"
        aria-label="Resize"
      >
        <div className="w-3 h-3 border-r-2 border-b-2 border-muted-foreground/60" />
      </div>
    </div>
  );
}
