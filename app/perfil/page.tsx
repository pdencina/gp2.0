import Link from "next/link";
import { getSession } from "@/lib/session";
import { ROLE_VIEWS } from "@/lib/roles";
import { AppHeader } from "@/components/AppHeader";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { actualizarPerfil } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type ProfileRow = {
  phone: string | null;
  gender: string | null;
  country: string | null;
  city: string | null;
  birth_date: string | null;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
  terms_accepted_at: string | null;
  accepts_comms: boolean | null;
};

const COUNTRIES: [string, string][] = [
  ["CL", "Chile"], ["VE", "Venezuela"], ["UY", "Uruguay"], ["US", "Estados Unidos"], ["CO", "Colombia"],
  ["AR", "Argentina"], ["PE", "Perú"], ["MX", "México"], ["BR", "Brasil"], ["EC", "Ecuador"],
  ["BO", "Bolivia"], ["PY", "Paraguay"], ["ES", "España"], ["DO", "República Dominicana"], ["NI", "Nicaragua"],
];

export default async function PerfilPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, user, role, fullName } = await getSession();

  const { data } = await supabase
    .from("profiles")
    .select("phone, gender, country, city, birth_date, guardian_name, guardian_email, guardian_phone, terms_accepted_at, accepts_comms")
    .eq("id", user.id)
    .maybeSingle();
  const p = (data ?? {}) as Partial<ProfileRow>;

  const label = "block text-xs text-stone-500";
  const input = `${fieldClass} mt-1 text-base`;

  return (
    <div className="mx-auto max-w-xl p-4 md:p-8">
      <AppHeader role={role} />
      <h1 className="text-2xl font-medium">Mi perfil</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">{ROLE_VIEWS[role].label}</p>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <form action={actualizarPerfil} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
        <label className={label}>
          Nombre completo
          <input name="full_name" defaultValue={fullName} autoComplete="name" className={input} />
        </label>

        <label className={label}>
          Correo
          <input value={user.email ?? ""} readOnly disabled className={`${input} bg-stone-50 text-stone-500`} />
        </label>

        <label className={label}>
          Teléfono (WhatsApp)
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={p.phone ?? ""}
            placeholder="+56 9 1234 5678"
            className={input}
          />
          <span className="mt-1 block text-stone-500">
            Incluye el código de país. Solo tu líder y las personas que te acompañan pueden verlo.
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className={label}>
            Género
            <select name="gender" defaultValue={p.gender ?? ""} className={input}>
              <option value="">Prefiero no indicarlo</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
            </select>
          </label>
          <label className={label}>
            Fecha de nacimiento
            <input name="birth_date" type="date" defaultValue={p.birth_date ?? ""} className={input} />
          </label>
          <label className={label}>
            País
            <select name="country" defaultValue={p.country ?? ""} className={input}>
              <option value="">Elige tu país</option>
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Ciudad
            <input name="city" defaultValue={p.city ?? ""} autoComplete="address-level2" className={input} />
          </label>
        </div>

        <p className="text-xs text-stone-500">
          El género y la fecha de nacimiento se usan para mostrarte los grupos que te corresponden.
        </p>

        <fieldset className="space-y-3 rounded-lg bg-stone-50 p-3">
          <legend className="px-1 text-xs font-medium text-stone-600">Si eres menor de 18 años</legend>
          <input name="guardian_name" placeholder="Nombre de tu tutor" defaultValue={p.guardian_name ?? ""} className={fieldClass} />
          <div className="grid gap-3 md:grid-cols-2">
            <input name="guardian_email" type="email" placeholder="Correo del tutor" defaultValue={p.guardian_email ?? ""} className={fieldClass} />
            <input name="guardian_phone" type="tel" placeholder="Teléfono del tutor" defaultValue={p.guardian_phone ?? ""} className={fieldClass} />
          </div>
        </fieldset>

        <div className="space-y-2 text-sm">
          {p.terms_accepted_at ? (
            <p className="text-green-800">Aceptaste los términos y la política de privacidad.</p>
          ) : (
            <label className="flex items-start gap-2 text-stone-700">
              <input type="checkbox" name="accept_terms" className="mt-1" />
              <span>
                Acepto los términos y la{" "}
                <Link href="/privacidad" target="_blank" className="text-brand-teal underline">
                  política de privacidad
                </Link>
                . Es necesario para inscribirte.
              </span>
            </label>
          )}
          <label className="flex items-start gap-2 text-stone-700">
            <input type="checkbox" name="accepts_comms" defaultChecked={p.accepts_comms ?? true} className="mt-1" />
            <span>Quiero recibir recordatorios y avisos de mi grupo.</span>
          </label>
        </div>

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
