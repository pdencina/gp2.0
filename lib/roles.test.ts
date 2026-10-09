import { describe, expect, it } from "vitest";
import { canPromote } from "./roles";

describe("escalera de ascenso", () => {
  it("el monitor promueve alumnos a líder", () => {
    expect(canPromote("monitor", "alumno")).toBe("lider");
  });
  it("el coordinador promueve líderes a monitor", () => {
    expect(canPromote("coordinador", "lider")).toBe("monitor");
  });
  it("solo el administrador promueve monitores a coordinador", () => {
    expect(canPromote("admin", "monitor")).toBe("coordinador");
    expect(canPromote("coordinador", "monitor")).toBeNull();
  });
  it("un rol no puede promover a su mismo nivel ni más arriba", () => {
    expect(canPromote("lider", "alumno")).toBeNull();
    expect(canPromote("monitor", "lider")).toBeNull();
  });
  it("no hay ascenso más allá de coordinador", () => {
    expect(canPromote("admin", "coordinador")).toBeNull();
    expect(canPromote("admin", "admin")).toBeNull();
  });
});
