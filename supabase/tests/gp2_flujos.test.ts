import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// GP 2.0 · Fase 6: los flujos de la especificación (F1 a F8), de principio a fin, contra el esquema completo,
// más las comprobaciones estructurales de seguridad y la reconciliación.

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
  grant execute on function verify_certificate(text) to anon;
`;
const sql = (f: string) => readFileSync(join(__dirname, "../v2", f), "utf8");
const ALL = [
  "001_schema.sql", "004_rendimiento.sql", "005_panel.sql", "006_gp2_nucleo.sql", "007_catalogo.sql",
  "008_calendario.sql", "009_biblioteca.sql", "010_certificados.sql", "011_habilitacion.sql", "014_reencuentro.sql",
];

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), COORD = id(2), PASTOR = id(3), LEADER = id(4), BACKUP = id(5), LEADER2 = id(6);
const P1 = id(11), P2 = id(12), P3 = id(13), P4 = id(14), P5 = id(15), P6 = id(16);
const LM = id(100), HOM = id(101), RUN = id(102), PROG0 = id(103);
const SEASON_A = id(110), SEASON_B = id(111);
const LM_CY = id(320), HOM_CY1 = id(321), HOM_CY2 = id(322), HOM_CY3 = id(323), P0_CY = id(324);
const lm = (n: number) => id(300 + n); // unidades 1..18 de Libro Morado
const hom = (n: number) => id(330 + n); // unidades 0..8 de AR Hombres (3 por año)
const GP_PRES = id(400), GP_VIRT = id(401), GP_HOM = id(402), GP_RUN = id(403), GP_V2 = id(404), GP25 = id(405);
const PEOPLE: [string, string][] = [
  [ADMIN, "Admin"], [COORD, "Coordinador"], [PASTOR, "Pastor"], [LEADER, "Líder Presencial"], [BACKUP, "Respaldo"],
  [LEADER2, "Líder Virtual"], [P1, "Participante 1"], [P2, "Participante 2"], [P3, "Participante 3"],
  [P4, "Participante 4"], [P5, "Participante 5"], [P6, "Participante 6"],
];

let db: PGlite;
let CAMP_PA = "";
let CAMP_VIRT = "";

async function as<T = Record<string, unknown>>(uid: string, q: string, params: unknown[] = [], role = "authenticated") {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query<T>(q, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
async function failure(uid: string, q: string, params: unknown[] = []): Promise<string> {
  try {
    await as(uid, q, params);
  } catch (e) {
    return (e as Error).message;
  }
  return "";
}
const one = async <T>(uid: string, q: string, params: unknown[] = []) => (await as<T>(uid, q, params))[0];
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const ceOf = async (person: string, cur: string) =>
  (await q<{ id: string }>(`select id from curriculum_enrollments where person_id = $1 and curriculum_id = $2 and status in ('activo', 'pausado', 'completado')`, [person, cur]))[0].id;
const versionOf = async (cur: string, n = 1) => (await q<{ id: string }>(`select id from curriculum_versions where curriculum_id = $1 and version = $2`, [cur, n]))[0].id;
const complete = async (person: string, cur: string, units: string[]) => {
  const ce = await ceOf(person, cur);
  for (const u of units) await as(COORD, `select record_unit_completion($1, $2, 'asistencia_validada')`, [ce, u]);
};
const progress = async (person: string, cur: string) => (await one<{ units_done: number; next_unit_title: string | null }>(person, `select * from curriculum_progress($1)`, [await ceOf(person, cur)]));
// pasa lista con las personas dadas (la base trabaja con inscripciones al grupo)
const roll = async (uid: string, gid: string, day: string, persons: string[]) => {
  const ids = (await q<{ id: string }>(`select id from enrollments where group_id = $1 and person_id = any($2::uuid[]) and status = 'en_curso'`, [gid, persons])).map((r) => r.id);
  return as(uid, `select save_attendance($1, $2, null, $3::uuid[], '{}')`, [gid, day, ids]);
};
const sessionDate = async (gid: string, week: number) =>
  (await q<{ d: string }>(`select to_char(held_on, 'YYYY-MM-DD') d from meetings where group_id = $1 and season_week = $2`, [gid, week]))[0].d;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of ALL) await db.exec(sql(f));
  await db.exec(GRANTS);
  for (const [uid, name] of PEOPLE) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [uid, `${uid}@t.l`, JSON.stringify({ full_name: name })]);
  }
  CAMP_PA = (await q<{ id: string }>(`select id from campuses where name = 'Puente Alto'`))[0].id;
  CAMP_VIRT = (await q<{ id: string }>(`select id from campuses where name = 'Virtual'`))[0].id;

  await db.exec(`
    update profiles set role = 'admin' where id = '${ADMIN}';
    update profiles set role = 'coordinador' where id in ('${COORD}', '${PASTOR}');
    update profiles set role = 'lider' where id in ('${LEADER}', '${BACKUP}', '${LEADER2}');
    update profiles set gender = 'hombre', birth_date = '1990-01-01', terms_accepted_at = now()
      where id in ('${P1}', '${P2}', '${P3}', '${P4}', '${P5}', '${P6}');
    insert into campus_pastors values ('${PASTOR}', '${CAMP_PA}');

    insert into curriculums (id, name, category, kind) values ('${LM}', 'Libro Morado', 'formacion', 'curriculo');
    insert into curriculums (id, name, duration_years, certifiable) values ('${HOM}', 'AR Hombres', 3, true);
    insert into curriculums (id, name, category, kind) values ('${RUN}', 'Running', 'recreacion', 'actividad');
    insert into curriculums (id, name) values ('${PROG0}', 'Programa sin grupos');
    insert into curriculum_coordinators values ('${LM}', '${COORD}'), ('${HOM}', '${COORD}'), ('${RUN}', '${COORD}'), ('${PROG0}', '${COORD}');

    insert into seasons (id, name, start_date, end_date, status) values
      ('${SEASON_A}', '2024', '2024-03-04', '2024-11-29', 'en_curso'),
      ('${SEASON_B}', '2025', '2025-03-03', '2025-11-28', 'borrador');

    insert into cycles (id, curriculum_id, number, formative_year) values
      ('${LM_CY}', '${LM}', 1, 1), ('${HOM_CY1}', '${HOM}', 1, 1), ('${HOM_CY2}', '${HOM}', 2, 2), ('${HOM_CY3}', '${HOM}', 3, 3), ('${P0_CY}', '${PROG0}', 1, 1);
    insert into lessons (id, cycle_id, number, title) select ('00000000-0000-0000-0000-' || lpad((300 + g)::text, 12, '0'))::uuid, '${LM_CY}', g, 'Unidad ' || g from generate_series(1, 18) g;
    insert into lessons (id, cycle_id, number, title) values
      ('${hom(1)}', '${HOM_CY1}', 1, 'H1'), ('${hom(2)}', '${HOM_CY1}', 2, 'H2'), ('${hom(3)}', '${HOM_CY1}', 3, 'H3'),
      ('${hom(4)}', '${HOM_CY2}', 1, 'H4'), ('${hom(5)}', '${HOM_CY2}', 2, 'H5'), ('${hom(6)}', '${HOM_CY2}', 3, 'H6'),
      ('${hom(7)}', '${HOM_CY3}', 1, 'H7'), ('${hom(8)}', '${HOM_CY3}', 2, 'H8'), ('${hom(9)}', '${HOM_CY3}', 3, 'H9'),
      ('${id(340)}', '${P0_CY}', 1, 'P1'), ('${id(341)}', '${P0_CY}', 2, 'P2');
  `);
  // calendario de la temporada 2024: 36 semanas desde el 4 de marzo, con una pausa el 1 de abril
  await as(ADMIN, `select generate_season_weeks($1, '2024-03-04', array['2024-04-01'::date])`, [SEASON_A]);

  await db.exec(`
    insert into groups (id, season_id, curriculum_id, name, leader_id, backup_leader_id, campus_id, weekday, modality, capacity) values
      ('${GP_PRES}', '${SEASON_A}', '${LM}', 'GP presencial', '${LEADER}', '${BACKUP}', '${CAMP_PA}', 2, 'presencial', 10),
      ('${GP_VIRT}', '${SEASON_A}', '${LM}', 'GP online', '${LEADER2}', '${BACKUP}', '${CAMP_VIRT}', 4, 'virtual', 10),
      ('${GP_RUN}', '${SEASON_A}', '${RUN}', 'Running sábado', '${LEADER2}', null, '${CAMP_VIRT}', 6, 'presencial', 20);
    insert into groups (id, season_id, curriculum_id, name, leader_id, campus_id, formative_year, weekday, modality, capacity)
      values ('${GP_HOM}', '${SEASON_A}', '${HOM}', 'AR Hombres año 1', '${LEADER}', '${CAMP_PA}', 1, 3, 'presencial', 10);
  `);
});

describe("F6 · Currículum corto: 18 unidades en 36 encuentros, sin inventar contenido", () => {
  it("distribuye las 18 unidades en las 36 semanas: cada una ocupa dos", async () => {
    const v = await versionOf(LM);
    const lessonsBefore = (await q<{ n: number }>(`select count(*)::int n from lessons`))[0].n;
    await as(COORD, `select propose_plan_distribution($1, 1)`, [v]);
    const slots = await q<{ n: number }>(
      `select count(*)::int n from learning_plan_slots s join annual_learning_plans p on p.id = s.plan_id where p.version_id = $1`, [v]);
    expect(slots[0].n).toBe(36);
    const per = await q<{ n: number }>(
      `select count(*)::int n from learning_plan_slot_units su join learning_plan_slots s on s.id = su.slot_id join annual_learning_plans p on p.id = s.plan_id
        where p.version_id = $1 group by su.unit_id`, [v]);
    expect(per).toHaveLength(18);
    expect(per.every((r) => r.n === 2)).toBe(true);
    // no se creó ninguna lección ni doctrina de más
    expect((await q<{ n: number }>(`select count(*)::int n from lessons`))[0].n).toBe(lessonsBefore);
    const plan = (await q<{ id: string }>(`select id from annual_learning_plans where version_id = $1`, [v]))[0].id;
    expect(await as(COORD, `select * from plan_coverage($1)`, [plan])).toHaveLength(0);
  });

  it("un libro con cuatro subdivisiones conserva sus cuatro módulos y el orden dentro del plan de 36", async () => {
    const book = id(150);
    await db.query(`insert into curriculums (id, name) values ($1, 'Libro de cuatro partes')`, [book]);
    await db.query(`insert into curriculum_coordinators values ($1, $2)`, [book, COORD]);
    for (let part = 1; part <= 4; part++) {
      const cy = id(160 + part);
      await db.query(`insert into cycles (id, curriculum_id, number) values ($1, $2, $3)`, [cy, book, part]);
      await db.query(`insert into lessons (cycle_id, number, title) select $1, g, 'Parte ' || $2::int || ' · ' || g from generate_series(1, 5) g`, [cy, part]);
    }
    const v = await versionOf(book);
    await as(COORD, `select propose_plan_distribution($1, 1)`, [v]);
    expect((await q<{ n: number }>(`select count(*)::int n from cycles where version_id = $1`, [v]))[0].n).toBe(4);
    // la primera semana en que aparece cada parte va en orden: 1 → 2 → 3 → 4
    const first = await q<{ number: number; wk: number }>(
      `select cy.number, min(s.position)::int wk from learning_plan_slot_units su join learning_plan_slots s on s.id = su.slot_id
         join annual_learning_plans p on p.id = s.plan_id join lessons l on l.id = su.unit_id join cycles cy on cy.id = l.cycle_id
        where p.version_id = $1 group by cy.number order by cy.number`, [v]);
    expect(first).toHaveLength(4);
    expect(first.map((r) => r.wk)).toEqual([...first.map((r) => r.wk)].sort((a, b) => a - b));
    expect(first[0].wk).toBe(1);
  });
});

describe("F1 · Nuevo participante", () => {
  it("elige oferta, modalidad y horario; se registra una vez y empieza su progreso", async () => {
    const ce = (await one<{ enroll_curriculum: string }>(P1, `select enroll_curriculum($1)`, [LM])).enroll_curriculum;
    const again = (await one<{ enroll_curriculum: string }>(P1, `select enroll_curriculum($1)`, [LM])).enroll_curriculum;
    expect(again).toBe(ce);

    const offers = await as<{ group_id: string; modality: string; campus: string }>(P1, `select group_id, modality, campus from compatible_groups($1)`, [ce]);
    expect(offers.map((o) => o.modality).sort()).toEqual(["presencial", "virtual"]);
    expect(offers.find((o) => o.modality === "virtual")?.campus).toBe("Virtual");

    await as(P1, `select change_group($1, $2)`, [ce, GP_VIRT]);
    const mem = await q<{ group_id: string; status: string }>(`select group_id, status from enrollments where curriculum_enrollment_id = $1`, [ce]);
    expect(mem).toEqual([{ group_id: GP_VIRT, status: "en_curso" }]);
    const p = await progress(P1, LM);
    expect(p).toMatchObject({ units_done: 0, next_unit_title: "Unidad 1" });
    expect((await q(`select 1 from curriculum_enrollments where person_id = $1`, [P1]))).toHaveLength(1);
  });
});

describe("F2 · El grupo continúa sin su líder titular", () => {
  it("el respaldo dirige y registra la sesión; no se crea otra temporada ni otro grupo", async () => {
    await as(LEADER2, `select plan_group_sessions($1)`, [GP_VIRT]);
    const seasons = (await q<{ n: number }>(`select count(*)::int n from seasons`))[0].n;
    const groups = (await q<{ n: number }>(`select count(*)::int n from groups`))[0].n;

    const week = 5;
    const date = await sessionDate(GP_VIRT, week);
    const mid = (await q<{ id: string }>(`select id from meetings where group_id = $1 and season_week = $2`, [GP_VIRT, week]))[0].id;
    await as(LEADER2, `select set_session_facilitator($1, $2)`, [mid, BACKUP]);
    await roll(BACKUP, GP_VIRT, date, [P1]);

    const [m] = await q<{ status: string; facilitator_id: string }>(`select status, facilitator_id from meetings where id = $1`, [mid]);
    expect(m).toEqual({ status: "realizada", facilitator_id: BACKUP });
    expect((await q<{ n: number }>(`select count(*)::int n from seasons`))[0].n).toBe(seasons);
    expect((await q<{ n: number }>(`select count(*)::int n from groups`))[0].n).toBe(groups);
    const [g] = await q<{ status: string; leader_id: string }>(`select status, leader_id from groups where id = $1`, [GP_VIRT]);
    expect(g).toEqual({ status: "en_curso", leader_id: LEADER2 });
  });

  it("el respaldo opera la sesión con permisos limitados", async () => {
    expect(await failure(BACKUP, `select plan_group_sessions($1)`, [GP_PRES])).toContain("No tienes permiso");
    expect(await failure(BACKUP, `select enroll_person($1, $2)`, [GP_VIRT, P3])).toContain("No tienes permiso");
  });
});

describe("F4 · De presencial a online sin perder nada", () => {
  it("la misma inscripción, el mismo avance y ninguna asistencia duplicada", async () => {
    const ce = (await one<{ enroll_curriculum: string }>(P4, `select enroll_curriculum($1)`, [LM])).enroll_curriculum;
    await as(P4, `select change_group($1, $2)`, [ce, GP_PRES]);
    await roll(LEADER, GP_PRES, "2024-03-05", [P4]);
    await roll(LEADER, GP_PRES, "2024-03-12", [P4]);
    await as(COORD, `select record_unit_completion($1, $2, 'asistencia_validada')`, [ce, lm(1)]);
    const attBefore = (await q<{ n: number }>(`select count(*)::int n from attendance a join enrollments e on e.id = a.enrollment_id where e.person_id = $1`, [P4]))[0].n;
    expect(attBefore).toBe(2);

    await as(P4, `select change_group($1, $2)`, [ce, GP_VIRT]);

    expect((await q(`select 1 from curriculum_enrollments where person_id = $1 and curriculum_id = $2`, [P4, LM]))).toHaveLength(1);
    const mem = await q<{ group_id: string; status: string; left_reason: string | null }>(
      `select group_id, status, left_reason from enrollments where curriculum_enrollment_id = $1 order by enrolled_at, group_id`, [ce]);
    expect(mem.find((m) => m.group_id === GP_PRES)).toMatchObject({ status: "cancelado", left_reason: "cambio_de_grupo" });
    expect(mem.find((m) => m.group_id === GP_VIRT)?.status).toBe("en_curso");
    const attAfter = (await q<{ n: number }>(`select count(*)::int n from attendance a join enrollments e on e.id = a.enrollment_id where e.person_id = $1`, [P4]))[0].n;
    expect(attAfter).toBe(attBefore);
    expect(await progress(P4, LM)).toMatchObject({ units_done: 1, next_unit_title: "Unidad 2" });
  });
});

describe("F5 · AR Hombres: de un año al siguiente solo con requisitos", () => {
  it("no avanza con la etapa a medias, avanza al cumplirla, y pausar no reinicia nada", async () => {
    const ce = (await one<{ enroll_curriculum: string }>(P5, `select enroll_curriculum($1)`, [HOM])).enroll_curriculum;
    await as(P5, `select change_group($1, $2)`, [ce, GP_HOM]);
    await complete(P5, HOM, [hom(1), hom(2)]);
    expect(await failure(P5, `select advance_formative_year($1)`, [ce])).toContain("Todavía no se cumplen los requisitos del año 1");
    await complete(P5, HOM, [hom(3)]);
    expect((await one<{ advance_formative_year: number }>(P5, `select advance_formative_year($1)`, [ce])).advance_formative_year).toBe(2);

    await as(P5, `select pause_curriculum_enrollment($1, 'descanso')`, [ce]);
    await as(P5, `select resume_curriculum_enrollment($1)`, [ce]);
    const [c] = await q<{ formative_year: number; status: string }>(`select formative_year, status from curriculum_enrollments where id = $1`, [ce]);
    expect(c).toEqual({ formative_year: 2, status: "activo" });
    const years = await as<{ formative_year: number; items_done: number; met: boolean }>(P5, `select formative_year, items_done, met from year_status($1)`, [ce]);
    expect(years).toEqual([
      { formative_year: 1, items_done: 3, met: true },
      { formative_year: 2, items_done: 0, met: false },
      { formative_year: 3, items_done: 0, met: false },
    ]);
  });

  it("cada año tiene su propio plan de 36 encuentros, independiente de los demás", async () => {
    const v = await versionOf(HOM);
    for (const year of [1, 2, 3]) await as(COORD, `select propose_plan_distribution($1, $2)`, [v, year]);
    const plans = await q<{ formative_year: number; slots: number; units: number }>(
      `select p.formative_year, count(distinct s.id)::int slots, count(distinct su.unit_id)::int units
         from annual_learning_plans p join learning_plan_slots s on s.plan_id = p.id left join learning_plan_slot_units su on su.slot_id = s.id
        where p.version_id = $1 group by p.formative_year order by 1`, [v]);
    expect(plans).toEqual([{ formative_year: 1, slots: 36, units: 3 }, { formative_year: 2, slots: 36, units: 3 }, { formative_year: 3, slots: 36, units: 3 }]);
    // el avance de una etapa no toca el de otra
    const grid1 = await as<{ state: string }>(P5, `select state from plan_progress($1, 1)`, [await ceOf(P5, HOM)]);
    const grid2 = await as<{ state: string }>(P5, `select state from plan_progress($1, 2)`, [await ceOf(P5, HOM)]);
    expect(grid1.every((g) => g.state === "hecha")).toBe(true);
    expect(grid2.every((g) => g.state === "pendiente")).toBe(true);
  });

  it("no se certifica el programa hasta cumplir los tres años", async () => {
    expect(await failure(ADMIN, `select issue_certificate($1)`, [await ceOf(P5, HOM)])).toContain("Todavía no cumple los requisitos");
  });
});

describe("F7 · Experiencia recreativa: 36 fechas y asistencia, sin unidades ni certificado", () => {
  it("Running se planifica y se pasa lista como cualquier grupo, sin exigir contenido bíblico", async () => {
    await as(P1, `select enroll($1)`, [GP_RUN]);
    expect((await as<{ plan_group_sessions: number }>(LEADER2, `select plan_group_sessions($1)`, [GP_RUN]))[0].plan_group_sessions).toBe(36);
    await roll(LEADER2, GP_RUN, await sessionDate(GP_RUN, 1), [P1]);
    await roll(LEADER2, GP_RUN, await sessionDate(GP_RUN, 2), [P1]);

    const [s] = await q<{ total: number; done: number }>(
      `select count(*)::int total, count(*) filter (where status = 'realizada')::int done from meetings where group_id = $1 and season_week is not null`, [GP_RUN]);
    expect(s).toEqual({ total: 36, done: 2 });
    expect((await q(`select 1 from lessons l join cycles cy on cy.id = l.cycle_id where cy.curriculum_id = $1`, [RUN]))).toHaveLength(0);
    expect(await progress(P1, RUN)).toMatchObject({ units_done: 0, next_unit_title: null });
  });

  it("no pide revisión de unidades ni entrega certificado", async () => {
    const issues = await as<{ level: string }>(COORD, `select * from version_readiness($1)`, [await versionOf(RUN)]);
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
    expect(await failure(ADMIN, `select issue_certificate($1)`, [await ceOf(P1, RUN)])).toContain("no entrega certificado");
  });
});

describe("F8 · Una versión nueva no toca a quienes ya cursan la anterior", () => {
  let v1 = "";
  let v2 = "";

  it("se prepara, se revisa, se aprueba y se publica", async () => {
    v1 = await versionOf(LM);
    v2 = (await one<{ clone_version: string }>(COORD, `select clone_version($1, 'Edición nueva')`, [v1])).clone_version;
    await as(COORD, `select advance_curriculum_version($1, 'en_adaptacion')`, [v2]);
    await as(COORD, `select advance_curriculum_version($1, 'en_revision_pastoral')`, [v2]);
    await as(ADMIN, `select advance_curriculum_version($1, 'aprobado')`, [v2]);
    await as(ADMIN, `select advance_curriculum_version($1, 'publicado')`, [v2]);
    const r = await q<{ version: number; is_current: boolean }>(`select version, is_current from curriculum_versions where curriculum_id = $1 order by version`, [LM]);
    expect(r).toEqual([{ version: 1, is_current: false }, { version: 2, is_current: true }]);
  });

  it("quien ya cursaba conserva su versión y sus grupos; los nuevos entran a la vigente", async () => {
    await db.query(`insert into groups (id, season_id, curriculum_id, name, leader_id, campus_id, weekday, modality, capacity)
                    values ($1, $2, $3, 'GP edición nueva', $4, $5, 3, 'virtual', 10)`, [GP_V2, SEASON_A, LM, LEADER2, CAMP_VIRT]);
    expect((await q<{ version_id: string }>(`select version_id from groups where id = $1`, [GP_V2]))[0].version_id).toBe(v2);

    expect((await q<{ version_id: string }>(`select version_id from curriculum_enrollments where person_id = $1 and curriculum_id = $2`, [P1, LM]))[0].version_id).toBe(v1);
    const ce6 = (await one<{ enroll_curriculum: string }>(P6, `select enroll_curriculum($1)`, [LM])).enroll_curriculum;
    expect((await q<{ version_id: string }>(`select version_id from curriculum_enrollments where id = $1`, [ce6]))[0].version_id).toBe(v2);

    const forP6 = (await as<{ group_id: string }>(P6, `select group_id from compatible_groups($1)`, [ce6])).map((g) => g.group_id);
    expect(forP6).toEqual([GP_V2]);
    const forP1 = (await as<{ group_id: string }>(P1, `select group_id from compatible_groups($1)`, [await ceOf(P1, LM)])).map((g) => g.group_id).sort();
    expect(forP1).toEqual([GP_PRES, GP_VIRT].sort());
  });

  it("la versión anterior se conserva intacta", async () => {
    expect((await q<{ n: number }>(`select count(*)::int n from lessons l join cycles cy on cy.id = l.cycle_id where cy.version_id = $1`, [v1]))[0].n).toBe(18);
    expect(await failure(COORD, `update lessons set title = 'Cambiado' where id = $1`, [lm(1)])).toContain("no se puede editar");
  });
});

describe("F3 · Pausa, cierre de temporada y regreso al año siguiente", () => {
  let ce = "";

  it("completó las unidades 1–5, cierra la temporada y conserva su inscripción", async () => {
    ce = (await one<{ enroll_curriculum: string }>(P2, `select enroll_curriculum($1)`, [LM])).enroll_curriculum;
    await as(P2, `select change_group($1, $2)`, [ce, GP_V2]);
    const units = (await q<{ id: string }>(`select l.id from lessons l join cycles cy on cy.id = l.cycle_id where cy.version_id = (select version_id from curriculum_enrollments where id = $1) order by l.number limit 5`, [ce])).map((r) => r.id);
    for (const u of units) await as(COORD, `select record_unit_completion($1, $2, 'asistencia_validada')`, [ce, u]);

    await as(COORD, `select * from close_group($1)`, [GP_V2]);
    await db.query(`update seasons set status = 'cerrada' where id = $1`, [SEASON_A]);
    const [c] = await q<{ status: string }>(`select status from curriculum_enrollments where id = $1`, [ce]);
    expect(c.status).toBe("activo"); // cerrar la temporada no cierra la formación
    expect(await progress(P2, LM)).toMatchObject({ units_done: 5, next_unit_title: "Unidad 6" });
    // y nadie vuelve al año 1 por el calendario
    expect((await q<{ formative_year: number }>(`select formative_year from curriculum_enrollments where id = $1`, [await ceOf(P5, HOM)]))[0].formative_year).toBe(2);
  });

  it("pausa, vuelve en 2025 y retoma desde la unidad 6", async () => {
    await as(P2, `select pause_curriculum_enrollment($1, 'fin de año')`, [ce]);
    await db.query(`update seasons set status = 'en_curso' where id = $1`, [SEASON_B]);
    await as(P2, `select resume_curriculum_enrollment($1)`, [ce]);
    const [c] = await q<{ status: string; resumed_count: number }>(`select status, resumed_count from curriculum_enrollments where id = $1`, [ce]);
    expect(c).toEqual({ status: "activo", resumed_count: 1 });
    expect(await progress(P2, LM)).toMatchObject({ units_done: 5, next_unit_title: "Unidad 6" });
  });

  it("si no hay un grupo compatible, no se promete: se pide recuperación, una sola vez", async () => {
    const ce3 = (await one<{ enroll_curriculum: string }>(P3, `select enroll_curriculum($1)`, [PROG0])).enroll_curriculum;
    await as(COORD, `select record_unit_completion($1, $2, 'manual')`, [ce3, id(340)]);
    expect(await as(P3, `select * from compatible_groups($1)`, [ce3])).toHaveLength(0);
    const a = (await one<{ request_catchup: string }>(P3, `select request_catchup($1, 'no hay grupos')`, [ce3])).request_catchup;
    const b = (await one<{ request_catchup: string }>(P3, `select request_catchup($1)`, [ce3])).request_catchup;
    expect(b).toBe(a);
    expect((await q<{ pending_unit_id: string }>(`select pending_unit_id from catchup_plans where id = $1`, [a]))[0].pending_unit_id).toBe(id(341));
  });

  it("su grupo va en la semana 20: asistir ahí NO acredita las unidades 6 a 19", async () => {
    await db.query(
      `insert into groups (id, season_id, curriculum_id, name, leader_id, campus_id, weekday, modality, capacity)
       values ($1, $2, $3, 'GP 2025', $4, $5, 4, 'virtual', 10)`, [GP25, SEASON_B, LM, LEADER2, CAMP_VIRT]);
    await as(LEADER2, `select plan_group_sessions($1, '2025-03-06')`, [GP25]);
    for (let w = 1; w < 20; w++) await roll(LEADER2, GP25, await sessionDate(GP25, w), []);

    const offers = (await as<{ group_id: string }>(P2, `select group_id from compatible_groups($1)`, [ce])).map((o) => o.group_id);
    expect(offers).toContain(GP25); // se ofrece, sin prometer que calce con la unidad pendiente
    await as(P2, `select change_group($1, $2)`, [ce, GP25]);
    await roll(LEADER2, GP25, await sessionDate(GP25, 20), [P2]);

    expect((await q(`select 1 from attendance a join enrollments e on e.id = a.enrollment_id where e.person_id = $1 and e.group_id = $2 and a.status = 'presente'`, [P2, GP25]))).toHaveLength(1);
    expect(await progress(P2, LM)).toMatchObject({ units_done: 5, next_unit_title: "Unidad 6" });
    const grid = await as<{ week: number; state: string }>(P2, `select week, state from plan_progress($1, 1)`, [ce]);
    // con 18 unidades en 36 semanas, las unidades 1–5 son las semanas 1–10; todo lo que sigue sigue pendiente
    expect(grid.filter((g) => g.week <= 10).every((g) => g.state === "hecha")).toBe(true);
    expect(grid.filter((g) => g.week >= 11).every((g) => g.state === "pendiente")).toBe(true);
    expect((await q(`select 1 from unit_completions where curriculum_enrollment_id = $1`, [ce]))).toHaveLength(5);
  });

  it("la persona conserva un único registro y sus grupos anteriores quedan en el historial", async () => {
    expect((await q(`select 1 from curriculum_enrollments where person_id = $1 and curriculum_id = $2`, [P2, LM]))).toHaveLength(1);
    const mem = await q<{ group_id: string }>(`select group_id from enrollments where curriculum_enrollment_id = $1`, [ce]);
    expect(mem.map((m) => m.group_id).sort()).toEqual([GP25, GP_V2].sort());
  });
});

describe("reconciliación de datos", () => {
  it("las comprobaciones del modelo nuevo no encuentran problemas", async () => {
    const rows = await as<{ area: string; chequeo: string; estado: string; actual: string }>(ADMIN, `select area, chequeo, estado, actual from reconciliacion()`);
    const model = rows.filter((r) => r.area === "Modelo");
    expect(model.length).toBeGreaterThanOrEqual(10);
    expect(model.filter((r) => r.estado !== "ok").map((r) => r.chequeo)).toEqual([]);
  });

  it("compara con lo importado: hoy hay menos que la producción real y lo marca; con lo esperado igual o menor, queda ok", async () => {
    const before = await as<{ estado: string }>(ADMIN, `select estado from reconciliacion() where area = 'Importación'`);
    expect(before.every((r) => r.estado === "error")).toBe(true);
    await db.query(`update migration_expected set expected = 0`);
    const after = await as<{ estado: string; detalle: string }>(ADMIN, `select estado, detalle from reconciliacion() where area = 'Importación'`);
    expect(after.every((r) => r.estado === "ok")).toBe(true);
    expect(after.some((r) => /Creció/.test(r.detalle))).toBe(true);
  });

  it("detecta un problema de verdad: asistencia en una sesión que no se realizó", async () => {
    const e = (await q<{ id: string }>(`select id from enrollments where group_id = $1 limit 1`, [GP_VIRT]))[0].id;
    const planned = (await q<{ id: string }>(`select id from meetings where group_id = $1 and status = 'planificada' limit 1`, [GP_VIRT]))[0].id;
    await db.query(`insert into attendance (meeting_id, enrollment_id, status) values ($1, $2, 'presente')`, [planned, e]);
    const bad = await as<{ chequeo: string; actual: string; estado: string }>(
      ADMIN, `select chequeo, actual, estado from reconciliacion() where estado <> 'ok' and area = 'Modelo'`);
    expect(bad.map((b) => [b.chequeo, Number(b.actual), b.estado])).toEqual([["Asistencia registrada en reuniones que no se realizaron", 1, "error"]]);
    await db.query(`delete from attendance where meeting_id = $1`, [planned]);
  });

  it("solo la ve el administrador", async () => {
    expect(await failure(COORD, `select * from reconciliacion()`)).toContain("Solo el administrador");
    expect(await as(COORD, `select * from migration_expected`)).toHaveLength(0);
  });
});

describe("habilitación por sede", () => {
  it("cada sede muestra lo que le falta y lo que no tiene sede asignada se ve aparte", async () => {
    const r = await as<{ campus: string; grupos_activos: number; sin_calendario: number; pastores: number; listo: boolean; pendientes: string[] }>(
      ADMIN, `select campus, grupos_activos, sin_calendario, pastores, listo, pendientes from campus_readiness()`);
    const pa = r.find((x) => x.campus === "Puente Alto")!;
    expect(pa.grupos_activos).toBe(2); // GP presencial y AR Hombres año 1
    expect(pa.pastores).toBe(1);
    expect(pa.sin_calendario).toBe(2);
    expect(pa.listo).toBe(false);
    expect(pa.pendientes.join(" ")).toContain("sin calendario");
    expect(r.find((x) => x.campus === "Virtual")?.grupos_activos).toBe(3); // el grupo de la edición nueva ya finalizó
  });

  it("un pastor ve solo su sede", async () => {
    const r = await as<{ campus: string }>(PASTOR, `select campus from campus_readiness()`);
    expect(r.map((x) => x.campus)).toEqual(["Puente Alto"]);
    expect(await failure(LEADER, `select * from campus_readiness()`)).toContain("Solo el administrador y los pastores");
  });

  it("no se habilita una sede con pendientes salvo que el administrador lo confirme, y queda registrado", async () => {
    const pa = (await q<{ id: string }>(`select id from campuses where name = 'Puente Alto'`))[0].id;
    expect(await failure(ADMIN, `select set_campus_status($1, 'habilitada')`, [pa])).toContain("todavía tiene pendientes");
    expect(await failure(PASTOR, `select set_campus_status($1, 'piloto')`, [pa])).toContain("Solo el administrador");
    await as(ADMIN, `select set_campus_status($1, 'piloto', 'Empezamos con dos grupos')`, [pa]);
    await as(ADMIN, `select set_campus_status($1, 'habilitada', null, true)`, [pa]);
    const [c] = await q<{ gp2_status: string; gp2_notes: string }>(`select gp2_status, gp2_notes from campuses where id = $1`, [pa]);
    expect(c).toEqual({ gp2_status: "habilitada", gp2_notes: "Empezamos con dos grupos" });
    expect((await q(`select 1 from audit_log where action = 'CAMPUS_STATUS' and record_id = $1`, [pa])).length).toBe(2);
  });

  it("una sede con todo en orden queda lista", async () => {
    const virt = (await q<{ id: string }>(`select id from campuses where name = 'Virtual'`))[0].id;
    await db.query(`insert into campus_pastors values ($1, $2)`, [PASTOR, virt]);
    const [v] = await as<{ listo: boolean; pendientes: string[] }>(ADMIN, `select listo, pendientes from campus_readiness() where campus = 'Virtual'`);
    expect(v).toEqual({ listo: true, pendientes: [] });
    await as(ADMIN, `select set_campus_status($1, 'habilitada')`, [virt]);
  });
});

describe("seguridad estructural", () => {
  it("todas las tablas tienen control de acceso por fila", async () => {
    const r = await q<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`);
    expect(r.map((x) => x.relname)).toEqual([]);
  });

  it("toda función con permisos elevados fija su ruta de búsqueda", async () => {
    const r = await q<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text like '%search_path%', false) order by 1`);
    expect(r.map((x) => x.proname)).toEqual([]);
  });

  it("sin sesión no se lee nada de ninguna tabla", async () => {
    await db.exec(`grant select on all tables in schema public to anon`);
    const tables = (await q<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v') order by 1`)).map((x) => x.relname);
    const leaks: string[] = [];
    for (const t of tables) {
      const rows = await as<{ n: number }>("", `select count(*)::int n from ${t}`, [], "anon").catch(() => [{ n: 0 }]);
      if (rows[0].n > 0) leaks.push(t);
    }
    expect(leaks, "tablas que ve cualquiera sin iniciar sesión").toEqual([]);
  });

  it("sin sesión solo se puede verificar un código de certificado, y no revela nada si no existe", async () => {
    expect(await as("", `select * from verify_certificate('ABCDEF123456')`, [], "anon")).toHaveLength(0);
    await expect(as("", `select * from reconciliacion()`, [], "anon")).rejects.toThrow();
    await expect(as("", `select * from certificate_candidates($1)`, [HOM], "anon")).rejects.toThrow();
  });

  it("las migraciones se pueden repetir sin cambiar los datos", async () => {
    const count = `select (select count(*) from curriculum_enrollments)::int ce, (select count(*) from meetings)::int m,
                          (select count(*) from attendance)::int a, (select count(*) from unit_completions)::int u,
                          (select count(*) from migration_expected)::int e`;
    const before = (await q(count))[0];
    // la cadena completa, en orden, se puede volver a ejecutar
    for (const f of ALL.slice(3)) await db.exec(sql(f));
    expect((await q(count))[0]).toEqual(before);
  });
});
