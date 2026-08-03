import { RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBuildFreshness } from "@/hooks/useBuildFreshness";
import { formatBuildDate } from "@/lib/buildInfo";

/**
 * App-wide "a new version is available" prompt.
 *
 * Phone-first beta: users leave tabs open for days and never hard-refresh, so
 * two players end up in the same match on different builds and behave
 * differently — version skew that looks like server desync. This compares the
 * running bundle against `/build.json` on load, on focus, and periodically,
 * and gives a one-tap refresh.
 */
export default function UpdateAvailableBanner() {
  const { stale, latestBuiltAt, update } = useBuildFreshness();
  const [dismissed, setDismissed] = useState(false);

  if (!stale || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[2147483000] flex items-center gap-2 border-b border-amber-500/60 bg-amber-500/95 px-3 py-2 text-[13px] text-amber-950 shadow-lg"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <RefreshCw className="h-4 w-4 shrink-0" />
      <span className="flex-1 leading-tight">
        A new version of the app is available
        {latestBuiltAt ? ` (${formatBuildDate(latestBuiltAt)})` : ""}.
      </span>
      <Button
        size="sm"
        className="h-8 bg-amber-950 text-amber-50 hover:bg-amber-900"
        onClick={() => void update()}
      >
        Refresh
      </Button>
      <button
        type="button"
        aria-label="Dismiss update notice"
        onClick={() => setDismissed(true)}
        className="p-1 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
