import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { whatsappLink } from "@/lib/phone";
import { ALERT_LABEL, SEVERITY_CLASS, type Alert } from "@/lib/alerts";
import { Flash, fieldClass } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";
import { registrarContacto } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

export default async function AlertasPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role === "alumno") redirect("/inicio");

  const { data } = await supabase.rpc("my_alerts");
  const alerts = (data ?? []) as Alert[];

  const personIds = Array.from(new Set(alerts.map((a) => a.person_id).filter(Boolean))) as string[];
  const { data: phoneRows } = personIds.length
    ? await supabase.from("profiles").select("id, phone").in("id", personIds)
    : { data: [] };
  const phones = new Map(((phoneRows ?? []) as { id: string; phone: string | null }[]).map((p) => [p.id, p.phone]));

  const message = (a: Alert) => {
    const first = (a.person_name ?? "").split(" ")[0];
    return a.kind === "nuevo"
      ? `Hola ${first}, te damos la bienvenida a ${a.group_name}. ¿Cómo estás? Aquí estamos para lo que necesites.`
      : `Hola ${first}, ¿cómo estás? Te extrañamos en ${a.group_name}. ¿Hay algo en que podamos ayudarte?`;
  };

  return (
    <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        eyebrow="Seguimiento"
        title="Necesitan tu atención"
        subtitle={
          alerts.length === 0
            ? "Todo en orden por ahora."
            : `${alerts.length} ${alerts.length === 1 ? "aviso" : "avisos"} en tu alcance, los más urgentes primero.`
        }
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {alerts.length === 0 && (
        <EmptyState icon="check-circle" title="No hay avisos pendientes">
          Cuando alguien falte varias veces o llegue nuevo a tu grupo, aparecerá aquí.
        </EmptyState>
      )}

      <ul className="stagger space-y-3">
        {alerts.map((a, i) => (
          <li key={`${a.kind}-${a.group_id}-${a.person_id ?? i}`} className="card card-hover p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <Avatar name={a.person_name || a.group_name} />
                <div>
                  <span className={`chip ${SEVERITY_CLASS[a.severity]}`}>{ALERT_LABEL[a.kind]}</span>
                  <p className="mt-2 font-semibold">{a.person_name || a.group_name}</p>
                  <p className="text-sm text-stone-500">
                    {a.person_name ? `${a.group_name} · ` : ""}
                    {a.detail}
                  </p>
                </div>
              </div>
              <Link href={`/grupos/${a.group_id}`} className="btn btn-ghost btn-sm">
                Ver grupo
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
            </div>

            {a.person_id && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {phones.get(a.person_id) ? (
                  <a
                    href={whatsappLink(phones.get(a.person_id)!, message(a))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm bg-brand-green text-white hover:brightness-95"
                  >
                    <Icon name="phone" className="h-4 w-4" />
                    Escribir por WhatsApp
                  </a>
                ) : (
                  <span className="text-xs text-stone-400">Sin teléfono registrado</span>
                )}
              </div>
            )}

            {a.person_id && (
              <details className="mt-3">
                <summary className="btn btn-outline btn-sm cursor-pointer list-none">
                  Registrar contacto
                </summary>
                <form action={registrarContacto} className="mt-3 grid gap-2 md:grid-cols-[auto_1fr_auto]">
                  <input type="hidden" name="person_id" value={a.person_id} />
                  <input type="hidden" name="group_id" value={a.group_id} />
                  <select name="kind" aria-label="Tipo de contacto" defaultValue="mensaje" className={fieldClass}>
                    <option value="mensaje">Mensaje</option>
                    <option value="llamada">Llamada</option>
                    <option value="visita">Visita</option>
                  </select>
                  <input name="note" placeholder="Nota (opcional)" aria-label="Nota" className={fieldClass} />
                  <button className="btn btn-primary">
                    Guardar
                  </button>
                </form>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
