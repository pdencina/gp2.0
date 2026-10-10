import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// GP 2.0 · Fase 5: progreso multianual, requisitos por etapa y certificados (010_certificados.sql)

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
const UPTO_009 = [
  "001_schema.sql", "004_rendimiento.sql", "005_panel.sql", "006_gp2_nucleo.sql", "007_catalogo.sql",
  "008_calendario.sql", "009_biblioteca.sql",
];

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), COORD = id(2), PASTOR_A = id(3), PASTOR_B = id(4), LEADER = id(5);
const S1 = id(6), S2 = id(7), S3 = id(8), OUTSIDER = id(9), S4 = id(10);
const CUR = id(100), CUR1Y = id(101), SEASON = id(102), C1 = id(103), C2 = id(104), C3 = id(105);
const L1A = id(110), L1B = id(111), L3 = id(112), GA = id(120), GB = id(121);
const PEOPLE: [string, string][] = [
  [ADMIN, "Admin"], [COORD, "Coordinador"], [PASTOR_A, "Pastor Puente Alto"], [PASTOR_B, "Pastor Santiago"],
  [LEADER, "Líder"], [S1, "Alumno Uno"], [S2, "Alumno Dos"], [S3, "Alumno Tres"], [OUTSIDER, "Ajeno"], [S4, "Alumno Cuatro"],
];

let db: PGlite;
let CAMP_A = "";
let CAMP_B = "";

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
const ceOf = async (person: string, cur = CUR) =>
  (await db.query<{ id: string }>(`select id from curriculum_enrollments where person_id = $1 and curriculum_id = $2`, [person, cur])).rows[0].id;
const complete = (person: string, units: string[]) =>
  Promise.all(units.map(async (u) => as(COORD, `select record_unit_completion($1, $2, 'manual')`, [await ceOf(person), u])));
const years = async (person: string) =>
  as<{ formative_year: number; items_total: number; items_done: number; met: boolean; min_pct: string }>(person, `select * from year_status($1)`, [await ceOf(person)]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of [...UPTO_009, "010_certificados.sql"]) await db.exec(sql(f));
  await db.exec(GRANTS);
  for (const [uid, name] of PEOPLE) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [uid, `${uid}@t.l`, JSON.stringify({ full_name: name })]);
  }
  CAMP_A = (await db.query<{ id: string }>(`select id from campuses where name = 'Puente Alto'`)).rows[0].id;
  CAMP_B = (await db.query<{ id: string }>(`select id from campuses where name = 'Santiago centro'`)).rows[0].id;

  await db.exec(`
    update profiles set role = 'admin' where id = '${ADMIN}';
    update profiles set role = 'coordinador' where id in ('${COORD}', '${PASTOR_A}', '${PASTOR_B}');
    update profiles set role = 'lider' where id = '${LEADER}';
    update profiles set gender = 'hombre', birth_date = '1990-01-01', terms_accepted_at = now() where id in ('${S1}', '${S2}', '${S3}', '${S4}', '${OUTSIDER}');
    update profiles set campus_id = '${CAMP_A}' where id = '${S3}';

    insert into curriculums (id, name, duration_years, certifiable) values ('${CUR}', 'AR Hombres de prueba', 3, true);
    insert into curriculums (id, name, duration_years, certifiable) values ('${CUR1Y}', 'Programa de un año', 1, true);
    insert into curriculum_coordinators values ('${CUR}', '${COORD}');
    insert into campus_pastors values ('${PASTOR_A}', '${CAMP_A}'), ('${PASTOR_B}', '${CAMP_B}');
    insert into seasons (id, name, start_date, end_date, status) values ('${SEASON}', '2026', '2026-03-02', '2026-11-30', 'en_curso');

    insert into cycles (id, curriculum_id, number, formative_year) values ('${C1}', '${CUR}', 1, 1), ('${C2}', '${CUR}', 2, 2), ('${C3}', '${CUR}', 3, 3);
    insert into lessons (id, cycle_id, number, title) values ('${L1A}', '${C1}', 1, 'Uno A'), ('${L1B}', '${C1}', 2, 'Uno B'), ('${L3}', '${C3}', 1, 'Tres');
    insert into groups (id, season_id, curriculum_id, name, leader_id, campus_id, formative_year, weekday, modality, capacity)
      values ('${GA}', '${SEASON}', '${CUR}', 'Grupo A', '${LEADER}', '${CAMP_A}', 1, 2, 'presencial', 10),
             ('${GB}', '${SEASON}', '${CUR}', 'Grupo B', '${LEADER}', '${CAMP_B}', 1, 2, 'presencial', 10);
  `);
  await as(S1, `select enroll($1)`, [GA]);
  await as(S2, `select enroll($1)`, [GB]);
  await as(S3, `select enroll_curriculum($1)`, [CUR]);
  await as(S4, `select enroll_curriculum($1)`, [CUR]);
  // plan del año 1: dos semanas con una unidad cada una
  const v = (await db.query<{ id: string }>(`select id from curriculum_versions where curriculum_id = $1`, [CUR])).rows[0].id;
  const plan = (await one<{ id: string }>(COORD, `select ensure_plan($1, 1) as id`, [v])).id;
  await as(COORD, `select save_plan_slot($1, 1, 'contenido', 'Primera', null, $2::uuid[])`, [plan, [L1A]]);
  await as(COORD, `select save_plan_slot($1, 2, 'contenido', 'Segunda', null, $2::uuid[])`, [plan, [L1B]]);
});

describe("AR Hombres y la migración", () => {
  it("HOMBRES pasa a tres años con certificado; otros programas no cambian, y repetir no cambia nada", async () => {
    const ldb = new PGlite();
    await ldb.exec(SUPABASE_STUBS);
    for (const f of UPTO_009) await ldb.exec(sql(f));
    await ldb.exec(`
      insert into curriculums (id, name) values ('${id(500)}', 'HOMBRES'), ('${id(501)}', 'MUJERES'), ('${id(502)}', 'HOMBRES JÓVENES');
      insert into cycles (curriculum_id, number) select '${id(500)}', g from generate_series(1, 13) g;
    `);
    await ldb.exec(sql("010_certificados.sql"));
    const q = `select name, duration_years, certifiable, offering from curriculums order by name`;
    const first = (await ldb.query(q)).rows;
    expect(first).toEqual([
      { name: "HOMBRES", duration_years: 3, certifiable: true, offering: "AR Hombres" },
      { name: "HOMBRES JÓVENES", duration_years: 1, certifiable: false, offering: null },
      { name: "MUJERES", duration_years: 1, certifiable: false, offering: null },
    ]);
    // los 13 ciclos antiguos NO se reparten solos entre los años
    const spread = await ldb.query<{ y: number; n: number }>(`select formative_year y, count(*)::int n from cycles group by 1`);
    expect(spread.rows).toEqual([{ y: 1, n: 13 }]);
    await ldb.exec(sql("010_certificados.sql"));
    expect((await ldb.query(q)).rows).toEqual(first);
  });
});

describe("avance año por año", () => {
  it("cada año cuenta sus unidades; un módulo heredado sin unidades cuenta como una etapa", async () => {
    const y = await years(S1);
    expect(y.map((r) => [r.formative_year, r.items_total, r.items_done, r.met])).toEqual([
      [1, 2, 0, false], // dos unidades
      [2, 1, 0, false], // un módulo heredado
      [3, 1, 0, false], // una unidad
    ]);
    expect(y.every((r) => Number(r.min_pct) === 100)).toBe(true);
  });

  it("asistir no cuenta: solo lo acreditado", async () => {
    const enr = (await db.query<{ id: string }>(`select id from enrollments where person_id = $1`, [S1])).rows[0].id;
    await as(LEADER, `select save_attendance($1, '2026-03-03', null, $2::uuid[], '{}')`, [GA, [enr]]);
    expect((await years(S1))[0].items_done).toBe(0);
  });

  it("el avance se actualiza al acreditar y respeta el mínimo configurado", async () => {
    await complete(S1, [L1A]);
    expect((await years(S1))[0]).toMatchObject({ items_done: 1, met: false });
    const v = (await db.query<{ id: string }>(`select id from curriculum_versions where curriculum_id = $1`, [CUR])).rows[0].id;
    await as(COORD, `insert into year_requirements (version_id, formative_year, min_pct) values ($1, 1, 50)`, [v]);
    expect((await years(S1))[0]).toMatchObject({ items_done: 1, met: true, min_pct: "50" });
    await as(COORD, `update year_requirements set min_pct = 100 where version_id = $1 and formative_year = 1`, [v]);
    expect((await years(S1))[0].met).toBe(false);
  });

  it("los requisitos solo los ve y cambia el equipo editorial", async () => {
    expect(await as(S1, `select * from year_requirements`)).toHaveLength(0);
    const v = (await db.query<{ id: string }>(`select id from curriculum_versions where curriculum_id = $1`, [CUR])).rows[0].id;
    expect(await failure(S1, `insert into year_requirements (version_id, formative_year, min_pct) values ($1, 2, 10)`, [v])).toBeTruthy();
  });

  it("nadie ve el avance de otra persona sin permiso", async () => {
    expect(await failure(OUTSIDER, `select * from year_status($1)`, [await ceOf(S1)])).toContain("No tienes permiso");
    expect((await as(COORD, `select * from year_status($1)`, [await ceOf(S1)])).length).toBe(3);
  });

  it("el avance de cada encuentro del plan muestra lo hecho, lo parcial y lo pendiente", async () => {
    const g = await as<{ week: number; state: string }>(S1, `select week, state from plan_progress($1, 1)`, [await ceOf(S1)]);
    expect(g).toEqual([{ week: 1, state: "hecha" }, { week: 2, state: "pendiente" }]);
  });
});

describe("avanzar de año", () => {
  it("no se avanza sin cumplir la etapa", async () => {
    expect(await failure(S1, `select advance_formative_year($1)`, [await ceOf(S1)])).toContain("Todavía no se cumplen los requisitos del año 1");
  });

  it("cumplida la etapa, la persona o su coordinador la pasan al año siguiente", async () => {
    await complete(S1, [L1B]);
    const n = await one<{ advance_formative_year: number }>(S1, `select advance_formative_year($1)`, [await ceOf(S1)]);
    expect(n.advance_formative_year).toBe(2);
    expect((await as<{ formative_year: number }>(S1, `select formative_year from curriculum_enrollments where person_id = $1`, [S1]))[0].formative_year).toBe(2);
    expect(await failure(S1, `select advance_formative_year($1)`, [await ceOf(S1)])).toContain("año 2");
  });

  it("un módulo heredado solo cuenta cuando una persona valida su crédito", async () => {
    await db.query(`insert into stage_credits (person_id, stage_id, review_status) values ($1, $2, 'por_revisar')`, [S1, C2]);
    expect((await years(S1))[1]).toMatchObject({ items_done: 0, met: false });
    await as(COORD, `select review_stage_credits($1, 'validado')`, [C2]);
    expect((await years(S1))[1]).toMatchObject({ items_done: 1, met: true });
    const n = await one<{ advance_formative_year: number }>(COORD, `select advance_formative_year($1)`, [await ceOf(S1)]);
    expect(n.advance_formative_year).toBe(3);
  });

  it("en el último año ya no hay a dónde avanzar: se pide el certificado", async () => {
    await complete(S1, [L3]);
    expect(await failure(S1, `select advance_formative_year($1)`, [await ceOf(S1)])).toContain("pide tu certificado");
  });

  it("otra persona no mueve la inscripción de alguien", async () => {
    expect(await failure(OUTSIDER, `select advance_formative_year($1)`, [await ceOf(S2)])).toContain("No tienes permiso");
  });

  it("los cambios de año quedan en la auditoría", async () => {
    const r = await db.query(`select 1 from audit_log where table_name = 'curriculum_enrollments' and detail->'after'->>'formative_year' = '3'`);
    expect(r.rows.length).toBeGreaterThan(0);
  });
});

describe("revisar lo heredado", () => {
  it("el resumen cuenta por módulo, y validar o rechazar en bloque deja constancia", async () => {
    await db.query(`insert into stage_credits (person_id, stage_id, review_status) values ($1, $3, 'por_revisar'), ($2, $3, 'por_revisar')`, [S2, S3, C2]);
    const s = await as<{ number: number; por_revisar: number; validado: number }>(COORD, `select number, por_revisar, validado from stage_credit_summary($1) where number = 2`, [CUR]);
    expect(s[0]).toEqual({ number: 2, por_revisar: 2, validado: 1 });
    const n = await one<{ review_stage_credits: number }>(COORD, `select review_stage_credits($1, 'rechazado', $2::uuid[], 'No asistió')`, [C2, [S3]]);
    expect(n.review_stage_credits).toBe(1);
    const [row] = (await db.query<{ review_status: string; reviewed_by: string; note: string }>(
      `select review_status, reviewed_by, note from stage_credits where person_id = $1 and stage_id = $2`, [S3, C2])).rows;
    expect(row).toEqual({ review_status: "rechazado", reviewed_by: COORD, note: "No asistió" });
    expect((await db.query(`select 1 from audit_log where action = 'REVIEW'`)).rows.length).toBeGreaterThan(0);
  });

  it("se puede ver la lista de personas por estado, con paginación", async () => {
    const r = await as<{ full_name: string }>(COORD, `select * from stage_credit_people($1, 'validado', 10, 0)`, [C2]);
    expect(r.map((x) => x.full_name)).toEqual(["Alumno Uno"]);
  });

  it("solo el administrador o el coordinador del programa revisan", async () => {
    expect(await failure(PASTOR_A, `select review_stage_credits($1, 'validado')`, [C2])).toContain("No tienes permiso");
    expect(await failure(S1, `select * from stage_credit_summary($1)`, [CUR])).toContain("No tienes permiso");
    expect(await failure(COORD, `select review_stage_credits($1, 'inventado')`, [C2])).toContain("La decisión debe ser");
  });

  it("el año actual se deduce de la evidencia, sin suponer nada", async () => {
    // S2: acredita sus dos unidades del año 1 y tiene el módulo heredado del año 2 validado → debería estar en el año 3
    await as(COORD, `select review_stage_credits($1, 'validado', $2::uuid[])`, [C2, [S2]]);
    await complete(S2, [L1A, L1B]);
    // S4 no tiene nada → año 1
    const n = await one<{ recompute_formative_years: number }>(COORD, `select recompute_formative_years($1)`, [CUR]);
    expect(n.recompute_formative_years).toBe(1);
    const r = await db.query<{ person_id: string; formative_year: number }>(
      `select person_id, formative_year from curriculum_enrollments where curriculum_id = $1 order by person_id`, [CUR]);
    const by = Object.fromEntries(r.rows.map((x) => [x.person_id, x.formative_year]));
    expect(by[S1]).toBe(3);
    expect(by[S2]).toBe(3);
    expect(by[S4]).toBe(1);
    expect(await failure(S1, `select recompute_formative_years($1)`, [CUR])).toContain("Solo el administrador");
  });

  it("los grupos toman el año de su módulo cuando el administrador asigna los años", async () => {
    await db.query(`insert into groups (id, season_id, cycle_id, name, modality, status) values ($1, $2, $3, 'Heredado', 'virtual', 'abierto')`, [id(130), SEASON, C3]);
    await db.query(`update groups set formative_year = 1 where id = $1`, [id(130)]);
    const n = await one<{ resync_group_years: number }>(COORD, `select resync_group_years($1)`, [CUR]);
    expect(n.resync_group_years).toBe(1);
    expect((await db.query<{ formative_year: number }>(`select formative_year from groups where id = $1`, [id(130)])).rows[0].formative_year).toBe(3);
  });

  it("los grupos que se ofrecen son los del año de la persona", async () => {
    const ceS4 = await ceOf(S4);
    const y1 = (await as<{ group_id: string }>(S4, `select group_id from compatible_groups($1)`, [ceS4])).map((g) => g.group_id);
    expect(y1.sort()).toEqual([GA, GB].sort());
    const ceS1 = await ceOf(S1);
    const y3 = (await as<{ group_id: string }>(S1, `select group_id from compatible_groups($1)`, [ceS1])).map((g) => g.group_id);
    expect(y3).toEqual([id(130)]);
  });
});

describe("certificados", () => {
  let cert: string;

  it("lista a quienes cumplen todo el programa, por sede, sin mostrar de más", async () => {
    await complete(S2, [L3]);
    const admin = await as<{ person_name: string; kind: string }>(ADMIN, `select person_name, kind from certificate_candidates($1)`, [CUR]);
    expect(admin.map((r) => r.person_name).sort()).toEqual(["Alumno Dos", "Alumno Uno"]);
    // el pastor de Puente Alto solo ve a su sede: S1 tiene grupo en Puente Alto, S2 en Santiago
    const a = await as<{ person_name: string; can_issue: boolean }>(PASTOR_A, `select person_name, can_issue from certificate_candidates($1)`, [CUR]);
    expect(a).toEqual([{ person_name: "Alumno Uno", can_issue: true }]);
    const b = await as<{ person_name: string }>(PASTOR_B, `select person_name from certificate_candidates($1)`, [CUR]);
    expect(b.map((r) => r.person_name)).toEqual(["Alumno Dos"]);
    // el coordinador ve la lista, pero no puede emitir
    const c = await as<{ can_issue: boolean }>(COORD, `select can_issue from certificate_candidates($1)`, [CUR]);
    expect(c.every((r) => r.can_issue === false)).toBe(true);
    expect(await failure(OUTSIDER, `select * from certificate_candidates($1)`, [CUR])).toContain("No tienes permiso");
    expect(await as(ADMIN, `select * from certificate_candidates($1)`, [CUR1Y])).toHaveLength(0);
  });

  it("emite el administrador o el pastor de la sede de la persona; nadie más", async () => {
    expect(await failure(COORD, `select issue_certificate($1)`, [await ceOf(S1)])).toContain("Solo el administrador o el pastor");
    expect(await failure(PASTOR_B, `select issue_certificate($1)`, [await ceOf(S1)])).toContain("Solo el administrador o el pastor");
    expect(await failure(S1, `select issue_certificate($1)`, [await ceOf(S1)])).toContain("Solo el administrador o el pastor");
    cert = (await one<{ issue_certificate: string }>(PASTOR_A, `select issue_certificate($1)`, [await ceOf(S1)])).issue_certificate;
    const [c] = (await db.query<{ kind: string; status: string; issued_by: string; campus_id: string; code: string; snap: any }>(
      `select kind, status, issued_by, campus_id, code, rule_snapshot snap from certificates where id = $1`, [cert])).rows;
    expect(c).toMatchObject({ kind: "programa", status: "emitido", issued_by: PASTOR_A, campus_id: CAMP_A });
    expect(c.code).toMatch(/^[A-F0-9]{12}$/);
    expect(c.snap.programa).toBe("AR Hombres de prueba");
    expect(c.snap.anios).toHaveLength(3);
  });

  it("emitir otra vez devuelve el mismo certificado, y la inscripción queda completada", async () => {
    const again = await one<{ issue_certificate: string }>(ADMIN, `select issue_certificate($1)`, [await ceOf(S1)]);
    expect(again.issue_certificate).toBe(cert);
    expect((await db.query(`select 1 from certificates where person_id = $1`, [S1])).rows).toHaveLength(1);
    const [ce] = (await db.query<{ status: string; completed_at: string | null }>(`select status, completed_at from curriculum_enrollments where person_id = $1`, [S1])).rows;
    expect(ce.status).toBe("completado");
    expect(ce.completed_at).toBeTruthy();
    // ya no figura como candidato
    expect((await as<{ person_name: string }>(ADMIN, `select person_name from certificate_candidates($1)`, [CUR])).map((r) => r.person_name)).toEqual(["Alumno Dos"]);
  });

  it("sin cumplir los requisitos no hay certificado, y el mensaje dice qué falta", async () => {
    const msg = await failure(ADMIN, `select issue_certificate($1)`, [await ceOf(S4)]);
    expect(msg).toContain("Todavía no cumple los requisitos");
    expect(msg).toContain("año 1");
  });

  it("sin sede conocida solo el administrador emite", async () => {
    await db.query(`update curriculum_enrollments set status = 'activo' where person_id = $1`, [S2]);
    await db.query(`update groups set campus_id = null where id = $1`, [GB]);
    expect(await failure(PASTOR_B, `select issue_certificate($1)`, [await ceOf(S2)])).toContain("Solo el administrador o el pastor");
    await db.query(`update groups set campus_id = $2 where id = $1`, [GB, CAMP_B]);
  });

  it("la sede del perfil sirve cuando la persona no tiene grupo con sede", async () => {
    // S3 no tiene grupo y su perfil dice Puente Alto: la valida su pastor
    await complete(S3, [L1A, L1B, L3]);
    await as(COORD, `select review_stage_credits($1, 'validado', $2::uuid[])`, [C2, [S3]]).catch(() => {});
    await db.query(`insert into stage_credits (person_id, stage_id, review_status) values ($1, $2, 'validado') on conflict (person_id, stage_id, source) do update set review_status = 'validado'`, [S3, C2]);
    const id3 = (await one<{ issue_certificate: string }>(PASTOR_A, `select issue_certificate($1)`, [await ceOf(S3)])).issue_certificate;
    expect(id3).toBeTruthy();
    // el pastor de otra sede no puede, aunque el certificado ya exista
    expect(await failure(PASTOR_B, `select issue_certificate($1)`, [await ceOf(S3)])).toContain("Solo el administrador o el pastor");
  });

  it("la persona ve sus certificados; los demás no, salvo quien administra", async () => {
    expect(await as(S1, `select id from certificates`)).toHaveLength(1);
    expect(await as(S2, `select id from certificates`)).toHaveLength(0);
    expect((await as(COORD, `select id from certificates`)).length).toBeGreaterThan(0);
    expect((await as(PASTOR_A, `select person_id from certificates`)).length).toBeGreaterThan(0);
    expect(await as(PASTOR_B, `select id from certificates where person_id = $1`, [S1])).toHaveLength(0);
  });

  it("nadie escribe certificados directamente", async () => {
    expect(await failure(ADMIN, `update certificates set status = 'revocado' where id = $1`, [cert])).toBe("");
    // el administrador tiene permiso general sobre tablas en las pruebas; para los demás la tabla no tiene política de escritura
    expect(await as(S1, `update certificates set kind = 'etapa' where id = $1 returning id`, [cert])).toHaveLength(0);
    await db.query(`update certificates set status = 'emitido' where id = $1`, [cert]);
  });

  it("cualquiera puede verificar un código, y solo ve lo mínimo", async () => {
    const [{ code }] = (await db.query<{ code: string }>(`select code from certificates where id = $1`, [cert])).rows;
    const r = await as<Record<string, unknown>>(ADMIN, `select * from verify_certificate($1)`, [code.toLowerCase()], "anon");
    expect(r).toHaveLength(1);
    expect(Object.keys(r[0]).sort()).toEqual(["campus", "formative_year", "full_name", "issued_at", "kind", "program", "status"]);
    expect(r[0]).toMatchObject({ full_name: "Alumno Uno", program: "AR Hombres de prueba", kind: "programa", status: "emitido" });
    expect(await as(ADMIN, `select * from verify_certificate('XXXX')`, [], "anon")).toHaveLength(0);
    expect(await as(ADMIN, `select * from verify_certificate('')`, [], "anon")).toHaveLength(0);
  });

  it("revocar es del administrador, exige motivo y se ve al verificar", async () => {
    expect(await failure(PASTOR_A, `select revoke_certificate($1, 'error')`, [cert])).toContain("Solo el administrador");
    expect(await failure(ADMIN, `select revoke_certificate($1, '')`, [cert])).toContain("motivo");
    await as(ADMIN, `select revoke_certificate($1, 'Emitido por error')`, [cert]);
    const [{ code }] = (await db.query<{ code: string }>(`select code from certificates where id = $1`, [cert])).rows;
    expect((await as<{ status: string }>(ADMIN, `select status from verify_certificate($1)`, [code], "anon"))[0].status).toBe("revocado");
    expect(await failure(ADMIN, `select revoke_certificate($1, 'otra vez')`, [cert])).toContain("ya estaba revocado");
    expect((await db.query(`select 1 from audit_log where action in ('ISSUE', 'REVOKE')`)).rows.length).toBeGreaterThanOrEqual(3);
  });

  it("después de revocar se puede emitir uno nuevo, con otro código", async () => {
    const n = await one<{ issue_certificate: string }>(ADMIN, `select issue_certificate($1)`, [await ceOf(S1)]);
    expect(n.issue_certificate).not.toBe(cert);
    expect((await db.query(`select 1 from certificates where person_id = $1`, [S1])).rows).toHaveLength(2);
  });
});

describe("certificados por etapa y programas de un año", () => {
  it("una etapa se certifica cuando ese año está cumplido (solo programas de varios años)", async () => {
    const cands = await as<{ person_name: string; kind: string; formative_year: number }>(ADMIN, `select person_name, kind, formative_year from certificate_candidates($1, 1)`, [CUR]);
    expect(cands.every((c) => c.kind === "etapa" && c.formative_year === 1)).toBe(true);
    expect(cands.map((c) => c.person_name)).toContain("Alumno Dos");
    const cert = await one<{ issue_certificate: string }>(ADMIN, `select issue_certificate($1, 1)`, [await ceOf(S2)]);
    expect(cert.issue_certificate).toBeTruthy();
    const [c] = (await db.query<{ kind: string; formative_year: number }>(`select kind, formative_year from certificates where id = $1`, [cert.issue_certificate])).rows;
    expect(c).toEqual({ kind: "etapa", formative_year: 1 });
    // una etapa no completa el programa
    expect((await db.query<{ status: string }>(`select status from curriculum_enrollments where person_id = $1`, [S2])).rows[0].status).toBe("activo");
  });

  it("un año que no está cumplido o que no existe no se certifica", async () => {
    expect(await failure(ADMIN, `select issue_certificate($1, 1)`, [await ceOf(S4)])).toContain("Todavía no cumple");
    expect(await failure(ADMIN, `select issue_certificate($1, 9)`, [await ceOf(S2)])).toBeTruthy();
  });

  it("un programa de un año solo da certificado del programa; uno no certificable, ninguno", async () => {
    await db.query(`insert into cycles (id, curriculum_id, number) values ($1, $2, 1)`, [id(140), CUR1Y]);
    await db.query(`insert into lessons (id, cycle_id, number, title) values ($1, $2, 1, 'Única')`, [id(141), id(140)]);
    await as(S1, `select enroll_curriculum($1)`, [CUR1Y]);
    await as(COORD, `select 1`).catch(() => {});
    await db.query(`insert into curriculum_coordinators values ($1, $2)`, [CUR1Y, COORD]);
    await db.query(`insert into campus_pastors values ($1, $2) on conflict do nothing`, [ADMIN, CAMP_A]);
    const ce = await ceOf(S1, CUR1Y);
    await as(COORD, `select record_unit_completion($1, $2, 'manual')`, [ce, id(141)]);
    expect(await failure(ADMIN, `select issue_certificate($1, 1)`, [ce])).toContain("un solo año");
    expect((await one<{ issue_certificate: string }>(ADMIN, `select issue_certificate($1)`, [ce])).issue_certificate).toBeTruthy();

    await db.query(`update curriculums set certifiable = false where id = $1`, [CUR1Y]);
    await db.query(`update certificates set status = 'revocado' where curriculum_id = $1`, [CUR1Y]);
    expect(await failure(ADMIN, `select issue_certificate($1)`, [ce])).toContain("no entrega certificado");
  });
});

describe("cifras de formación y reincorporaciones", () => {
  it("las personas que pausan y vuelven se cuentan como reincorporadas", async () => {
    const ce = await ceOf(S4);
    await as(S4, `select pause_curriculum_enrollment($1, 'viaje')`, [ce]);
    await as(S4, `select resume_curriculum_enrollment($1)`, [ce]);
    const [c] = (await db.query<{ resumed_count: number; resumed_at: string | null }>(`select resumed_count, resumed_at from curriculum_enrollments where id = $1`, [ce])).rows;
    expect(c.resumed_count).toBe(1);
    expect(c.resumed_at).toBeTruthy();
  });

  it("el panel separa inscritos únicos, activos, pausados, completados, reincorporados, asistentes y certificados", async () => {
    const [f] = await as<Record<string, number>>(ADMIN, `select * from panel_formacion()`);
    expect(f.personas_unicas).toBe(4);
    expect(f.completados).toBeGreaterThanOrEqual(2);
    expect(f.reincorporados).toBe(1);
    expect(f.certificados_programa).toBeGreaterThanOrEqual(2);
    expect(f.certificados_etapa).toBeGreaterThanOrEqual(1);
    expect(f.asistentes_30d).toBe(0); // la única lista pasada fue en marzo
    expect(Object.keys(f)).toEqual(["personas_unicas", "activos", "pausados", "completados", "reincorporados", "asistentes_30d", "certificados_programa", "certificados_etapa"]);
  });

  it("la migración 010 es repetible", async () => {
    const q = `select (select count(*) from certificates)::int c, (select count(*) from campus_pastors)::int p, (select count(*) from year_requirements)::int y`;
    const before = (await db.query(q)).rows[0];
    await db.exec(sql("010_certificados.sql"));
    expect((await db.query(q)).rows[0]).toEqual(before);
  });
});
