// Archivo histórico: guarda tal cual lo que la plataforma anterior tenía y el modelo nuevo no recoge.
//
//   npx tsx migracion/archivar.ts --respaldo migracion/datos/respaldo.sql                    (simulación: cuenta lo que guardaría)
//   npx tsx migracion/archivar.ts --respaldo ... --aplicar --si-estoy-seguro                  (guarda; repetirlo no cambia nada)
//   Opcionales:  --incluir-financiero   aportes económicos (loveofhouses, banckings, accounts)
//                --incluir-asistencia-cruda   las más de 500 mil marcas de asistencia sin procesar
//                --incluir-dni   el documento de identidad de las personas (por defecto se omite)
// Nunca se guardan las contraseñas ni los datos de sesión.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDump } from "./lib/mysqldump";
import { archiveAll, archivePlan, type ArchiveOptions } from "./lib/archive";
import { httpRpc } from "./lib/http";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

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
    console.error(`No encuentro el respaldo en ${dumpPath}`);
    process.exit(1);
  }
  const opts: ArchiveOptions = { financial: flag("incluir-financiero"), rawAttendance: flag("incluir-asistencia-cruda"), dni: flag("incluir-dni") };

  console.log(`Leyendo ${dumpPath} …`);
  const plan = archivePlan(parseDump(readFileSync(dumpPath, "utf8")), opts);
  console.log("\nSe archivaría:");
  for (const b of plan) console.log(`  ${b.table.padEnd(24)} ${String(b.rows.length).padStart(8)} filas`);
  console.log(`  ${"TOTAL".padEnd(24)} ${String(plan.reduce((n, b) => n + b.rows.length, 0)).padStart(8)} filas`);
  console.log(`\nFinancieros: ${opts.financial ? "SÍ" : "no"} · Asistencia cruda: ${opts.rawAttendance ? "SÍ" : "no"} · Documento de identidad: ${opts.dni ? "SÍ" : "no"} · Contraseñas: nunca`);

  if (!flag("aplicar")) {
    console.log("\nSimulación terminada: no se escribió nada. Para guardar, agrega --aplicar --si-estoy-seguro.");
    return;
  }
  const env = loadEnv(join(here, ".env.migracion"));
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!env[k]) throw new Error(`Falta ${k} en migracion/.env.migracion`);
  console.log(`\nDestino: ${new URL(env.SUPABASE_URL).host}`);
  if (!flag("si-estoy-seguro")) {
    console.error("Por seguridad, agrega --si-estoy-seguro para confirmar que ese es el proyecto correcto.");
    process.exit(1);
  }
  const result = await archiveAll(plan, httpRpc(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY), (m) => console.log(m));
  console.log("\n=== Archivado ===");
  console.log(`Filas leídas: ${result.reduce((n, r) => n + r.leidas, 0)} · filas nuevas guardadas: ${result.reduce((n, r) => n + r.nuevas, 0)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("\nError:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
