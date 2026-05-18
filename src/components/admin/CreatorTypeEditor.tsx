import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CREATOR_TYPE_NAMES, getCreatorTypeColor } from "@/lib/creatorTypes";
import { Button } from "@/components/ui/button";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

interface CreatorTypeEditorProps {
  caseStudyId: string;
  currentTypes: string[] | null;
  onUpdated: (newTypes: string[]) => void;
}

export default function CreatorTypeEditor({ caseStudyId, currentTypes, onUpdated }: CreatorTypeEditorProps) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => 
    [...new Set((currentTypes || []).map(t => t.toLowerCase()))]
  );
  const [saving, setSaving] = useState(false);

  function toggle(type: string) {
    setSelected(prev => prev.includes(type.toLowerCase()) 
      ? prev.filter(t => t !== type.toLowerCase()) 
      : [...prev, type.toLowerCase()]
    );
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("case_studies")
      .update({ creator_types_identified: selected })
      .eq("id", caseStudyId);

    if (error) {
      toast.error("Failed to update creator types");
    } else {
      toast.success("Creator types updated");
      onUpdated(selected);
      setEditing(false);
    }
    setSaving(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Creator Types:</span>
        {currentTypes && currentTypes.length > 0 ? currentTypes.map(t => {
          const c = getCreatorTypeColor(t);
          return (
            <span
              key={t}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
              style={{ backgroundColor: `${c}22`, color: c, border: `1px solid ${c}44` }}
            >
              {t}
            </span>
          );
        }) : <span className="text-xs text-muted-foreground italic">None assigned</span>}
        <Button size="sm" variant="ghost" className="h-6 text-xs ml-1" onClick={() => { setSelected([...new Set((currentTypes || []).map(t => t.toLowerCase()))]); setEditing(true); }}>
          <Pencil className="h-3 w-3 mr-1" />Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edit Creator Types</p>
      <div className="flex flex-wrap gap-1.5">
        {CREATOR_TYPE_NAMES.map(name => {
          const key = name.toLowerCase();
          const c = getCreatorTypeColor(key);
          const isSelected = selected.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggle(name)}
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize transition-all"
              style={{
                backgroundColor: isSelected ? `${c}33` : "transparent",
                color: isSelected ? c : `${c}88`,
                border: `1.5px solid ${isSelected ? c : `${c}33`}`,
                opacity: isSelected ? 1 : 0.7,
              }}
            >
              {isSelected && <Check className="h-3 w-3 mr-1" />}
              {name}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving} className="h-7 text-xs">
          {saving ? "Saving…" : "Save Changes"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
          <X className="h-3 w-3 mr-1" />Cancel
        </Button>
      </div>
    </div>
  );
}
