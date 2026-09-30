import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ApplyDialog from "@/components/frontpage/ApplyDialog";
import type { ProspectusSection } from "@/lib/prospectus";

/** Renders plain text: blank lines split paragraphs, "- " lines become bullets, "1. " lines a numbered list. */
function Body({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/);
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*- /.test(l))) {
          return (
            <ul key={i} className="list-disc pl-6 space-y-1">
              {lines.map((l, j) => <li key={j}>{l.replace(/^\s*- /, "")}</li>)}
            </ul>
          );
        }
        if (lines.length && lines.every((l) => /^\s*\d+\.\s/.test(l))) {
          return (
            <ol key={i} className="list-decimal pl-6 space-y-1">
              {lines.map((l, j) => <li key={j}>{l.replace(/^\s*\d+\.\s/, "")}</li>)}
            </ol>
          );
        }
        return (
          <div key={i}>
            {lines.map((l, j) =>
              /^\s*- /.test(l)
                ? <p key={j} className="pl-4">• {l.replace(/^\s*- /, "")}</p>
                : <p key={j} className={j === 0 && lines.length > 1 ? "font-semibold text-foreground" : ""}>{l}</p>,
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Prospectus() {
  const [sections, setSections] = useState<ProspectusSection[] | null>(null);
  const [params] = useSearchParams();
  const [apply, setApply] = useState<1 | null>(params.get("apply") === "1" ? 1 : null);

  useEffect(() => {
    window.scrollTo(0, 0);
    supabase.from("prospectus_sections" as any).select("id, sort_order, heading, body")
      .order("sort_order").then(({ data }) => setSections((data as unknown as ProspectusSection[]) ?? []));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link to="/#practitioner" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <p className="mt-6 text-sm uppercase tracking-widest text-muted-foreground">13 Creators</p>
        <h1 className="font-display text-4xl mb-2">Practitioner Prospectus</h1>
        <p className="text-muted-foreground mb-8">For lovers of hue-mans, in all their shapes &amp; structures!</p>

        {sections === null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-10">
            {sections.map((s) => (
              <section key={s.id}>
                <h2 className="font-display text-2xl mb-3">{s.heading}</h2>
                <div className="text-muted-foreground leading-relaxed"><Body text={s.body} /></div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-12 rounded-3xl border border-border bg-card p-6 text-center">
          <p className="mb-4">Ready to apply? Answer the four application questions.</p>
          <button onClick={() => setApply(1)} className="rounded-full px-6 py-3 font-medium bg-primary text-primary-foreground hover:opacity-90">
            Apply for Level 1
          </button>
        </div>
      </div>
      <ApplyDialog level={apply} onClose={() => setApply(null)} />
    </div>
  );
}
