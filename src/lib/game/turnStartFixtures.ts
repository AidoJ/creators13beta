/** Shared test fixtures for turn-start win checks (source + mirror suites). */
import type { DeckCard, PlayerState } from "./types";
import type { Element } from "./elements";
import type { CreatorTypeName } from "@/lib/gameCards";

const BASE_HALVES = ["B", "A", "A", "A", "B", "B"] as const;
const NEI = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];
function rotationFacing(dirToCreator: number, half: "A" | "B"): number {
  return [0, 1, 2, 3, 4, 5].find((rot) => BASE_HALVES[(dirToCreator - rot + 6) % 6] === half) ?? 0;
}

const creator = (type: CreatorTypeName, element: Element): DeckCard => ({
  uid: `creator-${type}`,
  kind: "creator",
  name: `${type} Creator`,
  displayType: type,
  element,
});
const animal = (name: string, types: CreatorTypeName[]): DeckCard => ({
  uid: name,
  kind: "animal",
  name,
  types: types as [CreatorTypeName, CreatorTypeName],
});

export const mirrorCreator = (): DeckCard => creator("Lava", "Fire");

/** A validly complete ecosystem: 4 elements, 3 adjacent matching animals each. */
export function winningEcoForMirror(): PlayerState["ecosystem"] {
  const clusters: DeckCard[][] = [
    [creator("Snow", "Air"), animal("snow-0", ["Snow", "Lightning"]), animal("snow-1", ["Snow", "Lightning"]), animal("snow-2", ["Snow", "Lightning"])],
    [creator("Fire", "Fire"), animal("fire-0", ["Fire", "Sun"]), animal("fire-1", ["Fire", "Sun"]), animal("fire-2", ["Fire", "Sun"])],
    [creator("Soil", "Earth"), animal("soil-0", ["Soil", "Tree"]), animal("soil-1", ["Soil", "Tree"]), animal("soil-2", ["Soil", "Tree"])],
    [creator("Ocean", "Water"), animal("ocean-0", ["Ocean", "River"]), animal("ocean-1", ["Ocean", "River"]), animal("ocean-2", ["Ocean", "River"])],
  ];
  const placed = new Map<string, { card: DeckCard; pos: { q: number; r: number }; rotation?: number }>();
  clusters.forEach((group, i) => {
    const origin = { q: i * 10, r: i * 10 };
    const [hub, ...animals] = group;
    const targetType = hub.kind === "creator" ? hub.displayType : undefined;
    placed.set(`${origin.q},${origin.r}`, { card: hub, pos: origin });
    animals.forEach((a, j) => {
      const off = NEI[j];
      const pos = { q: origin.q + off.q, r: origin.r + off.r };
      const half = targetType && a.types?.[1] === targetType && a.types?.[0] !== targetType ? "B" : "A";
      placed.set(`${pos.q},${pos.r}`, { card: a, pos, rotation: rotationFacing((j + 3) % 6, half) });
    });
  });
  return { placed } as PlayerState["ecosystem"];
}
