import { describe, expect, it } from "vitest";
import { availableSteps, hasErrors, isEditable, isLegacy } from "./versions";

const none = { isAdmin: false, isCoordinator: false, isReviewer: false };

describe("isEditable (espejo de la base de datos)", () => {
  it("se edita mientras se prepara", () => {
    expect(isEditable({ status: "cargado", content_frozen: false })).toBe(true);
    expect(isEditable({ status: "en_adaptacion", content_frozen: false })).toBe(true);
  });
  it("no se edita en revisión, aprobada, archivada ni congelada", () => {
    for (const status of ["en_revision_pastoral", "aprobado", "archivado"] as const) {
      expect(isEditable({ status, content_frozen: false })).toBe(false);
    }
    expect(isEditable({ status: "publicado", content_frozen: true })).toBe(false);
  });
  it("la versión heredada publicada sin congelar sigue editable y se reconoce", () => {
    const v = { status: "publicado", content_frozen: false } as const;
    expect(isEditable(v)).toBe(true);
    expect(isLegacy(v)).toBe(true);
    expect(isLegacy({ status: "publicado", content_frozen: true })).toBe(false);
  });
});

describe("availableSteps", () => {
  it("el coordinador prepara y envía, pero no aprueba", () => {
    const c = { ...none, isCoordinator: true };
    expect(availableSteps("cargado", c).map((s) => s.to)).toEqual(["en_adaptacion"]);
    expect(availableSteps("en_adaptacion", c).map((s) => s.to)).toEqual(["en_revision_pastoral"]);
    expect(availableSteps("en_revision_pastoral", c)).toEqual([]);
    expect(availableSteps("aprobado", c)).toEqual([]);
  });

  it("el revisor aprueba, devuelve con nota y publica", () => {
    const r = { ...none, isReviewer: true };
    const review = availableSteps("en_revision_pastoral", r);
    expect(review.map((s) => s.to)).toEqual(["aprobado", "en_adaptacion"]);
    expect(review.find((s) => s.to === "en_adaptacion")?.needsNote).toBe(true);
    expect(availableSteps("aprobado", r).map((s) => s.to)).toEqual(["publicado", "en_adaptacion"]);
  });

  it("solo el administrador archiva; nadie sin rol hace nada", () => {
    expect(availableSteps("publicado", { ...none, isAdmin: true }).map((s) => s.to)).toEqual(["archivado"]);
    expect(availableSteps("publicado", { ...none, isReviewer: true })).toEqual([]);
    for (const s of ["cargado", "en_adaptacion", "en_revision_pastoral", "aprobado", "publicado", "archivado"] as const) {
      expect(availableSteps(s, none)).toEqual([]);
    }
  });
});

describe("hasErrors", () => {
  it("distingue errores de avisos", () => {
    expect(hasErrors([{ level: "aviso", code: "x", detail: "" }])).toBe(false);
    expect(hasErrors([{ level: "error", code: "x", detail: "" }])).toBe(true);
  });
});
