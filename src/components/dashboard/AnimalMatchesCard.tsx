import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PawPrint, Lock } from "lucide-react";
import { ANIMAL_CARDS, type CreatorType } from "@/data/cards";
import { getCreatorTypeColor, capitaliseTypeName } from "@/lib/creatorTypes";

interface Props {
  userId: string;
}

interface ProfileResult {
  primary_type: string | null;
  secondary_type: string | null;
  type_3: string | null;
  type_4: string | null;
}

const ART_BUCKET = "game-card-art";

export default function AnimalMatchesCard({ userId }: Props) {
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [artMap, setArtMap] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("creator_type_profiles")
        .select("primary_type, secondary_type, type_3, type_4")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setProfile((data as ProfileResult) ?? null);
      setLoading(false);
    })();
  }, [userId]);

  const types = useMemo<CreatorType[]>(() => {
    if (!profile) return [];
    return [profile.primary_type, profile.secondary_type, profile.type_3, profile.type_4]
      .filter(Boolean)
      .map((t) => capitaliseTypeName(t as string)) as CreatorType[];
  }, [profile]);

  const complete = types.length === 4;
  const typeSet = useMemo(() => new Set(types), [types]);

  const matches = useMemo(() => {
    if (!complete) return [];
    return ANIMAL_CARDS.filter((a) => typeSet.has(a.types[0]) && typeSet.has(a.types[1]));
  }, [complete, typeSet]);

  // Load art URLs for matches
  useEffect(() => {
    if (!complete || matches.length === 0) return;
    const map: Record<string, string> = {};
    for (const a of matches) {
      const path = `cards/animal-${a.slug}.png`;
      map[a.slug] = supabase.storage.from(ART_BUCKET).getPublicUrl(path, {
        transform: { width: 240, height: 240, resize: "contain", quality: 80 },
      }).data.publicUrl;
    }
    setArtMap(map);
  }, [complete, matches]);

  if (loading) return null;

  return (
    <div
      className={`rounded-2xl border border-border bg-gradient-to-br from-card via-card to-secondary/5 p-6 space-y-4 ${
        complete ? "" : "opacity-60 grayscale"
      }`}
    >
      <div className="flex items-center gap-2">
        <PawPrint className="h-5 w-5 text-secondary" />
        <h2 className="text-lg font-display font-bold text-foreground">Your Animal Matches</h2>
        {complete ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {matches.length} perfect {matches.length === 1 ? "match" : "matches"}
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Locked
          </span>
        )}
      </div>

      {!complete && (
        <p className="text-sm text-muted-foreground">
          Your 4 Creator Types haven't been fully profiled yet. Once all four are
          assigned, the animal cards that perfectly match your unique profile
          (both halves matching your types) will be revealed here.
        </p>
      )}

      {complete && (
        <>
          <p className="text-sm text-muted-foreground">
            Animal cards where <em>both</em> Creator Types match your profile —
            {" "}
            {types.map((t, i) => (
              <span key={t}>
                {i > 0 ? ", " : ""}
                <span className="font-semibold" style={{ color: getCreatorTypeColor(t) }}>
                  {t}
                </span>
              </span>
            ))}
            .
          </p>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No animal cards have both halves matching your four types.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {matches.map((a) => {
                const [t1, t2] = a.types;
                const c1 = getCreatorTypeColor(t1);
                const c2 = getCreatorTypeColor(t2);
                return (
                  <div
                    key={a.slug}
                    className="rounded-xl overflow-hidden border border-border bg-card flex flex-col"
                    style={{ borderColor: `${c1}55` }}
                  >
                    <div
                      className="aspect-square flex items-center justify-center p-2"
                      style={{ background: `linear-gradient(135deg, ${c1}30 0%, ${c2}30 100%)` }}
                    >
                      {artMap[a.slug] ? (
                        <img
                          src={artMap[a.slug]}
                          alt={a.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground">No art</div>
                      )}
                    </div>
                    <div className="p-2 space-y-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {a.name}
                      </p>
                      <div className="flex gap-1 text-[10px] font-semibold">
                        <span
                          className="px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: c1 }}
                        >
                          {t1}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: c2 }}
                        >
                          {t2}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
