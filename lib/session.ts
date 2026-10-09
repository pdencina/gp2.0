import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

// Devuelve el cliente de Supabase y los datos básicos de la persona con sesión.
export async function getSession() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  return {
    supabase,
    user,
    role: (profile?.role ?? "alumno") as Role,
    fullName: profile?.full_name ?? "",
  };
}

export type Person = { id: string; full_name: string };
