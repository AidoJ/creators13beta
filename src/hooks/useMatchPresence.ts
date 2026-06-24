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

export type PresenceStatus = "connected" | "reconnecting" | "disconnected";

export interface PresencePayload {
  user_id: string;
  seat?: number;
  status: PresenceStatus;
  last_seen_at: string;
  /** Reserved for B's lobby — A.4 never sets this. */
  ready?: boolean;
}

/** State surfaced to consumers. Keyed by `user_id` (not seat) because the
 *  presence join key is the user; callers map to seat via the match roster. */
export interface MatchPresenceState {
  /** Map of user_id → latest presence payload from any of their devices. */
  byUser: Record<string, PresencePayload>;
  /** Tracking own user as "connected" once the channel has joined. */
  selfConnected: boolean;
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
    selfConnected: false,
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

  useEffect(() => {
    if (!enabled || !matchId || !userId) return;

    const channelName = `match:${matchId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

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
        setState((prev) => ({
          ...prev,
          byUser: projectByUser(raw),
        }));
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        // Optimistic local merge; sync will overwrite shortly.
        setState((prev) => {
          const next = { ...prev.byUser };
          for (const p of newPresences as unknown as PresencePayload[]) {
            next[p.user_id] = { ...p, status: "connected" };
          }
          return { ...prev, byUser: next };
        });
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        setState((prev) => {
          const next = { ...prev.byUser };
          for (const p of leftPresences as unknown as PresencePayload[]) {
            if (next[p.user_id]) {
              next[p.user_id] = { ...next[p.user_id], status: "reconnecting" };
            }
          }
          return { ...prev, byUser: next };
        });
      });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const payload: PresencePayload = {
          user_id: userId,
          seat,
          status: "connected",
          last_seen_at: new Date().toISOString(),
        };
        await channel.track(payload);
        setState((prev) => ({ ...prev, selfConnected: true }));
        void reportPresence("join");
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reportPresence("heartbeat");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Heartbeat every 20s so the sweep keeps last_seen_at fresh even when
    // realtime is quiet (idle players). Cheap relative to the sweep cadence.
    const heartbeat = window.setInterval(() => {
      void reportPresence("heartbeat");
    }, 20_000);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void reportPresence("leave", "unmount");
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [matchId, userId, seat, enabled, reportPresence]);

  const helpers = useMemo(() => {
    const isConnected = (uid: string | null | undefined) =>
      !!uid && state.byUser[uid]?.status === "connected";
    const isReconnecting = (uid: string | null | undefined) =>
      !!uid && state.byUser[uid]?.status === "reconnecting";
    const isMissing = (uid: string | null | undefined) =>
      !!uid && !state.byUser[uid];
    return { isConnected, isReconnecting, isMissing };
  }, [state.byUser]);

  return { ...state, ...helpers };
}
