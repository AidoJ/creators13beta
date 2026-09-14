import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Search, KeyRound, Trash2, Plus } from "lucide-react";

interface LevelRow { key: string; display_name: string; sort_order: number }
interface UserRow { user_id: string; email: string | null; first_name: string | null; last_name: string | null }
interface EntitlementRow {
  id: string;
  user_id: string;
  level_key: string;
  source: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
}

export default function EntitlementsPanel() {
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [rows, setRows] = useState<EntitlementRow[]>([]);
  const [newLevel, setNewLevel] = useState<string>("");
  const [newEndsAt, setNewEndsAt] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("access_levels")
      .select("key, display_name, sort_order")
      .order("sort_order")
      .then(({ data }) => setLevels(data || []));
  }, []);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setUsers([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, email, first_name, last_name")
        .or(`email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
        .limit(20);
      if (!cancelled) setUsers(data || []);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  async function loadEntitlements(userId: string) {
    const { data, error } = await supabase
      .from("entitlements")
      .select("id, user_id, level_key, source, starts_at, ends_at, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Could not load access levels", description: error.message, variant: "destructive" });
      return;
    }
    setRows(data || []);
  }

  function pickUser(u: UserRow) {
    setSelected(u);
    setRows([]);
    loadEntitlements(u.user_id);
  }

  async function grant() {
    if (!selected || !newLevel) return;
    setBusy(true);
    const { error } = await supabase.from("entitlements").insert({
      user_id: selected.user_id,
      level_key: newLevel,
      source: "admin",
      ends_at: newEndsAt ? new Date(newEndsAt).toISOString() : null,
      status: "active",
    });
    setBusy(false);
    if (error) {
      toast({ title: "Grant failed", description: error.message, variant: "destructive" });
      return;
    }
    setNewLevel("");
    setNewEndsAt("");
    toast({ title: "Access level granted" });
    loadEntitlements(selected.user_id);
  }

  async function revoke(id: string) {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase
      .from("entitlements")
      .update({ status: "cancelled", ends_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(false);
    if (error) {
      toast({ title: "Revoke failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Access level revoked" });
    loadEntitlements(selected.user_id);
  }

  const levelName = useMemo(() => {
    const m = new Map(levels.map(l => [l.key, l.display_name]));
    return (k: string) => m.get(k) || k;
  }, [levels]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Access Levels</h3>
          <Badge variant="outline" className="text-[10px]">New system — not yet in use</Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search a person by name or email"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {users.length > 0 && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {users.map(u => (
              <button
                key={u.user_id}
                onClick={() => pickUser(u)}
                className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
              >
                <span className="font-medium">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</span>
                <span className="text-muted-foreground ml-2">{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div>
            <p className="font-semibold">
              {[selected.first_name, selected.last_name].filter(Boolean).join(" ") || selected.email}
            </p>
            <p className="text-xs text-muted-foreground">{selected.email}</p>
          </div>

          <div className="space-y-2">
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">No access levels held yet.</p>
            )}
            {rows.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{levelName(r.level_key)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.source} · from {new Date(r.starts_at).toLocaleDateString()}
                    {r.ends_at ? ` · until ${new Date(r.ends_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={r.status === "active" ? "default" : "secondary"} className="text-[10px]">
                    {r.status}
                  </Badge>
                  {r.status === "active" && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => revoke(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border">
            <div className="min-w-[200px]">
              <label className="text-xs text-muted-foreground">Access level</label>
              <Select value={newLevel} onValueChange={setNewLevel}>
                <SelectTrigger><SelectValue placeholder="Choose a level" /></SelectTrigger>
                <SelectContent>
                  {levels.map(l => (
                    <SelectItem key={l.key} value={l.key}>{l.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Ends (optional)</label>
              <Input type="date" value={newEndsAt} onChange={e => setNewEndsAt(e.target.value)} />
            </div>
            <Button onClick={grant} disabled={!newLevel || busy}>
              <Plus className="h-4 w-4 mr-1" />Grant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
