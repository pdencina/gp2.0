import Link from "next/link";
import { getSession } from "@/lib/session";
import { ROLE_VIEWS } from "@/lib/roles";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Avatar, Callout, ProgressRing } from "@/components/ui";
import { COUNTRIES, countryLabel } from "@/lib/places";
import { profileCheck, type ProfileData } from "@/lib/profile-check";
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
  campus_id: string | null;
};

export default async function PerfilPage(props: {
  searchParams: Promise<{ error?: string; ok?: string; pais?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, user, role, fullName } = await getSession();

  const { data } = await supabase
    .from("profiles")
    .select("phone, gender, country, city, birth_date, guardian_name, guardian_email, guardian_phone, terms_accepted_at, accepts_comms, campus_id")
    .eq("id", user.id)
    .maybeSingle();
  const p = (data ?? {}) as Partial<ProfileRow>;
  const { data: campusRows } = await supabase.from("campuses").select("id, name").eq("active", true).order("name");
  const campuses = (campusRows ?? []) as { id: string; name: string }[];

  const check = profileCheck({ ...(p as Partial<ProfileData>), full_name: fullName }, { campusesExist: campuses.length > 0 });
  const missing = new Set(check.missing.map((m) => m.key));
  // lo que falta se resalta en ámbar
  const warn = (...keys: string[]) => (keys.some((k) => missing.has(k)) ? " !border-amber-400 ring-2 ring-amber-200" : "");
  const detected = /^[A-Z]{2}$/.test((searchParams.pais ?? "").toUpperCase()) ? searchParams.pais!.toUpperCase() : null;

  const label = "block text-xs text-stone-500";
  const input = `${fieldClass} mt-1 text-base`;

  return (
    <div className="enter mx-auto max-w-xl p-4 pb-16 md:p-8 md:pb-16">
      <header className="enter mb-6 flex items-center gap-4">
        <Avatar name={fullName || user.email || "Yo"} size="lg" />
        <div className="min-w-0">
          <h1 className="page-title truncate">{fullName || "Mi perfil"}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-stone-500">
            <span className="chip bg-brand-teal-50 text-brand-teal-800">{ROLE_VIEWS[role].label}</span>
            <span className="truncate">{user.email}</span>
          </p>
        </div>
        <ProgressRing value={check.percent} size={56} stroke={6} tone={check.blocking ? "orange" : "green"} label={`Perfil completo al ${check.percent} %`}>
          <span className="text-xs font-semibold tabular">{check.percent}%</span>
        </ProgressRing>
      </header>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {detected && (
        <Callout tone="info" className="mb-4">
          Detectamos que estás en {countryLabel(detected)}. Confirma tu país y tu ciudad y guarda los cambios.
        </Callout>
      )}
      {check.missing.length > 0 ? (
        <Callout tone={check.blocking ? "warn" : "info"} className="mb-4">
          {check.blocking ? "Para inscribirte te falta completar: " : "Para terminar tu perfil te falta: "}
          {check.missing.map((m) => m.label.replace(/^(Tu|Tus|El|Un) /, "").toLowerCase()).join(", ")}.
        </Callout>
      ) : (
        <Callout tone="success" className="mb-4">Tu perfil está completo. Gracias por mantener tus datos al día.</Callout>
      )}

      <form action={actualizarPerfil} className="enter space-y-4 card p-5">
        <label className={label}>
          Nombre completo
          <input name="full_name" defaultValue={fullName} autoComplete="name" className={`${input}${warn("full_name")}`} />
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
            className={`${input}${warn("phone")}`}
          />
          <span className="mt-1 block text-stone-500">
            Incluye el código de país. Solo tu líder y las personas que te acompañan pueden verlo.
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className={label}>
            Género
            <select name="gender" defaultValue={p.gender ?? ""} className={`${input}${warn("gender")}`}>
              <option value="">Prefiero no indicarlo</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
            </select>
          </label>
          <label className={label}>
            Fecha de nacimiento
            <input name="birth_date" type="date" defaultValue={p.birth_date ?? ""} className={`${input}${warn("birth_date")}`} />
          </label>
          <label className={label}>
            País
            <select name="country" defaultValue={detected ?? p.country ?? ""} className={`${input}${warn("country")}${detected ? " !border-brand-teal ring-2 ring-brand-teal-200" : ""}`}>
              <option value="">Elige tu país</option>
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {campuses.length > 0 && (
            <label className={label}>
              Mi sede
              <select name="campus_id" defaultValue={p.campus_id ?? ""} className={`${input}${warn("campus")}`}>
                <option value="">Sin sede todavía</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={label}>
            Ciudad
            <input name="city" defaultValue={p.city ?? ""} autoComplete="address-level2" className={`${input}${warn("city")}${detected ? " !border-brand-teal ring-2 ring-brand-teal-200" : ""}`} />
          </label>
        </div>

        <p className="text-xs text-stone-500">
          El género y la fecha de nacimiento se usan para mostrarte los grupos que te corresponden.
        </p>

        <fieldset className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
          <legend className="flex items-center gap-1.5 px-1 text-xs font-medium text-stone-600">
            <Icon name="shield" className="h-3.5 w-3.5 text-brand-teal" />
            Si eres menor de 18 años
          </legend>
          <input name="guardian_name" placeholder="Nombre de tu tutor" defaultValue={p.guardian_name ?? ""} className={`${fieldClass}${warn("guardian_name")}`} />
          <div className="grid gap-3 md:grid-cols-2">
            <input name="guardian_email" type="email" placeholder="Correo del tutor" defaultValue={p.guardian_email ?? ""} className={`${fieldClass}${warn("guardian_contact")}`} />
            <input name="guardian_phone" type="tel" placeholder="Teléfono del tutor" defaultValue={p.guardian_phone ?? ""} className={`${fieldClass}${warn("guardian_contact")}`} />
          </div>
        </fieldset>

        <div className="space-y-2 text-sm">
          {p.terms_accepted_at ? (
            <p className="flex items-center gap-2 text-brand-green-800">
              <Icon name="check-circle" className="h-4 w-4" />
              Aceptaste los términos y la política de privacidad.
            </p>
          ) : (
            <label className={`flex items-start gap-2 rounded-xl p-2 text-stone-700${warn("terms") ? " bg-amber-50 ring-2 ring-amber-200" : ""}`}>
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

      <p className="mt-5">
        <Link href="/auth/restablecer" className="btn btn-ghost">
          <Icon name="lock" className="h-4 w-4" />
          Cambiar mi contraseña
        </Link>
      </p>
    </div>
  );
}
