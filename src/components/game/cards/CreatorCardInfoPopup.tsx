import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Shuffle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCreatorTypeColor } from "@/lib/creatorTypes";
import { creatorMetaFor } from "@/lib/creatorTypeMeta";
import { TYPE_TO_ELEMENT } from "@/lib/game/elements";

interface CreatorTypeRow {
  name: string;
  signature: string | null;
  at_the_table: string | null;
  shadow_side: string | null;
  you_might_be_if: string | null;
  /** Repurposed: now stores the Body Image Illustration URL. */
  famous_person_photo_url: string | null;
}

// In-memory cache so repeated pop-ups don't refetch.
let cache: Record<string, CreatorTypeRow> | null = null;

async function loadTypes(): Promise<Record<string, CreatorTypeRow>> {
  if (cache) return cache;
  const { data } = await supabase
    .from("creator_types")
    .select("name, signature, at_the_table, shadow_side, you_might_be_if, famous_person_photo_url");
  cache = {};
  for (const r of (data ?? []) as CreatorTypeRow[]) cache[r.name.toLowerCase()] = r;
  return cache;
}

interface Props {
  typeName: string; // e.g. "Lava", "Sky"
  onClose: () => void;
}

export default function CreatorCardInfoPopup({ typeName, onClose }: Props) {
  const [row, setRow] = useState<CreatorTypeRow | null>(null);
  const [aspectIdx, setAspectIdx] = useState<number>(() => Math.floor(Math.random() * 4));

  useEffect(() => {
    let alive = true;
    loadTypes().then((map) => {
      if (alive) setRow(map[typeName.toLowerCase()] ?? null);
    });
    return () => { alive = false; };
  }, [typeName]);

  const color = getCreatorTypeColor(typeName);

  const aspects = useMemo(() => [
    { label: "Natural State", text: row?.signature },
    { label: "At the table", text: row?.at_the_table },
    { label: "Disaster State", text: row?.shadow_side },
    { label: `You might be a ${typeName} if`, text: row?.you_might_be_if },
  ], [row, typeName]);

  const aspect = aspects[aspectIdx % 4];

  function shuffle() {
    // Pick a different aspect than the current one.
    let next = Math.floor(Math.random() * 4);
    if (next === aspectIdx) next = (next + 1) % 4;
    setAspectIdx(next);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${typeName} Creator info`}
    >
      <div
        className="relative bg-white rounded-3xl shadow-2xl overflow-hidden w-full max-w-[480px] max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 z-30 bg-black/55 hover:bg-black/80 text-white rounded-full p-1.5 backdrop-blur-sm"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header band */}
        <div className="px-5 py-4 text-white" style={{ background: color }}>
          <div
            className="font-normal uppercase tracking-widest leading-none"
            style={{ fontFamily: '"Questrial", sans-serif', fontSize: 22 }}
          >
            {typeName} Creator
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-4 text-black">
          {/* Body image illustration */}
          {row?.famous_person_photo_url && (
            <div className="flex justify-center">
              <img
                src={row.famous_person_photo_url}
                alt={`${typeName} body illustration`}
                className="max-h-48 w-auto object-contain rounded-md border-2"
                style={{ borderColor: color }}
              />
            </div>
          )}

          {(() => {
            const meta = creatorMetaFor(typeName);
            if (!meta) return null;
            return (
              <div
                className="rounded-2xl border-2 p-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]"
                style={{ borderColor: color, background: `${color}12` }}
              >
                <div>
                  <span className="uppercase tracking-widest font-semibold text-[10px]" style={{ color }}>Family</span>
                  <div className="text-neutral-900" style={{ fontFamily: '"Questrial", sans-serif' }}>{meta.family}</div>
                </div>
                <div>
                  <span className="uppercase tracking-widest font-semibold text-[10px]" style={{ color }}>Team Role</span>
                  <div className="text-neutral-900" style={{ fontFamily: '"Questrial", sans-serif' }}>{meta.teamRole}</div>
                </div>
                {(() => {
                  const el = TYPE_TO_ELEMENT[typeName as keyof typeof TYPE_TO_ELEMENT];
                  if (!el) return null;
                  return (
                    <div>
                      <span className="uppercase tracking-widest font-semibold text-[10px]" style={{ color }}>Element</span>
                      <div className="text-neutral-900" style={{ fontFamily: '"Questrial", sans-serif' }}>{el}</div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Random aspect */}
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-center justify-between mb-2">
              <div
                className="text-[11px] uppercase tracking-widest font-semibold"
                style={{ color }}
              >
                {aspect.label}
              </div>
              <button
                type="button"
                onClick={shuffle}
                className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
                aria-label="Show another aspect"
              >
                <Shuffle className="w-3 h-3" /> Another
              </button>
            </div>
            <p
              className="text-[14px] leading-relaxed text-neutral-800"
              style={{ fontFamily: '"Questrial", sans-serif' }}
            >
              {aspect.text ?? "—"}
            </p>
          </div>

          <p className="text-[10px] text-neutral-400 text-center">
            Tap "Another" or re-open the card to reveal a different aspect.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
