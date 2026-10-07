/**
 * Live mode for the LUCA preview: a tiny stand-in for PostgREST that runs the
 * app's calls against a SCRATCH Postgres (ops/luca/e2e), as the chosen test
 * person, with row-level security on. Node side of the Vite dev server only.
 *
 *   POST /__rpc    { fn, args, uid }                  → { data } | { error }
 *   POST /__table  { table, action, ..., uid }        → { data, count } | { error }
 *
 * Values never touch the SQL text: they travel as psql variables (:'v0').
 */
import { spawn } from "node:child_process";
import type { Plugin } from "vite";

const IDENT = /^[a-z_][a-z0-9_]*$/;
const UUID = /^[0-9a-f-]{36}$/i;

function psql(db: string, sql: string, vars: string[]): Promise<{ out: string; err: string }> {
  return new Promise((resolve) => {
    const args = ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db];
    vars.forEach((v, i) => args.push("-v", `v${i}=${v}`));
    const p = spawn("psql", args, { env: process.env });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", () => resolve({ out: out.trim(), err: err.trim() }));
    p.stdin.end(sql);
  });
}

/** "ERROR:  message" → message (psql prints the server's text). */
function errorOf(err: string): string | null {
  const m = err.match(/ERROR:\s+(.*)/);
  return m ? m[1].trim() : err ? err.split("\n")[0] : null;
}

function asWho(uid: unknown): string {
  const u = typeof uid === "string" && UUID.test(uid) ? uid : "";
  return u
    ? `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${u}', false) \\g /dev/null\n`
    : `SET ROLE anon;\n`;
}

/** JS value → Postgres array literal. */
function pgArray(a: unknown[]): string {
  return `{${a.map((x) => (x === null ? "NULL" : `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;
}

type Sig = { names: string[]; types: string[]; ret: string };
const sigs = new Map<string, Sig>();
async function signature(db: string, fn: string): Promise<Sig | null> {
  if (sigs.has(fn)) return sigs.get(fn)!;
  const { out } = await psql(db, `SELECT json_build_object('names', p.proargnames, 'types', ARRAY(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) t), 'ret', p.prorettype::regtype::text)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = :'v0' LIMIT 1`, [fn]);
  if (!out) return null;
  const s = JSON.parse(out) as Sig;
  s.names = s.names ?? [];
  sigs.set(fn, s);
  return s;
}

async function rpc(db: string, body: { fn: string; args?: Record<string, unknown>; uid?: string }) {
  if (!IDENT.test(body.fn)) return { error: { message: "bad function" } };
  const sig = await signature(db, body.fn);
  if (!sig) return { error: { message: `function ${body.fn} not found` } };
  const vars: string[] = [];
  const parts: string[] = [];
  for (const [k, v] of Object.entries(body.args ?? {})) {
    const i = sig.names.indexOf(k);
    if (i < 0 || !IDENT.test(k)) return { error: { message: `function ${body.fn} has no argument ${k}` } };
    if (v === null || v === undefined) { parts.push(`${k} => NULL`); continue; }
    const type = sig.types[i];
    const val = type === "jsonb" || type === "json" ? JSON.stringify(v) : type.endsWith("[]") && Array.isArray(v) ? pgArray(v) : String(v);
    parts.push(`${k} => :'v${vars.length}'`);
    vars.push(val);
  }
  const call = `public.${body.fn}(${parts.join(", ")})`;
  const sql = asWho(body.uid) + (sig.ret === "void" ? `SELECT ${call} \\g /dev/null\nSELECT 'null';` : `SELECT COALESCE(to_jsonb(${call})::text, 'null');`);
  const { out, err } = await psql(db, sql, vars);
  const e = errorOf(err);
  if (e && !out) return { error: { message: e } };
  return { data: JSON.parse(out || "null") };
}

interface TableReq {
  table: string; action: "select" | "insert" | "update" | "delete"; uid?: string;
  columns?: string; filters?: { op: "eq" | "ilike"; col: string; val: unknown }[];
  order?: { col: string; asc: boolean }[]; limit?: number; count?: boolean; head?: boolean;
  values?: Record<string, unknown>; returning?: boolean;
}

async function table(db: string, q: TableReq) {
  if (!IDENT.test(q.table)) return { error: { message: "bad table" } };
  const vars: string[] = [];
  const bind = (v: unknown) => { vars.push(v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)); return `:'v${vars.length - 1}'`; };
  const where = (q.filters ?? []).map((f) => {
    if (!IDENT.test(f.col)) throw new Error("bad column");
    return f.op === "ilike" ? `t.${f.col} ILIKE ${bind(f.val)}` : f.val === null ? `t.${f.col} IS NULL` : `t.${f.col} = ${bind(f.val)}`;
  });
  const W = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const T = `public.${q.table}`;
  let sql: string;
  if (q.action === "select") {
    const cols = (q.columns ?? "*").split(",").map((c) => c.trim()).filter(Boolean);
    if (!cols.every((c) => c === "*" || IDENT.test(c))) return { error: { message: "bad columns" } };
    const sel = cols.includes("*") ? "t.*" : cols.map((c) => `t.${c}`).join(", ");
    const order = (q.order ?? []).filter((o) => IDENT.test(o.col)).map((o) => `t.${o.col} ${o.asc ? "ASC" : "DESC"} NULLS LAST`);
    const lim = q.limit && Number.isInteger(q.limit) ? ` LIMIT ${q.limit}` : "";
    sql = q.head
      ? `SELECT json_build_object('rows', '[]'::json, 'count', count(*))::text FROM ${T} t${W};`
      : `SELECT json_build_object('rows', COALESCE(json_agg(x), '[]'::json), 'count', count(*))::text FROM (SELECT ${sel} FROM ${T} t${W}${order.length ? ` ORDER BY ${order.join(", ")}` : ""}${lim}) x;`;
  } else if (q.action === "insert" || q.action === "update") {
    const keys = Object.keys(q.values ?? {});
    if (!keys.length || !keys.every((k) => IDENT.test(k))) return { error: { message: "bad values" } };
    const rec = `jsonb_populate_record(NULL::${T}, ${bind(q.values)}::jsonb)`;
    sql = q.action === "insert"
      ? `WITH r AS (INSERT INTO ${T} AS t (${keys.join(", ")}) SELECT ${keys.join(", ")} FROM ${rec} RETURNING t.*) SELECT json_build_object('rows', COALESCE(json_agg(r), '[]'::json), 'count', count(*))::text FROM r;`
      : `WITH r AS (UPDATE ${T} AS t SET ${keys.map((k) => `${k} = s.${k}`).join(", ")} FROM ${rec} s${W} RETURNING t.*) SELECT json_build_object('rows', COALESCE(json_agg(r), '[]'::json), 'count', count(*))::text FROM r;`;
  } else {
    sql = `WITH r AS (DELETE FROM ${T} AS t${W} RETURNING t.*) SELECT json_build_object('rows', COALESCE(json_agg(r), '[]'::json), 'count', count(*))::text FROM r;`;
  }
  const { out, err } = await psql(db, asWho(q.uid) + sql, vars);
  const e = errorOf(err);
  if (e && !out) return { error: { message: e } };
  return { data: JSON.parse(out || '{"rows":[],"count":0}') };
}

export function liveDb(db: string): Plugin {
  return {
    name: "luca-live-db",
    configureServer(server) {
      const handle = (fn: (b: never) => Promise<unknown>) => (req: import("http").IncomingMessage, res: import("http").ServerResponse) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", async () => {
          let out: unknown;
          try { out = await fn(JSON.parse(body || "{}") as never); } catch (e) { out = { error: { message: (e as Error).message } }; }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(out));
        });
      };
      server.middlewares.use("/__rpc", handle((b: { fn: string; args?: Record<string, unknown>; uid?: string }) => rpc(db, b)));
      server.middlewares.use("/__table", handle((b: TableReq) => table(db, b)));
    },
  };
}
