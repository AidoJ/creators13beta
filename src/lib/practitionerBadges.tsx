/**
 * Practitioner seals. The level is read server-side from the member's active
 * access (get_practitioner_badges), never from editable profile fields, and
 * the server only answers for members the caller can already see.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import seal1 from "@/assets/practitioner-seals/practitioner-level-1-seal-sm.webp.asset.json";
import seal2 from "@/assets/practitioner-seals/practitioner-level-2-seal-sm.webp.asset.json";
import seal3 from "@/assets/practitioner-seals/practitioner-level-3-seal-sm.webp.asset.json";

export type PracBadge = "l1" | "l2" | "l3" | "trainee";

export const SEALS: Record<"l1" | "l2" | "l3", { url: string; label: string }> = {
  l1: { url: seal1.url, label: "Certified Level 1 Practitioner" },
  l2: { url: seal2.url, label: "Certified Level 2 Practitioner" },
  l3: { url: seal3.url, label: "Certified Level 3 Practitioner" },
};

export function usePractitionerBadges(userIds: string[]): Record<string, PracBadge> {
  const [map, setMap] = useState<Record<string, PracBadge>>({});
  const key = [...new Set(userIds)].sort().join(",");
  useEffect(() => {
    if (!key) { setMap({}); return; }
    let cancelled = false;
    (supabase as any).rpc("get_practitioner_badges", { _user_ids: key.split(",") }).then(({ data }: any) => {
      if (cancelled) return;
      const m: Record<string, PracBadge> = {};
      for (const r of (data ?? []) as { user_id: string; badge: PracBadge }[]) m[r.user_id] = r.badge;
      setMap(m);
    });
    return () => { cancelled = true; };
  }, [key]);
  return map;
}

/** Small seal with tooltip; renders nothing for trainees or non-practitioners. */
export function PractitionerSeal({ badge, size = 28, className = "" }: { badge?: PracBadge | null; size?: number; className?: string }) {
  if (!badge || badge === "trainee") return null;
  const s = SEALS[badge];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <img src={s.url} alt={s.label} width={size} height={size} className={`inline-block drop-shadow ${className}`} style={{ width: size, height: size }} />
        </TooltipTrigger>
        <TooltipContent>{s.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
