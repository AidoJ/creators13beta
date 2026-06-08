/**
 * Public member profile view (/member/:userId).
 *
 * Read-only. Backed by the SECURITY DEFINER RPC get_public_member_profile,
 * which returns rows ONLY when:
 *   - the caller is authenticated, AND
 *   - the target user has community_visible=true AND profile_completed_at IS NOT NULL.
 *
 * Anything else (private, missing, doesn't exist) collapses to the same
 * "not part of the community" page so existence cannot be enumerated.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Leaf, MapPin, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar";
import { sortCreatorTypes } from "@/lib/creatorTypes";
import LotusProfile, { LotusCreatorType } from "@/components/community/LotusProfile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TIERS, type TierKey } from "@/lib/tiers";

interface PublicProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location_label: string | null;
  bio_superpower: string | null;
  bio_where_i_live: string | null;
  bio_intriguing: string | null;
  tier: TierKey | null;
  community_joined_at: string | null;
  creator_types: Array<{ type: string; source: LotusCreatorType["source"] }>;
}

function formatMemberSince(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

function NotFoundView() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="font-display text-3xl">This member isn't part of the community</h1>
        <p className="text-muted-foreground">
          Either they haven't joined the community yet, or their profile isn't
          visible. Ask them to share their member link with you directly.
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

export default function MemberProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [resolvedAvatar, setResolvedAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc(
        // RPC is in the generated types after the migration runs.
        "get_public_member_profile" as never,
        { _target_user_id: userId } as never
      );
      if (cancelled) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setProfile(null);
        setResolvedAvatar(null);
        setLoading(false);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as PublicProfile;
      setProfile(row);
      const url = await resolveAvatarUrl(row.avatar_url);
      if (!cancelled) {
        setResolvedAvatar(url);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const sortedTypes = useMemo<LotusCreatorType[]>(() => {
    if (!profile) return [];
    const names = profile.creator_types.map((t) => t.type);
    const sourceMap = new Map(profile.creator_types.map((t) => [t.type.toLowerCase(), t.source]));
    return sortCreatorTypes(names).map((name) => ({
      type: name,
      source: sourceMap.get(name.toLowerCase()) ?? "self_selected",
    }));
  }, [profile]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Leaf className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) return <NotFoundView />;

  const memberSince = formatMemberSince(profile.community_joined_at);
  const tier = profile.tier ? TIERS[profile.tier] : null;
  const isOwn = user?.id === profile.user_id;

  const bios: Array<{ key: string; label: string; value: string | null }> = [
    { key: "superpower", label: "Superpower", value: profile.bio_superpower },
    { key: "where", label: "What I love about where I live", value: profile.bio_where_i_live },
    { key: "intriguing", label: "What's intriguing about me", value: profile.bio_intriguing },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <main className="container mx-auto max-w-2xl px-4 py-10 space-y-6">
        <header className="flex flex-col items-center text-center gap-4">
          <LotusProfile
            avatarUrl={resolvedAvatar}
            displayName={profile.display_name ?? "Member"}
            creatorTypes={sortedTypes}
            size="xl"
          />
          <div className="space-y-2">
            <h1 className="font-display text-4xl">{profile.display_name ?? "Member"}</h1>
            {profile.location_label && (
              <p className="text-muted-foreground flex items-center justify-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {profile.location_label}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {tier && (
                <Badge variant="secondary" className="font-display tracking-wide">
                  {tier.name}
                </Badge>
              )}
              {memberSince && (
                <span className="text-xs text-muted-foreground">
                  Member since {memberSince}
                </span>
              )}
            </div>
          </div>

          {isOwn && (
            <Button asChild size="sm" variant="outline" className="mt-2">
              <Link to="/settings/community">
                <Pencil className="h-4 w-4 mr-1.5" />
                Edit profile
              </Link>
            </Button>
          )}
        </header>

        <section className="grid gap-4 pt-2">
          {bios
            .filter((b) => b.value && b.value.trim().length > 0)
            .map((b) => (
              <article
                key={b.key}
                className="rounded-2xl border border-border bg-card p-5 space-y-2"
              >
                <h2 className="text-xs uppercase tracking-widest text-primary font-semibold">
                  {b.label}
                </h2>
                <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {b.value}
                </p>
              </article>
            ))}
        </section>
      </main>
    </div>
  );
}
