import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// GP 2.0 · Fase 1: núcleo de dominio (supabase/v2/006_gp2_nucleo.sql)

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
const BASE = ["001_schema.sql", "004_rendimiento.sql", "005_panel.sql"];

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), COORD = id(2), OTHER_COORD = id(3), MONITOR = id(4), LEADER = id(5), BACKUP = id(6);
const S1 = id(7), S2 = id(8), S3 = id(9), WOMAN = id(10), OUTSIDER = id(11), REVIEWER = id(12);
const CUR = id(100), CUR2 = id(101), SEASON = id(102), SEASON2 = id(103);
const CY1 = id(104), CY2 = id(105), GA = id(106), GB = id(107), GNOCYCLE = id(108);
const U1 = id(110), U2 = id(111), U3 = id(112);

async function newDb(withSupabase = true) {
  const d = new PGlite();
  if (withSupabase) await d.exec(SUPABASE_STUBS);
  return d;
}

async function addPeople(d: PGlite, people: [string, string][]) {
  for (const [uid, name] of people) {
    await d.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      uid, `${uid}@test.local`, JSON.stringify({ full_name: name }),
    ]);
  }
}

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

beforeAll(async () => {
  db = await newDb();
  for (const f of BASE) await db.exec(sql(f));
  await db.exec(sql("006_gp2_nucleo.sql"));
  await db.exec(GRANTS);

  await addPeople(db, [
    [ADMIN, "Admin"], [COORD, "Coordinador"], [OTHER_COORD, "Otro coordinador"], [MONITOR, "Monitor"], [LEADER, "Líder"],
    [BACKUP, "Backup"], [S1, "Alumno Uno"], [S2, "Alumno Dos"], [S3, "Alumno Tres"], [WOMAN, "Alumna"],
    [OUTSIDER, "Ajeno"], [REVIEWER, "Revisor"],
  ]);
  await db.exec(`
    update profiles set role = 'admin' where id = '${ADMIN}';
    update profiles set role = 'coordinador' where id in ('${COORD}', '${OTHER_COORD}');
    update profiles set role = 'monitor' where id = '${MONITOR}';
    update profiles set role = 'lider' where id in ('${LEADER}', '${BACKUP}');
    update profiles set gender = 'hombre', birth_date = '1990-01-01', terms_accepted_at = now()
      where id in ('${S1}', '${S2}', '${S3}', '${OUTSIDER}');
    update profiles set gender = 'mujer', birth_date = '1990-01-01', terms_accepted_at = now() where id = '${WOMAN}';

    insert into curriculums (id, name, audience, default_capacity) values ('${CUR}', 'Hombres', 'hombres', 10);
    insert into curriculums (id, name) values ('${CUR2}', 'Otro programa');
    insert into curriculum_coordinators values ('${CUR}', '${COORD}'), ('${CUR2}', '${OTHER_COORD}');
    insert into seasons (id, name, start_date, end_date, status) values ('${SEASON}', '2026', '2026-01-05', '2026-12-31', 'inscripciones');
    insert into seasons (id, name, start_date, end_date, status) values ('${SEASON2}', '2027', '2027-01-04', '2027-12-31', 'inscripciones');
    insert into cycles (id, curriculum_id, number, formative_year) values ('${CY1}', '${CUR}', 1, 1);
    insert into cycles (id, curriculum_id, number, formative_year) values ('${CY2}', '${CUR}', 2, 2);
    insert into lessons (id, cycle_id, number, title) values
      ('${U1}', '${CY1}', 1, 'Uno'), ('${U2}', '${CY1}', 2, 'Dos'), ('${U3}', '${CY1}', 3, 'Tres');
    insert into groups (id, season_id, cycle_id, name, leader_id, monitor_id, backup_leader_id, capacity, modality)
      values ('${GA}', '${SEASON}', '${CY1}', 'Grupo A', '${LEADER}', '${MONITOR}', '${BACKUP}', 5, 'presencial');
    insert into groups (id, season_id, cycle_id, name, leader_id, capacity, modality)
      values ('${GB}', '${SEASON}', '${CY1}', 'Grupo B virtual', '${LEADER}', 5, 'virtual');
    insert into curriculum_reviewers values ('${CUR}', '${REVIEWER}');
  `);
});

describe("compatibilidad con el modelo anterior", () => {
  it("un grupo creado solo con ciclo hereda currículum y versión", async () => {
    const [g] = (await db.query<{ curriculum_id: string; version_id: string; formative_year: number }>(
      `select curriculum_id, version_id, formative_year from groups where id = $1`, [GA])).rows;
    expect(g.curriculum_id).toBe(CUR);
    expect(g.version_id).toBeTruthy();
  });

  it("un currículum nuevo nace con su versión 1 vigente", async () => {
    const r = await db.query(`select version, status, is_current from curriculum_versions where curriculum_id = $1`, [CUR]);
    expect(r.rows).toEqual([{ version: 1, status: "publicado", is_current: true }]);
  });

  it("un grupo puede existir sin ciclo", async () => {
    await db.query(
      `insert into groups (id, season_id, curriculum_id, name, leader_id, modality) values ($1, $2, $3, 'Sin ciclo', $4, 'virtual')`,
      [GNOCYCLE, SEASON, CUR, LEADER]);
    const [r] = await as<{ curriculum_name: string }>(ADMIN, `select curriculum_name from group_overview where id = $1`, [GNOCYCLE]);
    expect(r.curriculum_name).toBe("Hombres");
    const rows = await as<{ nombre: string; grupos_activos: number }>(ADMIN, `select nombre, grupos_activos from panel_curriculums() where nombre = 'Hombres'`);
    expect(rows[0].grupos_activos).toBe(3);
  });

  it("la inscripción antigua (enroll) crea y enlaza la inscripción curricular", async () => {
    await as(S1, `select enroll($1)`, [GA]);
    const r = await db.query<{ n: number; linked: number }>(
      `select (select count(*) from curriculum_enrollments where person_id = $1 and curriculum_id = $2)::int as n,
              (select count(*) from enrollments where person_id = $1 and curriculum_enrollment_id is not null)::int as linked`, [S1, CUR]);
    expect(r.rows[0]).toEqual({ n: 1, linked: 1 });
  });
});

describe("inscripción curricular única y continua", () => {
  it("no admite dos inscripciones abiertas de la misma persona en el mismo currículum", async () => {
    const msg = await failure(ADMIN, `insert into curriculum_enrollments (person_id, curriculum_id) values ($1, $2)`, [S1, CUR]);
    expect(msg).toContain("ce_one_open");
  });

  it("enroll_curriculum es idempotente: devuelve la misma inscripción", async () => {
    const a = await one<{ enroll_curriculum: string }>(S1, `select enroll_curriculum($1)`, [CUR]);
    const b = await one<{ enroll_curriculum: string }>(S1, `select enroll_curriculum($1)`, [CUR]);
    expect(a.enroll_curriculum).toBe(b.enroll_curriculum);
  });

  it("aplica la elegibilidad por perfil", async () => {
    expect(await failure(WOMAN, `select enroll_curriculum($1)`, [CUR])).toContain("no está disponible para tu perfil");
  });

  it("cambiar de grupo y de modalidad conserva la inscripción y no duplica nada", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    await as(S1, `select change_group($1, $2)`, [ce, GB]);
    const ms = await db.query<{ group_id: string; status: string; left_reason: string | null; curriculum_enrollment_id: string }>(
      `select group_id, status, left_reason, curriculum_enrollment_id from enrollments where person_id = $1 order by enrolled_at, group_id`, [S1]);
    expect(ms.rows).toHaveLength(2);
    expect(ms.rows.every((m) => m.curriculum_enrollment_id === ce)).toBe(true);
    expect(ms.rows.find((m) => m.group_id === GA)).toMatchObject({ status: "cancelado", left_reason: "cambio_de_grupo" });
    expect(ms.rows.find((m) => m.group_id === GB)?.status).toBe("en_curso");
    const n = await db.query(`select 1 from curriculum_enrollments where person_id = $1 and curriculum_id = $2`, [S1, CUR]);
    expect(n.rows).toHaveLength(1);
  });

  it("volver a un grupo anterior reactiva la membresía sin duplicar", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    await as(S1, `select change_group($1, $2)`, [ce, GA]);
    const ms = await db.query(`select 1 from enrollments where person_id = $1`, [S1]);
    expect(ms.rows).toHaveLength(2);
    const [active] = (await db.query<{ n: number }>(`select count(*)::int n from enrollments where person_id = $1 and status = 'en_curso'`, [S1])).rows;
    expect(active.n).toBe(1);
  });

  it("no se puede cambiar a un grupo de otro programa", async () => {
    await db.query(`insert into cycles (id, curriculum_id, number) values ($1, $2, 1)`, [id(120), CUR2]);
    await db.query(`insert into groups (id, season_id, cycle_id, name, modality) values ($1, $2, $3, 'Otro', 'virtual')`, [id(121), SEASON, id(120)]);
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    expect(await failure(S1, `select change_group($1, $2)`, [ce, id(121)])).toContain("pertenece a otro programa");
  });

  it("nadie puede mover la inscripción de otra persona", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    expect(await failure(OUTSIDER, `select change_group($1, $2)`, [ce, GB])).toBeTruthy();
  });
});

describe("asistencia no es acreditación", () => {
  it("pasar lista no acredita ninguna unidad", async () => {
    const enr = (await one<{ id: string }>(ADMIN, `select id from enrollments where person_id = $1 and group_id = $2`, [S1, GA])).id;
    await as(LEADER, `select save_attendance($1, '2026-03-02', 3, $2::uuid[], '{}')`, [GA, [enr]]);
    const c = await db.query(`select 1 from unit_completions`);
    expect(c.rows).toHaveLength(0);
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    const p = await one<{ units_done: number; next_unit_title: string }>(S1, `select * from curriculum_progress($1)`, [ce]);
    expect(p.units_done).toBe(0);
    expect(p.next_unit_title).toBe("Uno");
  });

  it("asistir a la sesión 3 no deja acreditadas la 1 y la 2", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    await as(LEADER, `select record_unit_completion($1, $2, 'asistencia_validada')`, [ce, U3]);
    const p = await one<{ units_total: number; units_done: number; next_unit_title: string; pct: string }>(S1, `select * from curriculum_progress($1)`, [ce]);
    expect(p.units_total).toBe(3);
    expect(p.units_done).toBe(1);
    // el siguiente es la primera pendiente, no "la última + 1"
    expect(p.next_unit_title).toBe("Uno");
  });

  it("el alumno no puede acreditarse a sí mismo", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    expect(await failure(S1, `select record_unit_completion($1, $2, 'manual')`, [ce, U1])).toContain("No tienes permiso");
  });

  it("una unidad con requisito no se acredita sin completar el requisito", async () => {
    await db.query(`insert into unit_prerequisites values ($1, $2)`, [U2, U1]);
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    expect(await failure(LEADER, `select record_unit_completion($1, $2, 'asistencia_validada')`, [ce, U2])).toContain("Faltan 1 unidades");
    await as(LEADER, `select record_unit_completion($1, $2, 'asistencia_validada')`, [ce, U1]);
    await as(LEADER, `select record_unit_completion($1, $2, 'asistencia_validada')`, [ce, U2]);
    const p = await one<{ units_done: number; next_unit_id: string | null }>(S1, `select * from curriculum_progress($1)`, [ce]);
    expect(p.units_done).toBe(3);
    expect(p.next_unit_id).toBeNull();
  });

  it("acreditar dos veces la misma unidad no duplica", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    await as(LEADER, `select record_unit_completion($1, $2, 'manual')`, [ce, U1]);
    const r = await db.query(`select 1 from unit_completions where curriculum_enrollment_id = $1`, [ce]);
    expect(r.rows).toHaveLength(3);
  });

  it("una unidad de otro programa no se puede acreditar", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    await db.query(`insert into lessons (id, cycle_id, number, title) values ($1, $2, 1, 'Ajena')`, [id(122), id(120)]);
    expect(await failure(ADMIN, `select record_unit_completion($1, $2, 'manual')`, [ce, id(122)])).toContain("no pertenece a la ruta");
  });

  it("solo el administrador o el coordinador retiran una acreditación", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    expect(await failure(LEADER, `select revoke_unit_completion($1, $2)`, [ce, U3])).toContain("Solo el administrador");
    await as(COORD, `select revoke_unit_completion($1, $2)`, [ce, U3]);
    const p = await one<{ units_done: number }>(S1, `select * from curriculum_progress($1)`, [ce]);
    expect(p.units_done).toBe(2);
  });
});

describe("pausa, reanudación y recuperación", () => {
  it("pausar conserva lo acreditado y cierra la membresía vigente", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    await as(S1, `select pause_curriculum_enrollment($1, 'viaje')`, [ce]);
    const [c] = (await db.query<{ status: string; pause_reason: string }>(`select status, pause_reason from curriculum_enrollments where id = $1`, [ce])).rows;
    expect(c).toEqual({ status: "pausado", pause_reason: "viaje" });
    const act = await db.query(`select 1 from enrollments where person_id = $1 and status = 'en_curso'`, [S1]);
    expect(act.rows).toHaveLength(0);
    const done = await db.query(`select 1 from unit_completions where curriculum_enrollment_id = $1`, [ce]);
    expect(done.rows).toHaveLength(2);
  });

  it("con la inscripción pausada no se elige grupo", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    expect(await failure(S1, `select change_group($1, $2)`, [ce, GB])).toContain("Reanuda tu inscripción");
  });

  it("al volver no se reinicia: sigue en la primera unidad pendiente", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    await as(S1, `select resume_curriculum_enrollment($1)`, [ce]);
    const p = await one<{ units_done: number; next_unit_title: string }>(S1, `select * from curriculum_progress($1)`, [ce]);
    expect(p.units_done).toBe(2);
    expect(p.next_unit_title).toBe("Tres");
  });

  it("los grupos compatibles son los abiertos de su ruta, sin prometer coincidencia con la unidad", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    const rows = await as<{ group_id: string; modality: string }>(S1, `select group_id, modality from compatible_groups($1)`, [ce]);
    const ids = rows.map((r) => r.group_id);
    expect(ids).toContain(GA);
    expect(ids).toContain(GB);
    expect(ids).not.toContain(id(121));
  });

  it("si no hay grupo compatible se registra un plan de recuperación, una sola vez", async () => {
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    const a = await one<{ request_catchup: string }>(S1, `select request_catchup($1, 'no calza el horario')`, [ce]);
    const b = await one<{ request_catchup: string }>(S1, `select request_catchup($1)`, [ce]);
    expect(a.request_catchup).toBe(b.request_catchup);
    const [p] = (await db.query<{ status: string; pending_unit_id: string }>(`select status, pending_unit_id from catchup_plans where id = $1`, [a.request_catchup])).rows;
    expect(p).toEqual({ status: "pendiente", pending_unit_id: U3 });
  });
});

describe("líder, backup y coordinadores", () => {
  it("el backup puede pasar lista pero queda registrado como facilitador", async () => {
    const enr = (await one<{ id: string }>(ADMIN, `select id from enrollments where person_id = $1 and group_id = $2`, [S1, GA])).id;
    await as(BACKUP, `select save_attendance($1, '2026-03-09', 4, $2::uuid[], '{}')`, [GA, [enr]]);
    const [m] = (await db.query<{ facilitator_id: string }>(`select facilitator_id from meetings where group_id = $1 and held_on = '2026-03-09'`, [GA])).rows;
    expect(m.facilitator_id).toBe(BACKUP);
  });

  it("el backup no administra: no inscribe ni acredita", async () => {
    expect(await failure(BACKUP, `select enroll_person($1, $2)`, [GA, S2])).toContain("No tienes permiso");
    const ce = (await one<{ id: string }>(ADMIN, `select id from curriculum_enrollments where person_id = $1`, [S1])).id;
    expect(await failure(BACKUP, `select record_unit_completion($1, $2, 'manual')`, [ce, U3])).toContain("No tienes permiso");
  });

  it("el backup ve a los inscritos del grupo y a nadie más", async () => {
    const rows = await as<{ person_id: string }>(BACKUP, `select person_id from enrollments`);
    expect(rows.map((r) => r.person_id)).toContain(S1);
    const profiles = await as<{ id: string }>(BACKUP, `select id from profiles where id = $1`, [OUTSIDER]);
    expect(profiles).toHaveLength(0);
  });

  it("un alumno que no es backup no pasa lista", async () => {
    expect(await failure(S2, `select save_attendance($1, '2026-03-16', 5, '{}', '{}')`, [GA])).toContain("No tienes permiso");
  });

  it("el coordinador de otro programa no ve ni acredita en este", async () => {
    const ce = (await one<{ id: string }>(ADMIN, `select id from curriculum_enrollments where person_id = $1`, [S1])).id;
    expect(await as(OTHER_COORD, `select id from curriculum_enrollments where id = $1`, [ce])).toHaveLength(0);
    expect(await failure(OTHER_COORD, `select record_unit_completion($1, $2, 'manual')`, [ce, U3])).toContain("No tienes permiso");
  });

  it("el coordinador del programa ve las inscripciones curriculares y el líder las de su grupo", async () => {
    expect((await as(COORD, `select id from curriculum_enrollments`)).length).toBeGreaterThan(0);
    expect((await as(LEADER, `select id from curriculum_enrollments`)).length).toBeGreaterThan(0);
    expect(await as(S2, `select id from curriculum_enrollments`)).toHaveLength(0);
  });
});

describe("dirección y enlace protegidos", () => {
  it("la dirección escrita en el grupo se guarda en la tabla protegida", async () => {
    await db.query(`update groups set address = 'Calle Falsa 123' where id = $1`, [GA]);
    const g = await db.query<{ address: string | null }>(`select address from groups where id = $1`, [GA]);
    expect(g.rows[0].address).toBeNull();
    const p = await db.query<{ address: string }>(`select address from group_private where group_id = $1`, [GA]);
    expect(p.rows[0].address).toBe("Calle Falsa 123");
  });

  it("una dirección escrita al crear el grupo también queda protegida", async () => {
    await db.query(
      `insert into groups (id, season_id, curriculum_id, name, modality, address) values ($1, $2, $3, 'Con dirección', 'presencial', 'Av. Siempre Viva 742')`,
      [id(130), SEASON, CUR]);
    const p = await db.query<{ address: string }>(`select address from group_private where group_id = $1`, [id(130)]);
    expect(p.rows[0].address).toBe('Av. Siempre Viva 742');
  });

  it("un inscrito ve la dirección; un desconocido ve el grupo sin dirección", async () => {
    // S1 volvió de su pausa: retoma el grupo A
    const ce = (await one<{ id: string }>(S1, `select id from curriculum_enrollments where curriculum_id = $1`, [CUR])).id;
    await as(S1, `select change_group($1, $2)`, [ce, GA]);
    const [mine] = await as<{ address: string | null }>(S1, `select address from group_overview where id = $1`, [GA]);
    expect(mine.address).toBe("Calle Falsa 123");
    // un grupo abierto a inscripción se ve en el catálogo, pero sin su dirección
    const [theirs] = await as<{ name: string; address: string | null }>(OUTSIDER, `select name, address from group_overview where id = $1`, [id(130)]);
    expect(theirs.name).toBe("Con dirección");
    expect(theirs.address).toBeNull();
    expect(await as(OUTSIDER, `select * from group_private`)).toHaveLength(0);
  });

  it("líder, backup y coordinador ven la dirección", async () => {
    for (const uid of [LEADER, BACKUP, COORD]) {
      const [r] = await as<{ address: string | null }>(uid, `select address from group_overview where id = $1`, [GA]);
      expect(r.address).toBe("Calle Falsa 123");
    }
  });

  it("el enlace online debe ser https", async () => {
    expect(await failure(LEADER, `insert into group_private (group_id, online_url) values ($1, 'http://zoom.test/x')`, [GB])).toContain("online_url");
    await as(LEADER, `insert into group_private (group_id, online_url) values ($1, 'https://zoom.test/x')`, [GB]);
    expect(await as(OUTSIDER, `select * from group_private`)).toHaveLength(0);
  });

  it("un líder no escribe datos privados de un grupo ajeno", async () => {
    expect(await failure(OUTSIDER, `insert into group_private (group_id, address) values ($1, 'x')`, [GA])).toBeTruthy();
  });
});

describe("cerrar un grupo no altera el aprendizaje", () => {
  it("cerrar el grupo y la temporada conserva inscripción curricular y acreditaciones", async () => {
    const ce = (await one<{ id: string }>(ADMIN, `select id from curriculum_enrollments where person_id = $1`, [S1])).id;
    const before = await db.query(`select 1 from unit_completions where curriculum_enrollment_id = $1`, [ce]);
    await as(COORD, `select * from close_group($1)`, [GA]);
    await db.query(`update seasons set status = 'cerrada' where id = $1`, [SEASON]);
    const after = await db.query(`select 1 from unit_completions where curriculum_enrollment_id = $1`, [ce]);
    expect(after.rows).toHaveLength(before.rows.length);
    const [c] = (await db.query<{ status: string }>(`select status from curriculum_enrollments where id = $1`, [ce])).rows;
    expect(c.status).toBe("activo");
    const p = await one<{ units_done: number }>(S1, `select * from curriculum_progress($1)`, [ce]);
    expect(p.units_done).toBe(2);
  });
});

describe("calendario anual de 36 posiciones", () => {
  it("genera 36 posiciones saltando las semanas de pausa", async () => {
    const last = await one<{ generate_season_weeks: string }>(ADMIN,
      `select generate_season_weeks($1, '2027-01-06', array['2027-04-05'::date, '2027-07-12'::date])::text as generate_season_weeks`, [SEASON2]);
    const w = await db.query<{ n: number; breaks: number; maxpos: number }>(
      `select count(*) filter (where position is not null)::int n, count(*) filter (where is_break)::int breaks, max(position) maxpos
         from season_weeks where season_id = $1`, [SEASON2]);
    expect(w.rows[0]).toEqual({ n: 36, breaks: 2, maxpos: 36 });
    // 36 semanas + 2 pausas: la semana 38 desde el lunes 4 de enero de 2027 empieza el 20 de septiembre
    expect(last.generate_season_weeks).toBe("2027-09-20");
  });

  it("solo el administrador define el calendario", async () => {
    expect(await failure(COORD, `select generate_season_weeks($1, '2027-01-06')`, [SEASON2])).toContain("Solo el administrador");
  });

  it("regenerar no duplica semanas", async () => {
    await as(ADMIN, `select generate_season_weeks($1, '2027-01-06')`, [SEASON2]);
    const w = await db.query(`select 1 from season_weeks where season_id = $1`, [SEASON2]);
    expect(w.rows).toHaveLength(36);
  });
});

describe("flujo editorial del currículum", () => {
  let v2: string;
  it("el coordinador crea una versión nueva y la lleva a revisión, pero no la aprueba", async () => {
    const [r] = await as<{ id: string }>(COORD,
      `insert into curriculum_versions (curriculum_id, version, label) values ($1, 2, 'Edición 2027') returning id`, [CUR]);
    v2 = r.id;
    await as(COORD, `select advance_curriculum_version($1, 'en_adaptacion')`, [v2]);
    await as(COORD, `select advance_curriculum_version($1, 'en_revision_pastoral')`, [v2]);
    expect(await failure(COORD, `select advance_curriculum_version($1, 'aprobado')`, [v2])).toContain("Solo un revisor");
  });

  it("no se puede saltar etapas ni cambiar el estado a mano", async () => {
    expect(await failure(REVIEWER, `select advance_curriculum_version($1, 'publicado')`, [v2])).toContain("No se puede pasar");
    expect(await failure(COORD, `update curriculum_versions set status = 'publicado' where id = $1`, [v2])).toContain("flujo de aprobación");
  });

  it("el revisor aprueba y publica; la anterior deja de ser la vigente", async () => {
    await as(REVIEWER, `select advance_curriculum_version($1, 'aprobado')`, [v2]);
    await as(REVIEWER, `select advance_curriculum_version($1, 'publicado')`, [v2]);
    const r = await db.query<{ version: number; is_current: boolean; status: string }>(
      `select version, is_current, status from curriculum_versions where curriculum_id = $1 order by version`, [CUR]);
    expect(r.rows).toEqual([
      { version: 1, is_current: false, status: "publicado" },
      { version: 2, is_current: true, status: "publicado" },
    ]);
    const [a] = (await db.query<{ approved_by: string }>(`select approved_by from curriculum_versions where id = $1`, [v2])).rows;
    expect(a.approved_by).toBe(REVIEWER);
  });

  it("un alumno no ve versiones sin publicar", async () => {
    const [r] = await as<{ id: string }>(COORD,
      `insert into curriculum_versions (curriculum_id, version, label) values ($1, 3, 'Borrador') returning id`, [CUR]);
    const rows = await as<{ id: string }>(S2, `select id from curriculum_versions where curriculum_id = $1`, [CUR]);
    expect(rows.map((x) => x.id)).not.toContain(r.id);
  });
});

describe("plan de 36 encuentros", () => {
  it("detecta semanas vacías y unidades sin cobertura", async () => {
    const v1 = (await db.query<{ id: string }>(`select id from curriculum_versions where curriculum_id = $1 and version = 1`, [CUR])).rows[0].id;
    const [plan] = await as<{ id: string }>(COORD, `insert into annual_learning_plans (version_id, formative_year) values ($1, 1) returning id`, [v1]);
    const [s1] = await as<{ id: string }>(COORD, `insert into learning_plan_slots (plan_id, position, kind) values ($1, 1, 'contenido') returning id`, [plan.id]);
    await as(COORD, `insert into learning_plan_slots (plan_id, position, kind) values ($1, 2, 'contenido')`, [plan.id]);
    await as(COORD, `insert into learning_plan_slot_units values ($1, $2)`, [s1.id, U1]);

    const issues = await as<{ problema: string; detalle: string }>(COORD, `select * from plan_coverage($1)`, [plan.id]);
    expect(issues.filter((i) => i.problema === "semana_vacia")).toHaveLength(34);
    expect(issues.filter((i) => i.problema === "semana_sin_contenido").map((i) => i.detalle)).toEqual(["Semana 2 (contenido)"]);
    expect(issues.filter((i) => i.problema === "unidad_sin_cobertura")).toHaveLength(2);
  });

  it("un alumno no revisa planes", async () => {
    const plan = (await db.query<{ id: string }>(`select id from annual_learning_plans limit 1`)).rows[0].id;
    expect(await failure(S2, `select * from plan_coverage($1)`, [plan])).toContain("No tienes permiso");
  });
});

describe("sedes y datos de apoyo", () => {
  it("las 9 sedes de la plataforma anterior están creadas", async () => {
    const r = await as<{ name: string }>(S2, `select name from campuses order by name`);
    expect(r).toHaveLength(9);
    expect(r.map((x) => x.name)).toContain("Punta Arenas");
  });

  it("solo el administrador edita sedes", async () => {
    await as(COORD, `update campuses set active = false where name = 'Katy'`);
    const [k] = (await db.query<{ active: boolean }>(`select active from campuses where name = 'Katy'`)).rows;
    expect(k.active).toBe(true);
  });

  it("los créditos históricos no los puede escribir un alumno", async () => {
    expect(await failure(S2, `insert into stage_credits (person_id, stage_id) values ($1, $2)`, [S2, CY1])).toBeTruthy();
  });

  it("la correspondencia de migración solo la ve el administrador", async () => {
    await db.query(`insert into migration_mapping (source, source_id, target_table) values ('v1', '10', 'curriculums')`);
    expect(await as(COORD, `select * from migration_mapping`)).toHaveLength(0);
    expect(await as(ADMIN, `select * from migration_mapping`)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Migración sobre datos que ya existían (lo que hoy hay en producción)
// ---------------------------------------------------------------------------
describe("migración 006 sobre datos reales anteriores", () => {
  let ldb: PGlite;
  const count = async (q: string) => (await ldb.query<{ n: number }>(q)).rows[0].n;

  beforeAll(async () => {
    ldb = await newDb();
    for (const f of BASE) await ldb.exec(sql(f));
    await addPeople(ldb, [[S1, "Ana"], [S2, "Beto"], [S3, "Caro"]]);
    await ldb.exec(`
      insert into curriculums (id, name) values ('${CUR}', 'Hombres'), ('${CUR2}', 'Mujeres');
      insert into seasons (id, name, start_date, end_date, status) values
        ('${SEASON}', 'Invierno 2025', '2025-03-01', '2025-05-20', 'cerrada'),
        ('${SEASON2}', '2026', '2026-01-05', '2026-12-31', 'en_curso');
      insert into cycles (id, curriculum_id, number) values ('${CY1}', '${CUR}', 1), ('${CY2}', '${CUR}', 2);
      insert into groups (id, season_id, cycle_id, name, address, modality, status)
        values ('${GA}', '${SEASON}', '${CY1}', 'Viejo', 'Calle 1', 'presencial', 'finalizado'),
               ('${GB}', '${SEASON2}', '${CY2}', 'Actual', 'Calle 2', 'presencial', 'en_curso');
      select set_config('app.skip_checks', 'on', false);
      -- S1 aprobó el ciclo 1 y cursa el 2; S2 aprobó el 1 y no siguió; S3 no completó
      insert into enrollments (person_id, group_id, status, closed_at) values
        ('${S1}', '${GA}', 'aprobado', '2025-05-20'), ('${S1}', '${GB}', 'en_curso', null),
        ('${S2}', '${GA}', 'aprobado', '2025-05-20'),
        ('${S3}', '${GA}', 'no_completo', '2025-05-20');
      select set_config('app.skip_checks', 'off', false);
    `);
    await ldb.exec(sql("006_gp2_nucleo.sql"));
  });

  it("cada grupo recibe su currículum y versión, y la dirección pasa a la tabla protegida", async () => {
    expect(await count(`select count(*)::int n from groups where curriculum_id is null or version_id is null`)).toBe(0);
    expect(await count(`select count(*)::int n from groups where address is not null`)).toBe(0);
    const r = await ldb.query<{ address: string }>(`select address from group_private order by address`);
    expect(r.rows.map((x) => x.address)).toEqual(["Calle 1", "Calle 2"]);
  });

  it("crea una inscripción curricular por persona y currículum, no por grupo", async () => {
    expect(await count(`select count(*)::int n from curriculum_enrollments`)).toBe(3);
    const r = await ldb.query<{ person_id: string; status: string; imported: boolean }>(
      `select person_id, status, imported from curriculum_enrollments order by person_id`);
    const byPerson = Object.fromEntries(r.rows.map((x) => [x.person_id, x]));
    expect(byPerson[S1]).toMatchObject({ status: "activo", imported: true });
    expect(byPerson[S2].status).toBe("pausado");
    expect(byPerson[S3].status).toBe("pausado");
  });

  it("todas las membresías quedan enlazadas", async () => {
    expect(await count(`select count(*)::int n from enrollments where curriculum_enrollment_id is null`)).toBe(0);
    expect(await count(`select count(distinct curriculum_enrollment_id)::int n from enrollments where person_id = '${S1}'`)).toBe(1);
  });

  it("lo que se daba por aprobado queda como crédito histórico por revisar, no como unidades", async () => {
    const r = await ldb.query<{ person_id: string; review_status: string }>(`select person_id, review_status from stage_credits order by person_id`);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.every((x) => x.review_status === "por_revisar")).toBe(true);
    expect(await count(`select count(*)::int n from unit_completions`)).toBe(0);
  });

  it("las temporadas antiguas de pocas semanas quedan marcadas como histórico", async () => {
    const r = await ldb.query<{ name: string; kind: string; year: number }>(`select name, kind, year from seasons order by start_date`);
    expect(r.rows).toEqual([
      { name: "Invierno 2025", kind: "legado", year: 2025 },
      { name: "2026", kind: "anual", year: 2026 },
    ]);
  });

  it("es idempotente: ejecutarla otra vez no cambia nada", async () => {
    const q = `select (select count(*) from curriculum_enrollments)::int a, (select count(*) from curriculum_versions)::int b,
                      (select count(*) from stage_credits)::int c, (select count(*) from group_private)::int d,
                      (select count(*) from campuses)::int e, (select count(*) from enrollments)::int f`;
    const before = (await ldb.query(q)).rows[0];
    await ldb.exec(sql("006_gp2_nucleo.sql"));
    expect((await ldb.query(q)).rows[0]).toEqual(before);
  });
});
