import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  sort_order: number;
}

export default function FAQPanel() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("faqs")
      .select("id, category, question, answer, sort_order")
      .eq("audience", "practitioner")
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setFaqs((data as FAQ[]) || []);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading FAQs…</div>;

  if (faqs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
        <HelpCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">No FAQs available yet.</p>
      </div>
    );
  }

  // Group by category
  const categories: { name: string; items: FAQ[] }[] = [];
  const catMap = new Map<string, FAQ[]>();
  faqs.forEach(f => {
    if (!catMap.has(f.category)) catMap.set(f.category, []);
    catMap.get(f.category)!.push(f);
  });
  catMap.forEach((items, name) => categories.push({ name, items }));

  return (
    <div className="space-y-6">
      {categories.map(cat => (
        <div key={cat.name} className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">{cat.name}</h3>
          <Accordion type="multiple" className="space-y-1">
            {cat.items.map(faq => (
              <AccordionItem key={faq.id} value={faq.id} className="border-b-0">
                <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline py-2.5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground whitespace-pre-line pb-3">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </div>
  );
}
