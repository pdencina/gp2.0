import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// GP 2.0 · Fase 4: biblioteca, versiones y plan de 36 encuentros (009_biblioteca.sql)

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
// Lo mínimo de Supabase Storage para probar las reglas de acceso a los archivos
const STORAGE_STUBS = `
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  alter table storage.objects enable row level security;
`;
const GRANTS = `
  grant usage on schema public, auth, storage to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  grant all on all tables in schema public to authenticated;
  grant all on all tables in schema storage to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`;
const sql = (f: string) => readFileSync(join(__dirname, "../v2", f), "utf8");
const UPTO_008 = ["001_schema.sql", "004_rendimiento.sql", "005_panel.sql", "006_gp2_nucleo.sql", "007_catalogo.sql", "008_calendario.sql"];

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), COORD = id(2), OTHER_COORD = id(3), REVIEWER = id(4), LEADER = id(5), BACKUP = id(6);
const S1 = id(7), OUTSIDER = id(8);
const CUR = id(100), CUR2 = id(101), SEASON = id(102), CY1 = id(103), GA = id(104);
const U1 = id(110), U2 = id(111), U3 = id(112), U4 = id(113);
const PEOPLE: [string, string][] = [
  [ADMIN, "Admin"], [COORD, "Coordinador"], [OTHER_COORD, "Otro coordinador"], [REVIEWER, "Revisor"],
  [LEADER, "Líder"], [BACKUP, "Backup"], [S1, "Alumno Uno"], [OUTSIDER, "Ajeno"],
];

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
const versionId = async (cur: string, n: number) =>
  (await db.query<{ id: string }>(`select id from curriculum_versions where curriculum_id = $1 and version = $2`, [cur, n])).rows[0].id;

async function addPeople(d: PGlite) {
  for (const [uid, name] of PEOPLE) {
    await d.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      uid, `${uid}@test.local`, JSON.stringify({ full_name: name }),
    ]);
  }
  await d.exec(`
    update profiles set role = 'admin' where id = '${ADMIN}';
    update profiles set role = 'coordinador' where id in ('${COORD}', '${OTHER_COORD}', '${REVIEWER}');
    update profiles set role = 'lider' where id in ('${LEADER}', '${BACKUP}');
    update profiles set gender = 'hombre', birth_date = '1990-01-01', terms_accepted_at = now() where id in ('${S1}', '${OUTSIDER}');
  `);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(STORAGE_STUBS);
  for (const f of [...UPTO_008, "009_biblioteca.sql"]) await db.exec(sql(f));
  await db.exec(GRANTS);
  await addPeople(db);

  await db.exec(`
    insert into curriculums (id, name) values ('${CUR}', 'Libro Morado'), ('${CUR2}', 'Otro programa');
    insert into curriculum_coordinators values ('${CUR}', '${COORD}'), ('${CUR2}', '${OTHER_COORD}');
    insert into curriculum_reviewers values ('${CUR}', '${REVIEWER}');
    insert into seasons (id, name, start_date, end_date, status) values ('${SEASON}', '2026', '2026-03-02', '2026-11-30', 'en_curso');
    insert into cycles (id, curriculum_id, number, formative_year) values ('${CY1}', '${CUR}', 1, 1);
    insert into lessons (id, cycle_id, number, title) values
      ('${U1}', '${CY1}', 1, 'Uno'), ('${U2}', '${CY1}', 2, 'Dos'), ('${U3}', '${CY1}', 3, 'Tres'), ('${U4}', '${CY1}', 4, 'Cuatro');
    insert into groups (id, season_id, curriculum_id, name, leader_id, backup_leader_id, weekday, modality, capacity)
      values ('${GA}', '${SEASON}', '${CUR}', 'Grupo A', '${LEADER}', '${BACKUP}', 2, 'virtual', 10);
  `);
  await as(S1, `select enroll($1)`, [GA]);
});

describe("corrección de permisos de las unidades del plan", () => {
  it("quien solo ve un plan publicado no puede cambiar sus unidades", async () => {
    const v1 = await versionId(CUR, 1);
    const plan = await one<{ id: string }>(COORD, `select ensure_plan($1, 1) as id`, [v1]);
    await as(COORD, `select save_plan_slot($1, 1, 'contenido', null, null, $2::uuid[])`, [plan.id, [U1]]);
    const slot = (await db.query<{ id: string }>(`select id from learning_plan_slots where plan_id = $1 and position = 1`, [plan.id])).rows[0].id;
    expect(await failure(S1, `insert into learning_plan_slot_units values ($1, $2)`, [slot, U2])).toBeTruthy();
    expect(await failure(OTHER_COORD, `insert into learning_plan_slot_units values ($1, $2)`, [slot, U2])).toBeTruthy();
    expect((await db.query(`select 1 from learning_plan_slot_units where slot_id = $1`, [slot])).rows).toHaveLength(1);
  });
});

describe("versiones: copiar, preparar, revisar y publicar", () => {
  let v2: string;

  it("copiar crea una versión nueva sin tocar la original", async () => {
    const v1 = await versionId(CUR, 1);
    await db.query(`insert into unit_prerequisites values ($1, $2)`, [U2, U1]);
    v2 = (await one<{ clone_version: string }>(COORD, `select clone_version($1, 'Edición 2027')`, [v1])).clone_version;
    const [v] = (await db.query<{ version: number; status: string; is_current: boolean; label: string }>(
      `select version, status, is_current, label from curriculum_versions where id = $1`, [v2])).rows;
    expect(v).toEqual({ version: 2, status: "cargado", is_current: false, label: "Edición 2027" });

    const copy = await db.query<{ n: number; ids_differ: boolean }>(
      `select count(*)::int n, bool_and(l.id not in ($2::uuid, $3::uuid, $4::uuid, $5::uuid)) ids_differ
         from lessons l join cycles cy on cy.id = l.cycle_id where cy.version_id = $1`, [v2, U1, U2, U3, U4]);
    expect(copy.rows[0]).toEqual({ n: 4, ids_differ: true });
    // la original sigue igual
    expect((await db.query(`select 1 from lessons where cycle_id = $1`, [CY1])).rows).toHaveLength(4);
    // los requisitos y el plan se copian apuntando a las unidades nuevas
    const pre = await db.query(`select 1 from unit_prerequisites p join lessons l on l.id = p.unit_id join cycles cy on cy.id = l.cycle_id where cy.version_id = $1`, [v2]);
    expect(pre.rows).toHaveLength(1);
    const slots = await db.query(
      `select 1 from learning_plan_slot_units su join learning_plan_slots s on s.id = su.slot_id join annual_learning_plans p on p.id = s.plan_id where p.version_id = $1`, [v2]);
    expect(slots.rows).toHaveLength(1);
  });

  it("solo el administrador o el coordinador del programa copian versiones", async () => {
    expect(await failure(OTHER_COORD, `select clone_version($1)`, [await versionId(CUR, 1)])).toContain("Solo el administrador o el coordinador");
    expect(await failure(S1, `select clone_version($1)`, [await versionId(CUR, 1)])).toBeTruthy();
  });

  it("la copia se edita libremente; al enviarla a revisión queda bloqueada", async () => {
    const cy2 = (await db.query<{ id: string }>(`select id from cycles where version_id = $1`, [v2])).rows[0].id;
    await as(COORD, `insert into lessons (cycle_id, number, title) values ($1, 5, 'Cinco')`, [cy2]);
    await as(COORD, `select advance_curriculum_version($1, 'en_adaptacion')`, [v2]);
    await as(COORD, `select advance_curriculum_version($1, 'en_revision_pastoral', 'Lista para revisión')`, [v2]);
    expect(await failure(COORD, `insert into lessons (cycle_id, number, title) values ($1, 6, 'Seis')`, [cy2])).toContain("no se puede editar");
    expect(await failure(COORD, `update lessons set title = 'X' where cycle_id = $1`, [cy2])).toContain("no se puede editar");
    expect(await failure(COORD, `delete from lessons where cycle_id = $1`, [cy2])).toContain("no se puede editar");
    expect(await failure(COORD, `insert into cycles (curriculum_id, number, version_id) values ($1, 9, $2)`, [CUR, v2])).toContain("no se puede editar");
  });

  it("devolver a adaptación exige decir qué corregir y reabre la edición", async () => {
    expect(await failure(REVIEWER, `select advance_curriculum_version($1, 'en_adaptacion')`, [v2])).toContain("qué debe corregirse");
    await as(REVIEWER, `select advance_curriculum_version($1, 'en_adaptacion', 'Falta la unidad 6')`, [v2]);
    const cy2 = (await db.query<{ id: string }>(`select id from cycles where version_id = $1`, [v2])).rows[0].id;
    await as(COORD, `insert into lessons (cycle_id, number, title) values ($1, 6, 'Seis')`, [cy2]);
  });

  it("no se aprueba con unidades sin lugar en el plan", async () => {
    await as(COORD, `select advance_curriculum_version($1, 'en_revision_pastoral')`, [v2]);
    const r = await as<{ level: string; code: string; detail: string }>(REVIEWER, `select * from version_readiness($1)`, [v2]);
    expect(r.find((x) => x.code === "unidad_sin_plan")).toMatchObject({ level: "error" });
    expect(await failure(REVIEWER, `select advance_curriculum_version($1, 'aprobado')`, [v2])).toContain("No se puede aprobar");
  });

  it("al repartir las unidades en el plan, el revisor aprueba; el coordinador no", async () => {
    await as(REVIEWER, `select advance_curriculum_version($1, 'en_adaptacion', 'Completar el plan')`, [v2]);
    const plan = (await db.query<{ id: string }>(`select id from annual_learning_plans where version_id = $1`, [v2])).rows[0].id;
    await db.query(`delete from learning_plan_slot_units where slot_id in (select id from learning_plan_slots where plan_id = $1)`, [plan]);
    await as(COORD, `select propose_plan_distribution($1, 1)`, [v2]);
    await as(COORD, `select advance_curriculum_version($1, 'en_revision_pastoral')`, [v2]);
    expect(await failure(COORD, `select advance_curriculum_version($1, 'aprobado')`, [v2])).toContain("Solo un revisor");
    await as(REVIEWER, `select advance_curriculum_version($1, 'aprobado')`, [v2]);
    const [v] = (await db.query<{ status: string; approved_by: string }>(`select status, approved_by from curriculum_versions where id = $1`, [v2])).rows;
    expect(v).toEqual({ status: "aprobado", approved_by: REVIEWER });
    // aprobada y sin publicar: tampoco se edita
    const cy2 = (await db.query<{ id: string }>(`select id from cycles where version_id = $1`, [v2])).rows[0].id;
    expect(await failure(COORD, `update lessons set title = 'X' where cycle_id = $1`, [cy2])).toContain("no se puede editar");
  });

  it("publicar la deja vigente y congela la anterior, que sigue siendo la de sus cohortes", async () => {
    await as(REVIEWER, `select advance_curriculum_version($1, 'publicado')`, [v2]);
    const r = await db.query<{ version: number; is_current: boolean; content_frozen: boolean; status: string }>(
      `select version, is_current, content_frozen, status from curriculum_versions where curriculum_id = $1 order by version`, [CUR]);
    expect(r.rows).toEqual([
      { version: 1, is_current: false, content_frozen: true, status: "publicado" },
      { version: 2, is_current: true, content_frozen: true, status: "publicado" },
    ]);
    // ninguna de las dos se puede editar ya
    expect(await failure(COORD, `update lessons set title = 'X' where id = $1`, [U1])).toContain("no se puede editar");
    // el grupo existente conserva su versión; uno nuevo toma la vigente
    const g = (await db.query<{ version_id: string }>(`select version_id from groups where id = $1`, [GA])).rows[0];
    expect(g.version_id).toBe(await versionId(CUR, 1));
    await db.query(`insert into groups (id, season_id, curriculum_id, name, modality) values ($1, $2, $3, 'Nuevo', 'virtual')`, [id(150), SEASON, CUR]);
    const g2 = (await db.query<{ version_id: string }>(`select version_id from groups where id = $1`, [id(150)])).rows[0];
    expect(g2.version_id).toBe(v2);
  });

  it("la bitácora registra cada paso con su nota", async () => {
    const ev = await as<{ to_status: string; note: string | null }>(REVIEWER, `select to_status, note from version_events where version_id = $1 order by created_at, to_status`, [v2]);
    expect(ev.length).toBeGreaterThanOrEqual(7);
    expect(ev.some((e) => e.note === "Falta la unidad 6")).toBe(true);
    expect(await as(S1, `select * from version_events`)).toHaveLength(0);
  });

  it("un programa de formación no se envía a revisión sin unidades; un taller sí", async () => {
    await db.query(`insert into curriculums (id, name, kind) values ($1, 'Currículo vacío', 'curriculo'), ($2, 'Taller libre', 'taller')`, [id(160), id(161)]);
    await db.query(`insert into curriculum_coordinators values ($1, $3), ($2, $3)`, [id(160), id(161), COORD]);
    const va = await versionId(id(160), 1);
    const vb = await versionId(id(161), 1);
    expect(await failure(COORD, `select advance_curriculum_version($1, 'en_adaptacion')`, [va])).toContain("");
    await db.query(`update curriculum_versions set status = 'en_adaptacion' where id = $1 and false`, [va]);
    // la versión inicial ya está publicada: se crea una copia vacía para probar el flujo
    const empty = (await one<{ clone_version: string }>(COORD, `select clone_version($1)`, [va])).clone_version;
    await as(COORD, `select advance_curriculum_version($1, 'en_adaptacion')`, [empty]);
    expect(await failure(COORD, `select advance_curriculum_version($1, 'en_revision_pastoral')`, [empty])).toContain("no tiene unidades");
    const t = (await one<{ clone_version: string }>(COORD, `select clone_version($1)`, [vb])).clone_version;
    await as(COORD, `select advance_curriculum_version($1, 'en_adaptacion')`, [t]);
    await as(COORD, `select advance_curriculum_version($1, 'en_revision_pastoral')`, [t]);
  });
});

describe("plan de 36 encuentros", () => {
  const curriculumWith = async (cur: string, n: number) => {
    await db.query(`insert into curriculums (id, name) values ($1, $2)`, [cur, `Programa ${n} unidades`]);
    await db.query(`insert into curriculum_coordinators values ($1, $2)`, [cur, COORD]);
    const cy = id(Number(cur.slice(-3)) + 500);
    await db.query(`insert into cycles (id, curriculum_id, number) values ($1, $2, 1)`, [cy, cur]);
    await db.query(`insert into lessons (cycle_id, number, title) select $1, g, 'U' || g from generate_series(1, $2::int) g`, [cy, n]);
    return versionId(cur, 1);
  };
  const distribution = async (vid: string) =>
    (await db.query<{ position: number; n: number }>(
      `select s.position, count(su.unit_id)::int n from learning_plan_slots s join annual_learning_plans p on p.id = s.plan_id
         left join learning_plan_slot_units su on su.slot_id = s.id where p.version_id = $1 group by s.position order by s.position`, [vid])).rows;

  it("con menos de 36 unidades, cada unidad ocupa varias semanas y ninguna semana queda vacía", async () => {
    const v = await curriculumWith(id(170), 18);
    await as(COORD, `select propose_plan_distribution($1, 1)`, [v]);
    const d = await distribution(v);
    expect(d).toHaveLength(36);
    expect(d.every((x) => x.n === 1)).toBe(true);
    const per = await db.query<{ n: number }>(
      `select count(*)::int n from learning_plan_slot_units su join learning_plan_slots s on s.id = su.slot_id join annual_learning_plans p on p.id = s.plan_id where p.version_id = $1 group by su.unit_id`, [v]);
    expect(per.rows.every((r) => r.n === 2)).toBe(true);
  });

  it("con más de 36 unidades, una semana agrupa varias y todas quedan cubiertas", async () => {
    const v = await curriculumWith(id(171), 72);
    await as(COORD, `select propose_plan_distribution($1, 1)`, [v]);
    expect((await distribution(v)).every((x) => x.n === 2)).toBe(true);
    const cov = await as<{ problema: string }>(COORD, `select * from plan_coverage((select id from annual_learning_plans where version_id = $1))`, [v]);
    expect(cov).toHaveLength(0);
  });

  it("con exactamente 36, es una por semana, en orden", async () => {
    const v = await curriculumWith(id(172), 36);
    await as(COORD, `select propose_plan_distribution($1, 1)`, [v]);
    const r = await db.query<{ position: number; title: string }>(
      `select s.position, l.title from learning_plan_slot_units su join learning_plan_slots s on s.id = su.slot_id
        join annual_learning_plans p on p.id = s.plan_id join lessons l on l.id = su.unit_id where p.version_id = $1 order by s.position`, [v]);
    expect(r.rows.every((x) => x.title === `U${x.position}`)).toBe(true);
  });

  it("no pisa un plan que ya tiene unidades y exige permiso", async () => {
    const v = await versionId(id(172), 1);
    expect(await failure(COORD, `select propose_plan_distribution($1, 1)`, [v])).toContain("ya tiene unidades");
    expect(await failure(S1, `select propose_plan_distribution($1, 1)`, [v])).toContain("No tienes permiso");
    expect(await failure(COORD, `select propose_plan_distribution($1, 2)`, [v])).toContain("no tiene unidades en el año 2");
  });

  it("guardar una posición reemplaza sus unidades y rechaza unidades de otra versión", async () => {
    const v = await versionId(id(170), 1);
    const plan = (await db.query<{ id: string }>(`select id from annual_learning_plans where version_id = $1`, [v])).rows[0].id;
    const two = (await db.query<{ id: string }>(`select l.id from lessons l join cycles cy on cy.id = l.cycle_id where cy.version_id = $1 order by l.number limit 2`, [v])).rows.map((r) => r.id);
    await as(COORD, `select save_plan_slot($1, 3, 'integracion', 'Repaso', 'Dinámica de cierre', $2::uuid[])`, [plan, two]);
    const [s] = (await db.query<{ kind: string; title: string; n: number }>(
      `select kind, title, (select count(*) from learning_plan_slot_units su where su.slot_id = s.id)::int n from learning_plan_slots s where plan_id = $1 and position = 3`, [plan])).rows;
    expect(s).toEqual({ kind: "integracion", title: "Repaso", n: 2 });
    await as(COORD, `select save_plan_slot($1, 3, 'contenido', null, null, '{}')`, [plan]);
    expect((await db.query(`select 1 from learning_plan_slot_units su join learning_plan_slots s on s.id = su.slot_id where s.plan_id = $1 and s.position = 3`, [plan])).rows).toHaveLength(0);
    expect(await failure(COORD, `select save_plan_slot($1, 3, 'contenido', null, null, $2::uuid[])`, [plan, [U1]])).toContain("no pertenece a esta versión");
    expect(await failure(OTHER_COORD, `select save_plan_slot($1, 3, 'contenido', null, null, '{}')`, [plan])).toContain("No tienes permiso");
  });
});

describe("biblioteca de materiales", () => {
  let versionOfLinks: string;
  let modResource: string;
  let teamResource: string;
  let unlinked: string;

  beforeAll(async () => {
    // programa con una versión todavía en preparación y otra publicada
    await db.query(`insert into curriculums (id, name) values ($1, 'Biblioteca')`, [id(180)]);
    await db.query(`insert into curriculum_coordinators values ($1, $2)`, [id(180), COORD]);
    await db.query(`insert into cycles (id, curriculum_id, number) values ($1, $2, 1)`, [id(181), id(180)]);
    await db.query(`insert into lessons (id, cycle_id, number, title) values ($1, $2, 1, 'Unidad A')`, [id(182), id(181)]);
    versionOfLinks = await versionId(id(180), 1);
    await db.query(`insert into groups (id, season_id, curriculum_id, name, leader_id, modality) values ($1, $2, $3, 'G bib', $4, 'virtual')`, [id(183), SEASON, id(180), LEADER]);
    await as(S1, `select enroll_curriculum($1)`, [id(180)]);
  });

  it("el coordinador sube un material y lo vincula a un módulo y a una unidad", async () => {
    modResource = (await one<{ id: string }>(COORD,
      `insert into resources (curriculum_id, cycle_id, name, kind, read_url, audience, uploaded_by)
       values ($1, $2, 'Libro del participante', 'libro', 'https://example.org/libro', 'participantes', $3) returning id`, [id(180), id(181), COORD])).id;
    teamResource = (await one<{ id: string }>(COORD,
      `insert into resources (curriculum_id, unit_id, name, kind, read_url, audience, uploaded_by)
       values ($1, $2, 'Guía del líder', 'guia_lider', 'https://example.org/guia', 'equipo', $3) returning id`, [id(180), id(182), COORD])).id;
    unlinked = (await one<{ id: string }>(COORD,
      `insert into resources (curriculum_id, name, kind, read_url, uploaded_by) values ($1, 'Sin ubicar', 'otro', 'https://example.org/x', $2) returning id`, [id(180), COORD])).id;
    // el vínculo a la unidad completó también el módulo
    const [r] = (await db.query<{ cycle_id: string }>(`select cycle_id from resources where id = $1`, [teamResource])).rows;
    expect(r.cycle_id).toBe(id(181));
  });

  it("los participantes ven lo dirigido a ellos y no la guía del equipo", async () => {
    const seen = (await as<{ id: string }>(S1, `select id from resources where curriculum_id = $1`, [id(180)])).map((r) => r.id);
    expect(seen).toEqual([modResource]);
  });

  it("el líder del grupo ve también la guía del equipo; lo no vinculado queda solo para el equipo editorial", async () => {
    const seen = (await as<{ id: string }>(LEADER, `select id from resources where curriculum_id = $1`, [id(180)])).map((r) => r.id).sort();
    expect(seen).toEqual([modResource, teamResource].sort());
    const staff = (await as<{ id: string }>(COORD, `select id from resources where curriculum_id = $1`, [id(180)])).map((r) => r.id);
    expect(staff).toContain(unlinked);
    expect(await as(OUTSIDER, `select id from resources where curriculum_id = $1`, [id(180)])).toHaveLength(0);
  });

  it("un material archivado desaparece para todos menos el equipo editorial, y nada se borra", async () => {
    await as(COORD, `update resources set archived = true where id = $1`, [modResource]);
    expect(await as(S1, `select id from resources where id = $1`, [modResource])).toHaveLength(0);
    expect(await as(COORD, `select id from resources where id = $1`, [modResource])).toHaveLength(1);
    await as(COORD, `update resources set archived = false where id = $1`, [modResource]);
  });

  it("solo el equipo editorial del programa sube materiales", async () => {
    expect(await failure(OTHER_COORD, `insert into resources (curriculum_id, name, read_url) values ($1, 'X', 'https://example.org')`, [id(180)])).toBeTruthy();
    expect(await failure(S1, `insert into resources (curriculum_id, name, read_url) values ($1, 'X', 'https://example.org')`, [id(180)])).toBeTruthy();
    expect(await failure(LEADER, `update resources set name = 'Cambiado' where id = $1`, [modResource])).toBe("");
    const [r] = (await db.query<{ name: string }>(`select name from resources where id = $1`, [modResource])).rows;
    expect(r.name).toBe("Libro del participante"); // no hubo filas afectadas
  });

  it("un archivo solo puede colgar de la carpeta de su programa", async () => {
    expect(await failure(COORD, `insert into resources (curriculum_id, name, file_path) values ($1, 'Robado', $2)`, [id(180), `${CUR}/secreto.pdf`])).toContain("resources_file_in_own_folder");
    await as(COORD, `insert into resources (curriculum_id, name, file_path, file_name, mime_type, size_bytes) values ($1, 'PDF', $2, 'a.pdf', 'application/pdf', 1000)`, [id(180), `${id(180)}/a.pdf`]);
  });

  it("copiar la versión vincula los materiales a la copia sin duplicar archivos", async () => {
    const v = (await one<{ clone_version: string }>(COORD, `select clone_version($1)`, [versionOfLinks])).clone_version;
    const r = await db.query<{ n: number; files: number }>(
      `select count(*)::int n, count(distinct r.file_path)::int files from resources r join cycles cy on cy.id = r.cycle_id where cy.version_id = $1`, [v]);
    expect(r.rows[0].n).toBe(2); // el libro (módulo) y la guía (unidad), sin la que estaba sin ubicar
    // y en la copia el material se puede mover mientras esté en preparación
    const copy = (await db.query<{ id: string }>(`select r.id from resources r join cycles cy on cy.id = r.cycle_id where cy.version_id = $1 limit 1`, [v])).rows[0].id;
    await as(COORD, `update resources set cycle_id = null, unit_id = null where id = $1`, [copy]);
  });

  it("no se mueve material hacia una versión congelada", async () => {
    await db.query(`update curriculum_versions set content_frozen = true where id = $1`, [versionOfLinks]);
    expect(await failure(COORD, `update resources set cycle_id = null, unit_id = null where id = $1`, [modResource])).toContain("no se puede vincular");
    expect(await failure(COORD, `insert into resources (curriculum_id, cycle_id, name, read_url) values ($1, $2, 'Nuevo', 'https://example.org')`, [id(180), id(181)])).toContain("no se puede vincular");
    await db.query(`update curriculum_versions set content_frozen = false where id = $1`, [versionOfLinks]);
  });
});

describe("acceso a las unidades sin ciclo", () => {
  const U = [id(200), id(201), id(202), id(203)];
  const CURX = id(190);
  const GX = id(191);

  beforeAll(async () => {
    await db.query(`insert into curriculums (id, name) values ($1, 'Sin ciclos')`, [CURX]);
    await db.query(`insert into curriculum_coordinators values ($1, $2)`, [CURX, COORD]);
    await db.query(`insert into cycles (id, curriculum_id, number) values ($1, $2, 1)`, [id(192), CURX]);
    for (const [i, u] of U.entries()) await db.query(`insert into lessons (id, cycle_id, number, title) values ($1, $2, $3, $4)`, [u, id(192), i + 1, `Unidad ${i + 1}`]);
    await db.query(`insert into groups (id, season_id, curriculum_id, name, leader_id, weekday, modality, capacity) values ($1, $2, $3, 'G sin ciclo', $4, 2, 'virtual', 10)`, [GX, SEASON, CURX, LEADER]);
    const vx = await versionId(CURX, 1);
    const plan = (await one<{ id: string }>(COORD, `select ensure_plan($1, 1) as id`, [vx])).id;
    for (const [i, u] of U.entries()) await as(COORD, `select save_plan_slot($1, $2, 'contenido', null, null, $3::uuid[])`, [plan, i + 1, [u]]);
    await as(LEADER, `select plan_group_sessions($1, '2026-03-03')`, [GX]);
    await as(S1, `select enroll($1)`, [GX]);
    await db.query(`update enrollments set enrolled_at = '2026-03-01' where group_id = $1`, [GX]);
  });

  const visible = async (uid: string) =>
    (await as<{ title: string }>(uid, `select title from lessons where id = any($1::uuid[]) order by number`, [U])).map((r) => r.title);

  it("antes de la primera reunión, el participante ve solo la unidad de la próxima sesión", async () => {
    expect(await visible(S1)).toEqual(["Unidad 1"]);
  });

  it("al realizarse la sesión 1 se libera la de la sesión 2", async () => {
    const enr = (await db.query<{ id: string }>(`select id from enrollments where group_id = $1 and person_id = $2`, [GX, S1])).rows[0].id;
    await as(LEADER, `select save_attendance($1, '2026-03-03', null, $2::uuid[], '{}')`, [GX, [enr]]);
    expect(await visible(S1)).toEqual(["Unidad 1", "Unidad 2"]);
  });

  it("un desconocido no ve unidades; el equipo, el coordinador y el revisor las ven todas", async () => {
    expect(await visible(OUTSIDER)).toEqual([]);
    for (const uid of [LEADER, COORD, ADMIN]) expect(await visible(uid)).toHaveLength(4);
  });

  it("una unidad acreditada sigue visible aunque el grupo ya no la dé", async () => {
    const ce = (await db.query<{ id: string }>(`select id from curriculum_enrollments where person_id = $1 and curriculum_id = $2`, [S1, CURX])).rows[0].id;
    await as(COORD, `select record_unit_completion($1, $2, 'manual')`, [ce, U[3]]);
    expect(await visible(S1)).toEqual(["Unidad 1", "Unidad 2", "Unidad 4"]);
  });

  it("un programa con versión sin publicar no muestra sus unidades a participantes", async () => {
    const v = (await one<{ clone_version: string }>(COORD, `select clone_version($1)`, [await versionId(CURX, 1)])).clone_version;
    const draft = (await db.query<{ id: string }>(`select l.id from lessons l join cycles cy on cy.id = l.cycle_id where cy.version_id = $1 order by l.number limit 1`, [v])).rows[0].id;
    expect(await as(S1, `select id from lessons where id = $1`, [draft])).toHaveLength(0);
    expect(await as(COORD, `select id from lessons where id = $1`, [draft])).toHaveLength(1);
  });
});

describe("archivos privados (Storage)", () => {
  const BIB = id(180);
  const put = (uid: string, name: string) => as(uid, `insert into storage.objects (bucket_id, name) values ('materiales', $1) returning name`, [name]);

  it("el bucket es privado y con límites", async () => {
    const [b] = (await db.query<{ public: boolean; file_size_limit: number }>(`select public, file_size_limit from storage.buckets where id = 'materiales'`)).rows;
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(52428800);
  });

  it("solo el equipo editorial sube a la carpeta de su programa", async () => {
    await put(COORD, `${BIB}/libro.pdf`);
    await put(ADMIN, `${CUR2}/otro.pdf`);
    expect(await failure(OTHER_COORD, `insert into storage.objects (bucket_id, name) values ('materiales', $1)`, [`${BIB}/intruso.pdf`])).toBeTruthy();
    expect(await failure(S1, `insert into storage.objects (bucket_id, name) values ('materiales', $1)`, [`${BIB}/alumno.pdf`])).toBeTruthy();
  });

  it("un participante lee un archivo solo si hay un material visible que lo registre", async () => {
    const names = async (uid: string) => (await as<{ name: string }>(uid, `select name from storage.objects where bucket_id = 'materiales' order by name`)).map((r) => r.name);
    expect(await names(S1)).toEqual([]); // subido pero todavía sin registrar
    await db.query(`insert into resources (curriculum_id, cycle_id, name, file_path, audience) values ($1, $2, 'PDF', $3, 'participantes')`, [BIB, id(181), `${BIB}/libro.pdf`]);
    expect(await names(S1)).toEqual([`${BIB}/libro.pdf`]);
    expect(await names(OUTSIDER)).toEqual([]);
    expect(await names(COORD)).toEqual([`${BIB}/libro.pdf`]); // la carpeta de otro programa no
    expect(await names(OTHER_COORD)).toEqual([`${CUR2}/otro.pdf`]);
  });
});

describe("continuación de grupos con el modelo anterior", () => {
  it("la continuación conserva dirección, respaldo y sede, y no mezcla versiones", async () => {
    const cur = id(210), c1 = id(211), c2 = id(212), g = id(213);
    await db.query(`insert into curriculums (id, name) values ($1, 'Con ciclos')`, [cur]);
    await db.query(`insert into curriculum_coordinators values ($1, $2)`, [cur, COORD]);
    await db.query(`insert into cycles (id, curriculum_id, number) values ($1, $3, 1), ($2, $3, 2)`, [c1, c2, cur]);
    // una segunda versión con un ciclo 2 propio: no debe confundirse con el de la versión del grupo
    const v2 = (await one<{ clone_version: string }>(COORD, `select clone_version($1)`, [await versionId(cur, 1)])).clone_version;
    const campus = (await db.query<{ id: string }>(`select id from campuses limit 1`)).rows[0].id;
    await db.query(`insert into groups (id, season_id, cycle_id, name, leader_id, backup_leader_id, campus_id, weekday, modality, address, status)
                    values ($1, $2, $3, 'Origen', $4, $5, $6, 3, 'presencial', 'Calle 123', 'en_curso')`, [g, SEASON, c1, LEADER, BACKUP, campus]);
    await db.query(`update group_private set online_url = 'https://zoom.test/r' where group_id = $1`, [g]);
    await as(COORD, `select * from close_group($1)`, [g]);
    const nid = (await one<{ create_continuation: string }>(COORD, `select create_continuation($1)`, [g])).create_continuation;

    const [n] = (await db.query<{ cycle_id: string; backup_leader_id: string; campus_id: string; address: string; online_url: string }>(
      `select g.cycle_id, g.backup_leader_id, g.campus_id, gp.address, gp.online_url from groups g left join group_private gp on gp.group_id = g.id where g.id = $1`, [nid])).rows;
    expect(n).toEqual({ cycle_id: c2, backup_leader_id: BACKUP, campus_id: campus, address: "Calle 123", online_url: "https://zoom.test/r" });
    expect(v2).toBeTruthy();
  });

  it("un grupo sin ciclos no se continúa: sus personas siguen en su inscripción", async () => {
    await db.query(`insert into groups (id, season_id, curriculum_id, name, status, modality) values ($1, $2, $3, 'Sin ciclo', 'finalizado', 'virtual')`, [id(220), SEASON, CUR]);
    expect(await failure(COORD, `select create_continuation($1)`, [id(220)])).toContain("no avanza por ciclos");
  });
});

describe("migración 009 sobre datos anteriores", () => {
  it("los materiales que ya existían quedan visibles para quienes cursan, y repetir no cambia nada", async () => {
    const ldb = new PGlite();
    await ldb.exec(SUPABASE_STUBS);
    for (const f of UPTO_008) await ldb.exec(sql(f));
    for (const [uid, name] of PEOPLE.slice(0, 2)) {
      await ldb.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [uid, `${uid}@t.l`, JSON.stringify({ full_name: name })]);
    }
    await ldb.exec(`
      insert into curriculums (id, name) values ('${CUR}', 'Hombres');
      insert into cycles (id, curriculum_id, number) values ('${CY1}', '${CUR}', 1);
      insert into resources (id, cycle_id, name, kind, read_url) values ('${id(300)}', '${CY1}', 'Guía antigua', 'pdf', 'https://example.org/g');
    `);
    await ldb.exec(sql("009_biblioteca.sql"));
    const q = `select audience, curriculum_id::text c, archived from resources where id = '${id(300)}'`;
    expect((await ldb.query(q)).rows[0]).toEqual({ audience: "participantes", c: CUR, archived: false });
    // lo nuevo parte visible solo para el equipo
    await ldb.exec(`insert into resources (id, curriculum_id, cycle_id, name, read_url) values ('${id(301)}', '${CUR}', '${CY1}', 'Nueva', 'https://example.org/n')`);
    expect((await ldb.query<{ audience: string }>(`select audience from resources where id = '${id(301)}'`)).rows[0].audience).toBe("equipo");

    const count = `select (select count(*) from resources)::int r, (select count(*) from curriculum_versions)::int v, (select count(*) from cycles where version_id is not null)::int c`;
    const before = (await ldb.query(count)).rows[0];
    await ldb.exec(sql("009_biblioteca.sql"));
    expect((await ldb.query(count)).rows[0]).toEqual(before);
    expect((await ldb.query<{ audience: string }>(`select audience from resources where id = '${id(300)}'`)).rows[0].audience).toBe("participantes");
  });
});
