import { ANIMAL_CARDS, CREATOR_TYPE_ORDER, CREATOR_TYPE_COLORS } from "@/data/cards";
import { AnimalCardTile } from "@/components/game/cards/AnimalCardTile";
import { AnimalHexPiece } from "@/components/game/cards/AnimalHexPiece";
import foxImg from "@/assets/cards/animal-fox.png";

const ART: Record<string, string> = {
  fox: foxImg,
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
