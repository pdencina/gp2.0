import { describe, expect, it } from "vitest";
import { firstName, profileCheck, type ProfileData } from "./profile-check";
import { countryFromTimeZone, countryLabel, locationMismatch } from "./places";

const today = new Date("2026-10-10T12:00:00Z");
const full: ProfileData = {
  full_name: "Ana Pérez",
  phone: "+56912345678",
  gender: "mujer",
  country: "CL",
  city: "Santiago",
  birth_date: "1990-05-01",
  guardian_name: null,
  guardian_email: null,
  guardian_phone: null,
  terms_accepted_at: "2026-01-01T00:00:00Z",
  campus_id: "c1",
};

describe("profileCheck", () => {
  it("un perfil completo no tiene faltantes", () => {
    const r = profileCheck(full, { campusesExist: true, today });
    expect(r.missing).toEqual([]);
    expect(r.percent).toBe(100);
    expect(r.blocking).toBe(false);
    expect(r.minor).toBe(false);
  });

  it("sin perfil falta todo lo indispensable y se marca como bloqueante", () => {
    const r = profileCheck(null, { today });
    const keys = r.missing.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(["gender", "birth_date", "terms"]));
    expect(r.blocking).toBe(true);
    expect(r.missing.filter((m) => m.needed).map((m) => m.key).sort()).toEqual(["birth_date", "gender", "terms"]);
  });

  it("lo recomendado (teléfono, país, ciudad) falta sin bloquear la inscripción", () => {
    const r = profileCheck({ ...full, phone: null, city: "  " }, { today });
    expect(r.missing.map((m) => m.key).sort()).toEqual(["city", "phone"]);
    expect(r.blocking).toBe(false);
    expect(r.percent).toBeLessThan(100);
  });

  it("la sede solo cuenta si existen sedes", () => {
    const sinSede = { ...full, campus_id: null };
    expect(profileCheck(sinSede, { campusesExist: false, today }).missing).toEqual([]);
    expect(profileCheck(sinSede, { campusesExist: true, today }).missing.map((m) => m.key)).toEqual(["campus"]);
  });

  it("una persona menor de 18 debe tener los datos de su tutor", () => {
    const menor = { ...full, birth_date: "2012-03-10" };
    const r = profileCheck(menor, { campusesExist: true, today });
    expect(r.minor).toBe(true);
    expect(r.missing.map((m) => m.key).sort()).toEqual(["guardian_contact", "guardian_name"]);
    expect(r.blocking).toBe(true);
    // con el nombre y un teléfono del tutor queda completo
    const ok = profileCheck({ ...menor, guardian_name: "Marta", guardian_phone: "+56911111111" }, { campusesExist: true, today });
    expect(ok.missing).toEqual([]);
  });

  it("cumplir 18 hoy ya no exige tutor", () => {
    expect(profileCheck({ ...full, birth_date: "2008-10-10" }, { today }).minor).toBe(false);
    expect(profileCheck({ ...full, birth_date: "2008-10-11" }, { today }).minor).toBe(true);
  });

  it("el porcentaje cuenta solo los datos que aplican", () => {
    const r = profileCheck({ ...full, phone: null, city: null }, { campusesExist: false, today });
    expect(r.total).toBe(7);
    expect(r.percent).toBe(Math.round((5 / 7) * 100));
  });
});

describe("firstName", () => {
  it("toma el primer nombre", () => {
    expect(firstName("Pablo Encina")).toBe("Pablo");
    expect(firstName("  María  José Soto ")).toBe("María");
    expect(firstName("")).toBe("");
    expect(firstName(null)).toBe("");
  });
});

describe("ubicación por zona horaria", () => {
  it("reconoce los países de la plataforma", () => {
    expect(countryFromTimeZone("America/Santiago")).toBe("CL");
    expect(countryFromTimeZone("America/Argentina/Cordoba")).toBe("AR");
    expect(countryFromTimeZone("America/New_York")).toBe("US");
    expect(countryFromTimeZone("America/Indiana/Indianapolis")).toBe("US");
    expect(countryFromTimeZone("America/Mexico_City")).toBe("MX");
    expect(countryFromTimeZone("America/Sao_Paulo")).toBe("BR");
    expect(countryFromTimeZone("Europe/Madrid")).toBe("ES");
    expect(countryFromTimeZone("Asia/Tokyo")).toBeNull();
    expect(countryFromTimeZone(undefined)).toBeNull();
  });

  it("avisa solo si hay un país guardado y es distinto del detectado", () => {
    expect(locationMismatch("CL", "America/Caracas")).toBe("VE");
    expect(locationMismatch("cl", "America/Santiago")).toBeNull();
    expect(locationMismatch(null, "America/Caracas")).toBeNull(); // sin país guardado no hay con qué comparar
    expect(locationMismatch("CL", "Asia/Tokyo")).toBeNull(); // zona que no conocemos: no se molesta
  });

  it("nombra los países", () => {
    expect(countryLabel("VE")).toBe("Venezuela");
    expect(countryLabel("xx")).toBe("xx");
    expect(countryLabel(null)).toBe("");
  });
});
