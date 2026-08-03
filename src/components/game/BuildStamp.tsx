import { useState } from "react";
import { Copy, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { APP_BUILD_HASH, APP_BUILT_AT, formatBuildDate } from "@/lib/buildInfo";
import { useBuildFreshness } from "@/hooks/useBuildFreshness";

interface Props {
  /** Extra diagnostics copied alongside the build id (match id, user id…). */
  diagnostics?: Record<string, string | number | null | undefined>;
  className?: string;
}

/**
 * Version + date stamp with an "update available" prompt.
 *
 * Shown on the screens a player starts from, so the first question after any
 * bug report — "are you even on the latest build?" — is answerable at a glance
 * rather than guessed at.
 */
export default function BuildStamp({ diagnostics, className }: Props) {
  const { latestBuildId, latestBuiltAt, stale, update } = useBuildFreshness();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const lines = [
      `build: ${APP_BUILD_HASH}`,
      `built: ${formatBuildDate(APP_BUILT_AT)}`,
      latestBuildId ? `deployed: ${latestBuildId}` : null,
      ...Object.entries(diagnostics ?? {})
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k}: ${v}`),
      `agent: ${navigator.userAgent}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Version details copied — paste them into your bug report");
    } catch {
      toast.error("Couldn't copy — build " + APP_BUILD_HASH);
    }
  };

  return (
    <div className={"space-y-2 " + (className ?? "")}>
      {stale && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 min-w-[10rem]">
            A newer version of the game is available
            {latestBuiltAt ? ` (${formatBuildDate(latestBuiltAt)})` : ""}.
          </span>
          <Button size="sm" className="h-8" onClick={() => void update()}>
            Update now
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy version details"
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80 hover:text-foreground transition min-h-8"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        <span className="tabular-nums">
          Version {APP_BUILD_HASH} · {formatBuildDate(APP_BUILT_AT)}
        </span>
        {!stale && latestBuildId && <span className="text-green-600">· up to date</span>}
      </button>
    </div>
  );
}
