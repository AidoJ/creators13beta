import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, Save, Search } from "lucide-react";
import { CREATOR_TYPE_NAMES } from "@/lib/creatorTypes";
import { getSpecialCardFallbackArt, getSpecialCardFallbackDescriptor } from "@/lib/game/specialCardFallbacks";

const ART_BUCKET = "game-card-art";

type CardTable = "game_cards" | "special_cards";
type SpecialKind = "creator" | "sky_creator" | "golden_body" | "golden_hive";

interface Card {
  id: string;
  table: CardTable;
  slug: string;
  name: string;
  category: string;
  mythical: boolean;
  descriptor: string | null;
  art_path: string | null;
  art_fallback?: string | null;
  kind?: SpecialKind;
  displayType?: string | null;
  element?: string | null;
  sort_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const TYPE_TO_ELEMENT: Record<string, string> = {
  Lava: "Fire",
  Fire: "Fire",
  Whirlwind: "Air",
  Snow: "Earth",
  Lightning: "Air",
  Sun: "Fire",
  Lake: "Water",
  Ocean: "Water",
  Tree: "Earth",
  Mountain: "Earth",
  Soil: "Earth",
  River: "Water",
  Sky: "Sky",
};

export default function CardEditorDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [descriptor, setDescriptor] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bust, setBust] = useState(0);

  async function load() {
    setLoading(true);
    const [animalsRes, specialsRes] = await Promise.all([
      supabase
        .from("game_cards")
        .select("id, slug, name, type_a, type_b, mythical, descriptor, art_path, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("special_cards")
        .select("id, slug, name, kind, descriptor, art_path, sort_order")
        .order("sort_order", { ascending: true }),
    ]);

    if (animalsRes.error) toast({ title: "Failed to load animal cards", description: animalsRes.error.message, variant: "destructive" });
    if (specialsRes.error) toast({ title: "Failed to load special cards", description: specialsRes.error.message, variant: "destructive" });

    const specialKindLabel: Record<string, string> = {
      creator: "Creator Card",
      sky_creator: "Sky Creator Card",
      golden_body: "Golden Body Card",
      golden_hive: "Golden Hive Card",
    };

    const specials: Card[] = (specialsRes.data ?? []).map((r: any) => {
      const displayType = r.kind === "creator"
        ? CREATOR_TYPE_NAMES.find((type) => `creator-${type.toLowerCase()}` === r.slug) ?? null
        : r.kind === "sky_creator"
          ? "Sky"
          : null;

      return {
        id: r.id,
        table: "special_cards" as const,
        slug: r.slug,
        name: r.name,
        category: specialKindLabel[r.kind] ?? "Special",
        mythical: false,
        descriptor: r.descriptor,
        art_path: r.art_path,
        art_fallback: getSpecialCardFallbackArt(r.slug),
        kind: r.kind,
        displayType,
        element: displayType ? TYPE_TO_ELEMENT[displayType] ?? null : null,
        sort_order: r.sort_order,
      };
    });

    const animals: Card[] = (animalsRes.data ?? []).map((r: any) => ({
      id: r.id,
      table: "game_cards" as const,
      slug: r.slug,
      name: r.name,
      category: `${r.type_a} / ${r.type_b}${r.mythical ? " · Sky Creature" : ""}`,
      mythical: r.mythical,
      descriptor: r.descriptor,
      art_path: r.art_path,
      sort_order: r.sort_order,
    }));

    setCards([...specials, ...animals]);
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  const selected = useMemo(() => cards.find((c) => c.id === selectedId) ?? null, [cards, selectedId]);

  function resolvedDescriptor(card: Card | null) {
    if (!card) return "";
    if (card.descriptor?.trim()) return card.descriptor;
    if (card.table === "special_cards") {
      return getSpecialCardFallbackDescriptor({
        kind: card.kind,
        displayType: card.displayType,
        element: card.element,
      });
    }
    return "";
  }

  useEffect(() => {
    setDescriptor(resolvedDescriptor(selected));
    setName(selected?.name ?? "");
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  }, [cards, filter]);

  function artUrl(path: string | null) {
    if (!path) return null;
    const url = supabase.storage.from(ART_BUCKET).getPublicUrl(path, {
      transform: { width: 200, height: 200, resize: "contain", quality: 80 },
    }).data.publicUrl;
    return bust ? `${url}&_=${bust}` : url;
  }

  function resolvedArt(card: Card | null) {
    if (!card) return null;
    return artUrl(card.art_path) ?? card.art_fallback ?? null;
  }

  async function saveText() {
    if (!selected) return;
    setSaving(true);
    const payload = {
      name: name.trim() || selected.name,
      descriptor: descriptor.trim() || null,
    };
    const { error } = await supabase.from(selected.table).update(payload).eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: `${name.trim() || selected.name} updated` });
    await load();
  }

  async function handleUpload(file: File) {
    if (!selected) return;
    setUploading(true);
    const defaultPrefix = selected.table === "special_cards" ? "cards/special" : "cards/animal";
    const path = selected.art_path || `${defaultPrefix}-${selected.slug}.png`;
    const { error: upErr } = await supabase.storage
      .from(ART_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || "image/png", cacheControl: "3600" });
    if (upErr) {
      setUploading(false);
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    if (!selected.art_path) {
      await supabase.from(selected.table).update({ art_path: path }).eq("id", selected.id);
    }
    setUploading(false);
    setBust(Date.now());
    toast({ title: "Image updated", description: `${selected.name} art replaced` });
    await load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Edit Cards — Name, Descriptor & Image</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          <div className="w-72 border-r border-border flex flex-col">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search cards…"
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {loading && <p className="text-xs text-muted-foreground p-3">Loading…</p>}
              {filtered.map((c) => {
                const previewArt = resolvedArt(c);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/50 border-b border-border/50 ${
                      selectedId === c.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="w-10 h-10 rounded bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                      {previewArt ? (
                        <img src={previewArt} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">no art</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{c.category}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Select a card on the left to edit.
              </div>
            ) : (
              <div className="space-y-5 max-w-2xl">
                <div className="flex items-start gap-4">
                  <div className="w-40 h-40 rounded-lg bg-muted overflow-hidden flex items-center justify-center border border-border">
                    {resolvedArt(selected) ? (
                      <img src={resolvedArt(selected)!} alt={selected.name} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No image</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{selected.category}</Badge>
                      {selected.mythical && <Badge>Sky Creature</Badge>}
                      {selected.table === "special_cards" && !selected.art_path && selected.art_fallback && (
                        <Badge variant="secondary">Using current game art</Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">slug: {selected.slug}</span>
                    </div>
                    <label className="block">
                      <span className="text-xs font-medium text-muted-foreground">Replace image (PNG/JPG)</span>
                      <div className="mt-1 flex items-center gap-2">
                        <Input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(f);
                            e.target.value = "";
                          }}
                          className="text-xs"
                        />
                        {uploading && <Upload className="w-4 h-4 animate-pulse" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Replaces <code>{selected.art_path || `cards/animal-${selected.slug}.png`}</code>
                      </p>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Card name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Descriptor (reverse-side text)
                  </label>
                  <Textarea
                    rows={8}
                    value={descriptor}
                    onChange={(e) => setDescriptor(e.target.value)}
                    placeholder="Short descriptor shown on the reverse of the card…"
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveText} disabled={saving}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

