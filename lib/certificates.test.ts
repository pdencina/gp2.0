import { describe, expect, it } from "vitest";
import { canOpenCertificates, certificateTitle, cleanCode, formatCode, isValidCode, normalizeYear, routeSummary } from "./certificates";

const y = (n: number, met: boolean, is_current = false) => normalizeYear({ formative_year: n, items_total: 4, items_done: met ? 4 : 1, pct: met ? "100.0" : "25.0", min_pct: "100", met, is_current });

describe("códigos", () => {
  it("se muestran con guiones y se aceptan en cualquier forma", () => {
    expect(formatCode("A1B2C3D4E5F6")).toBe("A1B2-C3D4-E5F6");
    expect(cleanCode(" a1b2-c3d4-e5f6 ")).toBe("A1B2C3D4E5F6");
    expect(isValidCode("a1b2-c3d4-e5f6")).toBe(true);
    expect(isValidCode("zzzz-zzzz-zzzz")).toBe(false);
    expect(isValidCode("A1B2")).toBe(false);
  });
});

describe("normalizeYear", () => {
  it("convierte los decimales que llegan como texto", () => {
    expect(y(1, true)).toMatchObject({ formative_year: 1, pct: 100, min_pct: 100, met: true });
    expect(normalizeYear({ formative_year: 2, items_total: 0, pct: null }).pct).toBeNull();
  });
});

describe("routeSummary", () => {
  it("resume la ruta", () => {
    expect(routeSummary([y(1, true), y(2, false, true), y(3, false)])).toBe("Vas en el año 2 de 3; 1 etapa cumplida.");
    expect(routeSummary([y(1, true), y(2, true)])).toBe("Cumpliste todas las etapas.");
    expect(routeSummary([])).toBe("");
  });
});

describe("títulos y permisos de pantalla", () => {
  it("nombra el certificado", () => {
    expect(certificateTitle({ kind: "programa", formative_year: null }, "AR Hombres")).toBe("Programa completo · AR Hombres");
    expect(certificateTitle({ kind: "etapa", formative_year: 2 }, "AR Hombres")).toBe("AR Hombres · Año 2");
  });
  it("abre la pantalla el administrador, el coordinador o un pastor de sede", () => {
    expect(canOpenCertificates("admin", false)).toBe(true);
    expect(canOpenCertificates("coordinador", false)).toBe(true);
    expect(canOpenCertificates("lider", true)).toBe(true);
    expect(canOpenCertificates("lider", false)).toBe(false);
  });
});
