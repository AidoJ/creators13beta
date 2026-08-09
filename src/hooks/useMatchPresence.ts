/**
 * useMatchPresence — A.4 realtime presence for a multiplayer match.
 *
 * Subscribes to a Supabase Realtime presence channel named
 * `match:{match_id}` and reports the current client's join / leave to the
 * `report-presence` edge function. The edge function only bumps
 * `last_seen_at`; the `forfeit-stale-disconnects` sweep converts silence
 * into `disconnected_at` once the server-side debounce has elapsed.
 *
 * Channel name + payload shape are deliberately stable for B (lobby) and
 * C (in-match UI) to share: both consume the same channel, just filter on
 * roster status. `ready` is unused in A.4 but reserved in the payload so
 * B's lobby flip doesn't require re-architecture.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { APP_BUILD_HASH } from "@/lib/buildInfo";
import { fetchGameSettings, DEFAULT_GAME_SETTINGS } from "@/lib/game/settings";

export type PresenceStatus = "connected" | "reconnecting" | "disconnected";

export interface PresencePayload {
  user_id: string;
  seat?: number;
  status: PresenceStatus;
  last_seen_at: string;
  /** Reserved for B's lobby — A.4 never sets this. */
  ready?: boolean;
  /** Bundle this device is running. Absent = a client older than the
   *  version gate, which is itself proof of a stale build. Used by the
   *  lobby to guarantee a single-build match before start. */
  build_id?: string;
}

/** State surfaced to consumers. Keyed by `user_id` (not seat) because the
 *  presence join key is the user; callers map to seat via the match roster. */
export interface MatchPresenceState {
  /** Map of user_id → latest presence payload from any of their devices. */
  byUser: Record<string, PresencePayload>;
  /** True after the channel has delivered at least one authoritative presence snapshot. */
  presenceSynced: boolean;
  /** Durable roster evidence from the database; survives missed realtime leave events. */
  rosterByUser: Record<string, RosterPresence>;
  /** Tracking own user as "connected" once the channel has joined. */
  selfConnected: boolean;
  /** user_id → epoch ms when we first stopped seeing them. Drives the silent
   *  ride-through window: a gap shorter than the shared debounce is NOT
   *  surfaced as "reconnecting" to anyone. */
  missingSince: Record<string, number>;
  /** Shared silent-window length in ms (game_settings.presence_debounce_seconds). */
  quietWindowMs: number;
}

interface RosterPresence {
  user_id: string;
  slot: number | null;
  status: string | null;
  last_seen_at: string | null;
  disconnected_at: string | null;
  disconnect_reason: string | null;
  idle_strikes: number | null;
}

interface Options {
  matchId: string | null | undefined;
  userId: string | null | undefined;
  seat?: number;
  /** When false (default true), don't subscribe — useful for solo bot
   *  matches where presence is meaningless. */
  enabled?: boolean;
}

export function useMatchPresence({
  matchId,
  userId,
  seat,
  enabled = true,
}: Options) {
  const [state, setState] = useState<MatchPresenceState>({
    byUser: {},
    presenceSynced: false,
    rosterByUser: {},
    selfConnected: false,
    missingSince: {},
    quietWindowMs: DEFAULT_GAME_SETTINGS.presence_debounce_seconds * 1000,
  });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const reportPresence = useCallback(
    async (event: "join" | "leave" | "heartbeat", reason?: string) => {
      if (!matchId) return;
      try {
        await supabase.functions.invoke("report-presence", {
          body: { match_id: matchId, event, reason },
        });
      } catch (e) {
        // Network blip — sweep will catch us via last_seen_at decay.
        console.warn("[presence] report failed", e);
      }
    },
    [matchId],
  );

  // ONE shared source of truth for the blip threshold: the same
  // game_settings.presence_debounce_seconds the sweep reads. No local
  // constant — the client window and the server debounce cannot drift.
  useEffect(() => {
    let alive = true;
    void fetchGameSettings().then((s) => {
      const sec = Number(s.presence_debounce_seconds);
      if (alive && Number.isFinite(sec) && sec > 0) {
        setState((prev) => ({ ...prev, quietWindowMs: sec * 1000 }));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !matchId || !userId) return;

    const channelName = `match:${matchId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    const mergeRosterRows = (rows: RosterPresence[]) => {
      setState((prev) => {
        const next = { ...prev.rosterByUser };
        for (const row of rows) next[row.user_id] = row;
        return { ...prev, rosterByUser: next };
      });
    };

    const fetchRoster = async () => {
      const { data, error } = await supabase
        .from("game_match_players")
        .select("user_id, slot, status, last_seen_at, disconnected_at, disconnect_reason, idle_strikes")
        .eq("match_id", matchId);
      if (error) {
        console.warn("[presence] roster fetch failed", error);
        return;
      }
      mergeRosterRows((data ?? []) as RosterPresence[]);
    };

    void fetchRoster();

    const projectByUser = (
      raw: Record<string, Array<PresencePayload>>,
    ): Record<string, PresencePayload> => {
      const next: Record<string, PresencePayload> = {};
      for (const [uid, entries] of Object.entries(raw)) {
        if (entries && entries.length > 0) {
          // Keep the freshest entry across devices.
          const latest = [...entries].sort(
            (a, b) =>
              new Date(b.last_seen_at).getTime() -
              new Date(a.last_seen_at).getTime(),
          )[0];
          next[uid] = latest;
        }
      }
      return next;
    };

    channel
      .on("presence", { event: "sync" }, () => {
        const raw = channel.presenceState() as Record<
          string,
          Array<PresencePayload>
        >;
        setState((prev) => {
          const byUser = projectByUser(raw);
          const now = Date.now();
          const missingSince = { ...prev.missingSince };
          // Anyone visible now has no gap in progress.
          for (const uid of Object.keys(byUser)) delete missingSince[uid];
          // Anyone rostered but absent starts (or continues) a quiet timer.
          for (const uid of Object.keys(prev.rosterByUser)) {
            if (!byUser[uid] && missingSince[uid] == null) missingSince[uid] = now;
          }
          return { ...prev, byUser, presenceSynced: true, missingSince };
        });
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        // Optimistic local merge; sync will overwrite shortly.
        setState((prev) => {
          const next = { ...prev.byUser };
          const missingSince = { ...prev.missingSince };
          for (const p of newPresences as unknown as PresencePayload[]) {
            next[p.user_id] = { ...p, status: "connected" };
            delete missingSince[p.user_id];
          }
          return { ...prev, byUser: next, missingSince };
        });
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        setState((prev) => {
          const next = { ...prev.byUser };
          const missingSince = { ...prev.missingSince };
          const now = Date.now();
          for (const p of leftPresences as unknown as PresencePayload[]) {
            if (next[p.user_id]) {
              next[p.user_id] = { ...next[p.user_id], status: "reconnecting" };
            }
            // Start the quiet timer. statusFor() keeps reporting "connected"
            // until it exceeds the shared debounce window.
            if (missingSince[p.user_id] == null) missingSince[p.user_id] = now;
          }
          return { ...prev, byUser: next, missingSince };
        });
      });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const payload: PresencePayload = {
          user_id: userId,
          seat,
          status: "connected",
          last_seen_at: new Date().toISOString(),
          build_id: APP_BUILD_HASH,
        };
        await channel.track(payload);
        setState((prev) => ({ ...prev, selfConnected: true }));
        void reportPresence("join");
        void fetchRoster();
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reportPresence("heartbeat");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Signal came back: re-report presence and re-read the roster immediately
    // instead of waiting for the next 10s heartbeat / 5s poll. The realtime
    // socket reconnects itself; this makes the DB-side evidence catch up in
    // the same beat so no player action is ever required.
    const handleOnline = () => {
      void reportPresence("heartbeat");
      void fetchRoster();
      // Re-track presence on the (possibly rebuilt) socket.
      void channel.track({
        user_id: userId,
        seat,
        status: "connected",
        last_seen_at: new Date().toISOString(),
        build_id: APP_BUILD_HASH,
      } satisfies PresencePayload);
    };
    window.addEventListener("online", handleOnline);

    // Heartbeat every 10s — MUST be well under presence_debounce_seconds
    // (default 15s) or the sweep's stamp step will false-positive a
    // connected idle player as disconnected between heartbeats. 10s gives
    // 1 retry headroom before debounce expires.
    const heartbeat = window.setInterval(() => {
      void reportPresence("heartbeat");
    }, 10_000);

    // Poll durable roster evidence too: publication/realtime can lag or be
    // unavailable, but the UI must still surface reconnect/disconnected state.
    const rosterPoll = window.setInterval(() => {
      void fetchRoster();
    }, 5_000);

    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(rosterPoll);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      void reportPresence("leave", "unmount");
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [matchId, userId, seat, enabled, reportPresence]);

  const helpers = useMemo(() => {
    const quiet = state.quietWindowMs;

    /** True while a gap is still inside the shared silent-window: most
     *  cellular handoffs resolve here and must be a complete no-op — no
     *  spinner, no copy change, nothing for either player. */
    const inQuietWindow = (uid: string): boolean => {
      const since = state.missingSince[uid];
      if (since == null) return false;
      return Date.now() - since < quiet;
    };

    const statusFor = (uid: string | null | undefined): PresenceStatus | "missing" | null => {
      if (!uid) return null;
      const live = state.byUser[uid]?.status;
      const roster = state.rosterByUser[uid];

      if (roster?.disconnected_at) return "disconnected";
      if (live === "connected") return "connected";

      // SILENT RIDE-THROUGH: within the quiet window a rostered player who
      // has briefly vanished still reads as connected.
      if (roster && inQuietWindow(uid)) return "connected";

      if (live === "reconnecting") return "reconnecting";
      if (roster?.disconnect_reason) return "reconnecting";

      // Immediate visual disconnect state must come from live Realtime
      // presence, not from disconnected_at. disconnected_at is only stamped
      // later by the grace-period sweep; after the channel has synced, a
      // rostered player missing from the live presence snapshot is currently
      // away/reconnecting even while disconnected_at is still null.
      if (state.presenceSynced && roster && !live) return "reconnecting";

      // If DB evidence is stale but the sweep has not stamped
      // disconnected_at yet, show reconnecting rather than silence. The
      // threshold is derived from the shared debounce (2x) rather than a
      // second hard-coded constant.
      const lastSeen = roster?.last_seen_at ? Date.parse(roster.last_seen_at) : NaN;
      if (Number.isFinite(lastSeen) && Date.now() - lastSeen > quiet * 2) return "reconnecting";

      if (live) return live;
      return "missing";
    };
    const isConnected = (uid: string | null | undefined) => statusFor(uid) === "connected";
    const isReconnecting = (uid: string | null | undefined) => statusFor(uid) === "reconnecting";
    const isDisconnected = (uid: string | null | undefined) => statusFor(uid) === "disconnected";
    const isMissing = (uid: string | null | undefined) => statusFor(uid) === "missing";
    const userIdForSlot = (slot: number | null | undefined): string | null => {
      if (slot == null) return null;
      return Object.values(state.rosterByUser).find((row) => row.slot === slot)?.user_id ?? null;
    };
    const buildFor = (uid: string | null | undefined): string | null => {
      if (!uid) return null;
      return state.byUser[uid]?.build_id ?? null;
    };
    const strikesFor = (uid: string | null | undefined): number => {
      if (!uid) return 0;
      return Number(state.rosterByUser[uid]?.idle_strikes ?? 0);
    };
    const isDeparted = (uid: string | null | undefined): boolean => {
      if (!uid) return false;
      return state.rosterByUser[uid]?.disconnect_reason === "idle_departed";
    };
    const disconnectedAtFor = (uid: string | null | undefined): number | null => {
      if (!uid) return null;
      const raw = state.rosterByUser[uid]?.disconnected_at;
      if (!raw) return null;
      const t = Date.parse(raw);
      return Number.isFinite(t) ? t : null;
    };
    return { statusFor, buildFor, userIdForSlot, isConnected, isReconnecting, isDisconnected, isMissing, strikesFor, isDeparted, disconnectedAtFor };
    // `tick` is a deliberate dependency: statusFor is time-sensitive (the
    // quiet window expires on the clock, not on an event), so the memo must
    // be recomputed periodically while a gap is open.
  }, [state.byUser, state.presenceSynced, state.rosterByUser, state.missingSince, state.quietWindowMs, tick]);


  return { ...state, ...helpers };
}
