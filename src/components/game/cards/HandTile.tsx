import { useState } from "react";
import { Info, X } from "lucide-react";
import { createPortal } from "react-dom";
import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { ELEMENT_COLORS } from "@/lib/game/elements";
import { CREATOR_TYPE_GLYPHS, ELEMENT_GLYPHS, glyphForType, glyphMarkForType } from "@/lib/game/glyphs";
import { getSpecialCardFallbackArt, getSpecialCardFallbackDescriptor } from "@/lib/game/specialCardFallbacks";

import type { DeckCard } from "@/lib/game/types";
import { getCardCreditArtist } from "@/lib/cardCredits";
import { TypeGlyphMark, displayCardName } from "./TypeGlyphMark";
import { cardCodeLabel } from "@/lib/creatorTypeCode";
import CreatorCardInfoPopup from "./CreatorCardInfoPopup";

interface Props {
  card: DeckCard;
  size?: number;
  selected?: boolean;
  dimmed?: boolean;
  /** Forces the descriptor side to be visible (e.g. for the right-rail preview). */
  forceFlipped?: boolean;
}

export function HandTile({ card, size = 96, selected = false, dimmed = false, forceFlipped }: Props) {
  const [zoomed, setZoomed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const isFlipped = forceFlipped ?? flipped;
  const height = size * 1.35;
  const { c1, c2, chips, badge, artGlyph } = resolveColours(card);
  const art = card.source?.art_url ?? artGlyph;
  const isGolden = card.kind === "golden_body" || card.kind === "golden_hive";
  const isCreatorLike = card.kind === "creator" || card.kind === "sky_creator" || isGolden;
  const isTwoTone = card.kind === "animal" || card.kind === "sky_creature";
  const name = card.name;

  const descriptor = card.source?.descriptor?.trim() || defaultDescriptor(card);

  return (
    <div
      className="relative"
      style={{ width: size, height, perspective: 1200 }}
      aria-label={card.name}
    >
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* FRONT — art side */}
        <div
          className={`absolute inset-0 rounded-2xl overflow-hidden shadow-lg border bg-white flex flex-col ${
            selected ? "border-amber-400 ring-2 ring-amber-300 -translate-y-2" : "border-border/40"
          } ${dimmed ? "opacity-70 saturate-75" : ""}`}
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* Flip button (top-left) */}
          {forceFlipped === undefined && (
            <button
              type="button"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onPointerUp={(e) => { e.stopPropagation(); }}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (isCreatorLike && !isGolden) {
                  setInfoOpen(true);
                } else {
                  setZoomed(true);
                }
              }}
              className="absolute top-1.5 left-1.5 z-30 bg-black/55 hover:bg-black/75 text-white rounded-full p-1 backdrop-blur-sm"
              aria-label="Show descriptor"
            >
              <Info className="w-3 h-3" />
            </button>
          )}

          {/* Art panel */}
          <div className="relative group/art" style={{ height: "72%" }}>
            {!isCreatorLike && (
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
                {card.kind === "animal" || card.kind === "sky_creature" ? (
                  <>
                    <polygon points="0,0 1,0 0,1" fill={c1} />
                    <polygon points="1,0 1,1 0,1" fill={c2} />
                  </>
                ) : (
                  <polygon points="0,0 1,0 1,1 0,1" fill={c1} />
                )}
              </svg>
            )}
            {isTwoTone && glyphMarkForType(chips[0]?.label) && (
              <TypeGlyphMark
                glyph={glyphMarkForType(chips[0].label)!}
                size={size * 0.26}
                style={{ position: "absolute", top: size * 0.04, left: size * 0.04, zIndex: 15 }}
              />
            )}
            {isTwoTone && glyphMarkForType(chips[1]?.label) && (
              <TypeGlyphMark
                glyph={glyphMarkForType(chips[1].label)!}
                size={size * 0.26}
                style={{ position: "absolute", bottom: size * 0.04, right: size * 0.04, zIndex: 15 }}
              />
            )}

            {badge && (
              <div className="absolute top-1.5 right-1.5 z-20 text-[8px] font-bold uppercase tracking-wider bg-black/55 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                {badge}
              </div>
            )}
            <div className={`absolute inset-0 z-10 flex items-center justify-center ${isCreatorLike ? "p-0" : "p-2"}`}>
              {art ? (
                <img
                  src={art}
                  alt={card.name}
                  loading="lazy"
                  className="object-contain pointer-events-none"
                  style={isCreatorLike
                    ? { width: "100%", height: "100%" }
                    : { maxWidth: "100%", maxHeight: "100%" }}
                />
              ) : (
                <div className="text-white/80 text-[10px] font-medium uppercase tracking-wide">{card.kind}</div>
              )}
            </div>
            {/* Hover tooltip overlay */}
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center opacity-0 group-hover/art:opacity-100 transition-opacity duration-150 pointer-events-none">
              <div className="bg-black/80 backdrop-blur-sm rounded-lg px-2 py-1.5 flex flex-col items-center gap-1 max-w-[90%]">
                <span
                  className="font-normal uppercase tracking-wide leading-none text-white truncate max-w-full"
                  style={{ fontFamily: '"Questrial", sans-serif', fontSize: size * 0.1, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                >
                  {name}
                </span>
                <div className="flex items-center gap-1 flex-wrap justify-center">
                  {chips.map((chip, i) => (
                    <span key={chip.label + i} className="contents">
                      {i > 0 && <span className="text-white/50 text-[8px]">+</span>}
                      <span className="inline-flex items-center gap-0.5 font-semibold uppercase tracking-wider text-white" style={{ fontSize: size * 0.07 }}>
                        {chip.glyph ? (
                          <img src={chip.glyph} alt="" className="object-contain" style={{ width: size * 0.1, height: size * 0.1 }} aria-hidden />
                        ) : (
                          <span className="rounded-full" style={{ width: size * 0.06, height: size * 0.06, background: chip.color }} aria-hidden />
                        )}
                        {chip.label}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Name plate */}
          <div className="relative z-10 bg-white px-1.5 py-1 text-center flex-1 flex flex-col justify-center">
            {isCreatorLike ? (
              <div
                className="font-normal uppercase tracking-wide leading-tight"
                style={{
                  fontFamily: '"Questrial", sans-serif',
                  fontSize: size * 0.11,
                  color: "#000",
                }}
              >
                {isGolden ? (
                  <div>{name}</div>
                ) : (
                  <>
                    <div>{name.replace(/\s+Creator$/i, "")}</div>
                    <div style={{ fontSize: size * 0.095, opacity: 0.85 }}>Creator</div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div
                  className="font-normal uppercase tracking-wide leading-none truncate"
                  style={{ fontFamily: '"Questrial", sans-serif', fontSize: size * 0.11, color: "#000" }}
                >
                  {name}
                </div>
                <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                  {chips.map((chip, i) => (
                    <span key={chip.label + i} className="contents">
                      {i > 0 && <span className="text-black/40 text-[9px]">+</span>}
                      <span
                        className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider"
                        style={{ fontSize: size * 0.075, color: "#000" }}
                      >
                        {chip.glyph ? (
                          <img
                            src={chip.glyph}
                            alt=""
                            className="object-contain"
                            style={{ width: size * 0.11, height: size * 0.11 }}
                            aria-hidden
                          />
                        ) : (
                          <span
                            className="rounded-full"
                            style={{ width: size * 0.06, height: size * 0.06, background: chip.color }}
                            aria-hidden
                          />
                        )}
                        {chip.label}
                      </span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>


          {/* Artist credit intentionally NOT shown on hand tiles — it appears
              only in the zoomed-in detail popup. */}
        </div>


        {/* BACK — descriptor side */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden shadow-lg border border-border/40 bg-card text-card-foreground flex flex-col"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {forceFlipped === undefined && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFlipped(false);
              }}
              className="absolute top-1.5 right-1.5 z-30 bg-black/55 hover:bg-black/75 text-white rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider backdrop-blur-sm"
              aria-label="Show art"
            >
              Art
            </button>
          )}
          {/* Header band using the card's primary colour */}
          <div
            className="px-2 py-1.5 flex items-center gap-1.5"
            style={{ background: c1 }}
          >
            {chips[0]?.glyph && (
              <img src={chips[0].glyph} alt="" className="object-contain" style={{ width: size * 0.14, height: size * 0.14 }} />
            )}
            <div
              className="font-normal uppercase tracking-wide leading-none truncate text-white"
              style={{ fontFamily: '"Questrial", sans-serif', fontSize: size * 0.1, textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
            >
              {name}
            </div>
          </div>
          <div
            className="flex-1 overflow-auto px-2 py-1.5 leading-snug"
            style={{ fontSize: size * 0.072, color: "#111" }}
          >
            {descriptor}
          </div>
          {/* Artist credit shown only in the zoomed-in popup, not on the
              descriptor side of the hand tile. */}
        </div>
      </div>
      {zoomed && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={() => setZoomed(false)}
            role="dialog"
            aria-modal="true"
            aria-label={`${card.name} card detail`}
          >
            <div
              className="relative bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-w-[min(92vw,820px)] w-full max-h-[90vh] animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setZoomed(false)}
                aria-label="Close"
                className="absolute top-2 right-2 z-30 bg-black/55 hover:bg-black/80 text-white rounded-full p-1.5 backdrop-blur-sm"
              >
                <X className="w-5 h-5" />
              </button>
              {/* Large art panel */}
              <div className="relative flex-1 min-h-[280px] md:min-h-[420px]">
                <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
                  {card.kind === "animal" || card.kind === "sky_creature" ? (
                    <>
                      <polygon points="0,0 1,0 0,1" fill={c1} />
                      <polygon points="1,0 1,1 0,1" fill={c2} />
                    </>
                  ) : (
                    <polygon points="0,0 1,0 1,1 0,1" fill={c1} />
                  )}
                </svg>
                {isTwoTone && glyphMarkForType(chips[0]?.label) && (
                  <TypeGlyphMark
                    glyph={glyphMarkForType(chips[0].label)!}
                    size={64}
                    style={{ position: "absolute", top: 16, left: 16, zIndex: 5 }}
                  />
                )}
                {isTwoTone && glyphMarkForType(chips[1]?.label) && (
                  <TypeGlyphMark
                    glyph={glyphMarkForType(chips[1].label)!}
                    size={64}
                    style={{ position: "absolute", bottom: 16, right: 16, zIndex: 5 }}
                  />
                )}

                {art && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
                    <img
                      src={art}
                      alt={card.name}
                      className="max-h-full max-w-full object-contain pointer-events-none"
                    />
                  </div>
                )}
              </div>
              {/* Descriptor panel */}
              <div className="md:w-[340px] flex flex-col bg-white text-black p-5 md:p-6 overflow-y-auto">
                <div
                  className="font-normal uppercase tracking-wide leading-none mb-3"
                  style={{ fontFamily: '"Questrial", sans-serif', fontSize: 28 }}
                >
                  {name}
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  {chips.map((chip, i) => (
                    <span
                      key={chip.label + i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-semibold uppercase tracking-wider"
                      style={{ background: chip.color }}
                    >
                      {chip.glyph && <img src={chip.glyph} alt="" className="w-4 h-4 object-contain" aria-hidden />}
                      {chip.label}
                    </span>
                  ))}
                </div>
                <div className="text-[15px] leading-relaxed whitespace-pre-line" style={{ fontFamily: '"Questrial", sans-serif' }}>
                  {descriptor}
                </div>
                {/* Artist credit removed — all animal images are licensed via Shutterstock. */}


              </div>
            </div>
          </div>,
          document.body,
        )}
      {infoOpen && (
        <CreatorCardInfoPopup
          typeName={card.kind === "sky_creator" ? "Sky" : (card.displayType ?? card.element ?? "")}
          onClose={() => setInfoOpen(false)}
        />
      )}
    </div>
  );
}

function defaultDescriptor(card: DeckCard): string {
  if (card.kind === "sky_creature") {
    return "Mythical Sky Creature. Acts as an Animal of its two Creator Types, AND can be played as a Stealer — discard it to take any one Animal from a rival ecosystem.";
  }

  const shared = getSpecialCardFallbackDescriptor({
    kind: card.kind,
    displayType: card.displayType,
    element: card.element,
  });

  return shared || "Animal card.";
}

function resolveColours(card: DeckCard): {
  c1: string;
  c2: string;
  chips: { label: string; color: string; glyph?: string }[];
  badge?: string;
  artGlyph?: string;
} {
  if (card.kind === "animal" || card.kind === "sky_creature") {
    const [t1, t2] = card.types ?? [];
    const c1 = CREATOR_TYPE_COLORS[t1 as keyof typeof CREATOR_TYPE_COLORS] ?? "#888";
    const c2 = CREATOR_TYPE_COLORS[t2 as keyof typeof CREATOR_TYPE_COLORS] ?? c1;
    const chips = [
      { label: String(t1 ?? ""), color: c1, glyph: glyphForType(t1 as string) },
      ...(t2 && t2 !== t1
        ? [{ label: String(t2), color: c2, glyph: glyphForType(t2 as string) }]
        : []),
    ].filter((c) => c.label);
    return { c1, c2, chips, badge: card.kind === "sky_creature" ? "Sky" : undefined };
  }
  if (card.kind === "creator") {
    const dt = card.displayType;
    const label = dt ?? card.element!;
    const c = dt ? (CREATOR_TYPE_COLORS[dt as keyof typeof CREATOR_TYPE_COLORS] ?? ELEMENT_COLORS[card.element!]) : ELEMENT_COLORS[card.element!];
    const g = dt ? (CREATOR_TYPE_GLYPHS[dt] ?? ELEMENT_GLYPHS[card.element!]) : ELEMENT_GLYPHS[card.element!];
    return { c1: c, c2: c, chips: [{ label, color: c, glyph: g }], badge: card.element ? String(card.element).toUpperCase() : "Creator", artGlyph: g };
  }
  if (card.kind === "sky_creator") {
    const c = ELEMENT_COLORS.Sky;
    const g = CREATOR_TYPE_GLYPHS.Sky;
    return { c1: c, c2: "#ffffff", chips: [{ label: "Sky", color: c, glyph: g }], badge: "SKY CREATOR", artGlyph: g };
  }

  if (card.kind === "golden_body") {
    return { c1: "#f5c542", c2: "#e0a920", chips: [{ label: "Golden", color: "#e0a920" }], badge: "GOLDEN BODY", artGlyph: getSpecialCardFallbackArt("golden-body") ?? undefined };
  }
  if (card.kind === "golden_hive") {
    return { c1: "#f5c542", c2: "#ffffff", chips: [{ label: "Hive", color: "#e0a920" }], badge: "GOLDEN HIVE", artGlyph: getSpecialCardFallbackArt("golden-hive") ?? undefined };
  }
  return { c1: "#666", c2: "#666", chips: [] };
}
