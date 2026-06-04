import { ANIMAL_CARDS, CREATOR_TYPE_ORDER, CREATOR_TYPE_COLORS } from "@/data/cards";
import { AnimalCardTile } from "@/components/game/cards/AnimalCardTile";
import { AnimalHexPiece } from "@/components/game/cards/AnimalHexPiece";
import { HandTile } from "@/components/game/cards/HandTile";
import { TYPE_TO_ELEMENT } from "@/lib/game/elements";
import bearImg from "@/assets/cards/animal-bear.webp";
import beeImg from "@/assets/cards/animal-bee.webp";
import cassowaryImg from "@/assets/cards/animal-cassowary.webp";
import echidnaImg from "@/assets/cards/animal-echidna.webp";
import eelImg from "@/assets/cards/animal-eel.webp";
import foxImg from "@/assets/cards/animal-fox.webp";
import griffinImg from "@/assets/cards/animal-griffin.webp";
import iguanaImg from "@/assets/cards/animal-iguana.webp";
import octopusImg from "@/assets/cards/animal-octopus.webp";
import tigerImg from "@/assets/cards/animal-tiger.webp";
import waspImg from "@/assets/cards/animal-wasp.webp";
import wolfImg from "@/assets/cards/animal-wolf.webp";
import camelImg from "@/assets/cards/animal-camel.webp";
import cheetahImg from "@/assets/cards/animal-cheetah.webp";
import dragonImg from "@/assets/cards/animal-dragon.webp";
import gorillaImg from "@/assets/cards/animal-gorilla.webp";
import lemurImg from "@/assets/cards/animal-lemur.webp";
import mouseImg from "@/assets/cards/animal-mouse.webp";
import otterImg from "@/assets/cards/animal-otter.webp";
import pandaImg from "@/assets/cards/animal-panda.webp";
import sealImg from "@/assets/cards/animal-seal.webp";
import squirrelImg from "@/assets/cards/animal-squirrel.webp";
import zebraImg from "@/assets/cards/animal-zebra.webp";

import dolphinImg from "@/assets/cards/animal-dolphin.webp";
import dragonflyImg from "@/assets/cards/animal-dragonfly.webp";
import fairyImg from "@/assets/cards/animal-fairy.webp";
import fireflyImg from "@/assets/cards/animal-firefly.webp";
import horseImg from "@/assets/cards/animal-horse.webp";
import kangarooImg from "@/assets/cards/animal-kangaroo.webp";
import ostrichImg from "@/assets/cards/animal-ostrich.webp";
import rabbitImg from "@/assets/cards/animal-rabbit.webp";
import sharkImg from "@/assets/cards/animal-shark.webp";
import woodpeckerImg from "@/assets/cards/animal-woodpecker.webp";
import alpacaImg from "@/assets/cards/animal-alpaca.webp";
import deerImg from "@/assets/cards/animal-deer.webp";
import duckImg from "@/assets/cards/animal-duck.webp";
import leopardImg from "@/assets/cards/animal-leopard.webp";
import peacockImg from "@/assets/cards/animal-peacock.webp";
import penguinImg from "@/assets/cards/animal-penguin.webp";
import lynxImg from "@/assets/cards/animal-lynx.webp";
import spiderImg from "@/assets/cards/animal-spider.webp";
import swanImg from "@/assets/cards/animal-swan.webp";
import unicornImg from "@/assets/cards/animal-unicorn.webp";
import catfishImg from "@/assets/cards/animal-catfish.webp";
import craneImg from "@/assets/cards/animal-crane.webp";
import falconImg from "@/assets/cards/animal-falcon.webp";
import flyingFoxImg from "@/assets/cards/animal-flying-fox.webp";
import giraffeImg from "@/assets/cards/animal-giraffe.webp";
import platypusImg from "@/assets/cards/animal-platypus.webp";
import swordfishImg from "@/assets/cards/animal-swordfish.webp";
import thunderbirdImg from "@/assets/cards/animal-thunderbird.webp";
import elephantImg from "@/assets/cards/animal-elephant.webp";
import kingfisherImg from "@/assets/cards/animal-kingfisher.webp";
import koalaImg from "@/assets/cards/animal-koala.webp";
import lionImg from "@/assets/cards/animal-lion.webp";
import rainbowSerpentImg from "@/assets/cards/animal-rainbow-serpent.webp";
import starfishImg from "@/assets/cards/animal-starfish.webp";
import turtleImg from "@/assets/cards/animal-turtle.webp";
import beaverImg from "@/assets/cards/animal-beaver.webp";
import bunyipImg from "@/assets/cards/animal-bunyip.webp";
import crabImg from "@/assets/cards/animal-crab.webp";
import frogImg from "@/assets/cards/animal-frog.webp";
import jellyfishImg from "@/assets/cards/animal-jellyfish.webp";
import wombatImg from "@/assets/cards/animal-wombat.webp";
import crocodileImg from "@/assets/cards/animal-crocodile.webp";
import merperImg from "@/assets/cards/animal-merper.webp";
import seahorseImg from "@/assets/cards/animal-seahorse.webp";
import stingrayImg from "@/assets/cards/animal-stingray.webp";
import whaleImg from "@/assets/cards/animal-whale.webp";
import goatImg from "@/assets/cards/animal-goat.webp";
import elfImg from "@/assets/cards/animal-elf.webp";
import slothImg from "@/assets/cards/animal-sloth.webp";
import snakeImg from "@/assets/cards/animal-snake.webp";
import bigfootImg from "@/assets/cards/animal-bigfoot.webp";
import bisonImg from "@/assets/cards/animal-bison.webp";
import salamanderImg from "@/assets/cards/animal-salamander.webp";
import anteaterImg from "@/assets/cards/animal-anteater.webp";
import hobbitImg from "@/assets/cards/animal-hobbit.webp";
import seamonsterImg from "@/assets/cards/animal-seamonster.webp";

const ART: Record<string, string> = {
  "bear": bearImg, "bee": beeImg, "cassowary": cassowaryImg, "echidna": echidnaImg,
  "eel": eelImg, "fox": foxImg, "griffin": griffinImg, "iguana": iguanaImg,
  "octopus": octopusImg, "tiger": tigerImg, "wasp": waspImg, "wolf": wolfImg,
  "camel": camelImg, "cheetah": cheetahImg, "dragon": dragonImg, "gorilla": gorillaImg,
  "lemur": lemurImg, "mouse": mouseImg, "otter": otterImg, "panda": pandaImg,
  "seal": sealImg, "squirrel": squirrelImg, "zebra": zebraImg,
  "dolphin": dolphinImg, "dragonfly": dragonflyImg, "fairy": fairyImg, "firefly": fireflyImg,
  "horse": horseImg, "kangaroo": kangarooImg, "ostrich": ostrichImg, "rabbit": rabbitImg,
  "shark": sharkImg, "woodpecker": woodpeckerImg, "alpaca": alpacaImg, "deer": deerImg,
  "duck": duckImg, "leopard": leopardImg, "peacock": peacockImg, "penguin": penguinImg,
  "lynx": lynxImg, "spider": spiderImg, "swan": swanImg, "unicorn": unicornImg,
  "catfish": catfishImg, "crane": craneImg, "falcon": falconImg, "flying-fox": flyingFoxImg,
  "giraffe": giraffeImg, "platypus": platypusImg, "swordfish": swordfishImg, "thunderbird": thunderbirdImg,
  "elephant": elephantImg, "kingfisher": kingfisherImg, "koala": koalaImg, "lion": lionImg,
  "rainbow-serpent": rainbowSerpentImg, "starfish": starfishImg, "turtle": turtleImg, "beaver": beaverImg,
  "bunyip": bunyipImg, "crab": crabImg, "frog": frogImg, "jellyfish": jellyfishImg,
  "wombat": wombatImg, "crocodile": crocodileImg, "merper": merperImg, "seahorse": seahorseImg,
  "stingray": stingrayImg, "whale": whaleImg, "goat": goatImg, "elf": elfImg,
  "sloth": slothImg, "snake": snakeImg, "bigfoot": bigfootImg, "bison": bisonImg,
  "salamander": salamanderImg, "anteater": anteaterImg, "hobbit": hobbitImg, "seamonster": seamonsterImg,
};

/** A small honeycomb mock showing how hex pieces tessellate. */
function HoneycombMock() {
  const size = 110;
  const h = size * 1.1547;
  const rowOffset = h * 0.75;
  const colOffset = size;
  // 3-row honeycomb sample
  const layout = [
    [{ slug: "fox" }, { slug: "wolf" }, { slug: "bee" }],
    [{ slug: "octopus" }, { slug: "tiger" }, { slug: "eel" }, { slug: "griffin" }],
    [{ slug: "wasp" }, { slug: "bear" }, { slug: "iguana" }],
  ];
  return (
    <div className="relative" style={{ height: h + rowOffset * 2 + 20, width: colOffset * 4.5 }}>
      {layout.map((row, rIdx) =>
        row.map((cell, cIdx) => {
          const card = ANIMAL_CARDS.find((c) => c.slug === cell.slug);
          if (!card) return null;
          const offsetX = rIdx % 2 === 1 ? colOffset / 2 : 0;
          return (
            <div
              key={`${rIdx}-${cIdx}`}
              className="absolute"
              style={{
                left: cIdx * colOffset + offsetX,
                top: rIdx * rowOffset,
              }}
            >
              <AnimalHexPiece card={card} imageSrc={ART[card.slug]} size={size} />
            </div>
          );
        })
      )}
    </div>
  );
}

export default function CardPreview() {
  const fox = ANIMAL_CARDS.find((c) => c.slug === "fox")!;

  return (
    <div className="min-h-screen bg-background p-8 space-y-12">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: '"Lilita One", sans-serif' }}>
          Card preview
        </h1>
        <p className="text-muted-foreground text-sm">
          Two forms: rectangular tile for the deck/hand display, hex piece for the
          honeycomb play board. Approve both looks and I'll batch-generate the
          remaining 79 animal illustrations.
        </p>
      </header>

      {/* Hex board pieces */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Board piece (hex)</h2>
          <p className="text-xs text-muted-foreground">
            Used on the honeycomb play space. Pointy-top hex, dual-colour split, animal
            illustration, tiny name plate.
          </p>
        </div>
        <div className="flex items-end gap-6">
          <AnimalHexPiece card={fox} imageSrc={foxImg} size={180} />
          <AnimalHexPiece card={fox} imageSrc={foxImg} size={130} />
          <AnimalHexPiece card={fox} imageSrc={foxImg} size={90} />
        </div>
        <div className="mt-6 p-6 rounded-xl bg-muted/30 inline-block">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Honeycomb tessellation sample
          </p>
          <HoneycombMock />
        </div>
      </section>

      {/* Deck tile */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Deck / hand tile (rectangular)</h2>
          <p className="text-xs text-muted-foreground">
            Used in the player's hand, deck viewer, and used-pile.
          </p>
        </div>
        <div className="flex items-end gap-6">
          <AnimalCardTile card={fox} imageSrc={foxImg} size={260} />
          <AnimalCardTile card={fox} imageSrc={foxImg} size={180} />
          <AnimalCardTile card={fox} imageSrc={foxImg} size={140} />
        </div>
      </section>

      {/* Full deck grid */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Full deck — all 80 unique animals</h2>
        <p className="text-xs text-muted-foreground">
          {ANIMAL_CARDS.length} cards · 12 Sky mythicals flagged. Canonical order:{" "}
          {CREATOR_TYPE_ORDER.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 mr-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: CREATOR_TYPE_COLORS[t] }}
              />
              {t}
            </span>
          ))}
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {ANIMAL_CARDS.map((c) => (
            <AnimalCardTile key={c.slug} card={c} imageSrc={ART[c.slug]} size={150} />
          ))}
        </div>
      </section>

      <SpecialCardsSection />
    </div>
  );
}

function SpecialCardsSection() {
  const creatorTypes = CREATOR_TYPE_ORDER.filter((t) => t !== "Sky");

  const creatorCards = creatorTypes.map((t) => ({
    uid: `creator-${t}`,
    kind: "creator" as const,
    name: `${t} Creator`,
    displayType: t,
    element: TYPE_TO_ELEMENT[t] as "Earth" | "Fire" | "Air" | "Water",
    special: false,
  }));

  const skyCreator = {
    uid: "sky-creator",
    kind: "sky_creator" as const,
    name: "Sky Creator",
    displayType: "Sky" as const,
    special: true,
  };

  const goldenBody = {
    uid: "golden-body",
    kind: "golden_body" as const,
    name: "Golden Body",
    special: true,
  };

  const goldenHive = {
    uid: "golden-hive",
    kind: "golden_hive" as const,
    name: "Golden Hive",
    special: true,
  };

  const Group = ({ title, subtitle, cards }: { title: string; subtitle: string; cards: any[] }) => (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-4">
        {cards.map((c, i) => (
          <HandTile key={`${c.uid}-${i}`} card={c as any} size={150} />
        ))}
      </div>
    </div>
  );

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Special cards</h2>
        <p className="text-xs text-muted-foreground">
          Creator Cards, Sky Creator Cards, Golden Body and the Golden Hive — every card variation in the deck.
        </p>
      </div>

      <Group
        title="Creator Cards (×2 each)"
        subtitle="One per Creator Type (excluding Sky). 12 distinct creators × 2 copies = 24 cards in the deck."
        cards={creatorCards}
      />
      <Group
        title="Sky Creator Cards (×2)"
        subtitle="Substitutes for a Creator of any element."
        cards={[skyCreator, skyCreator]}
      />
      <Group
        title="Golden Body Card (×8)"
        subtitle="Counts as a matching Animal for any Creator."
        cards={[goldenBody]}
      />
      <Group
        title="Golden Hive Card (×1)"
        subtitle="Blocks one Disaster. Cannot be placed on the board."
        cards={[goldenHive]}
      />
    </section>
  );
}
