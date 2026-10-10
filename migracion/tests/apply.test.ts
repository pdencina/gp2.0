import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { applyPlan, type AuthCreator, type Rpc } from "../lib/apply";
import { parseDump } from "../lib/mysqldump";
import { transform, type Plan } from "../lib/transform";
import { OLD_DB, toDump } from "./fixture";

// Importación completa contra un Postgres real con el esquema v2 y las funciones de importación.

const STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    encrypted_password text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`;
const sql = (rel: string) => readFileSync(join(__dirname, "../../supabase/v2", rel), "utf8");

let db: PGlite;
let plan: Plan;
let created: string[] = [];

// Hace lo mismo que la API de Supabase: llama a la función con su único argumento.
const rpc: Rpc = async (fn, args) => {
  const [key, value] = Object.entries(args)[0];
  const cast = key === "rows" ? "jsonb" : key === "ids" ? "uuid[]" : "text[]";
  const param = key === "rows" ? JSON.stringify(value) : value;
  const r = await db.query<Record<string, unknown>>(`select * from ${fn}($1::${cast})`, [param]);
  return fn === "import_auth_map" ? r.rows : r.rows[0][fn];
};

const createAuthUser: AuthCreator = async ({ email, passwordHash, fullName }) => {
  created.push(email);
  await db.query(
    `insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3)`,
    [email, passwordHash, JSON.stringify({ full_name: fullName })]
  );
};
const count = async (table: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  await db.exec(sql("001_schema.sql"));
  await db.exec(sql("002_importacion.sql"));
  await db.exec(sql("004_rendimiento.sql"));
  await db.exec(sql("005_panel.sql"));
  await db.exec(sql("006_gp2_nucleo.sql"));
  await db.exec(sql("007_catalogo.sql"));
  await db.exec(sql("008_calendario.sql"));
  await db.exec(sql("009_biblioteca.sql"));
  plan = transform(parseDump(toDump(OLD_DB)), new Date("2026-10-09T00:00:00Z"));

  // Cuentas y datos que ya existían en la plataforma nueva antes de importar
  await db.exec(`
    insert into auth.users (email, raw_user_meta_data) values ('ana@x.cl', '{"full_name":"Ana Cuenta Nueva"}');
    update profiles set role = 'coordinador' where id = (select id from auth.users where email = 'ana@x.cl');
    insert into curriculums (name) values ('HOMBRES');
  `);
});

describe("seguridad de las funciones de importación", () => {
  it("los usuarios de la aplicación no pueden usarlas", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query(`select import_profiles('[]'::jsonb)`)).rejects.toThrow(/permission denied/);
        await expect(db.query(`select * from import_auth_map(array['a@x.cl'])`)).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec("reset role");
      }
    }
  });

  it("la clave de administración sí puede", async () => {
    await db.exec("set role service_role");
    try {
      const r = await db.query(`select * from import_auth_map(array['nadie@x.cl'])`);
      expect(r.rows).toEqual([]);
    } finally {
      await db.exec("reset role");
    }
  });

  it("avisa con claridad si faltan instaladas", async () => {
    const failing: Rpc = async () => {
      throw new Error("import_auth_map: 404 Could not find the function public.import_auth_map");
    };
    await expect(applyPlan(plan, { rpc: failing, createAuthUser })).rejects.toThrow(/002_importacion\.sql/);
  });
});

describe("importación completa sobre el esquema v2", () => {
  it("importa todo sin errores", async () => {
    const result = await applyPlan(plan, { rpc, createAuthUser });
    expect(result).toMatchObject({
      cuentas_creadas: 5, perfiles: 6, curriculums: 2, temporadas: 5, ciclos: 2, grupos: 4, reuniones: 10, recursos: 1,
    });
  });

  it("crea las cuentas que faltaban y respeta la que ya existía", async () => {
    expect(created.sort()).toEqual(["admin@x.cl", "coord@x.cl", "lider2@x.cl", "luis@x.cl", "viejo@x.cl"]);
    expect(await count("auth.users")).toBe(6);
    const pw = (await db.query<{ encrypted_password: string }>(`select encrypted_password from auth.users where email = 'luis@x.cl'`)).rows[0];
    expect(pw.encrypted_password.startsWith("$2a$10$")).toBe(true);
  });

  it("nunca baja el rol de una cuenta existente", async () => {
    const ana = (await db.query<{ role: string; full_name: string; phone: string }>(
      `select p.role, p.full_name, p.phone from profiles p join auth.users u on u.id = p.id where u.email = 'ana@x.cl'`
    )).rows[0];
    expect(ana.role).toBe("coordinador"); // en la plataforma antigua era monitor
    expect(ana.phone).toBe("+56912345678");
    const roles = (await db.query<{ role: string; email: string }>(
      `select u.email, p.role from profiles p join auth.users u on u.id = p.id order by u.email`
    )).rows;
    expect(Object.fromEntries(roles.map((r) => [r.email, r.role]))).toMatchObject({
      "admin@x.cl": "admin", "coord@x.cl": "coordinador", "lider2@x.cl": "lider", "luis@x.cl": "alumno",
    });
  });

  it("guarda el historial de roles de las cuentas nuevas y no toca el de las existentes", async () => {
    const hist = async (email: string) =>
      (await db.query<{ to_role: string }>(
        `select h.to_role from role_history h join auth.users u on u.id = h.person_id where u.email = $1 order by h.created_at`, [email]
      )).rows.map((r) => r.to_role);
    expect(await hist("luis@x.cl")).toEqual(["alumno"]);
    expect(await hist("lider2@x.cl")).toEqual(["lider"]);
    // solo lo que ya tenía (alta como alumno y luego su ascenso a coordinador en la plataforma nueva)
    expect(await hist("ana@x.cl")).toEqual(["alumno", "coordinador"]);
  });

  it("renombra un currículum que choca con uno existente", async () => {
    const names = (await db.query<{ name: string }>(`select name from curriculums order by name`)).rows.map((r) => r.name);
    expect(names).toEqual(["COORD GLOBAL", "HOMBRES", "HOMBRES (importado)"]);
  });

  it("los grupos quedan con su líder y monitor, y el cupo respeta los inscritos", async () => {
    const g = (await db.query<{ status: string; weekday: number; modality: string; leader: string | null; capacity: number; address: string | null }>(
      `select g.status, g.weekday, g.modality, u.email as leader, g.capacity, gp.address
         from groups g left join auth.users u on u.id = g.leader_id left join group_private gp on gp.group_id = g.id
        order by g.status, gp.address nulls last`
    )).rows;
    expect(g).toHaveLength(4);
    expect(g.find((x) => x.status === "en_curso")).toMatchObject({ weekday: 5, modality: "virtual", leader: "ana@x.cl", capacity: 15 });
    expect(g.find((x) => x.address)).toMatchObject({ status: "finalizado", weekday: 2, modality: "presencial", address: "Calle 1, Santiago" });
  });

  it("las inscripciones históricas pasan aunque las reglas de inscripción las habrían rechazado", async () => {
    // Luis (hombre) y Ana (mujer) en un grupo de hombres, y sin términos aceptados: solo posible con la carga histórica.
    expect(await count("enrollments")).toBe(6);
    const e = (await db.query<{ status: string; curriculum: string; season: string }>(
      `select e.status, c.name as curriculum, s.name as season
         from enrollments e join curriculums c on c.id = e.curriculum_id join seasons s on s.id = e.season_id order by e.enrolled_at, e.status`
    )).rows;
    expect(e.every((x) => x.curriculum.startsWith("HOMBRES"))).toBe(true);
    expect(e.map((x) => x.status).sort()).toEqual(["aprobado", "aprobado", "aprobado", "en_curso", "no_completo", "preinscrito"]);
  });

  it("el avance se calcula bien sobre lo importado", async () => {
    const rows = (await db.query<{ email: string; season: string; held: number; present: number; absences: number; status: string }>(
      `select u.email, s.name as season, p.meetings_held as held, p.present, p.absences, p.status
         from enrollment_progress p
         join enrollments e on e.id = p.enrollment_id
         join seasons s on s.id = e.season_id
         join auth.users u on u.id = p.person_id order by u.email, s.name`
    )).rows;
    const ana2026 = rows.find((r) => r.email === "ana@x.cl" && r.season === "2026")!;
    expect(ana2026).toMatchObject({ held: 2, present: 1, absences: 1, status: "en_curso" });
    const luis2025 = rows.find((r) => r.email === "luis@x.cl" && r.season === "2025 · T1")!;
    expect(luis2025).toMatchObject({ held: 3, present: 2, absences: 1, status: "aprobado" });
  });

  it("las reglas de inscripción siguen aplicando después de importar", async () => {
    // la salvedad de la carga histórica es solo de cada llamada
    const flag = (await db.query<{ v: string | null }>(`select current_setting('app.skip_checks', true) as v`)).rows[0].v;
    expect(flag === null || flag === "" || flag === "off").toBe(true);

    await db.exec(`
      insert into auth.users (email) values ('nuevo@x.cl');
      update profiles set gender = 'mujer' where id = (select id from auth.users where email = 'nuevo@x.cl');
    `);
    const bad = db.query(
      `insert into enrollments (person_id, group_id, status)
       select u.id, g.id, 'en_curso' from auth.users u, groups g where u.email = 'nuevo@x.cl' and g.status = 'en_curso'`
    );
    await expect(bad).rejects.toThrow(/no está disponible para tu perfil/);
  });

  it("repetir la importación no duplica nada", async () => {
    const snapshot = async () => ({
      perfiles: await count("profiles"), historial: await count("role_history"), grupos: await count("groups"),
      inscripciones: await count("enrollments"), reuniones: await count("meetings"), asistencia: await count("attendance"),
    });
    const before = await snapshot();
    created = [];
    await applyPlan(plan, {
      rpc,
      createAuthUser: async () => { throw new Error("no debería crear cuentas de nuevo"); },
    });
    expect(created).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });

  it("si el líder de un grupo no tiene rol suficiente, el grupo se importa sin líder", async () => {
    const copy: Plan = { ...plan, groups: plan.groups.map((g, i) => (i === 0 ? { ...g, leaderEmail: "luis@x.cl" } : g)) };
    await applyPlan(copy, { rpc, createAuthUser });
    const g = (await db.query<{ leader_id: string | null }>(`select leader_id from groups where id = $1`, [copy.groups[0].id])).rows[0];
    expect(g.leader_id).toBeNull();
  });
});
