// Lee un respaldo de MySQL (formato phpMyAdmin o mysqldump) y lo convierte en tablas de filas.

export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type Tables = Record<string, Row[]>;

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", "0": "\0", b: "\b", Z: "\x1a" };

/** Devuelve el texto de la cadena que empieza en la comilla `start` y la posición siguiente. */
function readString(sql: string, start: number): [string, number] {
  let i = start + 1;
  let out = "";
  let from = i;
  for (;;) {
    const c = sql[i];
    if (c === undefined) throw new Error("Cadena sin cerrar en el respaldo");
    if (c === "\\") {
      out += sql.slice(from, i);
      const next = sql[i + 1];
      out += ESCAPES[next] ?? next;
      i += 2;
      from = i;
    } else if (c === "'") {
      if (sql[i + 1] === "'") {
        out += sql.slice(from, i) + "'";
        i += 2;
        from = i;
      } else {
        out += sql.slice(from, i);
        return [out, i + 1];
      }
    } else {
      i++;
    }
  }
}

function readValue(sql: string, i: number): [Cell, number] {
  const c = sql[i];
  if (c === "'") return readString(sql, i);
  let j = i;
  while (j < sql.length && sql[j] !== "," && sql[j] !== ")") j++;
  const token = sql.slice(i, j).trim();
  if (token.toUpperCase() === "NULL") return [null, j];
  const n = Number(token);
  return [Number.isNaN(n) ? token : n, j];
}

export function parseDump(sql: string): Tables {
  const tables: Tables = {};
  const columnsOf: Record<string, string[]> = {};

  // Orden de columnas según CREATE TABLE (para respaldos sin lista de columnas en los INSERT)
  for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?`([^`]+)` \(([\s\S]*?)\n\)[^;]*;/g)) {
    const cols: string[] = [];
    for (const line of m[2].split("\n")) {
      const c = line.match(/^\s*`([^`]+)`\s/);
      if (c) cols.push(c[1]);
    }
    columnsOf[m[1]] = cols;
  }

  const insertRe = /INSERT (?:IGNORE )?INTO `([^`]+)`(?: \(([^)]*)\))? VALUES\s*/g;
  let m: RegExpExecArray | null;
  while ((m = insertRe.exec(sql))) {
    const table = m[1];
    const cols = m[2]
      ? m[2].split(",").map((s) => s.trim().replace(/^`|`$/g, ""))
      : columnsOf[table];
    if (!cols) throw new Error(`No se conocen las columnas de la tabla ${table}`);
    const rows = (tables[table] ??= []);

    let i = insertRe.lastIndex;
    for (;;) {
      while (/\s|,/.test(sql[i] ?? "")) i++;
      if (sql[i] === ";" || i >= sql.length) break;
      if (sql[i] !== "(") throw new Error(`Se esperaba "(" en ${table}, posición ${i}`);
      i++;
      const values: Cell[] = [];
      for (;;) {
        while (/\s/.test(sql[i] ?? "")) i++;
        const [v, next] = readValue(sql, i);
        values.push(v);
        i = next;
        while (/\s/.test(sql[i] ?? "")) i++;
        if (sql[i] === ",") {
          i++;
          continue;
        }
        if (sql[i] === ")") {
          i++;
          break;
        }
        throw new Error(`Valor mal formado en ${table}, posición ${i}`);
      }
      if (values.length !== cols.length) {
        throw new Error(`La fila de ${table} trae ${values.length} valores y se esperaban ${cols.length}`);
      }
      const row: Row = {};
      cols.forEach((col, k) => (row[col] = values[k]));
      rows.push(row);
    }
    insertRe.lastIndex = i;
  }
  return tables;
}
