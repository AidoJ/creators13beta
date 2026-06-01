import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, Save, Search } from "lucide-react";

const ART_BUCKET = "game-card-art";

interface Card {
  id: string;
  slug: string;
  name: string;
  type_a: string;
  type_b: string;
  mythical: boolean;
  descriptor: string | null;
  art_path: string | null;
  sort_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

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
  const [bust, setBust] = useState(0); // cache-bust art previews after upload

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("game_cards")
      .select("id, slug, name, type_a, type_b, mythical, descriptor, art_path, sort_order")
      .order("sort_order", { ascending: true });
    if (error) toast({ title: "Failed to load cards", description: error.message, variant: "destructive" });
    setCards((data as Card[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { if (open) load(); }, [open]);

  const selected = useMemo(() => cards.find((c) => c.id === selectedId) ?? null, [cards, selectedId]);

  useEffect(() => {
    setDescriptor(selected?.descriptor ?? "");
    setName(selected?.name ?? "");
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.type_a.toLowerCase().includes(q) ||
      c.type_b.toLowerCase().includes(q)
    );
  }, [cards, filter]);

  function artUrl(path: string | null) {
    if (!path) return null;
    const url = supabase.storage.from(ART_BUCKET).getPublicUrl(path, {
      transform: { width: 200, height: 200, resize: "contain", quality: 80 },
    }).data.publicUrl;
    return bust ? `${url}&_=${bust}` : url;
  }

  async function saveText() {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from("game_cards")
      .update({ name: name.trim() || selected.name, descriptor: descriptor })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: `${selected.name} updated` });
    await load();
  }

  async function handleUpload(file: File) {
    if (!selected) return;
    setUploading(true);
    const path = selected.art_path || `cards/animal-${selected.slug}.png`;
    const { error: upErr } = await supabase.storage
      .from(ART_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || "image/png", cacheControl: "3600" });
    if (upErr) {
      setUploading(false);
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    if (!selected.art_path) {
      await supabase.from("game_cards").update({ art_path: path }).eq("id", selected.id);
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
          {/* Left: card list */}
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
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/50 border-b border-border/50 ${
                    selectedId === c.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="w-10 h-10 rounded bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                    {c.art_path ? (
                      <img src={artUrl(c.art_path)!} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">no art</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {c.type_a} / {c.type_b}{c.mythical ? " · Sky Creature" : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: editor */}
          <div className="flex-1 overflow-auto p-6">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Select a card on the left to edit.
              </div>
            ) : (
              <div className="space-y-5 max-w-2xl">
                <div className="flex items-start gap-4">
                  <div className="w-40 h-40 rounded-lg bg-muted overflow-hidden flex items-center justify-center border border-border">
                    {selected.art_path ? (
                      <img src={artUrl(selected.art_path)!} alt={selected.name} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No image</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{selected.type_a}</Badge>
                      <Badge variant="outline">{selected.type_b}</Badge>
                      {selected.mythical && <Badge>Sky Creature</Badge>}
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
                    placeholder="Short descriptor shown on the reverse of the animal card…"
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
