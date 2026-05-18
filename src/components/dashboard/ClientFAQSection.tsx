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

export default function ClientFAQSection() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("faqs")
      .select("id, category, question, answer, sort_order")
      .eq("audience", "client")
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setFaqs((data as FAQ[]) || []);
        setLoading(false);
      });
  }, []);

  if (loading) return null;
  if (faqs.length === 0) return null;

  const catMap = new Map<string, FAQ[]>();
  faqs.forEach(f => {
    if (!catMap.has(f.category)) catMap.set(f.category, []);
    catMap.get(f.category)!.push(f);
  });
  const categories: { name: string; items: FAQ[] }[] = [];
  catMap.forEach((items, name) => categories.push({ name, items }));

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-display font-bold text-foreground">Frequently Asked Questions</h2>
      </div>
      <div className="space-y-4">
        {categories.map(cat => (
          <div key={cat.name}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat.name}</p>
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
    </div>
  );
}
