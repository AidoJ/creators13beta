import { ANIMAL_CARDS, CREATOR_TYPE_ORDER } from "@/data/cards";
import { AnimalCardTile } from "@/components/game/cards/AnimalCardTile";
import foxImg from "@/assets/cards/animal-fox.png";

const ART: Record<string, string> = {
  fox: foxImg,
};

export default function CardPreview() {
  const fox = ANIMAL_CARDS.find((c) => c.slug === "fox")!;

  return (
    <div className="min-h-screen bg-background p-8 space-y-12">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: '"Lilita One", sans-serif' }}>
          Card preview
        </h1>
        <p className="text-muted-foreground text-sm">
          One example card (Fox = Lava + Fire) with real artwork. The other 79 animals
          render as bordered tiles with the correct dual colours and animal name
          until art is generated. Approve the look and I'll batch the remaining 79.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Hero example</h2>
        <div className="flex items-end gap-6">
          <AnimalCardTile card={fox} imageSrc={foxImg} size={260} />
          <AnimalCardTile card={fox} imageSrc={foxImg} size={180} />
          <AnimalCardTile card={fox} imageSrc={foxImg} size={140} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Full deck — all 80 unique animals</h2>
        <p className="text-xs text-muted-foreground">
          {ANIMAL_CARDS.length} cards · 12 Sky mythicals (Griffin, Dragon, Fairy, etc.) flagged.
          Grouped by canonical Creator-Type order: {CREATOR_TYPE_ORDER.join(" · ")}.
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
