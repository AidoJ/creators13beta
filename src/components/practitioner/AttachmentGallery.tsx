import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Paperclip, ZoomIn, FileText } from "lucide-react";

interface AttachmentGalleryProps {
  attachments: string[];
  title?: string;
}

export default function AttachmentGallery({ attachments, title = "Paper Assessment Pages" }: AttachmentGalleryProps) {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) return null;

  function getPublicUrl(path: string) {
    return supabase.storage.from("profiling-photos").getPublicUrl(path).data.publicUrl;
  }

  function getLabel(path: string) {
    const fileName = path.split("/").pop() || "";
    return fileName.replace(/\.[^.]+$/, "").replace(/_/g, " ");
  }

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Paperclip className="h-3.5 w-3.5" /> {title}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {attachments.map((path, i) => {
          const url = getPublicUrl(path);
          const isPdf = /\.pdf$/i.test(path);
          return (
            <button
              key={i}
              onClick={() => isPdf ? window.open(url, "_blank", "noopener,noreferrer") : setZoomedUrl(url)}
              className="group relative rounded-lg border border-border overflow-hidden bg-muted/30 aspect-[3/4] hover:ring-2 hover:ring-primary/40 transition-all"
            >
              {isPdf ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-2 text-center">
                  <FileText className="h-10 w-10 mb-1" />
                  <span className="text-[10px] uppercase tracking-wide">PDF</span>
                </div>
              ) : (
                <img
                  src={url}
                  alt={getLabel(path)}
                  className="w-full h-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 truncate text-center">
                {getLabel(path)}
              </span>
            </button>
          );
        })}
      </div>

      <Dialog open={!!zoomedUrl} onOpenChange={() => setZoomedUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-2">
          {zoomedUrl && (
            <img
              src={zoomedUrl}
              alt="Attachment"
              className="w-full h-full object-contain max-h-[85vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
