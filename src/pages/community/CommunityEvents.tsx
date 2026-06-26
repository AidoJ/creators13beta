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

interface CommunityEvent {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  zoom_link: string | null;
  has_access: boolean;
  caller_tier: string;
}

function formatICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildGoogleCalendarUrl(ev: CommunityEvent): string {
  const start = new Date(ev.scheduled_at);
  const end = new Date(start.getTime() + ev.duration_minutes * 60000);
  const details = [ev.description, ev.zoom_link ? `Join: ${ev.zoom_link}` : ""].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${formatICSDate(start)}/${formatICSDate(end)}`,
    details,
  });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

function downloadICS(ev: CommunityEvent) {
  const start = new Date(ev.scheduled_at);
  const end = new Date(start.getTime() + ev.duration_minutes * 60000);
  const desc = [ev.description, ev.zoom_link ? `Join: ${ev.zoom_link}` : ""].filter(Boolean).join("\\n");
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
        const rows = (data || []) as CommunityEvent[];
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
      <div className="max-w-3xl mx-auto px-4 py-6">
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
          <div className="space-y-6">
            {upcoming.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upcoming</h2>
                {upcoming.map(ev => <EventCard key={ev.id} ev={ev} />)}
              </section>
            )}
            {past.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Past</h2>
                {past.slice(0, 10).map(ev => <EventCard key={ev.id} ev={ev} past />)}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EventCard({ ev, past }: { ev: CommunityEvent; past?: boolean }) {
  const dt = new Date(ev.scheduled_at);
  const dateLabel = dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const timeLabel = dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <Card className={`p-4 ${past ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">{ev.title}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dateLabel}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeLabel} · {ev.duration_minutes}m</span>
          </div>
          {ev.description && (
            <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap">{ev.description}</p>
          )}
        </div>
        {ev.has_access ? (
          <Badge className="bg-primary/15 text-primary border-primary/30">Joinable</Badge>
        ) : (
          <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />Preview</Badge>
        )}
      </div>

      {!past && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border">
          {ev.has_access && ev.zoom_link ? (
            <Button size="sm" asChild className="gap-1">
              <a href={ev.zoom_link} target="_blank" rel="noopener noreferrer">
                <Video className="h-3.5 w-3.5" />
                Join Zoom
              </a>
            </Button>
          ) : (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              Join link available to upgraded tiers
            </div>
          )}
          {ev.has_access && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Add to calendar
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
    </Card>
  );
}
