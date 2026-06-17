/**
 * Admin-only dev affordance for A.3 multiplayer testing.
 *
 * Creates a ranked PvP match with 2/3/4 player slots and returns N-1 join
 * links the admin can distribute across incognito sessions for live
 * end-to-end testing. Deletable in one commit when Batch B ships the
 * production lobby.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Copy, ExternalLink } from "lucide-react";

interface Result {
  match_id: string;
  invite_token: string;
  join_url: string;
  join_links: Array<{ label: string; url: string }>;
  player_count: number;
}

export function DevMultiplayerPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function create(playerCount: 2 | 3 | 4) {
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("dev-create-multiplayer-match", {
        body: {
          player_count: playerCount,
          origin: window.location.origin,
        },
      });
      if (error) throw error;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dev: Multiplayer test match (A.3)</CardTitle>
        <CardDescription>
          Admin-only bootstrap for testing 2/3/4-player ranked matches before the
          production lobby ships. Creates a match with you as host and returns
          N−1 join links to distribute across incognito sessions / other accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => create(2)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create 2-player"}
          </Button>
          <Button disabled={busy} onClick={() => create(3)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create 3-player"}
          </Button>
          <Button disabled={busy} onClick={() => create(4)}>
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
                href={`/play/${result.match_id}`}
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
