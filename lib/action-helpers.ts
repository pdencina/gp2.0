import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Ayudas compartidas por las acciones del servidor (app/actions/*).

export const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
export const orNull = (v: string) => (v === "" ? null : v);
export const intOrNull = (v: string) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

export function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("row-level security")) return "No tienes permiso para hacer este cambio.";
  if (m.includes("ce_one_open")) return "Ya tienes una inscripción abierta en este programa.";
  if (m.includes("enrollments_one_active")) return "Ya estás inscrito en este currículum en esta temporada.";
  if (m.includes("lessons_cycle_id_number_key")) return "Ya existe una lección con ese número en este ciclo.";
  if (m.includes("cycles_curriculum_id_number_key")) return "Ya existe un ciclo con ese número en este currículum.";
  if (m.includes("seasons_name_key")) return "Ya existe una temporada con ese nombre.";
  if (m.includes("curriculums_name_key")) return "Ya existe un currículum con ese nombre.";
  if (m.includes("enrollments_person_id_group_id_key")) return "Esa persona ya estuvo inscrita en este grupo.";
  if (m.includes("duplicate key")) return "Ese registro ya existe.";
  if (m.includes("violates check constraint")) return "Algún dato no tiene un formato válido. Revísalo e inténtalo de nuevo.";
  return message;
}

export function finish(path: string, error?: string): never {
  revalidatePath(path);
  redirect(error ? `${path}?error=${encodeURIComponent(friendly(error))}` : `${path}?ok=1`);
}

// Solo rutas internas, para no redirigir a otros sitios.
export function backTo(fd: FormData, fallback: string) {
  const b = text(fd, "back");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
}
