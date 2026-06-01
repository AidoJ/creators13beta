import { ANIMAL_CARDS, CREATOR_TYPE_ORDER, CREATOR_TYPE_COLORS } from "@/data/cards";
import { AnimalCardTile } from "@/components/game/cards/AnimalCardTile";
import { AnimalHexPiece } from "@/components/game/cards/AnimalHexPiece";
import bearImg from "@/assets/cards/animal-bear.png";
import beeImg from "@/assets/cards/animal-bee.png";
import cassowaryImg from "@/assets/cards/animal-cassowary.png";
import echidnaImg from "@/assets/cards/animal-echidna.png";
import eelImg from "@/assets/cards/animal-eel.png";
import foxImg from "@/assets/cards/animal-fox.png";
import griffinImg from "@/assets/cards/animal-griffin.png";
import iguanaImg from "@/assets/cards/animal-iguana.png";
import octopusImg from "@/assets/cards/animal-octopus.png";
import tigerImg from "@/assets/cards/animal-tiger.png";
import waspImg from "@/assets/cards/animal-wasp.png";
import wolfImg from "@/assets/cards/animal-wolf.png";
import camelImg from "@/assets/cards/animal-camel.png";
import cheetahImg from "@/assets/cards/animal-cheetah.png";
import dragonImg from "@/assets/cards/animal-dragon.png";
import gorillaImg from "@/assets/cards/animal-gorilla.png";
import lemurImg from "@/assets/cards/animal-lemur.png";
import mouseImg from "@/assets/cards/animal-mouse.png";
import otterImg from "@/assets/cards/animal-otter.png";
import pandaImg from "@/assets/cards/animal-panda.png";
import sealImg from "@/assets/cards/animal-seal.png";
import squirrelImg from "@/assets/cards/animal-squirrel.png";
import zebraImg from "@/assets/cards/animal-zebra.png";

import dolphinImg from "@/assets/cards/animal-dolphin.png";
import dragonflyImg from "@/assets/cards/animal-dragonfly.png";
import fairyImg from "@/assets/cards/animal-fairy.png";
import fireflyImg from "@/assets/cards/animal-firefly.png";
import horseImg from "@/assets/cards/animal-horse.png";
import kangarooImg from "@/assets/cards/animal-kangaroo.png";
import ostrichImg from "@/assets/cards/animal-ostrich.png";
import rabbitImg from "@/assets/cards/animal-rabbit.png";
import sharkImg from "@/assets/cards/animal-shark.png";
import woodpeckerImg from "@/assets/cards/animal-woodpecker.png";
import alpacaImg from "@/assets/cards/animal-alpaca.png";
import deerImg from "@/assets/cards/animal-deer.png";
import duckImg from "@/assets/cards/animal-duck.png";
import leopardImg from "@/assets/cards/animal-leopard.png";
import peacockImg from "@/assets/cards/animal-peacock.png";
import penguinImg from "@/assets/cards/animal-penguin.png";
import lynxImg from "@/assets/cards/animal-lynx.png";
import spiderImg from "@/assets/cards/animal-spider.png";
import swanImg from "@/assets/cards/animal-swan.png";
import unicornImg from "@/assets/cards/animal-unicorn.png";
import catfishImg from "@/assets/cards/animal-catfish.png";
import craneImg from "@/assets/cards/animal-crane.png";
import falconImg from "@/assets/cards/animal-falcon.png";
import flyingFoxImg from "@/assets/cards/animal-flying-fox.png";
import giraffeImg from "@/assets/cards/animal-giraffe.png";
import platypusImg from "@/assets/cards/animal-platypus.png";
import swordfishImg from "@/assets/cards/animal-swordfish.png";
import thunderbirdImg from "@/assets/cards/animal-thunderbird.png";
import elephantImg from "@/assets/cards/animal-elephant.png";
import kingfisherImg from "@/assets/cards/animal-kingfisher.png";
import koalaImg from "@/assets/cards/animal-koala.png";
import lionImg from "@/assets/cards/animal-lion.png";
import rainbowSerpentImg from "@/assets/cards/animal-rainbow-serpent.png";
import starfishImg from "@/assets/cards/animal-starfish.png";
import turtleImg from "@/assets/cards/animal-turtle.png";
import beaverImg from "@/assets/cards/animal-beaver.png";
import bunyipImg from "@/assets/cards/animal-bunyip.png";
import crabImg from "@/assets/cards/animal-crab.png";
import frogImg from "@/assets/cards/animal-frog.png";
import jellyfishImg from "@/assets/cards/animal-jellyfish.png";
import wombatImg from "@/assets/cards/animal-wombat.png";
import crocodileImg from "@/assets/cards/animal-crocodile.png";
import merperImg from "@/assets/cards/animal-merper.png";
import seahorseImg from "@/assets/cards/animal-seahorse.png";
import stingrayImg from "@/assets/cards/animal-stingray.png";
import whaleImg from "@/assets/cards/animal-whale.png";
import goatImg from "@/assets/cards/animal-goat.png";
import elfImg from "@/assets/cards/animal-elf.png";
import slothImg from "@/assets/cards/animal-sloth.png";
import snakeImg from "@/assets/cards/animal-snake.png";
import bigfootImg from "@/assets/cards/animal-bigfoot.png";
import bisonImg from "@/assets/cards/animal-bison.png";
import salamanderImg from "@/assets/cards/animal-salamander.png";
import anteaterImg from "@/assets/cards/animal-anteater.png";
import hobbitImg from "@/assets/cards/animal-hobbit.png";
import seamonsterImg from "@/assets/cards/animal-seamonster.png";

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
    </div>
  );
}
