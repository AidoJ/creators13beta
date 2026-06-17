/**
 * Admin-only dev affordance for A.3 multiplayer testing.
 *
 * Builds the deck + N-player initial state CLIENT-SIDE using the same
 * `buildDeck` / `createMatch` / `serializeMatch` path as `handleCreatePvp`,
 * then hands the serialised state to the edge function which only validates
 * admin, persists the row, seeds the host roster, and returns N-1 join
 * links. No deck logic lives server-side.
 *
 * Deletable in one commit when Batch B ships the production lobby.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Copy, ExternalLink } from "lucide-react";

import { buildDeck, createMatch } from "@/lib/game";
import { serializeMatch } from "@/lib/game/serialize";
import { fetchAllCards, fetchSpecialCards, type GameCard, type SpecialCard } from "@/lib/gameCards";
import { fetchPlayerShortName } from "@/lib/playerName";

interface Result {
  match_id: string;
  invite_token: string;
  join_url: string;
  join_links: Array<{ label: string; url: string }>;
  player_count: number;
}

export function DevMultiplayerPanel() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [allCards, setAllCards] = useState<GameCard[] | null>(null);
  const [specialCards, setSpecialCards] = useState<SpecialCard[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchAllCards()
      .then((c) => { if (!cancelled) setAllCards(c); })
      .catch((e) => toast.error(`Card load failed: ${e.message ?? e}`));
    fetchSpecialCards()
      .then((s) => { if (!cancelled) setSpecialCards(s); })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, []);

  async function create(playerCount: 2 | 3 | 4) {
    if (!user) { toast.error("Sign in first"); return; }
    if (!allCards) { toast.error("Cards still loading"); return; }
    setBusy(true);
    setResult(null);
    try {
      const hostName = await fetchPlayerShortName(user);
      const deck = buildDeck(allCards, specialCards);

      // Build N player slots up-front so state.players.length === playerCount.
      // The host is slot 0; remaining slots are filled when guests accept the
      // invite (the edge function only inserts the host roster row).
      const players = Array.from({ length: playerCount }, (_, i) =>
        i === 0
          ? { id: "host", name: hostName }
          : { id: `guest${i}`, name: `Waiting ${i}…` },
      );
      const initial = createMatch({ deck, players });
      const state = serializeMatch(initial);

      // Sanity guard before we even ship to the edge function.
      if (state.players.length !== playerCount) {
        throw new Error(
          `Local build produced ${state.players.length} players but expected ${playerCount}`,
        );
      }

      const { data, error } = await supabase.functions.invoke("dev-create-multiplayer-match", {
        body: {
          player_count: playerCount,
          host_name: hostName,
          origin: window.location.origin,
          state,
        },
      });
      if (error) {
        // supabase-js hides the JSON body on non-2xx; recover it.
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx?.json) {
            const b = await ctx.clone().json();
            detail = b?.detail ? `${b.error}: ${b.detail}` : (b?.error ?? detail);
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      if (!data?.ok) throw new Error(data?.error ?? "create failed");
      setResult(data as Result);
      toast.success(`Created ${playerCount}-player test match`);
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to create match");
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  const cardsReady = !!allCards;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dev: Multiplayer test match (A.3)</CardTitle>
        <CardDescription>
          Admin-only bootstrap for testing 2/3/4-player ranked matches before the
          production lobby ships. Creates a match with you as host (slot 0) and
          returns N−1 join links to distribute across incognito sessions / other
          accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!cardsReady && (
          <div className="text-xs text-muted-foreground">Loading cards…</div>
        )}
        <div className="flex gap-2">
          <Button disabled={busy || !cardsReady} onClick={() => create(2)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create 2-player"}
          </Button>
          <Button disabled={busy || !cardsReady} onClick={() => create(3)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create 3-player"}
          </Button>
          <Button disabled={busy || !cardsReady} onClick={() => create(4)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create 4-player"}
          </Button>
        </div>

        {result && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4">
            <div className="text-sm">
              <strong>Match ID:</strong>{" "}
              <code className="text-xs">{result.match_id}</code>
              {" · "}
              <strong>Players:</strong> {result.player_count}
            </div>
            <div>
              <a
                href={`/play/m/${result.match_id}`}
                className="inline-flex items-center gap-1 text-sm underline"
              >
                Open your host view <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Join links (one per remaining slot — all use the same invite
                token; open each in a separate incognito session)
              </div>
              {result.join_links.map((lnk, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-16 text-xs text-muted-foreground">{lnk.label}</span>
                  <Input readOnly value={lnk.url} onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" variant="outline" onClick={() => copy(lnk.url)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
