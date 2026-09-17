import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Image as ImageIcon, Plus, Trash2, ZoomIn, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { signProfilingPhotoUrl, signProfilingPhotoUrls } from "@/lib/profilingPhotoUrl";

interface SessionImage {
  id: string;
  storage_path: string;
  label: string | null;
  created_at: string;
}

interface PendingFile {
  file: File;
  label: string;
}

interface Props {
  clientId: string;
  canEdit?: boolean;
}

const MAX_IMAGES = 5;
const BUCKET = "profiling-photos";

function cleanFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").slice(0, 80);
}

export default function ClientSessionImages({ clientId, canEdit = true }: Props) {
  const { user } = useAuth();
  const [images, setImages] = useState<SessionImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchImages() {
    const { data } = await supabase
      .from("client_session_images")
      .select("id, storage_path, label, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setImages(data || []);
    setUrls(await signProfilingPhotoUrls((data || []).map((r) => r.storage_path)));
    setLoading(false);
  }

  useEffect(() => {
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function openZoom(path: string) {
    const fresh = (await signProfilingPhotoUrl(path)) ?? urls[path];
    if (fresh) setZoomedUrl(fresh);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !user) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`Maximum of ${MAX_IMAGES} images reached`);
      return;
    }
    const toUpload = Array.from(files).slice(0, remaining);
    setPendingFiles(toUpload.map((file) => ({ file, label: cleanFileName(file.name) })));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function confirmUpload() {
    if (!pendingFiles || !user) return;
    setUploading(true);
    try {
      for (const pf of pendingFiles) {
        const ext = pf.file.name.split(".").pop() || "jpg";
        const path = `session-images/${clientId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pf.file, {
          contentType: pf.file.type,
          upsert: false,
        });
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase.from("client_session_images").insert({
          client_id: clientId,
          practitioner_id: user.id,
          storage_path: path,
          label: pf.label || cleanFileName(pf.file.name),
        });
        if (dbErr) {
          // Roll the orphaned file back so a rejected record leaves nothing behind.
          await supabase.storage.from(BUCKET).remove([path]);
          throw dbErr;
        }
      }
      toast.success(`Uploaded ${pendingFiles.length} image${pendingFiles.length === 1 ? "" : "s"}`);
      setPendingFiles(null);
      await fetchImages();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(img: SessionImage) {
    if (!confirm("Remove this image?")) return;
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([img.storage_path]);
    if (sErr) {
      toast.error("Failed to remove file");
      return;
    }
    await supabase.from("client_session_images").delete().eq("id", img.id);
    setImages((prev) => prev.filter((i) => i.id !== img.id));
    toast.success("Image removed");
  }

  async function handleRename(img: SessionImage, newLabel: string) {
    await supabase.from("client_session_images").update({ label: newLabel || null }).eq("id", img.id);
    setImages((prev) => prev.map((i) => (i.id === img.id ? { ...i, label: newLabel || null } : i)));
  }

  if (loading) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" /> Session Images ({images.length}/{MAX_IMAGES})
        </p>
        {canEdit && images.length < MAX_IMAGES && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px]"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
              {uploading ? "Uploading…" : "Add Image"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </>
        )}
      </div>

      {images.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No session images attached.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {images.map((img) => {
            const url = urls[img.storage_path];
            return (
              <div key={img.id} className="group relative">
                <button
                  onClick={() => openZoom(img.storage_path)}
                  className="block w-full aspect-square rounded-lg overflow-hidden border border-border bg-muted/30 hover:ring-2 hover:ring-primary/40 transition-all"
                >
                  <img src={url} alt={img.label || "Session image"} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ZoomIn className="h-5 w-5 text-primary-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                </button>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDelete(img)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
                <Input
                  defaultValue={img.label || ""}
                  placeholder="Label…"
                  disabled={!canEdit}
                  onBlur={(e) => {
                    if (e.target.value !== (img.label || "")) handleRename(img, e.target.value);
                  }}
                  className="h-6 text-[10px] mt-1 px-1.5"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Pre-upload naming dialog */}
      <Dialog open={!!pendingFiles} onOpenChange={(open) => { if (!open) setPendingFiles(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Name your images</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {pendingFiles?.map((pf, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-md overflow-hidden border border-border bg-muted/30 flex-shrink-0">
                  <img src={URL.createObjectURL(pf.file)} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <Input
                  value={pf.label}
                  onChange={(e) => {
                    const next = [...(pendingFiles || [])];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setPendingFiles(next);
                  }}
                  placeholder="File name"
                  className="h-8 text-xs flex-1"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button size="sm" variant="ghost" onClick={() => setPendingFiles(null)}>Cancel</Button>
            <Button size="sm" onClick={confirmUpload} disabled={uploading}>
              {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Zoom dialog */}
      <Dialog open={!!zoomedUrl} onOpenChange={() => setZoomedUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-2">
          {zoomedUrl && <img src={zoomedUrl} alt="Session image" className="w-full h-full object-contain max-h-[85vh]" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
