/**
 * Developer preview for the LotusProfile component. Renders every state at
 * every size. Not linked from anywhere in the UI; reachable only via the
 * /_preview/lotus URL during development.
 */
import LotusProfile, { LotusCreatorType } from "@/components/community/LotusProfile";

const SIZES = ["sm", "md", "lg", "xl"] as const;

type Example = {
  label: string;
  description: string;
  avatarUrl: string | null;
  displayName: string;
  creatorTypes: LotusCreatorType[];
  matchScore?: number;
};

const EXAMPLES: Example[] = [
  {
    label: "Self-selected (Lava)",
    description: "One type, self_selected → outlined muted petal",
    avatarUrl: null,
    displayName: "Ari Self",
    creatorTypes: [{ type: "Lava", source: "self_selected" }],
  },
  {
    label: "Officially Profiled — Partial (Snow)",
    description: "One type, source=practitioner → filled coloured petal",
    avatarUrl: null,
    displayName: "Sam Snow",
    creatorTypes: [{ type: "Snow", source: "practitioner" }],
  },
  {
    label: "Officially Profiled — Full (4 families)",
    description: "Lava + Ocean + Tree + Whirlwind — one per family",
    avatarUrl: null,
    displayName: "Quad Member",
    creatorTypes: [
      { type: "Lava", source: "practitioner" },
      { type: "Ocean", source: "practitioner" },
      { type: "Tree", source: "practitioner" },
      { type: "Whirlwind", source: "practitioner" },
    ],
    matchScore: 8,
  },
  {
    label: "Sky-as-primary (wildcard)",
    description: "Sky has no family — renders in neutral gold",
    avatarUrl: null,
    displayName: "Sky Walker",
    creatorTypes: [{ type: "Sky", source: "practitioner" }],
  },
  {
    label: "No avatar fallback",
    description: "Initials shown when avatar_url is null",
    avatarUrl: null,
    displayName: "",
    creatorTypes: [],
  },
];

export default function LotusPreview() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <header className="mb-10 max-w-3xl">
        <h1 className="font-display text-4xl mb-2">LotusProfile preview</h1>
        <p className="text-muted-foreground">
          Dev-only. Renders every state at sm (60), md (100), lg (160) and xl (240) px.
        </p>
      </header>

      <div className="space-y-12">
        {EXAMPLES.map((ex) => (
          <section key={ex.label} className="border-t border-border pt-6">
            <h2 className="font-display text-xl mb-1">{ex.label}</h2>
            <p className="text-sm text-muted-foreground mb-6">{ex.description}</p>
            <div className="flex flex-wrap items-end gap-10">
              {SIZES.map((size) => (
                <div key={size} className="flex flex-col items-center gap-2">
                  <LotusProfile
                    avatarUrl={ex.avatarUrl}
                    displayName={ex.displayName}
                    creatorTypes={ex.creatorTypes}
                    matchScore={ex.matchScore}
                    size={size}
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
