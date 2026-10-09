import type { Cell, Row, Tables } from "./mysqldump";
import { allCountries, countryByName, inferPhone, norm } from "./countries";
import { addDays, dayInWeek, fmtDate, mondayOf, toDate, uuid5 } from "./ids";
import { parseHorario } from "./schedule";

// ======================================================================
// Resultado de la transformación (todavía sin escribir nada en la base nueva)
// ======================================================================
export type RoleName = "alumno" | "lider" | "monitor" | "coordinador" | "admin";
const RANK: Record<RoleName, number> = { alumno: 1, lider: 2, monitor: 3, coordinador: 4, admin: 5 };

export type PersonOut = {
  email: string;
  fullName: string;
  role: RoleName;
  active: boolean;
  passwordHash: string | null;
  phone: string | null;
  country: string | null;
  birthDate: string | null;
  gender: "hombre" | "mujer" | null;
  city: string | null;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  acceptsComms: boolean;
  createdAt: string;
};
export type RoleHistoryOut = { email: string; fromRole: RoleName | null; toRole: RoleName; at: string };
export type CurriculumOut = {
  id: string; name: string; description: string | null; audience: string;
  ageMin: number | null; ageMax: number | null; book: string | null; active: boolean;
};
export type CoordinatorOut = { curriculumId: string; email: string };
export type SeasonOut = { id: string; name: string; startDate: string; endDate: string; status: string };
export type CycleOut = {
  id: string; curriculumId: string; number: number; title: string | null; classes: number; prerequisiteId: string | null;
};
export type GroupOut = {
  id: string; seasonId: string; cycleId: string; name: string;
  leaderEmail: string | null; monitorEmail: string | null;
  weekday: number | null; startTime: string | null; endTime: string | null;
  modality: "presencial" | "virtual"; address: string | null; capacity: number; status: string; createdAt: string;
};
export type EnrollmentOut = {
  id: string; email: string; groupId: string; status: string; enrolledAt: string; closedAt: string | null;
};
export type MeetingOut = { id: string; groupId: string; heldOn: string; lessonNumber: number };
export type AttendanceOut = { meetingId: string; enrollmentId: string; status: "presente" | "ausente" | "recuperado" };
export type ResourceOut = {
  id: string; cycleId: string; name: string; kind: string | null; readUrl: string | null; editUrl: string | null; active: boolean;
};

export type Issue = { code: string; table: string; oldId: string | number; detail?: string };

export type Plan = {
  persons: PersonOut[];
  roleHistory: RoleHistoryOut[];
  curriculums: CurriculumOut[];
  coordinators: CoordinatorOut[];
  seasons: SeasonOut[];
  cycles: CycleOut[];
  groups: GroupOut[];
  enrollments: EnrollmentOut[];
  meetings: MeetingOut[];
  attendance: AttendanceOut[];
  resources: ResourceOut[];
  issues: Issue[];
};

// ======================================================================
// Utilidades
// ======================================================================
const s = (v: Cell | undefined): string => (v === null || v === undefined ? "" : String(v).trim());
const n = (v: Cell | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const ts = (v: Cell | undefined): string | null => {
  const t = s(v);
  return /^\d{4}-\d{2}-\d{2}/.test(t) && !t.startsWith("0000") ? `${t.slice(0, 10)}T${t.slice(11, 19) || "00:00:00"}Z` : null;
};
const dateOnly = (v: Cell | undefined): string | null => {
  const t = s(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !t.startsWith("0000") ? t : null;
};
const byId = (rows: Row[] | undefined) => new Map((rows ?? []).map((r) => [String(r.id), r]));

function cleanName(first: Cell, last: Cell): string {
  const raw = `${s(first)} ${s(last)}`.replace(/\s+/g, " ").trim();
  if (raw.length > 3 && raw === raw.toUpperCase()) {
    return raw.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, sp: string, ch: string) => sp + ch.toUpperCase());
  }
  return raw;
}

const BCRYPT = /^\$2[aby]\$\d\d\$.{53}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ======================================================================
// Transformación principal
// ======================================================================
export function transform(t: Tables, today = new Date()): Plan {
  const issues: Issue[] = [];
  const issue = (code: string, table: string, oldId: string | number, detail?: string) =>
    issues.push({ code, table, oldId, detail });

  const paises = byId(t.paises);
  const countryName = (id: Cell) => (paises.get(String(id))?.paisnombre as string | undefined) ?? null;
  const isoByName = new Map(allCountries().map(([name, c]) => [name, c.iso]));
  const isoOf = (name: string | null) => (name ? isoByName.get(norm(name)) ?? null : null);

  // ---------------- Personas ----------------
  type Source = {
    kind: RoleName; table: string; row: Row; email: string; active: boolean;
  };
  const sourcesByEmail = new Map<string, Source[]>();
  const emailOfRow = new Map<string, string>(); // `${tabla}:${id}` -> correo

  const addSources = (table: string, kind: RoleName, activeOf: (r: Row) => boolean) => {
    for (const row of t[table] ?? []) {
      const email = s(row.email).toLowerCase();
      if (!EMAIL.test(email)) {
        issue("correo_invalido", table, s(row.id));
        continue;
      }
      emailOfRow.set(`${table}:${row.id}`, email);
      const list = sourcesByEmail.get(email) ?? [];
      list.push({ kind, table, row, email, active: activeOf(row) });
      sourcesByEmail.set(email, list);
    }
  };
  addSources("users", "alumno", (r) => n(r.active) !== 0);
  addSources("liders", "lider", (r) => n(r.status_lider) !== 0);
  addSources("monitors", "monitor", (r) => n(r.status_monitor) !== 0);
  addSources("coordinadors", "coordinador", (r) => n(r.status_coord) !== 0);
  addSources("admins", "admin", (r) => n(r.status_admin) !== 0);

  const persons: PersonOut[] = [];
  const roleHistory: RoleHistoryOut[] = [];
  const roleOfEmail = new Map<string, RoleName>();

  for (const [email, all] of sourcesByEmail) {
    const active = all.filter((x) => x.active);
    const pool = active.length ? active : all;
    pool.sort((a, b) => RANK[b.kind] - RANK[a.kind]);
    const top = pool[0];
    const role: RoleName = active.length ? top.kind : "alumno";
    roleOfEmail.set(email, role);

    // Datos personales: primero lo que la propia persona escribió al registrarse (ficha de alumno),
    // y si falta, el de las fichas de mayor rol.
    const dataPool = [...all.filter((x) => x.table === "users"), ...pool.filter((x) => x.table !== "users")];
    const pick = (get: (r: Row) => string): string => {
      for (const src of dataPool) {
        const v = get(src.row);
        if (v) return v;
      }
      return "";
    };

    // Contraseña: la del rol más alto que tenga una válida
    const hashes = pool.map((x) => s(x.row.password)).filter((h) => BCRYPT.test(h));
    const passwordHash = hashes[0] ? hashes[0].replace(/^\$2[by]\$/, "$2a$") : null;
    if (new Set(hashes).size > 1) issue("contrasenas_distintas", "personas", uuid5(email).slice(0, 8));
    if (!passwordHash) issue("sin_contrasena_valida", "personas", uuid5(email).slice(0, 8));

    const country = countryName(pick((r) => s(r.paise_id) || s(r.paiselider_id) || s(r.paisemonitor_id) || s(r.paisecoord_id) || s(r.paiseadmin_id)));
    const phoneRaw = pick((r) => s(r.telefono));
    const phone = inferPhone(phoneRaw, country);
    if (phoneRaw && !phone) issue("telefono_no_resuelto", "personas", uuid5(email).slice(0, 8));

    const generoRaw = norm(pick((r) => s(r.genero)));
    const gender = /^(m|h)/.test(generoRaw) && /(masc|hom)/.test(generoRaw) ? "hombre"
      : /^(f|m)/.test(generoRaw) && /(fem|muj)/.test(generoRaw) ? "mujer" : null;

    const bd = pick((r) => dateOnly(r.fechanacimiento) ?? "");
    const year = bd ? Number(bd.slice(0, 4)) : 0;
    const birthDate = bd && year >= 1900 && toDate(bd) <= today ? bd : null;

    const userRow = all.find((x) => x.table === "users")?.row;
    const created = all.map((x) => ts(x.row.created_at)).filter(Boolean).sort()[0] ?? today.toISOString();

    persons.push({
      email,
      fullName: cleanName(pick((r) => s(r.name)), pick((r) => s(r.lastname))) || email.split("@")[0],
      role,
      active: active.length > 0,
      passwordHash,
      phone,
      country: isoOf(country),
      birthDate,
      gender,
      city: pick((r) => s(r.ciudad)) || null,
      guardianName: userRow ? s(userRow.tutor_nombre) || null : null,
      guardianEmail: userRow ? s(userRow.tutor_email) || null : null,
      guardianPhone: userRow ? s(userRow.tutor_telefono) || null : null,
      termsAcceptedAt: userRow ? ts(userRow.terms_accepted_at) : null,
      termsVersion: userRow ? s(userRow.terms_version) || null : null,
      acceptsComms: userRow ? n(userRow.acepta_comunicaciones) !== 0 : true,
      createdAt: created,
    });

    // Historial de roles reconstruido con la fecha de alta de cada tabla
    const steps = (active.length ? active : []).sort((a, b) => RANK[a.kind] - RANK[b.kind]);
    let prev: RoleName | null = null;
    let lastAt = "";
    for (const st of steps) {
      let at = ts(st.row.created_at) ?? created;
      if (at < lastAt) at = lastAt; // nunca retrocede en el tiempo
      roleHistory.push({ email, fromRole: prev, toRole: st.kind, at });
      prev = st.kind;
      lastAt = at;
    }
    if (steps.length === 0) roleHistory.push({ email, fromRole: null, toRole: "alumno", at: created });
  }

  const emailOf = (table: string, id: Cell) => emailOfRow.get(`${table}:${id}`) ?? null;

  // ---------------- Currículums ----------------
  const curriculums: CurriculumOut[] = [];
  const curriculumId = (oldId: Cell) => uuid5(`curriculum:${oldId}`);
  for (const g of t.grupospequenos ?? []) {
    const restriction = s(g.restriction);
    const audience = restriction === "Masculino" ? "hombres" : restriction === "Femenino" ? "mujeres" : restriction === "Parejas" ? "parejas" : "todos";
    let ageMin = n(g.edad_min);
    let ageMax = n(g.edad_max);
    if (ageMin !== null && ageMin <= 0) ageMin = null;
    if (ageMax !== null && ageMax >= 99) ageMax = null;
    if (ageMin !== null && ageMax !== null && ageMin > ageMax) [ageMin, ageMax] = [null, null];
    curriculums.push({
      id: curriculumId(g.id),
      name: s(g.nombre_grupop),
      description: s(g.descrip_grupop) || null,
      audience,
      ageMin,
      ageMax,
      book: s(g.libro) || null,
      active: n(g.status_gp) === 1 && restriction !== "Coordinacion",
    });
  }
  const validCurriculums = new Set(curriculums.map((c) => c.id));

  // ---------------- Coordinadores por currículum ----------------
  const coordinators: CoordinatorOut[] = [];
  const seenCoord = new Set<string>();
  for (const c of t.coordinadors ?? []) {
    if (n(c.status_coord) === 0) continue;
    const email = emailOf("coordinadors", c.id);
    const cid = curriculumId(c.grupopequeno_id);
    if (!email || !validCurriculums.has(cid)) {
      issue("coordinador_sin_curriculum", "coordinadors", s(c.id));
      continue;
    }
    if (!seenCoord.has(email + cid)) {
      seenCoord.add(email + cid);
      coordinators.push({ curriculumId: cid, email });
    }
  }

  // ---------------- Temporadas ----------------
  const seasons: SeasonOut[] = [];
  const seasonStart = new Map<string, string>();
  const usedNames = new Set<string>();
  for (const x of t.temporadas ?? []) {
    let start = dateOnly(x.fecha_inicio);
    let end = dateOnly(x.fecha_fin);
    if (!start || !end) {
      issue("temporada_sin_fechas", "temporadas", s(x.id));
      continue;
    }
    if (end < start) {
      const weeks = (t.semanas ?? [])
        .filter((w) => String(w.temporada_id) === String(x.id))
        .map((w) => [dateOnly(w.fecha_inicio), dateOnly(w.fecha_fin)] as const)
        .filter((p): p is readonly [string, string] => !!p[0] && !!p[1]);
      if (weeks.length) {
        start = weeks.map((p) => p[0]).sort()[0];
        end = weeks.map((p) => p[1]).sort().slice(-1)[0];
      } else {
        [start, end] = [end, start];
      }
      issue("temporada_fechas_invertidas", "temporadas", s(x.id));
    }
    const nombre = s(x.nombre_temporada);
    const num = Number(nombre);
    let name = num >= 2000 ? nombre : num >= 1 && num <= 6 ? `${start.slice(0, 4)} · T${num}` : nombre || `Temporada ${x.id}`;
    if (usedNames.has(name)) name = `${name} (${x.id})`;
    usedNames.add(name);
    seasons.push({ id: uuid5(`season:${x.id}`), name, startDate: start, endDate: end, status: n(x.status) === 1 ? "en_curso" : "cerrada" });
    seasonStart.set(String(x.id), start);
  }
  const seasonById = new Map(seasons.map((x) => [x.id, x]));
  const seasonOf = (oldId: Cell) => seasonById.get(uuid5(`season:${oldId}`));

  // ---------------- Ciclos ----------------
  const cycles: CycleOut[] = [];
  const cycleIdByOld = new Map<string, string>();
  const cycleKey = new Map<string, string>(); // `${curriculum}|${numero}` -> id
  const oldCyclePrereq: { id: string; prela: string }[] = [];
  for (const c of t.ciclos ?? []) {
    const cid = curriculumId(c.grupopequeno_id);
    const number = n(c.nombre_ciclo);
    if (!validCurriculums.has(cid) || !number || number < 1) {
      issue("ciclo_invalido", "ciclos", s(c.id));
      continue;
    }
    const key = `${cid}|${number}`;
    const existing = cycleKey.get(key);
    if (existing) {
      cycleIdByOld.set(String(c.id), existing);
      issue("ciclo_duplicado", "ciclos", s(c.id), `mismo número ${number} en el currículum`);
      continue;
    }
    const id = uuid5(`cycle:${c.id}`);
    cycleKey.set(key, id);
    cycleIdByOld.set(String(c.id), id);
    cycles.push({
      id, curriculumId: cid, number, title: s(c.titulo) || null,
      classes: n(c.number_of_classes) && n(c.number_of_classes)! > 0 ? n(c.number_of_classes)! : 11,
      prerequisiteId: null,
    });
    const prela = n(c.ciclo_prela);
    if (prela && prela > 0) oldCyclePrereq.push({ id, prela: String(prela) });
  }
  for (const p of oldCyclePrereq) {
    // ciclo_prela es el identificador del ciclo que debe aprobarse antes
    const target = cycleIdByOld.get(p.prela);
    const cycle = cycles.find((c) => c.id === p.id)!;
    if (target && target !== p.id) cycle.prerequisiteId = target;
    else issue("ciclo_previo_no_resuelto", "ciclos", p.id.slice(0, 8), `ciclo_prela=${p.prela}`);
  }
  const cycleById = new Map(cycles.map((c) => [c.id, c]));

  // ---------------- Inscripciones (primera pasada: qué grupo corresponde a cada una) ----------------
  const insc = (t.inscripcions ?? []).slice();
  const horarios = t.gpequenoliders ?? [];
  const addresses = new Map((t.in_person_addresses ?? []).map((a) => [String(a.gpequenoliders_id), a]));

  const groups: GroupOut[] = [];
  const groupById = new Map<string, GroupOut>();
  const groupKeyToId = new Map<string, string>();
  const keyOf = (temp: Cell, gp: Cell, ciclo: Cell, lider: Cell, horario: Cell) =>
    `${temp}|${gp}|${ciclo}|${lider}|${s(horario)}`;

  const leaderEmail = (id: Cell) => (n(id) ? emailOf("liders", id) : null);
  const monitorEmail = (id: Cell) => (n(id) ? emailOf("monitors", id) : null);
  const personName = new Map(persons.map((p) => [p.email, p.fullName]));

  const addGroup = (g: Omit<GroupOut, "capacity">) => {
    groups.push({ ...g, capacity: 15 });
    groupById.set(g.id, groups[groups.length - 1]);
  };

  for (const h of horarios) {
    const season = seasonOf(h.temporada_id);
    const cycleId = cycleIdByOld.get(String(h.ciclo_id));
    if (!season || !cycleId) {
      issue("horario_sin_temporada_o_ciclo", "gpequenoliders", s(h.id));
      continue;
    }
    const cycle = cycleById.get(cycleId)!;
    if (cycle.curriculumId !== curriculumId(h.grupopequeno_id)) issue("horario_curriculum_distinto", "gpequenoliders", s(h.id));

    const sched = parseHorario(s(h.horario));
    if (!sched && s(h.horario)) issue("horario_no_entendido", "gpequenoliders", s(h.id), s(h.horario).slice(0, 40));
    const addr = addresses.get(String(h.id));
    const inPerson = n(h.is_in_person) === 1;
    const lEmail = leaderEmail(h.lider_id);
    if (n(h.lider_id) && !lEmail) issue("lider_sin_cuenta", "gpequenoliders", s(h.id));
    const mEmail = monitorEmail(h.monitor_id);

    const finished = season.status === "cerrada" || n(h.asistencia_completada) === 1;
    const id = uuid5(`group:${h.id}`);
    addGroup({
      id,
      seasonId: season.id,
      cycleId,
      name: lEmail ? `Grupo de ${personName.get(lEmail)}` : `Grupo ${h.id}`,
      leaderEmail: lEmail,
      monitorEmail: mEmail,
      weekday: sched?.weekday ?? null,
      startTime: sched?.start ?? null,
      endTime: sched?.end ?? null,
      modality: inPerson ? "presencial" : "virtual",
      address: inPerson && addr ? [s(addr.address), s(addr.municipality), s(addr.aditional_info)].filter(Boolean).join(", ") || null : null,
      status: finished ? "finalizado" : "en_curso",
      createdAt: ts(h.created_at) ?? today.toISOString(),
    });
    const k = keyOf(h.temporada_id, h.grupopequeno_id, h.ciclo_id, h.lider_id, h.horario);
    if (!groupKeyToId.has(k)) groupKeyToId.set(k, id);
  }
  const horarioIdToGroup = new Map(horarios.map((h) => [String(h.id), uuid5(`group:${h.id}`)]));

  // ---------------- Inscripciones ----------------
  const enrollments: EnrollmentOut[] = [];
  const userEmail = (id: Cell) => emailOf("users", id);
  const statusMap = (st: number | null, seasonStatus: string): string => {
    switch (st) {
      case 0: return "no_completo";
      case 1: return seasonStatus === "cerrada" ? "no_completo" : "en_curso";
      case 2: return "aprobado";
      case 3: return "preinscrito";
      case 9: return "no_participo";
      default: return "no_participo";
    }
  };

  const enrollmentOldToNew = new Map<string, string>(); // id antiguo -> id nuevo (solo las que sobreviven)
  const lastByPersonGroup = new Map<string, Row>();

  for (const r of insc) {
    const season = seasonOf(r.temporada_id);
    const cycleId = cycleIdByOld.get(String(r.ciclo_id));
    const email = userEmail(r.user_id);
    if (!season || !cycleId) { issue("inscripcion_sin_temporada_o_ciclo", "inscripcions", s(r.id)); continue; }
    if (!email) { issue("inscripcion_sin_persona", "inscripcions", s(r.id)); continue; }

    let groupId: string | undefined;
    if (n(r.gpequenolider_id)) groupId = horarioIdToGroup.get(String(r.gpequenolider_id));
    if (!groupId) groupId = groupKeyToId.get(keyOf(r.temporada_id, r.grupopequeno_id, r.ciclo_id, r.lider_id, r.horario));
    if (!groupId) {
      // Inscripción sin horario conocido: se crea un grupo para no perderla
      const k = keyOf(r.temporada_id, r.grupopequeno_id, r.ciclo_id, r.lider_id, r.horario);
      groupId = uuid5(`groupx:${k}`);
      if (!groupById.has(groupId)) {
        const sched = parseHorario(s(r.horario));
        const lEmail = leaderEmail(r.lider_id);
        addGroup({
          id: groupId, seasonId: season.id, cycleId,
          name: lEmail ? `Grupo de ${personName.get(lEmail)}` : `Grupo sin líder ${s(r.horario).slice(0, 20)}`.trim(),
          leaderEmail: lEmail, monitorEmail: null,
          weekday: sched?.weekday ?? null, startTime: sched?.start ?? null, endTime: sched?.end ?? null,
          modality: "virtual", address: null,
          status: season.status === "cerrada" ? "finalizado" : "en_curso",
          createdAt: ts(r.created_at) ?? today.toISOString(),
        });
        groupKeyToId.set(k, groupId);
      }
      issue("inscripcion_sin_horario", "inscripcions", s(r.id));
    }

    const pk = `${email}|${groupId}`;
    const prev = lastByPersonGroup.get(pk);
    if (prev && Number(prev.id) > Number(r.id)) { issue("inscripcion_duplicada", "inscripcions", s(r.id)); continue; }
    if (prev) issue("inscripcion_duplicada", "inscripcions", s(prev.id));
    lastByPersonGroup.set(pk, r);
  }

  const kept = Array.from(lastByPersonGroup.values());
  const pending: { r: Row; email: string; groupId: string; status: string }[] = [];
  for (const r of kept) {
    const email = userEmail(r.user_id)!;
    const groupId = (n(r.gpequenolider_id) ? horarioIdToGroup.get(String(r.gpequenolider_id)) : undefined)
      ?? groupKeyToId.get(keyOf(r.temporada_id, r.grupopequeno_id, r.ciclo_id, r.lider_id, r.horario))!;
    const season = seasonOf(r.temporada_id)!;
    pending.push({ r, email, groupId, status: statusMap(n(r.status), season.status) });
  }

  // Una sola inscripción activa por persona, currículum y temporada
  const activeSeen = new Map<string, number>();
  pending.sort((a, b) => Number(b.r.id) - Number(a.r.id));
  for (const p of pending) {
    if (p.status !== "en_curso" && p.status !== "preinscrito") continue;
    const cycle = cycleById.get(groupById.get(p.groupId)!.cycleId)!;
    const key = `${p.email}|${cycle.curriculumId}|${groupById.get(p.groupId)!.seasonId}`;
    if (activeSeen.has(key)) {
      p.status = "cancelado";
      issue("inscripcion_activa_repetida", "inscripcions", s(p.r.id));
    } else activeSeen.set(key, Number(p.r.id));
  }
  pending.sort((a, b) => Number(a.r.id) - Number(b.r.id));

  for (const p of pending) {
    const id = uuid5(`enrollment:${p.r.id}`);
    enrollmentOldToNew.set(String(p.r.id), id);
    const final = !["en_curso", "preinscrito"].includes(p.status);
    enrollments.push({
      id, email: p.email, groupId: p.groupId, status: p.status,
      enrolledAt: ts(p.r.created_at) ?? today.toISOString(),
      closedAt: final ? ts(p.r.updated_at) : null,
    });
  }

  // Cupo del grupo: 15, o más si ya había más inscritos
  const counts = new Map<string, number>();
  for (const e of enrollments) if (e.status !== "cancelado") counts.set(e.groupId, (counts.get(e.groupId) ?? 0) + 1);
  for (const g of groups) g.capacity = Math.max(15, counts.get(g.id) ?? 0);

  // ---------------- Reuniones y asistencia ----------------
  // Hay dos modelos en la plataforma antigua:
  //  - Actual (attendance_weeks): "Semana 1..11" relativa a cada grupo, sin fecha. Solo se conoce cuándo se marcó,
  //    así que la fecha de inicio del grupo se estima y las reuniones se calculan semana a semana.
  //  - Histórico (asistencias + semanas): semanas del calendario, con fecha real.
  // Se usa uno u otro por grupo: si algún inscrito tiene marcas en el modelo actual, se usa ese.
  const semanasBySeason = new Map<string, Row[]>();
  for (const w of t.semanas ?? []) {
    const list = semanasBySeason.get(String(w.temporada_id)) ?? [];
    list.push(w);
    semanasBySeason.set(String(w.temporada_id), list);
  }
  for (const list of semanasBySeason.values()) list.sort((a, b) => s(a.fecha_inicio).localeCompare(s(b.fecha_inicio)) || Number(a.id) - Number(b.id));
  const weekIndexOfSemana = new Map<string, { season: string; index: number }>();
  for (const [season, list] of semanasBySeason) list.forEach((w, i) => weekIndexOfSemana.set(String(w.id), { season, index: i + 1 }));

  type Mark = { status: number; day: string | null };
  const relMarks = new Map<string, Map<number, Mark>>(); // inscripción -> semana relativa -> marca
  for (const a of t.attendance_weeks ?? []) {
    const week = parseInt(s(a.name).replace(/\D/g, ""), 10);
    if (!Number.isFinite(week) || week < 1) continue;
    const m = relMarks.get(String(a.inscripcion_id)) ?? new Map<number, Mark>();
    m.set(week, { status: Number(a.status), day: dateOnly(a.updated_at) });
    relMarks.set(String(a.inscripcion_id), m);
  }
  const calMarks = new Map<string, Map<number, number>>(); // inscripción -> semana del calendario -> estado
  for (const a of t.asistencias ?? []) {
    const w = weekIndexOfSemana.get(String(a.semana_id));
    if (!w) continue;
    const m = calMarks.get(String(a.inscripcion_id)) ?? new Map<number, number>();
    m.set(w.index, Number(a.status));
    calMarks.set(String(a.inscripcion_id), m);
  }

  const oldIdOfEnrollment = new Map<string, string>();
  for (const [oldId, newId] of enrollmentOldToNew) oldIdOfEnrollment.set(newId, oldId);
  const meetings: MeetingOut[] = [];
  const attendance: AttendanceOut[] = [];
  const statusName: Record<number, AttendanceOut["status"]> = { 1: "presente", 2: "ausente", 3: "recuperado" };

  const enrollmentsByGroup = new Map<string, EnrollmentOut[]>();
  for (const e of enrollments) enrollmentsByGroup.set(e.groupId, [...(enrollmentsByGroup.get(e.groupId) ?? []), e]);
  const reportedSeasons = new Set<string>();
  const seasonOldIdOf = new Map(seasons.map((x) => [x.id, (t.temporadas ?? []).find((o) => uuid5(`season:${o.id}`) === x.id)?.id]));

  for (const [groupId, list] of enrollmentsByGroup) {
    const group = groupById.get(groupId)!;
    const live = list.filter((e) => e.status !== "cancelado");
    const oldIds = live.map((e) => oldIdOfEnrollment.get(e.id)!);
    const useRelative = oldIds.some((id) => [...(relMarks.get(id)?.values() ?? [])].some((m) => m.status > 0));

    // semana (relativa o de calendario) -> número de lección y fecha
    const lessonOf = new Map<number, number>();
    const dateOf = new Map<number, string>();

    if (useRelative) {
      const weeks = new Set<number>();
      const implied: number[] = [];
      for (const id of oldIds) {
        for (const [w, m] of relMarks.get(id) ?? []) {
          if (m.status <= 0) continue;
          weeks.add(w);
          if (m.day) implied.push(toDate(m.day).getTime() - 7 * (w - 1) * 86400000);
        }
      }
      if (weeks.size === 0) continue;
      let start: Date;
      if (implied.length) {
        // Cada marca da una fecha de inicio posible (fecha de marca menos las semanas transcurridas). Hay marcas
        // tardías y otras puestas de golpe, así que se usa la mediana.
        implied.sort((x, y) => x - y);
        const guess = new Date(implied[Math.floor(0.5 * (implied.length - 1))]);
        start = group.weekday ? addDays(mondayOf(guess), group.weekday - 1) : guess;
      } else {
        const seasonStartDate = seasonStart.get(String(seasonOldIdOf.get(group.seasonId))) ?? seasonById.get(group.seasonId)!.startDate;
        start = addDays(mondayOf(toDate(seasonStartDate)), (group.weekday ?? 1) - 1);
      }
      // Nunca hay reuniones en el futuro: si la última cae después de hoy, se corre todo hacia atrás por semanas
      const lastDate = addDays(start, 7 * (Math.max(...weeks) - 1));
      if (lastDate > today) start = addDays(start, -7 * Math.ceil((lastDate.getTime() - today.getTime()) / (7 * 86400000)));
      for (const w of weeks) {
        lessonOf.set(w, w);
        dateOf.set(w, fmtDate(addDays(start, 7 * (w - 1))));
      }
      issue("reunion_fechas_estimadas", "asistencia", groupId.slice(0, 8));
    } else {
      const weeks = new Set<number>();
      for (const id of oldIds) for (const [w, st] of calMarks.get(id) ?? []) if (st > 0) weeks.add(w);
      if (weeks.size === 0) continue;
      const seasonOld = String(seasonOldIdOf.get(group.seasonId));
      const sea = seasonById.get(group.seasonId)!;
      const rawSemanas = semanasBySeason.get(seasonOld) ?? [];
      const firstWeek = rawSemanas.length ? dateOnly(rawSemanas[0].fecha_inicio) : null;
      const consistent =
        !!firstWeek &&
        firstWeek >= fmtDate(addDays(toDate(sea.startDate), -45)) &&
        firstWeek <= fmtDate(addDays(toDate(sea.endDate), 45));
      if (rawSemanas.length && !consistent && !reportedSeasons.has(group.seasonId)) {
        reportedSeasons.add(group.seasonId);
        issue("calendario_de_semanas_incoherente", "semanas", seasonOld, "se usó el calendario de la temporada");
      }
      const semanas = consistent ? rawSemanas : [];
      const seasonStartDate = seasonStart.get(seasonOld) ?? sea.startDate;
      Array.from(weeks).sort((a, b) => a - b).forEach((w, i) => {
        // Se busca el día del grupo dentro de la semana (algunas semanas del calendario empiezan en domingo)
        let anchor: Date;
        if (semanas.length) {
          anchor = toDate(dateOnly(semanas[Math.min(w, semanas.length) - 1].fecha_inicio) ?? seasonStartDate);
          if (w > semanas.length) anchor = addDays(anchor, 7 * (w - semanas.length));
        } else {
          anchor = addDays(toDate(seasonStartDate), 7 * (w - 1));
        }
        lessonOf.set(w, i + 1);
        dateOf.set(w, fmtDate(dayInWeek(anchor, group.weekday)));
      });
    }

    const meetingOfWeek = new Map<number, string>();
    const usedDates = new Set<string>();
    for (const w of Array.from(lessonOf.keys()).sort((a, b) => a - b)) {
      let date = dateOf.get(w)!;
      if (usedDates.has(date)) {
        // Calendarios con semanas traslapadas: se pasa al mismo día de la semana siguiente que esté libre
        while (usedDates.has(date)) date = fmtDate(addDays(toDate(date), 7));
        issue("reunion_fecha_ajustada", "asistencia", `${groupId.slice(0, 8)}:${w}`);
      }
      usedDates.add(date);
      const id = uuid5(`meeting:${groupId}:${w}`);
      meetingOfWeek.set(w, id);
      meetings.push({ id, groupId, heldOn: date, lessonNumber: lessonOf.get(w)! });
    }

    for (const e of live) {
      const oldId = oldIdOfEnrollment.get(e.id)!;
      const marks: [number, number][] = useRelative
        ? [...(relMarks.get(oldId) ?? [])].map(([w, m]) => [w, m.status] as [number, number])
        : [...(calMarks.get(oldId) ?? [])];
      for (const [w, st] of marks) {
        const meetingId = meetingOfWeek.get(w);
        if (meetingId && statusName[st]) attendance.push({ meetingId, enrollmentId: e.id, status: statusName[st] });
      }
    }
  }

  // ---------------- Recursos ----------------
  const resources: ResourceOut[] = [];
  const https = (u: Cell) => (/^https:\/\/\S+$/.test(s(u)) ? s(u) : null);
  for (const r of t.recursos ?? []) {
    const cycleId = cycleIdByOld.get(String(r.ciclo_id));
    if (!cycleId) { issue("recurso_sin_ciclo", "recursos", s(r.id)); continue; }
    const read = https(r.link_lectura);
    const edit = https(r.link_escritura);
    if ((s(r.link_lectura) && !read) || (s(r.link_escritura) && !edit)) issue("recurso_enlace_no_seguro", "recursos", s(r.id));
    resources.push({
      id: uuid5(`resource:${r.id}`), cycleId,
      name: s(r.nombre_material) || s(r.clase) || `Recurso ${r.id}`,
      kind: s(r.clase) || null, readUrl: read, editUrl: edit, active: n(r.status_recurso) !== 0,
    });
  }

  return { persons, roleHistory, curriculums, coordinators, seasons, cycles, groups, enrollments, meetings, attendance, resources, issues };
}

// ======================================================================
// Informe (sin datos personales)
// ======================================================================
export function summarize(plan: Plan) {
  const count = <T,>(items: T[], key: (x: T) => string) => {
    const out: Record<string, number> = {};
    for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
    return out;
  };
  const issueCounts = count(plan.issues, (i) => `${i.code} (${i.table})`);
  return {
    personas: plan.persons.length,
    personasPorRol: count(plan.persons, (p) => p.role),
    personasInactivas: plan.persons.filter((p) => !p.active).length,
    conTelefono: plan.persons.filter((p) => p.phone).length,
    sinTelefono: plan.persons.filter((p) => !p.phone).length,
    conContrasena: plan.persons.filter((p) => p.passwordHash).length,
    sinContrasena: plan.persons.filter((p) => !p.passwordHash).length,
    historialDeRoles: plan.roleHistory.length,
    curriculums: plan.curriculums.length,
    coordinadoresAsignados: plan.coordinators.length,
    temporadas: plan.seasons.length,
    ciclos: plan.cycles.length,
    grupos: plan.groups.length,
    gruposPorEstado: count(plan.groups, (g) => g.status),
    inscripciones: plan.enrollments.length,
    inscripcionesPorEstado: count(plan.enrollments, (e) => e.status),
    reuniones: plan.meetings.length,
    registrosDeAsistencia: plan.attendance.length,
    recursos: plan.resources.length,
    avisos: issueCounts,
  };
}
