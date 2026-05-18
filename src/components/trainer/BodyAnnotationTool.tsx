import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, RotateCcw, Download, Pencil, Type, Undo2, ImageIcon, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
interface DrawAction {
  type: "line";
  points: Point[];
  color: string;
  width: number;
}
interface TextAction {
  type: "text";
  text: string;
  position: Point;
  color: string;
  fontSize: number;
}
type Action = DrawAction | TextAction;

const COLORS = [
  { label: "Red", value: "#ef4444" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#22c55e" },
  { label: "Yellow", value: "#eab308" },
  { label: "Purple", value: "#a855f7" },
  { label: "Orange", value: "#f97316" },
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#000000" },
];

const LINE_WIDTHS = [2, 3, 5, 8];

export interface BodyAnnotationData {
  annotatedImageDataUrl?: string;
  notes: string;
}

interface SavedBodyAnnotationData {
  annotated_path?: string;
  notes?: string;
  saved_at?: string;
}

interface BodyAnnotationToolProps {
  userId?: string;
  onDataChange?: (data: BodyAnnotationData) => void;
}

function normalizeSavedBodyAnnotationData(raw?: SavedBodyAnnotationData): SavedBodyAnnotationData | null {
  if (!raw) return null;

  const normalized: SavedBodyAnnotationData = {
    annotated_path: getStoragePathFromPublicUrl(raw.annotated_path),
    notes: raw.notes,
    saved_at: raw.saved_at,
  };

  if (!normalized.annotated_path && !normalized.notes) {
    return null;
  }

  return normalized;
}

export default function BodyAnnotationTool({ userId, onDataChange }: BodyAnnotationToolProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [currentColor, setCurrentColor] = useState("#ef4444");
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<"draw" | "text">("draw");
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [notes, setNotes] = useState("");
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [saving, setSaving] = useState(false);
  const [savedData, setSavedData] = useState<SavedBodyAnnotationData | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const { toast } = useToast();

  const { bodyPhotos, loading: photosLoading } = useProfilingPhotos(userId);

  // Load saved data on mount
  useEffect(() => {
    if (!userId) return;

    const loadSaved = async () => {
      setLoadingSaved(true);
      try {
        const profilingData = await loadCreatorProfilingData(userId);
        const bodyAnnotationRaw = (profilingData.body_annotation ?? profilingData.bodyAnnotation) as
          | SavedBodyAnnotationData
          | undefined;
        const normalized = normalizeSavedBodyAnnotationData(bodyAnnotationRaw);

        if (normalized) {
          setSavedData(normalized);
          setNotes(normalized.notes || "");
        } else {
          setSavedData(null);
        }
      } catch (error) {
        console.error("Failed to load saved body annotation:", error);
      } finally {
        setLoadingSaved(false);
      }
    };

    loadSaved();
  }, [userId]);

  // Report data changes to parent
  useEffect(() => {
    onDataChange?.({
      annotatedImageDataUrl:
        canvasRef.current?.toDataURL("image/png") ||
        (savedData?.annotated_path
          ? supabase.storage.from("profiling-photos").getPublicUrl(savedData.annotated_path).data.publicUrl
          : undefined),
      notes,
    });
  }, [notes, actions, onDataChange, savedData]);

  const handleSave = async () => {
    if (!userId || !canvasRef.current) return;

    setSaving(true);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const ts = Date.now();
      const path = `reports/${userId}/body-annotated-${ts}.png`;

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const { error: uploadErr } = await supabase.storage.from("profiling-photos").upload(path, blob, { upsert: true });
      if (uploadErr) throw uploadErr;

      const bodyAnnotationData: SavedBodyAnnotationData = {
        annotated_path: path,
        notes,
        saved_at: new Date().toISOString(),
      };

      await mergeCreatorProfilingData(userId, { body_annotation: bodyAnnotationData });
      setSavedData(bodyAnnotationData);
      toast({ title: "Body annotation saved" });
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
      const updatedBodyAnnotation: SavedBodyAnnotationData = {
        ...savedData,
        notes,
        saved_at: savedData.saved_at ?? new Date().toISOString(),
      };

      await mergeCreatorProfilingData(userId, { body_annotation: updatedBodyAnnotation });
      setSavedData(updatedBodyAnnotation);
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
      setActions([]);
    };
    img.src = url;
  }, []);

  const handleFile = useCallback((file: File) => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setActions([]);
    };
    img.src = URL.createObjectURL(file);
  }, []);

  const getScaledSize = useCallback(() => {
    if (!image) return { w: 0, h: 0 };
    const maxW = Math.min(300, (window.innerWidth - 64) / 2);
    const scale = maxW / image.width;
    return { w: Math.round(image.width * scale), h: Math.round(image.height * scale) };
  }, [image]);

  const renderCanvas = useCallback(() => {
    if (!image || !canvasRef.current) return;
    const { w, h } = getScaledSize();
    const canvas = canvasRef.current;
    canvas.width = w;
    canvas.height = h;
    setCanvasSize({ w, h });
    const ctx = canvas.getContext("2d")!;

    ctx.drawImage(image, 0, 0, w, h);

    for (const action of actions) {
      if (action.type === "line" && action.points.length > 1) {
        ctx.strokeStyle = action.color;
        ctx.lineWidth = action.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(action.points[0].x, action.points[0].y);
        for (let i = 1; i < action.points.length; i++) {
          ctx.lineTo(action.points[i].x, action.points[i].y);
        }
        ctx.stroke();
      } else if (action.type === "text") {
        const fontSize = Math.max(action.fontSize, 24);
        const padX = 8;
        const padY = 6;

        ctx.font = `700 ${fontSize}px sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        const metrics = ctx.measureText(action.text);
        const textHeight = fontSize;
        const boxX = action.position.x - padX;
        const boxY = action.position.y - padY;
        const boxW = metrics.width + padX * 2;
        const boxH = textHeight + padY * 2;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = "#000000";
        ctx.fillText(action.text, action.position.x, action.position.y);
      }
    }

    if (isDrawing && currentPoints.length > 1) {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
      }
      ctx.stroke();
    }
  }, [image, actions, isDrawing, currentPoints, currentColor, lineWidth, getScaledSize]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const getPos = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.round(((clientX - rect.left) / rect.width) * canvas.width),
      y: Math.round(((clientY - rect.top) / rect.height) * canvas.height),
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool === "draw") {
      setIsDrawing(true);
      setCurrentPoints([getPos(e)]);
    } else if (tool === "text") {
      const pos = getPos(e);
      const text = prompt("Enter text to place on the image:");
      if (text?.trim()) {
        setActions((prev) => [...prev, { type: "text", text: text.trim(), position: pos, color: "#000000", fontSize: 24 }]);
      }
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || tool !== "draw") return;
    e.preventDefault();
    setCurrentPoints((prev) => [...prev, getPos(e)]);
  };

  const handlePointerUp = () => {
    if (isDrawing && currentPoints.length > 1) {
      setActions((prev) => [...prev, { type: "line", points: currentPoints, color: currentColor, width: lineWidth }]);
    }
    setIsDrawing(false);
    setCurrentPoints([]);
  };

  const undo = () => setActions((prev) => prev.slice(0, -1));
  const clearAll = () => setActions([]);

  const downloadAnnotated = () => {
    if (!canvasRef.current) return;
    const a = document.createElement("a");
    a.href = canvasRef.current.toDataURL("image/png");
    a.download = "body-annotated.png";
    a.click();
  };

  const reset = () => {
    setImage(null);
    setActions([]);
    setCurrentPoints([]);
    setIsDrawing(false);
  };

  const formatPhotoType = (type: string) =>
    type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  const getPublicUrl = (path: string) =>
    supabase.storage.from("profiling-photos").getPublicUrl(path).data.publicUrl;

  const showSavedResult = !image && !!savedData?.annotated_path;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-lg font-display font-bold text-foreground mb-1">Body Annotation</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Select from the client's body photos or upload an image, then draw coloured lines and add text labels to annotate features.
        </p>

        {loadingSaved && (
          <p className="text-xs text-muted-foreground text-center py-4">Loading saved data…</p>
        )}

        {/* Show previously saved result */}
        {showSavedResult && !loadingSaved && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-green-600 font-medium">✓ Previously saved{savedData.saved_at ? ` — ${new Date(savedData.saved_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span>
              <Button variant="outline" size="sm" onClick={() => setSavedData(null)} className="ml-auto">
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Redo Annotation
              </Button>
            </div>
            <div className="flex justify-center">
              <img src={getPublicUrl(savedData.annotated_path!)} alt="Body annotated" className="rounded-lg border border-border max-w-[300px]" />
            </div>
          </div>
        )}

        {!image && !showSavedResult && !loadingSaved && (
          <div className="space-y-4">
            {userId && bodyPhotos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  <ImageIcon className="h-3.5 w-3.5 inline mr-1" />
                  Select from client's profiling photos:
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {bodyPhotos.map((photo) => (
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
              <span className="text-sm text-muted-foreground">Click to upload a body photo</span>
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

              <div className="h-6 w-px bg-border" />

              <Button
                variant={tool === "draw" ? "default" : "outline"}
                size="sm"
                onClick={() => setTool("draw")}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" /> Draw
              </Button>
              <Button
                variant={tool === "text" ? "default" : "outline"}
                size="sm"
                onClick={() => setTool("text")}
              >
                <Type className="h-3.5 w-3.5 mr-1" /> Text
              </Button>

              <div className="h-6 w-px bg-border" />

              <div className="flex items-center gap-1">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    title={c.label}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-transform",
                      currentColor === c.value ? "border-foreground scale-110" : "border-border"
                    )}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setCurrentColor(c.value)}
                  />
                ))}
              </div>

              <div className="h-6 w-px bg-border" />

              {tool === "draw" && (
                <div className="flex items-center gap-1">
                  {LINE_WIDTHS.map(w => (
                    <button
                      key={w}
                      title={`${w}px`}
                      className={cn(
                        "flex items-center justify-center w-7 h-7 rounded border transition-colors",
                        lineWidth === w ? "border-foreground bg-muted" : "border-border"
                      )}
                      onClick={() => setLineWidth(w)}
                    >
                      <div
                        className="rounded-full"
                        style={{ width: w + 2, height: w + 2, backgroundColor: currentColor }}
                      />
                    </button>
                  ))}
                </div>
              )}

              <div className="h-6 w-px bg-border" />

              <Button variant="outline" size="sm" onClick={undo} disabled={actions.length === 0}>
                <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll} disabled={actions.length === 0}>
                Clear All
              </Button>
              <Button variant="outline" size="sm" onClick={downloadAnnotated}>
                <Download className="h-3.5 w-3.5 mr-1" /> Download
              </Button>
              {userId && (
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                  {saving ? "Saving…" : "Save"}
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {tool === "draw" ? "Click and drag to draw lines on the image." : "Click anywhere on the image to place text."}
            </p>

            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                className={cn(
                  "rounded-lg border border-border touch-none",
                  tool === "draw" ? "cursor-crosshair" : "cursor-text"
                )}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              />
            </div>
          </div>
        )}
      </div>

      {/* Trainer notes */}
      <div className="rounded-xl border border-border bg-card p-5">
        <Label htmlFor="body-annotation-notes" className="text-sm font-semibold text-foreground">Trainer Notes — Body Annotation</Label>
        <Textarea
          id="body-annotation-notes"
          placeholder="Add your observations about body structure, asymmetries, energy patterns, etc…"
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
