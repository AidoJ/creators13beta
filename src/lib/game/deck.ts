/**
 * Deck construction. Combines the hand-drawn animal cards from the DB
 * (`game_cards`) with the synthesised Creator, Sky Creator, Golden Body and
 * Golden Hive cards.
 *
 * Today's quantities (114 cards total):
 *   - 67 standard Animal Cards (current 79 minus 12 mythical -> sky_creatures)
 *   - 12 Sky Creature Cards (mythicals: Griffin, Dragon, Fairy, Unicorn, …)
 *   - 24 Creator Cards: 2 each of the 12 element-mapped Creator Types
 *   -  2 Sky Creator Cards (wildcard element)
 *   -  8 Golden Body Cards (wildcard animal)
 *   -  1 Golden Hive Card (block one disaster)
 *
 * Future-proof: animal + sky_creature counts derive from `game_cards`, so
 * adding the planned +13 cards (or any other rows) requires NO code change.
 * Special-card quantities (creator / sky_creator / golden_*) stay fixed.
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

/**
 * Expected synthesised-card counts. The animal/sky-creature totals are
 * derived from whatever's in `game_cards` (mythical=true => sky_creature),
 * so adding more hand-drawn cards later does NOT require touching this file.
 *
 * A.2 — N-PLAYER NOTE: deck quantities deliberately do NOT scale with
 * player_count. 3- and 4-player matches share the same single deck, so they
 * deplete faster than 2-player matches BY DESIGN — confirmed by the
 * product owner. Do not "fix" this by multiplying counts.
 *
 * EXPECTED_GOLDEN_HIVE = 1 is likewise an intentional scarcity constant —
 * there is exactly ONE Hive in the entire match regardless of player count.
 */
const EXPECTED_CREATORS = 24;  // 12 non-Sky types × 2
const EXPECTED_SKY_CREATORS = 2;
const EXPECTED_GOLDEN_BODY = 8;
const EXPECTED_GOLDEN_HIVE = 1; // intentional — never scale by player count

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

  // ---- Invariant assertions ----------------------------------------------
  // Skip for trivially small subsets (tests / preview pages with a handful
  // of cards). Otherwise derive animal/sky-creature targets from the input
  // so adding more hand-drawn cards later "just works".
  if (allCards.length >= 20) {
    const expectedMythicals = allCards.filter((c) => c.mythical).length;
    const expectedAnimals = allCards.length - expectedMythicals;
    const expectedTotal =
      expectedAnimals + expectedMythicals + EXPECTED_CREATORS +
      EXPECTED_SKY_CREATORS + EXPECTED_GOLDEN_BODY + EXPECTED_GOLDEN_HIVE;

    const counts = {
      total: deck.length,
      animal: deck.filter((c) => c.kind === "animal").length,
      mythical: deck.filter((c) => c.kind === "sky_creature").length,
      creator: deck.filter((c) => c.kind === "creator").length,
      sky_creator: deck.filter((c) => c.kind === "sky_creator").length,
      golden_body: deck.filter((c) => c.kind === "golden_body").length,
      golden_hive: deck.filter((c) => c.kind === "golden_hive").length,
    };
    const errors: string[] = [];
    if (counts.total !== expectedTotal) errors.push(`total=${counts.total}≠${expectedTotal}`);
    if (counts.animal !== expectedAnimals) errors.push(`animal=${counts.animal}≠${expectedAnimals}`);
    if (counts.mythical !== expectedMythicals) errors.push(`mythical=${counts.mythical}≠${expectedMythicals}`);
    if (counts.creator !== EXPECTED_CREATORS) errors.push(`creator=${counts.creator}≠${EXPECTED_CREATORS}`);
    if (counts.sky_creator !== EXPECTED_SKY_CREATORS) errors.push(`sky_creator=${counts.sky_creator}≠${EXPECTED_SKY_CREATORS}`);
    if (counts.golden_body !== EXPECTED_GOLDEN_BODY) errors.push(`golden_body=${counts.golden_body}≠${EXPECTED_GOLDEN_BODY}`);
    if (counts.golden_hive !== EXPECTED_GOLDEN_HIVE) errors.push(`golden_hive=${counts.golden_hive}≠${EXPECTED_GOLDEN_HIVE}`);
    if (errors.length) {
      const msg = `[buildDeck] invariant violation: ${errors.join(", ")}`;
      console.error(msg, counts);
      if (import.meta.env?.DEV) throw new Error(msg);
    }
  }


  return deck;
}


