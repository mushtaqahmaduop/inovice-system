// Task 1.4 — idempotent seed: settings row, admin user, payment methods,
// services catalogue (+ demo customers with --demo).
// Run: pnpm db:seed [-- --demo]
//
// Idempotent by natural keys (settings: single row; user: email; methods:
// label; services/customers: name) — safe to re-run; it never duplicates and
// never overwrites values an admin may have edited since.
//
// Sources & open questions:
// - Services catalogue: reference/invoice_system_v2.html — the ONLY prototype
//   data permitted as fixtures (rule [#28]: catalogue unit fees yes, prototype
//   invoice/payment amounts never). AED → fils (×100) here.
// - payment_methods: Cash/Card/Bank transfer/Cheque PENDING Q-10 — admin can
//   edit rows at runtime, that is the R-2/D-25 design.
// - settings company fields: placeholders PENDING Q-02/Q-03 — real values land
//   via the Settings page (task 3.2), never hardcoded.
// - Admin identity: SEED_ADMIN_EMAIL (+ optional SEED_ADMIN_PASSWORD). If the
//   password is not provided and the user does not exist yet, a random one is
//   generated and NOT printed — sign in via password reset, or re-run with
//   SEED_ADMIN_PASSWORD set. An existing user's password is never touched.

import postgres from "postgres";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
const AUTH_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const DEMO = process.argv.includes("--demo");

if (!url || !AUTH_URL.startsWith("http") || !SERVICE_KEY) {
  console.error("Missing DATABASE_URL_MIGRATIONS / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!ADMIN_EMAIL) {
  console.error("SEED_ADMIN_EMAIL is required (the operator/admin account).");
  process.exit(1);
}
console.log(`Seeding ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host}${DEMO ? " (with demo customers)" : ""}`);

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function gotrue(method, path, body) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GoTrue ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/* ── settings — single row, placeholders pending Q-02/Q-03 ─────────────── */
const [{ n: settingsCount }] = await sql`select count(*)::int as n from settings`;
if (settingsCount === 0) {
  await sql`insert into settings (company_name, tagline, vat_registered, vat_rate_bp,
      invoice_number_format, paper_size, due_days_default)
    values ('Company Name — set in Settings (Q-02)', null, true, 500, 'INV-{NN}', 'A4', 30)`;
  console.log("settings: created (placeholder company details)");
} else {
  console.log("settings: exists, untouched");
}

/* ── admin user + profile ──────────────────────────────────────────────── */
{
  const list = await gotrue("GET", `/admin/users?per_page=200`);
  let user = (list.users ?? []).find((u) => u.email === ADMIN_EMAIL);
  if (!user) {
    user = await gotrue("POST", "/admin/users", {
      email: ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD ?? randomBytes(24).toString("base64url"),
      email_confirm: true,
    });
    console.log(`admin user: created ${ADMIN_EMAIL}${process.env.SEED_ADMIN_PASSWORD ? "" : " (random password — use reset, or re-run with SEED_ADMIN_PASSWORD)"}`);
  } else {
    console.log(`admin user: exists ${ADMIN_EMAIL}, untouched`);
  }
  await sql`insert into profiles (id, full_name, role, is_active)
    values (${user.id}, 'Administrator', 'admin', true)
    on conflict (id) do update set role = 'admin', is_active = true`;
  console.log("admin profile: ensured (role=admin, active)");
}

/* ── payment methods — pending Q-10; admin-editable rows (D-25) ────────── */
const METHODS = ["Cash", "Card", "Bank transfer", "Cheque"];
for (let i = 0; i < METHODS.length; i++) {
  await sql`insert into payment_methods (label, position)
    values (${METHODS[i]}, ${i})
    on conflict (label) do nothing`;
}
console.log(`payment_methods: ${METHODS.length} ensured (pending Q-10)`);

/* ── services catalogue — from the approved prototype, AED → fils ──────── */
const SERVICES = [
  // Government transactions (govt fee passthrough + typing fee revenue)
  { name: "Emirates ID Renewal", govt: 270, service: 70, unit: "person" },
  { name: "Residency Visa — Renewal", govt: 1100, service: 150, unit: "person" },
  { name: "Residency Visa — New Application", govt: 2350, service: 200, unit: "person" },
  { name: "Trade License Renewal", govt: 1800, service: 300, unit: "license" },
  { name: "Labor Card — New", govt: 350, service: 100, unit: "person" },
  { name: "Labor Card — Renewal", govt: 300, service: 80, unit: "person" },
  { name: "Driving License — Renewal", govt: 300, service: 50, unit: "person" },
  { name: "Immigration Clearance Letter", govt: 200, service: 80, unit: "doc" },
  { name: "EID + Residency Bundle (Renewal)", govt: 756, service: 44, unit: "bundle" },
  // Typing-only (no govt fee, all revenue)
  { name: "Document Typing — Arabic", govt: 0, service: 30, unit: "page" },
  { name: "Document Typing — English", govt: 0, service: 25, unit: "page" },
  { name: "Photocopy + Stamping", govt: 0, service: 5, unit: "doc" },
  { name: "Document Translation", govt: 0, service: 80, unit: "page" },
];
let created = 0;
for (const s of SERVICES) {
  const r = await sql`insert into services (name, govt_fee, service_fee, unit)
    select ${s.name}, ${s.govt * 100}, ${s.service * 100}, ${s.unit}
    where not exists (select 1 from services where name = ${s.name})`;
  created += r.count;
}
console.log(`services: ${created} created, ${SERVICES.length - created} already present (unit fees in fils)`);

/* ── demo customers (--demo only; names invented, not from the prototype) ── */
if (DEMO) {
  const CUSTOMERS = [
    { type: "regular", name: "Al Noor Trading LLC", phone: "+971-4-3300000", trn: "100234567800003" },
    { type: "regular", name: "Gulf Star Contracting", phone: "+971-4-2210000", trn: "100765432100003" },
    { type: "regular", name: "Desert Rose Cafeteria", phone: "+971-50-7654321", trn: null },
    { type: "walk_in", name: "Imran S.", phone: null, trn: null },
    { type: "walk_in", name: "Fatima A.", phone: null, trn: null },
  ];
  let c = 0;
  for (const cu of CUSTOMERS) {
    const r = await sql`insert into customers (type, name, phone, trn)
      select ${cu.type}, ${cu.name}, ${cu.phone}, ${cu.trn}
      where not exists (select 1 from customers where name = ${cu.name} and type = ${cu.type})`;
    c += r.count;
  }
  console.log(`demo customers: ${c} created, ${CUSTOMERS.length - c} already present`);
}

console.log("seed complete.");
await sql.end();
