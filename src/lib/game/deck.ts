/**
 * Deck construction. Combines the 80 hand-drawn animal cards from the DB with
 * the synthesised Creator, Sky Creator, Golden Body and Golden Hive cards.
 *
 * Quantities (115 cards total):
 *   - 68 standard Animal Cards (the 80 minus 12 mythical -> sky_creatures)
 *   - 12 Sky Creature Cards (mythicals: Griffin, Dragon, Fairy, Unicorn, …)
 *   - 24 Creator Cards: 2 each of the 12 element-mapped Creator Types
 *   -  2 Sky Creator Cards (wildcard element)
 *   -  8 Golden Body Cards (wildcard animal)
 *   -  1 Golden Hive Card (block one disaster)
 */

import type { GameCard, CreatorTypeName, SpecialCard } from "@/lib/gameCards";
import type { CardKind, DeckCard } from "./types";
import { TYPE_TO_ELEMENT, type Element } from "./elements";
import { CREATOR_TYPE_NAMES } from "@/lib/creatorTypes";

let _seq = 0;
const nextUid = (slug: string) => `${slug}#${++_seq}`;

/** Attach an admin-edited special card override as a minimal `source` so that
 *  HandTile / BoardHex automatically render the custom name, art and
 *  descriptor (they already read from `card.source`). */
function applySpecial(card: DeckCard, override?: SpecialCard | null): DeckCard {
  if (!override) return card;
  return {
    ...card,
    name: override.name || card.name,
    source: {
      // Only fields HandTile actually reads — cast keeps GameCard typing happy.
      slug: override.slug,
      name: override.name,
      descriptor: override.descriptor ?? null,
      art_url: override.art_url ?? null,
      art_path: override.art_path ?? null,
    } as unknown as GameCard,
  };
}

function animal(source: GameCard, kind: CardKind = "animal"): DeckCard {
  return {
    uid: nextUid(source.slug),
    kind,
    name: source.name,
    types: source.types,
    source,
    special: kind !== "animal",
  };
}

function creatorCardForType(displayType: CreatorTypeName): DeckCard {
  const mapped = TYPE_TO_ELEMENT[displayType];
  const element = (mapped === "Sky" ? "Air" : mapped) as Element;
  return {
    uid: nextUid(`creator-${displayType.toLowerCase()}`),
    kind: "creator",
    name: `${displayType} Creator`,
    element,
    displayType,
  };
}

function skyCreator(): DeckCard {
  return { uid: nextUid("sky-creator"), kind: "sky_creator", name: "Sky Creator", special: true };
}
function goldenBody(): DeckCard {
  return { uid: nextUid("golden-body"), kind: "golden_body", name: "Golden Body", special: true };
}
function goldenHive(): DeckCard {
  return { uid: nextUid("golden-hive"), kind: "golden_hive", name: "Golden Hive", special: true };
}

export function buildDeck(allCards: GameCard[], specials: SpecialCard[] = []): DeckCard[] {
  _seq = 0;
  const deck: DeckCard[] = [];
  const bySlug = new Map(specials.map((s) => [s.slug, s]));

  for (const c of allCards) {
    deck.push(animal(c, c.mythical ? "sky_creature" : "animal"));
  }

  for (const t of CREATOR_TYPE_NAMES) {
    if (t === "Sky") continue;
    const override = bySlug.get(`creator-${t.toLowerCase()}`);
    for (let i = 0; i < 2; i++) deck.push(applySpecial(creatorCardForType(t as CreatorTypeName), override));
  }

  const skyOv = bySlug.get("sky-creator");
  for (let i = 0; i < 2; i++) deck.push(applySpecial(skyCreator(), skyOv));
  const gbOv = bySlug.get("golden-body");
  for (let i = 0; i < 8; i++) deck.push(applySpecial(goldenBody(), gbOv));
  const ghOv = bySlug.get("golden-hive");
  for (let i = 0; i < 1; i++) deck.push(applySpecial(goldenHive(), ghOv));

  return deck;
}

