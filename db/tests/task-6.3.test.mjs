// Task 6.3 acceptance tests — realtime broadcast-refetch (R-5 / [#26]).
// Run: pnpm build && pnpm test:db:6.3   (spawns `next start` on :3125)
//
// Proves TRUE end-to-end delivery: a real subscriber (supabase-js over the
// `ws` transport — Node 20 has no native WebSocket) receives the
// "invoices changed" broadcast both from the raw REST endpoint AND when a
// mutation route fires it. The payload carries nothing — data only flows
// through RLS-checked refetches, per the adjudicated pattern. DESTRUCTIVE.

import { spawn } from "node:child_process";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const STAGING_REF = "kxtbxgcvwxvlsoygjvvi";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!dbUrl?.includes(STAGING_REF) || !SUPA_URL?.includes(STAGING_REF)) {
  console.error("Refusing to run: not the staging project.");
  process.exit(1);
}
const APP = "http://127.0.0.1:3125";
const PASSWORD = "Rt-Test-Only-2026!";
const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });

let passed = 0;
let failed = 0;
const ok = (c, l) =>
  c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.error(`  ✗ ${l}`));

async function gotrue(method, path, body) {
  const res = await fetch(`${SUPA_URL}/auth/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GoTrue ${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
async function ensureUser(email) {
  const list = await gotrue("GET", "/admin/users?per_page=200");
  const existing = (list.users ?? []).find((u) => u.email === email);
  if (existing) await gotrue("DELETE", `/admin/users/${existing.id}`);
  return (await gotrue("POST", "/admin/users", { email, password: PASSWORD, email_confirm: true }))
    .id;
}
async function signIn(email) {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`password grant ${email}: ${res.status} ${await res.text()}`);
  return res.json();
}
const projectRef = new URL(SUPA_URL).host.split(".")[0];
function cookieFor(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${projectRef}-auth-token`;
  const MAX = 3180;
  if (value.length <= MAX) return `${name}=${value}`;
  const parts = [];
  for (let i = 0; i * MAX < value.length; i++)
    parts.push(`${name}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  return parts.join("; ");
}

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — subscriber, fixtures, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Rt Test Co', true, 500, 'INV-{NN}')`;
const [cust] = await sql`insert into customers (type, name) values ('walk_in', 'Rt Client') returning id`;

const staffId = await ensureUser("rt-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Rt Staff', 'staff', true)`;
const staffSession = await signIn("rt-staff@staging.test");

// Real subscriber over ws — exactly what the browser component does.
const supabase = createClient(SUPA_URL, ANON_KEY, {
  realtime: { transport: WebSocket },
});
let received = [];
let resolveNext = null;
const channel = supabase
  .channel("invoices")
  .on("broadcast", { event: "changed" }, (msg) => {
    received.push(msg);
    if (resolveNext) {
      resolveNext(msg);
      resolveNext = null;
    }
  });
const subscribed = await new Promise((resolve) => {
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") resolve(true);
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(false);
  });
  setTimeout(() => resolve(false), 10000);
});
if (!subscribed) {
  console.error("could not subscribe to the realtime channel");
  await supabase.removeAllChannels();
  await sql.end();
  process.exit(1);
}
const nextMessage = (ms = 8000) =>
  new Promise((resolve) => {
    resolveNext = resolve;
    setTimeout(() => resolve(null), ms);
  });

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3125"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const up = await (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${APP}/login`)).status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
})();
if (!up) {
  console.error("next start never became ready.\n" + serverLog.slice(-2000));
  server.kill();
  process.exit(1);
}

try {
  /* ═══ R1 — the REST emit path delivers ═════════════════════════════════ */
  console.log("R1 — REST broadcast → subscriber");
  {
    const waiter = nextMessage();
    const res = await fetch(`${SUPA_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: "invoices", event: "changed", payload: {} }],
      }),
    });
    ok(res.status >= 200 && res.status < 300, `REST endpoint accepts the message (${res.status})`);
    const msg = await waiter;
    ok(msg !== null, "subscriber RECEIVED the broadcast over the socket");
    ok(msg && Object.keys(msg.payload ?? {}).length === 0,
      "payload is empty — data only flows through RLS refetches (R-5)");
  }

  /* ═══ R2 — mutation routes emit the signal ═════════════════════════════ */
  console.log("R2 — mutations broadcast");
  {
    received = [];
    const waiter = nextMessage();
    const res = await fetch(`${APP}/api/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieFor(staffSession) },
      body: JSON.stringify({
        customerId: cust.id,
        columns: [],
        lines: [{ description: "Rt line", qty: 1, govtFee: 0, serviceFee: 1000, extraFees: {} }],
      }),
    });
    const { id: draftId } = await res.json();
    ok(res.status === 201, "draft created through the API");
    ok((await waiter) !== null, "draft creation broadcast received");

    const waiter2 = nextMessage();
    const issue = await fetch(`${APP}/api/invoices/${draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieFor(staffSession) },
      body: JSON.stringify({ action: "issue" }),
    });
    ok(issue.status === 200, "issued through the API");
    ok((await waiter2) !== null, "issue broadcast received");
  }
} finally {
  server.kill();
  await supabase.removeAllChannels().catch(() => {});
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
