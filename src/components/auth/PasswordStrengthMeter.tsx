import { Check, X } from "lucide-react";
import { checkPasswordStrength, PASSWORD_MIN } from "./signupValidation";

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const s = checkPasswordStrength(password);
  const items: Array<[boolean, string]> = [
    [s.length, `${PASSWORD_MIN}+ characters`],
    [s.upper, "Uppercase letter"],
    [s.lower, "Lowercase letter"],
    [s.digit, "Number"],
    [s.symbol, "Symbol"],
  ];
  return (
    <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
      {items.map(([ok, label]) => (
        <li
          key={label}
          className={`flex items-center gap-1.5 ${ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
        >
          {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {label}
        </li>
      ))}
    </ul>
  );
}
