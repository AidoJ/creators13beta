// Shared auth helpers for edge functions.
// Validates JWTs and roles consistently. Throws AuthError → caller turns into 401/403.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function requireUser(req: Request, admin?: SupabaseClient): Promise<{ id: string; email: string | null; admin: SupabaseClient }> {
  const ah = req.headers.get("Authorization");
  if (!ah || !ah.startsWith("Bearer ")) throw new AuthError("Missing bearer token", 401);
  const token = ah.slice("Bearer ".length).trim();
  if (!token) throw new AuthError("Missing bearer token", 401);
  const a = admin ?? adminClient();
  const { data, error } = await a.auth.getUser(token);
  if (error || !data.user) throw new AuthError("Invalid or expired token", 401);
  return { id: data.user.id, email: data.user.email ?? null, admin: a };
}

export async function requireRole(req: Request, roles: Array<"admin" | "trainer" | "practitioner" | "trainee" | "client">): Promise<{ id: string; email: string | null; admin: SupabaseClient; role: string }> {
  const u = await requireUser(req);
  const { data, error } = await u.admin
    .from("user_roles")
    .select("role")
    .eq("user_id", u.id)
    .in("role", roles)
    .limit(1)
    .maybeSingle();
  if (error) throw new AuthError("Role check failed", 500);
  if (!data) throw new AuthError(`Forbidden: requires ${roles.join("/")}`, 403);
  return { ...u, role: data.role as string };
}

export function authErrorResponse(err: unknown, corsHeaders: Record<string, string>): Response {
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(null, { status: 0 });
}

// Minimal in-memory rate limiter per warm instance.
// Not bullet-proof (multi-instance) but adequate for stopping cheap loops.
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
