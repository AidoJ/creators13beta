import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

type Suggestion = {
  placeId: string;
  text: string;
};

type Props = {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
};

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;

let placesLibPromise: Promise<any> | null = null;
function loadPlaces(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (!BROWSER_KEY) return Promise.reject(new Error("Missing Google Maps browser key"));
  if ((window as any).google?.maps?.importLibrary) {
    return (window as any).google.maps.importLibrary("places");
  }
  if (!placesLibPromise) {
    placesLibPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>("script[data-google-maps-loader]");
      const done = () => {
        (window as any).google.maps.importLibrary("places").then(resolve, reject);
      };
      if (existing) {
        existing.addEventListener("load", done, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&libraries=places&loading=async&v=weekly`;
      s.async = true;
      s.defer = true;
      s.dataset.googleMapsLoader = "1";
      s.addEventListener("load", done, { once: true });
      s.addEventListener("error", reject, { once: true });
      document.head.appendChild(s);
    });
  }
  return placesLibPromise;
}

export function PlacesAutocompleteInput({ id, value, onChange, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef<any>(null);
  const placesRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPlaces()
      .then((lib) => {
        placesRef.current = lib;
        sessionTokenRef.current = new lib.AutocompleteSessionToken();
      })
      .catch(() => {
        // Silent fallback: input still works as free text
      });
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleChange(next: string) {
    onChange(next);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!next.trim() || !placesRef.current) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const { AutocompleteSuggestion } = placesRef.current;
        const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: next,
          sessionToken: sessionTokenRef.current,
          includedPrimaryTypes: ["(regions)"],
        });
        const mapped: Suggestion[] = (results ?? [])
          .map((s: any) => {
            const p = s.placePrediction;
            if (!p) return null;
            return { placeId: p.placeId, text: p.text?.toString?.() ?? "" };
          })
          .filter(Boolean) as Suggestion[];
        setSuggestions(mapped);
        setOpen(mapped.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 200);
  }

  function pick(s: Suggestion) {
    onChange(s.text);
    setOpen(false);
    setSuggestions([]);
    if (placesRef.current) {
      sessionTokenRef.current = new placesRef.current.AutocompleteSessionToken();
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover shadow-md">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
