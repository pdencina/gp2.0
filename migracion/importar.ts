// Importación de la plataforma antigua (MySQL) a Grupos Pequeños 2.0 (Supabase).
//
//   npx tsx migracion/importar.ts --respaldo migracion/datos/respaldo.sql            (simulación, no escribe nada)
//   npx tsx migracion/importar.ts --respaldo ... --muestra 20 --aplicar --si-estoy-seguro   (prueba con 20 grupos)
//   npx tsx migracion/importar.ts --respaldo ... --aplicar --si-estoy-seguro                (importación completa)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDump } from "./lib/mysqldump";
import { summarize, transform, type Plan } from "./lib/transform";
import { applyPlan, type AuthCreator } from "./lib/apply";

const here = dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Se queda con una muestra de N grupos (los más recientes) y todo lo que depende de ellos. */
export function sample(plan: Plan, groupCount: number): Plan {
  const seasonOrder = new Map(plan.seasons.map((s) => [s.id, s.startDate]));
  const groups = plan.groups
    .slice()
    .sort((a, b) => (seasonOrder.get(b.seasonId) ?? "").localeCompare(seasonOrder.get(a.seasonId) ?? ""))
    .slice(0, groupCount);
  const groupIds = new Set(groups.map((g) => g.id));
  const enrollments = plan.enrollments.filter((e) => groupIds.has(e.groupId));
  const enrollmentIds = new Set(enrollments.map((e) => e.id));
  const meetings = plan.meetings.filter((m) => groupIds.has(m.groupId));
  const meetingIds = new Set(meetings.map((m) => m.id));

  const emails = new Set<string>();
  enrollments.forEach((e) => emails.add(e.email));
  groups.forEach((g) => { if (g.leaderEmail) emails.add(g.leaderEmail); if (g.monitorEmail) emails.add(g.monitorEmail); });
  plan.coordinators.forEach((c) => emails.add(c.email));
  plan.persons.filter((p) => p.role === "admin").forEach((p) => emails.add(p.email));

  return {
    ...plan,
    persons: plan.persons.filter((p) => emails.has(p.email)),
    roleHistory: plan.roleHistory.filter((h) => emails.has(h.email)),
    groups,
    enrollments,
    meetings,
    attendance: plan.attendance.filter((a) => meetingIds.has(a.meetingId) && enrollmentIds.has(a.enrollmentId)),
  };
}

function loadEnv(file: string): Record<string, string> {
  if (!existsSync(file)) throw new Error(`Falta el archivo ${file} (ver migracion/LEEME.md)`);
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function authCreator(url: string, serviceKey: string): AuthCreator {
  return async ({ email, passwordHash, fullName }) => {
    const body: Record<string, unknown> = { email, email_confirm: true, user_metadata: { full_name: fullName } };
    if (passwordHash) body.password_hash = passwordHash;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify(body),
      });
      if (res.ok) return;
      const text = await res.text();
      if (res.status === 422 && /already|exists|registered/i.test(text)) return;
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw new Error(`No se pudo crear la cuenta (${res.status}): ${text.slice(0, 160)}`);
    }
    throw new Error("No se pudo crear la cuenta tras varios intentos");
  };
}

async function main() {
  const dumpPath = resolve(arg("respaldo") ?? join(here, "datos", "respaldo.sql"));
  if (!existsSync(dumpPath)) {
    console.error(`No encuentro el respaldo en ${dumpPath}\nExporta la base desde phpMyAdmin y guárdala ahí (ver migracion/LEEME.md).`);
    process.exit(1);
  }

  console.log(`Leyendo ${dumpPath} …`);
  const tables = parseDump(readFileSync(dumpPath, "utf8"));
  console.log(`Tablas leídas: ${Object.keys(tables).length} (${Object.values(tables).reduce((n, r) => n + r.length, 0)} filas)`);

  let plan = transform(tables);
  const muestra = Number(arg("muestra"));
  if (muestra > 0) plan = sample(plan, muestra);

  const summary = summarize(plan);
  const outDir = join(here, "salida");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "informe.json"), JSON.stringify(summary, null, 2));
  const csv = ["codigo,tabla,id_antiguo,detalle", ...plan.issues.map((i) => [i.code, i.table, i.oldId, JSON.stringify(i.detail ?? "")].join(","))];
  writeFileSync(join(outDir, "avisos.csv"), csv.join("\n"));
  console.log("\n=== Informe ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nDetalle en ${join(outDir, "informe.json")} y ${join(outDir, "avisos.csv")}`);

  if (!flag("aplicar")) {
    console.log("\nSimulación terminada: no se escribió nada. Para importar, agrega --aplicar --si-estoy-seguro.");
    return;
  }

  const env = loadEnv(join(here, ".env.migracion"));
  for (const k of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!env[k]) throw new Error(`Falta ${k} en migracion/.env.migracion`);
  }
  const host = new URL(env.SUPABASE_URL).host;
  console.log(`\nDestino: ${host}`);
  if (!flag("si-estoy-seguro")) {
    console.error("Por seguridad, agrega --si-estoy-seguro para confirmar que ese es el proyecto correcto.");
    process.exit(1);
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await applyPlan(plan, {
      db: client as unknown as Parameters<typeof applyPlan>[1]["db"],
      createAuthUser: authCreator(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
      log: (m) => console.log(m),
    });
    console.log("\n=== Importado ===");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("\nError:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
