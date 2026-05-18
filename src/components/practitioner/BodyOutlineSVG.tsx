import bodyOutlineImg from "@/assets/body-outline-reference.png";

/**
 * Body outline using the exact reference image provided,
 * with labelled region dividers overlaid.
 */
export default function BodyOutlineSVG({ className }: { className?: string }) {
  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Reference body outline image — includes region labels and dividers */}
      <img
        src={bodyOutlineImg}
        alt="Body outline with region markers"
        className="w-full h-full object-contain pointer-events-none"
        draggable={false}
      />
    </div>
  );
}
