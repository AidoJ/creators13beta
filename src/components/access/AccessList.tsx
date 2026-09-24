import { Badge } from "@/components/ui/badge";
import { billingLabel, type AccessItem } from "@/lib/accessSummary";

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null;

/** Shared "what this person holds" list, fed by the shared status lookup. */
export default function AccessList({ items }: { items: AccessItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
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
