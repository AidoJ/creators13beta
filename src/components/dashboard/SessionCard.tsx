import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Video, CalendarPlus } from "lucide-react";

interface SessionCardProps {
  scheduledAt: string | null;
  status: string | null;
  zoomLink: string | null;
  photosUploaded: boolean;
  bookingMade: boolean;
  hasBookingRecord: boolean;
  tier?: string | null;
}

export default function SessionCard({ scheduledAt, status, zoomLink, photosUploaded, bookingMade, hasBookingRecord, tier }: SessionCardProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <h2 className="text-base font-display font-bold text-foreground flex items-center gap-2">
        <Video className="h-4 w-4 text-primary" />
        Zoom Session
      </h2>

      {scheduledAt ? (
        <div className="space-y-2">
          <p className="text-sm text-foreground font-semibold">
            {new Date(scheduledAt).toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {" at "}
            {new Date(scheduledAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs text-muted-foreground capitalize">Status: {status || "scheduled"}</p>
          <div className="flex flex-col gap-2 pt-1">
            {zoomLink ? (
              <a
                href={zoomLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary font-semibold hover:underline"
              >
                <Video className="h-3.5 w-3.5" /> Join Meeting →
              </a>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Check your email for the Zoom link from your Calendly confirmation.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 rounded-full"
              onClick={() => navigate(`/enroll/booking?tier=${tier || "wren"}`)}
            >
              Reschedule
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {hasBookingRecord ? (
            <>
              <p className="text-sm text-foreground font-semibold">
                Session booked — awaiting schedule confirmation.
              </p>
              <p className="text-xs text-muted-foreground capitalize">Status: {status || "scheduled"}</p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 rounded-full"
                onClick={() => navigate(`/enroll/booking?tier=${tier || "wren"}`)}
              >
                Reschedule
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {photosUploaded
                  ? "Your photos are in — time to book your profiling session!"
                  : "Upload your photos to unlock booking."}
              </p>
              {photosUploaded && !bookingMade && (
                <Button size="sm" className="rounded-full" onClick={() => navigate(`/enroll/booking?tier=${tier || "wren"}`)}>
                  <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Book Your Session
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
