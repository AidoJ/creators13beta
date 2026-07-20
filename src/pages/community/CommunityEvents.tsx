import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Calendar, Video, Clock, Lock, CalendarPlus, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sanitizeEventHtml } from "@/components/ui/rich-text-editor";

interface EventSession {
  date: string;
  startTime: string;
  endTime: string;
}

interface CommunityEvent {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  zoom_link: string | null;
  has_access: boolean;
  caller_tier: string;
  starts_at: string | null;
  ends_at: string | null;
  is_multi_day: boolean | null;
  sessions: EventSession[] | null;
  event_type: string | null;
  cover_image_url: string | null;
  cover_image_fit: "cover" | "contain" | null;
  cover_image_position: string | null;
  promo_link: string | null;
  promo_label: string | null;
}

function eventStart(ev: CommunityEvent): Date {
  return new Date(ev.starts_at ?? ev.scheduled_at);
}
function eventEnd(ev: CommunityEvent): Date {
  if (ev.ends_at) return new Date(ev.ends_at);
  const s = eventStart(ev);
  return new Date(s.getTime() + (ev.duration_minutes || 0) * 60000);
}

function formatICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildGoogleCalendarUrl(ev: CommunityEvent): string {
  const start = eventStart(ev);
  const end = eventEnd(ev);
  const details = [stripHtml(ev.description), ev.zoom_link ? `Join: ${ev.zoom_link}` : ""].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${formatICSDate(start)}/${formatICSDate(end)}`,
    details,
  });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

function downloadICS(ev: CommunityEvent) {
  const start = eventStart(ev);
  const end = eventEnd(ev);
  const desc = [stripHtml(ev.description), ev.zoom_link ? `Join: ${ev.zoom_link}` : ""].filter(Boolean).join("\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//13Creators//CommunityEvents//EN",
    "BEGIN:VEVENT",
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${ev.title}`,
    `DESCRIPTION:${desc}`,
    ev.zoom_link ? `URL:${ev.zoom_link}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ev.title.replace(/[^a-zA-Z0-9]/g, "_")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function CommunityEvents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<string>("wren");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user) return;
      setLoading(true);
      const { data, error } = await supabase.rpc("get_community_events", {});
      if (!active) return;
      if (error) {
        toast({ title: "Couldn't load events", description: error.message, variant: "destructive" });
        setEvents([]);
      } else {
        const rows = ((data || []) as unknown) as CommunityEvent[];
        setEvents(rows);
        if (rows[0]?.caller_tier) setTier(rows[0].caller_tier);
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [user]);

  const upcoming = events.filter(e => new Date(e.scheduled_at) >= new Date(Date.now() - 60 * 60 * 1000));
  const past = events.filter(e => new Date(e.scheduled_at) < new Date(Date.now() - 60 * 60 * 1000));

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/community/dashboard")} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Community
          </Button>
          <Badge variant="outline" className="capitalize">Tier: {tier}</Badge>
        </div>

        <header className="mb-6">
          <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Community Events
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live sessions and gatherings open to your tier.
          </p>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading events…</p>
        ) : events.length === 0 ? (
          <Card className="p-8 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No community events scheduled for your tier yet. Check back soon.
            </p>
          </Card>
        ) : (
          <div className="space-y-8">
            {upcoming.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upcoming</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcoming.map(ev => <EventTile key={ev.id} ev={ev} />)}
                </div>
              </section>
            )}
            {past.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Past</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {past.slice(0, 12).map(ev => <EventTile key={ev.id} ev={ev} past />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EventTile({ ev, past }: { ev: CommunityEvent; past?: boolean }) {
  const start = eventStart(ev);
  const end = eventEnd(ev);
  const descText = stripHtml(ev.description);

  return (
    <Card className={`flex flex-col overflow-hidden ${past ? "opacity-70" : ""}`}>
      <EventCover
        coverImageUrl={ev.cover_image_url}
        coverImageFit={ev.cover_image_fit}
        coverImagePosition={ev.cover_image_position}
        descriptionHtml={ev.description}
        tier={ev.caller_tier}
        start={start}
        end={end}
        isMultiDay={!!ev.is_multi_day}
        accessBadge={ev.has_access ? "joinable" : "preview"}
      />


      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2">{ev.title}</h3>
        {descText && (
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3">{descText}</p>
        )}

        {!past && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            {ev.has_access && ev.zoom_link ? (
              <Button size="sm" asChild className="gap-1">
                <a href={ev.zoom_link} target="_blank" rel="noopener noreferrer">
                  <Video className="h-3.5 w-3.5" />
                  Join Zoom
                </a>
              </Button>
            ) : (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3 w-3" />
                Upgrade to join
              </div>
            )}
            {ev.has_access && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1">
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="end">
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" className="justify-start gap-2" asChild>
                      <a href={buildGoogleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                        Google Calendar
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" className="justify-start gap-2" onClick={() => downloadICS(ev)}>
                      <CalendarPlus className="h-3 w-3" />
                      Apple / Outlook (.ics)
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
