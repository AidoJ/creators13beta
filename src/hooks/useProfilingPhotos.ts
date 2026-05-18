import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProfilingPhoto {
  photo_type: string;
  url: string;
}

const FACE_TYPES = ["face_front_smiling", "face_front_closed", "face_side"];
const BODY_TYPES = ["body_front", "body_side", "body_back"];

export function useProfilingPhotos(userId: string | undefined) {
  const [photos, setPhotos] = useState<ProfilingPhoto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) { setPhotos([]); return; }
    setLoading(true);
    supabase
      .from("profiling_photos")
      .select("photo_type, storage_path")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data) {
          const mapped = data.map((row) => {
            const { data: urlData } = supabase.storage
              .from("profiling-photos")
              .getPublicUrl(row.storage_path);
            return { photo_type: row.photo_type, url: urlData.publicUrl };
          });
          setPhotos(mapped);
        }
        setLoading(false);
      });
  }, [userId]);

  const facePhotos = photos.filter((p) => FACE_TYPES.includes(p.photo_type));
  const bodyPhotos = photos.filter((p) => BODY_TYPES.includes(p.photo_type));

  return { photos, facePhotos, bodyPhotos, loading };
}
