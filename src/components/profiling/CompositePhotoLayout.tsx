import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, User, X, ZoomIn, RefreshCw, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { generateProfilingPdf } from "@/lib/generateProfilingPdf";

const PHOTO_ORDER = [
  { key: "face_front_closed", label: "Face Front" },
  { key: "face_front_smiling", label: "Face Smiling" },
  { key: "face_side", label: "Face Side" },
  { key: "body_front", label: "Body Front" },
  { key: "body_back", label: "Body Back" },
  { key: "body_side", label: "Body Side" },
  { key: "feet", label: "Feet" },
  { key: "hands", label: "Hands" },
] as const;

// Fallback mapping: when photos are stored with generic photo_1..photo_8 types
const GENERIC_FALLBACK: Record<string, string> = {
  face_front_closed: "photo_1",
  face_front_smiling: "photo_2",
  face_side: "photo_3",
  body_front: "photo_4",
  body_back: "photo_5",
  body_side: "photo_6",
  feet: "photo_7",
  hands: "photo_8",
};

interface CompositePhotoLayoutProps {
  userId: string;
  subjectName?: string;
  className?: string;
  showReclassify?: boolean;
}

export default function CompositePhotoLayout({ userId, subjectName, className, showReclassify = false }: CompositePhotoLayoutProps) {
  const [photos, setPhotos] = useState<Record<string, { thumb: string; full: string } | null>>({});
  const [uploadDate, setUploadDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [reclassifying, setReclassifying] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<{ url: string; label: string } | null>(null);
  const { toast } = useToast();

  const fetchPhotos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiling_photos")
      .select("photo_type, storage_path, uploaded_at")
      .eq("user_id", userId)
      .order("uploaded_at", { ascending: true });

    if (error || !data) {
      setLoading(false);
      return;
    }

    const photoMap: Record<string, { thumb: string; full: string } | null> = {};
    let earliestDate: string | null = null;
    for (const row of data) {
      const { data: urlData } = supabase.storage
        .from("profiling-photos")
        .getPublicUrl(row.storage_path);
      if (urlData?.publicUrl) {
        const base = urlData.publicUrl;
        photoMap[row.photo_type] = {
          thumb: `${base}?width=300&quality=60`,
          full: base,
        };
      } else {
        photoMap[row.photo_type] = null;
      }
      if (row.uploaded_at && (!earliestDate || row.uploaded_at < earliestDate)) {
        earliestDate = row.uploaded_at;
      }
    }
    setPhotos(photoMap);
    setUploadDate(earliestDate ? new Date(earliestDate) : null);
    setLoading(false);
  };

  useEffect(() => { fetchPhotos(); }, [userId]);

  const handleDownloadPdf = async () => {
    setGeneratingPdf(true);
    try {
      const fullUrlMap: Record<string, string> = {};
      for (const [key, entry] of Object.entries(photos)) {
        if (entry?.full) fullUrlMap[key] = entry.full;
      }
      const blob = await generateProfilingPdf(fullUrlMap, subjectName, uploadDate || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(subjectName || "client").replace(/\s+/g, "_")}_photos.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "PDF generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  };
  const handleReclassify = async () => {
    setReclassifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("classify-photos", {
        body: { user_id: userId },
      });
      if (error) throw error;
      const count = data?.reclassified?.length || 0;
      if (count > 0) {
        toast({ title: `Reclassified ${count} photo${count > 1 ? "s" : ""}`, description: "Photos have been re-matched to their correct types." });
        await fetchPhotos(); // Reload
      } else {
        toast({ title: "All photos correctly matched", description: "No reclassification needed." });
      }
    } catch (e: any) {
      toast({ title: "Reclassification failed", description: e.message, variant: "destructive" });
    } finally {
      setReclassifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const Placeholder = ({ label }: { label: string }) => (
    <div className="bg-muted/50 rounded-lg flex flex-col items-center justify-center h-full min-h-[100px]">
      <User className="h-6 w-6 text-muted-foreground/40" />
      <span className="text-[10px] text-muted-foreground/60 mt-1">{label}</span>
    </div>
  );

  const BODY_KEYS = ["body_front", "body_back", "body_side"];

  const PhotoCell = ({ photoKey, label, className: cellClass }: { photoKey: string; label: string; className?: string }) => {
    const entry = photos[photoKey] || photos[GENERIC_FALLBACK[photoKey]] || null;
    const thumbUrl = entry?.thumb || null;
    const isBody = BODY_KEYS.includes(photoKey);
    return (
      <div className={cn("overflow-hidden rounded-lg group relative cursor-pointer", cellClass)}
        onClick={() => entry && setZoomedPhoto({ url: entry.full, label })}
      >
        {thumbUrl ? (
          <>
            <img src={thumbUrl} alt={label} className={cn("w-full h-full bg-muted/30", isBody ? "object-cover" : "object-contain")} loading="lazy" decoding="async" />
            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors flex items-center justify-center">
              <ZoomIn className="h-5 w-5 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          </>
        ) : (
          <Placeholder label={label} />
        )}
      </div>
    );
  };

  return (
    <div className={cn("bg-card border border-border rounded-2xl p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        {subjectName && (
          <h3 className="text-lg font-display font-bold text-foreground">{subjectName}</h3>
        )}
        <div className="flex items-center gap-2">
          {Object.keys(photos).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1.5"
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
            >
              {generatingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {generatingPdf ? "Generating…" : "Download PDF"}
            </Button>
          )}
          {showReclassify && Object.keys(photos).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1.5"
              onClick={handleReclassify}
              disabled={reclassifying}
            >
              {reclassifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {reclassifying ? "Classifying…" : "AI Re-classify"}
            </Button>
          )}
        </div>
      </div>

      {/* Composite grid matching reference layout:
          Row 1: face_front_closed | face_front_smiling | face_side | body_front | body_back | body_side
          Row 2: feet | hands | (empty) | (body photos span full height)
      */}
      <div className="grid grid-cols-6 gap-2">
        {/* Top row - faces */}
        <PhotoCell photoKey="face_front_closed" label="Face Front" className="aspect-square" />
        <PhotoCell photoKey="face_front_smiling" label="Face Smiling" className="aspect-square" />
        <PhotoCell photoKey="face_side" label="Face Side" className="aspect-square" />

        {/* Body photos - taller */}
        <PhotoCell photoKey="body_front" label="Body Front" className="row-span-2 aspect-[3/5]" />
        <PhotoCell photoKey="body_back" label="Body Back" className="row-span-2 aspect-[3/5]" />
        <PhotoCell photoKey="body_side" label="Body Side" className="row-span-2 aspect-[3/5]" />

        {/* Bottom left - feet & hands */}
        <PhotoCell photoKey="feet" label="Feet" className="aspect-square" />
        <PhotoCell photoKey="hands" label="Hands" className="aspect-square" />
        <div /> {/* empty cell */}
      </div>

      {/* Zoom dialog with navigation */}
      <Dialog open={!!zoomedPhoto} onOpenChange={() => setZoomedPhoto(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-2 flex flex-col items-center">
          <DialogTitle className="text-sm font-medium text-foreground sr-only">{zoomedPhoto?.label}</DialogTitle>
          <p className="text-xs text-muted-foreground mb-1">{zoomedPhoto?.label}</p>
          {zoomedPhoto && (() => {
            const availablePhotos = PHOTO_ORDER
              .map(p => {
                const entry = photos[p.key] || photos[GENERIC_FALLBACK[p.key]] || null;
                return { key: p.key, label: p.label, full: entry?.full || null };
              })
              .filter(p => p.full);
            const currentIdx = availablePhotos.findIndex(p => p.full === zoomedPhoto.url);
            const hasPrev = currentIdx > 0;
            const hasNext = currentIdx < availablePhotos.length - 1;

            return (
              <div className="relative w-full flex items-center justify-center">
                {hasPrev && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setZoomedPhoto({ url: availablePhotos[currentIdx - 1].full!, label: availablePhotos[currentIdx - 1].label }); }}
                    className="absolute left-1 z-10 rounded-full bg-background/80 hover:bg-background border border-border p-2 transition-colors shadow-md"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-5 w-5 text-foreground" />
                  </button>
                )}
                <img
                  src={zoomedPhoto.url}
                  alt={zoomedPhoto.label}
                  className="max-w-full max-h-[80vh] object-contain rounded-lg"
                />
                {hasNext && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setZoomedPhoto({ url: availablePhotos[currentIdx + 1].full!, label: availablePhotos[currentIdx + 1].label }); }}
                    className="absolute right-1 z-10 rounded-full bg-background/80 hover:bg-background border border-border p-2 transition-colors shadow-md"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-5 w-5 text-foreground" />
                  </button>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
