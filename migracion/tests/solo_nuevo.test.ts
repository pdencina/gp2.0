import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { applyPlan, type AuthCreator, type Rpc } from "../lib/apply";
import { parseDump } from "../lib/mysqldump";
import { transform, type PersonOut, type Plan } from "../lib/transform";
import { uuid5 } from "../lib/ids";
import { OLD_DB, toDump } from "./fixture";

// Importación "solo lo nuevo": trae lo registrado en la plataforma anterior sin pisar lo hecho en GP 2.0.

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
const MIGRATIONS = [
  "001_schema.sql", "002_importacion.sql", "004_rendimiento.sql", "005_panel.sql", "006_gp2_nucleo.sql", "007_catalogo.sql",
  "008_calendario.sql", "009_biblioteca.sql", "010_certificados.sql", "011_habilitacion.sql", "012_importar_solo_nuevo.sql",
];

let db: PGlite;
let plan: Plan;
let plan2: Plan;
let created: string[] = [];

const rpc: Rpc = async (fn, args) => {
  const [key, value] = Object.entries(args)[0];
  const cast = key === "rows" ? "jsonb" : key === "ids" ? "uuid[]" : "text[]";
  const param = key === "rows" ? JSON.stringify(value) : value;
  const r = await db.query<Record<string, unknown>>(`select * from ${fn}($1::${cast})`, [param]);
  return fn === "import_auth_map" ? r.rows : r.rows[0][fn];
};
const createAuthUser: AuthCreator = async ({ email, passwordHash, fullName }) => {
  created.push(email);
  await db.query(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3)`, [
    email, passwordHash, JSON.stringify({ full_name: fullName }),
  ]);
};
const one = async <T>(q: string, params: unknown[] = []) => (await db.query<T>(q, params)).rows[0];
const count = async (table: string) => (await one<{ n: number }>(`select count(*)::int n from ${table}`)).n;

const NEW_PERSON: PersonOut = {
  email: "nueva@x.cl", fullName: "Nueva Persona", role: "alumno", active: true, passwordHash: null, phone: "+56911112222",
  country: "CL", birthDate: "1995-05-05", gender: "hombre", city: null, guardianName: null, guardianEmail: null,
  guardianPhone: null, termsAcceptedAt: null, termsVersion: null, acceptsComms: true, createdAt: "2026-09-01T00:00:00Z",
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  for (const f of MIGRATIONS) await db.exec(sql(f));
  plan = transform(parseDump(toDump(OLD_DB)), new Date("2026-10-09T00:00:00Z"));
  await applyPlan(plan, { rpc, createAuthUser }); // importación inicial, completa
  created = [];

  // Pasa el tiempo: se usa GP 2.0 en una sede
  const active = plan.enrollments.find((e) => e.status === "en_curso")!;
  const pending = plan.enrollments.find((e) => e.status === "preinscrito")!;
  const runningGroup = plan.groups.find((g) => g.status === "en_curso")!;
  await db.exec(`
    update groups set leader_id = null where id = '${runningGroup.id}';
    update group_private set address = 'Dirección corregida en GP 2.0';
    update profiles set phone = '+56900000000' where id = (select id from auth.users where email = 'luis@x.cl');
    update enrollments set status = 'cancelado' where id = '${active.id}';
    delete from curriculum_coordinators;
  `);

  // Mientras tanto, en la plataforma anterior: una persona y un curso nuevos, reuniones, un cierre y datos que ya existían
  const newEnrollment = { id: uuid5("nuevo:inscripcion"), email: NEW_PERSON.email, groupId: runningGroup.id, status: "en_curso", enrolledAt: "2026-09-01T00:00:00Z", closedAt: null };
  const newMeeting = { id: uuid5("nuevo:reunion"), groupId: runningGroup.id, heldOn: "2026-09-02", lessonNumber: 9 };
  const flipped = plan.attendance[0];
  const newCurriculum = { id: uuid5("nuevo:curriculum"), name: "PROGRAMA NUEVO", description: null, audience: "todos", ageMin: null, ageMax: null, book: null, active: true };
  plan2 = {
    ...plan,
    persons: [...plan.persons, NEW_PERSON],
    roleHistory: [...plan.roleHistory, { email: NEW_PERSON.email, fromRole: null, toRole: "alumno", at: NEW_PERSON.createdAt }],
    curriculums: [...plan.curriculums, newCurriculum],
    coordinators: [...plan.coordinators, { curriculumId: newCurriculum.id, email: "coord@x.cl" }],
    groups: plan.groups.map((g) => (g.id === runningGroup.id ? { ...g, status: "finalizado", leaderEmail: "ana@x.cl" } : g)),
    enrollments: [
      ...plan.enrollments.map((e) => (e.id === pending.id ? { ...e, status: "aprobado", closedAt: "2026-06-01T00:00:00Z" } : e)),
      newEnrollment,
    ],
    meetings: [...plan.meetings, newMeeting],
    attendance: [
      ...plan.attendance.map((a) => (a === flipped ? { ...a, status: a.status === "presente" ? ("ausente" as const) : ("presente" as const) } : a)),
      { meetingId: newMeeting.id, enrollmentId: newEnrollment.id, status: "presente" },
      { meetingId: newMeeting.id, enrollmentId: active.id, status: "presente" },
    ],
  };
});

describe("importación solo lo nuevo", () => {
  let result: Record<string, number>;
  const pendingId = () => plan.enrollments.find((e) => e.status === "preinscrito")!.id;
  const activeId = () => plan.enrollments.find((e) => e.status === "en_curso")!.id;
  const runningGroupId = () => plan.groups.find((g) => g.status === "en_curso")!.id;

  it("trae lo que faltaba", async () => {
    result = await applyPlan(plan2, { rpc, createAuthUser, onlyNew: true });
    expect(created).toEqual(["nueva@x.cl"]);
    expect(result).toMatchObject({ cuentas_creadas: 1, perfiles: 1, curriculums: 1, reuniones: 1, asistencia: 2 });
    expect(result.inscripciones).toBe(2); // una nueva y una que aquí seguía abierta y allá se cerró
    expect(result.grupos).toBe(1); // el que allá finalizó

    const p = await one<{ phone: string; full_name: string }>(`select p.phone, p.full_name from profiles p join auth.users u on u.id = p.id where u.email = 'nueva@x.cl'`);
    expect(p).toEqual({ phone: "+56911112222", full_name: "Nueva Persona" });
    expect(await count("curriculums")).toBe(3); // los 2 importados y el nuevo
    const e = await one<{ curriculum_enrollment_id: string | null }>(`select curriculum_enrollment_id from enrollments where id = $1`, [uuid5("nuevo:inscripcion")]);
    expect(e.curriculum_enrollment_id).toBeTruthy();
    expect((await db.query(`select 1 from meetings where id = $1`, [uuid5("nuevo:reunion")])).rows).toHaveLength(1);
    expect((await db.query(`select h.to_role from role_history h join auth.users u on u.id = h.person_id where u.email = 'nueva@x.cl'`)).rows).toHaveLength(1);
  });

  it("no pisa nada de lo hecho en GP 2.0", async () => {
    const g = await one<{ leader_id: string | null }>(`select leader_id from groups where id = $1`, [runningGroupId()]);
    expect(g.leader_id).toBeNull(); // la plataforma anterior decía que lo lideraba Ana
    expect((await one<{ address: string }>(`select address from group_private where address like 'Dirección%'`)).address).toBe("Dirección corregida en GP 2.0");
    expect((await one<{ phone: string }>(`select p.phone from profiles p join auth.users u on u.id = p.id where u.email = 'luis@x.cl'`)).phone).toBe("+56900000000");
    expect((await one<{ status: string }>(`select status from enrollments where id = $1`, [activeId()])).status).toBe("cancelado");
    // el coordinador que se había quitado no vuelve; el programa nuevo sí nace con el suyo
    const coords = (await db.query<{ name: string }>(`select c.name from curriculum_coordinators cc join curriculums c on c.id = cc.curriculum_id`)).rows;
    expect(coords).toEqual([{ name: "PROGRAMA NUEVO" }]);
  });

  it("cierra lo que allá terminó y aquí seguía abierto, y deja el crédito por revisar", async () => {
    const e = await one<{ status: string; closed_at: string | null }>(`select status, closed_at from enrollments where id = $1`, [pendingId()]);
    expect(e.status).toBe("aprobado");
    expect(e.closed_at).toBeTruthy();
    const c = await one<{ n: number }>(`select count(*)::int n from stage_credits where enrollment_id = $1 and review_status = 'por_revisar'`, [pendingId()]);
    expect(c.n).toBe(1);
    expect((await one<{ status: string }>(`select status from groups where id = $1`, [runningGroupId()])).status).toBe("finalizado");
  });

  it("una marca de asistencia que ya existía no se modifica", async () => {
    const a = plan.attendance[0];
    const row = await one<{ status: string }>(`select status from attendance where meeting_id = $1 and enrollment_id = $2`, [a.meetingId, a.enrollmentId]);
    expect(row.status).toBe(a.status);
  });

  it("las marcas nuevas de personas que ya estaban sí se agregan", async () => {
    const row = await one<{ status: string }>(`select status from attendance where meeting_id = $1 and enrollment_id = $2`, [uuid5("nuevo:reunion"), activeId()]);
    expect(row.status).toBe("presente");
  });

  it("repetirla no cambia nada más", async () => {
    created = [];
    const before = { p: await count("profiles"), e: await count("enrollments"), m: await count("meetings"), a: await count("attendance"), c: await count("stage_credits") };
    const again = await applyPlan(plan2, { rpc, createAuthUser: async () => { throw new Error("no debería crear cuentas"); }, onlyNew: true });
    expect(again).toMatchObject({ cuentas_creadas: 0, curriculums: 0, inscripciones: 0, reuniones: 0, asistencia: 0, grupos: 0 });
    expect({ p: await count("profiles"), e: await count("enrollments"), m: await count("meetings"), a: await count("attendance"), c: await count("stage_credits") }).toEqual(before);
  });

  it("los usuarios de la aplicación no pueden usar estas funciones", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query(`select import_new_groups('[]'::jsonb)`)).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec("reset role");
      }
    }
  });

  it("avisa con claridad si falta instalarlas", async () => {
    const failing: Rpc = async () => {
      throw new Error("404 Could not find the function public.import_new_meetings");
    };
    await expect(applyPlan(plan2, { rpc: failing, createAuthUser, onlyNew: true })).rejects.toThrow(/012_importar_solo_nuevo\.sql/);
  });

  it("la importación completa, en cambio, sí pisa lo hecho: por eso no se usa después de empezar", async () => {
    await applyPlan(plan, { rpc, createAuthUser });
    expect((await one<{ phone: string }>(`select p.phone from profiles p join auth.users u on u.id = p.id where u.email = 'luis@x.cl'`)).phone).not.toBe("+56900000000");
    expect((await one<{ status: string }>(`select status from enrollments where id = $1`, [activeId()])).status).toBe("en_curso");
  });
});
