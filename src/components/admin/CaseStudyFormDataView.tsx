import AttachmentGallery from "@/components/practitioner/AttachmentGallery";

interface CaseStudyFormDataViewProps {
  formData: Record<string, any>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="mb-2">
      <span className="text-xs font-medium text-primary italic">{label}</span>
      <p className="text-sm text-foreground whitespace-pre-wrap mt-0.5">{value}</p>
    </div>
  );
}

/** Convert snake_case key to a readable label */
function keyToLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

/** Render all string fields in an object, using known labels where available */
function DynamicFields({ data, knownLabels }: { data: Record<string, any>; knownLabels?: Record<string, string> }) {
  return (
    <>
      {Object.entries(data).map(([key, value]) => {
        if (!value || typeof value !== "string") return null;
        const label = knownLabels?.[key] || keyToLabel(key);
        return <Field key={key} label={label} value={value} />;
      })}
    </>
  );
}

export default function CaseStudyFormDataView({ formData }: CaseStudyFormDataViewProps) {
  const p1 = formData.page1 || {};
  const p2 = formData.page2 || {};
  const p3 = formData.page3 || {};
  const p4 = formData.page4 || {};

  const hasP1 = Object.values(p1).some(v => v);
  const hasP2 = Object.values(p2).some(v => v);
  const hasP3 = Object.values(p3).some(v => v);
  const hasP4 = Object.values(p4).some(v => v);

  const hasAttachments = formData.attachments && Array.isArray(formData.attachments) && formData.attachments.length > 0;

  if (!hasP1 && !hasP2 && !hasP3 && !hasP4 && !hasAttachments) {
    return <p className="text-sm text-muted-foreground italic">No assessment data recorded.</p>;
  }

  return (
    <div className="space-y-4 bg-card rounded-lg border border-border p-4 max-h-[600px] overflow-y-auto">
      {hasP1 && (
        <Section title="Page 1 — Body Assessment">
          <DynamicFields data={p1} knownLabels={{
            head_neck: "Head / Neck", chest_arms: "Chest / Arms", belly_waist: "Belly / Waist",
            upper_thighs_hips_buttocks: "Upper Thighs / Hips / Buttocks", legs_feet: "Legs / Feet",
          }} />
        </Section>
      )}

      {hasP2 && (
        <Section title="Page 2 — Assessment Details">
          <DynamicFields data={p2} knownLabels={{
            prominent_features_face: "Prominent Features — Face", prominent_features_body: "Prominent Features — Body",
            prominent_features_hands_feet: "Prominent Features — Hands + Feet", concentration_of_tissue: "Concentration of Tissue",
            concentration_tissue: "Concentration of Tissue", structure_shapes: "Structure Shapes",
            skeletal_shapes: "Skeletal Shapes", other_ailments: "Other Ailments / Comments",
          }} />
        </Section>
      )}

      {hasP3 && (
        <Section title="Page 3 — Feedback Preparation">
          <DynamicFields data={p3} knownLabels={{
            key_features_ct1: "CT1", key_features_ct2: "CT2",
            key_features_other: "Other notable features", key_questions: "KEY QUESTIONS To Ask Your Case Study",
          }} />
        </Section>
      )}

      {hasP4 && (
        <Section title="Page 4 — Feedback Reflection">
          <DynamicFields data={p4} knownLabels={{
            light_bulb_moments: "Light bulb moments for your case study…",
            what_learned: "What you learned from this body or how it shifted you…",
            what_went_well: "What went well + what you would do differently next time…",
            potential_follow_up: "POTENTIAL FOLLOW-UP With Your Case Study",
            other_comments: "Other comments",
            notes: "Notes",
          }} />
        </Section>
      )}

      {formData.attachments && Array.isArray(formData.attachments) && formData.attachments.length > 0 && (
        <AttachmentGallery attachments={formData.attachments as string[]} />
      )}
    </div>
  );
}
