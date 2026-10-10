// Importación de la plataforma antigua (MySQL) a Grupos Pequeños 2.0 (Supabase).
//
//   npx tsx migracion/importar.ts --respaldo migracion/datos/respaldo.sql            (simulación, no escribe nada)
//   npx tsx migracion/importar.ts --respaldo ... --muestra 20 --aplicar --si-estoy-seguro   (prueba con 20 grupos)
//   npx tsx migracion/importar.ts --respaldo ... --aplicar --si-estoy-seguro                (importación completa)
//   npx tsx migracion/importar.ts --respaldo ... --solo-nuevo --aplicar --si-estoy-seguro   (solo lo que falta; no pisa nada)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDump } from "./lib/mysqldump";
import { summarize, transform, type Plan } from "./lib/transform";
import { applyPlan } from "./lib/apply";
import { httpAuthCreator, httpRpc } from "./lib/http";

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
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!env[k]) throw new Error(`Falta ${k} en migracion/.env.migracion`);
  }
  const host = new URL(env.SUPABASE_URL).host;
  console.log(`\nDestino: ${host}`);
  if (flag("solo-nuevo")) console.log("Modo: SOLO LO NUEVO (no se modifica nada de lo ya cargado).");
  else console.log("Modo: importación completa (vuelve a escribir el estado de todo lo importado).");
  if (!flag("si-estoy-seguro")) {
    console.error("Por seguridad, agrega --si-estoy-seguro para confirmar que ese es el proyecto correcto.");
    process.exit(1);
  }

  const rechazadas: string[] = [];
  const result = await applyPlan(plan, {
    rpc: httpRpc(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    createAuthUser: httpAuthCreator(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    log: (m) => console.log(m),
    onlyNew: flag("solo-nuevo"),
    onRejected: (email, reason) => rechazadas.push(`${email},${JSON.stringify(reason)}`),
  });
  if (rechazadas.length) {
    const file = join(outDir, "cuentas-rechazadas.csv");
    writeFileSync(file, ["correo,motivo", ...rechazadas].join("\n"));
    console.log(`\nSe omitieron ${rechazadas.length} personas cuyo correo Supabase rechazó (lista en ${file}).`);
  }
  console.log("\n=== Importado ===");
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("\nError:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
