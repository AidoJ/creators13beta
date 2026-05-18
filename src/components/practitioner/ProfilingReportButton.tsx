import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Send, Check, Loader2 } from "lucide-react";
import type { FaceSplitData } from "@/components/trainer/FaceSplitMirror";
import type { BodyAnnotationData } from "@/components/trainer/BodyAnnotationTool";

interface ProfilingReportButtonProps {
  clientId: string;
  clientEmail: string | null;
  clientName: string;
  practitionerName: string;
  creatorTypes: string[];
  faceSplitData: FaceSplitData | null;
  bodyAnnotationData: BodyAnnotationData | null;
}

async function uploadDataUrlToStorage(
  dataUrl: string,
  storagePath: string
): Promise<string | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const { error } = await supabase.storage
      .from("profiling-photos")
      .upload(storagePath, blob, { upsert: true, contentType: "image/png" });
    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    const { data } = supabase.storage
      .from("profiling-photos")
      .getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (e) {
    console.error("Upload failed:", e);
    return null;
  }
}

export default function ProfilingReportButton({
  clientId,
  clientEmail,
  clientName,
  practitionerName,
  creatorTypes,
  faceSplitData,
  bodyAnnotationData,
}: ProfilingReportButtonProps) {
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const { toast } = useToast();

  const hasContent =
    (faceSplitData?.leftMirroredDataUrl || faceSplitData?.notes) ||
    (bodyAnnotationData?.annotatedImageDataUrl || bodyAnnotationData?.notes);

  const handleSend = async () => {
    if (!clientEmail) {
      toast({ title: "No email address", description: "This client doesn't have an email on file.", variant: "destructive" });
      return;
    }
    if (!hasContent) {
      toast({ title: "Nothing to send", description: "Complete the face split or body annotation first.", variant: "destructive" });
      return;
    }

    setSending(true);

    try {
      const ts = Date.now();
      const imageUrls: Record<string, string> = {};

      // Upload face split images
      if (faceSplitData?.leftMirroredDataUrl) {
        const url = await uploadDataUrlToStorage(
          faceSplitData.leftMirroredDataUrl,
          `reports/${clientId}/face-left-${ts}.png`
        );
        if (url) imageUrls.leftMirrored = url;
      }
      if (faceSplitData?.rightMirroredDataUrl) {
        const url = await uploadDataUrlToStorage(
          faceSplitData.rightMirroredDataUrl,
          `reports/${clientId}/face-right-${ts}.png`
        );
        if (url) imageUrls.rightMirrored = url;
      }
      if (faceSplitData?.originalImageUrl) {
        if (faceSplitData.originalImageUrl.startsWith("data:")) {
          const url = await uploadDataUrlToStorage(
            faceSplitData.originalImageUrl,
            `reports/${clientId}/face-original-${ts}.png`
          );
          if (url) imageUrls.original = url;
        } else {
          // Re-upload the public URL as a copy into reports/ so it's always accessible
          try {
            const resp = await fetch(faceSplitData.originalImageUrl);
            const blob = await resp.blob();
            const { error } = await supabase.storage
              .from("profiling-photos")
              .upload(`reports/${clientId}/face-original-${ts}.png`, blob, { upsert: true, contentType: blob.type || "image/png" });
            if (!error) {
              const { data: urlData } = supabase.storage
                .from("profiling-photos")
                .getPublicUrl(`reports/${clientId}/face-original-${ts}.png`);
              imageUrls.original = urlData.publicUrl;
            } else {
              imageUrls.original = faceSplitData.originalImageUrl;
            }
          } catch {
            imageUrls.original = faceSplitData.originalImageUrl;
          }
        }
      }

      // Upload body annotation image
      if (bodyAnnotationData?.annotatedImageDataUrl) {
        const url = await uploadDataUrlToStorage(
          bodyAnnotationData.annotatedImageDataUrl,
          `reports/${clientId}/body-annotated-${ts}.png`
        );
        if (url) imageUrls.bodyAnnotated = url;
      }

      const { data, error } = await supabase.functions.invoke("send-profiling-report", {
        body: {
          client_email: clientEmail,
          client_name: clientName,
          practitioner_name: practitionerName,
          face_split_notes: faceSplitData?.notes || "",
          body_annotation_notes: bodyAnnotationData?.notes || "",
          image_urls: imageUrls,
          creator_types: creatorTypes.join(", "),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const now = new Date().toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      setSentAt(now);
      toast({ title: "Report sent!", description: `Profiling report emailed to ${clientEmail}` });
    } catch (err: any) {
      console.error("Send report error:", err);
      toast({ title: "Failed to send", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Email Profiling Report
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasContent
              ? `Compile photos & notes into a report and email to ${clientEmail || "client"}`
              : "Complete the face split or body annotation above first"}
          </p>
          {sentAt && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <Check className="h-3 w-3" />
              Last sent: {sentAt}
            </p>
          )}
        </div>
        <Button
          onClick={handleSend}
          disabled={sending || !hasContent || !clientEmail}
          className="gap-2"
          variant={sentAt ? "outline" : "default"}
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : sentAt ? (
            <>
              <Send className="h-4 w-4" />
              Resend Report
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send Report
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
