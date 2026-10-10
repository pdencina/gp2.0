import type { Plan, PersonOut } from "./transform";
import { uuid5 } from "./ids";
import { AccountRejected } from "./errors";

/** Llama a una función de importación de la base (ver supabase/v2/002_importacion.sql). */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;
export type AuthCreator = (p: { email: string; passwordHash: string | null; fullName: string }) => Promise<void>;

export type ApplyOptions = {
  rpc: Rpc;
  createAuthUser: AuthCreator;
  log?: (msg: string) => void;
  concurrency?: number;
  /** Se llama por cada cuenta que Supabase rechazó; la importación sigue con las demás. */
  onRejected?: (email: string, reason: string) => void;
  /**
   * "Solo lo nuevo": agrega lo que falta y no modifica nada de lo ya cargado (salvo cerrar lo que allá terminó y aquí
   * seguía abierto). Es el modo para traer lo registrado en la plataforma anterior cuando GP 2.0 ya está en uso.
   */
  onlyNew?: boolean;
};

export type ApplyResult = Record<string, number>;

async function inChunks<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

const NEW_FUNCTIONS = new Set([
  "import_curriculums", "import_seasons", "import_cycles", "import_groups", "import_enrollments",
  "import_meetings", "import_attendance", "import_resources",
]);

const total = (r: unknown) => (typeof r === "number" ? r : Array.isArray(r) ? r.length : 0);

export async function applyPlan(plan: Plan, opts: ApplyOptions): Promise<ApplyResult> {
  const nuevo = opts.onlyNew === true;
  // En el modo "solo lo nuevo" cada función de importación se reemplaza por su versión que no pisa nada
  const rpc: Rpc = (fn, args) => opts.rpc(nuevo && NEW_FUNCTIONS.has(fn) ? fn.replace(/^import_/, "import_new_") : fn, args);
  const { createAuthUser } = opts;
  const log = opts.log ?? (() => {});
  const result: ApplyResult = {};

  // Antes de empezar: ¿están instaladas las funciones de importación?
  try {
    await rpc("import_auth_map", { emails: [] });
    if (nuevo) await rpc("import_meetings", { rows: [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/404|PGRST202|Could not find/i.test(msg)) {
      throw new Error(
        nuevo
          ? "Falta instalar las funciones de solo lo nuevo: ejecuta supabase/v2/012_importar_solo_nuevo.sql en el SQL Editor de Supabase."
          : "Falta instalar las funciones de importación: ejecuta supabase/v2/002_importacion.sql en el SQL Editor de Supabase."
      );
    }
    throw e;
  }
  if (nuevo) log("Modo solo lo nuevo: no se modifica nada de lo que ya existe.");

  // ---------- 1. Cuentas de acceso ----------
  const authIds = new Map<string, string>();
  const loadAuth = async (emails: string[]) => {
    await inChunks(emails, 500, async (chunk) => {
      const rows = (await rpc("import_auth_map", { emails: chunk })) as { email: string; id: string }[];
      for (const r of rows) authIds.set(r.email, r.id);
    });
  };
  await loadAuth(plan.persons.map((p) => p.email));
  const toCreate = plan.persons.filter((p) => !authIds.has(p.email));
  const createdEmails = new Set(toCreate.map((p) => p.email));
  log(`Cuentas: ${plan.persons.length - toCreate.length} ya existen, ${toCreate.length} por crear`);
  let done = 0;
  let rejected = 0;
  await pool(toCreate, opts.concurrency ?? 6, async (p: PersonOut) => {
    try {
      await createAuthUser({ email: p.email, passwordHash: p.passwordHash, fullName: p.fullName });
    } catch (e) {
      if (!(e instanceof AccountRejected)) throw e;
      rejected++;
      opts.onRejected?.(p.email, e.message);
    }
    if (++done % 500 === 0) log(`  ${done}/${toCreate.length} cuentas procesadas`);
  });
  if (rejected) log(`Aviso: Supabase rechazó ${rejected} cuentas; esas personas se omiten`);
  result.cuentas_rechazadas = rejected;
  await loadAuth(toCreate.map((p) => p.email));
  result.cuentas_creadas = toCreate.length - rejected;

  const idOf = (email: string | null) => (email ? authIds.get(email) ?? null : null);
  const people = plan.persons.filter((p) => authIds.has(p.email));
  if (people.length !== plan.persons.length) log(`Aviso: ${plan.persons.length - people.length} personas sin cuenta creada`);

  // ---------- 2. Perfiles e historial de roles ----------
  // En solo lo nuevo se completan únicamente los perfiles de las cuentas que se acaban de crear
  const profilePeople = nuevo ? people.filter((p) => createdEmails.has(p.email)) : people;
  await inChunks(profilePeople, 500, (chunk) =>
    rpc("import_profiles", {
      rows: chunk.map((p) => ({
        id: idOf(p.email), full_name: p.fullName, role: p.role, phone: p.phone, country: p.country,
        birth_date: p.birthDate, gender: p.gender, city: p.city, guardian_name: p.guardianName,
        guardian_email: p.guardianEmail, guardian_phone: p.guardianPhone, terms_accepted_at: p.termsAcceptedAt,
        terms_version: p.termsVersion, accepts_comms: p.acceptsComms, active: p.active, created_at: p.createdAt,
      })),
    })
  );
  result.perfiles = profilePeople.length;
  log(`Perfiles: ${profilePeople.length}`);

  // Historial: solo para cuentas creadas ahora; las que ya existían conservan el suyo.
  const newIds = people.filter((p) => createdEmails.has(p.email)).map((p) => idOf(p.email));
  await inChunks(newIds, 1000, (ids) => rpc("import_role_history_clear", { ids }));
  const history = plan.roleHistory
    .filter((h) => createdEmails.has(h.email) && authIds.has(h.email))
    .map((h, i) => ({
      id: uuid5(`role_history:${h.email}:${i}:${h.toRole}`), person_id: idOf(h.email),
      from_role: h.fromRole, to_role: h.toRole, created_at: h.at,
    }));
  await inChunks(history, 2000, (rows) => rpc("import_role_history", { rows }));

  // ---------- 3. Currículums, temporadas y ciclos ----------
  const createdCurricula = new Set<string>();
  await inChunks(plan.curriculums, 1000, async (chunk) => {
    const r = await rpc("import_curriculums", {
      rows: chunk.map((c) => ({
        id: c.id, name: c.name, description: c.description, audience: c.audience,
        age_min: c.ageMin, age_max: c.ageMax, book: c.book, active: c.active,
      })),
    });
    if (nuevo && Array.isArray(r)) for (const id of r as string[]) createdCurricula.add(id);
  });
  // Los coordinadores solo se asignan a los currículums recién creados (en los demás ya se decidió aquí)
  const coordinators = plan.coordinators.filter((c) => idOf(c.email) && (!nuevo || createdCurricula.has(c.curriculumId)));
  await inChunks(coordinators, 1000, (chunk) =>
    rpc("import_coordinators", { rows: chunk.map((c) => ({ curriculum_id: c.curriculumId, coordinator_id: idOf(c.email) })) })
  );
  await inChunks(plan.seasons, 1000, (chunk) =>
    rpc("import_seasons", {
      rows: chunk.map((s) => ({ id: s.id, name: s.name, start_date: s.startDate, end_date: s.endDate, status: s.status })),
    })
  );
  await inChunks(plan.cycles, 1000, (chunk) =>
    rpc("import_cycles", {
      rows: chunk.map((c) => ({
        id: c.id, curriculum_id: c.curriculumId, number: c.number, title: c.title, classes: c.classes,
        prerequisite_id: c.prerequisiteId,
      })),
    })
  );
  result.curriculums = nuevo ? createdCurricula.size : plan.curriculums.length;
  result.temporadas = plan.seasons.length;
  result.ciclos = plan.cycles.length;

  // ---------- 4. Grupos ----------
  let groupsWritten = 0;
  await inChunks(plan.groups, 1000, async (chunk) => {
    groupsWritten += total(await rpc("import_groups", {
      rows: chunk.map((g) => ({
        id: g.id, season_id: g.seasonId, cycle_id: g.cycleId, name: g.name,
        leader_id: idOf(g.leaderEmail), monitor_id: idOf(g.monitorEmail),
        weekday: g.weekday, start_time: g.startTime, end_time: g.endTime, modality: g.modality,
        address: g.address, capacity: g.capacity, status: g.status, created_at: g.createdAt,
      })),
    }));
  });
  result.grupos = nuevo ? groupsWritten : plan.groups.length;
  log(`Currículums ${plan.curriculums.length} · temporadas ${plan.seasons.length} · ciclos ${plan.cycles.length} · grupos ${plan.groups.length}`);

  // ---------- 5. Inscripciones (histórico: la función salta las reglas de inscripción) ----------
  const enrollable = plan.enrollments.filter((e) => idOf(e.email));
  let enrolled = 0;
  let enrollWritten = 0;
  await inChunks(enrollable, 2000, async (chunk) => {
    enrollWritten += total(await rpc("import_enrollments", {
      rows: chunk.map((e) => ({
        id: e.id, person_id: idOf(e.email), group_id: e.groupId, status: e.status,
        enrolled_at: e.enrolledAt, closed_at: e.closedAt,
      })),
    }));
    enrolled += chunk.length;
    if (enrolled % 10000 < 2000) log(`  inscripciones ${enrolled}/${enrollable.length}`);
  });
  result.inscripciones = nuevo ? enrollWritten : enrollable.length;
  log(`Inscripciones: ${result.inscripciones}`);

  // ---------- 6. Reuniones y asistencia ----------
  let meetingsWritten = 0;
  await inChunks(plan.meetings, 3000, async (chunk) => {
    meetingsWritten += total(await rpc("import_meetings", {
      rows: chunk.map((m) => ({ id: m.id, group_id: m.groupId, held_on: m.heldOn, lesson_number: m.lessonNumber })),
    }));
  });
  const enrollIds = new Set(enrollable.map((e) => e.id));
  const att = plan.attendance.filter((a) => enrollIds.has(a.enrollmentId));
  let marked = 0;
  let attWritten = 0;
  await inChunks(att, 5000, async (chunk) => {
    attWritten += total(await rpc("import_attendance", {
      rows: chunk.map((a) => ({ meeting_id: a.meetingId, enrollment_id: a.enrollmentId, status: a.status })),
    }));
    marked += chunk.length;
    if (marked % 50000 < 5000) log(`  asistencia ${marked}/${att.length}`);
  });
  result.reuniones = nuevo ? meetingsWritten : plan.meetings.length;
  result.asistencia = nuevo ? attWritten : att.length;
  log(`Reuniones: ${result.reuniones} · registros de asistencia: ${result.asistencia}`);

  // ---------- 7. Recursos ----------
  let resourcesWritten = 0;
  await inChunks(plan.resources, 500, async (chunk) => {
    resourcesWritten += total(await rpc("import_resources", {
      rows: chunk.map((r) => ({
        id: r.id, cycle_id: r.cycleId, name: r.name, kind: r.kind, read_url: r.readUrl, edit_url: r.editUrl, active: r.active,
      })),
    }));
  });
  result.recursos = nuevo ? resourcesWritten : plan.resources.length;

  return result;
}
