import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Save, X, HelpCircle } from "lucide-react";

interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  sort_order: number;
  audience: string;
}

export default function FAQManagerPanel() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state for add/edit
  const [category, setCategory] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [audience, setAudience] = useState("practitioner");
  const [showAdd, setShowAdd] = useState(false);
  const [filterAudience, setFilterAudience] = useState<string>("all");

  const fetchFaqs = useCallback(async () => {
    const { data } = await supabase
      .from("faqs")
      .select("id, category, question, answer, sort_order, audience")
      .order("sort_order", { ascending: true });
    setFaqs((data as FAQ[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchFaqs(); }, [fetchFaqs]);

  function resetForm() {
    setCategory(""); setQuestion(""); setAnswer(""); setSortOrder(0); setAudience("practitioner");
    setShowAdd(false); setEditingId(null);
  }

  function startEdit(faq: FAQ) {
    setEditingId(faq.id);
    setCategory(faq.category);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setSortOrder(faq.sort_order);
    setAudience(faq.audience);
    setShowAdd(false);
  }

  function startAdd() {
    resetForm();
    setSortOrder(faqs.length > 0 ? Math.max(...faqs.map(f => f.sort_order)) + 1 : 1);
    setShowAdd(true);
  }

  async function handleSave() {
    if (!question.trim() || !answer.trim() || !category.trim()) return;

    if (editingId) {
      const { error } = await supabase.from("faqs").update({
        category: category.trim(),
        question: question.trim(),
        answer: answer.trim(),
        sort_order: sortOrder,
        audience,
      }).eq("id", editingId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "FAQ updated" });
        resetForm();
        await fetchFaqs();
      }
    } else {
      const { error } = await supabase.from("faqs").insert({
        category: category.trim(),
        question: question.trim(),
        answer: answer.trim(),
        sort_order: sortOrder,
        audience,
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "FAQ added" });
        resetForm();
        await fetchFaqs();
      }
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("faqs").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "FAQ deleted" });
      if (editingId === id) resetForm();
      await fetchFaqs();
    }
  }

  // Filter and group
  const filtered = filterAudience === "all" ? faqs : faqs.filter(f => f.audience === filterAudience);
  const categories: { name: string; items: FAQ[] }[] = [];
  const catMap = new Map<string, FAQ[]>();
  filtered.forEach(f => {
    if (!catMap.has(f.category)) catMap.set(f.category, []);
    catMap.get(f.category)!.push(f);
  });
  catMap.forEach((items, name) => categories.push({ name, items }));

  const isFormOpen = showAdd || editingId;

  return (
    <div className="space-y-6">
      {/* Add/Edit form */}
      {isFormOpen && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit FAQ" : "Add New FAQ"}
            </h3>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={resetForm}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category *</label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Certification" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Sort Order</label>
              <Input type="number" value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Audience *</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={audience} onChange={e => setAudience(e.target.value)}>
                <option value="practitioner">Practitioner</option>
                <option value="client">Client</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Question *</label>
            <Input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Enter the question…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Answer *</label>
            <Textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={4} placeholder="Enter the answer…" />
          </div>
          <Button onClick={handleSave} disabled={!question.trim() || !answer.trim() || !category.trim()}>
            <Save className="h-4 w-4 mr-1" />{editingId ? "Update FAQ" : "Add FAQ"}
          </Button>
        </div>
      )}

      {!isFormOpen && (
        <div className="flex items-center gap-3">
          <Button onClick={startAdd} variant="outline">
            <Plus className="h-4 w-4 mr-1" /> Add New FAQ
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">Filter:</span>
            {["all", "practitioner", "client"].map(v => (
              <Button key={v} size="sm" variant={filterAudience === v ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setFilterAudience(v)}>
                {v}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* FAQ list by category */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
      ) : faqs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <HelpCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No FAQs yet. Add one above.</p>
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat.name} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat.name}</span>
            </div>
            <div className="divide-y divide-border">
              {cat.items.map(faq => (
                <div key={faq.id} className={`p-4 ${editingId === faq.id ? "bg-accent/10" : "hover:bg-accent/5"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{faq.question}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${faq.audience === 'client' ? 'bg-blue-500/10 text-blue-600' : 'bg-green-500/10 text-green-600'}`}>
                          {faq.audience}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{faq.answer}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(faq)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(faq.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
