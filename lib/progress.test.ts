import { describe, expect, it } from "vitest";
import { normalizeProgress, progressSummary } from "./progress";

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
