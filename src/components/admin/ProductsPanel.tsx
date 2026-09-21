import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Save, ShoppingBag, RefreshCw } from "lucide-react";

interface LevelRow { key: string; display_name: string; sort_order: number }
interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string | null;
  billing_shape: string;
  term_months: number | null;
  grants_level_key: string | null;
  seat_cap: number | null;
  active: boolean | null;
  is_visible_on_storefront: boolean;
}

const BLANK: Omit<ProductRow, "id"> = {
  name: "",
  description: "",
  price_cents: 0,
  currency: "aud",
  billing_shape: "one_off",
  term_months: null,
  grants_level_key: null,
  seat_cap: null,
  active: true,
  is_visible_on_storefront: false,
};

const SHAPES = [
  { value: "one_off", label: "One-off payment" },
  { value: "recurring", label: "Ongoing monthly" },
  { value: "fixed_term", label: "Fixed term (set number of monthly instalments)" },
];

function money(cents: number, currency: string | null) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: (currency || "aud").toUpperCase() })
    .format((cents || 0) / 100);
}

export default function ProductsPanel() {
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [editing, setEditing] = useState<Partial<ProductRow> | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: lv }, { data: pr }] = await Promise.all([
      supabase.from("access_levels").select("key, display_name, sort_order").order("sort_order"),
      supabase.from("products").select("*").order("created_at", { ascending: false }),
    ]);
    setLevels(lv || []);
    setRows((pr as unknown as ProductRow[]) || []);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.name?.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (editing.billing_shape === "fixed_term" && !editing.term_months) {
      toast({ title: "A fixed term needs a number of months", variant: "destructive" });
      return;
    }
    setBusy(true);
    const payload = {
      name: editing.name,
      description: editing.description || null,
      price_cents: Number(editing.price_cents ?? 0),
      currency: (editing.currency || "aud").toLowerCase(),
      billing_shape: editing.billing_shape || "one_off",
      term_months: editing.billing_shape === "fixed_term" ? Number(editing.term_months) : null,
      grants_level_key: editing.grants_level_key || null,
      seat_cap: editing.seat_cap ? Number(editing.seat_cap) : null,
      active: editing.active ?? true,
      is_visible_on_storefront: editing.is_visible_on_storefront ?? false,
    };
    const { error } = editing.id
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    setBusy(false);
    if (error) { toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing.id ? "Product updated" : "Product added" });
    setEditing(null);
    load();
  }

  async function toggle(row: ProductRow, field: "active" | "is_visible_on_storefront", value: boolean) {
    const { error } = await supabase.from("products").update({ [field]: value }).eq("id", row.id);
    if (error) { toast({ title: "Could not update", description: error.message, variant: "destructive" }); return; }
    setRows((r) => r.map((x) => (x.id === row.id ? { ...x, [field]: value } : x)));
  }

  async function moveSubscribers(row: ProductRow) {
    if (!confirm(`Move everyone currently subscribed to "${row.name}" onto the current price of ${money(row.price_cents, row.currency)}? The new amount takes effect at each person's next renewal.`)) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-migrate-product-price", {
      body: { product_id: row.id },
    });
    setBusy(false);
    if (error) { toast({ title: "Could not move subscribers", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Moved ${(data as any)?.moved_count ?? 0} subscriber(s)`, description: "The new price applies from their next renewal." });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-display flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" /> Products & pricing
        </h2>
        <Button size="sm" onClick={() => setEditing({ ...BLANK })}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add product
        </Button>
      </div>

      {editing && (
        <div className="rounded-lg border border-border p-4 space-y-3 bg-card">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Price (in cents)</Label>
              <Input type="number" value={editing.price_cents ?? 0}
                onChange={(e) => setEditing({ ...editing, price_cents: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} value={editing.description || ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">How it is billed</Label>
              <Select value={editing.billing_shape || "one_off"}
                onValueChange={(v) => setEditing({ ...editing, billing_shape: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHAPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editing.billing_shape === "fixed_term" && (
              <div className="space-y-1">
                <Label className="text-xs">Number of monthly instalments</Label>
                <Input type="number" value={editing.term_months ?? ""}
                  onChange={(e) => setEditing({ ...editing, term_months: Number(e.target.value) })} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Access it grants</Label>
              <Select value={editing.grants_level_key || "none"}
                onValueChange={(v) => setEditing({ ...editing, grants_level_key: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No access level</SelectItem>
                  {levels.map((l) => <SelectItem key={l.key} value={l.key}>{l.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Places available (blank = unlimited)</Label>
              <Input type="number" value={editing.seat_cap ?? ""}
                onChange={(e) => setEditing({ ...editing, seat_cap: e.target.value ? Number(e.target.value) : null })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
              Active
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={editing.is_visible_on_storefront ?? false}
                onCheckedChange={(v) => setEditing({ ...editing, is_visible_on_storefront: v })} />
              Show on storefront
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">No products yet.</p>}
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-border p-3 bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{row.name}</span>
                  <Badge variant="secondary" className="text-[0.6rem]">
                    {SHAPES.find((s) => s.value === row.billing_shape)?.label || row.billing_shape}
                  </Badge>
                  {row.grants_level_key && (
                    <Badge variant="outline" className="text-[0.6rem]">
                      {levels.find((l) => l.key === row.grants_level_key)?.display_name || row.grants_level_key}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {money(row.price_cents, row.currency)}
                  {row.billing_shape === "fixed_term" && row.term_months ? ` x ${row.term_months} months` : ""}
                  {row.billing_shape === "recurring" ? " per month" : ""}
                  {row.seat_cap ? ` · ${row.seat_cap} places` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={!!row.active} onCheckedChange={(v) => toggle(row, "active", v)} /> Active
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={row.is_visible_on_storefront} onCheckedChange={(v) => toggle(row, "is_visible_on_storefront", v)} /> Storefront
                </label>
                <Button size="sm" variant="outline" onClick={() => setEditing(row)}>Edit</Button>
                {row.billing_shape !== "one_off" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => moveSubscribers(row)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Move subscribers to this price
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
