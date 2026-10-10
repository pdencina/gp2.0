import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// GP 2.0 · Fase 3: calendario, sesiones, backup, asistencia y acreditación (008_calendario.sql)

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
const sql = (f: string) => readFileSync(join(__dirname, "../v2", f), "utf8");

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), COORD = id(2), MONITOR = id(3), LEADER = id(4), BACKUP = id(5);
const S1 = id(6), S2 = id(7), S3 = id(8), OUTSIDER = id(9), LEADER2 = id(10);
const CUR = id(100), SEASON = id(101), SEASON_B = id(102), CY1 = id(103), GA = id(104), GB = id(105);
const U1 = id(110), U2 = id(111), U3 = id(112);

let db: PGlite;

async function as<T = Record<string, unknown>>(uid: string, q: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
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
const sessionId = async (gid: string, week: number) =>
  (await db.query<{ id: string }>(`select id from meetings where group_id = $1 and season_week = $2`, [gid, week])).rows[0].id;
// Las listas llegan con personas; la base de datos trabaja con inscripciones en el grupo
const enrollmentsOf = async (persons: string[]) =>
  (await db.query<{ id: string }>(`select id from enrollments where group_id = $1 and person_id = any($2::uuid[])`, [GA, persons])).rows.map((r) => r.id);
const save = async (uid: string, day: string, present: string[], justified: string[] = [], recovered: string[] = []) =>
  as(uid, `select save_attendance($1, $2, null, $3::uuid[], $4::uuid[], $5::uuid[])`, [
    GA, day, await enrollmentsOf(present), await enrollmentsOf(recovered), await enrollmentsOf(justified),
  ]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of ["001_schema.sql", "004_rendimiento.sql", "005_panel.sql", "006_gp2_nucleo.sql", "007_catalogo.sql", "008_calendario.sql"]) {
    await db.exec(sql(f));
  }
  await db.exec(GRANTS);

  for (const [uid, name] of [
    [ADMIN, "Admin"], [COORD, "Coordinador"], [MONITOR, "Monitor"], [LEADER, "Líder Uno"], [BACKUP, "Backup Perez"],
    [S1, "Alumno Uno"], [S2, "Alumno Dos"], [S3, "Alumno Tres"], [OUTSIDER, "Ajeno"], [LEADER2, "Otro Líder"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      uid, `${uid}@test.local`, JSON.stringify({ full_name: name }),
    ]);
  }
  await db.exec(`
    update profiles set role = 'admin' where id = '${ADMIN}';
    update profiles set role = 'coordinador' where id = '${COORD}';
    update profiles set role = 'monitor' where id = '${MONITOR}';
    update profiles set role = 'lider' where id in ('${LEADER}', '${BACKUP}', '${LEADER2}');
    update profiles set gender = 'hombre', birth_date = '1990-01-01', terms_accepted_at = now()
      where id in ('${S1}', '${S2}', '${S3}', '${OUTSIDER}');

    insert into curriculums (id, name) values ('${CUR}', 'Libro Morado');
    insert into curriculum_coordinators values ('${CUR}', '${COORD}');
    insert into seasons (id, name, start_date, end_date, status) values ('${SEASON}', '2026', '2026-03-02', '2026-11-30', 'en_curso');
    insert into seasons (id, name, start_date, end_date, status) values ('${SEASON_B}', '2027 sin calendario', '2027-03-01', '2027-11-30', 'inscripciones');
    insert into cycles (id, curriculum_id, number, formative_year) values ('${CY1}', '${CUR}', 1, 1);
    insert into lessons (id, cycle_id, number, title) values ('${U1}', '${CY1}', 1, 'Uno'), ('${U2}', '${CY1}', 2, 'Dos'), ('${U3}', '${CY1}', 3, 'Tres');
    insert into groups (id, season_id, cycle_id, name, leader_id, monitor_id, weekday, modality, capacity)
      values ('${GA}', '${SEASON}', '${CY1}', 'Grupo A', '${LEADER}', '${MONITOR}', 2, 'virtual', 10);
    insert into groups (id, season_id, cycle_id, name, leader_id, weekday, modality, capacity)
      values ('${GB}', '${SEASON_B}', '${CY1}', 'Grupo B', '${LEADER}', 3, 'virtual', 10);

    -- plan pedagógico: posiciones 1 a 3 con una unidad cada una
    insert into annual_learning_plans (id, version_id, formative_year)
      select '${id(120)}', id, 1 from curriculum_versions where curriculum_id = '${CUR}' and is_current;
    insert into learning_plan_slots (id, plan_id, position) values ('${id(121)}', '${id(120)}', 1), ('${id(122)}', '${id(120)}', 2), ('${id(123)}', '${id(120)}', 3);
    insert into learning_plan_slot_units values ('${id(121)}', '${U1}'), ('${id(122)}', '${U2}'), ('${id(123)}', '${U3}');
  `);
  // El calendario de la temporada 2026: 36 semanas desde el lunes 2 de marzo, con una pausa el 4 de mayo
  await as(ADMIN, `select generate_season_weeks($1, '2026-03-02', array['2026-05-04'::date])`, [SEASON]);
  for (const s of [S1, S2, S3]) await as(s, `select enroll($1)`, [GA]);
  await db.exec(`update enrollments set enrolled_at = '2026-03-01' where group_id = '${GA}'`);
});

describe("calendario de 36 sesiones por grupo", () => {
  it("el líder planifica el grupo con las fechas reales de la temporada, saltando la pausa", async () => {
    const n = await one<{ plan_group_sessions: number }>(LEADER, `select plan_group_sessions($1)`, [GA]);
    expect(n.plan_group_sessions).toBe(36);
    const r = await db.query<{ n: number; days: number; weeks: number; breaks: number }>(
      `select count(*)::int n, count(distinct extract(isodow from held_on))::int days, count(distinct season_week)::int weeks,
              count(*) filter (where held_on = '2026-05-05')::int breaks
         from meetings where group_id = $1`, [GA]);
    expect(r.rows[0]).toEqual({ n: 36, days: 1, weeks: 36, breaks: 0 });
    const first = await db.query<{ held_on: string; season_week: number }>(
      `select to_char(held_on, 'YYYY-MM-DD') held_on, season_week from meetings where group_id = $1 and season_week in (1, 9, 10) order by season_week`, [GA]);
    // semana 9 = 28 de abril; la 10 salta la pausa del 4 de mayo y cae el 12 de mayo
    expect(first.rows).toEqual([
      { held_on: "2026-03-03", season_week: 1 },
      { held_on: "2026-04-28", season_week: 9 },
      { held_on: "2026-05-12", season_week: 10 },
    ]);
  });

  it("cada posición queda ligada a su lugar del plan pedagógico", async () => {
    const r = await db.query<{ season_week: number; slot_id: string | null }>(
      `select season_week, slot_id from meetings where group_id = $1 and season_week <= 4 order by season_week`, [GA]);
    expect(r.rows.map((x) => x.slot_id)).toEqual([id(121), id(122), id(123), null]);
  });

  it("no se planifica dos veces", async () => {
    expect(await failure(LEADER, `select plan_group_sessions($1)`, [GA])).toContain("ya tiene su calendario");
  });

  it("alumnos y el backup no planifican", async () => {
    expect(await failure(S1, `select plan_group_sessions($1)`, [GB])).toContain("No tienes permiso");
    expect(await failure(OUTSIDER, `select plan_group_sessions($1)`, [GB])).toContain("No tienes permiso");
  });

  it("sin calendario de temporada se pide la primera fecha y se respetan las pausas indicadas", async () => {
    expect(await failure(LEADER, `select plan_group_sessions($1)`, [GB])).toContain("fecha de la primera reunión");
    const n = await one<{ plan_group_sessions: number }>(LEADER, `select plan_group_sessions($1, '2027-03-03', array['2027-03-10'::date, '2027-04-07'::date])`, [GB]);
    expect(n.plan_group_sessions).toBe(36);
    const r = await db.query<{ held_on: string }>(
      `select to_char(held_on, 'YYYY-MM-DD') held_on from meetings where group_id = $1 and season_week in (1, 2, 3) order by season_week`, [GB]);
    expect(r.rows.map((x) => x.held_on)).toEqual(["2027-03-03", "2027-03-17", "2027-03-24"]);
  });

  it("las sesiones planificadas son visibles para los inscritos, no para desconocidos", async () => {
    expect((await as(S1, `select id from meetings where group_id = $1`, [GA])).length).toBe(36);
    expect(await as(OUTSIDER, `select id from meetings where group_id = $1`, [GA])).toHaveLength(0);
  });
});

describe("pasar lista sobre el calendario", () => {
  it("la reunión realizada ocupa la posición planificada y no crea otra sesión", async () => {
    await save(LEADER, "2026-03-03", [S1], [S2]);
    const m = await db.query<{ n: number; status: string; season_week: number }>(
      `select (select count(*) from meetings where group_id = $1)::int n, status, season_week from meetings where id = $2`, [GA, await sessionId(GA, 1)]);
    expect(m.rows[0]).toEqual({ n: 36, status: "realizada", season_week: 1 });
  });

  it("una reunión cerca de la fecha (±3 días) toma la posición y deja la huella de la fecha original", async () => {
    await save(LEADER, "2026-03-12", [S1, S2]);
    const [m] = (await db.query<{ status: string; held: string; orig: string }>(
      `select status, to_char(held_on, 'YYYY-MM-DD') held, to_char(rescheduled_from, 'YYYY-MM-DD') orig from meetings where id = $1`, [await sessionId(GA, 2)])).rows;
    expect(m).toEqual({ status: "realizada", held: "2026-03-12", orig: "2026-03-10" });
  });

  it("una reunión extra, lejos de toda sesión pendiente, queda sin posición", async () => {
    // la sesión pendiente más cercana (17 de marzo) está a 4 días
    await save(LEADER, "2026-03-13", [S1]);
    const [m] = (await db.query<{ season_week: number | null; status: string }>(
      `select season_week, status from meetings where group_id = $1 and held_on = '2026-03-13'`, [GA])).rows;
    expect(m).toEqual({ season_week: null, status: "realizada" });
    expect((await db.query(`select 1 from meetings where group_id = $1`, [GA])).rows).toHaveLength(37);
  });

  it("lo planificado o cancelado no cuenta como reunión dada", async () => {
    const [p] = await as<{ meetings_held: number; absences: number }>(S3, `select meetings_held, absences from enrollment_progress where person_id = $1`, [S3]);
    // realizadas: 03-03, 03-12 y la extra del 03-13; las otras 33 siguen planificadas
    expect(p.meetings_held).toBe(3);
    expect(p.absences).toBe(3);
  });

  it("una falta justificada no cuenta como ausencia", async () => {
    const [p] = await as<{ meetings_held: number; absences: number; justified: number }>(
      S2, `select meetings_held, absences, justified from enrollment_progress where person_id = $1`, [S2]);
    // S2: justificado el 03-03, presente el 03-12, ausente el 03-13 (la extra)
    expect(p).toEqual({ meetings_held: 3, absences: 1, justified: 1 });
  });

  it("el resumen de reuniones solo muestra las realizadas", async () => {
    const r = await as<{ id: string }>(LEADER, `select id from meeting_summary where group_id = $1`, [GA]);
    expect(r).toHaveLength(3);
  });

  it("pasar lista no acredita ninguna unidad", async () => {
    expect((await db.query(`select 1 from unit_completions`)).rows).toHaveLength(0);
  });
});

describe("reprogramar y cancelar conservando la numeración", () => {
  it("cancelar deja la sesión en el calendario con su número y su motivo", async () => {
    const mid = await sessionId(GA, 5);
    await as(COORD, `select cancel_session($1, 'Feriado')`, [mid]);
    const [m] = (await db.query<{ status: string; cancel_reason: string; season_week: number }>(`select status, cancel_reason, season_week from meetings where id = $1`, [mid])).rows;
    expect(m).toEqual({ status: "cancelada", cancel_reason: "Feriado", season_week: 5 });
  });

  it("reprogramar una cancelada la reabre en otra fecha con la misma posición", async () => {
    const mid = await sessionId(GA, 5);
    await as(LEADER, `select reschedule_session($1, '2026-04-22')`, [mid]);
    const [m] = (await db.query<{ status: string; held: string; orig: string; season_week: number; cancel_reason: string | null }>(
      `select status, to_char(held_on, 'YYYY-MM-DD') held, to_char(rescheduled_from, 'YYYY-MM-DD') orig, season_week, cancel_reason from meetings where id = $1`, [mid])).rows;
    expect(m).toMatchObject({ status: "reprogramada", held: "2026-04-22", season_week: 5, cancel_reason: null });
    expect(m.orig).toBeTruthy();
  });

  it("no se pisa la fecha de otra sesión", async () => {
    expect(await failure(LEADER, `select reschedule_session($1, '2026-03-12')`, [await sessionId(GA, 6)])).toContain("otra sesión");
  });

  it("una sesión realizada no se cancela ni se mueve", async () => {
    const done = await sessionId(GA, 1);
    expect(await failure(LEADER, `select cancel_session($1)`, [done])).toContain("ya realizada");
    expect(await failure(LEADER, `select reschedule_session($1, '2026-12-01')`, [done])).toContain("ya realizada");
  });

  it("alumnos y desconocidos no modifican el calendario", async () => {
    const mid = await sessionId(GA, 7);
    expect(await failure(S1, `select cancel_session($1)`, [mid])).toContain("No tienes permiso");
    expect(await failure(OUTSIDER, `select reschedule_session($1, '2026-12-01')`, [mid])).toContain("No tienes permiso");
  });

  it("los cambios de estado y de fecha quedan en la auditoría", async () => {
    const r = await db.query(`select 1 from audit_log where table_name = 'meetings'`);
    expect(r.rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe("líder y backup", () => {
  it("el líder asigna su respaldo y el respaldo puede dirigir sesiones", async () => {
    await as(LEADER, `select set_group_backup($1, $2)`, [GA, BACKUP]);
    const [g] = (await db.query<{ backup_leader_id: string }>(`select backup_leader_id from groups where id = $1`, [GA])).rows;
    expect(g.backup_leader_id).toBe(BACKUP);

    const mid = await sessionId(GA, 4);
    await as(LEADER, `select set_session_facilitator($1, $2)`, [mid, BACKUP]);
    await save(BACKUP, "2026-03-24", [S1, S3]);
    const [m] = (await db.query<{ status: string; facilitator_id: string }>(`select status, facilitator_id from meetings where id = $1`, [mid])).rows;
    expect(m).toEqual({ status: "realizada", facilitator_id: BACKUP });
  });

  it("corregir la lista después no le quita la sesión al backup", async () => {
    await save(LEADER, "2026-03-24", [S1, S2, S3]);
    const [m] = (await db.query<{ facilitator_id: string }>(`select facilitator_id from meetings where id = $1`, [await sessionId(GA, 4)])).rows;
    expect(m.facilitator_id).toBe(BACKUP);
  });

  it("el respaldo debe ser líder o más y distinto del titular", async () => {
    expect(await failure(LEADER, `select set_group_backup($1, $2)`, [GA, LEADER])).toContain("distinta del líder");
    expect(await failure(LEADER, `select set_group_backup($1, $2)`, [GA, S1])).toContain("al menos líder");
  });

  it("solo quien administra el grupo asigna respaldo; el backup no se nombra a sí mismo ni a otros", async () => {
    expect(await failure(S1, `select set_group_backup($1, $2)`, [GA, LEADER2])).toContain("No tienes permiso");
    expect(await failure(BACKUP, `select set_group_backup($1, $2)`, [GA, LEADER2])).toContain("No tienes permiso");
  });

  it("quien dirige una sesión debe ser del equipo del grupo", async () => {
    expect(await failure(LEADER, `select set_session_facilitator($1, $2)`, [await sessionId(GA, 8), OUTSIDER])).toContain("líder, el monitor o el respaldo");
  });

  it("la búsqueda de respaldos pide al menos 3 letras y no ofrece alumnos", async () => {
    expect(await as(LEADER, `select * from search_backup_candidates($1, 'Ba')`, [GA])).toHaveLength(0);
    const r = await as<{ full_name: string }>(LEADER, `select * from search_backup_candidates($1, 'backup')`, [GA]);
    expect(r.map((x) => x.full_name)).toEqual(["Backup Perez"]);
    expect(await as(LEADER, `select * from search_backup_candidates($1, 'Alumno')`, [GA])).toHaveLength(0);
    expect(await failure(S1, `select * from search_backup_candidates($1, 'backup')`, [GA])).toContain("No tienes permiso");
  });

  it("el backup no administra el grupo: no replanifica, no cancela y no acredita", async () => {
    expect(await failure(BACKUP, `select cancel_session($1)`, [await sessionId(GA, 9)])).toContain("No tienes permiso");
    expect(await failure(BACKUP, `select accredit_session($1)`, [await sessionId(GA, 1)])).toContain("Solo el líder");
  });
});

describe("acreditar desde la sesión", () => {
  it("acredita solo a quienes asistieron y solo las unidades de esa posición del plan", async () => {
    const mid = await sessionId(GA, 1);
    const r = await one<{ accredit_session: { acreditadas: number; ya_acreditadas: number; omitidas: unknown[] } }>(LEADER, `select accredit_session($1)`, [mid]);
    // semana 1: S1 presente, S2 justificado, S3 ausente → solo S1
    expect(r.accredit_session).toEqual({ acreditadas: 1, ya_acreditadas: 0, omitidas: [] });
    const rows = await db.query<{ person_id: string; unit_id: string; method: string }>(
      `select ce.person_id, uc.unit_id, uc.method from unit_completions uc join curriculum_enrollments ce on ce.id = uc.curriculum_enrollment_id`);
    expect(rows.rows).toEqual([{ person_id: S1, unit_id: U1, method: "asistencia_validada" }]);
  });

  it("repetir no duplica", async () => {
    const r = await one<{ accredit_session: { acreditadas: number; ya_acreditadas: number } }>(LEADER, `select accredit_session($1)`, [await sessionId(GA, 1)]);
    expect(r.accredit_session).toMatchObject({ acreditadas: 0, ya_acreditadas: 1 });
  });

  it("respeta los requisitos: una unidad no se acredita si falta su requisito", async () => {
    await db.query(`insert into unit_prerequisites values ($1, $2)`, [U3, U2]);
    // la posición 3 aún no se realizó
    expect(await failure(LEADER, `select accredit_session($1)`, [await sessionId(GA, 3)])).toContain("Primero pasa lista");
    await save(LEADER, "2026-03-17", [S1, S2]);
    const r = await one<{ accredit_session: { acreditadas: number; omitidas: { motivo: string }[] } }>(LEADER, `select accredit_session($1)`, [await sessionId(GA, 3)]);
    expect(r.accredit_session.acreditadas).toBe(0);
    expect(r.accredit_session.omitidas).toHaveLength(2);
    expect(r.accredit_session.omitidas[0].motivo).toContain("Faltan 1 unidades");
  });

  it("al acreditar la unidad previa, la siguiente sí avanza, y quien faltó a la sesión 2 no avanza solo", async () => {
    const r2 = await one<{ accredit_session: { acreditadas: number } }>(LEADER, `select accredit_session($1)`, [await sessionId(GA, 2)]);
    expect(r2.accredit_session.acreditadas).toBe(2); // S1 y S2 estuvieron el 12 de marzo
    const r3 = await one<{ accredit_session: { acreditadas: number } }>(LEADER, `select accredit_session($1)`, [await sessionId(GA, 3)]);
    expect(r3.accredit_session.acreditadas).toBe(2); // S1 y S2
    const per = await db.query<{ person_id: string; n: number }>(
      `select ce.person_id, count(*)::int n from unit_completions uc join curriculum_enrollments ce on ce.id = uc.curriculum_enrollment_id group by 1 order by 1`);
    expect(per.rows).toEqual([{ person_id: S1, n: 3 }, { person_id: S2, n: 2 }]);
    // S3 asistió a la 4, pero no tiene nada acreditado en 1–3: asistir no rellena huecos
    const s3 = await db.query(`select 1 from unit_completions uc join curriculum_enrollments ce on ce.id = uc.curriculum_enrollment_id where ce.person_id = $1`, [S3]);
    expect(s3.rows).toHaveLength(0);
  });

  it("el avance de S2 muestra la unidad 1 como siguiente pendiente (era justificado esa semana)", async () => {
    const ce = (await db.query<{ id: string }>(`select id from curriculum_enrollments where person_id = $1`, [S2])).rows[0].id;
    const p = await one<{ units_done: number; next_unit_title: string }>(S2, `select * from curriculum_progress($1)`, [ce]);
    expect(p.units_done).toBe(2);
    expect(p.next_unit_title).toBe("Uno");
  });
});

describe("recuperación", () => {
  let plan: string;

  it("una persona pide ponerse al día y quien administra el grupo lo ve", async () => {
    const ce = (await db.query<{ id: string }>(`select id from curriculum_enrollments where person_id = $1`, [S2])).rows[0].id;
    plan = (await one<{ request_catchup: string }>(S2, `select request_catchup($1, 'faltó la semana 1')`, [ce])).request_catchup;
    const seen = await as<{ id: string }>(LEADER, `select id from catchup_plans where id = $1`, [plan]);
    expect(seen).toHaveLength(1);
    expect(await as(OUTSIDER, `select id from catchup_plans where id = $1`, [plan])).toHaveLength(0);
  });

  it("el líder asigna responsable y fecha; resolver registra cuándo", async () => {
    await as(LEADER, `update catchup_plans set responsible_id = $2, status = 'en_curso', follow_up_on = '2026-12-01' where id = $1`, [plan, LEADER]);
    let [p] = (await db.query<{ status: string; resolved_at: string | null }>(`select status, resolved_at from catchup_plans where id = $1`, [plan])).rows;
    expect(p).toEqual({ status: "en_curso", resolved_at: null });
    await as(COORD, `update catchup_plans set status = 'resuelto' where id = $1`, [plan]);
    [p] = (await db.query<{ status: string; resolved_at: string | null }>(`select status, resolved_at from catchup_plans where id = $1`, [plan])).rows;
    expect(p.status).toBe("resuelto");
    expect(p.resolved_at).toBeTruthy();
  });

  it("nadie ajeno al grupo modifica una recuperación", async () => {
    const rows = await as(OUTSIDER, `update catchup_plans set status = 'cancelado' where id = $1 returning id`, [plan]);
    expect(rows).toHaveLength(0);
  });
});

describe("alertas y cobertura", () => {
  it("avisa de sesiones planificadas sin registrar y de la falta de reuniones recientes", async () => {
    const rows = await as<{ kind: string; detail: string; group_id: string }>(LEADER, `select kind, detail, group_id from my_alerts()`);
    const pending = rows.find((r) => r.kind === "sesion_pendiente" && r.group_id === GA);
    expect(pending?.detail).toMatch(/sesiones planificadas sin registrar/);
    // las sesiones futuras del calendario no confunden a "sin reunión": la última real fue en marzo
    expect(rows.some((r) => r.kind === "sin_reunion" && r.group_id === GA)).toBe(true);
  });

  it("las faltas justificadas no disparan alertas de ausencia", async () => {
    const rows = await as<{ kind: string; person_id: string | null }>(COORD, `select kind, person_id from my_alerts()`);
    expect(rows.some((r) => r.kind === "ausente" && r.person_id === S2)).toBe(false);
  });

  it("el panel separa calendario, sesiones realizadas, atrasadas y cobertura de respaldo", async () => {
    const [c] = await as<Record<string, number>>(COORD, `select * from panel_cobertura()`);
    expect(c).toMatchObject({
      grupos_activos: 2,
      con_calendario: 2,
      sin_calendario: 0,
      sin_lider: 0,
      sin_respaldo: 1, // el grupo B no tiene respaldo
      sesiones_canceladas: 0, // la cancelada se reprogramó
    });
    expect(c.sesiones_realizadas).toBeGreaterThanOrEqual(4);
    expect(c.sesiones_con_respaldo).toBe(1);
    expect(c.sesiones_atrasadas).toBeGreaterThan(0);
  });

  it("un alumno no accede al panel de cobertura de otros", async () => {
    const [c] = await as<Record<string, number>>(S1, `select * from panel_cobertura()`);
    expect(c.grupos_activos).toBe(0);
  });
});

describe("la migración 008", () => {
  it("es repetible: ejecutarla otra vez no cambia los datos", async () => {
    const q = `select (select count(*) from meetings)::int m, (select count(*) from attendance)::int a, (select count(*) from unit_completions)::int u`;
    const before = (await db.query(q)).rows[0];
    await db.exec(sql("008_calendario.sql"));
    expect((await db.query(q)).rows[0]).toEqual(before);
  });
});
