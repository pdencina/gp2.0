import { describe, expect, it } from "vitest";
import { parseDump } from "../lib/mysqldump";
import { inferPhone } from "../lib/countries";
import { parseHorario } from "../lib/schedule";
import { uuid5 } from "../lib/ids";
import { toDump } from "./fixture";

describe("lector de respaldos MySQL", () => {
  it("lee filas con comillas, saltos de línea, NULL y varios INSERT", () => {
    const sql = [
      "INSERT INTO `t` (`id`, `nombre`, `nota`) VALUES",
      "(1, 'O\\'Brien', 'línea1\\nlínea2'),",
      "(2, 'Ana ''la'' mejor', NULL),",
      "(3, 'a, (b); c', -4.5);",
      "INSERT INTO `t` (`id`, `nombre`, `nota`) VALUES (4, '', 0);",
    ].join("\n");
    const rows = parseDump(sql).t;
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ id: 1, nombre: "O'Brien", nota: "línea1\nlínea2" });
    expect(rows[1].nombre).toBe("Ana 'la' mejor");
    expect(rows[1].nota).toBeNull();
    expect(rows[2]).toEqual({ id: 3, nombre: "a, (b); c", nota: -4.5 });
    expect(rows[3]).toEqual({ id: 4, nombre: "", nota: 0 });
  });

  it("usa el orden del CREATE TABLE cuando el INSERT no trae columnas", () => {
    const dump = toDump({ personas: [{ id: 1, nombre: "Ana" }, { id: 2, nombre: "Luis" }] }, false);
    expect(parseDump(dump).personas).toEqual([{ id: "1", nombre: "Ana" }, { id: "2", nombre: "Luis" }].map((r) => ({ id: Number(r.id), nombre: r.nombre })));
  });

  it("avisa si una fila no calza con las columnas", () => {
    expect(() => parseDump("INSERT INTO `t` (`a`, `b`) VALUES (1);")).toThrow(/valores/);
  });
});

describe("teléfonos de distintos países", () => {
  it.each([
    ["912345678", "Chile", "+56912345678"],
    ["+56 9 1234 5678", "Chile", "+56912345678"],
    ["56948974384", "Chile", "+56948974384"],
    ["04146718293", "Venezuela", "+584146718293"],
    ["0424-6786468", "Venezuela", "+584246786468"],
    ["+584129153030", "Venezuela", "+584129153030"],
    ["8323685401", "Estados Unidos", "+18323685401"],
    ["(+505) 76758724", "Nicaragua", "+50576758724"],
    ["59895831251", null, "+59895831251"],
    ["0056912345678", "Chile", "+56912345678"],
  ])("%s (%s) -> %s", (raw, country, expected) => {
    expect(inferPhone(raw, country)).toBe(expected);
  });

  it.each([["12345", "Chile"], ["98137264", "Chile"], ["", "Chile"], ["abc", null]])("no inventa: %s", (raw, country) => {
    expect(inferPhone(raw, country)).toBeNull();
  });
});

describe("horarios", () => {
  it("entiende día y horas", () => {
    expect(parseHorario("Viernes, 08:00 hrs a 09:15 hrs")).toEqual({ weekday: 5, start: "08:00", end: "09:15" });
    expect(parseHorario("miércoles 7:30 a 9.00")).toEqual({ weekday: 3, start: "07:30", end: "09:00" });
  });
  it("tolera lo incompleto", () => {
    expect(parseHorario("Sábado")).toEqual({ weekday: 6, start: null, end: null });
    expect(parseHorario("20:30")).toEqual({ weekday: null, start: "20:30", end: null });
    expect(parseHorario("")).toBeNull();
    expect(parseHorario("por definir")).toBeNull();
  });
});

describe("identificadores estables", () => {
  it("el mismo nombre da siempre el mismo UUID", () => {
    expect(uuid5("group:1")).toBe(uuid5("group:1"));
    expect(uuid5("group:1")).not.toBe(uuid5("group:2"));
    expect(uuid5("group:1")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
