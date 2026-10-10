import { describe, expect, it } from "vitest";
import { inZone, scheduleLabel, timezoneLabel } from "./format";

describe("inZone", () => {
  it("una misma zona no cambia la hora", () => {
    expect(inZone("19:00", "America/Santiago", "America/Santiago")).toBe("19:00");
  });

  it("convierte entre zonas respetando el horario de verano de cada una", () => {
    // En julio Chile está en invierno (UTC-4) y Nueva York en verano (UTC-4): misma hora
    expect(inZone("19:00", "America/Santiago", "America/New_York", new Date("2026-07-15T12:00:00Z"))).toBe("19:00");
    // En enero Chile está en verano (UTC-3) y Nueva York en invierno (UTC-5): dos horas menos
    expect(inZone("19:00", "America/Santiago", "America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe("17:00");
    // Venezuela no cambia de hora (UTC-4)
    expect(inZone("20:30", "America/Santiago", "America/Caracas", new Date("2026-01-15T12:00:00Z"))).toBe("19:30");
  });

  it("cruza la medianoche sin errores", () => {
    expect(inZone("23:30", "America/Santiago", "Europe/Madrid", new Date("2026-01-15T12:00:00Z"))).toBe("03:30");
  });

  it("deja pasar una hora vacía", () => {
    expect(inZone("", "America/Santiago", "America/Lima")).toBe("");
  });
});

describe("timezoneLabel y scheduleLabel", () => {
  it("nombra las zonas conocidas y devuelve el código de las demás", () => {
    expect(timezoneLabel("America/Montevideo")).toBe("Uruguay");
    expect(timezoneLabel("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(timezoneLabel(null)).toBe("");
  });
  it("describe el horario", () => {
    expect(scheduleLabel({ weekday: 2, start_time: "19:00:00", end_time: "20:30:00", modality: "virtual" })).toBe("Martes 19:00–20:30 · Virtual");
  });
});
