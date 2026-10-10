import { describe, expect, it } from "vitest";
import { parseDates, summarizeSessions, weekdayName, type Session } from "./calendar";

const s = (over: Partial<Session>): Session => ({
  id: "x", held_on: "2026-03-03", season_week: 1, status: "planificada", slot_id: null, facilitator_id: null,
  cancel_reason: null, rescheduled_from: null, modality: null, ...over,
});

describe("summarizeSessions", () => {
  const list = [
    s({ id: "1", held_on: "2026-03-03", season_week: 1, status: "realizada", facilitator_id: "L" }),
    s({ id: "2", held_on: "2026-03-10", season_week: 2, status: "realizada", facilitator_id: "B" }),
    s({ id: "3", held_on: "2026-03-17", season_week: 3, status: "planificada" }), // atrasada
    s({ id: "4", held_on: "2026-03-24", season_week: 4, status: "cancelada" }),
    s({ id: "5", held_on: "2026-04-14", season_week: 5, status: "reprogramada" }), // futura
    s({ id: "6", held_on: "2026-03-14", season_week: null, status: "realizada" }), // extra, no cuenta en el calendario
  ];

  it("separa realizadas, atrasadas, canceladas y próximas", () => {
    const r = summarizeSessions(list, "2026-04-07", "B", "L");
    expect(r).toMatchObject({ planned: 3, done: 2, overdue: 1, cancelled: 1, upcoming: 1, withBackup: 1 });
    expect(r.next?.id).toBe("5");
  });

  it("una pendiente de hace menos de 8 días todavía no está atrasada", () => {
    const r = summarizeSessions([s({ held_on: "2026-04-01" })], "2026-04-08");
    expect(r.overdue).toBe(0);
    expect(summarizeSessions([s({ held_on: "2026-04-01" })], "2026-04-09").overdue).toBe(1);
  });
});

describe("parseDates", () => {
  it("acepta ISO y dd/mm/aaaa, sin repetir y ordenado", () => {
    expect(parseDates("2026-05-04, 29/06/2026\n2026-05-04").dates).toEqual(["2026-05-04", "2026-06-29"]);
  });
  it("informa lo que no entiende", () => {
    const r = parseDates("2026-02-30 hola 4/5/2026");
    expect(r.dates).toEqual(["2026-05-04"]);
    expect(r.invalid).toEqual(["2026-02-30", "hola"]);
  });
  it("vacío es válido", () => {
    expect(parseDates("  ")).toEqual({ dates: [], invalid: [] });
  });
});

describe("weekdayName", () => {
  it("nombra el día", () => {
    expect(weekdayName("2026-03-03")).toBe("martes");
  });
});
