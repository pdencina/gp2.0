import { describe, expect, it } from "vitest";
import { filterGroups, normalizeProgress, progressSummary, type CompatibleGroup } from "./progress";

describe("normalizeProgress", () => {
  it("convierte textos numéricos y completa lo que falta", () => {
    const p = normalizeProgress({ units_total: "12" as unknown as number, units_done: 3, pct: "25.0" as unknown as number });
    expect(p).toMatchObject({ units_total: 12, units_done: 3, pct: 25, next_unit_title: null, stage_credits: 0 });
  });

  it("acepta una respuesta vacía", () => {
    expect(normalizeProgress(null)).toMatchObject({ units_total: 0, units_done: 0, pct: null });
  });
});

describe("progressSummary", () => {
  it("avisa cuando el programa no tiene unidades", () => {
    expect(progressSummary(normalizeProgress(null))).toMatch(/todavía no tiene unidades/);
  });
  it("cuenta unidades", () => {
    expect(progressSummary(normalizeProgress({ units_total: 36, units_done: 5 }))).toBe("5 de 36 unidades");
  });
});

describe("filterGroups", () => {
  const g = (id: string, modality: "presencial" | "virtual", campus: string | null, weekday: number | null): CompatibleGroup => ({
    group_id: id, name: id, modality, campus, weekday, start_time: null, end_time: null, capacity_left: 5, leader_name: null,
  });
  const list = [g("a", "presencial", "Puente Alto", 2), g("b", "virtual", "Virtual", 4), g("c", "virtual", "Virtual", 2)];
  it("sin filtros devuelve todo", () => {
    expect(filterGroups(list, {})).toHaveLength(3);
  });
  it("filtra por modalidad, sede y día, y combina", () => {
    expect(filterGroups(list, { modalidad: "virtual" }).map((x) => x.group_id)).toEqual(["b", "c"]);
    expect(filterGroups(list, { sede: "Puente Alto" }).map((x) => x.group_id)).toEqual(["a"]);
    expect(filterGroups(list, { dia: "2" }).map((x) => x.group_id)).toEqual(["a", "c"]);
    expect(filterGroups(list, { modalidad: "virtual", dia: "2" }).map((x) => x.group_id)).toEqual(["c"]);
    expect(filterGroups(list, { modalidad: "presencial", dia: "4" })).toEqual([]);
  });
});
