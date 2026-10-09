import { norm } from "./countries";

const DAYS: Record<string, number> = {
  lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7,
};

export type Schedule = { weekday: number | null; start: string | null; end: string | null };

const hhmm = (h: string, m: string) => `${h.padStart(2, "0")}:${m}`;

/** Interpreta textos como "Viernes, 08:00 hrs a 09:15 hrs". Devuelve null si no entiende nada. */
export function parseHorario(text: string | null | undefined): Schedule | null {
  if (!text) return null;
  const t = norm(String(text));
  const day = Object.keys(DAYS).find((d) => t.includes(d));
  const times = Array.from(t.matchAll(/(\d{1,2})[:.](\d{2})/g)).map((m) => hhmm(m[1], m[2]));
  if (!day && times.length === 0) return null;

  const start = times[0] ?? null;
  const end = times[1] && start && times[1] > start ? times[1] : null;
  return { weekday: day ? DAYS[day] : null, start, end };
}
