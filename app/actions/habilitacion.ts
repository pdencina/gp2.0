"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendly, orNull, text } from "@/lib/action-helpers";

export async function cambiarEtapaSede(fd: FormData) {
  const stage = text(fd, "stage");
  const { error } = await (await createClient()).rpc("set_campus_status", {
    sede: text(fd, "campus_id"),
    new_status: stage,
    notes: orNull(text(fd, "notes")),
    force: text(fd, "force") === "si",
  });
  revalidatePath("/habilitacion");
  if (error) redirect(`/habilitacion?error=${encodeURIComponent(friendly(error.message))}`);
  redirect("/habilitacion?ok=1");
}

// ---------- Asignar sedes por lote ----------
const SEDES = "/habilitacion/sedes";

function back(error?: string, notice?: string): never {
  revalidatePath(SEDES);
  revalidatePath("/habilitacion");
  if (error) redirect(`${SEDES}?error=${encodeURIComponent(friendly(error))}`);
  redirect(`${SEDES}?aviso=${encodeURIComponent(notice ?? "Listo.")}`);
}

export async function asignarSedeGrupos(fd: FormData) {
  const sede = text(fd, "campus_id");
  if (!sede) back("Elige la sede.");
  const { data, error } = await (await createClient()).rpc("assign_groups_campus", {
    sede,
    program: orNull(text(fd, "programa")),
    only_modality: orNull(text(fd, "modalidad")),
    season: null,
  });
  back(error?.message, `${data as number} grupos quedaron con esa sede.`);
}

export async function asignarSedeGruposPorLider() {
  const { data, error } = await (await createClient()).rpc("assign_groups_campus_from_leader");
  back(error?.message, `${data as number} grupos tomaron la sede de su líder.`);
}

export async function asignarSedePersonasCiudad(fd: FormData) {
  const sede = text(fd, "campus_id");
  if (!sede) back("Elige la sede.");
  const { data, error } = await (await createClient()).rpc("assign_people_campus_by_city", {
    sede,
    in_country: text(fd, "country"),
    in_city: text(fd, "city"),
  });
  back(error?.message, `${data as number} personas quedaron con esa sede.`);
}

export async function asignarSedePersonasDesdeGrupos() {
  const { data, error } = await (await createClient()).rpc("assign_people_campus_from_groups");
  back(error?.message, `${data as number} personas tomaron la sede de su grupo.`);
}
