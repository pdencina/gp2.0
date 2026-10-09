import Link from "next/link";
import { getSession } from "@/lib/session";
import { ROLE_VIEWS } from "@/lib/roles";
import { AppHeader } from "@/components/AppHeader";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { actualizarPerfil } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string };
}) {
  const { supabase, user, role, fullName } = await getSession();

  // El teléfono se lee aparte: si la columna aún no existe, el resto sigue funcionando.
  const { data } = await supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle();
  const phone = (data as { phone: string | null } | null)?.phone ?? "";

  return (
    <div className="mx-auto max-w-xl p-4 md:p-8">
      <AppHeader role={role} />
      <h1 className="text-2xl font-medium">Mi perfil</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">{ROLE_VIEWS[role].label}</p>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <form action={actualizarPerfil} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
        <label className="block text-xs text-stone-500">
          Nombre completo
          <input name="full_name" defaultValue={fullName} autoComplete="name" className={`${fieldClass} mt-1 text-base`} />
        </label>

        <label className="block text-xs text-stone-500">
          Correo
          <input value={user.email ?? ""} readOnly disabled className={`${fieldClass} mt-1 bg-stone-50 text-base text-stone-500`} />
        </label>

        <label className="block text-xs text-stone-500">
          Teléfono (WhatsApp)
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={phone}
            placeholder="+56 9 1234 5678"
            className={`${fieldClass} mt-1 text-base`}
          />
          <span className="mt-1 block text-stone-500">
            Incluye el código de país. Solo tu líder y las personas que te acompañan pueden verlo.
          </span>
        </label>

        <button className={primaryBtn}>Guardar cambios</button>
      </form>

      <p className="mt-5 text-sm">
        <Link href="/auth/restablecer" className="text-brand-teal hover:underline">
          Cambiar mi contraseña
        </Link>
      </p>
    </div>
  );
}
