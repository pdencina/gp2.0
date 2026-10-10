import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Reencuentro (014_reencuentro.sql): quién se alejó, quién lo ve y cómo se anota el contacto

const STUBS = `
  create role anon nologin; create role authenticated nologin; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;
const GRANTS = `
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  grant all on all tables in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`;
const sql = (f: string) => readFileSync(join(__dirname, "../v2", f), "utf8");
const ALL = [
  "001_schema.sql", "004_rendimiento.sql", "005_panel.sql", "006_gp2_nucleo.sql", "007_catalogo.sql", "008_calendario.sql",
  "009_biblioteca.sql", "010_certificados.sql", "011_habilitacion.sql", "013_sedes_por_lote.sql", "014_reencuentro.sql",
];

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), COORD = id(2), LEADER = id(3), OTHER_LEADER = id(4), PASTOR = id(5), STUDENT = id(6);
const P = (n: number) => id(10 + n);
const CUR = id(100), SEASON = id(102);
let VER = "";
const G = (n: number) => id(200 + n);

let db: PGlite;
let PA = "", SCL = "";

async function as<T = Record<string, unknown>>(uid: string, q: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query<T>(q, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const list = (uid: string, args = "") => as<{ person_name: string; stage: string; months_away: number; total: string; ce_id: string }>(
  uid, `select * from reengagement_list(${args})`);
const names = (rows: { person_name: string }[]) => rows.map((r) => r.person_name).sort();

// Persona p con una inscripción curricular y un grupo que terminó hace `monthsAgo` meses
async function dormant(p: string, groupId: string, leader: string | null, monthsAgo: number, opts: { campus?: string; status?: string; result?: string } = {}) {
  await db.exec(`set app.skip_checks = 'on'`);
  await db.query(
    `insert into groups (id, season_id, curriculum_id, version_id, name, status, leader_id, campus_id, weekday, start_time, capacity, modality)
     values ($1, $2, $3, $4, $5, 'finalizado', $6, $7, 2, '19:00', 15, 'virtual')`,
    [groupId, SEASON, CUR, VER, `Grupo ${groupId.slice(-3)}`, leader, opts.campus ?? null]);
  const end = `current_date - interval '${monthsAgo} months'`;
  const ce = (await db.query<{ id: string }>(
    `insert into curriculum_enrollments (person_id, curriculum_id, version_id, status, started_at, paused_at)
     values ($1, $2, $3, $4, ${end} - interval '4 months', ${end}) returning id`, [p, CUR, VER, opts.status ?? "pausado"])).rows[0].id;
  await db.query(
    `insert into enrollments (person_id, group_id, curriculum_id, curriculum_enrollment_id, status, enrolled_at, closed_at)
     values ($1, $2, $3, $4, $5, ${end} - interval '4 months', ${end})`,
    [p, groupId, CUR, ce, opts.result ?? "no_completo"]);
  await db.exec(`set app.skip_checks = 'off'`);
  return ce;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  for (const f of ALL) await db.exec(sql(f));
  await db.exec(GRANTS);
  const people: [string, string][] = [[ADMIN, "Admin"], [COORD, "Coordinadora"], [LEADER, "Líder A"], [OTHER_LEADER, "Líder B"], [PASTOR, "Pastor"], [STUDENT, "Estudiante"],
    ...Array.from({ length: 8 }, (_, i) => [P(i + 1), `Persona ${i + 1}`] as [string, string])];
  for (const [uid, name] of people) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [uid, `${uid}@t.l`, JSON.stringify({ full_name: name })]);
  }
  await db.query(`update profiles set role = 'admin' where id = $1`, [ADMIN]);
  await db.query(`update profiles set role = 'coordinador' where id = $1`, [COORD]);
  await db.query(`update profiles set role = 'lider' where id in ($1, $2)`, [LEADER, OTHER_LEADER]);
  PA = (await q<{ id: string }>(`select id from campuses where name = 'Puente Alto'`))[0].id;
  SCL = (await q<{ id: string }>(`select id from campuses where name = 'Santiago centro'`))[0].id;
  await db.query(`insert into campus_pastors (person_id, campus_id) values ($1, $2)`, [PASTOR, PA]);

  await db.exec(`set app.skip_checks = 'on'`);
  await db.query(`insert into curriculums (id, name, audience, default_capacity, max_absences) values ($1, 'Programa', 'todos', 15, 3)`, [CUR]);
  await db.query(`insert into curriculum_coordinators (curriculum_id, coordinator_id) values ($1, $2)`, [CUR, COORD]);
  await db.query(`insert into seasons (id, name, start_date, end_date, status) values ($1, 'T', current_date - 800, current_date + 300, 'en_curso')`, [SEASON]);
  await db.exec(`set app.skip_checks = 'off'`);
  // 006 crea la versión del currículum al insertarlo: se usa esa
  VER = (await q<{ id: string }>(`select id from curriculum_versions where curriculum_id = $1 order by version limit 1`, [CUR]))[0].id;

  // P1: se alejó hace 8 meses, líder A, Puente Alto
  await dormant(P(1), G(1), LEADER, 8, { campus: PA });
  // P2: hace 14 meses, líder B, Santiago
  await dormant(P(2), G(2), OTHER_LEADER, 14, { campus: SCL });
  // P3: hace 1 mes (reciente: no cuenta con el mínimo de 3 meses)
  await dormant(P(3), G(3), LEADER, 1, { campus: PA });
  // P4: hace 30 meses, líder A, sin sede
  await dormant(P(4), G(4), LEADER, 30);
});

describe("quién se considera alejado", () => {
  it("el administrador ve a quienes llevan 3 meses o más sin actividad, de más reciente a más antiguo", async () => {
    const r = await list(ADMIN);
    expect(r.map((x) => x.person_name)).toEqual(["Persona 1", "Persona 2", "Persona 4"]);
    expect(Number(r[0].total)).toBe(3);
    expect(r[0].months_away).toBeGreaterThanOrEqual(7);
  });

  it("el mínimo de meses se puede cambiar", async () => {
    expect(names(await list(ADMIN, "p_months => 12"))).toEqual(["Persona 2", "Persona 4"]);
    expect(names(await list(ADMIN, "p_months => 0"))).toEqual(["Persona 1", "Persona 2", "Persona 3", "Persona 4"]);
  });

  it("quien tiene hoy un grupo vigente no aparece", async () => {
    await db.exec(`set app.skip_checks = 'on'`);
    await db.query(`insert into groups (id, season_id, curriculum_id, version_id, name, status, leader_id, campus_id, weekday, start_time, capacity, modality)
                    values ($1, $2, $3, (select version_id from groups where id = $4), 'Vigente', 'en_curso', $5, $6, 3, '19:00', 15, 'virtual')`,
      [G(50), SEASON, CUR, G(1), LEADER, PA]);
    const ce = (await q<{ id: string }>(`select id from curriculum_enrollments where person_id = $1`, [P(1)]))[0].id;
    await db.query(`insert into enrollments (person_id, group_id, curriculum_id, curriculum_enrollment_id, status, enrolled_at) values ($1, $2, $3, $4, 'en_curso', now())`,
      [P(1), G(50), CUR, ce]);
    await db.exec(`set app.skip_checks = 'off'`);
    expect(names(await list(ADMIN))).toEqual(["Persona 2", "Persona 4"]);
    // vuelve a quedar como antes para las otras pruebas
    await db.query(`delete from enrollments where group_id = $1`, [G(50)]);
    await db.query(`delete from groups where id = $1`, [G(50)]);
  });

  it("quien completó el programa no aparece", async () => {
    await db.query(`update curriculum_enrollments set status = 'completado', completed_at = current_date where person_id = $1`, [P(2)]);
    expect(names(await list(ADMIN))).toEqual(["Persona 1", "Persona 4"]);
    await db.query(`update curriculum_enrollments set status = 'pausado', completed_at = null where person_id = $1`, [P(2)]);
  });

  it("una cuenta desactivada no aparece", async () => {
    await db.query(`update profiles set active = false where id = $1`, [P(4)]);
    expect(names(await list(ADMIN))).toEqual(["Persona 1", "Persona 2"]);
    await db.query(`update profiles set active = true where id = $1`, [P(4)]);
  });
});

describe("quién ve a quién", () => {
  it("un líder ve solo a quienes pasaron por sus grupos", async () => {
    expect(names(await list(LEADER))).toEqual(["Persona 1", "Persona 4"]);
    expect(names(await list(OTHER_LEADER))).toEqual(["Persona 2"]);
  });

  it("la coordinadora ve a todas las personas de su programa", async () => {
    expect(names(await list(COORD))).toEqual(["Persona 1", "Persona 2", "Persona 4"]);
  });

  it("el pastor ve solo a las personas de su sede", async () => {
    expect(names(await list(PASTOR))).toEqual(["Persona 1"]);
  });

  it("un alumno no puede usar el reencuentro", async () => {
    await expect(list(STUDENT)).rejects.toThrow(/acompañan/);
    await expect(as(STUDENT, `select * from reengagement_summary()`)).rejects.toThrow(/acompañan/);
  });

  it("nadie ve su propia ficha como alejada", async () => {
    await dormant(LEADER, G(60), OTHER_LEADER, 9, { campus: PA });
    expect(names(await list(LEADER))).not.toContain("Líder A");
    expect(names(await list(ADMIN))).toContain("Líder A");
    await db.query(`delete from enrollments where person_id = $1`, [LEADER]);
    await db.query(`delete from curriculum_enrollments where person_id = $1`, [LEADER]);
  });

  it("la tabla de contactos no se lee ni se escribe directamente (seguridad por filas)", async () => {
    const ce = (await q<{ id: string }>(`select id from curriculum_enrollments where person_id = $1`, [P(1)]))[0].id;
    const ins = `insert into outreach_log (curriculum_enrollment_id, kind, outcome) values ($1, 'mensaje', 'sin_respuesta')`;
    await db.query(ins, [ce]);
    expect(await q(`select * from outreach_log`)).toHaveLength(1); // existe para quien tiene acceso total
    expect(await as(LEADER, `select * from outreach_log`)).toHaveLength(0); // y nadie más lo ve por la tabla
    await expect(as(LEADER, ins, [ce])).rejects.toThrow(/row-level security/);
    await db.query(`delete from outreach_log`);
  });
});

describe("registrar el contacto", () => {
  const ceOf = async (p: string) => (await q<{ id: string }>(`select id from curriculum_enrollments where person_id = $1`, [p]))[0].id;

  it("un líder anota un contacto de una persona que ya no está en ningún grupo", async () => {
    const ce = await ceOf(P(1));
    const [{ log_outreach }] = await as<{ log_outreach: string }>(LEADER, `select log_outreach($1, 'mensaje', 'sin_respuesta', 'Le escribí por WhatsApp')`, [ce]);
    expect(log_outreach).toBeTruthy();
    const h = await as<{ outcome: string; note: string; by_name: string }>(LEADER, `select * from reengagement_history($1)`, [ce]);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ outcome: "sin_respuesta", note: "Le escribí por WhatsApp", by_name: "Líder A" });
  });

  it("quien no tiene relación con la persona no puede anotar ni ver", async () => {
    const ce = await ceOf(P(1));
    await expect(as(OTHER_LEADER, `select log_outreach($1, 'llamada', 'sin_respuesta')`, [ce])).rejects.toThrow(/permiso/);
    await expect(as(OTHER_LEADER, `select * from reengagement_history($1)`, [ce])).rejects.toThrow(/permiso/);
  });

  it("después de un 'sin respuesta' reciente la persona queda esperando y sale de 'por contactar'", async () => {
    const por = names(await list(LEADER));
    expect(por).toEqual(["Persona 4"]);
    const esperando = await list(LEADER, "p_stage => 'esperando'");
    expect(names(esperando)).toEqual(["Persona 1"]);
    expect(names(await list(LEADER, "p_stage => 'todas'"))).toEqual(["Persona 1", "Persona 4"]);
  });

  it("'quiere volver' deja a la persona en camino; 'no continuará' la cierra", async () => {
    await as(LEADER, `select log_outreach($1, 'llamada', 'quiere_volver', 'Volverá en marzo')`, [await ceOf(P(1))]);
    expect((await list(LEADER, "p_stage => 'en_camino'")).map((r) => r.person_name)).toEqual(["Persona 1"]);
    await as(LEADER, `select log_outreach($1, 'visita', 'no_continuara', 'Se mudó de ciudad')`, [await ceOf(P(4))]);
    expect((await list(LEADER, "p_stage => 'cerrado'")).map((r) => r.person_name)).toEqual(["Persona 4"]);
    expect(await list(LEADER)).toHaveLength(0);
  });

  it("'más adelante' agenda un seguimiento a 30 días por defecto", async () => {
    const ce = await ceOf(P(2));
    await as(COORD, `select log_outreach($1, 'mensaje', 'mas_adelante')`, [ce]);
    const r = await list(COORD, "p_stage => 'agendado'");
    expect(r.map((x) => x.person_name)).toEqual(["Persona 2"]);
    const [{ follow_up_on }] = await q<{ follow_up_on: string }>(`select to_char(follow_up_on, 'YYYY-MM-DD') as follow_up_on from outreach_log where curriculum_enrollment_id = $1`, [ce]);
    const days = Math.round((Date.parse(follow_up_on) - Date.now()) / 86400000);
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("valida el tipo, el resultado, la nota y la fecha", async () => {
    const ce = await ceOf(P(2));
    await expect(as(COORD, `select log_outreach($1, 'telepatia', 'sin_respuesta')`, [ce])).rejects.toThrow(/tipo/);
    await expect(as(COORD, `select log_outreach($1, 'mensaje', 'tal vez')`, [ce])).rejects.toThrow(/resultado/);
    await expect(as(COORD, `select log_outreach($1, 'mensaje', 'sin_respuesta', $2)`, [ce, "x".repeat(501)])).rejects.toThrow(/larga/);
    await expect(as(COORD, `select log_outreach($1, 'mensaje', 'mas_adelante', null, current_date - 1)`, [ce])).rejects.toThrow(/pasado/);
  });

  it("el resumen cuenta por antigüedad y por etapa", async () => {
    const [s] = await as<Record<string, number>>(ADMIN, `select * from reengagement_summary()`);
    expect(s.total).toBe(3);
    expect(s.m6_12).toBe(1); // Persona 1 (8 meses)
    expect(s.m12_24).toBe(1); // Persona 2 (14 meses)
    expect(s.m24_mas).toBe(1); // Persona 4 (30 meses)
    expect(s.en_camino).toBe(1);
    expect(s.cerrado).toBe(1);
    expect(s.agendado).toBe(1);
    expect(s.por_contactar).toBe(0);
    expect(s.contactados_30d).toBe(3);
    expect(s.recuperados).toBe(0);
  });

  it("cuenta como recuperada a quien asiste a una reunión después del contacto", async () => {
    const ce = await ceOf(P(1));
    await db.exec(`set app.skip_checks = 'on'`);
    await db.query(`insert into groups (id, season_id, curriculum_id, version_id, name, status, leader_id, campus_id, weekday, start_time, capacity, modality)
                    values ($1, $2, $3, (select version_id from groups where id = $4), 'Nuevo', 'en_curso', $5, $6, 3, '19:00', 15, 'virtual')`,
      [G(70), SEASON, CUR, G(1), LEADER, PA]);
    const enr = (await q<{ id: string }>(
      `insert into enrollments (person_id, group_id, curriculum_id, curriculum_enrollment_id, status, enrolled_at) values ($1, $2, $3, $4, 'en_curso', now()) returning id`,
      [P(1), G(70), CUR, ce]))[0].id;
    const m = (await q<{ id: string }>(`insert into meetings (group_id, held_on, status) values ($1, current_date + 1, 'realizada') returning id`, [G(70)]))[0].id;
    await db.query(`insert into attendance (meeting_id, enrollment_id, status) values ($1, $2, 'presente')`, [m, enr]);
    await db.exec(`set app.skip_checks = 'off'`);
    const [s] = await as<Record<string, number>>(ADMIN, `select * from reengagement_summary()`);
    expect(s.recuperados).toBe(1);
    expect(s.total).toBe(2); // ya no está alejada
  });
});

describe("al volver a entrar", () => {
  it("la persona ve los caminos que dejó y siguen guardados", async () => {
    const r = await as<{ curriculum: string; months_away: number }>(P(2), `select * from my_comeback()`);
    expect(r).toHaveLength(1);
    expect(r[0].curriculum).toBe("Programa");
    expect(r[0].months_away).toBeGreaterThanOrEqual(13);
  });

  it("quien dejó su camino hace menos de un mes no recibe el mensaje", async () => {
    await db.query(`update curriculum_enrollments set paused_at = current_date - 5, started_at = current_date - 40 where person_id = $1`, [P(3)]);
    await db.query(`update enrollments set closed_at = now() - interval '5 days' where person_id = $1`, [P(3)]);
    expect(await as(P(3), `select * from my_comeback()`)).toHaveLength(0);
  });

  it("solo ve lo suyo", async () => {
    const r = await as<{ ce_id: string }>(P(5), `select * from my_comeback()`);
    expect(r).toHaveLength(0);
  });
});
