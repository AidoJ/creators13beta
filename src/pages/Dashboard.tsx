import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollmentGate } from "@/hooks/useEnrollmentGate";
import type { TierKey } from "@/lib/tiers";

import DashboardHeader from "@/components/dashboard/DashboardHeader";
import PersonalDetailsCard from "@/components/dashboard/PersonalDetailsCard";
import PhotoGalleryCard from "@/components/dashboard/PhotoGalleryCard";
import ProgressCard from "@/components/dashboard/ProgressCard";
import SessionCard from "@/components/dashboard/SessionCard";
import CreatorProfileCard from "@/components/dashboard/CreatorProfileCard";
import AnimalMatchesCard from "@/components/dashboard/AnimalMatchesCard";
import ClientFAQSection from "@/components/dashboard/ClientFAQSection";
import SubscriptionCard from "@/components/dashboard/SubscriptionCard";
import ZoomRecordingsCard from "@/components/dashboard/ZoomRecordingsCard";
import DiscordLinkCard from "@/components/dashboard/DiscordLinkCard";
import PlayerDashboard from "@/components/dashboard/PlayerDashboard";
import { Card } from "@/components/ui/card";
import { Gamepad2, Globe, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";


interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  enrollment_step: string | null;
  date_of_birth: string | null;
  gender: string | null;
  pronouns: string | null;
  height_cm: number | null;
  shoe_size: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  case_study_consent_at: string | null;
}

interface BookingData {
  scheduled_at: string | null;
  status: string | null;
  zoom_link: string | null;
}

interface SubData {
  tier: TierKey;
  status: string;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { ready: gateReady, state: gateState } = useEnrollmentGate();
  const isPlayerOnly = !!gateState?.isPlayerOnly;
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [subscription, setSubscription] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCaseStudySubject, setIsCaseStudySubject] = useState(false);
  const [creatorTypes, setCreatorTypes] = useState<string[]>([]);
  const [hasTrainerPractitioner, setHasTrainerPractitioner] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);
  /** Profile-complete gate for the Community teaser card (visibility is a
   * "be seen" gate, not a "see" gate — so we only need profile_completed_at). */
  const [profileComplete, setProfileComplete] = useState(false);


  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [profileRes, bookingRes, subRes, ctpRes, csRes, cpRes, photosRes, visRes] = await Promise.all([
        supabase.from("profiles").select("first_name, last_name, enrollment_step, date_of_birth, gender, pronouns, height_cm, shoe_size, phone, city, state, country, case_study_consent_at").eq("user_id", user.id).maybeSingle(),
        supabase.from("bookings").select("scheduled_at, status, zoom_link").eq("client_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("subscriptions").select("tier, status, referral_code").eq("user_id", user.id).maybeSingle(),
        supabase.from("creator_type_profiles").select("primary_type, secondary_type, type_3, type_4").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("case_studies").select("id").eq("subject_user_id", user.id).limit(1),
        supabase.from("client_practitioner").select("practitioner_id").eq("client_id", user.id).eq("active", true),
        supabase.from("profiling_photos").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("profiles").select("profile_completed_at").eq("user_id", user.id).maybeSingle(),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      if (bookingRes.data) setBooking(bookingRes.data);
      setPhotoCount(photosRes.count || 0);
      setProfileComplete(!!visRes.data?.profile_completed_at);
      if (subRes.data) setSubscription(subRes.data as SubData);
      const hasCsRecord = !!(csRes.data && csRes.data.length > 0);
      const hasConsent = !!profileRes.data?.case_study_consent_at;
      const hasReferral = !!(subRes.data && (subRes.data as any).referral_code);
      setIsCaseStudySubject(hasCsRecord || hasConsent || hasReferral);

      // Check if any linked practitioner has the trainer role
      if (cpRes.data && cpRes.data.length > 0) {
        const practIds = cpRes.data.map(r => r.practitioner_id);
        const { data: trainerRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("user_id", practIds)
          .eq("role", "trainer");
        setHasTrainerPractitioner(!!(trainerRoles && trainerRoles.length > 0));
      }

      if (ctpRes.data) {
        const types: string[] = [];
        if (ctpRes.data.primary_type) types.push(ctpRes.data.primary_type);
        if (ctpRes.data.secondary_type) types.push(ctpRes.data.secondary_type);
        if (ctpRes.data.type_3) types.push(ctpRes.data.type_3);
        if (ctpRes.data.type_4) types.push(ctpRes.data.type_4);
        setCreatorTypes(types);
      }
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const step = profile?.enrollment_step || null;
  // Derive progress from actual data, not just enrollment_step
  const isComplete = step === "complete" || creatorTypes.length >= 4;
  const photosUploaded = photoCount > 0 || step === "photos_uploaded" || step === "awaiting_profiling" || step === "booking_made" || isComplete;
  const bookingMade = step === "booking_made" || (isComplete && !!booking);
  const hasDetails = !!(profile?.first_name && profile?.date_of_birth && profile?.gender && profile?.height_cm);


  if (!gateReady || loading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader email={user?.email} onSignOut={signOut} />
        <main className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (isPlayerOnly && user) {
    return (
      <PlayerDashboard
        userId={user.id}
        email={user.email}
        firstName={profile?.first_name ?? null}
        onSignOut={signOut}
      />
    );
  }

  const isPaidTier = !!subscription?.tier && subscription.tier !== "wren";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <DashboardHeader email={user?.email} onSignOut={signOut} />

      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-5">
        {/* Section teasers — surface Play & Community without duplicating
            their content here. Phase 2.1: simple label + arrow, no live data. */}
        <div className={`grid gap-4 ${profileComplete ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate("/play")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/play"); }}
            className="cursor-pointer p-5 flex items-center gap-4 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Gamepad2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Play</p>
              <p className="text-xs text-muted-foreground">Your game dashboard, recent matches & stats.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </Card>
          {profileComplete && (
            <Card
              role="button"
              tabIndex={0}
              onClick={() => navigate("/community/dashboard")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/community/dashboard"); }}
              className="cursor-pointer p-5 flex items-center gap-4 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Community</p>
                <p className="text-xs text-muted-foreground">See your matches across the 13 Creator Types.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </Card>
          )}
        </div>


        {/* PAID-TIER section: profile, photos, sessions, subscription, recordings */}
        {isPaidTier && (
          <section className="pt-6 mt-4 border-t border-dashed border-border space-y-5">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold">Your profile</p>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-5">
                <ProgressCard
                  step={step}
                  isComplete={isComplete}
                  photosUploaded={photosUploaded}
                  bookingMade={bookingMade}
                  hasDetails={hasDetails}
                  bookingDate={booking?.scheduled_at}
                  tier={subscription?.tier}
                  isCaseStudy={isCaseStudySubject}
                  confirmedTypeCount={creatorTypes.length}
                  showBooking={hasTrainerPractitioner && !isCaseStudySubject}
                />
                {hasTrainerPractitioner && !isCaseStudySubject && (
                  <SessionCard
                    scheduledAt={booking?.scheduled_at || null}
                    status={booking?.status || null}
                    zoomLink={booking?.zoom_link || null}
                    photosUploaded={photosUploaded}
                    bookingMade={bookingMade}
                    hasBookingRecord={!!booking}
                    tier={subscription?.tier}
                  />
                )}
              </div>

              <div className="space-y-5">
                <PersonalDetailsCard profile={profile} hasDetails={hasDetails} />
                {profile?.case_study_consent_at && (
                  <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-600 text-sm">✓</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Case Study Consent Given</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(profile.case_study_consent_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                )}
                {user && <PhotoGalleryCard userId={user.id} photosUploaded={photosUploaded} />}
              </div>
            </div>

            <ZoomRecordingsCard />
            <SubscriptionCard />
            {user && <CreatorProfileCard userId={user.id} />}
            {user && <AnimalMatchesCard userId={user.id} />}
          </section>
        )}

        {/* Discord — all tiers */}
        {user && <DiscordLinkCard userId={user.id} />}

        {/* FAQs — full width */}
        <ClientFAQSection />
      </main>
    </div>
  );
}
