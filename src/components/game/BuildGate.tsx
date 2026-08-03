import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APP_BUILD_HASH, formatBuildDate } from "@/lib/buildInfo";
import { useBuildFreshness, forceUpdateReload } from "@/hooks/useBuildFreshness";

interface Props {
  children: React.ReactNode;
  /** Extra line explaining why this particular screen is gated. */
  reason?: string;
}

/**
 * HARD version gate — the ONLY place in the app that forces a refresh.
 *
 * Two clients on different builds inside one match produce contradictory
 * game states (the desync incident), so the match boundary is where we
 * insist on a current bundle. Everywhere else — dashboard, enrolment,
 * payment, browsing — is notify-only via UpdateAvailableBanner, and a player
 * already inside a live match is never gated at all: a match started on
 * build X finishes on build X.
 */
export default function BuildGate({ children, reason }: Props) {
  const { stale, latestBuildId, latestBuiltAt } = useBuildFreshness();

  if (!stale) return <>{children}</>;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-gradient-to-b from-background via-background to-primary/5">
      <Card className="w-full max-w-md p-6 text-center space-y-4 border-amber-500/50">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
          <RefreshCw className="h-6 w-6 text-amber-500" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl">A new version is available</h1>
          <p className="text-sm text-muted-foreground">
            Refresh to play.{" "}
            {reason ??
              "Everyone in a match has to be on the same version — playing on an older one causes the two boards to disagree."}
          </p>
        </div>
        <Button className="w-full" onClick={() => void forceUpdateReload()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh now
        </Button>
        <p className="text-[11px] text-muted-foreground/80">
          You have {APP_BUILD_HASH}
          {latestBuildId ? ` · latest is ${latestBuildId}` : ""}
          {latestBuiltAt ? ` (${formatBuildDate(latestBuiltAt)})` : ""}
        </p>
      </Card>
    </div>
  );
}
