import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type Suggestion = { placeId: string; text: string };

type Props = {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
};

const newToken = () => crypto.randomUUID();

/**
 * Location field with suggestions fetched from our own backend (Google Places).
 * Typing without picking still works — the saved text is geocoded server-side.
 */
export function PlacesAutocompleteInput({ id, value, onChange, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef<string>(newToken());
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

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
    if (next.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      const myId = ++reqIdRef.current;
      const { data, error } = await supabase.functions.invoke("places-autocomplete", {
        body: { input: next, sessionToken: sessionTokenRef.current },
      });
      if (myId !== reqIdRef.current) return; // stale
      const list: Suggestion[] = !error && Array.isArray(data?.suggestions) ? data.suggestions : [];
      setSuggestions(list);
      setOpen(list.length > 0);
    }, 300);
  }

  function pick(s: Suggestion) {
    onChange(s.text);
    setOpen(false);
    setSuggestions([]);
    sessionTokenRef.current = newToken();
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
        <ul role="listbox" className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover shadow-md">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
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
