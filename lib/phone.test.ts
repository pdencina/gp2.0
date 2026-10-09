import { describe, expect, it } from "vitest";
import { normalizePhone, whatsappLink } from "./phone";

describe("normalizePhone", () => {
  it("normaliza un número internacional con espacios", () => {
    expect(normalizePhone("+56 9 1234 5678")).toBe("+56912345678");
  });
  it("asume Chile para un celular de 9 dígitos", () => {
    expect(normalizePhone("9 1234 5678")).toBe("+56912345678");
  });
  it("convierte el prefijo 00 en +", () => {
    expect(normalizePhone("0056912345678")).toBe("+56912345678");
  });
  it("rechaza números sin código de país o muy cortos", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("22345678")).toBeNull();
    expect(normalizePhone("+123")).toBeNull();
  });
  it("devuelve null si está vacío", () => {
    expect(normalizePhone("   ")).toBeNull();
  });
});

describe("whatsappLink", () => {
  it("arma el enlace sin el +", () => {
    expect(whatsappLink("+56912345678")).toBe("https://wa.me/56912345678");
  });
  it("codifica el mensaje", () => {
    expect(whatsappLink("+56912345678", "Hola, ¿cómo estás?")).toContain("text=Hola%2C%20");
  });
});
