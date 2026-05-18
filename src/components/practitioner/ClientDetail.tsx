import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import CompositePhotoLayout from "@/components/profiling/CompositePhotoLayout";
import CreatorTypeAssignmentForm from "@/components/practitioner/CreatorTypeAssignmentForm";
import ClientSubscriptionCard from "@/components/practitioner/ClientSubscriptionCard";
import ClientRecordingLinks from "@/components/practitioner/ClientRecordingLinks";
import ProfilingReportButton from "@/components/practitioner/ProfilingReportButton";
import FaceSplitMirror, { type FaceSplitData } from "@/components/trainer/FaceSplitMirror";
import BodyAnnotationTool, { type BodyAnnotationData } from "@/components/trainer/BodyAnnotationTool";
import { User, Calendar, Sparkles, Video, Pencil, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getCreatorTypeColor, sortCreatorTypes } from "@/lib/creatorTypes";
import { isPaidTier } from "@/lib/clientClassification";

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  enrollment_step: string | null;
  date_of_birth: string | null;
  gender: string | null;
  height_cm: number | null;
  shoe_size: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  case_study_consent_at: string | null;
}

interface BookingData {
  id: string;
  scheduled_at: string | null;
  status: string | null;
  zoom_link: string | null;
}

interface CreatorTypeData {
  primary_type: string | null;
  secondary_type: string | null;
  type_3: string | null;
  type_4: string | null;
  profiled_at: string | null;
}

interface ClientDetailProps {
  clientId: string;
  onClientNameLoaded?: (name: string) => void;
}

export default function ClientDetail({ clientId, onClientNameLoaded }: ClientDetailProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [creatorType, setCreatorType] = useState<CreatorTypeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingZoom, setEditingZoom] = useState(false);
  const [zoomInput, setZoomInput] = useState("");
  const [savingZoom, setSavingZoom] = useState(false);
  const { user } = useAuth();
  const [isCertified, setIsCertified] = useState(false);
  const [clientIsPaidSubscriber, setClientIsPaidSubscriber] = useState(false);
  const [isCaseStudySubject, setIsCaseStudySubject] = useState(false);
  const [faceSplitData, setFaceSplitData] = useState<FaceSplitData | null>(null);
  const [bodyAnnotationData, setBodyAnnotationData] = useState<BodyAnnotationData | null>(null);
  const { toast } = useToast();

  const handleFaceSplitChange = useCallback((data: FaceSplitData) => setFaceSplitData(data), []);
  const handleBodyAnnotationChange = useCallback((data: BodyAnnotationData) => setBodyAnnotationData(data), []);

  // Fetch practitioner certification status
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("practitioner_status").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setIsCertified(data?.practitioner_status === "certified"));
  }, [user]);

  // Fetch client data + subscription
  useEffect(() => {
    async function fetchClientData() {
      setLoading(true);
      const [profileRes, bookingRes, ctRes, subRes, csRes] = await Promise.all([
        supabase.from("profiles").select("first_name, last_name, email, enrollment_step, date_of_birth, gender, height_cm, shoe_size, city, state, country, case_study_consent_at").eq("user_id", clientId).maybeSingle(),
        supabase.from("bookings").select("id, scheduled_at, status, zoom_link").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("creator_type_profiles").select("primary_type, secondary_type, type_3, type_4, profiled_at").eq("user_id", clientId).maybeSingle(),
        (supabase.from("client_subscription_summary" as any).select("tier").eq("user_id", clientId).maybeSingle() as any),
        supabase.from("case_studies").select("id").eq("subject_user_id", clientId).limit(1),
      ]);
      if (profileRes.data) {
        setProfile(profileRes.data);
        const name = `${profileRes.data.first_name || ""} ${profileRes.data.last_name || ""}`.trim();
        onClientNameLoaded?.(name || "Unknown");
      }
      if (bookingRes.data) setBooking(bookingRes.data);
      if (ctRes.data) setCreatorType(ctRes.data);
      setClientIsPaidSubscriber(isPaidTier(subRes.data?.tier));
      setIsCaseStudySubject(!!(csRes.data && csRes.data.length > 0));
      setLoading(false);
    }
    fetchClientData();
  }, [clientId, onClientNameLoaded]);

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Loading client details…</div>;
  }

  if (!profile) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Client profile not found.</div>;
  }

  const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-display font-bold text-foreground">{fullName}</h2>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {profile.enrollment_step && (() => {
                const types = [creatorType?.primary_type, creatorType?.secondary_type, creatorType?.type_3, creatorType?.type_4].filter(Boolean) as string[];
                const isCaseStudy = !!profile.case_study_consent_at;
                const isComplete = profile.enrollment_step === "complete" || types.length >= 4;
                const label = types.length >= 4
                  ? (isCaseStudy ? "Case Study Complete" : "Creator Blueprint Complete")
                  : types.length >= 1
                    ? "Partial Profile"
                    : profile.enrollment_step === "complete"
                      ? (isCaseStudy ? "Case Study Complete" : "Partial Profile")
                      : profile.enrollment_step.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                const color = isComplete
                  ? "bg-green-500/10 text-green-600 border-green-500/20"
                  : types.length >= 1
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                    : (profile.enrollment_step === "photos_uploaded" || profile.enrollment_step === "booking_made")
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      : "bg-muted/50 text-muted-foreground border-border";
                return (
                  <Badge variant="outline" className={`text-xs ${color}`}>
                    {label}
                  </Badge>
                );
              })()}
              {sortCreatorTypes(
                [creatorType?.primary_type, creatorType?.secondary_type, creatorType?.type_3, creatorType?.type_4]
                  .filter(Boolean) as string[]
              ).map((t) => (
                  <Badge key={t} className="text-xs capitalize text-white border-0" style={{ backgroundColor: getCreatorTypeColor(t) }}>
                    <Sparkles className="h-3 w-3 mr-1" />
                    {t}
                  </Badge>
                ))}
              <Badge
                variant="outline"
                className={`text-xs ${profile.case_study_consent_at ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-muted/50 text-muted-foreground border-border"}`}
              >
                Consent: {profile.case_study_consent_at ? "Given" : "Not Given"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Personal details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
          {profile.gender && (
            <div>
              <span className="text-muted-foreground text-xs">Gender</span>
              <p className="font-medium text-foreground capitalize">{profile.gender}</p>
            </div>
          )}
          {profile.date_of_birth && (
            <div>
              <span className="text-muted-foreground text-xs">DOB</span>
              <p className="font-medium text-foreground">{new Date(profile.date_of_birth).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
          )}
          {profile.height_cm && (
            <div>
              <span className="text-muted-foreground text-xs">Height</span>
              <p className="font-medium text-foreground">{profile.height_cm} cm</p>
            </div>
          )}
          {profile.shoe_size && (
            <div>
              <span className="text-muted-foreground text-xs">Shoe Size</span>
              <p className="font-medium text-foreground">{profile.shoe_size}</p>
            </div>
          )}
          {(profile.city || profile.state || profile.country) && (
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">Location</span>
              <p className="font-medium text-foreground">
                {[profile.city, profile.state, profile.country].filter(Boolean).join(", ")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Booking info */}
      {booking?.scheduled_at && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Session: {new Date(booking.scheduled_at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-xs text-muted-foreground capitalize">Status: {booking.status || "scheduled"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            {editingZoom ? (
              <>
                <Input
                  value={zoomInput}
                  onChange={(e) => setZoomInput(e.target.value)}
                  placeholder="Paste Zoom link here…"
                  className="h-7 text-xs flex-1"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  disabled={savingZoom}
                  onClick={async () => {
                    setSavingZoom(true);
                    await supabase.from("bookings").update({ zoom_link: zoomInput || null }).eq("id", booking.id);
                    setBooking({ ...booking, zoom_link: zoomInput || null });
                    setEditingZoom(false);
                    setSavingZoom(false);
                    toast({ title: "Zoom link updated" });
                  }}
                >
                  <Check className="h-3.5 w-3.5 text-green-600" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingZoom(false)}>
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </>
            ) : booking.zoom_link ? (
              <>
                <a href={booking.zoom_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate flex-1">
                  {booking.zoom_link}
                </a>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setZoomInput(booking.zoom_link || ""); setEditingZoom(true); }}>
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground italic flex-1">No Zoom link set</span>
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-full" onClick={() => { setZoomInput(""); setEditingZoom(true); }}>
                  Add Zoom Link
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Session Recordings */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <ClientRecordingLinks clientId={clientId} />
      </div>

      {/* Subscription info */}
      <ClientSubscriptionCard clientId={clientId} />

      {/* Creator Type Assignment */}
      <CreatorTypeAssignmentForm clientId={clientId} clientName={fullName} />

      {/* Photo composite */}
      <CompositePhotoLayout userId={clientId} subjectName={`${fullName}'s Profiling Photos`} showReclassify />

      {/* Face Split & Body Annotation — certified practitioners only, paying subscribers only */}
      {isCertified && clientIsPaidSubscriber && !isCaseStudySubject && (
        <>
          <FaceSplitMirror userId={clientId} onDataChange={handleFaceSplitChange} />
          <BodyAnnotationTool userId={clientId} onDataChange={handleBodyAnnotationChange} />

          {/* Send Profiling Report */}
          <ProfilingReportButton
            clientId={clientId}
            clientEmail={profile.email}
            clientName={fullName}
            practitionerName={user?.email?.split("@")[0] || "Practitioner"}
            creatorTypes={sortCreatorTypes(
              [creatorType?.primary_type, creatorType?.secondary_type, creatorType?.type_3, creatorType?.type_4].filter(Boolean) as string[]
            )}
            faceSplitData={faceSplitData}
            bodyAnnotationData={bodyAnnotationData}
          />
        </>
      )}
    </div>
  );
}
