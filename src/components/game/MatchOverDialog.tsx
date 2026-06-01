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
  const winner = state.players.find((p) => p.id === state.winnerId) ?? state.players[0];

  return (
    <>
      <Dialog open={open && !reviewOpen} onOpenChange={(o) => { if (!o) setDismissed(true); }}>

        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-4 gap-2">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Trophy className="w-5 h-5 text-amber-500" />
              Congratulations {winner.name} — You Win!
            </DialogTitle>
            <DialogDescription className="text-xs leading-snug">
              <span className="font-semibold text-foreground">{buildWinReason(state, winner).headline}.</span>{" "}
              {buildWinReason(state, winner).detail}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            <div className="grid sm:grid-cols-2 gap-2">
              {state.players.map((p) => (
                <PlayerBreakdown key={p.id} player={p} winner={p.id === state.winnerId} />
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
          <Tabs defaultValue={state.players[0]?.id}>
            <TabsList className="w-full">
              {state.players.map((p) => (
                <TabsTrigger key={p.id} value={p.id} className="flex-1">
                  {p.name}{p.id === state.winnerId ? " 🏆" : ""}
                </TabsTrigger>
              ))}
            </TabsList>
            {state.players.map((p) => (
              <TabsContent key={p.id} value={p.id} className="mt-4">
                <PlayerBreakdown player={p} winner={p.id === state.winnerId} />
                <div className="mt-3 rounded-lg border border-border/60 bg-card/40 p-2 overflow-auto">
                  <Ecosystem eco={p.ecosystem} size={56} showEmpties={false} minHeight={320} />
                </div>
              </TabsContent>
            ))}
          </Tabs>
          <div className="flex justify-end mt-4 gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Back to results</Button>
            <Button onClick={onPlayAgain}>Play again</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const CANONICAL_ORDER = ["Lava","Fire","Whirlwind","Snow","Lightning","Sun","Lake","Ocean","Tree","Mountain","Soil","River","Sky"] as const;

type CreatorSlot = {
  placed: PlacedCard;
  isSky: boolean;
  /** Type label for this slot (creator's displayType, or for Sky the type it subs for). */
  slotType: string;
  /** Element this slot covers (Earth/Fire/Air/Water/Sky). */
  element: string;
  /** Animals assigned to this slot, counted by Creator Type. */
  animalsByType: Map<string, number>;
  animalCount: number;
};

function TypeChip({
  type,
  role,
  n,
  subbed = false,
}: {
  type: string;
  role: "Creator" | "Animal";
  n: number;
  subbed?: boolean;
}) {
  const color = CREATOR_TYPE_COLORS[type as keyof typeof CREATOR_TYPE_COLORS] ?? "#888";
  const glyph = glyphForType(type);
  return (
    <div
      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ background: color }}
      title={`${role} · ${type}: ${n}${subbed ? " (Sky subbed)" : ""}`}
    >
      {glyph && <img src={glyph} alt="" className="w-3 h-3 object-contain" />}
      <span className="opacity-80">{role}</span>
      <span>{type}</span>
      <span className="opacity-80">×{n}</span>
    </div>
  );
}

function PlayerBreakdown({ player, winner }: { player: PlayerState; winner: boolean }) {
  const data = useMemo(() => {
    const placedList = Array.from(player.ecosystem.placed.values());
    const creators: PlacedCard[] = [];
    const animals: PlacedCard[] = [];
    for (const pc of placedList) {
      const k = pc.card.kind;
      if (k === "creator" || k === "sky_creator") creators.push(pc);
      else animals.push(pc);
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
      animalCount: 0,
    }));

    const slotByKey = new Map<string, CreatorSlot>();
    for (const s of slots) slotByKey.set(keyOf(s.placed.pos), s);

    // Assign each animal to one creator slot.
    const unassigned: PlacedCard[] = [];
    for (const an of animals) {
      const animalTypes = (an.card.types ?? []) as string[];
      // 1) prefer ADJACENT typed creator matching one of the animal's types
      let chosen: CreatorSlot | null = null;
      for (const n of neighbours(an.pos)) {
        const s = slotByKey.get(keyOf(n));
        if (!s) continue;
        if (!s.isSky && animalTypes.some((t) => t.toLowerCase() === s.slotType.toLowerCase())) {
          chosen = s;
          break;
        }
      }
      // 2) else any adjacent Sky creator slot
      if (!chosen) {
        for (const n of neighbours(an.pos)) {
          const s = slotByKey.get(keyOf(n));
          if (s && s.isSky) {
            chosen = s;
            break;
          }
        }
      }
      // 3) else any non-adjacent typed creator matching
      if (!chosen) {
        chosen =
          slots.find(
            (s) =>
              !s.isSky &&
              animalTypes.some((t) => t.toLowerCase() === s.slotType.toLowerCase()),
          ) ?? null;
      }
      // 4) else first Sky creator slot
      if (!chosen) chosen = slots.find((s) => s.isSky) ?? null;

      if (!chosen) {
        unassigned.push(an);
        continue;
      }
      // Bucket this animal under its primary matching type
      const primary =
        animalTypes.find((t) => t.toLowerCase() === chosen!.slotType.toLowerCase()) ??
        animalTypes[0] ??
        "Sky";
      chosen.animalsByType.set(primary, (chosen.animalsByType.get(primary) ?? 0) + 1);
      chosen.animalCount += 1;
    }

    // For Sky slots without a displayType, infer the "subbed for" type from
    // its most-common assigned animal type.
    for (const s of slots) {
      if (s.isSky && (!s.placed.card.displayType) && s.animalsByType.size > 0) {
        let bestType = s.slotType;
        let best = -1;
        for (const [t, n] of s.animalsByType) {
          if (n > best && t !== "Sky") {
            best = n;
            bestType = t;
          }
        }
        s.slotType = bestType;
        s.element = String(TYPE_TO_ELEMENT[bestType] ?? "Sky");
      }
    }

    // Sort slots by canonical order of their slotType (Sky last)
    slots.sort((a, b) => {
      const ia = CANONICAL_ORDER.indexOf(a.slotType as typeof CANONICAL_ORDER[number]);
      const ib = CANONICAL_ORDER.indexOf(b.slotType as typeof CANONICAL_ORDER[number]);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    // Unassigned animals grouped by primary type
    const unassignedByType = new Map<string, number>();
    for (const an of unassigned) {
      const t = ((an.card.types ?? [])[0] as string) ?? "Sky";
      unassignedByType.set(t, (unassignedByType.get(t) ?? 0) + 1);
    }

    return {
      slots,
      unassignedByType,
      creatorsCount: creators.length,
      animalsCount: animals.length,
    };
  }, [player]);

  return (
    <div
      className={`rounded-lg border p-3 ${
        winner ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border/60"
      }`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-semibold">{player.name}</div>
        <div className="text-xs text-muted-foreground">
          {data.creatorsCount}/4 creators · {data.animalsCount}/12 animals · {playerTotalScore(player)} pts
        </div>
      </div>

      {data.slots.length === 0 && data.unassignedByType.size === 0 ? (
        <div className="text-xs text-muted-foreground italic">No cards placed.</div>
      ) : (
        <div className="space-y-2">
          {data.slots.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
                {s.slotType} ({s.element}){s.isSky ? " — Sky subbed" : ""}
              </span>
              <TypeChip
                type={s.slotType}
                role="Creator"
                n={1}
                subbed={s.isSky}
              />
              {Array.from(s.animalsByType.entries())
                .sort((a, b) => {
                  const ia = CANONICAL_ORDER.indexOf(a[0] as typeof CANONICAL_ORDER[number]);
                  const ib = CANONICAL_ORDER.indexOf(b[0] as typeof CANONICAL_ORDER[number]);
                  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
                })
                .map(([t, n]) => (
                  <TypeChip key={`a-${t}`} type={t} role="Animal" n={n} />
                ))}
              {s.animalCount === 0 && (
                <span className="text-[11px] italic text-muted-foreground">no animals linked</span>
              )}
            </div>
          ))}

          {data.unassignedByType.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
                Unassigned animals
              </span>
              {Array.from(data.unassignedByType.entries())
                .sort((a, b) => {
                  const ia = CANONICAL_ORDER.indexOf(a[0] as typeof CANONICAL_ORDER[number]);
                  const ib = CANONICAL_ORDER.indexOf(b[0] as typeof CANONICAL_ORDER[number]);
                  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
                })
                .map(([t, n]) => (
                  <TypeChip key={`u-${t}`} type={t} role="Animal" n={n} />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

