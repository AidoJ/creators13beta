import { z } from "zod";

// Server-side: Supabase Auth project settings (min_length=8, required character
// classes: lowercase, uppercase, digits, symbols) + HIBP (enabled via
// supabase--configure_auth). Client-side mirror below provides UX feedback.
export const PASSWORD_MIN = 8;

export const passwordPolicy = z
  .string()
  .min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters`)
  .refine((v) => /[a-z]/.test(v), "Needs a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Needs an uppercase letter")
  .refine((v) => /\d/.test(v), "Needs a number")
  .refine((v) => /[^A-Za-z0-9]/.test(v), "Needs a symbol");

export const signupSchema = z
  .object({
    firstName: z.string().trim().min(1, "Required").max(60),
    lastName: z.string().trim().min(1, "Required").max(60),
    email: z.string().trim().email("Invalid email").max(255),
    phone: z
      .string()
      .trim()
      .min(7, "Enter a valid phone number")
      .max(30)
      .refine((v) => v.replace(/[^\d]/g, "").length >= 7, "Enter a valid phone number"),
    password: passwordPolicy,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type SignupValues = z.infer<typeof signupSchema>;

export interface PasswordStrength {
  length: boolean;
  lower: boolean;
  upper: boolean;
  digit: boolean;
  symbol: boolean;
  ok: boolean;
}

export function checkPasswordStrength(pw: string): PasswordStrength {
  const r = {
    length: pw.length >= PASSWORD_MIN,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
  return { ...r, ok: Object.values(r).every(Boolean) };
}
