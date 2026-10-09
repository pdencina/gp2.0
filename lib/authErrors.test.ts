import { describe, expect, it } from "vitest";
import { authMessage, passwordProblem } from "./authErrors";

describe("passwordProblem", () => {
  it("exige 8 caracteres", () => {
    expect(passwordProblem("abc12")).not.toBeNull();
  });
  it("exige letras y números", () => {
    expect(passwordProblem("abcdefgh")).not.toBeNull();
    expect(passwordProblem("12345678")).not.toBeNull();
  });
  it("acepta una contraseña válida", () => {
    expect(passwordProblem("grupos2026")).toBeNull();
  });
});

describe("authMessage", () => {
  it("traduce credenciales inválidas", () => {
    expect(authMessage("Invalid login credentials")).toContain("incorrectos");
  });
  it("traduce el límite de intentos", () => {
    expect(authMessage("email rate limit exceeded")).toContain("Espera");
  });
  it("no filtra mensajes técnicos desconocidos", () => {
    expect(authMessage("pg_sleep violation 42P01")).toBe("Algo salió mal. Inténtalo de nuevo en unos minutos.");
  });
});
