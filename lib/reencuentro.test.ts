import { describe, expect, it } from "vitest";
import { awayLabel, contactNumber, outreachMessage, progressLine, whatsappFor, type AwayRow } from "./reencuentro";

const base = {
  person_name: "Ana María Pérez",
  curriculum: "AR Mujeres",
  is_minor: false,
  phone: "+56912345678",
  guardian_phone: null as string | null,
};

describe("awayLabel", () => {
  it("dice el tiempo en palabras", () => {
    expect(awayLabel(0)).toBe("Menos de un mes");
    expect(awayLabel(1)).toBe("Hace 1 mes");
    expect(awayLabel(8)).toBe("Hace 8 meses");
    expect(awayLabel(12)).toBe("Hace 1 año");
    expect(awayLabel(14)).toBe("Hace 1 año y 2 meses");
    expect(awayLabel(24)).toBe("Hace 2 años");
    expect(awayLabel(37)).toBe("Hace 3 años y 1 mes");
  });
});

describe("progressLine", () => {
  it("prefiere las unidades acreditadas", () => {
    expect(progressLine({ units_done: 5, units_total: 36, modules_done: 2, modules_total: 11 })).toBe("5 de 36 unidades acreditadas");
  });
  it("si no hay, cuenta los módulos aprobados en la plataforma anterior", () => {
    expect(progressLine({ units_done: 0, units_total: 36, modules_done: 3, modules_total: 11 })).toBe("3 de 11 módulos aprobados (plataforma anterior)");
    expect(progressLine({ units_done: 0, units_total: 0, modules_done: 1, modules_total: 1 })).toBe("1 de 1 módulo aprobado (plataforma anterior)");
  });
  it("sin nada acreditado lo dice sin dramatizar", () => {
    expect(progressLine({ units_done: 0, units_total: 36, modules_done: 0, modules_total: 11 })).toBe("Sin avance acreditado todavía");
  });
});

describe("a quién se escribe", () => {
  it("a la propia persona si es adulta", () => {
    expect(contactNumber(base)).toEqual({ phone: "+56912345678", toGuardian: false });
  });
  it("a su tutor si es menor y hay teléfono del tutor", () => {
    expect(contactNumber({ ...base, is_minor: true, guardian_phone: "+56998765432" })).toEqual({ phone: "+56998765432", toGuardian: true });
  });
  it("si es menor y no hay teléfono del tutor, usa el suyo", () => {
    expect(contactNumber({ ...base, is_minor: true })).toEqual({ phone: "+56912345678", toGuardian: false });
  });
  it("sin teléfono no hay a quién escribir", () => {
    expect(contactNumber({ ...base, phone: null })).toEqual({ phone: null, toGuardian: false });
  });
});

describe("mensaje de WhatsApp", () => {
  it("es cálido, nombra el programa y recuerda que el avance se conserva", () => {
    const m = outreachMessage(base, "Pablo Encina");
    expect(m).toContain("Hola Ana");
    expect(m).toContain("Soy Pablo de Grupos Pequeños");
    expect(m).toContain("AR Mujeres");
    expect(m).toContain("avance sigue guardado");
    expect(m).not.toMatch(/abandon|dejaste|faltaste|reprob/i);
  });
  it("a un tutor le escribe en tercera persona", () => {
    const m = outreachMessage({ ...base, is_minor: true, guardian_phone: "+56998765432" }, "Pablo");
    expect(m).toContain("Le escribo por Ana");
    expect(m).toContain("puede retomarlo");
  });
  it("arma el enlace de WhatsApp con el mensaje codificado, o nada si no hay teléfono", () => {
    const row = { ...base, last_activity: "2026-01-01" } as unknown as AwayRow;
    const url = whatsappFor(row, "Pablo")!;
    expect(url.startsWith("https://wa.me/56912345678?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1])).toContain("Hola Ana");
    expect(whatsappFor({ ...row, phone: null }, "Pablo")).toBeNull();
  });
});
