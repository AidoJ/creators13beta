import { Calendar, Clock, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TIER_GRADIENTS: Record<string, string> = {
  wren: "from-emerald-500/30 via-teal-500/20 to-cyan-500/30",
  robin: "from-amber-500/30 via-orange-500/20 to-rose-500/30",
  cockatoo: "from-sky-500/30 via-blue-500/20 to-indigo-500/30",
  falcon: "from-indigo-500/30 via-violet-500/20 to-fuchsia-500/30",
  owl: "from-yellow-500/30 via-amber-600/25 to-orange-700/30",
};

function extractFirstImage(html: string | null | undefined): string | null {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

export interface EventCoverProps {
  coverImageUrl?: string | null;
  coverImageFit?: "cover" | "contain" | null;
  coverImagePosition?: string | null;
  descriptionHtml?: string | null;
  tier?: string | null;
  start: Date;
  end: Date;
  isMultiDay?: boolean;
  accessBadge?: "joinable" | "preview" | "public" | null;
  cornerBadge?: React.ReactNode;
}

export function EventCover({
  coverImageUrl,
  coverImageFit,
  coverImagePosition,
  descriptionHtml,
  tier,
  start,
  end,
  isMultiDay,
  accessBadge,
  cornerBadge,
}: EventCoverProps) {
  const fmtDate = (d: Date) =>
    d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const sameDay = start.toDateString() === end.toDateString();
  const showMulti = !!isMultiDay && !sameDay;

  const img = coverImageUrl || extractFirstImage(descriptionHtml);
  const gradient = TIER_GRADIENTS[(tier || "wren").toLowerCase()] ?? TIER_GRADIENTS.wren;
  // Always contain so uploaded flyers/posters are fully visible and never crop.
  const fit = "object-contain";
  const position = coverImagePosition || "center";

  return (
    <div className="w-full">
      <div
        className="relative aspect-[16/10] w-full overflow-hidden"
      >
        {img ? (
          <img
            src={img}
            alt=""
            className={`absolute inset-0 h-full w-full ${fit}`}
            style={{ objectPosition: position }}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Calendar className="h-14 w-14 text-foreground/40" strokeWidth={1.25} />
          </div>
        )}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {cornerBadge}
          {accessBadge === "joinable" && (
            <Badge className="bg-primary/90 text-primary-foreground border-0 backdrop-blur">Joinable</Badge>
          )}
          {accessBadge === "preview" && (
            <Badge variant="outline" className="gap-1 bg-background/80 backdrop-blur">
              <Lock className="h-3 w-3" />Preview
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-2 border-t border-border/50 bg-card">
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
          <Calendar className="h-3 w-3" />
          {showMulti ? `${fmtDate(start)} – ${fmtDate(end)}` : fmtDate(start)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
          <Clock className="h-3 w-3" />
          {fmtTime(start)} – {fmtTime(end)}
        </span>
      </div>
    </div>
  );
}
