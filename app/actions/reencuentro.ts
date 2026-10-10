"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { backTo, friendly, orNull, text } from "@/lib/action-helpers";

// Vuelve a la lista con el mismo filtro, agregando el resultado (la ruta ya puede traer parámetros)
function back(to: string, error?: string): never {
  const url = new URL(to, "http://local");
  url.searchParams.delete("error");
  url.searchParams.delete("ok");
  if (error) url.searchParams.set("error", friendly(error));
  else url.searchParams.set("ok", "1");
  revalidatePath("/reencuentro");
  redirect(`${url.pathname}${url.search}`);
}

// Anota un contacto de rescate. El alcance (quién puede anotar a quién) lo decide la base de datos.
export async function registrarReencuentro(fd: FormData) {
  const to = backTo(fd, "/reencuentro");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ce = text(fd, "ce");
  if (!ce) back(to, "No se encontró a la persona.");
  const outcome = text(fd, "outcome");
  if (!outcome) back(to, "Cuéntanos cómo fue: ¿respondió, quiere volver, pidió más tiempo?");

  const { error } = await supabase.rpc("log_outreach", {
    p_ce: ce,
    p_kind: text(fd, "kind") || "mensaje",
    p_outcome: outcome,
    p_note: orNull(text(fd, "note")),
    p_follow_up: orNull(text(fd, "follow_up_on")),
  });
  back(to, error?.message);
}
