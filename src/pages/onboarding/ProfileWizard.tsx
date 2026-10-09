import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeatures } from "@/hooks/useFeatures";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Leaf, ArrowRight, ArrowLeft, Check, Upload, X } from "lucide-react";
import { CREATOR_TYPE_NAMES, CREATOR_TYPE_COLORS } from "@/lib/creatorTypes";
import { avatarStorageKey, resolveAvatarUrl } from "@/lib/avatar";
import { loadMyAccess } from "@/lib/accessSummary";
import { PlacesAutocompleteInput } from "@/components/community/PlacesAutocompleteInput";

const TOTAL_STEPS = 4;

export default function ProfileWizard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const { has: hasFeature } = useFeatures();
  const canMessage = hasFeature("community_message_members");
  const canProject = hasFeature("community_create_profile_project");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [displayName, setDisplayName] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarKey, setAvatarKey] = useState<string | null>(null); // storage key once uploaded

  // Step 2
  const [bioSuper, setBioSuper] = useState("");
  const [bioWhere, setBioWhere] = useState("");
  const [bioIntriguing, setBioIntriguing] = useState("");
  // Project answers (optional) — Connect and above, same as Settings.
  const [projSeek, setProjSeek] = useState("");
  const [projSkills, setProjSkills] = useState("");
  const [projDream, setProjDream] = useState("");

  // Step 3
  const [primaryType, setPrimaryType] = useState<string | null>(null);

  // Step 4
  const [visible, setVisible] = useState(false);
  const [acceptsMessages, setAcceptsMessages] = useState(false);

  const [isPaidUser, setIsPaidUser] = useState(false);
  const [alreadyHasCreatorType, setAlreadyHasCreatorType] = useState(false);
  const [step1Tried, setStep1Tried] = useState(false);

  // Redirect away if not signed in
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?returnTo=/onboarding/profile", { replace: true });
  }, [user, authLoading, navigate]);

  // Pre-fill from existing profile if any
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [profileRes, typeRes, access] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, first_name, last_name, location_label, city, state, country, avatar_url, bio_superpower, bio_where_i_live, bio_intriguing, community_visible, member_preferences, profile_completed_at")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("creator_type_profiles")
          .select("primary_type, source")
          .eq("user_id", user.id)
          .maybeSingle(),
        // Real-access lookup: storefront/course/clinic buyers have no enrollment_step.
        loadMyAccess(user.id).catch(() => []),
      ]);
      if (cancelled) return;
      const p = profileRes.data;
      if (p) {
        setDisplayName(
          p.display_name?.trim() ||
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
            ""
        );
        setLocationLabel(
          p.location_label?.trim() ||
            [p.city, p.state, p.country].filter(Boolean).join(", ") ||
            ""
        );
        setBioSuper(p.bio_superpower ?? "");
        setBioWhere(p.bio_where_i_live ?? "");
        setBioIntriguing(p.bio_intriguing ?? "");
        setVisible(!!p.community_visible);
        const prefs = (p.member_preferences as Record<string, unknown>) ?? {};
        setAcceptsMessages(prefs?.accepts_messages === true);
        setIsPaidUser(access.length > 0);
        if (p.avatar_url) {
          const url = await resolveAvatarUrl(p.avatar_url);
          if (!cancelled) setAvatarPreview(url);
        }
        if (p.profile_completed_at) {
          // Already completed — punt to dashboard.
          navigate("/dashboard", { replace: true });
          return;
        }
      }
      if (typeRes.data?.primary_type) {
        setPrimaryType(typeRes.data.primary_type.toLowerCase());
        setAlreadyHasCreatorType(true);
      }
      // Restore an in-progress draft (from "Save & exit" or a reload).
      try {
        const raw = localStorage.getItem(`profileWizardDraft:${user.id}`);
        if (raw) {
          const d = JSON.parse(raw);
          if (typeof d.displayName === "string" && d.displayName) setDisplayName(d.displayName);
          if (typeof d.locationLabel === "string" && d.locationLabel) setLocationLabel(d.locationLabel);
          if (typeof d.bioSuper === "string") setBioSuper(d.bioSuper);
          if (typeof d.bioWhere === "string") setBioWhere(d.bioWhere);
          if (typeof d.bioIntriguing === "string") setBioIntriguing(d.bioIntriguing);
          if (typeof d.projSeek === "string") setProjSeek(d.projSeek);
          if (typeof d.projSkills === "string") setProjSkills(d.projSkills);
          if (typeof d.projDream === "string") setProjDream(d.projDream);
          if (!typeRes.data?.primary_type && typeof d.primaryType === "string") setPrimaryType(d.primaryType);
          if (typeof d.visible === "boolean") setVisible(d.visible);
          if (typeof d.acceptsMessages === "boolean") setAcceptsMessages(d.acceptsMessages);
          if (typeof d.step === "number" && d.step >= 1 && d.step <= TOTAL_STEPS) setStep(d.step);
        }
      } catch { /* corrupt draft — ignore */ }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, navigate]);

  // Location: typed text is accepted (the map geocodes it server-side); a
  // picked suggestion is just more precise. Needs at least 2 letters so a
  // stray space or single character can't pass.
  const nameValid = displayName.trim().length >= 2 && displayName.trim().length <= 40;
  const locationValid = (locationLabel.trim().match(/\p{L}/gu)?.length ?? 0) >= 2;
  const canAdvanceStep1 = nameValid && locationValid;

  // Draft persistence — "Save & exit" (and any reload) keeps their answers.
  const draftKey = `profileWizardDraft:${user?.id ?? "anon"}`;
  useEffect(() => {
    if (loading || !user) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        step, displayName, locationLabel, bioSuper, bioWhere, bioIntriguing, projSeek, projSkills, projDream,
        primaryType: alreadyHasCreatorType ? null : primaryType, visible, acceptsMessages,
      }));
    } catch { /* storage full/blocked — non-fatal */ }
  }, [loading, user, draftKey, step, displayName, locationLabel, bioSuper, bioWhere, bioIntriguing, projSeek, projSkills, projDream, primaryType, alreadyHasCreatorType, visible, acceptsMessages]);

  const exitWizard = () => {
    toast({ title: "Saved for later", description: "Your answers are kept. Come back any time to finish." });
    navigate("/dashboard");
  };

  const canAdvanceStep2 =
    bioSuper.trim().length > 0 && bioSuper.length <= 500 &&
    bioWhere.trim().length > 0 && bioWhere.length <= 500 &&
    bioIntriguing.trim().length > 0 && bioIntriguing.length <= 500 &&
    projSeek.length <= 500 && projSkills.length <= 500 && projDream.length <= 500;

  const canAdvanceStep3 = !!primaryType;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;
    const ext = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
    const key = avatarStorageKey(user.id, safeExt);
    const { error } = await supabase.storage
      .from("profile-avatars")
      .upload(key, avatarFile, { upsert: true, contentType: avatarFile.type });
    if (error) {
      toast({ title: "Avatar upload failed", description: error.message, variant: "destructive" });
      return null;
    }
    return key;
  };

  const submit = async () => {
    if (!user) return;
    setSubmitting(true);
    let uploadedKey = avatarKey;
    if (avatarFile) {
      uploadedKey = await uploadAvatar();
      if (!uploadedKey) {
        setSubmitting(false);
        return;
      }
      setAvatarKey(uploadedKey);
    }
    const payload: Record<string, unknown> = {
      display_name: displayName.trim(),
      location_label: locationLabel.trim(),
      bio_superpower: bioSuper.trim(),
      bio_where_i_live: bioWhere.trim(),
      bio_intriguing: bioIntriguing.trim(),
      primary_type: primaryType,
      community_visible: visible,
      member_preferences: { accepts_messages: canMessage && acceptsMessages },
    };
    if (uploadedKey) payload.avatar_url = uploadedKey;

    const { error } = await supabase.rpc("complete_profile", { _payload: payload as never });
    setSubmitting(false);
    if (error) {
      // Everything they typed stays in state (and the saved draft). Send them
      // to the step that needs fixing with plain words, never a column name.
      const m = (error.message || "").toLowerCase();
      let target = step;
      let msg = "Something went wrong saving your profile. Your answers are kept — please try again.";
      if (m.includes("location")) { target = 1; msg = "Please add where you're based (town or city and country)."; setStep1Tried(true); }
      else if (m.includes("display_name")) { target = 1; msg = "Please enter your name (2 to 40 characters)."; setStep1Tried(true); }
      else if (m.includes("bio")) { target = 2; msg = "Please answer all three questions (up to 500 characters each)."; }
      else if (m.includes("primary_type")) { target = 3; msg = "Please choose the Creator Type you resonate with."; }
      setStep(target);
      toast({ title: "Almost there", description: msg, variant: "destructive" });
      if (target === 1) setTimeout(() => document.getElementById(m.includes("location") ? "location" : "display_name")?.focus(), 50);
      return;
    }
    if (canProject && (projSeek.trim() || projSkills.trim() || projDream.trim())) {
      await supabase.from("profiles").update({
        project_seek_me_for: projSeek.trim() || null,
        project_top_skills: projSkills.trim() || null,
        project_dream: projDream.trim() || null,
      } as never).eq("user_id", user.id);
    }
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    // The map position is looked up in the background after saving. Wait up
    // to 10 seconds for it so the member lands with their pin already placed.
    setPlacing(true);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const { data: pos } = await supabase.from("profiles").select("location_lat, location_lng").eq("user_id", user.id).maybeSingle();
      if (pos?.location_lat != null && pos?.location_lng != null) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    setPlacing(false);
    // Backup: the community page keeps re-checking for a short while.
    try { sessionStorage.setItem("c13:just-finished-wizard", String(Date.now())); } catch { /* ignore */ }
    window.dispatchEvent(new Event("c13:creator-type-updated"));
    window.dispatchEvent(new Event("c13:community-profile-updated"));
    toast({ title: "Welcome to the community!" });
    navigate("/community/dashboard", { replace: true });
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
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-1 gap-3">
            <p className="text-sm text-muted-foreground">Step {step} of {TOTAL_STEPS}</p>
            <Button variant="ghost" size="sm" onClick={exitWizard} disabled={submitting}>
              <X className="mr-1 h-4 w-4" /> Save & exit
            </Button>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          {step === 1 && (
            <div className="space-y-6">
              <header>
                <h1 className="text-2xl font-display font-bold">Your basics</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  This is how you'll appear to other Creators.
                </p>
              </header>

              <div className="flex flex-col items-center gap-3">
                <div className="h-28 w-28 rounded-full bg-muted overflow-hidden border-2 border-border flex items-center justify-center">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <label className="cursor-pointer text-sm text-primary hover:underline">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  {avatarPreview ? "Change avatar" : "Upload avatar (optional)"}
                </label>
                {isPaidUser && (
                  <p className="text-xs text-muted-foreground text-center max-w-sm">
                    Upload an avatar to appear in the community. This is separate from your profiling photos.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_name">Your name as it appears to other Creators</Label>
                <Input
                  id="display_name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={40}
                  placeholder="Jane Smith"
                  aria-invalid={step1Tried && !nameValid}
                />
                <p className={`text-xs ${step1Tried && !nameValid ? "text-destructive" : "text-muted-foreground"}`}>
                  {step1Tried && !nameValid ? "Please enter your name (2 to 40 characters). " : ""}{displayName.length}/40
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Where you're based</Label>
                <PlacesAutocompleteInput
                  id="location"
                  value={locationLabel}
                  onChange={setLocationLabel}
                  placeholder="e.g. Byron Bay, NSW, Australia"
                />
                {step1Tried && !locationValid ? (
                  <p className="text-xs text-destructive" role="alert">
                    Please type your town or city and country, e.g. "Byron Bay, Australia". You can pick from the list or just type it.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Town or city and country. Pick from the list or type it in.</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setStep1Tried(true);
                    if (canAdvanceStep1) setStep(2);
                    else document.getElementById(nameValid ? "location" : "display_name")?.focus();
                  }}
                >
                  Continue <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <header>
                <h1 className="text-2xl font-display font-bold">Your story</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  A glimpse of who you are. 500 characters each, all required.
                </p>
              </header>

              <BioField
                id="bio_super"
                label="If I could have one superpower it would be…"
                value={bioSuper}
                onChange={setBioSuper}
              />
              <BioField
                id="bio_where"
                label="What I love about where I live…"
                value={bioWhere}
                onChange={setBioWhere}
              />
              <BioField
                id="bio_intriguing"
                label="The most intriguing thing about me is…"
                value={bioIntriguing}
                onChange={setBioIntriguing}
              />

              {canProject && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <div>
                    <h2 className="font-display font-semibold">Projects</h2>
                    <p className="text-xs text-muted-foreground mt-1">Optional — helps others find you for projects. You can change these later in Settings.</p>
                  </div>
                  <BioField id="proj_seek" label="Seek me for…" value={projSeek} onChange={setProjSeek} />
                  <BioField id="proj_skills" label="My top skills…" value={projSkills} onChange={setProjSkills} />
                  <BioField id="proj_dream" label="My dream project…" value={projDream} onChange={setProjDream} />
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <Button onClick={() => setStep(3)} disabled={!canAdvanceStep2}>
                  Continue <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <header>
                <h1 className="text-2xl font-display font-bold">Your Creator Type</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Pick the one that feels most like you.
                </p>
              </header>

              {alreadyHasCreatorType && (
                <div className="text-xs rounded-lg bg-muted px-3 py-2 text-muted-foreground">
                  You've already been profiled. Selecting a different Type here won't overwrite a practitioner's assignment.
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {CREATOR_TYPE_NAMES.map((name) => {
                  const key = name.toLowerCase();
                  const selected = primaryType === key;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setPrimaryType(key)}
                      className={`relative aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                        selected
                          ? "border-foreground scale-105 shadow-md"
                          : "border-border hover:border-foreground/40"
                      }`}
                      style={{ backgroundColor: CREATOR_TYPE_COLORS[key] }}
                    >
                      {selected && (
                        <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-foreground text-background flex items-center justify-center">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      <span className="text-sm font-display font-bold text-foreground/90">{name}</span>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                You can guess one Creator Type now. A certified practitioner can later officially profile you with up to 4 Types.
              </p>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <Button onClick={() => setStep(4)} disabled={!canAdvanceStep3}>
                  Continue <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <header>
                <h1 className="text-2xl font-display font-bold">Discoverability</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Both default to off. You can change either at any time in settings.
                </p>
              </header>

              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">Make my profile discoverable to other Creators</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      When on, other Creators can find you via search, see you on the community map, and send you connection invitations. Your bio, name, city, and Creator Type become visible to other authenticated members.
                    </p>
                  </div>
                  <Switch checked={visible} onCheckedChange={setVisible} />
                </div>
              </div>

              {canMessage && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">Allow other Creators to message me</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Required to receive 1:1 messages. You can still see other members without enabling this.
                    </p>
                  </div>
                  <Switch checked={acceptsMessages} onCheckedChange={setAcceptsMessages} />
                </div>
              </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)} disabled={submitting}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? <Leaf className="h-4 w-4 animate-spin" /> : "Finish"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BioField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const over = value.length > 500;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={600}
        className={over ? "border-destructive" : ""}
      />
      <p className={`text-xs ${over ? "text-destructive" : "text-muted-foreground"}`}>
        {value.length}/500
      </p>
    </div>
  );
}
