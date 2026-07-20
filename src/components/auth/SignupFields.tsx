import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { signupSchema, type SignupValues } from "./signupValidation";

export interface SignupFieldsProps {
  loading?: boolean;
  submitLabel?: string;
  submitIcon?: "arrow" | "none";
  initial?: Partial<SignupValues>;
  onSubmit: (values: SignupValues & { marketingOptIn: boolean }) => void | Promise<void>;
}


/**
 * Shared signup form used by /auth and /enroll/signup. Captures the same five
 * fields with identical validation everywhere. Single-column layout on mobile
 * (defensive — guarantees First/Last render on narrow viewports and iOS Safari
 * autofill chrome). The owning page decides what to do AFTER signup (route,
 * subscription path, etc.).
 */
export function SignupFields({
  loading = false,
  submitLabel = "Create account",
  submitIcon = "arrow",
  initial,
  onSubmit,
}: SignupFieldsProps) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signupSchema.safeParse({
      firstName,
      lastName,
      email,
      phone,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0]?.toString();
        if (k && !e[k]) e[k] = issue.message;
      }
      setErrors(e);
      return;
    }
    setErrors({});
    await onSubmit({ ...parsed.data, marketingOptIn });
  }


  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sf-first">First name *</Label>
          <Input
            id="sf-first"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={60}
            required
          />
          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sf-last">Last name *</Label>
          <Input
            id="sf-last"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={60}
            required
          />
          {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-email">Email *</Label>
        <Input
          id="sf-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-phone">Phone *</Label>
        <Input
          id="sf-phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+61 400 000 000"
          required
        />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-password">Password *</Label>
        <div className="relative">
          <Input
            id="sf-password"
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-10"
            required
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <PasswordStrengthMeter password={password} />
        {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-confirm">Confirm password *</Label>
        <Input
          id="sf-confirm"
          type={showPw ? "text" : "password"}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <Checkbox
          checked={marketingOptIn}
          onCheckedChange={(v) => setMarketingOptIn(v === true)}
          className="mt-0.5"
        />
        <span className="text-sm text-muted-foreground leading-snug">
          Keep me posted on Creator Types events, tips and offers. You can unsubscribe at any time.
        </span>
      </label>

      <Button type="submit" size="lg" className="w-full rounded-full" disabled={loading}>

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {submitLabel}
            {submitIcon === "arrow" && <ArrowRight className="ml-2 h-4 w-4" />}
          </>
        )}
      </Button>
    </form>
  );
}
