import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, Edit2, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CREATOR_TYPE_ORDER } from "@/data/cards";

type Category = "family" | "element" | "team_role" | "signature" | "at_the_table" | "shadow_side" | "you_might_be_if" | "animal";
type Option = "a" | "b" | "c" | "d";
type Review = "pending" | "approved" | "rejected";

interface Q {
  id: string;
  creator_type: string;
  category: Category;
  prompt: string;
  option_a: string; option_b: string; option_c: string; option_d: string;
  correct_option: Option;
  explanation: string | null;
  source_field: string | null;
  active: boolean;
  review_status: Review;
  version: number;
  updated_at: string;
}

const CATEGORIES: Category[] = ["family", "element", "team_role", "signature", "at_the_table", "shadow_side", "you_might_be_if", "animal"];

export default function QuizBankPanel() {
  const [rows, setRows] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fCat, setFCat] = useState<Category | "all">("all");
  const [fReview, setFReview] = useState<Review | "all">("all");
  const [fActive, setFActive] = useState<"all" | "true" | "false">("all");
  const [fCreator, setFCreator] = useState<string>("all");
  const [editing, setEditing] = useState<Q | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("quiz_questions").select("*").order("creator_type").order("category").order("updated_at", { ascending: false });
    if (error) toast({ title: "Load failed", description: error.message, variant: "destructive" });
    else setRows((data ?? []) as Q[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (fCat !== "all" && r.category !== fCat) return false;
    if (fReview !== "all" && r.review_status !== fReview) return false;
    if (fActive !== "all" && String(r.active) !== fActive) return false;
    if (fCreator !== "all" && r.creator_type !== fCreator) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![r.prompt, r.option_a, r.option_b, r.option_c, r.option_d, r.explanation ?? ""].some(t => t.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [rows, search, fCat, fReview, fActive, fCreator]);

  const counts = useMemo(() => ({
    total: rows.length,
    approved: rows.filter(r => r.review_status === "approved").length,
    pending: rows.filter(r => r.review_status === "pending").length,
    active: rows.filter(r => r.active).length,
  }), [rows]);

  const setReview = async (id: string, status: Review) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("quiz_questions").update({
      review_status: status,
      reviewed_by: u.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    setRows(rs => rs.map(r => r.id === id ? { ...r, review_status: status } : r));
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("quiz_questions").update({ active }).eq("id", id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    setRows(rs => rs.map(r => r.id === id ? { ...r, active } : r));
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    const { error } = await supabase.from("quiz_questions").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    setRows(rs => rs.filter(r => r.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{counts.total} total</Badge>
        <Badge variant="outline" className="border-green-500/50 text-green-700 dark:text-green-400">{counts.approved} approved</Badge>
        <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">{counts.pending} pending review</Badge>
        <Badge variant="outline">{counts.active} active</Badge>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />New question</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search text…" className="pl-8" />
        </div>
        <Select value={fCat} onValueChange={v => setFCat(v as any)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fCreator} onValueChange={setFCreator}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Creators</SelectItem>
            <SelectItem value="ALL">Non-specific</SelectItem>
            {CREATOR_TYPE_ORDER.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fReview} onValueChange={v => setFReview(v as any)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any review</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fActive} onValueChange={v => setFActive(v as any)}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any active</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length} shown</div>

      <div className="space-y-2">
        {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!loading && filtered.map(r => (
          <div key={r.id} className="rounded-md border p-3 text-sm space-y-2 bg-card">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{r.creator_type}</Badge>
              <Badge variant="outline">{r.category.replace(/_/g, " ")}</Badge>
              <Badge variant={r.review_status === "approved" ? "default" : r.review_status === "pending" ? "secondary" : "destructive"}>
                {r.review_status}
              </Badge>
              <Badge variant={r.active ? "default" : "outline"}>{r.active ? "active" : "inactive"}</Badge>
              {r.source_field && <span className="text-muted-foreground">· {r.source_field}</span>}
              <div className="ml-auto flex gap-1">
                {r.review_status !== "approved" && <Button size="sm" variant="ghost" onClick={() => setReview(r.id, "approved")} title="Approve"><Check className="h-3.5 w-3.5" /></Button>}
                {r.review_status !== "rejected" && <Button size="sm" variant="ghost" onClick={() => setReview(r.id, "rejected")} title="Reject"><X className="h-3.5 w-3.5" /></Button>}
                <Button size="sm" variant="ghost" onClick={() => toggleActive(r.id, !r.active)}>{r.active ? "Deactivate" : "Activate"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
              </div>
            </div>
            <div className="font-medium">{r.prompt}</div>
            <div className="grid gap-1 md:grid-cols-2 text-xs">
              {(["a", "b", "c", "d"] as Option[]).map(k => (
                <div key={k} className={r.correct_option === k ? "text-green-700 dark:text-green-400 font-medium" : ""}>
                  {k.toUpperCase()}. {r[`option_${k}` as const]}
                </div>
              ))}
            </div>
            {r.explanation && <div className="text-xs text-muted-foreground italic">— {r.explanation}</div>}
          </div>
        ))}
      </div>

      {editing && <EditDialog q={editing} onClose={() => setEditing(null)} onSaved={(saved) => {
        setRows(rs => rs.map(r => r.id === saved.id ? saved : r));
        setEditing(null);
      }} />}
      {newOpen && <EditDialog onClose={() => setNewOpen(false)} onSaved={(saved) => { setRows(rs => [saved, ...rs]); setNewOpen(false); }} />}
    </div>
  );
}

function EditDialog({ q, onClose, onSaved }: { q?: Q; onClose: () => void; onSaved: (q: Q) => void }) {
  const [form, setForm] = useState<Partial<Q>>(q ?? {
    creator_type: "Lava", category: "family", prompt: "",
    option_a: "", option_b: "", option_c: "", option_d: "",
    correct_option: "a", explanation: "", active: true, review_status: "pending",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Q, v: any) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.prompt || !form.option_a || !form.option_b || !form.option_c || !form.option_d) {
      toast({ title: "Fill all fields", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = {
      creator_type: form.creator_type!,
      category: form.category!,
      prompt: form.prompt!,
      option_a: form.option_a!, option_b: form.option_b!, option_c: form.option_c!, option_d: form.option_d!,
      correct_option: form.correct_option!,
      explanation: form.explanation ?? null,
      active: !!form.active,
      review_status: form.review_status!,
    };
    const res = q
      ? await supabase.from("quiz_questions").update(payload).eq("id", q.id).select().single()
      : await supabase.from("quiz_questions").insert(payload).select().single();
    setSaving(false);
    if (res.error) { toast({ title: "Save failed", description: res.error.message, variant: "destructive" }); return; }
    onSaved(res.data as Q);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{q ? "Edit question" : "New question"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><div className="text-xs text-muted-foreground">Creator</div>
              <Select value={form.creator_type} onValueChange={v => set("creator_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">ALL (non-specific)</SelectItem>
                  {CREATOR_TYPE_ORDER.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1"><div className="text-xs text-muted-foreground">Category</div>
              <Select value={form.category} onValueChange={v => set("category", v as Category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </label>
          </div>
          <label className="space-y-1 block"><div className="text-xs text-muted-foreground">Prompt</div>
            <Textarea value={form.prompt ?? ""} onChange={e => set("prompt", e.target.value)} rows={3} />
          </label>
          {(["a", "b", "c", "d"] as Option[]).map(k => (
            <div key={k} className="flex gap-2 items-start">
              <div className={`w-6 pt-2 text-center font-bold ${form.correct_option === k ? "text-green-600" : ""}`}>{k.toUpperCase()}</div>
              <Textarea rows={1} value={(form as any)[`option_${k}`] ?? ""} onChange={e => set(`option_${k}` as keyof Q, e.target.value)} className="flex-1" />
              <Button size="sm" variant={form.correct_option === k ? "default" : "outline"} onClick={() => set("correct_option", k)}>Correct</Button>
            </div>
          ))}
          <label className="space-y-1 block"><div className="text-xs text-muted-foreground">Explanation</div>
            <Textarea value={form.explanation ?? ""} onChange={e => set("explanation", e.target.value)} rows={2} />
          </label>
          <div className="flex flex-wrap gap-3 text-xs items-center">
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!form.active} onChange={e => set("active", e.target.checked)} /> Active</label>
            <label className="flex items-center gap-2">Review:
              <Select value={form.review_status} onValueChange={v => set("review_status", v as Review)}>
                <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
