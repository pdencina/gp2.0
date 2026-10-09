import type { Plan, PersonOut } from "./transform";
import { uuid5 } from "./ids";

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
export type AuthCreator = (p: { email: string; passwordHash: string | null; fullName: string }) => Promise<void>;

export type ApplyOptions = {
  db: Db;
  createAuthUser: AuthCreator;
  log?: (msg: string) => void;
  concurrency?: number;
};

const RANK: Record<string, number> = { alumno: 1, lider: 2, monitor: 3, coordinador: 4, admin: 5 };

/** Inserta filas en bloques, respetando el máximo de parámetros de Postgres. */
async function bulk(db: Db, table: string, cols: string[], rows: unknown[][], tail = "") {
  if (rows.length === 0) return;
  const per = Math.max(1, Math.floor(30000 / cols.length));
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const params: unknown[] = [];
    const values = chunk
      .map((row) => `(${row.map((v) => { params.push(v); return `$${params.length}`; }).join(", ")})`)
      .join(", ");
    await db.query(`insert into ${table} (${cols.join(", ")}) values ${values} ${tail}`, params);
  }
}
const setCols = (cols: string[], skip: string[]) =>
  cols.filter((c) => !skip.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ");

async function inTransaction<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    const r = await fn();
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

export type ApplyResult = Record<string, number>;

export async function applyPlan(plan: Plan, opts: ApplyOptions): Promise<ApplyResult> {
  const { db, createAuthUser } = opts;
  const log = opts.log ?? (() => {});
  const result: ApplyResult = {};

  // ---------- 1. Cuentas de acceso ----------
  const loadAuth = async () => {
    const r = await db.query("select id, lower(email) as email from auth.users");
    return new Map<string, string>(r.rows.map((x) => [x.email as string, x.id as string]));
  };
  let authIds = await loadAuth();
  const toCreate = plan.persons.filter((p) => !authIds.has(p.email));
  const createdEmails = new Set(toCreate.map((p) => p.email));
  log(`Cuentas: ${plan.persons.length - toCreate.length} ya existen, ${toCreate.length} por crear`);
  let done = 0;
  await pool(toCreate, opts.concurrency ?? 6, async (p: PersonOut) => {
    await createAuthUser({ email: p.email, passwordHash: p.passwordHash, fullName: p.fullName });
    if (++done % 500 === 0) log(`  ${done}/${toCreate.length} cuentas creadas`);
  });
  authIds = await loadAuth();
  result.cuentas_creadas = toCreate.length;

  const idOf = (email: string | null) => (email ? authIds.get(email) ?? null : null);
  const people = plan.persons.filter((p) => authIds.has(p.email));
  if (people.length !== plan.persons.length) log(`Aviso: ${plan.persons.length - people.length} personas sin cuenta creada`);

  // ---------- 2. Perfiles e historial de roles ----------
  await db.query("alter table profiles disable trigger trg_log_role_change");
  try {
    await inTransaction(db, async () => {
      const cols = ["id", "full_name", "role", "phone", "country", "birth_date", "gender", "city", "guardian_name",
        "guardian_email", "guardian_phone", "terms_accepted_at", "terms_version", "accepts_comms", "active", "created_at"];
      const rows = people.map((p) => [
        idOf(p.email), p.fullName, p.role, p.phone, p.country, p.birthDate, p.gender, p.city, p.guardianName,
        p.guardianEmail, p.guardianPhone, p.termsAcceptedAt, p.termsVersion, p.acceptsComms, p.active, p.createdAt,
      ]);
      // Nunca se baja el rol de una cuenta que ya existe.
      const updates = setCols(cols, ["id", "role", "created_at"]) +
        ", role = case when role_rank(excluded.role::app_role) > role_rank(profiles.role) then excluded.role::app_role else profiles.role end";
      await bulk(db, "profiles", cols, rows, `on conflict (id) do update set ${updates}`);

      // Historial: solo para cuentas creadas ahora; las que ya existían conservan el suyo.
      const ids = people.filter((p) => createdEmails.has(p.email)).map((p) => idOf(p.email));
      for (let i = 0; i < ids.length; i += 1000) {
        const part = ids.slice(i, i + 1000);
        await db.query(`delete from role_history where person_id = any($1::uuid[])`, [part]);
      }
      const hist = plan.roleHistory
        .filter((h) => createdEmails.has(h.email) && authIds.has(h.email))
        .map((h, i) => [uuid5(`role_history:${h.email}:${i}:${h.toRole}`), idOf(h.email), h.fromRole, h.toRole, h.at]);
      await bulk(db, "role_history", ["id", "person_id", "from_role", "to_role", "created_at"], hist, "on conflict (id) do nothing");
    });
  } finally {
    await db.query("alter table profiles enable trigger trg_log_role_change");
  }
  result.perfiles = people.length;
  log(`Perfiles: ${people.length}`);

  const roleOf = new Map(people.map((p) => [p.email, p.role]));

  await inTransaction(db, async () => {
    // ---------- 3. Currículums, temporadas y ciclos ----------
    const existingCur = new Map((await db.query("select id, name from curriculums")).rows.map((r) => [r.name as string, r.id as string]));
    const curRows = plan.curriculums.map((c) => {
      const clash = existingCur.get(c.name);
      const name = clash && clash !== c.id ? `${c.name} (importado)` : c.name;
      return [c.id, name, c.description, c.audience, c.ageMin, c.ageMax, c.book, c.active];
    });
    const curCols = ["id", "name", "description", "audience", "age_min", "age_max", "book", "active"];
    await bulk(db, "curriculums", curCols, curRows, `on conflict (id) do update set ${setCols(curCols, ["id"])}`);

    const coordRows = plan.coordinators
      .filter((c) => idOf(c.email) && RANK[roleOf.get(c.email) ?? "alumno"] >= 4)
      .map((c) => [c.curriculumId, idOf(c.email)]);
    await bulk(db, "curriculum_coordinators", ["curriculum_id", "coordinator_id"], coordRows, "on conflict do nothing");

    const existingSeasons = new Map((await db.query("select id, name from seasons")).rows.map((r) => [r.name as string, r.id as string]));
    const seasonCols = ["id", "name", "start_date", "end_date", "status"];
    await bulk(db, "seasons", seasonCols, plan.seasons.map((x) => {
      const clash = existingSeasons.get(x.name);
      return [x.id, clash && clash !== x.id ? `${x.name} (importada)` : x.name, x.startDate, x.endDate, x.status];
    }), `on conflict (id) do update set ${setCols(seasonCols, ["id"])}`);

    const cycleCols = ["id", "curriculum_id", "number", "title", "classes"];
    await bulk(db, "cycles", cycleCols, plan.cycles.map((c) => [c.id, c.curriculumId, c.number, c.title, c.classes]),
      `on conflict (id) do update set ${setCols(cycleCols, ["id"])}`);
    for (const c of plan.cycles.filter((x) => x.prerequisiteId)) {
      await db.query("update cycles set prerequisite_cycle_id = $1 where id = $2", [c.prerequisiteId, c.id]);
    }
    result.curriculums = plan.curriculums.length;
    result.temporadas = plan.seasons.length;
    result.ciclos = plan.cycles.length;

    // ---------- 4. Grupos ----------
    const groupCols = ["id", "season_id", "cycle_id", "name", "leader_id", "monitor_id", "weekday", "start_time", "end_time",
      "modality", "address", "capacity", "status", "created_at"];
    const groupRows = plan.groups.map((g) => {
      const leader = g.leaderEmail && RANK[roleOf.get(g.leaderEmail) ?? "alumno"] >= 2 ? idOf(g.leaderEmail) : null;
      const monitor = g.monitorEmail && RANK[roleOf.get(g.monitorEmail) ?? "alumno"] >= 3 ? idOf(g.monitorEmail) : null;
      return [g.id, g.seasonId, g.cycleId, g.name, leader, monitor, g.weekday, g.startTime, g.endTime,
        g.modality, g.address, g.capacity, g.status, g.createdAt];
    });
    await bulk(db, "groups", groupCols, groupRows, `on conflict (id) do update set ${setCols(groupCols, ["id", "created_at"])}`);
    result.grupos = plan.groups.length;
    log(`Currículums ${plan.curriculums.length} · temporadas ${plan.seasons.length} · ciclos ${plan.cycles.length} · grupos ${plan.groups.length}`);

    // ---------- 5. Inscripciones (histórico: se saltan las validaciones de inscripción) ----------
    await db.query("select set_config('app.skip_checks', 'on', true)");
    const enrollable = plan.enrollments.filter((e) => idOf(e.email));
    const enrollCols = ["id", "person_id", "group_id", "status", "enrolled_at", "closed_at"];
    await bulk(db, "enrollments", enrollCols,
      enrollable.map((e) => [e.id, idOf(e.email), e.groupId, e.status, e.enrolledAt, e.closedAt]),
      "on conflict (id) do update set status = excluded.status, closed_at = excluded.closed_at");
    result.inscripciones = enrollable.length;
    log(`Inscripciones: ${enrollable.length}`);

    // ---------- 6. Reuniones y asistencia ----------
    const meetCols = ["id", "group_id", "held_on", "lesson_number"];
    await bulk(db, "meetings", meetCols, plan.meetings.map((m) => [m.id, m.groupId, m.heldOn, m.lessonNumber]),
      `on conflict (id) do update set ${setCols(meetCols, ["id"])}`);
    const enrollIds = new Set(enrollable.map((e) => e.id));
    const att = plan.attendance.filter((a) => enrollIds.has(a.enrollmentId));
    await bulk(db, "attendance", ["meeting_id", "enrollment_id", "status"], att.map((a) => [a.meetingId, a.enrollmentId, a.status]),
      "on conflict (meeting_id, enrollment_id) do update set status = excluded.status");
    result.reuniones = plan.meetings.length;
    result.asistencia = att.length;
    log(`Reuniones: ${plan.meetings.length} · registros de asistencia: ${att.length}`);

    // ---------- 7. Recursos ----------
    const resCols = ["id", "cycle_id", "name", "kind", "read_url", "edit_url", "active"];
    await bulk(db, "resources", resCols, plan.resources.map((r) => [r.id, r.cycleId, r.name, r.kind, r.readUrl, r.editUrl, r.active]),
      `on conflict (id) do update set ${setCols(resCols, ["id"])}`);
    result.recursos = plan.resources.length;
  });

  return result;
}
