import { describe, expect, it } from "vitest";
import { parseDump } from "../lib/mysqldump";
import { summarize, transform } from "../lib/transform";
import { H_MONITOR, OLD_DB, toDump } from "./fixture";

const today = new Date("2026-10-09T00:00:00Z");
const plan = transform(parseDump(toDump(OLD_DB)), today);
const person = (email: string) => plan.persons.find((p) => p.email === email)!;
const issues = (code: string) => plan.issues.filter((i) => i.code === code);

describe("personas", () => {
  it("unifica a la misma persona de varias tablas por correo y descarta correos inválidos", () => {
    expect(plan.persons.map((p) => p.email).sort()).toEqual(
      ["admin@x.cl", "ana@x.cl", "coord@x.cl", "lider2@x.cl", "luis@x.cl", "viejo@x.cl"]
    );
    expect(issues("correo_invalido")).toHaveLength(1);
  });

  it("toma el rol más alto y la contraseña de ese rol, convertida a $2a$", () => {
    const ana = person("ana@x.cl");
    expect(ana.role).toBe("monitor");
    expect(ana.passwordHash).toBe(H_MONITOR.replace("$2y$", "$2a$"));
    expect(issues("contrasenas_distintas")).toHaveLength(1);
  });

  it("reconstruye el historial de roles con las fechas de cada tabla", () => {
    const h = plan.roleHistory.filter((x) => x.email === "ana@x.cl");
    expect(h.map((x) => [x.fromRole, x.toRole])).toEqual([[null, "alumno"], ["alumno", "lider"], ["lider", "monitor"]]);
    expect(h.map((x) => x.at)).toEqual(["2021-03-01T10:00:00Z", "2022-01-01T10:00:00Z", "2023-01-01T10:00:00Z"]);
  });

  it("normaliza nombre, género, país y teléfono", () => {
    const ana = person("ana@x.cl");
    expect(ana).toMatchObject({ fullName: "Ana Pérez", gender: "mujer", country: "CL", phone: "+56912345678", birthDate: "1990-05-01" });
    const luis = person("luis@x.cl");
    expect(luis).toMatchObject({ fullName: "Luis Gómez", country: "VE", phone: "+584146718293", gender: "hombre", acceptsComms: false });
    expect(luis.termsAcceptedAt).toBeNull();
    expect(person("lider2@x.cl").phone).toBe("+56988887777");
  });

  it("conserva los términos aceptados", () => {
    expect(person("ana@x.cl")).toMatchObject({ termsAcceptedAt: "2026-04-01T10:00:00Z", termsVersion: "v1" });
  });

  it("una persona solo con un rol inactivo queda inactiva como alumno, y sin contraseña válida se avisa", () => {
    const viejo = person("viejo@x.cl");
    expect(viejo).toMatchObject({ role: "alumno" });
    expect(viejo.passwordHash).toBeNull();
    expect(issues("sin_contrasena_valida").length).toBeGreaterThan(0);
    expect(issues("telefono_no_resuelto").length).toBeGreaterThan(0);
  });

  it("el administrador y el coordinador activo conservan su rol", () => {
    expect(person("admin@x.cl").role).toBe("admin");
    expect(person("coord@x.cl").role).toBe("coordinador");
  });
});

describe("estructura del programa", () => {
  it("currículums: audiencia, edades y los internos quedan inactivos", () => {
    const h = plan.curriculums.find((c) => c.name === "HOMBRES")!;
    expect(h).toMatchObject({ audience: "hombres", ageMin: 18, ageMax: null, active: true });
    expect(plan.curriculums.find((c) => c.name === "COORD GLOBAL")!.active).toBe(false);
  });

  it("solo los coordinadores activos quedan asignados", () => {
    expect(plan.coordinators).toHaveLength(1);
    expect(plan.coordinators[0].email).toBe("coord@x.cl");
  });

  it("temporadas: nombres legibles, fechas invertidas corregidas y estado", () => {
    expect(plan.seasons.map((s) => s.name).sort()).toEqual(["2023 · T2", "2025 · T1", "2026"]);
    const fixed = plan.seasons.find((s) => s.name === "2023 · T2")!;
    expect(fixed.startDate < fixed.endDate).toBe(true);
    expect(plan.seasons.find((s) => s.name === "2026")!.status).toBe("en_curso");
    expect(plan.seasons.find((s) => s.name === "2025 · T1")!.status).toBe("cerrada");
    expect(issues("temporada_fechas_invertidas")).toHaveLength(1);
  });

  it("ciclos: se quita el duplicado y se enlaza el ciclo previo", () => {
    expect(plan.cycles).toHaveLength(2);
    expect(issues("ciclo_duplicado")).toHaveLength(1);
    const c2 = plan.cycles.find((c) => c.number === 2)!;
    const c1 = plan.cycles.find((c) => c.number === 1)!;
    expect(c2.prerequisiteId).toBe(c1.id);
  });

  it("grupos: horario separado en campos, modalidad, dirección y estado", () => {
    expect(plan.groups).toHaveLength(2);
    const g1 = plan.groups.find((g) => g.status === "en_curso")!;
    expect(g1).toMatchObject({ weekday: 5, startTime: "20:30", endTime: "22:00", modality: "virtual", leaderEmail: "ana@x.cl", monitorEmail: "ana@x.cl" });
    const g2 = plan.groups.find((g) => g.status === "finalizado")!;
    expect(g2).toMatchObject({ weekday: 2, modality: "presencial", address: "Calle 1, Santiago" });
  });

  it("recursos: solo enlaces seguros y sin huérfanos", () => {
    expect(plan.resources).toHaveLength(1);
    expect(plan.resources[0]).toMatchObject({ readUrl: "https://docs.example/1", editUrl: null });
    expect(issues("recurso_enlace_no_seguro")).toHaveLength(1);
    expect(issues("recurso_sin_ciclo")).toHaveLength(1);
  });
});

describe("inscripciones", () => {
  const status = (email: string, season: string) => {
    const g = plan.groups.filter((x) => plan.seasons.find((s) => s.id === x.seasonId)!.name === season).map((x) => x.id);
    return plan.enrollments.filter((e) => e.email === email && g.includes(e.groupId)).map((e) => e.status);
  };

  it("traduce los estados antiguos", () => {
    expect(status("ana@x.cl", "2026")).toEqual(["en_curso"]);
    expect(status("luis@x.cl", "2025 · T1")).toEqual(["aprobado"]);
    expect(status("ana@x.cl", "2025 · T1")).toEqual(["no_completo"]);
  });

  it("la inscripción sin horario se asigna al grupo que coincide", () => {
    const old = plan.enrollments.find((e) => e.email === "ana@x.cl" && e.status === "no_completo")!;
    const group = plan.groups.find((g) => g.id === old.groupId)!;
    expect(group.status).toBe("finalizado");
    expect(issues("inscripcion_sin_horario")).toHaveLength(0);
  });

  it("una persona repetida en el mismo grupo conserva la más reciente", () => {
    expect(status("luis@x.cl", "2026")).toEqual(["preinscrito"]);
    expect(issues("inscripcion_duplicada").length).toBeGreaterThan(0);
  });

  it("descarta las inscripciones de personas que no existen", () => {
    expect(issues("inscripcion_sin_persona")).toHaveLength(1);
  });
});

describe("asistencia", () => {
  const groupByStatus = (st: string) => plan.groups.find((g) => g.status === st)!;

  it("el modelo actual (Semana N) crea reuniones solo en las semanas con marcas", () => {
    const g = groupByStatus("en_curso");
    const ms = plan.meetings.filter((m) => m.groupId === g.id).sort((a, b) => a.lessonNumber - b.lessonNumber);
    expect(ms.map((m) => m.lessonNumber)).toEqual([1, 2]); // la semana 3 no tiene marcas
    // lunes de la semana + viernes
    expect(ms.map((m) => m.heldOn)).toEqual(["2026-04-17", "2026-04-24"]);
    const ana = plan.enrollments.find((e) => e.email === "ana@x.cl" && e.groupId === g.id)!;
    const marks = plan.attendance.filter((a) => a.enrollmentId === ana.id).map((a) => a.status).sort();
    expect(marks).toEqual(["ausente", "presente"]);
  });

  it("el modelo histórico (asistencias + semanas) se traduce con las fechas del calendario", () => {
    const g = groupByStatus("finalizado");
    const ms = plan.meetings.filter((m) => m.groupId === g.id).sort((a, b) => a.lessonNumber - b.lessonNumber);
    expect(ms.map((m) => m.heldOn)).toEqual(["2025-02-04", "2025-02-11", "2025-02-18"]); // martes
    const luis = plan.enrollments.find((e) => e.email === "luis@x.cl" && e.groupId === g.id)!;
    expect(plan.attendance.filter((a) => a.enrollmentId === luis.id).map((a) => a.status)).toEqual(["presente", "ausente", "presente"]);
  });
});

describe("informe", () => {
  it("resume sin incluir datos personales", () => {
    const s = summarize(plan);
    expect(s.personas).toBe(6);
    expect(s.personasPorRol).toMatchObject({ monitor: 1, admin: 1, coordinador: 1, lider: 1, alumno: 2 });
    const text = JSON.stringify(s) + JSON.stringify(plan.issues);
    expect(text).not.toContain("@x.cl");
    expect(text).not.toContain("Ana");
  });
});
