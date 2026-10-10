import { describe, expect, it } from "vitest";
import {
  ageOn,
  audienceLabel,
  eligibilityError,
  groupOfferings,
  suggestOffering,
  type CatalogProgram,
} from "./programs";

const prog = (over: Partial<CatalogProgram>): CatalogProgram => ({
  id: over.name ?? "x",
  name: "X",
  description: null,
  audience: "todos",
  age_min: null,
  age_max: null,
  active: true,
  category: "formacion",
  kind: "curriculo",
  life_stage: null,
  duration_years: 1,
  certifiable: false,
  visibility: "publico",
  offering: null,
  ...over,
});

describe("suggestOffering con los nombres reales de la plataforma anterior", () => {
  it.each([
    ["BIBLIA CREATIVA 8 a 13 Años", "Biblia Creativa"],
    ["BIBLIA CREATIVA 14 a 17 Años", "Biblia Creativa"],
    ["BIBLIA CREATIVA", "Biblia Creativa"],
    ["FREEDOM SINGLE", "Freedom Single"],
    ["FREEDOM SINGLE HOMBRES", "Freedom Single"],
    ["FREEDOM SINGLE MUJER", "Freedom Single"],
    ["AR JÓVENES", "AR Jóvenes"],
    ["JÓVENES 17 a 23", "AR Jóvenes"],
    ["JÓVENES 24 a 29", "AR Jóvenes"],
    ["JÓVENES 17 a 29", "AR Jóvenes"],
    ["MAS ALLÁ DEL ÉXITO CHURCH", "Más Allá del Éxito"],
    ["MAS ALLÁ DEL ÉXITO SECULAR", "Más Allá del Éxito"],
    ["FÚTBOL", "AR Fútbol"],
    ["FÚTBOL PUNTA ARENAS", "AR Fútbol"],
    ["SENDERISMO MUJERES", "Senderismo"],
    ["SENDERISMO HOMBRES", "Senderismo"],
  ])("%s → %s", (name, offering) => {
    expect(suggestOffering(name).offering).toBe(offering);
  });

  it("deja solos los programas que no tienen variantes", () => {
    for (const n of ["LIBRO MORADO", "CREER", "HOMBRES", "MUJERES", "TEENS", "TWEENS", "TWEENS Y TEENS", "AR GOLD", "DINNER"]) {
      expect(suggestOffering(n).offering).toBe(n);
    }
  });

  it("marca como internos los programas de coordinación", () => {
    expect(suggestOffering("COORD GLOBAL").internal).toBe(true);
    expect(suggestOffering("PALABRAS DEL GENIO 17 a 29").internal).toBe(true);
    expect(suggestOffering("LIBRO MORADO").internal).toBe(false);
  });

  it("propone recreación para deporte y baile, y nada más", () => {
    expect(suggestOffering("RUNNING").category).toBe("recreacion");
    expect(suggestOffering("BAILE ENTRETENIDO MUJERES").category).toBe("recreacion");
    expect(suggestOffering("SALUD FINANCIERA").category).toBeUndefined();
  });
});

describe("groupOfferings", () => {
  it("agrupa variantes y oculta lo inactivo o privado", () => {
    const list = [
      prog({ name: "JÓVENES 17 a 23", offering: "AR Jóvenes" }),
      prog({ name: "JÓVENES 24 a 29", offering: "AR Jóvenes" }),
      prog({ name: "COORD GLOBAL", visibility: "privado" }),
      prog({ name: "VIEJO", active: false }),
      prog({ name: "RUNNING", category: "recreacion" }),
      prog({ name: "CREER" }),
    ];
    const o = groupOfferings(list);
    expect(o.map((x) => x.name)).toEqual(["AR Jóvenes", "CREER", "RUNNING"]);
    expect(o[0].programs).toHaveLength(2);
  });
});

describe("elegibilidad (espejo de la base de datos)", () => {
  const today = new Date("2026-10-09T12:00:00Z");
  const man = { gender: "hombre", birth_date: "1990-10-10" };

  it("calcula la edad con el cumpleaños", () => {
    expect(ageOn("1990-10-10", today)).toBe(35);
    expect(ageOn("1990-10-09", today)).toBe(36);
  });

  it("audiencia", () => {
    expect(eligibilityError(man, { audience: "hombres", age_min: null, age_max: null }, today)).toBeNull();
    expect(eligibilityError(man, { audience: "mujeres", age_min: null, age_max: null }, today)).toMatch(/perfil/);
    expect(eligibilityError({ gender: null, birth_date: null }, { audience: "hombres", age_min: null, age_max: null }, today)).toMatch(/género/);
    expect(eligibilityError(null, { audience: "todos", age_min: null, age_max: null }, today)).toBeNull();
  });

  it("edad", () => {
    expect(eligibilityError(man, { audience: "todos", age_min: 17, age_max: 29 }, today)).toMatch(/edad/);
    expect(eligibilityError(man, { audience: "todos", age_min: 30, age_max: 40 }, today)).toBeNull();
    expect(eligibilityError({ gender: "hombre", birth_date: null }, { audience: "todos", age_min: 17, age_max: 29 }, today)).toMatch(/nacimiento/);
  });
});

describe("audienceLabel", () => {
  it("describe público y edades", () => {
    expect(audienceLabel({ audience: "todos", age_min: 17, age_max: 29 })).toBe("Todos · 17 a 29 años");
    expect(audienceLabel({ audience: "mujeres", age_min: 15, age_max: 100 })).toBe("Mujeres · desde 15 años");
    expect(audienceLabel({ audience: "todos", age_min: 0, age_max: 100 })).toBe("Todos");
  });
});
