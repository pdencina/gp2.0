import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROLE_VIEWS, canPromote, type Role } from "@/lib/roles";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

async function promover(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const supabase = createClient();
  const { error } = await supabase.rpc("promote_user", { target: id });
  revalidatePath("/equipo");
  if (error) redirect(`/equipo?error=${encodeURIComponent(error.message)}`);
  redirect("/equipo?ok=1");
}

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string };
}) {
  const supabase = createClient();
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
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <header className="mb-6 flex items-center justify-between">
        <Logo />
        <Link href="/inicio" className="text-sm text-stone-600 hover:underline">
          ← Inicio
        </Link>
      </header>

      <h1 className="text-2xl font-medium">Tu equipo</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Se sube un peldaño a la vez: alumno → líder → monitor → coordinador.
      </p>

      {searchParams.error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}
      {searchParams.ok && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Listo, el cambio de rol quedó registrado.
        </p>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        {people.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">Todavía no hay personas en tu alcance.</p>
        ) : (
          <ul>
            {people.map((p) => {
              const next = canPromote(myRole, p.role);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b border-stone-100 py-2.5 text-sm last:border-0">
                  <span>
                    {p.full_name || "Sin nombre"}
                    <span className="ml-2 text-stone-400">{ROLE_VIEWS[p.role].label}</span>
                  </span>
                  {next && (
                    <form action={promover}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="rounded-lg border border-brand-teal px-3 py-1.5 text-xs font-medium text-brand-teal hover:bg-brand-teal hover:text-white">
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
