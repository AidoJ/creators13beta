import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { billingLabel, type AccessItem } from "@/lib/accessSummary";
import { MEMBERSHIP_RANK, includedByTraining, includedLabel } from "@/lib/trainingIncludes";

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null;

/** Shared "what this person holds" list, fed by the shared status lookup. */
export default function AccessList({ items }: { items: AccessItem[] }) {
  const heldKeys = items.map((a) => a.level_key);
  const included = Object.keys(MEMBERSHIP_RANK)
    .filter((k) => !heldKeys.includes(k))
    .map((k) => ({ key: k, level: includedByTraining(k, heldKeys) }))
    .filter((x): x is { key: string; level: number } => x.level !== null)
    .sort((a, b) => MEMBERSHIP_RANK[b.key] - MEMBERSHIP_RANK[a.key]);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!included.length) return;
    supabase.from("access_levels").select("key, display_name").in("key", Object.keys(MEMBERSHIP_RANK))
      .then(({ data }) => setNames(Object.fromEntries((data ?? []).map((l) => [l.key, l.display_name]))));
  }, [included.length]);
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {included.map((x) => (
        <li key={`incl-${x.key}`} className="flex items-start justify-between gap-3 rounded-lg border-2 border-secondary bg-secondary/10 px-3 py-2">
          <p className="font-semibold text-foreground text-sm">{names[x.key] ?? ""}</p>
          <Badge variant="outline" className="text-[10px] shrink-0">{includedLabel(x.level)}</Badge>
        </li>
      ))}
      {items.map((a) => {
        const isCaseStudyConnect = a.level_key === "taster" && !!a.ends_at && !a.stripe_ref;
        return (
          <li
            key={`${a.level_key}-${a.starts_at}`}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="font-semibold text-foreground text-sm">
                {isCaseStudyConnect ? `Case Study — free access until ${fmt(a.ends_at)}` : a.display_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {isCaseStudyConnect ? (
                  <>No payment and no automatic renewal</>
                ) : (
                  <>
                    {a.starts_at && <>Since {fmt(a.starts_at)}</>}
                    {a.ends_at && <> · until {fmt(a.ends_at)}</>}
                  </>
                )}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {isCaseStudyConnect ? "Free access" : billingLabel(a.billing_shape)}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
