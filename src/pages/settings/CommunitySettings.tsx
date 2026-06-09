import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Leaf, ArrowLeft, Check, Upload, User as UserIcon } from "lucide-react";
import { CREATOR_TYPE_NAMES, CREATOR_TYPE_COLORS } from "@/lib/creatorTypes";
import { resolveAvatarUrl, avatarStorageKey } from "@/lib/avatar";

export default function CommunitySettings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [bioSuper, setBioSuper] = useState("");
  const [bioWhere, setBioWhere] = useState("");
  const [bioIntriguing, setBioIntriguing] = useState("");
  const [primaryType, setPrimaryType] = useState<string | null>(null);
  const [ctSource, setCtSource] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [hadJoinedAt, setHadJoinedAt] = useState(false);
  const [acceptsMessages, setAcceptsMessages] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?returnTo=/settings/community", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [profileRes, typeRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, location_label, bio_superpower, bio_where_i_live, bio_intriguing, community_visible, community_joined_at, member_preferences, avatar_url")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("creator_type_profiles")
          .select("primary_type, source")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const p = profileRes.data;
      if (p) {
        setDisplayName(p.display_name ?? "");
        setLocationLabel(p.location_label ?? "");
        setBioSuper(p.bio_superpower ?? "");
        setBioWhere(p.bio_where_i_live ?? "");
        setBioIntriguing(p.bio_intriguing ?? "");
        setVisible(!!p.community_visible);
        setHadJoinedAt(!!p.community_joined_at);
        const prefs = (p.member_preferences as Record<string, unknown>) ?? {};
        setAcceptsMessages(prefs?.accepts_messages === true);
        if (p.avatar_url) {
          const url = await resolveAvatarUrl(p.avatar_url);
          if (!cancelled) setAvatarUrl(url);
        }
      }
      if (typeRes.data) {
        setPrimaryType((typeRes.data.primary_type ?? "").toLowerCase() || null);
        setCtSource(typeRes.data.source);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const creatorTypeLocked = ctSource === "practitioner" || ctSource === "case_study";

  const save = async () => {
    if (!user) return;
    if (displayName.trim().length < 2 || displayName.trim().length > 40) {
      toast({ title: "Name must be 2–40 characters", variant: "destructive" });
      return;
    }
    if (bioSuper.length > 500 || bioWhere.length > 500 || bioIntriguing.length > 500) {
      toast({ title: "Bio fields capped at 500 characters", variant: "destructive" });
      return;
    }
    setSaving(true);

    // Build the profile patch.
    const prefsPatch: Record<string, unknown> = { accepts_messages: acceptsMessages };
    const update: Record<string, unknown> = {
      display_name: displayName.trim(),
      location_label: locationLabel.trim() || null,
      bio_superpower: bioSuper.trim() || null,
      bio_where_i_live: bioWhere.trim() || null,
      bio_intriguing: bioIntriguing.trim() || null,
      community_visible: visible,
      member_preferences: prefsPatch,
    };
    if (visible && !hadJoinedAt) {
      (update as Record<string, unknown>).community_joined_at = new Date().toISOString();
    }

    const { error: profileErr } = await supabase
      .from("profiles")
      .update(update as never)
      .eq("user_id", user.id);
    if (profileErr) {
      setSaving(false);
      toast({ title: "Could not save profile", description: profileErr.message, variant: "destructive" });
      return;
    }

    // Try to update creator type if it isn't locked and the user actually changed it.
    if (primaryType && !creatorTypeLocked) {
      const { error: ctErr } = await supabase
        .from("creator_type_profiles")
        .upsert(
          { user_id: user.id, source: "self_selected", primary_type: primaryType } as never,
          { onConflict: "user_id" }
        );
      if (ctErr) {
        setSaving(false);
        const friendly = ctErr.message?.includes("locked")
          ? "Your Creator Type has been set by a certified practitioner and cannot be changed here. Contact your practitioner if this needs updating."
          : ctErr.message;
        toast({ title: "Couldn't update Creator Type", description: friendly, variant: "destructive" });
        return;
      }
    }

    if (visible && !hadJoinedAt) setHadJoinedAt(true);
    setSaving(false);
    toast({ title: "Settings saved" });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Leaf className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold">Community settings</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate("/community/dashboard")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Community
          </Button>

        </div>

        <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-lg">Profile</h2>
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center flex-shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="h-9 w-9 text-muted-foreground/70" strokeWidth={1.75} />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatar_upload" className="cursor-pointer">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-border bg-card hover:bg-accent transition">
                  {uploadingAvatar ? (
                    <Leaf className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {avatarUrl ? "Change photo" : "Upload photo"}
                </span>
              </Label>
              <input
                id="avatar_upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploadingAvatar}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file || !user) return;
                  if (file.size > 5 * 1024 * 1024) {
                    toast({ title: "Image too large", description: "Max 5MB.", variant: "destructive" });
                    return;
                  }
                  setUploadingAvatar(true);
                  const extFromType =
                    file.type === "image/png" ? "png" :
                    file.type === "image/webp" ? "webp" : "jpg";
                  const key = avatarStorageKey(user.id, extFromType);
                  const { error: upErr } = await supabase.storage
                    .from("profile-avatars")
                    .upload(key, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
                  if (upErr) {
                    setUploadingAvatar(false);
                    toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
                    return;
                  }
                  const { error: profErr } = await supabase
                    .from("profiles")
                    .update({ avatar_url: key } as never)
                    .eq("user_id", user.id);
                  if (profErr) {
                    setUploadingAvatar(false);
                    toast({ title: "Couldn't save avatar", description: profErr.message, variant: "destructive" });
                    return;
                  }
                  const signed = await resolveAvatarUrl(key);
                  setAvatarUrl(signed ? `${signed}#${Date.now()}` : signed);
                  setUploadingAvatar(false);
                  toast({ title: "Photo updated" });
                }}
              />
              <p className="text-xs text-muted-foreground">JPEG, PNG or WebP. Max 5MB. Square works best.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loc">City & country</Label>
            <Input id="loc" value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} placeholder="Byron Bay, NSW, AU" />
          </div>

          <div className="space-y-2">
            <Label>If I could have one superpower it would be…</Label>
            <Textarea value={bioSuper} onChange={(e) => setBioSuper(e.target.value)} rows={3} maxLength={600} />
            <p className="text-xs text-muted-foreground">{bioSuper.length}/500</p>
          </div>
          <div className="space-y-2">
            <Label>What I love about where I live…</Label>
            <Textarea value={bioWhere} onChange={(e) => setBioWhere(e.target.value)} rows={3} maxLength={600} />
            <p className="text-xs text-muted-foreground">{bioWhere.length}/500</p>
          </div>
          <div className="space-y-2">
            <Label>The most intriguing thing about me is…</Label>
            <Textarea value={bioIntriguing} onChange={(e) => setBioIntriguing(e.target.value)} rows={3} maxLength={600} />
            <p className="text-xs text-muted-foreground">{bioIntriguing.length}/500</p>
          </div>
        </section>

        <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg">Creator Type</h2>
            {creatorTypeLocked && (
              <span className="text-xs text-muted-foreground">Locked by practitioner</span>
            )}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {CREATOR_TYPE_NAMES.map((name) => {
              const key = name.toLowerCase();
              const selected = primaryType === key;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={creatorTypeLocked}
                  onClick={() => setPrimaryType(key)}
                  className={`relative aspect-square rounded-lg border-2 flex items-center justify-center transition-all text-xs font-display font-bold ${
                    selected ? "border-foreground scale-105" : "border-border"
                  } ${creatorTypeLocked ? "opacity-60 cursor-not-allowed" : "hover:border-foreground/40"}`}
                  style={{ backgroundColor: CREATOR_TYPE_COLORS[key] }}
                >
                  {selected && <Check className="absolute top-0.5 right-0.5 h-3 w-3 text-foreground" />}
                  {name}
                </button>
              );
            })}
          </div>
        </section>

        <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-lg">Discoverability</h2>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Profile discoverable to other Creators</p>
              <p className="text-xs text-muted-foreground mt-1">
                Toggle anytime. Your "member since" date is preserved across toggles.
              </p>
            </div>
            <Switch checked={visible} onCheckedChange={setVisible} />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Accept 1:1 messages</p>
              <p className="text-xs text-muted-foreground mt-1">
                Required for other Creators to message you.
              </p>
            </div>
            <Switch checked={acceptsMessages} onCheckedChange={setAcceptsMessages} />
          </div>
        </section>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Leaf className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
