import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROLE_VIEWS, canPromote, type Role } from "@/lib/roles";
import { Flash } from "@/components/Flash";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

async function promover(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("promote_user", { target: id });
  revalidatePath("/equipo");
  if (error) redirect(`/equipo?error=${encodeURIComponent(error.message)}`);
  redirect("/equipo?ok=1");
}

export default async function EquipoPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const myRole = (me?.role ?? "alumno") as Role;
  if (!["monitor", "coordinador", "admin"].includes(myRole)) redirect("/inicio");

  // RLS limita la lista a las personas de tu alcance.
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .neq("id", user.id)
    .order("full_name");
  const people = (data ?? []) as { id: string; full_name: string; role: Role }[];

  return (
    <div className="enter mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        title="Tu equipo"
        subtitle="Se sube un peldaño a la vez: alumno → líder → monitor → coordinador."
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <section className="card p-4">
        {people.length === 0 ? (
          <EmptyState icon="users" title="Todavía no hay personas en tu alcance" />
        ) : (
          <ul>
            {people.map((p) => {
              const next = canPromote(myRole, p.role);
              return (
                <li key={p.id} className="row flex items-center justify-between gap-3 border-b border-stone-100 py-2.5 text-sm last:border-0">
                  <span className="flex items-center gap-3">
                    <Avatar name={p.full_name || "Sin nombre"} size="sm" />
                    <span>{p.full_name || "Sin nombre"}</span>
                    <span className="chip bg-stone-100 text-stone-600">{ROLE_VIEWS[p.role].label}</span>
                  </span>
                  {next && (
                    <form action={promover}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn btn-outline">
                        Promover a {ROLE_VIEWS[next].label.toLowerCase()}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
