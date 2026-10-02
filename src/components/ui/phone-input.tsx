import { useEffect, useMemo, useState } from "react";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { Input } from "@/components/ui/input";

/**
 * Phone number with a mandatory country (default Australia +61).
 * Emits the number in international format (e.g. "+61 412 293 255") plus
 * whether it is valid for the chosen country. Local forms like 0412… are
 * accepted and converted.
 */
export function parsePhone(raw: string, country: CountryCode = "AU") {
  const p = parsePhoneNumberFromString((raw || "").trim(), country);
  return p && p.isValid() ? { valid: true as const, formatted: p.formatInternational(), country: p.country } : { valid: false as const, formatted: null, country: undefined };
}

export const isValidPhone = (value: string | null | undefined) => !!value && parsePhone(value).valid;

interface Props {
  id?: string;
  value: string;
  onChange: (value: string, valid: boolean) => void;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}

export function PhoneInput({ id, value, onChange, required, disabled, invalid }: Props) {
  const initial = useMemo(() => parsePhoneNumberFromString(value || "", "AU"), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<CountryCode>((initial?.country as CountryCode) || "AU");
  const [national, setNational] = useState<string>(initial ? initial.formatNational() : (value || "").replace(/^\+61\s*$/, ""));
  const [touched, setTouched] = useState(false);

  const countries = useMemo(() => {
    const names = typeof Intl !== "undefined" && (Intl as any).DisplayNames ? new (Intl as any).DisplayNames(["en"], { type: "region" }) : null;
    return getCountries()
      .map((c) => ({ code: c, name: (names?.of(c) as string) || c, dial: getCountryCallingCode(c) }))
      .sort((a, b) => (a.code === "AU" ? -1 : b.code === "AU" ? 1 : a.name.localeCompare(b.name)));
  }, []);

  const emit = (c: CountryCode, n: string) => {
    const parsed = parsePhone(n.trim().startsWith("+") ? n : n, c);
    if (parsed.valid && parsed.country && parsed.country !== c && n.trim().startsWith("+")) setCountry(parsed.country as CountryCode);
    onChange(parsed.valid ? parsed.formatted! : n.trim() ? `+${getCountryCallingCode(c)} ${n.trim().replace(/^0/, "")}` : "", parsed.valid);
  };

  // Keep parent informed of initial validity.
  useEffect(() => { if (national) emit(country, national); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showError = (touched || invalid) && national.trim() !== "" && !parsePhone(national, country).valid;

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <select
          aria-label="Country code"
          value={country}
          disabled={disabled}
          onChange={(e) => { const c = e.target.value as CountryCode; setCountry(c); emit(c, national); }}
          className="h-10 w-28 shrink-0 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.code} +{c.dial}</option>
          ))}
        </select>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          disabled={disabled}
          value={national}
          placeholder={country === "AU" ? "0412 345 678" : "Phone number"}
          onChange={(e) => { setNational(e.target.value); emit(country, e.target.value); }}
          onBlur={() => setTouched(true)}
          aria-invalid={showError || undefined}
        />
      </div>
      {showError && <p className="text-xs text-destructive">That isn't a valid phone number for the selected country.</p>}
    </div>
  );
}
