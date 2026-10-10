import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Asignar sedes por lote (013_sedes_por_lote.sql)

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
  "009_biblioteca.sql", "010_certificados.sql", "011_habilitacion.sql", "013_sedes_por_lote.sql",
];

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), COORD = id(2), LEADER_PA = id(3), LEADER_NONE = id(4);
const P = (n: number) => id(10 + n);
const LM = id(100), HOM = id(101), SEASON = id(102);
const G = (n: number) => id(200 + n);

let db: PGlite;
let PA = "", SCL = "", VIRT = "";

async function as<T = Record<string, unknown>>(uid: string, q: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query<T>(q, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const gap = async (key: string) => Number((await as<{ clave: string; n: string }>(ADMIN, `select clave, n from campus_gaps()`)).find((r) => r.clave === key)!.n);
const campusOf = async (gid: string) => (await q<{ campus_id: string | null }>(`select campus_id from groups where id = $1`, [gid]))[0].campus_id;
const personCampus = async (pid: string) => (await q<{ campus_id: string | null }>(`select campus_id from profiles where id = $1`, [pid]))[0].campus_id;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  for (const f of ALL) await db.exec(sql(f));
  await db.exec(GRANTS);
  const people: [string, string][] = [[ADMIN, "Admin"], [COORD, "Coordinador"], [LEADER_PA, "Líder Puente Alto"], [LEADER_NONE, "Líder sin sede"],
    ...Array.from({ length: 8 }, (_, i) => [P(i + 1), `Persona ${i + 1}`] as [string, string])];
  for (const [uid, name] of people) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [uid, `${uid}@t.l`, JSON.stringify({ full_name: name })]);
  }
  PA = (await q<{ id: string }>(`select id from campuses where name = 'Puente Alto'`))[0].id;
  SCL = (await q<{ id: string }>(`select id from campuses where name = 'Santiago centro'`))[0].id;
  VIRT = (await q<{ id: string }>(`select id from campuses where name = 'Virtual'`))[0].id;

  await db.exec(`
    update profiles set role = 'admin' where id = '${ADMIN}';
    update profiles set role = 'coordinador' where id = '${COORD}';
    update profiles set role = 'lider', campus_id = '${PA}' where id = '${LEADER_PA}';
    update profiles set role = 'lider' where id = '${LEADER_NONE}';
    insert into curriculums (id, name) values ('${LM}', 'Libro Morado'), ('${HOM}', 'AR Hombres');
    insert into seasons (id, name, start_date, end_date, status) values ('${SEASON}', '2026', '2026-03-02', '2026-11-30', 'en_curso');
    -- G1: virtual LM con líder de Puente Alto · G2: presencial LM sin líder con sede · G3: virtual HOM · G4: presencial HOM con sede ya asignada · G5: finalizado
    insert into groups (id, season_id, curriculum_id, name, leader_id, campus_id, modality, status) values
      ('${G(1)}', '${SEASON}', '${LM}', 'G1', '${LEADER_PA}', null, 'virtual', 'en_curso'),
      ('${G(2)}', '${SEASON}', '${LM}', 'G2', '${LEADER_NONE}', null, 'presencial', 'en_curso'),
      ('${G(3)}', '${SEASON}', '${HOM}', 'G3', null, null, 'virtual', 'abierto'),
      ('${G(4)}', '${SEASON}', '${HOM}', 'G4', null, '${SCL}', 'presencial', 'en_curso'),
      ('${G(5)}', '${SEASON}', '${LM}', 'G5', null, null, 'presencial', 'finalizado');
    update profiles set country = 'CL', city = 'puente alto' where id in ('${P(1)}', '${P(2)}');
    update profiles set country = 'CL', city = ' Puente Alto ' where id = '${P(3)}';
    update profiles set country = 'UY', city = 'Montevideo' where id = '${P(4)}';
    update profiles set country = null, city = null where id in ('${P(5)}', '${P(6)}');
  `);
  // P7 y P8 participan en el grupo G4 (que ya tiene sede) y no tienen sede propia
  await db.exec(`
    select set_config('app.skip_checks', 'on', false);
    insert into enrollments (person_id, group_id, status) values ('${P(7)}', '${G(4)}', 'en_curso'), ('${P(8)}', '${G(4)}', 'aprobado');
    select set_config('app.skip_checks', 'off', false);
  `);
});

describe("panorama", () => {
  it("cuenta lo que falta y lo que se puede resolver con un criterio sencillo", async () => {
    expect(await gap("grupos_sin_sede")).toBe(3); // G1, G2, G3 (G5 está finalizado y G4 ya tiene sede)
    expect(await gap("grupos_sin_sede_online")).toBe(2);
    expect(await gap("grupos_con_lider_con_sede")).toBe(1);
    expect(await gap("personas_sin_sede")).toBe(11); // todas menos el líder de Puente Alto
    expect(await gap("personas_con_grupo_con_sede")).toBe(2);
  });

  it("agrupa a las personas por país y ciudad, sin importar mayúsculas ni espacios", async () => {
    const b = await as<{ country: string; city: string; n: string }>(ADMIN, `select * from campus_city_buckets()`);
    expect(Number(b.find((x) => x.country === "CL" && x.city === "Puente Alto")?.n)).toBe(3);
    expect(Number(b.find((x) => x.country === "UY")?.n)).toBe(1);
  });
});

describe("grupos", () => {
  it("por criterio: solo los activos sin sede que cumplen el programa y la modalidad", async () => {
    const n = (await as<{ assign_groups_campus: number }>(ADMIN, `select assign_groups_campus($1, $2, 'virtual', null)`, [VIRT, HOM]))[0].assign_groups_campus;
    expect(n).toBe(1);
    expect(await campusOf(G(3))).toBe(VIRT);
    expect(await campusOf(G(1))).toBeNull(); // virtual pero de otro programa
    expect(await campusOf(G(5))).toBeNull(); // finalizado
  });

  it("nunca cambia una sede ya asignada", async () => {
    const n = (await as<{ assign_groups_campus: number }>(ADMIN, `select assign_groups_campus($1)`, [VIRT]))[0].assign_groups_campus;
    expect(n).toBe(2); // G1 y G2; G4 conserva Santiago centro
    expect(await campusOf(G(4))).toBe(SCL);
    await db.exec(`select set_config('app.skip_audit', 'on', false); update groups set campus_id = null where id in ('${G(1)}', '${G(2)}'); select set_config('app.skip_audit', 'off', false);`);
  });

  it("según la sede del líder", async () => {
    const n = (await as<{ assign_groups_campus_from_leader: number }>(ADMIN, `select assign_groups_campus_from_leader()`))[0].assign_groups_campus_from_leader;
    expect(n).toBe(1);
    expect(await campusOf(G(1))).toBe(PA);
    expect(await campusOf(G(2))).toBeNull(); // su líder no tiene sede
  });

  it("valida la sede y la modalidad", async () => {
    await expect(as(ADMIN, `select assign_groups_campus($1)`, [id(999)])).rejects.toThrow(/no existe/);
    await expect(as(ADMIN, `select assign_groups_campus($1, null, 'híbrida')`, [VIRT])).rejects.toThrow(/modalidad/);
  });

  it("deja una sola anotación resumen en la auditoría, no una por grupo", async () => {
    const bulk = await q<{ action: string }>(`select action from audit_log where action like 'BULK_GROUP%' order by id`);
    expect(bulk.map((b) => b.action)).toEqual(["BULK_GROUP_CAMPUS", "BULK_GROUP_CAMPUS", "BULK_GROUP_CAMPUS_FROM_LEADER"]);
    const perGroup = await q(`select 1 from audit_log where table_name = 'groups' and action = 'UPDATE' and detail->'after'->>'name' in ('G1', 'G2', 'G3')`);
    expect(perGroup).toHaveLength(0);
  });
});

describe("personas", () => {
  it("por ciudad: solo las que no tenían sede, con la ciudad escrita de cualquier forma", async () => {
    const n = (await as<{ assign_people_campus_by_city: number }>(ADMIN, `select assign_people_campus_by_city($1, 'CL', 'PUENTE ALTO')`, [PA]))[0].assign_people_campus_by_city;
    expect(n).toBe(3);
    for (const p of [P(1), P(2), P(3)]) expect(await personCampus(p)).toBe(PA);
    expect(await personCampus(P(4))).toBeNull();
    // repetirlo no cambia nada
    expect((await as<{ assign_people_campus_by_city: number }>(ADMIN, `select assign_people_campus_by_city($1, 'CL', 'Puente Alto')`, [SCL]))[0].assign_people_campus_by_city).toBe(0);
    expect(await personCampus(P(1))).toBe(PA);
  });

  it("sin dato de país ni ciudad también se puede asignar como un grupo", async () => {
    const n = (await as<{ assign_people_campus_by_city: number }>(ADMIN, `select assign_people_campus_by_city($1, '', '')`, [VIRT]))[0].assign_people_campus_by_city;
    expect(n).toBe(7); // el administrador, el coordinador, un líder y P5 a P8 no tienen país ni ciudad
    for (const p of [P(5), P(6), P(7), P(8)]) expect(await personCampus(p)).toBe(VIRT);
    await db.query(`update profiles set campus_id = null where id in ($1, $2, $3, $4, $5, $6, $7)`, [ADMIN, COORD, LEADER_NONE, P(5), P(6), P(7), P(8)]);
  });

  it("según la sede de su grupo", async () => {
    const n = (await as<{ assign_people_campus_from_groups: number }>(ADMIN, `select assign_people_campus_from_groups()`))[0].assign_people_campus_from_groups;
    expect(n).toBe(2);
    expect(await personCampus(P(7))).toBe(SCL);
    expect(await personCampus(P(8))).toBe(SCL);
  });
});

describe("permisos", () => {
  it("solo el administrador", async () => {
    for (const uid of [COORD, LEADER_PA, P(1)]) {
      await expect(as(uid, `select * from campus_gaps()`)).rejects.toThrow(/Solo el administrador/);
      await expect(as(uid, `select assign_groups_campus($1)`, [VIRT])).rejects.toThrow(/Solo el administrador/);
      await expect(as(uid, `select assign_people_campus_from_groups()`)).rejects.toThrow(/Solo el administrador/);
    }
  });

  it("después de asignar, la habilitación por sede lo refleja", async () => {
    const r = await as<{ campus: string; grupos_activos: number }>(ADMIN, `select campus, grupos_activos from campus_readiness()`);
    expect(r.find((x) => x.campus === "Puente Alto")?.grupos_activos).toBe(1); // G1
    expect(r.find((x) => x.campus === "Sin sede asignada")?.grupos_activos).toBe(1); // G2
  });
});
