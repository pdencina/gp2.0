import { createHash } from "node:crypto";

// Identificadores estables: la misma fila antigua siempre produce el mismo UUID,
// así la importación se puede repetir sin duplicar datos.
const NAMESPACE = createHash("sha1").update("gp2.arministriesgp.com/migracion").digest().subarray(0, 16);

export function uuid5(name: string): string {
  const h = createHash("sha1").update(NAMESPACE).update(name).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// ---- fechas (siempre en UTC, como texto AAAA-MM-DD) ----
export const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
/** Lunes de la semana que contiene la fecha. */
export function mondayOf(d: Date): Date {
  const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return addDays(d, 1 - wd);
}

/** Día de la semana ISO: lunes = 1 … domingo = 7. */
export const isoWeekday = (d: Date) => (d.getUTCDay() === 0 ? 7 : d.getUTCDay());

/** Primer día entre `from` y los 6 siguientes que cae en el día de la semana pedido. */
export function dayInWeek(from: Date, weekday: number | null): Date {
  if (!weekday) return from;
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (isoWeekday(d) === weekday) return d;
  }
  return from;
}
