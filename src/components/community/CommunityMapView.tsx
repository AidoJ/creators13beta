/// <reference types="google.maps" />
/**
 * CommunityMapView — Batch 8 (Phase 2.1 Map View).
 *
 * Lazy-loaded sibling to the Face/Lotus view on the Community Dashboard.
 * Renders the same `get_my_top_matches` rows as map pins, positioned by each
 * member's geocoded `location_lat` / `location_lng`. Members with no coords
 * are omitted; the caller surfaces the residual count as a footer line.
 *
 * Marker strategy — Option B:
 *   Each pin is a custom HTML OverlayView showing the member's avatar inside a
 *   coloured ring (their primary Creator-Type colour). A small numeric badge in
 *   the corner shows the match score. Featured-Creator highlight = a glow halo
 *   on the ring in the Creator-of-the-Month colour.
 *
 *   We use OverlayView (HTML DOM) rather than `google.maps.Marker` icons so the
 *   avatar img loads naturally without rasterising to a data URL. We are
 *   deliberately NOT using AdvancedMarkerElement — it requires a Cloud-Console
 *   `mapId`, which the managed Lovable connector key does not have.
 *
 *   Deferred polish: render the full <LotusProfile> as the marker. Skipped for
 *   Phase 2.1 because it needs rasterisation to a marker icon, or a much larger
 *   OverlayView footprint that overcrowds the map. Revisit post-launch.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getCreatorTypeColor } from "@/lib/creatorTypes";
import { Skeleton } from "@/components/ui/skeleton";

declare global {
  interface Window {
    google?: typeof google;
    __c13MapsInitCallback?: () => void;
    __c13MapsLoading?: Promise<void>;
  }
}

export type MapMember = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null; // already resolved to a signed/absolute URL
  location_lat: number | null;
  location_lng: number | null;
  score: number;
  primary_type: string | null; // lowercase creator type or null
  featured: boolean;
};

interface CommunityMapViewProps {
  members: MapMember[];
  featuredColor?: string;
  onSelect: (userId: string) => void;
  /** Reports how many members couldn't be plotted (missing coords). */
  onUnplottableCount?: (count: number) => void;
}

const SCRIPT_ID = "c13-google-maps-js";

/** Loads the Maps JS API once per page; subsequent calls await the same promise. */
function loadMapsApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__c13MapsLoading) return window.__c13MapsLoading;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) {
    return Promise.reject(new Error("Google Maps browser key not configured"));
  }

  window.__c13MapsLoading = new Promise<void>((resolve, reject) => {
    window.__c13MapsInitCallback = () => resolve();
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Maps script error")));
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.async = true;
    s.defer = true;
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&loading=async&callback=__c13MapsInitCallback` +
      (channel ? `&channel=${encodeURIComponent(channel)}` : "");
    s.onerror = () => reject(new Error("Maps script failed to load"));
    document.head.appendChild(s);
  });

  return window.__c13MapsLoading;
}

export default function CommunityMapView({
  members,
  featuredColor,
  onSelect,
  onUnplottableCount,
}: CommunityMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.OverlayView[]>([]);
  const boundsKeyRef = useRef<string>("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { plottable, unplottable } = useMemo(() => {
    const p: MapMember[] = [];
    let u = 0;
    for (const m of members) {
      if (
        typeof m.location_lat === "number" &&
        typeof m.location_lng === "number" &&
        Number.isFinite(m.location_lat) &&
        Number.isFinite(m.location_lng)
      ) {
        p.push(m);
      } else {
        u += 1;
      }
    }
    return { plottable: p, unplottable: u };
  }, [members]);

  useEffect(() => {
    onUnplottableCount?.(unplottable);
  }, [unplottable, onUnplottableCount]);

  // Mount Maps API + initial Map instance once.
  useEffect(() => {
    let cancelled = false;
    loadMapsApi()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        mapRef.current = new window.google.maps.Map(containerRef.current, {
          // Centre on Australia by default — most current members are AU/NZ.
          center: { lat: -27, lng: 134 },
          zoom: 3,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          // No `mapId` — managed connector key doesn't have a Cloud Console
          // map style configured. Default styling is fine.
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
          gestureHandling: "greedy",
        });
        setReady(true);
      })
      .catch((e) => setError(e.message || "Failed to load map"));
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-render markers whenever the member set changes.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;

    // Tear down existing overlays.
    for (const ov of overlaysRef.current) ov.setMap(null);
    overlaysRef.current = [];

    if (plottable.length === 0) {
      boundsKeyRef.current = "";
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    for (const m of plottable) {
      const pos = new window.google.maps.LatLng(m.location_lat!, m.location_lng!);
      bounds.extend(pos);
      const overlay = createAvatarOverlay({
        position: pos,
        member: m,
        featuredColor,
        onClick: () => onSelect(m.user_id),
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    // Only re-fit the viewport when the *set* of plotted positions actually
    // changes — not when avatar URLs sign in or featuredColor flips. This
    // avoids a jarring re-pan/re-zoom on every parent re-render.
    const key = plottable
      .map((m) => `${m.user_id}:${m.location_lat?.toFixed(4)},${m.location_lng?.toFixed(4)}`)
      .sort()
      .join("|");
    if (key !== boundsKeyRef.current) {
      boundsKeyRef.current = key;
      map.fitBounds(bounds, 64);
      const listener = window.google.maps.event.addListenerOnce(map, "idle", () => {
        if (map.getZoom()! > 11) map.setZoom(11);
      });
      return () => {
        window.google?.maps?.event.removeListener(listener);
      };
    }
  }, [ready, plottable, featuredColor, onSelect]);

  // Cleanup overlays on unmount.
  useEffect(() => {
    return () => {
      for (const ov of overlaysRef.current) ov.setMap(null);
      overlaysRef.current = [];
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm">
        Map unavailable: {error}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {!ready && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-background/40">
          <Skeleton className="w-64 h-6" />
        </div>
      )}
      <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden" />
    </div>
  );
}

/**
 * Factory for a per-member HTML OverlayView: avatar in coloured ring + score
 * badge, with optional featured glow.
 */
function createAvatarOverlay(opts: {
  position: google.maps.LatLng;
  member: MapMember;
  featuredColor?: string;
  onClick: () => void;
}): google.maps.OverlayView {
  const { position, member, featuredColor, onClick } = opts;
  const ringColor = member.primary_type
    ? getCreatorTypeColor(member.primary_type)
    : "hsl(var(--primary))";

  // Subclass-style instance; google.maps.OverlayView is constructable.
  const overlay = new window.google.maps.OverlayView();

  let div: HTMLDivElement | null = null;

  // Size bucket per Face View thresholds (xl/lg/md/sm). Mapped to marker
  // diameters that read clearly on a map without overcrowding: spec calls for
  // xl 200 / lg 150 / md 110 / sm 80. Anchor stays bottom-center via the
  // translate(-50%, -100%) transform so the pin tail sits on the coord
  // regardless of avatar diameter.
  const SIZE =
    member.score >= 8 ? 200 : member.score >= 5 ? 150 : member.score >= 3 ? 110 : 80;
  const BADGE = Math.max(22, Math.round(SIZE * 0.22));
  const BADGE_FONT = Math.max(12, Math.round(SIZE * 0.13));
  const AVATAR_FONT = Math.max(18, Math.round(SIZE * 0.34));

  overlay.onAdd = function () {
    div = document.createElement("div");
    div.style.position = "absolute";
    div.style.cursor = "pointer";
    div.style.transform = "translate(-50%, -100%)";
    div.style.zIndex = String(100 + Math.round(member.score));
    div.title = `${member.display_name ?? "Member"} — Match strength: ${member.score}`;

    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.style.width = `${SIZE}px`;
    wrapper.style.height = `${SIZE}px`;
    wrapper.style.borderRadius = "9999px";
    wrapper.style.padding = "3px";
    wrapper.style.background = ringColor;
    wrapper.style.boxShadow = member.featured
      ? `0 0 0 3px ${featuredColor ?? ringColor}66, 0 0 14px 4px ${featuredColor ?? ringColor}88, 0 4px 10px rgba(0,0,0,0.35)`
      : "0 4px 10px rgba(0,0,0,0.35)";
    wrapper.style.transition = "transform 120ms ease";

    const inner = document.createElement("div");
    inner.style.width = "100%";
    inner.style.height = "100%";
    inner.style.borderRadius = "9999px";
    inner.style.overflow = "hidden";
    inner.style.background = "#1a1a1a";
    inner.style.display = "flex";
    inner.style.alignItems = "center";
    inner.style.justifyContent = "center";
    inner.style.color = "#fff";
    inner.style.fontFamily = "'Questrial', sans-serif";
    inner.style.fontSize = `${AVATAR_FONT}px`;

    if (member.avatar_url) {
      const img = document.createElement("img");
      img.src = member.avatar_url;
      img.alt = member.display_name ?? "Member";
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      img.decoding = "async";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.display = "block";
      inner.appendChild(img);
    } else {
      inner.textContent = (member.display_name ?? "?").charAt(0).toUpperCase();
    }
    wrapper.appendChild(inner);

    // Score badge — small chip in bottom-right.
    const badge = document.createElement("div");
    badge.textContent = String(member.score);
    badge.style.position = "absolute";
    badge.style.right = "-4px";
    badge.style.bottom = "-4px";
    badge.style.minWidth = `${BADGE}px`;
    badge.style.height = `${BADGE}px`;
    badge.style.padding = `0 ${Math.round(BADGE * 0.27)}px`;
    badge.style.borderRadius = "9999px";
    badge.style.background = "#111";
    badge.style.color = "#fff";
    badge.style.fontSize = `${BADGE_FONT}px`;
    badge.style.fontWeight = "600";
    badge.style.display = "flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.border = `2px solid ${ringColor}`;
    badge.style.fontFamily = "'Questrial', sans-serif";
    wrapper.appendChild(badge);

    // Tail/pointer triangle so it reads as a pin.
    const tail = document.createElement("div");
    tail.style.position = "absolute";
    tail.style.left = "50%";
    tail.style.bottom = "-6px";
    tail.style.transform = "translateX(-50%) rotate(45deg)";
    tail.style.width = "10px";
    tail.style.height = "10px";
    tail.style.background = ringColor;
    tail.style.zIndex = "-1";
    wrapper.appendChild(tail);

    div.appendChild(wrapper);
    div.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    div.addEventListener("mouseenter", () => {
      wrapper.style.transform = "scale(1.08)";
    });
    div.addEventListener("mouseleave", () => {
      wrapper.style.transform = "scale(1)";
    });

    const panes = this.getPanes();
    panes?.overlayMouseTarget.appendChild(div);
  };

  overlay.draw = function () {
    if (!div) return;
    const projection = this.getProjection();
    if (!projection) return;
    const pt = projection.fromLatLngToDivPixel(position);
    if (!pt) return;
    div.style.left = `${pt.x}px`;
    div.style.top = `${pt.y}px`;
  };

  overlay.onRemove = function () {
    if (div?.parentNode) div.parentNode.removeChild(div);
    div = null;
  };

  return overlay;
}
