import { describe, expect, it } from "vitest";
import { campusHeadline, fmtNum, groupByArea, summarize, type ReconRow } from "./habilitacion";

const row = (estado: ReconRow["estado"], area = "Modelo"): ReconRow => ({ area, chequeo: "x", esperado: 0, actual: 0, estado, detalle: "" });

describe("summarize", () => {
  it("cuenta por estado y dice si todo está limpio", () => {
    expect(summarize([row("ok"), row("ok"), row("info")])).toMatchObject({ ok: 2, info: 1, clean: true });
    expect(summarize([row("ok"), row("revisar")]).clean).toBe(false);
    expect(summarize([row("error")]).clean).toBe(false);
    expect(summarize([])).toMatchObject({ ok: 0, clean: true });
  });
});

describe("groupByArea", () => {
  it("agrupa conservando el orden de aparición", () => {
    const g = groupByArea([row("ok", "B"), row("ok", "A"), row("ok", "B")]);
    expect(g.map(([a, rows]) => [a, rows.length])).toEqual([["B", 2], ["A", 1]]);
  });
});

describe("fmtNum", () => {
  it("formatea cifras que llegan como número o texto", () => {
    expect(fmtNum(12713)).toBe((12713).toLocaleString("es-CL"));
    expect(fmtNum("340104")).toBe((340104).toLocaleString("es-CL"));
    expect(fmtNum(null)).toBe("—");
  });
});

describe("campusHeadline", () => {
  const base = { listo: false, pendientes: [] as string[], grupos_activos: 3, campus_id: "x" as string | null };
  it("explica el estado de la sede", () => {
    expect(campusHeadline({ ...base, listo: true })).toBe("Lista para habilitarse.");
    expect(campusHeadline({ ...base, pendientes: ["2 grupos sin líder", "No hay un pastor designado en la sede"] })).toBe(
      "Falta: 2 grupos sin líder; No hay un pastor designado en la sede.",
    );
    expect(campusHeadline({ ...base, grupos_activos: 0 })).toBe("Todavía no tiene grupos activos.");
    expect(campusHeadline({ ...base, campus_id: null })).toContain("sin sede");
  });
});
