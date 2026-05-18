import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, Pencil, Camera, CalendarPlus } from "lucide-react";

interface ProgressCardProps {
  step: string | null;
  isComplete: boolean;
  photosUploaded: boolean;
  bookingMade: boolean;
  hasDetails: boolean;
  bookingDate?: string | null;
  tier?: string | null;
  isCaseStudy?: boolean;
  confirmedTypeCount?: number;
  showBooking?: boolean;
}

const ALL_STEPS = [
  { key: "account", label: "Account created" },
  { key: "details", label: "Personal details" },
  { key: "photos", label: "Photos uploaded" },
  { key: "booking", label: "Session booked" },
  { key: "complete", label: "Profiling complete" }, // dynamic label below
];

export default function ProgressCard({ step, isComplete, photosUploaded, bookingMade, hasDetails, bookingDate, tier, isCaseStudy, confirmedTypeCount = 0, showBooking = false }: ProgressCardProps) {
  const navigate = useNavigate();

  const profilingLabel = confirmedTypeCount >= 4
    ? "Profiling complete"
    : confirmedTypeCount > 0
      ? `${confirmedTypeCount} of 4 Creator Types Profiled`
      : "Profiling complete";

  const hideBooking = isCaseStudy || !showBooking;
  const STEPS = (hideBooking ? ALL_STEPS.filter(s => s.key !== "booking") : ALL_STEPS)
    .map(s => s.key === "complete" ? { ...s, label: profilingLabel } : s);

  const doneMap: Record<string, boolean> = {
    account: true,
    details: hasDetails,
    photos: photosUploaded,
    booking: bookingMade,
    complete: isComplete && confirmedTypeCount >= 4,
  };

  const completedCount = Object.values(doneMap).filter(Boolean).length;
  const progressValue = (completedCount / STEPS.length) * 100;

  const actionMap: Record<string, { icon: typeof Pencil; label: string; onClick: () => void } | null> = {
    account: null,
    details: { icon: Pencil, label: hasDetails ? "Edit" : "Add", onClick: () => navigate("/enroll/details?returnTo=/dashboard") },
    photos: { icon: Camera, label: photosUploaded ? "Edit" : "Upload", onClick: () => navigate("/enroll/photos?returnTo=/dashboard") },
    booking: {
      icon: CalendarPlus,
      label: bookingMade ? "Reschedule" : "Book",
      onClick: () => navigate(`/enroll/booking?tier=${tier || "wren"}&returnTo=/dashboard`),
    },
    complete: null,
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-display font-bold text-foreground">Enrollment Progress</h2>
          <span className="text-xs text-muted-foreground font-medium">{completedCount}/{STEPS.length}</span>
        </div>
        <Progress value={progressValue} className="h-2" />
      </div>

      <div className="space-y-2">
        {STEPS.map((s) => {
          const done = doneMap[s.key];
          const action = actionMap[s.key];
          return (
            <div key={s.key} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5">
                {done ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <span className={done ? "text-foreground" : "text-muted-foreground"}>
                  {s.label}
                  {s.key === "booking" && bookingDate && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      — {new Date(bookingDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                      {" "}
                      {new Date(bookingDate).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </span>
              </div>
              {action && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary hover:text-primary/80 h-7 px-2"
                  onClick={action.onClick}
                >
                  <action.icon className="h-3 w-3 mr-1" />
                  {action.label}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
