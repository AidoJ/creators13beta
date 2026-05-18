import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Video, Plus, Trash2, Clock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format, isPast, parseISO, differenceInDays } from "date-fns";

interface ZoomRecording {
  id: string;
  url: string;
  label: string | null;
  expires_at: string;
  created_at: string;
}

interface ZoomRecordingLinksProps {
  caseStudyId: string;
  canEdit?: boolean;
}

export default function ZoomRecordingLinks({ caseStudyId, canEdit = true }: ZoomRecordingLinksProps) {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState<ZoomRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchRecordings() {
    const { data } = await supabase
      .from("zoom_recordings")
      .select("id, url, label, expires_at, created_at")
      .eq("case_study_id", caseStudyId)
      .order("created_at", { ascending: false });

    // Filter out expired recordings client-side
    const active = (data || []).filter(r => !isPast(parseISO(r.expires_at)));
    setRecordings(active);
    setLoading(false);
  }

  useEffect(() => {
    fetchRecordings();
  }, [caseStudyId]);

  async function handleAdd() {
    if (!url || !expiresAt || !user) return;
    setSaving(true);
    const { error } = await supabase.from("zoom_recordings").insert({
      case_study_id: caseStudyId,
      practitioner_id: user.id,
      url,
      label: label || null,
      expires_at: expiresAt,
    });
    setSaving(false);
    if (error) {
      toast.error("Failed to add recording link");
      return;
    }
    toast.success("Recording link added");
    setUrl("");
    setLabel("");
    setExpiresAt("");
    setShowForm(false);
    fetchRecordings();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("zoom_recordings").delete().eq("id", id);
    if (error) {
      toast.error("Failed to remove link");
      return;
    }
    setRecordings(prev => prev.filter(r => r.id !== id));
    toast.success("Link removed");
  }

  if (loading) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Video className="h-3.5 w-3.5" /> Zoom Recordings
        </p>
        {canEdit && !showForm && (
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setShowForm(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add Link
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2 mb-3">
          <div>
            <Label className="text-xs">Recording URL *</Label>
            <Input
              placeholder="https://zoom.us/rec/share/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Label (optional)</Label>
            <Input
              placeholder="e.g. Session 1 Recording"
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Expiry Date *</Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd")}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={saving || !url || !expiresAt}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {recordings.length === 0 && !showForm ? (
        <p className="text-xs text-muted-foreground italic">No recording links attached.</p>
      ) : (
        <div className="space-y-1.5">
          {recordings.map(r => {
            const daysLeft = differenceInDays(parseISO(r.expires_at), new Date());
            const isExpiringSoon = daysLeft <= 3;
            return (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs"
              >
                <ExternalLink className="h-3 w-3 text-primary flex-shrink-0" />
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate flex-1"
                >
                  {r.label || "Zoom Recording"}
                </a>
                <span className={`flex items-center gap-1 flex-shrink-0 ${isExpiringSoon ? "text-destructive" : "text-muted-foreground"}`}>
                  <Clock className="h-3 w-3" />
                  {daysLeft <= 0 ? "Expires today" : `${daysLeft}d left`}
                </span>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(r.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
