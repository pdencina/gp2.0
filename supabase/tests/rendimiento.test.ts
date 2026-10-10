import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Medición con volumen parecido al real (miles de personas, grupos, inscripciones y registros de asistencia).
// No corre con el resto de las pruebas: se activa con  GP2_BENCH=1 npx vitest run supabase/tests/rendimiento.test.ts
// Los tiempos son de un Postgres en memoria dentro de Node: sirven para comparar consultas entre sí, no como cifras de producción.

const run = process.env.GP2_BENCH ? describe : describe.skip;
const sql = (f: string) => readFileSync(join(__dirname, "../v2", f), "utf8");
const ALL = [
  "001_schema.sql", "004_rendimiento.sql", "005_panel.sql", "006_gp2_nucleo.sql", "007_catalogo.sql",
  "008_calendario.sql", "009_biblioteca.sql", "010_certificados.sql", "011_habilitacion.sql",
];
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

const N_PEOPLE = Number(process.env.GP2_BENCH_PEOPLE ?? 8000);
const uuid = (prefix: string, n: string) => `('${prefix}' || lpad((${n})::text, 12, '0'))::uuid`;
const timings: { consulta: string; ms: number; filas: number }[] = [];

let db: PGlite;
let ADMIN = "", COORD = "", LEADER = "", PERSON = "", PERSON_CE = "", GROUP = "";

async function timed<T extends Record<string, unknown>>(label: string, uid: string, q: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  const t0 = performance.now();
  let rows: T[] = [];
  try {
    rows = (await db.query<T>(q, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
  const ms = Math.round(performance.now() - t0);
  timings.push({ consulta: label, ms, filas: rows.length });
  return { rows, ms };
}

const exec = async (text: string) => {
  try {
    await db.exec(text);
  } catch (e) {
    console.log("FALLÓ:", text.slice(0, 400));
    throw e;
  }
};

run("rendimiento con volumen real", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(STUBS);
    for (const f of ALL) await db.exec(sql(f));
    await db.exec(GRANTS);

    // Personas: 1 administrador, 6 coordinadores, 400 líderes y el resto participantes
    await exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      select ${uuid("00000000-0000-0000-0001-", "g")}, 'p' || g || '@t.l', jsonb_build_object('full_name', 'Persona ' || g)
        from generate_series(1, ${N_PEOPLE}) g;
      update profiles set role = 'admin' where id = ${uuid("00000000-0000-0000-0001-", "1")};
      update profiles set role = 'coordinador' where id in (select ${uuid("00000000-0000-0000-0001-", "g")} from generate_series(2, 7) g);
      update profiles set role = 'lider' where id in (select ${uuid("00000000-0000-0000-0001-", "g")} from generate_series(8, 407) g);
      update profiles set gender = 'hombre', birth_date = '1990-01-01', terms_accepted_at = now(), campus_id = (select id from campuses order by name limit 1);
    `);
    ADMIN = "00000000-0000-0000-0001-000000000001";
    COORD = "00000000-0000-0000-0001-000000000002";
    LEADER = "00000000-0000-0000-0001-000000000008";
    PERSON = "00000000-0000-0000-0001-000000001000";

    // 10 programas (AR Hombres de 3 años) y una temporada
    await exec(`
      insert into curriculums (id, name, duration_years, certifiable)
      select ${uuid("00000000-0000-0000-0002-", "g")}, 'Programa ' || g, case when g = 1 then 3 else 1 end, g = 1 from generate_series(1, 10) g;
      insert into curriculum_coordinators select ${uuid("00000000-0000-0000-0002-", "g")}, ${uuid("00000000-0000-0000-0001-", "2")} from generate_series(1, 10) g;
      insert into seasons (id, name, start_date, end_date, status) values ('00000000-0000-0000-0003-000000000001', '2026', '2026-03-02', '2026-11-30', 'en_curso');
      insert into cycles (id, curriculum_id, number, formative_year)
        select ${uuid("00000000-0000-0000-0004-", "g")}, ${uuid("00000000-0000-0000-0002-", "case when g <= 3 then 1 else g - 2 end")}, case when g <= 3 then g else 1 end, case when g <= 3 then g else 1 end
          from generate_series(1, 12) g;
      insert into lessons (cycle_id, number, title) select c.id, n, 'U' || n from cycles c cross join generate_series(1, 12) n;
    `);

    // 1.500 grupos; 20.000 inscripciones; 300 grupos con 20 reuniones y asistencia
    await exec(`
      select set_config('app.skip_checks', 'on', false);
      insert into groups (id, season_id, curriculum_id, name, leader_id, campus_id, weekday, modality, capacity, status)
        select ${uuid("00000000-0000-0000-0005-", "g")}, '00000000-0000-0000-0003-000000000001',
               ${uuid("00000000-0000-0000-0002-", "(g % 10) + 1")}, 'Grupo ' || g,
               ${uuid("00000000-0000-0000-0001-", "8 + (g % 400)")}, (select id from campuses order by name offset (g % 9) limit 1),
               1 + g % 7, 'virtual', 30, case when g % 5 = 0 then 'finalizado' else 'en_curso' end::group_status
          from generate_series(1, 1500) g;
      insert into enrollments (person_id, group_id, status, enrolled_at)
        select ${uuid("00000000-0000-0000-0001-", `408 + (g % ${N_PEOPLE - 408})`)}, ${uuid("00000000-0000-0000-0005-", "1 + (g % 1500)")},
               case when g % 4 = 0 then 'aprobado' else 'en_curso' end::enrollment_status, '2026-03-01'
          from generate_series(1, 20000) g
        on conflict do nothing;
      select set_config('app.skip_checks', 'off', false);
      insert into meetings (group_id, held_on, status, season_week)
        select ${uuid("00000000-0000-0000-0005-", "g")}, date '2026-03-02' + (w * 7) + (g % 7), 'realizada', w
          from generate_series(1, 300) g cross join generate_series(1, 20) w;
      insert into attendance (meeting_id, enrollment_id, status)
        select m.id, e.id, case when (e.id::text < '8') then 'presente' else 'ausente' end::attendance_status
          from meetings m join enrollments e on e.group_id = m.group_id and e.status = 'en_curso';
    `);
    // AR Hombres: miles de personas con créditos heredados validados
    await exec(`
      insert into stage_credits (person_id, stage_id, review_status)
        select ce.person_id, ${uuid("00000000-0000-0000-0004-", "1")}, 'validado' from curriculum_enrollments ce
         where ce.curriculum_id = ${uuid("00000000-0000-0000-0002-", "1")} on conflict do nothing;
    `);
    PERSON_CE = (await db.query<{ id: string }>(`select id from curriculum_enrollments where person_id = $1 limit 1`, [PERSON])).rows[0]?.id ?? "";
    GROUP = "00000000-0000-0000-0005-000000000001";
    const counts = (await db.query(
      `select (select count(*) from profiles)::int personas, (select count(*) from groups)::int grupos,
              (select count(*) from enrollments)::int inscripciones, (select count(*) from curriculum_enrollments)::int inscripciones_curriculares,
              (select count(*) from meetings)::int reuniones, (select count(*) from attendance)::int asistencia`)).rows[0];
    console.log("Volumen de la prueba:", counts);
  }, 900_000);

  it("mide las consultas principales", async () => {
    await timed("administrador · lista de grupos (group_overview)", ADMIN, `select * from group_overview`);
    await timed("coordinador · lista de grupos", COORD, `select * from group_overview`);
    await timed("líder · lista de grupos", LEADER, `select * from group_overview`);
    await timed("participante · catálogo de grupos abiertos", PERSON, `select * from group_overview where status = 'abierto'`);
    await timed("participante · sus inscripciones", PERSON, `select * from enrollments`);
    await timed("líder · alertas (my_alerts)", LEADER, `select * from my_alerts()`);
    await timed("coordinador · alertas", COORD, `select * from my_alerts()`);
    await timed("administrador · alertas", ADMIN, `select * from my_alerts()`);
    await timed("líder · nómina de un grupo (roster)", LEADER, `select * from roster where group_id = $1`, [GROUP]);
    await timed("administrador · panel_resumen", ADMIN, `select * from panel_resumen()`);
    await timed("administrador · panel_cobertura", ADMIN, `select * from panel_cobertura()`);
    await timed("administrador · panel_formacion", ADMIN, `select * from panel_formacion()`);
    await timed("administrador · reconciliación", ADMIN, `select * from reconciliacion()`);
    await timed("administrador · habilitación por sede", ADMIN, `select * from campus_readiness()`);
    await timed("administrador · candidatos a certificado (AR Hombres)", ADMIN, `select * from certificate_candidates($1, null, 200)`, ["00000000-0000-0000-0002-000000000001"]);
    await timed("administrador · resumen de créditos heredados", ADMIN, `select * from stage_credit_summary($1)`, ["00000000-0000-0000-0002-000000000001"]);
    if (PERSON_CE) await timed("participante · su avance por año", PERSON, `select * from year_status($1)`, [PERSON_CE]);
    await timed("participante · unidades visibles", PERSON, `select count(*) from lessons`);
    await timed("administrador · cobertura por sede", ADMIN, `select * from panel_curriculums()`);
    console.table(timings);
    // referencia amplia: lo que pase de aquí es una consulta que hay que mirar
    for (const t of timings) expect(t.ms, t.consulta).toBeLessThan(60_000);
  }, 900_000);
});

it("este archivo existe aunque no se mida", () => {
  expect(true).toBe(true);
});
