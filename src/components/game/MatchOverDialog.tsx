import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trophy, Eye } from "lucide-react";
import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { glyphForType } from "@/lib/game/glyphs";
import { Ecosystem } from "@/components/game/Ecosystem";
import type { MatchState, PlayerState, PlacedCard } from "@/lib/game/types";
import { playerTotalScore } from "@/lib/game/types";
import { validateEcosystemWin } from "@/lib/game/engine";
import { TYPE_TO_ELEMENT } from "@/lib/game/elements";
import { keyOf, neighbours } from "@/lib/game/board";
import { creatorTypeCode } from "@/lib/creatorTypeCode";


function buildWinReason(state: MatchState, winner: PlayerState): { headline: string; detail: string } {
  const eco = validateEcosystemWin(winner);
  const score = playerTotalScore(winner);
  const moves = state.turnNumber;
  let creators = 0;
  let animals = 0;
  for (const pc of winner.ecosystem.placed.values()) {
    if (pc.card.kind === "creator" || pc.card.kind === "sky_creator") creators++;
    else animals++;
  }
  if (eco.valid) {
    return {
      headline: "Completed a valid ecosystem",
      detail: `${winner.name} placed all 16 cards (4 Creators + 12 Animals) on ${score} pts in ${moves} moves.`,
    };
  }
  if (state.gameMode === "first_to_50") {
    const target = state.gameConfig?.targetScore ?? 50;
    return {
      headline: `First to ${target} points`,
      detail: `${winner.name} was the first to ${score} points in ${moves} moves.`,
    };
  }
  if (state.gameMode === "beat_clock") {
    const mins = state.gameConfig?.matchMinutes;
    return {
      headline: mins ? `End of ${mins} minute timer` : "End of timer",
      detail: `${winner.name}'s score of ${score} points wins in ${moves} moves.`,
    };
  }
  return {
    headline: "Highest score at match end",
    detail: `${winner.name} led with ${score} pts (${creators}/4 Creators, ${animals}/12 Animals) in ${moves} moves.`,
  };
}

interface Props {
  state: MatchState;
  onPlayAgain: () => void;
}

export function MatchOverDialog({ state, onPlayAgain }: Props) {
  const navigate = useNavigate();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = state.finished && !dismissed;
  const isDraw = state.finished && state.winnerId == null;
  const winner = state.players.find((p) => p.id === state.winnerId) ?? state.players[0];

  return (
    <>
      <Dialog open={open && !reviewOpen} onOpenChange={(o) => { if (!o) setDismissed(true); }}>

        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-4 gap-2">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Trophy className="w-5 h-5 text-amber-500" />
              {isDraw ? "It's a draw!" : `Congratulations ${winner.name} — You Win!`}
            </DialogTitle>
            <DialogDescription className="text-xs leading-snug">
              {isDraw ? (
                <span>
                  <span className="font-semibold text-foreground">Both piles emptied before anyone completed a valid ecosystem.</span>{" "}
                  Each player earns half points toward their profile.
                </span>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{buildWinReason(state, winner).headline}.</span>{" "}
                  {buildWinReason(state, winner).detail}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            <div className="grid sm:grid-cols-2 gap-2">
              {orderedPlayers(state).map(({ player, rank }) => (
                <PlayerBreakdown
                  key={player.id}
                  player={player}
                  winner={!isDraw && player.id === state.winnerId}
                  rank={rank}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2 border-t border-border/40">
            <Button size="sm" variant="outline" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
            <Button size="sm" variant="outline" onClick={() => setReviewOpen(true)}>
              <Eye className="w-4 h-4 mr-1.5" /> Review boards
            </Button>
            <Button size="sm" onClick={onPlayAgain}>Play again</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open && reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4 gap-2">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Review final boards</DialogTitle>
            <DialogDescription>
              See how each player built (or didn't build) their ecosystem.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue={state.players[0]?.id} className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-full shrink-0">
              {state.players.map((p) => (
                <TabsTrigger key={p.id} value={p.id} className="flex-1">
                  {p.name}{p.id === state.winnerId ? " 🏆" : ""}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex-1 overflow-y-auto mt-2">
              {orderedPlayers(state).map(({ player, rank }) => (
                <TabsContent key={player.id} value={player.id} className="mt-0">
                  <PlayerBreakdown player={player} winner={player.id === state.winnerId} rank={rank} />
                  <div className="mt-3 rounded-lg border border-border/60 bg-card/40 p-2 overflow-auto">
                    <Ecosystem eco={player.ecosystem} size={56} showEmpties={false} minHeight={320} />
                  </div>
                </TabsContent>
              ))}
            </div>
          </Tabs>
          <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
            <Button size="sm" variant="outline" onClick={() => setReviewOpen(false)}>Back to results</Button>
            <Button size="sm" onClick={onPlayAgain}>Play again</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const CANONICAL_ORDER = ["Lava","Fire","Whirlwind","Snow","Lightning","Sun","Lake","Ocean","Tree","Mountain","Soil","River","Sky"] as const;

type SlotAnimal = { pc: PlacedCard; shared: boolean };

type CreatorSlot = {
  placed: PlacedCard;
  isSky: boolean;
  /** Type label for this slot (creator's displayType, or for Sky the type it subs for). */
  slotType: string;
  /** Element this slot covers (Earth/Fire/Air/Water/Sky). */
  element: string;
  /** Animals assigned to this slot, counted by Creator Type. */
  animalsByType: Map<string, number>;
  /** Actual animal cards assigned to this slot, for human-readable listing. */
  animalsList: SlotAnimal[];
  animalCount: number;
  /** Golden Body animals adjacent to this Creator. */
  goldenBodyCount: number;
};

function TypeChip({
  type,
  role,
  n,
  subbed = false,
  shared = false,
  bgOverride,
  outlineColor,
  label,
}: {
  type: string;
  role: "Creator" | "Animal" | "Sub";
  n: number;
  subbed?: boolean;
  shared?: boolean;
  bgOverride?: string;
  outlineColor?: string;
  label?: string;
}) {
  const color = bgOverride ?? CREATOR_TYPE_COLORS[type as keyof typeof CREATOR_TYPE_COLORS] ?? "#888";
  const glyph = glyphForType(type);
  const style: React.CSSProperties = { background: color };
  if (outlineColor) {
    style.outline = `1.5px solid ${outlineColor}`;
    style.outlineOffset = "-2px";
  }
  return (
    <div
      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={style}
      title={`${role} · ${label ?? type}: ${n}${subbed ? " (Sky subbed)" : ""}${shared ? " (shared with another Creator)" : ""}`}
    >
      {glyph && <img src={glyph} alt="" className="w-3 h-3 object-contain" />}
      <span className="opacity-80">{role}</span>
      <span>{label ?? type}</span>
      <span className="opacity-80">×{n}</span>
      {shared && <span className="opacity-90 ml-0.5">↔</span>}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function orderedPlayers(state: MatchState): Array<{ player: PlayerState; rank: number | null }> {
  const rankById = new Map<string, number>();
  for (const pl of state.placements ?? []) rankById.set(pl.playerId, pl.rank);
  const total = state.players.length;
  return state.players
    .map((p) => ({ player: p, rank: rankById.get(p.id) ?? null }))
    .sort((a, b) => (a.rank ?? total + 1) - (b.rank ?? total + 1));
}

function PlayerBreakdown({ player, winner, rank }: { player: PlayerState; winner: boolean; rank?: number | null }) {
  const data = useMemo(() => {
    const placedList = Array.from(player.ecosystem.placed.values());
    const creators: PlacedCard[] = [];
    const animals: PlacedCard[] = [];
    let goldenBodyCount = 0;
    for (const pc of placedList) {
      const k = pc.card.kind;
      if (k === "creator" || k === "sky_creator") creators.push(pc);
      else {
        if (k === "golden_body") goldenBodyCount++;
        animals.push(pc);
      }
    }

    // Build slots from each placed creator
    const slots: CreatorSlot[] = creators.map((pc) => ({
      placed: pc,
      isSky: pc.card.kind === "sky_creator",
      slotType: pc.card.displayType ?? (pc.card.kind === "sky_creator" ? "Sky" : "Sky"),
      element: pc.card.element
        ? String(pc.card.element)
        : pc.card.displayType
        ? String(TYPE_TO_ELEMENT[pc.card.displayType] ?? "Sky")
        : "Sky",
      animalsByType: new Map(),
      animalsList: [],
      animalCount: 0,
      goldenBodyCount: 0,
    }));

    const slotByKey = new Map<string, CreatorSlot>();
    for (const s of slots) slotByKey.set(keyOf(s.placed.pos), s);

    // Cards not adjacent to any Creator (or adjacent but not type-matching).
    const otherCards: PlacedCard[] = [];

    for (const an of animals) {
      const isGolden = an.card.kind === "golden_body";
      const animalTypes = (an.card.types ?? []) as string[];

      // Collect ADJACENT creator slots.
      const adjacent: CreatorSlot[] = [];
      for (const n of neighbours(an.pos)) {
        const s = slotByKey.get(keyOf(n));
        if (s) adjacent.push(s);
      }
      if (adjacent.length === 0) { otherCards.push(an); continue; }

      // Golden Body: attach to first adjacent creator as a "Sub" chip.
      if (isGolden) { adjacent[0].goldenBodyCount += 1; continue; }

      // Matching slots: typed creator whose type appears in animal's types,
      // OR any adjacent Sky creator (Sky accepts any neighbour).
      const matching = adjacent.filter((s) =>
        s.isSky || animalTypes.some((t) => t.toLowerCase() === s.slotType.toLowerCase()),
      );
      if (matching.length === 0) { otherCards.push(an); continue; }

      const shared = matching.length > 1;
      for (const s of matching) {
        const primary =
          animalTypes.find((t) => t.toLowerCase() === s.slotType.toLowerCase()) ??
          animalTypes[0] ??
          "Sky";
        s.animalsByType.set(primary, (s.animalsByType.get(primary) ?? 0) + 1);
        s.animalsList.push({ pc: an, shared });
        s.animalCount += 1;
      }
    }

    // For Sky slots without a displayType, infer the "subbed for" type from
    // its most-common assigned animal type.
    for (const s of slots) {
      if (s.isSky && (!s.placed.card.displayType) && s.animalsByType.size > 0) {
        let bestType = s.slotType;
        let best = -1;
        for (const [t, n] of s.animalsByType) {
          if (n > best && t !== "Sky") { best = n; bestType = t; }
        }
        s.slotType = bestType;
        s.element = String(TYPE_TO_ELEMENT[bestType] ?? "Sky");
      }
    }

    // Sort slots by canonical order of their slotType
    slots.sort((a, b) => {
      const ia = CANONICAL_ORDER.indexOf(a.slotType as typeof CANONICAL_ORDER[number]);
      const ib = CANONICAL_ORDER.indexOf(b.slotType as typeof CANONICAL_ORDER[number]);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    // Other cards on board, grouped by type for chips.
    const otherByType = new Map<string, number>();
    for (const an of otherCards) {
      const key = an.card.kind === "golden_body"
        ? "Golden Body"
        : ((an.card.types ?? [])[0] as string) ?? "Sky";
      otherByType.set(key, (otherByType.get(key) ?? 0) + 1);
    }

    return {
      slots,
      otherByType,
      otherCards,
      creatorsCount: creators.length,
      animalsCount: animals.length - goldenBodyCount,
      goldenBodyCount,
    };
  }, [player]);

  return (
    <div
      className={`rounded-lg border p-3 ${
        winner ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border/60"
      }`}
    >
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {rank != null && (
            <span
              className={`shrink-0 inline-flex items-center justify-center min-w-[2.25rem] px-1.5 h-6 rounded-full text-[11px] font-semibold ${
                rank === 1
                  ? "bg-amber-400 text-amber-950"
                  : rank === 2
                  ? "bg-slate-300 text-slate-900"
                  : rank === 3
                  ? "bg-orange-400/80 text-orange-950"
                  : "bg-muted text-muted-foreground"
              }`}
              title={`${ordinal(rank)} place`}
            >
              {ordinal(rank)}
            </span>
          )}
          <div className="font-semibold truncate">{player.name}</div>
        </div>
        <div className="text-xs text-muted-foreground text-right shrink-0">
          {data.creatorsCount} creators · {data.animalsCount} animals{data.goldenBodyCount > 0 ? ` · ${data.goldenBodyCount} Golden Body` : ""} · {playerTotalScore(player)} pts
        </div>
      </div>

      {data.slots.length === 0 && data.otherByType.size === 0 ? (
        <div className="text-xs text-muted-foreground italic">No cards placed.</div>
      ) : (
        <div className="space-y-2">
          {data.slots.map((s, i) => {
            const slotColor = CREATOR_TYPE_COLORS[s.slotType as keyof typeof CREATOR_TYPE_COLORS] ?? "#888";
            const skyColor = CREATOR_TYPE_COLORS.Sky;
            return (
              <div key={i} className="border-t border-dashed border-border/50 pt-2 first:border-t-0 first:pt-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: slotColor }} />
                  {s.isSky ? `Sky → ${s.slotType}` : s.slotType} ({s.element}){s.isSky ? " — Sky subbed" : ""}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <TypeChip
                    type={s.slotType}
                    role="Creator"
                    n={1}
                    subbed={s.isSky}
                    bgOverride={slotColor}
                    outlineColor={s.isSky ? skyColor : undefined}
                    label={s.isSky ? `Sky→${s.slotType}` : s.slotType}
                  />
                  {Array.from(s.animalsByType.entries())
                    .sort((a, b) => {
                      const ia = CANONICAL_ORDER.indexOf(a[0] as typeof CANONICAL_ORDER[number]);
                      const ib = CANONICAL_ORDER.indexOf(b[0] as typeof CANONICAL_ORDER[number]);
                      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
                    })
                    .map(([t, n]) => {
                      const sharedCount = s.animalsList.filter((a) => a.shared && ((a.pc.card.types ?? []) as string[]).some((x) => x.toLowerCase() === t.toLowerCase())).length;
                      return (
                        <TypeChip
                          key={`a-${t}`}
                          type={t}
                          role="Animal"
                          n={n}
                          shared={sharedCount > 0}
                        />
                      );
                    })}
                  {s.goldenBodyCount > 0 && (
                    <TypeChip type="Sky" role="Sub" n={s.goldenBodyCount} bgOverride="#888" label="Golden Body" />
                  )}
                  {s.animalCount === 0 && s.goldenBodyCount === 0 && (
                    <span className="text-[11px] italic text-muted-foreground">no animals linked</span>
                  )}
                </div>
                {s.animalsList.length > 0 && (
                  <div className="pl-1 mt-1 text-[11px] text-muted-foreground font-mono">
                    {s.animalsList
                      .map(({ pc, shared }) => {
                        const t = (pc.card.types ?? []) as string[];
                        const code = creatorTypeCode(t[0], t[1]);
                        return `${pc.card.name}${code ? ` (${code})` : ""}${shared ? " ↔" : ""}`;
                      })
                      .join(", ")}
                  </div>
                )}
              </div>
            );
          })}

          {data.otherByType.size > 0 && (
            <div className="border-t border-border/40 pt-2 mt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Other cards on board
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {Array.from(data.otherByType.entries())
                  .sort((a, b) => {
                    const ia = CANONICAL_ORDER.indexOf(a[0] as typeof CANONICAL_ORDER[number]);
                    const ib = CANONICAL_ORDER.indexOf(b[0] as typeof CANONICAL_ORDER[number]);
                    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
                  })
                  .map(([t, n]) =>
                    t === "Golden Body" ? (
                      <TypeChip key={`o-${t}`} type="Sky" role="Sub" n={n} bgOverride="#888" label="Golden Body" />
                    ) : (
                      <TypeChip key={`o-${t}`} type={t} role="Animal" n={n} />
                    ),
                  )}
              </div>
              <div className="pl-1 mt-1 text-[11px] text-muted-foreground font-mono">
                {data.otherCards
                  .map((pc) => {
                    const t = (pc.card.types ?? []) as string[];
                    const code = creatorTypeCode(t[0], t[1]);
                    return `${pc.card.name}${code ? ` (${code})` : ""}`;
                  })
                  .join(", ")}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


