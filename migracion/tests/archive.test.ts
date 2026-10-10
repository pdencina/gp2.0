import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseDump, type Row } from "../lib/mysqldump";
import { archiveAll, archivePlan, sanitize, tablesToArchive } from "../lib/archive";
import type { Rpc } from "../lib/apply";
import { OLD_DB, toDump } from "./fixture";

// Archivo histórico: cada fila antigua se guarda tal cual y nada se pierde ni se sobrescribe

const EXTRA: Record<string, Row[]> = {
  ...OLD_DB,
  matrimonios: [{ id: 1, temporada_id: 1, grupopequeno_id: 1, usermatrimonio0_id: 1, usermatrimonio1_id: 2 }],
  evaluations: [{ id: 1, monitor_id: 1, obs: "Muy buen líder" }],
  loveofhouses: [{ id: 1, inscripcion_id: 1, monto: 20000, motivo: "Aporte" }],
  asistencias: [{ id: 1, inscripcion_id: 1, status: 1 }],
  password_resets: [{ email: "ana@x.cl", token: "secreto" }],
  campus: [{ id: 1, name: "Virtual" }, { id: 2, name: "Puente Alto" }],
};
const tables = () => parseDump(toDump(EXTRA));

describe("qué se archiva", () => {
  it("por defecto guarda lo operativo y lo que el modelo nuevo no tiene, pero no lo financiero ni la asistencia cruda", () => {
    const names = archivePlan(tables()).map((b) => b.table);
    expect(names).toEqual(expect.arrayContaining(["users", "liders", "inscripcions", "matrimonios", "evaluations", "campus"]));
    expect(names).not.toContain("loveofhouses");
    expect(names).not.toContain("asistencias");
  });

  it("lo financiero y la asistencia cruda solo entran si se piden", () => {
    const names = archivePlan(tables(), { financial: true, rawAttendance: true }).map((b) => b.table);
    expect(names).toEqual(expect.arrayContaining(["loveofhouses", "asistencias"]));
  });

  it("nunca guarda tablas de sesión ni de recuperación de contraseña", () => {
    expect(tablesToArchive({ financial: true, rawAttendance: true })).not.toContain("password_resets");
    expect(archivePlan(tables(), { financial: true, rawAttendance: true }).map((b) => b.table)).not.toContain("password_resets");
  });

  it("nunca guarda contraseñas ni, por defecto, el documento de identidad", () => {
    const row: Row = { id: 5, email: "a@x.cl", name: "Ana", dni: "12.345.678-9", password: "$2y$10$abc", remember_token: "t" };
    expect(sanitize(row)).toEqual({ id: 5, email: "a@x.cl", name: "Ana" });
    expect(sanitize(row, { dni: true })).toEqual({ id: 5, email: "a@x.cl", name: "Ana", dni: "12.345.678-9" });
  });

  it("todas las filas de una tabla archivada se conservan sin cambios (salvo lo que nunca se guarda)", () => {
    const t = tables();
    const plan = archivePlan(t);
    for (const b of plan) expect(b.rows).toHaveLength(t[b.table].length);
    const users = plan.find((b) => b.table === "users")!.rows;
    expect(users.some((r) => "password" in r)).toBe(false);
    expect(users[0].email).toBe(t.users[0].email);
  });
});

describe("si falta instalar el archivo", () => {
  it("avisa con claridad y no envía ningún dato", async () => {
    const sent: string[] = [];
    const missing: Rpc = async (fn, args) => {
      sent.push(`${fn}:${String(args.p_table)}`);
      throw new Error(`${fn}: 404 {"code":"PGRST202","message":"Could not find the function"}`);
    };
    await expect(archiveAll(archivePlan(tables()), missing)).rejects.toThrow(/015_archivo_historico\.sql[\s\S]*No se envió ningún dato/);
    expect(sent).toEqual(["archive_legacy_rows:_prueba"]); // solo la prueba con lista vacía
  });

  it("otros errores no se disfrazan", async () => {
    const boom: Rpc = async () => { throw new Error("archive_legacy_rows: 401 sin permiso"); };
    await expect(archiveAll(archivePlan(tables()), boom)).rejects.toThrow(/401/);
  });
});

// ---- contra una base real ----
const STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;
const GRANTS = `
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  grant execute on all functions in schema public to authenticated;
`;
const sql = (f: string) => readFileSync(join(__dirname, "../../supabase/v2", f), "utf8");
const MIGRATIONS = [
  "001_schema.sql", "004_rendimiento.sql", "005_panel.sql", "006_gp2_nucleo.sql", "007_catalogo.sql", "008_calendario.sql",
  "009_biblioteca.sql", "010_certificados.sql", "011_habilitacion.sql", "015_archivo_historico.sql",
];
const ADMIN = "00000000-0000-0000-0000-000000000001";
const ALUMNA = "00000000-0000-0000-0000-000000000002";

let db: PGlite;
const rpc: Rpc = async (fn, args) => {
  const r = await db.query<Record<string, unknown>>(`select ${fn}($1, $2::jsonb) as v`, [args.p_table, JSON.stringify(args.p_rows)]);
  return r.rows[0].v;
};
async function as<T = Record<string, unknown>>(uid: string, q: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query<T>(q, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

describe("el archivo en la base de datos", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(STUBS);
    for (const f of MIGRATIONS) await db.exec(sql(f));
    await db.exec(GRANTS);
    // GRANTS concede todo a "authenticated" para simplificar las pruebas; la protección real es la que dejó la migración
    await db.exec(`revoke execute on function archive_legacy_rows(text, jsonb) from authenticated, anon, public`);
    for (const [uid, mail, name] of [[ADMIN, "admin@x.cl", "Admin"], [ALUMNA, "ana@x.cl", "Ana"]]) {
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [uid, mail, JSON.stringify({ full_name: name })]);
    }
    await db.query(`update profiles set role = 'admin' where id = $1`, [ADMIN]);
  });

  const plan = () => archivePlan(tables(), { financial: true });

  it("guarda todas las filas del plan", async () => {
    const result = await archiveAll(plan(), rpc);
    const leidas = result.reduce((n, r) => n + r.leidas, 0);
    expect(result.reduce((n, r) => n + r.nuevas, 0)).toBe(leidas);
    const [{ n }] = (await db.query<{ n: number }>(`select count(*)::int n from legacy_archive`)).rows;
    expect(n).toBe(leidas);
  });

  it("guarda la fila tal cual (con sus campos originales) y sin contraseñas", async () => {
    const [m] = (await db.query<{ data: Record<string, unknown> }>(`select data from legacy_archive where source_table = 'matrimonios' and source_id = '1'`)).rows;
    expect(m.data).toMatchObject({ usermatrimonio0_id: 1, usermatrimonio1_id: 2 });
    const passwords = (await db.query(`select 1 from legacy_archive where data ? 'password' or data ? 'remember_token'`)).rows;
    expect(passwords).toHaveLength(0);
    const resets = (await db.query(`select 1 from legacy_archive where source_table = 'password_resets'`)).rows;
    expect(resets).toHaveLength(0);
  });

  it("repetir el archivado no duplica ni cambia nada", async () => {
    const before = (await db.query(`select source_table, source_id, data::text, archived_at from legacy_archive order by 1, 2`)).rows;
    const result = await archiveAll(plan(), rpc);
    expect(result.reduce((n, r) => n + r.nuevas, 0)).toBe(0);
    const after = (await db.query(`select source_table, source_id, data::text, archived_at from legacy_archive order by 1, 2`)).rows;
    expect(after).toEqual(before);
  });

  it("una fila ya archivada no se sobrescribe aunque el respaldo cambie", async () => {
    await rpc("archive_legacy_rows", { p_table: "matrimonios", p_rows: [{ id: 1, usermatrimonio0_id: 999 }] });
    const [m] = (await db.query<{ data: Record<string, unknown> }>(`select data from legacy_archive where source_table = 'matrimonios' and source_id = '1'`)).rows;
    expect(m.data.usermatrimonio0_id).toBe(1);
  });

  it("las filas sin identificador también se guardan, sin duplicarse al repetir", async () => {
    const rows = [{ nombre: "A" }, { nombre: "B" }];
    expect(await rpc("archive_legacy_rows", { p_table: "sin_id", p_rows: rows })).toBe(2);
    expect(await rpc("archive_legacy_rows", { p_table: "sin_id", p_rows: rows })).toBe(0);
  });

  it("solo el administrador ve el archivo", async () => {
    const resumen = await as<{ source_table: string; filas: string }>(ADMIN, `select * from legacy_archive_summary()`);
    expect(Number(resumen.find((r) => r.source_table === "matrimonios")?.filas)).toBe(1);
    await expect(as(ALUMNA, `select * from legacy_archive_summary()`)).rejects.toThrow(/administrador/);
    expect(await as(ALUMNA, `select * from legacy_archive`)).toHaveLength(0);
    expect((await as(ADMIN, `select * from legacy_archive`)).length).toBeGreaterThan(0);
  });

  it("nadie que no sea la clave de importación puede escribir", async () => {
    await expect(as(ADMIN, `select archive_legacy_rows('x', '[{"id":1}]'::jsonb)`)).rejects.toThrow();
    await expect(as(ADMIN, `insert into legacy_archive (source_table, source_id, data) values ('x', '1', '{}')`)).rejects.toThrow(/permission denied|row-level security/);
  });

  it("el administrador consulta la ficha antigua de una persona por su correo", async () => {
    const r = await as<{ source_table: string; data: Record<string, unknown> }>(ADMIN, `select * from legacy_for_person($1)`, [ALUMNA]);
    expect(r.map((x) => x.source_table)).toContain("users");
    expect(r.every((x) => String(x.data.email).toLowerCase() === "ana@x.cl")).toBe(true);
    await expect(as(ALUMNA, `select * from legacy_for_person($1)`, [ALUMNA])).rejects.toThrow(/administrador/);
  });

  it("la migración se puede repetir", async () => {
    const before = (await db.query<{ n: number }>(`select count(*)::int n from legacy_archive`)).rows[0].n;
    await db.exec(sql("015_archivo_historico.sql"));
    expect((await db.query<{ n: number }>(`select count(*)::int n from legacy_archive`)).rows[0].n).toBe(before);
  });
});
