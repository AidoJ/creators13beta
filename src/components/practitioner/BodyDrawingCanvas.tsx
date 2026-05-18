import { useRef, useState, useEffect, useCallback } from "react";
import BodyOutlineSVG from "./BodyOutlineSVG";
import { Button } from "@/components/ui/button";
import { Pen, Eraser, Undo2, Trash2 } from "lucide-react";

interface Point { x: number; y: number }

interface BodyDrawingCanvasProps {
  width?: number;
  height?: number;
  /** Called whenever drawing changes, with data URL of canvas */
  onDrawingChange?: (dataUrl: string | null) => void;
  /** Pre-existing drawing data URL to restore */
  initialDrawing?: string | null;
}

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#000000",
];

export default function BodyDrawingCanvas({
  width = 400,
  height = 800,
  onDrawingChange,
  initialDrawing,
}: BodyDrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#ef4444");
  const [lineWidth, setLineWidth] = useState(3);
  const [history, setHistory] = useState<ImageData[]>([]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore drawing when initialDrawing changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !initialDrawing) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      saveToHistory();
    };
    img.src = initialDrawing;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDrawing]);

  function saveToHistory() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setHistory(prev => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }

  function emitChange() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Check if canvas is blank
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasContent = data.some((v, i) => i % 4 === 3 && v > 0); // check alpha channel
    onDrawingChange?.(hasContent ? canvas.toDataURL("image/png") : null);
  }

  function getPos(e: React.MouseEvent | React.TouchEvent): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    saveToHistory();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = lineWidth * 4;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
    }
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function stopDrawing() {
    if (!isDrawing) return;
    setIsDrawing(false);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.closePath();
    emitChange();
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas || history.length === 0) return;
    const newHistory = [...history];
    const prev = newHistory.pop();
    setHistory(newHistory);
    if (prev) {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(prev, 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    emitChange();
  }

  function clearAll() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    saveToHistory();
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onDrawingChange?.(null);
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={tool === "pen" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("pen")}
        >
          <Pen className="h-3.5 w-3.5 mr-1" /> Draw
        </Button>
        <Button
          variant={tool === "eraser" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("eraser")}
        >
          <Eraser className="h-3.5 w-3.5 mr-1" /> Erase
        </Button>
        <div className="h-6 w-px bg-border mx-1" />
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); setTool("pen"); }}
            className={`w-6 h-6 rounded-full border-2 transition-transform ${
              color === c && tool === "pen" ? "border-foreground scale-125" : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <div className="h-6 w-px bg-border mx-1" />
        <select
          value={lineWidth}
          onChange={e => setLineWidth(Number(e.target.value))}
          className="text-xs bg-background border border-border rounded px-2 py-1"
        >
          <option value={2}>Thin</option>
          <option value={3}>Medium</option>
          <option value={5}>Thick</option>
        </select>
        <div className="h-6 w-px bg-border mx-1" />
        <Button variant="ghost" size="sm" onClick={undo} disabled={history.length === 0}>
          <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
        </Button>
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      </div>

      {/* Canvas + SVG overlay */}
      <div
        ref={containerRef}
        className="relative border border-border rounded-xl overflow-hidden bg-white mx-auto"
        style={{ maxWidth: width, aspectRatio: `${width}/${height}` }}
      >
        {/* Body outline SVG underneath */}
        <BodyOutlineSVG className="absolute inset-0 w-full h-full text-foreground/60 pointer-events-none z-0" />

        {/* Drawing canvas on top */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair z-10"
          style={{ touchAction: "none" }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
    </div>
  );
}
