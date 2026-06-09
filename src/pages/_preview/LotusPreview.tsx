/**
 * Developer preview for the LotusProfile component.
 * Reachable via /_preview/lotus during development.
 */
import LotusProfile, { LotusCreatorType, FeaturedHighlight } from "@/components/community/LotusProfile";
import { getCreatorTypeColor } from "@/lib/creatorTypes";

const SIZES = ["sm", "md", "lg", "xl"] as const;

type Example = {
  label: string;
  description: string;
  avatarUrl: string | null;
  displayName: string;
  creatorTypes: LotusCreatorType[];
  featuredHighlight?: FeaturedHighlight;
  featuredColor?: string;
};

const EXAMPLES: Example[] = [
  {
    label: "1 type — self-selected (Lava)",
    description: "Right cardinal only · muted glyph with outline ring",
    avatarUrl: null,
    displayName: "Ari Self",
    creatorTypes: [{ type: "Lava", source: "self_selected" }],
  },
  {
    label: "1 type — officially profiled (Snow)",
    description: "Right cardinal only · solid glyph, no ring",
    avatarUrl: null,
    displayName: "Sam Snow",
    creatorTypes: [{ type: "Snow", source: "practitioner" }],
  },
  {
    label: "2 types — Lava + Ocean",
    description: "Right + left cardinals (horizontal axis)",
    avatarUrl: null,
    displayName: "Pair",
    creatorTypes: [
      { type: "Lava", source: "practitioner" },
      { type: "Ocean", source: "practitioner" },
    ],
  },
  {
    label: "3 types — Lava + Ocean + Tree",
    description: "Right + left + top",
    avatarUrl: null,
    displayName: "Trio",
    creatorTypes: [
      { type: "Lava", source: "practitioner" },
      { type: "Ocean", source: "practitioner" },
      { type: "Tree", source: "practitioner" },
    ],
  },
  {
    label: "4 types — all cardinals filled",
    description: "Lava + Ocean + Tree + Whirlwind",
    avatarUrl: null,
    displayName: "Quad",
    creatorTypes: [
      { type: "Lava", source: "practitioner" },
      { type: "Ocean", source: "practitioner" },
      { type: "Tree", source: "practitioner" },
      { type: "Whirlwind", source: "practitioner" },
    ],
  },
  {
    label: "Sky as primary (wildcard)",
    description: "Sky has no family colour — neutral gold fill",
    avatarUrl: null,
    displayName: "Sky Walker",
    creatorTypes: [{ type: "Sky", source: "practitioner" }],
  },
  {
    label: "No avatar (silhouette fallback)",
    description: "Centre shows person silhouette, never an initial letter",
    avatarUrl: null,
    displayName: "Anon",
    creatorTypes: [
      { type: "Mountain", source: "practitioner" },
      { type: "River", source: "practitioner" },
    ],
  },
  {
    label: "Featured highlight (a) — soft glow",
    description: "Outer drop-shadow in the featured family colour",
    avatarUrl: null,
    displayName: "Featured Glow",
    creatorTypes: [
      { type: "Lava", source: "practitioner" },
      { type: "Ocean", source: "practitioner" },
    ],
    featuredHighlight: "glow",
    featuredColor: getCreatorTypeColor("Lava"),
  },
  {
    label: "Featured highlight (b) — additional gold ring",
    description: "Subtle gold ring just outside the lotus outline",
    avatarUrl: null,
    displayName: "Featured Ring",
    creatorTypes: [
      { type: "Lava", source: "practitioner" },
      { type: "Ocean", source: "practitioner" },
    ],
    featuredHighlight: "ring",
  },
];

export default function LotusPreview() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-100 via-amber-50 to-sky-100 text-foreground p-8">
      <header className="mb-10 max-w-3xl">
        <h1 className="font-display text-4xl mb-2">LotusProfile preview</h1>
        <p className="text-muted-foreground">
          Dev-only. Background is intentionally tinted so you can verify the diagonal
          petals are transparent (background shows through).
        </p>
      </header>

      <div className="space-y-12">
        {EXAMPLES.map((ex) => (
          <section key={ex.label} className="border-t border-border/60 pt-6">
            <h2 className="font-display text-xl mb-1">{ex.label}</h2>
            <p className="text-sm text-muted-foreground mb-6">{ex.description}</p>
            <div className="flex flex-wrap items-end gap-10">
              {SIZES.map((size) => (
                <div key={size} className="flex flex-col items-center gap-2">
                  <LotusProfile
                    avatarUrl={ex.avatarUrl}
                    displayName={ex.displayName}
                    creatorTypes={ex.creatorTypes}
                    size={size}
                    featuredHighlight={ex.featuredHighlight ?? null}
                    featuredColor={ex.featuredColor}
                  />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    {size}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
