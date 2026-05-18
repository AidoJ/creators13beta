import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Save, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { TierKey } from "@/lib/tiers";
import { getCreatorTypeColor } from "@/lib/creatorTypes";

interface CreatorType {
  name: string;
  family: string;
  element: string;
  color_hex: string | null;
}

interface CreatorTypeAssignmentFormProps {
  clientId: string;
  clientName: string;
}

// Tier-based type slot limits
const TIER_TYPE_LIMITS: Record<string, number> = {
  wren: 1,
  robin: 2,
  falcon: 4,
  owl: 4,
};

// Case study participants get 2 slots (for wren)
function getMaxSlots(tier: TierKey | null, isCaseStudy: boolean): number {
  if (!tier) return 1;
  const base = TIER_TYPE_LIMITS[tier] || 1;
  // Wren case study gets 2
  if (tier === "wren" && isCaseStudy) return 2;
  return base;
}

export default function CreatorTypeAssignmentForm({ clientId, clientName }: CreatorTypeAssignmentFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [creatorTypes, setCreatorTypes] = useState<CreatorType[]>([]);
  const [types, setTypes] = useState<string[]>(["", "", "", ""]);
  const [notes, setNotes] = useState("");
  const [existingProfileId, setExistingProfileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clientTier, setClientTier] = useState<TierKey | null>(null);
  const [isCaseStudy, setIsCaseStudy] = useState(false);
  const [isCertified, setIsCertified] = useState(false);

  useEffect(() => {
    async function load() {
      const [typesRes, profileRes, subRes, caseStudyRes, practitionerProfileRes] = await Promise.all([
        supabase.from("creator_types").select("name, family, element, color_hex").order("sort_order"),
        supabase.from("creator_type_profiles").select("id, primary_type, secondary_type, type_3, type_4, profiling_data").eq("user_id", clientId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        (supabase.from("client_subscription_summary" as any).select("tier").eq("user_id", clientId).maybeSingle() as any),
        supabase.from("case_studies").select("id").eq("subject_user_id", clientId).limit(1),
        user ? supabase.from("profiles").select("practitioner_status").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (typesRes.data) setCreatorTypes(typesRes.data);
      if (subRes.data) setClientTier(subRes.data.tier as TierKey);
      if (caseStudyRes.data && caseStudyRes.data.length > 0) setIsCaseStudy(true);
      if (practitionerProfileRes.data) {
        setIsCertified(practitionerProfileRes.data.practitioner_status === "certified");
      }
      if (profileRes.data) {
        setExistingProfileId(profileRes.data.id);
        const data = profileRes.data.profiling_data as Record<string, unknown> | null;
        setTypes([
          profileRes.data.primary_type || "",
          profileRes.data.secondary_type || "",
          profileRes.data.type_3 || (data?.type_3 as string) || "",
          profileRes.data.type_4 || (data?.type_4 as string) || "",
        ]);
        setNotes((data?.notes as string) || "");
      }
      setLoading(false);
    }
    load();
  }, [clientId]);

  const maxSlots = getMaxSlots(clientTier, isCaseStudy);

  const handleSave = async () => {
    if (!types[0] || !user) return;
    setSaving(true);

    const { data: latestProfileData } = await supabase
      .from("creator_type_profiles")
      .select("profiling_data")
      .eq("user_id", clientId)
      .maybeSingle();

    const existingProfilingData =
      latestProfileData?.profiling_data && typeof latestProfileData.profiling_data === "object" && !Array.isArray(latestProfileData.profiling_data)
        ? (latestProfileData.profiling_data as Record<string, unknown>)
        : {};

    const payload = {
      user_id: clientId,
      primary_type: types[0],
      secondary_type: types[1] || null,
      type_3: types[2] || null,
      type_4: types[3] || null,
      profiled_by: user.id,
      profiled_at: new Date().toISOString(),
      profiling_data: {
        ...existingProfilingData,
        notes,
        type_3: types[2] || null,
        type_4: types[3] || null,
      } as unknown as Record<string, never>,
    };

    const res = await supabase.from("creator_type_profiles").upsert(payload, { onConflict: "user_id" });
    const error = res.error;

    setSaving(false);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } else {
      setSaved(true);
      toast({ title: "Creator types assigned!", description: `${clientName} has been profiled.` });
      setTimeout(() => setSaved(false), 3000);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground text-center py-4">Loading…</div>;

  if (!isCertified) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-display font-bold text-foreground">Assign Creator Type</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Creator type assignment is only available to certified profilers. Please complete your certification to unlock this feature.
        </p>
      </div>
    );
  }

  const grouped = creatorTypes.reduce<Record<string, CreatorType[]>>((acc, ct) => {
    (acc[ct.family] = acc[ct.family] || []).push(ct);
    return acc;
  }, {});

  const slotLabels = ["Creator Type 1", "Creator Type 2", "Creator Type 3", "Creator Type 4"];
  const selectedTypes = types.filter(Boolean);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-secondary" />
          <h3 className="text-lg font-display font-bold text-foreground">Assign Creator Type</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {clientTier ? (
            <>
              <span className="capitalize font-semibold">{clientTier}</span> tier — {maxSlots} type{maxSlots > 1 ? "s" : ""}
              {isCaseStudy && clientTier === "wren" && " (case study)"}
            </>
          ) : "No subscription"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: maxSlots }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {slotLabels[i]} {i === 0 ? "*" : ""}
            </label>
            <Select
              value={types[i] || "none"}
              onValueChange={(v) => {
                const next = [...types];
                next[i] = v === "none" ? "" : v;
                setTypes(next);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={i === 0 ? "Select primary type…" : "Optional…"} />
              </SelectTrigger>
              <SelectContent>
                {i > 0 && <SelectItem value="none">None</SelectItem>}
                {Object.entries(grouped).map(([family, fTypes]) => (
                  <div key={family}>
                    <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{family}</div>
                    {fTypes.map(t => (
                      <SelectItem
                        key={t.name}
                        value={t.name}
                        disabled={selectedTypes.includes(t.name) && types[i] !== t.name}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getCreatorTypeColor(t.name) }}
                          />
                          <span className="capitalize">{t.name}</span>
                          <span className="text-xs text-muted-foreground">({t.element})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Profiling Notes</label>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Key observations from the profiling session…"
          rows={3}
        />
      </div>

      <Button onClick={handleSave} disabled={!types[0] || saving} className="w-full">
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : saved ? (
          <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        {existingProfileId ? "Update Creator Types" : "Assign Creator Types"}
      </Button>
    </div>
  );
}
