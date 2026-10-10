import { describe, expect, it } from "vitest";
import { formatSize, isValidAudience, isValidKind, safeFileName } from "./materials";

describe("safeFileName", () => {
  it("quita tildes, espacios y símbolos y conserva la extensión", () => {
    expect(safeFileName("Libro Morado – Versión FINAL (2).PDF")).toBe("libro-morado-version-final-2.pdf");
  });
  it("no deja rutas ni puntos al inicio", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
  });
  it("nunca devuelve vacío", () => {
    expect(safeFileName("???")).toBe("archivo");
  });
});

describe("validaciones y formato", () => {
  it("reconoce tipos y públicos válidos", () => {
    expect(isValidKind("guia_lider")).toBe(true);
    expect(isValidKind("hack")).toBe(false);
    expect(isValidAudience("equipo")).toBe(true);
    expect(isValidAudience("todos")).toBe(false);
  });
  it("formatea el tamaño", () => {
    expect(formatSize(null)).toBe("");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(5.5 * 1024 * 1024)).toBe("5,5 MB");
  });
});
