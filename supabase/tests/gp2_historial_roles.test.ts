import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Historial de roles (016): misma regla de acceso que antes, evaluada una vez por consulta y solo con sesión

const STUBS = `
  create role anon nologin; create role authenticated nologin; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;
const GRANTS = `
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  grant all on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to authenticated;
`;
const sql = (f: string) => readFileSync(join(__dirname, "../v2", f), "utf8");
const ALL = [
  "001_schema.sql", "004_rendimiento.sql", "005_panel.sql", "006_gp2_nucleo.sql", "007_catalogo.sql", "008_calendario.sql",
  "009_biblioteca.sql", "010_certificados.sql", "011_habilitacion.sql", "016_historial_de_roles_rapido.sql",
];

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), LEADER = id(2), STUDENT = id(3), OTHER = id(4);
const CUR = id(100), SEASON = id(102), GROUP = id(200);

let db: PGlite;
async function ids(role: "anon" | "authenticated", uid: string, q = `select distinct person_id from role_history`) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query<{ person_id: string }>(q)).rows.map((r) => r.person_id).sort();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  for (const f of ALL) await db.exec(sql(f));
  await db.exec(GRANTS);
  for (const [uid, name] of [[ADMIN, "Admin"], [LEADER, "Líder"], [STUDENT, "Alumna"], [OTHER, "Otra persona"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [uid, `${uid}@t.l`, JSON.stringify({ full_name: name })]);
  }
  await db.query(`update profiles set role = 'admin' where id = $1`, [ADMIN]);
  await db.query(`update profiles set role = 'lider' where id = $1`, [LEADER]);
  await db.exec(`set app.skip_checks = 'on'`);
  await db.query(`insert into curriculums (id, name, audience, default_capacity, max_absences) values ($1, 'Programa', 'todos', 15, 3)`, [CUR]);
  await db.query(`insert into seasons (id, name, start_date, end_date, status) values ($1, 'T', current_date - 30, current_date + 300, 'en_curso')`, [SEASON]);
  await db.query(
    `insert into groups (id, season_id, curriculum_id, version_id, name, status, leader_id, weekday, start_time, capacity, modality)
     values ($1, $2, $3, (select id from curriculum_versions where curriculum_id = $3 limit 1), 'G', 'en_curso', $4, 2, '19:00', 15, 'virtual')`,
    [GROUP, SEASON, CUR, LEADER]);
  await db.query(`insert into enrollments (person_id, group_id, curriculum_id, status, enrolled_at) values ($1, $2, $3, 'en_curso', now())`, [STUDENT, GROUP, CUR]);
  await db.exec(`set app.skip_checks = 'off'`);
});

describe("historial de roles", () => {
  it("cada persona ve el suyo y no el de quien no tiene relación con ella", async () => {
    expect(await ids("authenticated", OTHER)).toEqual([OTHER]);
  });

  it("el líder ve a quienes están en su grupo, y quien está en el grupo ve a su líder", async () => {
    expect(await ids("authenticated", LEADER)).toEqual([LEADER, STUDENT].sort());
    expect(await ids("authenticated", STUDENT)).toEqual([LEADER, STUDENT].sort());
  });

  it("el administrador ve todo", async () => {
    expect(await ids("authenticated", ADMIN)).toEqual([ADMIN, LEADER, STUDENT, OTHER].sort());
  });

  it("sin sesión no se ve nada, y responde sin error", async () => {
    expect(await ids("anon", "")).toEqual([]);
  });

  it("da exactamente el mismo resultado que la regla de antes (can_see_profile) para cada persona", async () => {
    for (const viewer of [ADMIN, LEADER, STUDENT, OTHER]) {
      const antes = await ids("authenticated", viewer, `select distinct person_id from (select person_id from role_history where can_see_profile(person_id)) x`);
      const ahora = await ids("authenticated", viewer);
      expect(ahora, `visto por ${viewer}`).toEqual(antes);
    }
  });

  it("la migración se puede repetir", async () => {
    await db.exec(sql("016_historial_de_roles_rapido.sql"));
    expect(await ids("authenticated", OTHER)).toEqual([OTHER]);
  });
});
