"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { finish, intOrNull, orNull, text } from "@/lib/action-helpers";
import { suggestOffering } from "@/lib/programs";

// ---------- Inscripción al programa (sin elegir grupo todavía) ----------
export async function inscribirmeAlPrograma(fd: FormData) {
  const { data, error } = await (await createClient()).rpc("enroll_curriculum", { cid: text(fd, "curriculum_id") });
  if (error) finish("/catalogo", error.message);
  revalidatePath("/mi-progreso");
  redirect(`/mi-progreso/${data as string}?ok=1`);
}

export async function cambiarGrupo(fd: FormData) {
  const ce = text(fd, "ce");
  const path = `/mi-progreso/${ce}`;
  const { error } = await (await createClient()).rpc("change_group", { ce, new_gid: text(fd, "group_id") });
  revalidatePath("/mi-progreso");
  revalidatePath("/inicio");
  finish(path, error?.message);
}

export async function pausarInscripcion(fd: FormData) {
  const ce = text(fd, "ce");
  const { error } = await (await createClient()).rpc("pause_curriculum_enrollment", {
    ce,
    reason: orNull(text(fd, "reason")),
  });
  revalidatePath("/mi-progreso");
  revalidatePath("/inicio");
  finish(`/mi-progreso/${ce}`, error?.message);
}

export async function reanudarInscripcion(fd: FormData) {
  const ce = text(fd, "ce");
  const { error } = await (await createClient()).rpc("resume_curriculum_enrollment", { ce });
  revalidatePath("/mi-progreso");
  finish(`/mi-progreso/${ce}`, error?.message);
}

export async function pedirRecuperacion(fd: FormData) {
  const ce = text(fd, "ce");
  const { error } = await (await createClient()).rpc("request_catchup", { ce, note: orNull(text(fd, "note")) });
  finish(`/mi-progreso/${ce}`, error?.message);
}

// ---------- Clasificación del catálogo (administrador) ----------
const CATEGORIES = ["comunidad", "formacion", "experiencia", "recreacion"];
const KINDS = ["curriculo", "taller", "comunidad", "actividad"];

export async function clasificarPrograma(fd: FormData) {
  const category = text(fd, "category");
  const kind = text(fd, "kind");
  if (!CATEGORIES.includes(category) || !KINDS.includes(kind)) finish("/curriculums/clasificar", "Elige una categoría y un tipo válidos.");
  const years = intOrNull(text(fd, "duration_years")) ?? 1;
  const { error } = await (await createClient())
    .from("curriculums")
    .update({
      category,
      kind,
      life_stage: orNull(text(fd, "life_stage")),
      duration_years: Math.min(10, Math.max(1, years)),
      certifiable: text(fd, "certifiable") === "on",
      visibility: text(fd, "visibility") === "privado" ? "privado" : "publico",
      offering: orNull(text(fd, "offering")),
    })
    .eq("id", text(fd, "id"));
  revalidatePath("/catalogo");
  finish("/curriculums/clasificar", error?.message);
}

// Aplica la propuesta de agrupación solo a los programas que todavía no tienen oferta asignada.
export async function aplicarSugerencias() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("curriculums").select("id, name, offering, category, kind");
  if (error) finish("/curriculums/clasificar", error.message);

  let changed = 0;
  for (const c of (data ?? []) as { id: string; name: string; offering: string | null; category: string; kind: string }[]) {
    if (c.offering) continue;
    const s = suggestOffering(c.name);
    const patch: Record<string, string> = {};
    if (s.offering !== c.name) patch.offering = s.offering;
    if (s.category && c.category === "formacion") {
      patch.category = s.category;
      patch.kind = "actividad";
    }
    if (s.internal) patch.visibility = "privado";
    if (Object.keys(patch).length === 0) continue;
    const { error: e } = await supabase.from("curriculums").update(patch).eq("id", c.id);
    if (e) finish("/curriculums/clasificar", e.message);
    changed += 1;
  }
  revalidatePath("/catalogo");
  redirect(`/curriculums/clasificar?ok=1&n=${changed}`);
}
