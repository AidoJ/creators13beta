/**
 * agent-db-query — read-only database access for external coding agents
 * (e.g. Claude Code via MCP).
 *
 * Auth: shared bearer token (AGENT_DB_TOKEN). No user JWT.
 * Safety: every query runs through public.agent_readonly_query(), which
 *   - rejects anything that isn't a single SELECT / WITH statement,
 *   - executes as the `agent_readonly` Postgres role (SELECT-only grants,
 *     no access to profiling_photos or client_session_images),
 *   - caps results at 500 rows.
 *
 * Actions:
 *   { "action": "tables" }                -> list of public tables
 *   { "action": "schema", "table": "x" }  -> columns for one table
 *   { "action": "query",  "sql": "..." }  -> run a read-only query
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AGENT_DB_TOKEN = Deno.env.get("AGENT_DB_TOKEN")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!AGENT_DB_TOKEN || token !== AGENT_DB_TOKEN) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { action?: string; sql?: string; table?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const run = async (sql: string) => {
    const { data, error } = await supabase.rpc("agent_readonly_query", { _sql: sql });
    if (error) return json({ error: error.message }, 400);
    return json({ rows: data ?? [] });
  };

  const action = body.action ?? "query";

  if (action === "tables") {
    return await run(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
  }

  if (action === "schema") {
    const table = (body.table ?? "").replace(/[^a-zA-Z0-9_]/g, "");
    if (!table) return json({ error: "Missing 'table'" }, 400);
    return await run(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = '${table}' order by ordinal_position`,
    );
  }

  if (action === "query") {
    if (!body.sql) return json({ error: "Missing 'sql'" }, 400);
    return await run(body.sql);
  }

  return json({ error: `Unknown action '${action}'` }, 400);
});
