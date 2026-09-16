import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Pencil, MapPin, Ruler, Calendar as CalIcon, Phone, AlertCircle } from "lucide-react";

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  pronouns: string | null;
  height_cm: number | null;
  shoe_size: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  guardian_consent?: boolean | null;
  guardian_first_name?: string | null;
  guardian_last_name?: string | null;
  guardian_phone?: string | null;
  guardian_email?: string | null;
}

interface PersonalDetailsCardProps {
  profile: ProfileData | null;
  hasDetails: boolean;
}

export default function PersonalDetailsCard({ profile, hasDetails }: PersonalDetailsCardProps) {
  const navigate = useNavigate();

  const hasAnyData = !!(
    profile?.first_name || profile?.date_of_birth || profile?.gender ||
    profile?.height_cm || profile?.shoe_size || profile?.phone
  );

  if (!hasAnyData) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Personal details not yet added.</p>
        <Button size="sm" className="rounded-full" onClick={() => navigate("/enroll/details?returnTo=/dashboard")}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Add Your Details
        </Button>
      </div>
    );
  }

  const age = profile?.date_of_birth
    ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const location = [profile?.city, profile?.state, profile?.country].filter(Boolean).join(", ");

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-display font-bold text-foreground">Personal Details</h2>
        <Button variant="ghost" size="sm" className="text-xs text-primary h-7 px-2" onClick={() => navigate("/enroll/details?returnTo=/dashboard")}>
          <Pencil className="h-3 w-3 mr-1" /> Edit
        </Button>
      </div>

      {!hasDetails && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Some required details are missing.</span>
          <Button variant="link" size="sm" className="text-xs text-amber-700 underline h-auto p-0 ml-auto" onClick={() => navigate("/enroll/details?returnTo=/dashboard")}>
            Complete now
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <DetailItem icon={<CalIcon className="h-3.5 w-3.5" />} label="DOB" value={profile?.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "—"} />
        <DetailItem label="Gender" value={profile?.gender || "—"} />
        <DetailItem label="Pronouns" value={profile?.pronouns || "—"} />
        <DetailItem icon={<Ruler className="h-3.5 w-3.5" />} label="Height" value={profile?.height_cm ? `${profile.height_cm} cm` : "—"} />
        <DetailItem label="Shoe Size" value={profile?.shoe_size || "—"} />
        <DetailItem icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={profile?.phone || "—"} />
        {location && (
          <DetailItem icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={location} className="col-span-2" />
        )}
      </div>

      {age !== null && age < 18 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 mt-2 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Parent / Guardian</p>
          {profile?.guardian_consent ? (
            <div className="text-xs text-foreground space-y-0.5">
              <p className="font-medium">
                {[profile.guardian_first_name, profile.guardian_last_name].filter(Boolean).join(" ") || "—"}
              </p>
              <p className="text-muted-foreground">{profile.guardian_phone || "—"}</p>
              <p className="text-muted-foreground">{profile.guardian_email || "—"}</p>
              <p className="text-[11px] text-green-700 mt-1">✓ Consent confirmed</p>
            </div>
          ) : (
            <p className="text-xs text-amber-700">Guardian consent not yet recorded — required before photo upload.</p>
          )}
        </div>
      )}
    </div>
  );
}

function DetailItem({ icon, label, value, className }: { icon?: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </p>
      <p className="font-medium text-foreground capitalize">{value}</p>
    </div>
  );
}
