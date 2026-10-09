import type { Row } from "../lib/mysqldump";

// Genera texto SQL parecido al de phpMyAdmin a partir de filas.
export function toDump(tables: Record<string, Row[]>, withColumns = true): string {
  const lit = (v: unknown): string => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
  };
  const out: string[] = ["-- respaldo de prueba", "SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";"];
  for (const [table, rows] of Object.entries(tables)) {
    if (rows.length === 0) continue;
    const cols = Object.keys(rows[0]);
    if (!withColumns) {
      out.push(`CREATE TABLE \`${table}\` (\n${cols.map((c) => `  \`${c}\` varchar(255) DEFAULT NULL`).join(",\n")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8;`);
    }
    const head = withColumns ? ` (${cols.map((c) => `\`${c}\``).join(", ")})` : "";
    out.push(`INSERT INTO \`${table}\`${head} VALUES\n${rows.map((r) => `(${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n")};`);
  }
  return out.join("\n\n");
}

const HASH = (c: string) => `$2y$10$${c.repeat(53)}`;
export const H_USER = HASH("a");
export const H_LIDER = HASH("b");
export const H_MONITOR = HASH("c");

const person = (over: Row): Row => ({
  genero: "Masculino", estadocivil: "Soltero", fechanacimiento: "1990-05-01", ciudad: "Santiago",
  created_at: "2021-03-01 10:00:00", updated_at: "2021-03-01 10:00:00", ...over,
});

export const OLD_DB: Record<string, Row[]> = {
  paises: [
    { id: 1, paisnombre: "Chile" },
    { id: 2, paisnombre: "Venezuela" },
  ],
  users: [
    person({ id: 1, name: "Ana", lastname: "Pérez", email: "Ana@x.cl", telefono: "912345678", paise_id: 1, genero: "Femenino", active: 1,
      password: H_USER, terms_accepted_at: "2026-04-01 10:00:00", terms_version: "v1", acepta_comunicaciones: 1,
      tutor_nombre: null, tutor_email: null, tutor_telefono: null }),
    person({ id: 2, name: "LUIS", lastname: "GÓMEZ", email: "luis@x.cl", telefono: "04146718293", paise_id: 2, active: 1,
      password: H_USER, terms_accepted_at: null, terms_version: null, acepta_comunicaciones: 0,
      tutor_nombre: null, tutor_email: null, tutor_telefono: null }),
    person({ id: 4, name: "Sin", lastname: "Correo", email: "mal-correo", telefono: "", paise_id: 1, active: 1, password: H_USER }),
    person({ id: 5, name: "Viejo", lastname: "Coord", email: "viejo@x.cl", telefono: "12345", paise_id: 1, active: 1, password: "0",
      terms_accepted_at: null, terms_version: null, acepta_comunicaciones: 1, tutor_nombre: null, tutor_email: null, tutor_telefono: null }),
  ],
  liders: [
    person({ id: 10, name: "Ana", lastname: "Pérez", email: "ana@x.cl", telefono: "912345678", paiselider_id: 1, status_lider: 1,
      password: H_LIDER, created_at: "2022-01-01 10:00:00" }),
    person({ id: 11, name: "Lider", lastname: "Dos", email: "lider2@x.cl", telefono: "+56 9 8888 7777", paiselider_id: 1, status_lider: 1,
      password: H_LIDER, created_at: "2022-02-01 10:00:00" }),
  ],
  monitors: [
    person({ id: 20, name: "Ana", lastname: "Pérez", email: "ana@x.cl", telefono: "912345678", paisemonitor_id: 1, status_monitor: 1,
      password: H_MONITOR, created_at: "2023-01-01 10:00:00" }),
  ],
  coordinadors: [
    person({ id: 1, name: "Coord", lastname: "Uno", email: "coord@x.cl", telefono: "911112222", paisecoord_id: 1, status_coord: 1,
      grupopequeno_id: 1, password: H_USER }),
    person({ id: 2, name: "Viejo", lastname: "Coord", email: "viejo@x.cl", telefono: "911113333", paisecoord_id: 1, status_coord: 0,
      grupopequeno_id: 1, password: H_USER }),
  ],
  admins: [
    person({ id: 1, name: "Admin", lastname: "Uno", email: "admin@x.cl", telefono: "+56911110000", paiseadmin_id: 1, status_admin: 1, password: H_USER }),
  ],
  grupospequenos: [
    { id: 1, nombre_grupop: "HOMBRES", libro: "Libro", descrip_grupop: "Para hombres", restriction: "Masculino", edad_min: 18, edad_max: 99, status_gp: 1 },
    { id: 2, nombre_grupop: "COORD GLOBAL", libro: null, descrip_grupop: null, restriction: "Coordinacion", edad_min: 0, edad_max: 0, status_gp: 1 },
  ],
  temporadas: [
    { id: 1, nombre_temporada: "1", fecha_inicio: "2025-02-03", fecha_fin: "2025-04-25", status: 0 },
    { id: 2, nombre_temporada: "2026", fecha_inicio: "2026-04-13", fecha_fin: "2026-11-23", status: 1 },
    { id: 3, nombre_temporada: "2", fecha_inicio: "2023-06-02", fecha_fin: "2023-04-17", status: 0 },
  ],
  ciclos: [
    { id: 11, grupopequeno_id: 1, nombre_ciclo: 1, status_ciclo: 1, titulo: null, number_of_classes: 11, ciclo_prela: null },
    { id: 12, grupopequeno_id: 1, nombre_ciclo: 2, status_ciclo: 1, titulo: "Segundo", number_of_classes: 11, ciclo_prela: 11 },
    { id: 13, grupopequeno_id: 1, nombre_ciclo: 2, status_ciclo: 0, titulo: "Repetido", number_of_classes: 11, ciclo_prela: null },
  ],
  gpequenoliders: [
    { id: 1, temporada_id: 2, grupopequeno_id: 1, ciclo_id: 11, lider_id: 10, horario: "Viernes, 20:30 hrs a 22:00 hrs", status_lider: 1,
      monitor_id: 20, status_horario: 1, status_inscripcion: 1, asistencia_completada: 0, is_in_person: 0, created_at: "2026-04-10 10:00:00" },
    { id: 2, temporada_id: 1, grupopequeno_id: 1, ciclo_id: 11, lider_id: 10, horario: "Martes, 19:00 hrs a 20:15 hrs", status_lider: 1,
      monitor_id: null, status_horario: 1, status_inscripcion: 1, asistencia_completada: 1, is_in_person: 1, created_at: "2025-02-01 10:00:00" },
  ],
  in_person_addresses: [{ id: 1, gpequenoliders_id: 2, pais_id: 1, estado_id: 1, municipality: "Santiago", address: "Calle 1", aditional_info: null }],
  semanas: [
    { id: 1, fecha_inicio: "2026-04-13", fecha_fin: "2026-04-19", temporada_id: 2, status: 1 },
    { id: 2, fecha_inicio: "2026-04-20", fecha_fin: "2026-04-26", temporada_id: 2, status: 1 },
    { id: 3, fecha_inicio: "2026-04-27", fecha_fin: "2026-05-03", temporada_id: 2, status: 1 },
    { id: 10, fecha_inicio: "2025-02-03", fecha_fin: "2025-02-09", temporada_id: 1, status: 0 },
    { id: 11, fecha_inicio: "2025-02-10", fecha_fin: "2025-02-16", temporada_id: 1, status: 0 },
    { id: 12, fecha_inicio: "2025-02-17", fecha_fin: "2025-02-23", temporada_id: 1, status: 0 },
  ],
  inscripcions: [
    { id: 1, temporada_id: 2, user_id: 1, grupopequeno_id: 1, ciclo_id: 11, lider_id: 10, gpequenolider_id: 1, status: 1, horario: "Viernes, 20:30 hrs a 22:00 hrs", created_at: "2026-04-14 09:00:00", updated_at: "2026-04-14 09:00:00" },
    { id: 2, temporada_id: 2, user_id: 2, grupopequeno_id: 1, ciclo_id: 11, lider_id: 10, gpequenolider_id: 1, status: 1, horario: "Viernes, 20:30 hrs a 22:00 hrs", created_at: "2026-04-14 09:00:00", updated_at: "2026-04-14 09:00:00" },
    { id: 3, temporada_id: 1, user_id: 2, grupopequeno_id: 1, ciclo_id: 11, lider_id: 10, gpequenolider_id: 2, status: 2, horario: "Martes, 19:00 hrs a 20:15 hrs", created_at: "2025-02-02 09:00:00", updated_at: "2025-04-30 09:00:00" },
    { id: 4, temporada_id: 1, user_id: 1, grupopequeno_id: 1, ciclo_id: 11, lider_id: 10, gpequenolider_id: null, status: 0, horario: "Martes, 19:00 hrs a 20:15 hrs", created_at: "2025-02-02 09:00:00", updated_at: "2025-04-30 09:00:00" },
    { id: 5, temporada_id: 2, user_id: 2, grupopequeno_id: 1, ciclo_id: 11, lider_id: 10, gpequenolider_id: 1, status: 3, horario: "Viernes, 20:30 hrs a 22:00 hrs", created_at: "2026-04-20 09:00:00", updated_at: "2026-04-20 09:00:00" },
    { id: 6, temporada_id: 2, user_id: 99, grupopequeno_id: 1, ciclo_id: 11, lider_id: 10, gpequenolider_id: 1, status: 1, horario: "Viernes, 20:30 hrs a 22:00 hrs", created_at: "2026-04-14 09:00:00", updated_at: "2026-04-14 09:00:00" },
  ],
  // Modelo histórico: asistencia por semana de calendario
  asistencias: [
    { id: 1, inscripcion_id: 3, semana_id: 10, status: 1 },
    { id: 2, inscripcion_id: 3, semana_id: 11, status: 2 },
    { id: 3, inscripcion_id: 3, semana_id: 12, status: 1 },
    { id: 4, inscripcion_id: 4, semana_id: 10, status: 0 },
  ],
  // Modelo actual: "Semana N"
  attendance_weeks: [
    { id: 1, name: "Semana 1", status: 1, inscripcion_id: 1, updated_at: "2026-04-18 10:00:00" },
    { id: 2, name: "Semana 2", status: 2, inscripcion_id: 1, updated_at: "2026-04-25 10:00:00" },
    { id: 3, name: "Semana 3", status: 0, inscripcion_id: 1, updated_at: "2026-04-14 10:00:00" },
  ],
  recursos: [
    { id: 1, grupopequeno_id: 1, ciclo_id: 11, nombre_material: "Guía", clase: "Clase 1", link_lectura: "https://docs.example/1", link_escritura: "http://inseguro.example", status_recurso: 1 },
    { id: 2, grupopequeno_id: 1, ciclo_id: 99, nombre_material: "Huérfano", clase: "Clase 2", link_lectura: null, link_escritura: null, status_recurso: 1 },
  ],
};

// ---- Casos difíciles de calendario ----
const cuando = { status_lider: 1, monitor_id: null, status_horario: 1, status_inscripcion: 1, asistencia_completada: 1, is_in_person: 0 };
OLD_DB.temporadas.push(
  { id: 4, nombre_temporada: "3", fecha_inicio: "2024-06-11", fecha_fin: "2024-08-25", status: 0 },
  { id: 5, nombre_temporada: "2", fecha_inicio: "2022-05-11", fecha_fin: "2022-09-02", status: 0 },
);
OLD_DB.semanas.push(
  // temporada 3 tiene las fechas invertidas: el calendario de semanas da las correctas
  { id: 20, fecha_inicio: "2023-01-30", fecha_fin: "2023-02-05", temporada_id: 3, status: 0 },
  { id: 21, fecha_inicio: "2023-02-06", fecha_fin: "2023-04-17", temporada_id: 3, status: 0 },
  // temporada 4: semanas que empiezan en domingo
  { id: 30, fecha_inicio: "2024-06-09", fecha_fin: "2024-06-16", temporada_id: 4, status: 0 },
  { id: 31, fecha_inicio: "2024-06-16", fecha_fin: "2024-06-23", temporada_id: 4, status: 0 },
  { id: 32, fecha_inicio: "2024-06-23", fecha_fin: "2024-06-30", temporada_id: 4, status: 0 },
  // temporada 5: calendario copiado de otro año
  { id: 40, fecha_inicio: "2021-01-11", fecha_fin: "2021-01-17", temporada_id: 5, status: 0 },
  { id: 41, fecha_inicio: "2021-01-18", fecha_fin: "2021-01-24", temporada_id: 5, status: 0 },
);
OLD_DB.gpequenoliders.push(
  { id: 3, temporada_id: 4, grupopequeno_id: 1, ciclo_id: 11, lider_id: 11, horario: "Viernes, 19:00 hrs a 20:00 hrs", created_at: "2024-06-01 10:00:00", ...cuando },
  { id: 4, temporada_id: 5, grupopequeno_id: 1, ciclo_id: 11, lider_id: 10, horario: "Martes, 19:00 hrs a 20:00 hrs", created_at: "2022-05-01 10:00:00", ...cuando },
);
OLD_DB.inscripcions.push(
  { id: 7, temporada_id: 4, user_id: 2, grupopequeno_id: 1, ciclo_id: 11, lider_id: 11, gpequenolider_id: 3, status: 2, horario: "Viernes, 19:00 hrs a 20:00 hrs", created_at: "2024-06-05 09:00:00", updated_at: "2024-08-30 09:00:00" },
  { id: 8, temporada_id: 5, user_id: 1, grupopequeno_id: 1, ciclo_id: 11, lider_id: 10, gpequenolider_id: 4, status: 2, horario: "Martes, 19:00 hrs a 20:00 hrs", created_at: "2022-05-05 09:00:00", updated_at: "2022-09-05 09:00:00" },
);
OLD_DB.asistencias.push(
  { id: 10, inscripcion_id: 7, semana_id: 30, status: 1 },
  { id: 11, inscripcion_id: 7, semana_id: 31, status: 1 },
  { id: 12, inscripcion_id: 7, semana_id: 32, status: 2 },
  { id: 13, inscripcion_id: 8, semana_id: 40, status: 1 },
  { id: 14, inscripcion_id: 8, semana_id: 41, status: 1 },
);
