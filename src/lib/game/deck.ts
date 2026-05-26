/**
 * Deck construction. Combines the 80 hand-drawn animal cards from the DB with
 * the synthesised Creator, Sky Creator, Golden Body and Golden Hive cards.
 *
 * Quantities (102 cards total):
 *   - 68 standard Animal Cards (the 80 minus 12 mythical -> sky_creatures)
 *   - 12 Sky Creature Cards (mythicals: Griffin, Dragon, Fairy, Unicorn, …)
 *   - 16 Creator Cards: 4 each of Earth / Fire / Air / Water
 *   -  2 Sky Creator Cards (wildcard element)
 *   -  2 Golden Body Cards (wildcard animal)
 *   -  2 Golden Hive Cards (block one disaster)
 */

import type { GameCard } from "@/lib/gameCards";
import type { CardKind, DeckCard } from "./types";
import { ELEMENTS } from "./elements";

let _seq = 0;
const nextUid = (slug: string) => `${slug}#${++_seq}`;

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

function creatorCard(element: "Earth" | "Fire" | "Air" | "Water"): DeckCard {
  return {
    uid: nextUid(`creator-${element.toLowerCase()}`),
    kind: "creator",
    name: `${element} Creator`,
    element,
  };
}

function skyCreator(): DeckCard {
  return {
    uid: nextUid("sky-creator"),
    kind: "sky_creator",
    name: "Sky Creator",
    special: true,
  };
}

function goldenBody(): DeckCard {
  return {
    uid: nextUid("golden-body"),
    kind: "golden_body",
    name: "Golden Body",
    special: true,
  };
}

function goldenHive(): DeckCard {
  return {
    uid: nextUid("golden-hive"),
    kind: "golden_hive",
    name: "Golden Hive",
    special: true,
  };
}

export function buildDeck(allCards: GameCard[]): DeckCard[] {
  _seq = 0;
  const deck: DeckCard[] = [];

  // Animals + Sky Creatures (mythicals)
  for (const c of allCards) {
    deck.push(animal(c, c.mythical ? "sky_creature" : "animal"));
  }

  // 4 of each of the 4 elements
  for (const el of ELEMENTS) {
    for (let i = 0; i < 4; i++) deck.push(creatorCard(el));
  }

  // Wildcards / specials
  for (let i = 0; i < 2; i++) deck.push(skyCreator());
  for (let i = 0; i < 2; i++) deck.push(goldenBody());
  for (let i = 0; i < 2; i++) deck.push(goldenHive());

  return deck;
}
