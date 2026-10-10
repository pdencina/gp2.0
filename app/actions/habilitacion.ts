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
