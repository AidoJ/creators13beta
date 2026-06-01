import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Save, BookOpen, ChevronDown, ChevronUp, Upload, ImageOff } from "lucide-react";
import { CREATOR_TYPE_NAMES, getCreatorTypeColor } from "@/lib/creatorTypes";

interface Row {
  id: string;
  name: string;
  signature: string | null;
  at_the_table: string | null;
  shadow_side: string | null;
  you_might_be_if: string | null;
  /** Repurposed: now stores the Body Image Illustration URL. */
  famous_person_photo_url: string | null;
}

export default function CreatorContentEditor() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("creator_types")
        .select("id, name, signature, at_the_table, shadow_side, you_might_be_if, famous_person_photo_url")
        .order("sort_order", { ascending: true });
      setRows(((data ?? []) as any) as Row[]);
      setLoading(false);
    })();
  }, []);

  function update(id: string, key: keyof Row, value: string | null) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  async function save(row: Row) {
    setSavingId(row.id);
    const { error } = await supabase
      .from("creator_types")
      .update({
        signature: row.signature,
        at_the_table: row.at_the_table,
        shadow_side: row.shadow_side,
        you_might_be_if: row.you_might_be_if,
        famous_person_photo_url: row.famous_person_photo_url,
      })
      .eq("id", row.id);
    setSavingId(null);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: `${row.name} updated` });
  }

  async function uploadBodyImage(row: Row, file: File) {
    setUploadingId(row.id);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `body-illustrations/${row.name.toLowerCase()}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("game-card-art")
        .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("game-card-art").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: dbErr } = await supabase
        .from("creator_types")
        .update({ famous_person_photo_url: url })
        .eq("id", row.id);
      if (dbErr) throw dbErr;
      update(row.id, "famous_person_photo_url", url);
      toast({ title: `${row.name} body image uploaded` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  }

  async function clearBodyImage(row: Row) {
    const { error } = await supabase
      .from("creator_types")
      .update({ famous_person_photo_url: null })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Remove failed", description: error.message, variant: "destructive" });
      return;
    }
    update(row.id, "famous_person_photo_url", null);
    toast({ title: `${row.name} body image removed` });
  }

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading Creator content…</div>;

  const sorted = [...rows].sort(
    (a, b) => CREATOR_TYPE_NAMES.indexOf(a.name as any) - CREATOR_TYPE_NAMES.indexOf(b.name as any),
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Creator Card Info (back-of-card content)</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Shown in the in-game card Info popup. One random aspect is revealed per open.
      </p>
      <div className="space-y-2">
        {sorted.map((r) => {
          const c = getCreatorTypeColor(r.name);
          const isOpen = expanded === r.id;
          return (
            <div key={r.id} className="rounded-md border border-border bg-background">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : r.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
              >
                <span className="w-3 h-3 rounded-full" style={{ background: c }} />
                <span className="text-sm font-semibold">{r.name}</span>
                {isOpen ? <ChevronUp className="ml-auto w-4 h-4" /> : <ChevronDown className="ml-auto w-4 h-4" />}
              </button>
              {isOpen && (
                <div className="p-3 border-t border-border space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Body image illustration</Label>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-20 h-20 rounded-md border border-border bg-muted/30 overflow-hidden flex items-center justify-center"
                        style={{ borderColor: c }}
                      >
                        {r.famous_person_photo_url ? (
                          <img
                            src={r.famous_person_photo_url}
                            alt={`${r.name} body illustration`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <ImageOff className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="inline-flex items-center gap-1 text-xs cursor-pointer bg-secondary text-secondary-foreground rounded-md px-2 py-1 hover:bg-secondary/80">
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingId === r.id ? "Uploading…" : (r.famous_person_photo_url ? "Replace image" : "Upload image")}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadBodyImage(r, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {r.famous_person_photo_url && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => clearBodyImage(r)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                    <Input
                      placeholder="…or paste an image URL"
                      value={r.famous_person_photo_url ?? ""}
                      onChange={(e) => update(r.id, "famous_person_photo_url", e.target.value)}
                      className="h-8"
                    />
                  </div>
                  {([
                    ["signature", "Natural State"],
                    ["at_the_table", "At the table"],
                    ["shadow_side", "Disaster State"],
                    ["you_might_be_if", `You might be a ${r.name} if…`],
                  ] as const).map(([k, label]) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Textarea
                        rows={3}
                        value={(r[k] as string) ?? ""}
                        onChange={(e) => update(r.id, k, e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => save(r)} disabled={savingId === r.id}>
                      <Save className="w-3.5 h-3.5 mr-1" />
                      {savingId === r.id ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
