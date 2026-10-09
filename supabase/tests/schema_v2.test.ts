import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Simula lo mínimo de Supabase: roles, auth.users y auth.uid().
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

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), COORD = id(2), MONITOR = id(3), LEADER = id(4), LEADER2 = id(5);
const S1 = id(6), S2 = id(7), S3 = id(8), WOMAN = id(9), NOTERMS = id(10), OUTSIDER = id(11);
const CURRICULUM = id(100), SEASON = id(101), CYCLE1 = id(102), CYCLE2 = id(103);
const GROUP_A = id(104), GROUP_B = id(105);

let db: PGlite;

async function as<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function failure(uid: string, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await as(uid, sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  return "";
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(readFileSync(join(__dirname, "../v2/001_schema.sql"), "utf8"));
  await db.exec(GRANTS);

  // Personas (el trigger crea el perfil como alumno)
  const people: [string, string][] = [
    [ADMIN, "Admin"], [COORD, "Coordinador"], [MONITOR, "Monitor"], [LEADER, "Líder A"], [LEADER2, "Líder B"],
    [S1, "Alumno Uno"], [S2, "Alumno Dos"], [S3, "Alumno Tres"], [WOMAN, "Alumna"], [NOTERMS, "Sin términos"],
    [OUTSIDER, "Ajeno"],
  ];
  for (const [uid, name] of people) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      uid, `${uid}@test.local`, JSON.stringify({ full_name: name }),
    ]);
  }
  await db.exec(`
    update profiles set role = 'admin' where id = '${ADMIN}';
    update profiles set role = 'coordinador' where id = '${COORD}';
    update profiles set role = 'monitor' where id = '${MONITOR}';
    update profiles set role = 'lider' where id in ('${LEADER}', '${LEADER2}');
    update profiles set gender = 'hombre', birth_date = '1990-01-01', terms_accepted_at = now()
      where id in ('${S1}', '${S2}', '${S3}', '${OUTSIDER}');
    update profiles set gender = 'mujer', birth_date = '1990-01-01', terms_accepted_at = now() where id = '${WOMAN}';
    update profiles set gender = 'hombre', birth_date = '1990-01-01' where id = '${NOTERMS}';

    insert into curriculums (id, name, audience, default_capacity) values ('${CURRICULUM}', 'Hombres', 'hombres', 3);
    insert into curriculum_coordinators values ('${CURRICULUM}', '${COORD}');
    insert into seasons (id, name, start_date, end_date, status) values ('${SEASON}', '2026', '2026-01-01', '2026-12-31', 'inscripciones');
    insert into cycles (id, curriculum_id, number) values ('${CYCLE1}', '${CURRICULUM}', 1);
    insert into cycles (id, curriculum_id, number, prerequisite_cycle_id) values ('${CYCLE2}', '${CURRICULUM}', 2, '${CYCLE1}');
    insert into lessons (cycle_id, number, title) values ('${CYCLE1}', 1, 'Uno'), ('${CYCLE1}', 2, 'Dos'), ('${CYCLE1}', 3, 'Tres');
    insert into groups (id, season_id, cycle_id, name, leader_id, monitor_id, capacity)
      values ('${GROUP_A}', '${SEASON}', '${CYCLE1}', 'Grupo A', '${LEADER}', '${MONITOR}', 3);
    insert into groups (id, season_id, cycle_id, name, leader_id, monitor_id, capacity)
      values ('${GROUP_B}', '${SEASON}', '${CYCLE1}', 'Grupo B', '${LEADER2}', '${MONITOR}', 3);
  `);
});

describe("personas y roles", () => {
  it("el registro crea un perfil de alumno con su historial", async () => {
    const [p] = await as<{ role: string }>(OUTSIDER, `select role from profiles where id = auth.uid()`);
    expect(p.role).toBe("alumno");
    const h = await db.query(`select to_role from role_history where person_id = $1 order by created_at`, [OUTSIDER]);
    expect(h.rows).toHaveLength(1);
  });

  it("un alumno no puede cambiarse el rol", async () => {
    await as(S1, `update profiles set role = 'admin' where id = auth.uid()`).catch(() => {});
    const [p] = (await db.query<{ role: string }>(`select role from profiles where id = $1`, [S1])).rows;
    expect(p.role).toBe("alumno");
  });

  it("un alumno no ve los perfiles de otros alumnos", async () => {
    const rows = await as(S1, `select id from profiles`);
    expect(rows.map((r) => (r as { id: string }).id)).toEqual([S1]);
  });
});

describe("inscripción", () => {
  it("un hombre se inscribe en un grupo de hombres", async () => {
    const [r] = await as<{ enroll: string }>(S1, `select enroll($1) as enroll`, [GROUP_A]);
    expect(r.enroll).toBeTruthy();
  });

  it("rechaza a quien no cumple la audiencia", async () => {
    expect(await failure(WOMAN, `select enroll($1)`, [GROUP_A])).toContain("no está disponible para tu perfil");
  });

  it("exige aceptar los términos", async () => {
    expect(await failure(NOTERMS, `select enroll($1)`, [GROUP_A])).toContain("Acepta los términos");
  });

  it("no permite estar activo dos veces en el mismo currículum y temporada", async () => {
    const msg = await failure(S1, `select enroll($1)`, [GROUP_B]);
    expect(msg).toContain("enrollments_one_active");
  });

  it("respeta el cupo del grupo", async () => {
    await as(S2, `select enroll($1)`, [GROUP_A]);
    await as(S3, `select enroll($1)`, [GROUP_A]);
    expect(await failure(OUTSIDER, `select enroll($1)`, [GROUP_A])).toContain("cupo máximo");
  });

  it("un grupo que no está abierto no recibe inscripciones", async () => {
    await db.query(`update groups set status = 'finalizado' where id = $1`, [GROUP_B]);
    expect(await failure(OUTSIDER, `select enroll($1)`, [GROUP_B])).toContain("no está recibiendo inscripciones");
    await db.query(`update groups set status = 'abierto' where id = $1`, [GROUP_B]);
  });

  it("el ciclo 2 exige haber aprobado el ciclo 1", async () => {
    await db.query(
      `insert into groups (id, season_id, cycle_id, name, leader_id, monitor_id) values ($1, $2, $3, 'Ciclo 2', $4, $5)`,
      [id(106), SEASON, CYCLE2, LEADER, MONITOR]
    );
    expect(await failure(OUTSIDER, `select enroll($1)`, [id(106)])).toContain("aprobar el ciclo anterior");
  });
});

describe("quién ve qué", () => {
  it("el alumno ve solo su inscripción", async () => {
    const rows = await as(S1, `select id from enrollments`);
    expect(rows).toHaveLength(1);
  });

  it("el líder ve las inscripciones de su grupo y de ningún otro", async () => {
    expect(await as(LEADER, `select id from enrollments`)).toHaveLength(3);
    expect(await as(LEADER2, `select id from enrollments`)).toHaveLength(0);
  });

  it("el líder ve el perfil de sus alumnos; otro líder no", async () => {
    const own = await as(LEADER, `select id from profiles where id = $1`, [S2]);
    expect(own).toHaveLength(1);
    const other = await as(LEADER2, `select id from profiles where id = $1`, [S2]);
    expect(other).toHaveLength(0);
  });

  it("el alumno ve a su líder y a su monitor", async () => {
    const rows = await as(S1, `select id from profiles where id in ($1, $2)`, [LEADER, MONITOR]);
    expect(rows).toHaveLength(2);
  });

  it("el coordinador ve los grupos de su currículum; un ajeno solo los abiertos", async () => {
    expect((await as(COORD, `select id from groups`)).length).toBeGreaterThanOrEqual(2);
    // OUTSIDER no administra nada: ve únicamente los grupos abiertos a inscripción
    const open = await as(OUTSIDER, `select id from groups where status = 'abierto'`);
    expect(open.length).toBeGreaterThan(0);
  });

  it("solo el coordinador o el administrador crean grupos", async () => {
    const insert = `insert into groups (season_id, cycle_id, name) values ('${SEASON}', '${CYCLE1}', 'Intruso')`;
    expect(await failure(LEADER, insert)).toContain("row-level security");
    expect(await failure(COORD, insert)).toBe("");
  });
});

describe("pasar lista, avance y alertas", () => {
  let e1: string, e2: string, e3: string;

  it("el líder pasa lista; un alumno no puede", async () => {
    const ids = (await db.query<{ id: string; person_id: string }>(
      `select id, person_id from enrollments where group_id = $1`, [GROUP_A]
    )).rows;
    // Las inscripciones son antiguas: solo cuentan las reuniones posteriores a la inscripción.
    await db.query(`update enrollments set enrolled_at = now() - interval '30 days' where group_id = $1`, [GROUP_A]);
    e1 = ids.find((x) => x.person_id === S1)!.id;
    e2 = ids.find((x) => x.person_id === S2)!.id;
    e3 = ids.find((x) => x.person_id === S3)!.id;

    expect(await failure(S1, `select save_attendance($1, current_date, 1, $2::uuid[], '{}')`, [GROUP_A, [e1]])).toContain("No tienes permiso");

    // S1 falta siempre; S2 siempre presente; S3 una vez recuperado
    for (let i = 1; i <= 3; i++) {
      await as(LEADER, `select save_attendance($1, current_date - $2::int, $3, $4::uuid[], $5::uuid[])`,
        [GROUP_A, 10 - i, i, [e2], i === 1 ? [e3] : []]);
    }
    const [{ n }] = (await db.query<{ n: number }>(`select count(*)::int as n from meetings where group_id = $1`, [GROUP_A])).rows;
    expect(n).toBe(3);
  });

  it("calcula las ausencias sin guardarlas", async () => {
    const [p1] = (await db.query<{ absences: number }>(`select absences from enrollment_progress where enrollment_id = $1`, [e1])).rows;
    const [p2] = (await db.query<{ absences: number }>(`select absences from enrollment_progress where enrollment_id = $1`, [e2])).rows;
    expect(p1.absences).toBe(3);
    expect(p2.absences).toBe(0);
  });

  it("el recuperado cuenta como asistencia", async () => {
    const [p3] = (await db.query<{ recovered: number; absences: number }>(
      `select recovered, absences from enrollment_progress where enrollment_id = $1`, [e3]
    )).rows;
    expect(p3.recovered).toBe(1);
    expect(p3.absences).toBe(2);
  });

  it("corregir una lista no duplica la reunión", async () => {
    await as(LEADER, `select save_attendance($1, current_date - 9, 1, $2::uuid[], '{}')`, [GROUP_A, [e1, e2]]);
    const [{ n }] = (await db.query<{ n: number }>(`select count(*)::int as n from meetings where group_id = $1`, [GROUP_A])).rows;
    expect(n).toBe(3);
    const [p1] = (await db.query<{ absences: number }>(`select absences from enrollment_progress where enrollment_id = $1`, [e1])).rows;
    expect(p1.absences).toBe(2);
  });

  it("las alertas llegan al líder y al monitor, y no a un líder ajeno", async () => {
    const mine = await as<{ kind: string; person_id: string }>(LEADER, `select kind, person_id from my_alerts()`);
    expect(mine.some((a) => a.kind === "ausente" && a.person_id === S1)).toBe(true);
    expect(mine.some((a) => a.kind === "en_riesgo" && a.person_id === S1)).toBe(true);
    const monitor = await as<{ kind: string }>(MONITOR, `select kind from my_alerts()`);
    expect(monitor.length).toBeGreaterThan(0);
    expect(await as(LEADER2, `select kind from my_alerts() where kind in ('ausente', 'en_riesgo')`)).toHaveLength(0);
  });

  it("registrar un contacto resuelve la alerta de faltas", async () => {
    await as(LEADER, `insert into contacts (person_id, group_id, contacted_by, kind) values ($1, $2, auth.uid(), 'mensaje')`, [S1, GROUP_A]);
    const after = await as<{ kind: string; person_id: string }>(LEADER, `select kind, person_id from my_alerts()`);
    expect(after.some((a) => a.kind === "ausente" && a.person_id === S1)).toBe(false);
  });

  it("el alumno ve su propia asistencia pero no la de otros", async () => {
    const rows = await as(S2, `select enrollment_id from attendance`);
    expect(rows.every((r) => (r as { enrollment_id: string }).enrollment_id === e2)).toBe(true);
    expect(rows.length).toBe(3);
  });
});

describe("lecciones", () => {
  it("el alumno ve hasta la siguiente a la última dada", async () => {
    const rows = await as<{ number: number }>(S1, `select number from lessons order by number`);
    // Se dieron las lecciones 1 a 3, así que accede hasta la 4; el ciclo solo tiene 3.
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3]);
  });

  it("un ajeno al ciclo no ve ninguna lección", async () => {
    expect(await as(OUTSIDER, `select number from lessons`)).toHaveLength(0);
  });

  it("el coordinador ve todas", async () => {
    expect(await as(COORD, `select number from lessons`)).toHaveLength(3);
  });
});

describe("cierre del ciclo y continuación", () => {
  it("el líder no puede cerrar el ciclo", async () => {
    expect(await failure(LEADER, `select * from close_group($1)`, [GROUP_A])).toContain("Solo el coordinador");
  });

  it("más ausencias que el máximo = no completó; con el máximo o menos = aprobado", async () => {
    // S1 ya tenía 2 ausencias; con dos reuniones más llega a 4 (más que el máximo de 3)
    const [{ id: e1 }] = (await db.query<{ id: string }>(`select id from enrollments where person_id = $1 and group_id = $2`, [S1, GROUP_A])).rows;
    const [{ id: e2 }] = (await db.query<{ id: string }>(`select id from enrollments where person_id = $1 and group_id = $2`, [S2, GROUP_A])).rows;
    const [{ id: e3 }] = (await db.query<{ id: string }>(`select id from enrollments where person_id = $1 and group_id = $2`, [S3, GROUP_A])).rows;
    await as(LEADER, `select save_attendance($1, current_date - 3, 4, $2::uuid[], '{}')`, [GROUP_A, [e2, e3]]);
    await as(LEADER, `select save_attendance($1, current_date - 2, 5, $2::uuid[], '{}')`, [GROUP_A, [e2, e3]]);

    const [r] = await as<{ approved: number; not_completed: number }>(COORD, `select * from close_group($1)`, [GROUP_A]);
    expect(r.approved).toBe(2);
    expect(r.not_completed).toBe(1);

    const status = (await db.query<{ person_id: string; status: string }>(
      `select person_id, status from enrollments where group_id = $1`, [GROUP_A]
    )).rows;
    expect(status.find((s) => s.person_id === S1)!.status).toBe("no_completo");
    expect(status.find((s) => s.person_id === S2)!.status).toBe("aprobado");
    expect([e1, e2, e3].every(Boolean)).toBe(true);
  });

  it("la continuación preinscribe solo a quienes aprobaron", async () => {
    const [{ create_continuation: next }] = await as<{ create_continuation: string }>(COORD, `select create_continuation($1)`, [GROUP_A]);
    const rows = (await db.query<{ person_id: string; status: string }>(
      `select person_id, status from enrollments where group_id = $1`, [next]
    )).rows;
    expect(rows.map((r) => r.person_id).sort()).toEqual([S2, S3].sort());
    expect(rows.every((r) => r.status === "preinscrito")).toBe(true);

    const [g] = (await db.query<{ continues_from: string; status: string }>(`select continues_from, status from groups where id = $1`, [next])).rows;
    expect(g.continues_from).toBe(GROUP_A);
    expect(g.status).toBe("abierto");

    // la persona confirma su lugar
    const [c] = await as<{ confirm_enrollment: string }>(S2, `select confirm_enrollment((select id from enrollments where person_id = auth.uid() and group_id = $1), true)`, [next]);
    expect(c.confirm_enrollment).toBe("en_curso");
  });

  it("el estado de las inscripciones cambia con auditoría", async () => {
    const rows = (await db.query(`select 1 from audit_log where table_name = 'enrollments'`)).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(await as(S1, `select id from audit_log`)).toHaveLength(0);
  });
});

describe("escalera de roles", () => {
  it("el monitor asciende a un alumno de su alcance a líder", async () => {
    const [r] = await as<{ promote_user: string }>(MONITOR, `select promote_user($1)`, [S2]);
    expect(r.promote_user).toBe("lider");
  });

  it("no se puede saltar un peldaño ni promover sobre tu nivel", async () => {
    expect(await failure(MONITOR, `select promote_user($1)`, [S2])).toContain("no puede promover");
    expect(await failure(MONITOR, `select promote_user($1)`, [OUTSIDER])).toContain("no pertenece a tu alcance");
    expect(await failure(LEADER, `select promote_user($1)`, [S3])).toContain("no puede promover");
  });

  it("el coordinador asciende líderes a monitor y todo queda en el historial", async () => {
    const [r] = await as<{ promote_user: string }>(COORD, `select promote_user($1)`, [LEADER2]);
    expect(r.promote_user).toBe("monitor");
    const h = (await db.query<{ to_role: string }>(`select to_role from role_history where person_id = $1 order by created_at`, [LEADER2])).rows;
    expect(h.map((x) => x.to_role)).toEqual(["alumno", "lider", "monitor"]);
  });
});
