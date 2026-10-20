import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireRole } from "../_shared/auth.ts";
import approved from "./approved.json" with { type: "json" };

Deno.serve(async (req: Request) => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  if (req.method === "OPTIONS") return respond({ ok: true });
  try {
    const { admin, id, isService } = await requireRole(req, ["admin"]);
    if (isService || !approved.keep.includes(id)) return respond({ error: "Protected administrator required" }, 403);
    if (Date.now() > Date.parse("2026-10-20T08:00:00Z")) return respond({ error: "Cleanup authorization expired" }, 403);
    const body = await req.json();
    if (body.hash !== approved.hash || !Number.isInteger(body.step) || body.step < 0 || body.step >= approved.steps.length) {
      return respond({ error: "Invalid immutable approval or step" }, 400);
    }
    const step = approved.steps[body.step];
    if (step.kind === "files" && "bucket" in step && "paths" in step) {
      const { data, error } = await admin.storage.from(step.bucket).remove(step.paths);
      if (error) throw error;
      return respond({ step: body.step, kind: step.kind, bucket: step.bucket, removed: data?.length ?? 0 });
    }
    if (step.kind === "rows" && "table" in step && "keys" in step) {
      const filter = step.keys.map((key) => "and(" + Object.entries(key).map(([column, value]) => `${column}.eq.${value}`).join(",") + ")").join(",");
      const { data, error } = await admin.from(step.table).delete().or(filter).select(Object.keys(step.keys[0]).join(","));
      if (error) throw error;
      return respond({ step: body.step, kind: step.kind, table: step.table, removed: data?.length ?? 0 });
    }
    if (step.kind === "user" && "id" in step) {
      if (approved.keep.includes(step.id)) return respond({ error: "KEEP account cannot be deleted" }, 403);
      const { data, error } = await admin.auth.admin.getUserById(step.id);
      if (error && error.status !== 404) throw error;
      if (!data.user) return respond({ step: body.step, kind: step.kind, removed: 0 });
      const result = await admin.auth.admin.deleteUser(step.id);
      if (result.error) throw result.error;
      return respond({ step: body.step, kind: step.kind, removed: 1 });
    }
    return respond({ error: "Invalid approved step" }, 400);
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "Cleanup operation failed" }, 400);
  }
});