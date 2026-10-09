import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Comprueba la actualización en el mismo proyecto: versión 1 (migraciones 001 a 008) -> versión 2.

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`;
const GRANTS = `
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  grant all on all tables in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`;

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), MONITOR = id(2), LEADER = id(3), STUDENT = id(4), NEWBIE = id(5);

const root = join(__dirname, "..");
const v1Migrations = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

let db: PGlite;

async function as<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function attempt(sql: string): Promise<string> {
  try {
    await db.exec(sql);
    return "";
  } catch (e) {
    await db.exec("rollback").catch(() => {});
    return (e as Error).message;
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of v1Migrations) await db.exec(read(`migrations/${f}`));
  await db.exec(GRANTS);

  // Datos reales de la versión 1: cuentas, roles, teléfono y un grupo con asistencia
  for (const [uid, name] of [[ADMIN, "Admin"], [MONITOR, "Monitor"], [LEADER, "Líder"], [STUDENT, "Alumno"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      uid, `${uid}@test.local`, JSON.stringify({ full_name: name }),
    ]);
  }
  await db.exec(`
    update profiles set role = 'admin' where id = '${ADMIN}';
    update profiles set role = 'monitor' where id = '${MONITOR}';
    update profiles set role = 'lider', phone = '+56912345678' where id = '${LEADER}';

    insert into curriculums (id, name) values ('${id(100)}', 'Mujeres');
    insert into groups (id, curriculum_id, name, monitor_id, leader_id)
      values ('${id(101)}', '${id(100)}', 'Grupo v1', '${MONITOR}', '${LEADER}');
    insert into group_members (group_id, student_id) values ('${id(101)}', '${STUDENT}');
    insert into sessions (id, group_id, held_on, lesson_number) values ('${id(102)}', '${id(101)}', current_date, 1);
    insert into attendance (session_id, student_id, present) values ('${id(102)}', '${STUDENT}', true);
  `);
});

describe("actualización de la versión 1 a la 2", () => {
  it("la versión 1 de partida tiene sus tablas", async () => {
    const t = (await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('group_members', 'sessions', 'attendance')`
    )).rows[0];
    expect(t.n).toBe(3);
  });

  it("el esquema nuevo se niega a correr sobre la versión 1 y no cambia nada", async () => {
    const msg = await attempt(read("v2/001_schema.sql"));
    expect(msg).toContain("000_preparar_desde_v1");
    const col = (await db.query(`select 1 from information_schema.columns where table_name = 'role_history' and column_name = 'user_id'`)).rows;
    expect(col).toHaveLength(1);
    const types = (await db.query(`select 1 from pg_type where typname = 'audience'`)).rows;
    expect(types).toHaveLength(0);
  });

  it("el paso previo exige confirmación explícita y no cambia nada sin ella", async () => {
    const msg = await attempt(read("v2/000_preparar_desde_v1.sql"));
    expect(msg).toContain("Falta confirmar");
    const t = (await db.query(`select 1 from information_schema.tables where table_schema = 'public' and table_name = 'group_members'`)).rows;
    expect(t).toHaveLength(1);
  });

  it("con la confirmación, se actualiza completo", async () => {
    const prelude = read("v2/000_preparar_desde_v1.sql").replace("-- set app.confirmo_borrar_v1", "set app.confirmo_borrar_v1");
    expect(await attempt(prelude)).toBe("");
    expect(await attempt(read("v2/001_schema.sql"))).toBe("");
    await db.exec(GRANTS);
  });

  it("conserva las cuentas, los roles y el teléfono", async () => {
    const rows = (await db.query<{ id: string; role: string; phone: string | null; full_name: string }>(
      `select id, role, phone, full_name from profiles order by id`
    )).rows;
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.id === ADMIN)!.role).toBe("admin");
    expect(rows.find((r) => r.id === LEADER)!.phone).toBe("+56912345678");
    expect(rows.find((r) => r.id === STUDENT)!.full_name).toBe("Alumno");
  });

  it("conserva el historial de roles con la columna renombrada", async () => {
    const rows = (await db.query<{ to_role: string }>(
      `select to_role from role_history where person_id = $1 order by created_at`, [LEADER]
    )).rows;
    expect(rows.map((r) => r.to_role)).toEqual(["alumno", "lider"]);
  });

  it("las tablas de la versión 1 desaparecen y las de la versión 2 existen", async () => {
    const names = (await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`
    )).rows.map((r) => r.table_name);
    expect(names).not.toContain("group_members");
    expect(names).not.toContain("sessions");
    // contacts y lessons se vuelven a crear con el modelo nuevo
    const colsOf = async (t: string) =>
      (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = $1`, [t]))
        .rows.map((r) => r.column_name);
    expect(await colsOf("contacts")).toContain("person_id");
    expect(await colsOf("lessons")).toContain("cycle_id");
    for (const t of ["seasons", "cycles", "groups", "enrollments", "meetings", "attendance", "curriculum_coordinators"]) {
      expect(names).toContain(t);
    }
    const cols = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'groups'`
    )).rows.map((r) => r.column_name);
    expect(cols).toContain("cycle_id");
    expect(cols).not.toContain("curriculum_id");
  });

  it("el registro de personas nuevas sigue creando su perfil", async () => {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'n@test.local', '{"full_name":"Nueva"}')`, [NEWBIE]);
    const [p] = (await db.query<{ role: string; full_name: string }>(`select role, full_name from profiles where id = $1`, [NEWBIE])).rows;
    expect(p).toEqual({ role: "alumno", full_name: "Nueva" });
  });

  it("el flujo nuevo funciona sobre el proyecto actualizado", async () => {
    await db.exec(`
      update profiles set gender = 'mujer', birth_date = '1990-01-01', terms_accepted_at = now() where id = '${STUDENT}';
      insert into curriculums (id, name, audience) values ('${id(200)}', 'Mujeres v2', 'mujeres');
    `);
    // el líder todavía no es coordinador: la asignación debe rechazarse
    const bad = await attempt(`insert into curriculum_coordinators values ('${id(200)}', '${LEADER}')`);
    expect(bad).toContain("rol de coordinador");

    await db.exec(`
      insert into seasons (id, name, start_date, end_date, status) values ('${id(201)}', '2026', '2026-01-01', '2026-12-31', 'inscripciones');
      insert into cycles (id, curriculum_id, number) values ('${id(202)}', '${id(200)}', 1);
      insert into groups (id, season_id, cycle_id, name, leader_id, monitor_id)
        values ('${id(203)}', '${id(201)}', '${id(202)}', 'Grupo nuevo', '${LEADER}', '${MONITOR}');
    `);
    const [e] = await as<{ enroll: string }>(STUDENT, `select enroll($1) as enroll`, [id(203)]);
    expect(e.enroll).toBeTruthy();
    expect(await as(STUDENT, `select id from enrollments`)).toHaveLength(1);
    expect(await as(NEWBIE, `select id from enrollments`)).toHaveLength(0);
    expect(await as(LEADER, `select id from enrollments`)).toHaveLength(1);
  });

  it("repetir el esquema sobre un proyecto ya actualizado falla sin romper nada", async () => {
    const msg = await attempt(read("v2/001_schema.sql"));
    expect(msg).not.toBe("");
    const [{ n }] = (await db.query<{ n: number }>(`select count(*)::int as n from profiles`)).rows;
    expect(n).toBe(5);
  });
});
