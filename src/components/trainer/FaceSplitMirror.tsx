import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, RotateCcw, Scissors, Download, Info, ImageIcon, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useProfilingPhotos } from "@/hooks/useProfilingPhotos";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  getStoragePathFromPublicUrl,
  loadCreatorProfilingData,
  mergeCreatorProfilingData,
} from "@/lib/creatorTypeProfilingData";

interface Point {
  x: number;
  y: number;
}

export interface FaceSplitData {
  originalImageUrl?: string;
  leftMirroredDataUrl?: string;
  rightMirroredDataUrl?: string;
  notes: string;
}

interface SavedFaceSplitData {
  original_path?: string;
  left_path?: string;
  right_path?: string;
  notes?: string;
  saved_at?: string;
}

interface FaceSplitMirrorProps {
  userId?: string;
  onDataChange?: (data: FaceSplitData) => void;
}

async function uploadDataUrl(dataUrl: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const { error } = await supabase.storage.from("profiling-photos").upload(path, blob, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("profiling-photos").getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}

function normalizeSavedFaceSplitData(raw?: SavedFaceSplitData): SavedFaceSplitData | null {
  if (!raw) return null;

  const normalized: SavedFaceSplitData = {
    original_path: getStoragePathFromPublicUrl(raw.original_path),
    left_path: getStoragePathFromPublicUrl(raw.left_path),
    right_path: getStoragePathFromPublicUrl(raw.right_path),
    notes: raw.notes,
    saved_at: raw.saved_at,
  };

  if (!normalized.left_path && !normalized.right_path && !normalized.original_path && !normalized.notes) {
    return null;
  }

  return normalized;
}

export default function FaceSplitMirror({ userId, onDataChange }: FaceSplitMirrorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [topPoint, setTopPoint] = useState<Point | null>(null);
  const [bottomPoint, setBottomPoint] = useState<Point | null>(null);
  const [placingPoint, setPlacingPoint] = useState<"top" | "bottom" | "done">("top");
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<{ left: string; right: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [saving, setSaving] = useState(false);
  const [savedData, setSavedData] = useState<SavedFaceSplitData | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const { toast } = useToast();

  const { facePhotos, loading: photosLoading } = useProfilingPhotos(userId);

  // Load saved data on mount
  useEffect(() => {
    if (!userId) return;

    const loadSaved = async () => {
      setLoadingSaved(true);
      try {
        const profilingData = await loadCreatorProfilingData(userId);
        const faceSplitRaw = (profilingData.face_split ?? profilingData.faceSplit) as SavedFaceSplitData | undefined;
        const normalized = normalizeSavedFaceSplitData(faceSplitRaw);

        if (normalized) {
          setSavedData(normalized);
          setNotes(normalized.notes || "");
        } else {
          setSavedData(null);
        }
      } catch (error) {
        console.error("Failed to load saved face split data:", error);
      } finally {
        setLoadingSaved(false);
      }
    };

    loadSaved();
  }, [userId]);

  // Report data changes to parent
  useEffect(() => {
    onDataChange?.({
      originalImageUrl:
        image?.src ||
        (savedData?.original_path
          ? supabase.storage.from("profiling-photos").getPublicUrl(savedData.original_path).data.publicUrl
          : undefined),
      leftMirroredDataUrl:
        results?.left ||
        (savedData?.left_path
          ? supabase.storage.from("profiling-photos").getPublicUrl(savedData.left_path).data.publicUrl
          : undefined),
      rightMirroredDataUrl:
        results?.right ||
        (savedData?.right_path
          ? supabase.storage.from("profiling-photos").getPublicUrl(savedData.right_path).data.publicUrl
          : undefined),
      notes,
    });
  }, [image, results, notes, onDataChange, savedData]);

  const handleSave = async () => {
    if (!userId || !results) return;

    setSaving(true);
    try {
      const ts = Date.now();
      const leftPath = `reports/${userId}/face-split-left-${ts}.png`;
      const rightPath = `reports/${userId}/face-split-right-${ts}.png`;
      const originalPath = `reports/${userId}/face-split-original-${ts}.png`;

      const [leftUrl, rightUrl, origUrl] = await Promise.all([
        uploadDataUrl(results.left, leftPath),
        uploadDataUrl(results.right, rightPath),
        image?.src
          ? uploadDataUrl(
              image.src.startsWith("data:")
                ? image.src
                : await fetch(image.src)
                    .then((response) => response.blob())
                    .then(
                      (blob) =>
                        new Promise<string>((resolve) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(reader.result as string);
                          reader.readAsDataURL(blob);
                        })
                    ),
              originalPath
            )
          : Promise.resolve(null),
      ]);

      if (!leftUrl || !rightUrl) {
        throw new Error("Could not upload mirrored images. Please try again.");
      }

      const faceSplitData: SavedFaceSplitData = {
        left_path: leftPath,
        right_path: rightPath,
        original_path: origUrl ? originalPath : undefined,
        notes,
        saved_at: new Date().toISOString(),
      };

      await mergeCreatorProfilingData(userId, { face_split: faceSplitData });
      setSavedData(faceSplitData);
      toast({ title: "Face split saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!userId || !savedData) return;

    setSaving(true);
    try {
      const updatedFaceSplit: SavedFaceSplitData = {
        ...savedData,
        notes,
        saved_at: savedData.saved_at ?? new Date().toISOString(),
      };

      await mergeCreatorProfilingData(userId, { face_split: updatedFaceSplit });
      setSavedData(updatedFaceSplit);
      toast({ title: "Notes saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const loadImageFromUrl = useCallback((url: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
      setTopPoint(null);
      setBottomPoint(null);
      setPlacingPoint("top");
      setDragging(false);
      setResults(null);
    };
    img.src = url;
  }, []);

  const handleFile = useCallback((file: File) => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setTopPoint(null);
      setBottomPoint(null);
      setPlacingPoint("top");
      setDragging(false);
      setResults(null);
    };
    img.src = URL.createObjectURL(file);
  }, []);

  const getScaledSize = useCallback(() => {
    if (!image) return { w: 0, h: 0, scale: 1 };
    const maxW = Math.min(300, (window.innerWidth - 64) / 2);
    const scale = maxW / image.width;
    return { w: Math.round(image.width * scale), h: Math.round(image.height * scale), scale };
  }, [image]);

  const isNearPoint = (pos: Point, target: Point, radius = 14): boolean => {
    const dx = pos.x - target.x;
    const dy = pos.y - target.y;
    return dx * dx + dy * dy <= radius * radius;
  };

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.round(((clientX - rect.left) / rect.width) * canvas.width),
      y: Math.round(((clientY - rect.top) / rect.height) * canvas.height),
    };
  };

  // Draw the canvas
  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const { w, h } = getScaledSize();
    const canvas = canvasRef.current;
    canvas.width = w;
    canvas.height = h;
    setCanvasSize({ w, h });

    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, w, h);

    const drawDot = (p: Point, color: string, label: string, isDraggable = false) => {
      const radius = isDraggable ? 8 : 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (isDraggable) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(59,130,246,0.4)";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(label, p.x, p.y - (isDraggable ? 16 : 12));
    };

    if (topPoint) drawDot(topPoint, "#ef4444", "⚓ Anchor");
    if (bottomPoint) drawDot(bottomPoint, "#3b82f6", "↕ Drag", true);

    if (topPoint && bottomPoint) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(topPoint.x, topPoint.y);
      ctx.lineTo(bottomPoint.x, bottomPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = "rgba(239,68,68,0.9)";
    ctx.textAlign = "center";
    if (placingPoint === "top") {
      ctx.fillText("Click to place ANCHOR point", w / 2, 18);
    } else if (placingPoint === "bottom") {
      ctx.fillText("Click to place CUT point (draggable)", w / 2, h - 8);
    }
  }, [image, topPoint, bottomPoint, placingPoint, getScaledSize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    if (placingPoint === "top") {
      setTopPoint(pos);
      setPlacingPoint("bottom");
      setResults(null);
    } else if (placingPoint === "bottom") {
      setBottomPoint(pos);
      setPlacingPoint("done");
      setResults(null);
    } else if (placingPoint === "done" && bottomPoint && isNearPoint(pos, bottomPoint)) {
      setDragging(true);
      setResults(null);
    } else {
      setTopPoint(pos);
      setBottomPoint(null);
      setPlacingPoint("bottom");
      setResults(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const pos = getCanvasPos(e);
    setBottomPoint(pos);
  };

  const handleMouseUp = () => {
    if (dragging) setDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (placingPoint === "done" && bottomPoint) {
      const pos = getCanvasPos(e);
      if (isNearPoint(pos, bottomPoint)) {
        e.preventDefault();
        setDragging(true);
        setResults(null);
        return;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    setBottomPoint(pos);
  };

  const handleTouchEnd = () => {
    if (dragging) setDragging(false);
  };

  const generateSplit = useCallback(() => {
    if (!image || !topPoint || !bottomPoint) return;
    const { w, h } = getScaledSize();

    const getLineX = (y: number): number => {
      if (bottomPoint.y === topPoint.y) return topPoint.x;
      const t = (y - topPoint.y) / (bottomPoint.y - topPoint.y);
      return topPoint.x + t * (bottomPoint.x - topPoint.x);
    };

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = w;
    srcCanvas.height = h;
    const srcCtx = srcCanvas.getContext("2d")!;
    srcCtx.drawImage(image, 0, 0, w, h);
    const srcData = srcCtx.getImageData(0, 0, w, h);

    const leftCanvas = document.createElement("canvas");
    leftCanvas.width = w;
    leftCanvas.height = h;
    const leftCtx = leftCanvas.getContext("2d")!;
    const leftImgData = leftCtx.createImageData(w, h);

    const rightCanvas = document.createElement("canvas");
    rightCanvas.width = w;
    rightCanvas.height = h;
    const rightCtx = rightCanvas.getContext("2d")!;
    const rightImgData = rightCtx.createImageData(w, h);

    for (let y = 0; y < h; y++) {
      const lineX = Math.round(getLineX(y));
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 4;
        const leftIdx = (y * w + x) * 4;
        if (x <= lineX) {
          leftImgData.data[leftIdx] = srcData.data[srcIdx];
          leftImgData.data[leftIdx + 1] = srcData.data[srcIdx + 1];
          leftImgData.data[leftIdx + 2] = srcData.data[srcIdx + 2];
          leftImgData.data[leftIdx + 3] = srcData.data[srcIdx + 3];
        } else {
          const mirrorX = Math.round(lineX - (x - lineX));
          if (mirrorX >= 0 && mirrorX < w) {
            const mirrorIdx = (y * w + mirrorX) * 4;
            leftImgData.data[leftIdx] = srcData.data[mirrorIdx];
            leftImgData.data[leftIdx + 1] = srcData.data[mirrorIdx + 1];
            leftImgData.data[leftIdx + 2] = srcData.data[mirrorIdx + 2];
            leftImgData.data[leftIdx + 3] = srcData.data[mirrorIdx + 3];
          }
        }

        const rightIdx = (y * w + x) * 4;
        if (x >= lineX) {
          rightImgData.data[rightIdx] = srcData.data[srcIdx];
          rightImgData.data[rightIdx + 1] = srcData.data[srcIdx + 1];
          rightImgData.data[rightIdx + 2] = srcData.data[srcIdx + 2];
          rightImgData.data[rightIdx + 3] = srcData.data[srcIdx + 3];
        } else {
          const mirrorX = Math.round(lineX + (lineX - x));
          if (mirrorX >= 0 && mirrorX < w) {
            const mirrorIdx = (y * w + mirrorX) * 4;
            rightImgData.data[rightIdx] = srcData.data[mirrorIdx];
            rightImgData.data[rightIdx + 1] = srcData.data[mirrorIdx + 1];
            rightImgData.data[rightIdx + 2] = srcData.data[mirrorIdx + 2];
            rightImgData.data[rightIdx + 3] = srcData.data[mirrorIdx + 3];
          }
        }
      }
    }

    leftCtx.putImageData(leftImgData, 0, 0);
    rightCtx.putImageData(rightImgData, 0, 0);

    setResults({
      left: leftCanvas.toDataURL("image/png"),
      right: rightCanvas.toDataURL("image/png"),
    });
  }, [image, topPoint, bottomPoint, getScaledSize]);

  const downloadImage = (dataUrl: string, name: string) => {
    try {
      const byteString = atob(dataUrl.split(",")[1]);
      const mimeString = dataUrl.split(",")[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
      toast({ title: "Download failed", description: "Could not download the image.", variant: "destructive" });
    }
  };

  const reset = () => {
    setImage(null);
    setTopPoint(null);
    setBottomPoint(null);
    setPlacingPoint("top");
    setDragging(false);
    setResults(null);
  };

  const resetLine = () => {
    setTopPoint(null);
    setBottomPoint(null);
    setPlacingPoint("top");
    setDragging(false);
    setResults(null);
  };

  const formatPhotoType = (type: string) =>
    type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  const getPublicUrl = (path: string) =>
    supabase.storage.from("profiling-photos").getPublicUrl(path).data.publicUrl;

  // Show saved results if no active editing session
  const showSavedResults = !image && !results && !!(savedData?.left_path || savedData?.right_path || savedData?.original_path);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-lg font-display font-bold text-foreground mb-1">Face Split &amp; Mirror</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Upload a face photo or select from the client's profiling images. Place an anchor point (top), then a draggable cut point (bottom) — drag it to adjust the split line in real-time before generating composites.
        </p>

        <Alert className="mb-4">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Anchor &amp; drag:</strong> Click once to set the anchor (red), click again for the cut point (blue). Then drag the blue handle to fine-tune the line without re-clicking.
          </AlertDescription>
        </Alert>

        {loadingSaved && (
          <p className="text-xs text-muted-foreground text-center py-4">Loading saved data…</p>
        )}

        {/* Show previously saved results */}
        {showSavedResults && !loadingSaved && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-green-600 font-medium">✓ Previously saved{savedData.saved_at ? ` — ${new Date(savedData.saved_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span>
              <Button variant="outline" size="sm" onClick={() => setSavedData(null)} className="ml-auto">
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Redo Split
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 text-center">
                <p className="text-xs font-medium text-muted-foreground">Left Side Mirrored</p>
                <img src={getPublicUrl(savedData.left_path!)} alt="Left mirrored" className="rounded-lg border border-border w-full" />
              </div>
              {savedData.original_path && (
                <div className="space-y-2 text-center">
                  <p className="text-xs font-medium text-muted-foreground">Original</p>
                  <img src={getPublicUrl(savedData.original_path)} alt="Original" className="rounded-lg border border-border w-full" />
                </div>
              )}
              <div className="space-y-2 text-center">
                <p className="text-xs font-medium text-muted-foreground">Right Side Mirrored</p>
                <img src={getPublicUrl(savedData.right_path!)} alt="Right mirrored" className="rounded-lg border border-border w-full" />
              </div>
            </div>
          </div>
        )}

        {!image && !showSavedResults && !loadingSaved && (
          <div className="space-y-4">
            {userId && facePhotos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  <ImageIcon className="h-3.5 w-3.5 inline mr-1" />
                  Select from client's profiling photos:
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {facePhotos.map((photo) => (
                    <button
                      key={photo.photo_type}
                      className="group relative rounded-lg border-2 border-border hover:border-primary/50 overflow-hidden transition-colors"
                      onClick={() => loadImageFromUrl(photo.url)}
                    >
                      <img
                        src={photo.url}
                        alt={formatPhotoType(photo.photo_type)}
                        className="w-full aspect-[3/4] object-cover"
                      />
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] py-1 text-center">
                        {formatPhotoType(photo.photo_type)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </div>
            )}
            {photosLoading && userId && (
              <p className="text-xs text-muted-foreground text-center py-2">Loading client photos…</p>
            )}

            <div
              className="border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Click to upload a face photo</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          </div>
        )}

        {image && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> New Photo
              </Button>
              <Button variant="outline" size="sm" onClick={resetLine} disabled={!topPoint}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset Line
              </Button>
              <Button size="sm" onClick={generateSplit} disabled={placingPoint !== "done"}>
                <Scissors className="h-3.5 w-3.5 mr-1" /> Split &amp; Mirror
              </Button>
              <span className="text-xs text-muted-foreground ml-2">
                {placingPoint === "top" && "Click to place the anchor point"}
                {placingPoint === "bottom" && "Now click to place the cut point"}
                {placingPoint === "done" && (dragging ? "Dragging… release to set" : "Drag the blue handle to adjust, or click Split & Mirror")}
              </span>
            </div>

            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                className={cn(
                  "rounded-lg border border-border",
                  placingPoint !== "done" ? "cursor-crosshair" : dragging ? "cursor-grabbing" : "cursor-pointer"
                )}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              />
            </div>
          </div>
        )}
      </div>

      {results && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Results</h3>
            {userId && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                {saving ? "Saving…" : "Save Results"}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 text-center">
              <p className="text-xs font-medium text-muted-foreground">Left Side Mirrored</p>
              <img src={results.left} alt="Left mirrored" className="rounded-lg border border-border w-full" />
              <Button variant="outline" size="sm" className="text-xs" onClick={() => downloadImage(results.left, "left-mirrored.png")}>
                <Download className="h-3 w-3 mr-1" /> Download
              </Button>
            </div>
            <div className="space-y-2 text-center">
              <p className="text-xs font-medium text-muted-foreground">Original</p>
              {image && <img src={image.src} alt="Original" className="rounded-lg border border-border w-full" />}
            </div>
            <div className="space-y-2 text-center">
              <p className="text-xs font-medium text-muted-foreground">Right Side Mirrored</p>
              <img src={results.right} alt="Right mirrored" className="rounded-lg border border-border w-full" />
              <Button variant="outline" size="sm" className="text-xs" onClick={() => downloadImage(results.right, "right-mirrored.png")}>
                <Download className="h-3 w-3 mr-1" /> Download
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Trainer notes */}
      <div className="rounded-xl border border-border bg-card p-5">
        <Label htmlFor="face-split-notes" className="text-sm font-semibold text-foreground">Trainer Notes — Face Split</Label>
        <Textarea
          id="face-split-notes"
          placeholder="Add your observations about facial symmetry, asymmetries noticed, etc…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-2 min-h-[100px]"
        />
        {userId && savedData && (
          <Button size="sm" variant="outline" className="mt-2" onClick={handleSaveNotes} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save Notes
          </Button>
        )}
      </div>
    </div>
  );
}
