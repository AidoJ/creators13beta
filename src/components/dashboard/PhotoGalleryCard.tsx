import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PHOTO_SLOTS = [
  { key: "face_front_closed", label: "Face" },
  { key: "face_front_smiling", label: "Smile" },
  { key: "face_side", label: "Side" },
  { key: "body_front", label: "Front" },
  { key: "body_back", label: "Back" },
  { key: "body_side", label: "Side" },
  { key: "feet", label: "Feet" },
  { key: "hands", label: "Hands" },
] as const;

// Fallback for photos stored with generic photo_1..photo_8 types
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

interface PhotoGalleryCardProps {
  userId: string;
  photosUploaded: boolean;
}

export default function PhotoGalleryCard({ userId, photosUploaded }: PhotoGalleryCardProps) {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiling_photos")
        .select("photo_type, storage_path")
        .eq("user_id", userId);

      if (data && data.length > 0) {
        const map: Record<string, string> = {};
        for (const row of data) {
          const { data: urlData } = supabase.storage
            .from("profiling-photos")
            .getPublicUrl(row.storage_path);
          if (urlData?.publicUrl) map[row.photo_type] = urlData.publicUrl;
        }
        setPhotos(map);
      }
      setLoading(false);
    }
    load();
  }, [userId]);

  const photoCount = Object.keys(photos).length;

  if (!photosUploaded && photoCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center space-y-3">
        <Camera className="h-8 w-8 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">No profiling photos uploaded yet.</p>
        <Button size="sm" className="rounded-full" onClick={() => navigate("/enroll/photos")}>
          <Camera className="h-3.5 w-3.5 mr-1" /> Upload Photos
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-display font-bold text-foreground">
          Profiling Photos
          <span className="text-xs font-normal text-muted-foreground ml-2">{photoCount}/8</span>
        </h2>
        <Button variant="ghost" size="sm" className="text-xs text-primary h-7 px-2" onClick={() => navigate("/enroll/photos")}>
          <Camera className="h-3 w-3 mr-1" /> {photoCount > 0 ? "Edit" : "Upload"}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
          {PHOTO_SLOTS.map((slot) => {
            const url = photos[slot.key] || photos[GENERIC_FALLBACK[slot.key]] || null;
            return (
              <div key={slot.key} className="relative aspect-square rounded-lg overflow-hidden bg-muted/40">
                {url ? (
                  <img src={url} alt={slot.label} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <User className="h-4 w-4 text-muted-foreground/30" />
                  </div>
                )}
                <span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-foreground/60 text-background py-0.5 leading-none">
                  {slot.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
