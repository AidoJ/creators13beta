// Admin-only: carries official Creator Types from a Live export into this project.
// Dry run by default. Maps people by email; never relies on the `source` column default.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireRole, AuthError } from "../_shared/auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Row = {
  email: string;
  primary_type?: string | null; secondary_type?: string | null; type_3?: string | null; type_4?: string | null;
  profiled_by_email?: string | null; profiled_at?: string | null;
  profiling_source?: string | null; // Live profiling_data->>'source'
  choice_key?: string | null; // keep_all | keep_account | delete_all
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { admin } = await requireRole(req, ["admin"]);
    const { rows, dry_run = true } = (await req.json()) as { rows: Row[]; dry_run?: boolean };
    if (!Array.isArray(rows)) return json({ error: "rows[] required" }, 400);

    const { data: ct } = await admin.from("creator_types").select("name");
    const valid = new Map((ct ?? []).map((t: { name: string }) => [t.name.toLowerCase(), t.name]));

    // email -> account id
    const ids = new Map<string, string>();
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      data.users.forEach((u) => u.email && ids.set(u.email.toLowerCase(), u.id));
      if (data.users.length < 1000) break;
    }

    const r: Record<string, unknown[]> = {
      inserted: [], updated: [], unchanged: [], replaced_self_guess: [], kept_local_profile: [],
      held_back_bad_type: [], held_back_shape: [], skipped_delete_all: [], delete_all_has_row: [],
      flagged_no_answer: [], flagged_unknown_choice: [], no_account_here: [],
      profiled_by_null: [], profiled_at_null: [],
    };

    for (const row of rows) {
      const email = (row.email || "").trim().toLowerCase();
      const uid = ids.get(email);
      if (!uid) { r.no_account_here.push(email); continue; }

      const choice = row.choice_key?.trim() || null;
      const { data: existing } = await admin.from("creator_type_profiles")
        .select("primary_type, secondary_type, type_3, type_4, source, profiled_by, profiled_at, profiling_data")
        .eq("user_id", uid).maybeSingle();

      if (choice === "delete_all") {
        r.skipped_delete_all.push(email);
        if (existing) r.delete_all_has_row.push(email);
        continue;
      }
      if (!choice) { r.flagged_no_answer.push(email); continue; }
      if (choice !== "keep_all" && choice !== "keep_account") { r.flagged_unknown_choice.push({ email, choice }); continue; }

      // Validate types, keep slot order.
      const raw = [row.primary_type, row.secondary_type, row.type_3, row.type_4].map((v) => (v ?? "").trim());
      const bad = raw.filter((v) => v && !valid.has(v.toLowerCase()));
      if (bad.length) { r.held_back_bad_type.push({ email, values: bad }); continue; }
      const types = raw.map((v) => (v ? valid.get(v.toLowerCase())! : null));
      const lastFilled = types.map((t) => !!t).lastIndexOf(true);
      const gap = types.slice(0, lastFilled + 1).some((t) => !t);
      const filled = types.filter(Boolean) as string[];
      if (!filled.length || gap || new Set(filled).size !== filled.length) {
        r.held_back_shape.push({ email, values: raw }); continue;
      }

      const pdata = (existing?.profiling_data ?? {}) as Record<string, unknown>;
      const isImported = pdata.imported_from_live === true;
      if (existing && existing.source !== "self_selected" && !isImported) { r.kept_local_profile.push(email); continue; }

      const byEmail = row.profiled_by_email?.trim().toLowerCase() || null;
      const profiledBy = byEmail ? ids.get(byEmail) ?? null : null;
      if (!profiledBy) r.profiled_by_null.push({ email, live_assigner: byEmail });
      if (!row.profiled_at) r.profiled_at_null.push(email);

      const payload = {
        user_id: uid,
        source: row.profiling_source === "case_study" ? "case_study" : "practitioner",
        primary_type: types[0], secondary_type: types[1], type_3: types[2], type_4: types[3],
        profiled_by: profiledBy,
        profiled_at: row.profiled_at || null,
        profiling_data: { imported_from_live: true, live_profiled_by_email: byEmail },
      };

      const same = existing && isImported &&
        (["primary_type", "secondary_type", "type_3", "type_4", "source", "profiled_by"] as const)
          .every((k) => (existing as any)[k] === (payload as any)[k]) &&
        (existing.profiled_at ? new Date(existing.profiled_at).getTime() : null) ===
          (payload.profiled_at ? new Date(payload.profiled_at).getTime() : null);
      if (same) { r.unchanged.push(email); continue; }

      const bucket = !existing ? "inserted" : existing.source === "self_selected" ? "replaced_self_guess" : "updated";
      if (!dry_run) {
        const { error } = await admin.from("creator_type_profiles").upsert(payload, { onConflict: "user_id" });
        if (error) { (r.errors ??= []).push({ email, error: error.message }); continue; }
      }
      r[bucket].push({ email, types: filled, source: payload.source });
    }

    const counts = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.length]));
    return json({ dry_run, total_rows: rows.length, counts, details: r });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
