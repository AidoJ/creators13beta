import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, Video, Clock, Repeat, Globe, ChevronLeft, ChevronRight, List, CalendarDays, CalendarPlus } from "lucide-react";
import { CREATOR_TYPE_NAMES, getCreatorTypeColor } from "@/lib/creatorTypes";

/** Returns {bg, text} style for a call title based on naming conventions. */
function getCallColorStyle(title: string): { backgroundColor: string; color: string } {
  const lower = title.toLowerCase();
  if (lower.includes("case study")) {
    return { backgroundColor: "#F5A300", color: "#000" };
  }
  for (const name of CREATOR_TYPE_NAMES) {
    if (lower.includes(name.toLowerCase())) {
      return { backgroundColor: getCreatorTypeColor(name), color: "#fff" };
    }
  }
  return { backgroundColor: "hsl(270, 60%, 50%)", color: "#fff" };
}

interface TrainingCall {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  zoom_link: string | null;
  recurrence_rule: string;
  cancelled: boolean;
}

const TIMEZONE_OPTIONS = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Hobart",
  "Pacific/Auckland",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

/** Formats a Date to ICS-compatible UTC string e.g. 20260401T090000Z */
function formatICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildGoogleCalendarUrl(title: string, scheduledAt: string, durationMinutes: number, description?: string | null, zoomLink?: string | null): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const details = [description, zoomLink ? `Join: ${zoomLink}` : ""].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatICSDate(start)}/${formatICSDate(end)}`,
    details,
  });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

function buildOutlookCalendarUrl(title: string, scheduledAt: string, durationMinutes: number, description?: string | null, zoomLink?: string | null): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const body = [description, zoomLink ? `Join: ${zoomLink}` : ""].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function downloadICS(title: string, scheduledAt: string, durationMinutes: number, description?: string | null, zoomLink?: string | null) {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const desc = [description, zoomLink ? `Join: ${zoomLink}` : ""].filter(Boolean).join("\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//13Creators//Training//EN",
    "BEGIN:VEVENT",
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${desc}`,
    zoomLink ? `URL:${zoomLink}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function AddToCalendarButton({ call }: { call: TrainingCall }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground">
          <CalendarPlus className="h-3 w-3 mr-1" />Add
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2 space-y-1" align="end">
        <a href={buildGoogleCalendarUrl(call.title, call.scheduled_at, call.duration_minutes, call.description, call.zoom_link)} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-8">Google Calendar</Button>
        </a>
        <a href={buildOutlookCalendarUrl(call.title, call.scheduled_at, call.duration_minutes, call.description, call.zoom_link)} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-8">Outlook</Button>
        </a>
        <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-8" onClick={() => downloadICS(call.title, call.scheduled_at, call.duration_minutes, call.description, call.zoom_link)}>
          Apple / .ics file
        </Button>
      </PopoverContent>
    </Popover>
  );
}

interface TrainingCalendarProps {
  compact?: boolean;
  refreshKey?: number;
}

export default function TrainingCalendar({ compact = false, refreshKey = 0 }: TrainingCalendarProps) {
  const { user } = useAuth();
  const [calls, setCalls] = useState<TrainingCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [timezone, setTimezone] = useState("Australia/Sydney");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarView, setCalendarView] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.timezone) setTimezone(data.timezone);
      });
  }, [user]);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("training_calls")
      .select("id, title, description, scheduled_at, duration_minutes, zoom_link, recurrence_rule, cancelled")
      .eq("cancelled", false)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true });
    setCalls((data as TrainingCall[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCalls(); }, [fetchCalls, refreshKey]);

  async function handleTimezoneChange(tz: string) {
    setTimezone(tz);
    if (user) {
      await supabase.from("profiles").update({ timezone: tz }).eq("user_id", user.id);
    }
  }

  function formatInTimezone(isoDate: string) {
    const d = new Date(isoDate);
    return {
      date: d.toLocaleDateString("en-AU", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" }),
      time: d.toLocaleTimeString("en-AU", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }),
      fullDate: d.toLocaleDateString("en-AU", { timeZone: timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      day: d.toLocaleDateString("en-AU", { timeZone: timezone, day: "numeric" }),
      monthKey: d.toLocaleDateString("en-AU", { timeZone: timezone, year: "numeric", month: "2-digit" }),
    };
  }

  // Group calls by date key for calendar grid
  const callsByDateKey: Record<string, TrainingCall[]> = {};
  calls.forEach(call => {
    const d = new Date(call.scheduled_at);
    const key = d.toLocaleDateString("en-AU", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    if (!callsByDateKey[key]) callsByDateKey[key] = [];
    callsByDateKey[key].push(call);
  });

  // Group calls by full date label for list view
  const callsByDate: Record<string, TrainingCall[]> = {};
  calls.forEach(call => {
    const { fullDate } = formatInTimezone(call.scheduled_at);
    if (!callsByDate[fullDate]) callsByDate[fullDate] = [];
    callsByDate[fullDate].push(call);
  });

  // Monthly calendar helpers
  function getMonthDays(month: Date) {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1);
    const lastDay = new Date(year, m + 1, 0);
    const startPad = firstDay.getDay(); // 0=Sun
    const days: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, m, d));
    return days;
  }

  function dateToKey(d: Date) {
    return d.toLocaleDateString("en-AU", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  const monthDays = getMonthDays(currentMonth);
  const today = new Date();
  const todayKey = dateToKey(today);

  if (compact) {
    // Dashboard card: show next 3 upcoming calls
    const nextCalls = calls.slice(0, 3);
    return (
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-base font-display font-bold text-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Upcoming Training Calls
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : nextCalls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming calls scheduled.</p>
        ) : (
          <div className="space-y-2">
            {nextCalls.map(call => {
              const { date, time } = formatInTimezone(call.scheduled_at);
              return (
                <div key={call.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate rounded px-1.5 py-0.5 inline-block" style={getCallColorStyle(call.title)}>{call.title}</p>
                    <p className="text-xs text-muted-foreground">{date} · {time} · {call.duration_minutes}min</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <AddToCalendarButton call={call} />
                    {call.zoom_link && (
                      <a href={call.zoom_link} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" className="h-6 text-[10px] rounded-full bg-[hsl(var(--zoom-blue))] text-primary-foreground hover:bg-[hsl(var(--zoom-blue))]/90">
                          <Video className="h-2.5 w-2.5 mr-0.5" />Join
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Training Calendar
        </h2>
        <div className="flex items-center gap-4">
          {/* View toggle */}
          <div className="flex items-center gap-2">
            <List className="h-3.5 w-3.5 text-muted-foreground" />
            <Switch checked={calendarView} onCheckedChange={setCalendarView} id="view-toggle" />
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {/* Timezone */}
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={timezone} onValueChange={handleTimezoneChange}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[60vh]">
                <div className="max-h-[55vh] overflow-y-auto">
                  {TIMEZONE_OPTIONS.map(tz => (
                    <SelectItem key={tz} value={tz} className="text-xs">{tz.replace(/_/g, " ")}</SelectItem>
                  ))}
                </div>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading calendar…</div>
      ) : calls.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No upcoming training calls scheduled.</p>
        </div>
      ) : calendarView ? (
        /* ====== MONTHLY CALENDAR GRID ====== */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="text-sm font-semibold text-foreground">
              {currentMonth.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-px rounded-xl border border-border bg-border overflow-hidden">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="bg-muted px-1 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{d}</div>
            ))}
            {monthDays.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} className="bg-card min-h-[80px]" />;
              const key = dateToKey(day);
              const dayCalls = callsByDateKey[key] || [];
              const isToday = key === todayKey;
              return (
                <div key={key} className={`bg-card min-h-[80px] p-1 ${isToday ? "ring-1 ring-inset ring-primary/40" : ""}`}>
                  <span className={`text-[11px] font-medium ${isToday ? "text-primary font-bold" : "text-foreground"}`}>{day.getDate()}</span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayCalls.slice(0, 2).map(call => {
                      const { time } = formatInTimezone(call.scheduled_at);
                      return (
                        <div key={call.id} className="rounded px-1 py-0.5 text-[9px] truncate" style={getCallColorStyle(call.title)} title={`${call.title} — ${time}`}>
                          {time} {call.title}
                        </div>
                      );
                    })}
                    {dayCalls.length > 2 && (
                      <span className="text-[9px] text-muted-foreground">+{dayCalls.length - 2} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ====== LIST VIEW ====== */
        <div className="space-y-3">
          {Object.entries(callsByDate).map(([dateLabel, dateCalls]) => (
            <div key={dateLabel}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{dateLabel}</h3>
              <div className="space-y-2">
                {dateCalls.map(call => {
                  const { time } = formatInTimezone(call.scheduled_at);
                  return (
                    <div key={call.id} className="rounded-xl border border-primary/15 bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm rounded px-1.5 py-0.5 inline-block" style={getCallColorStyle(call.title)}>{call.title}</h4>
                          {call.recurrence_rule !== "none" && (
                            <Badge variant="outline" className="text-[10px]">
                              <Repeat className="h-2.5 w-2.5 mr-0.5" />
                              {call.recurrence_rule}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{time}</span>
                          <span>{call.duration_minutes} minutes</span>
                        </div>
                        {call.description && (
                          <p className="text-xs text-muted-foreground mt-1">{call.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <AddToCalendarButton call={call} />
                        {call.zoom_link && (
                          <a href={call.zoom_link} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" className="rounded-full h-8 text-xs bg-[hsl(var(--zoom-blue))] text-primary-foreground hover:bg-[hsl(var(--zoom-blue))]/90">
                              <Video className="h-3 w-3 mr-1" />Join Zoom
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
