import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash, fieldClass } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Callout, EmptyState, PageHeader } from "@/components/ui";
import { actualizarRecuperacion } from "@/app/actions/calendario";

export const dynamic = "force-dynamic";

type Plan = {
  id: string;
  status: "pendiente" | "en_curso" | "resuelto" | "cancelado";
  reason: string | null;
  notes: string | null;
  follow_up_on: string | null;
  created_at: string;
  pending_unit_id: string | null;
  responsible_id: string | null;
  curriculum_enrollment_id: string;
  curriculum_enrollments: { person_id: string; curriculums: { name: string } | null } | null;
};

const STATUS_LABEL = { pendiente: "Pendiente", en_curso: "En curso", resuelto: "Resuelto", cancelado: "Cancelado" } as const;
const dateEs = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

export default async function RecuperacionPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const sp = await props.searchParams;
  const { supabase, user, role } = await getSession();
  if (!["admin", "coordinador", "monitor", "lider"].includes(role)) redirect("/inicio");

  const { data, error } = await supabase
    .from("catchup_plans")
    .select("id, status, reason, notes, follow_up_on, created_at, pending_unit_id, responsible_id, curriculum_enrollment_id, curriculum_enrollments(person_id, curriculums(name))")
    .in("status", ["pendiente", "en_curso"])
    .order("created_at");
  const plans = (data ?? []) as unknown as Plan[];

  const personIds = Array.from(
    new Set(plans.flatMap((p) => [p.curriculum_enrollments?.person_id, p.responsible_id]).filter(Boolean)),
  ) as string[];
  const unitIds = Array.from(new Set(plans.map((p) => p.pending_unit_id).filter(Boolean))) as string[];
  const [namesR, unitsR] = await Promise.all([
    personIds.length ? supabase.from("profiles").select("id, full_name").in("id", personIds) : Promise.resolve({ data: [] }),
    unitIds.length ? supabase.from("lessons").select("id, number, title").in("id", unitIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map(((namesR.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  const units = new Map(((unitsR.data ?? []) as { id: string; number: number; title: string }[]).map((u) => [u.id, `${u.number}. ${u.title}`]));

  // Demanda: cuántas personas esperan cada unidad
  const demand = new Map<string, number>();
  for (const p of plans) {
    const key = `${p.curriculum_enrollments?.curriculums?.name ?? "Programa"} · ${p.pending_unit_id ? units.get(p.pending_unit_id) ?? "unidad pendiente" : "sin unidad definida"}`;
    demand.set(key, (demand.get(key) ?? 0) + 1);
  }
  const topDemand = Array.from(demand.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="enter mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        title="Recuperación"
        subtitle="Personas que necesitan ponerse al día porque no hay un grupo que calce con su siguiente unidad. Asigna un responsable y una fecha de seguimiento."
      />
      <Flash error={sp.error} ok={sp.ok} />
      {error && (
        <Callout tone="warn" className="mb-4">
          No se pudo leer la lista. Si acabas de actualizar, ejecuta <code>supabase/v2/008_calendario.sql</code> en Supabase.
        </Callout>
      )}

      {topDemand.length > 0 && (
        <section className="mb-5 card p-4">
          <h2 className="mb-2 section-title flex items-center gap-2"><Icon name="chart" className="h-4 w-4 text-brand-teal" />Dónde hay más espera</h2>
          <ul className="space-y-1 text-sm">
            {topDemand.map(([k, n]) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="text-stone-600">{k}</span>
                <span className="text-stone-500">{n} {n === 1 ? "persona" : "personas"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plans.length === 0 ? (
        <EmptyState icon="check-circle" title="Nadie está esperando recuperación">
          Todas las personas tienen un grupo que calza con su siguiente unidad.
        </EmptyState>
      ) : (
        <ul className="stagger space-y-3">
          {plans.map((p) => {
            const who = p.curriculum_enrollments?.person_id;
            const late = p.follow_up_on && p.follow_up_on < new Date().toISOString().slice(0, 10);
            return (
              <li key={p.id} className="card card-hover p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm">
                    <p className="font-medium">
                      <Link href={`/mi-progreso/${p.curriculum_enrollment_id}`} className="hover:underline">
                        {who ? names.get(who) || "Sin nombre" : "Persona"}
                      </Link>
                      <span className="ml-2 font-normal text-stone-500">{p.curriculum_enrollments?.curriculums?.name}</span>
                    </p>
                    <p className="text-stone-500">
                      Le toca: {p.pending_unit_id ? units.get(p.pending_unit_id) ?? "—" : "unidad por definir"} · Hace {daysSince(p.created_at)} días
                    </p>
                    {p.reason && <p className="text-xs text-stone-400">{p.reason}</p>}
                    {p.notes && <p className="text-xs text-stone-500">“{p.notes}”</p>}
                  </div>
                  <span className={`chip ${late ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                    {STATUS_LABEL[p.status]}
                    {p.follow_up_on ? ` · seguimiento ${dateEs(p.follow_up_on)}` : ""}
                  </span>
                </div>

                <form action={actualizarRecuperacion} className="mt-3 grid gap-2 border-t border-stone-100 pt-3 md:grid-cols-[1fr_1fr_2fr_auto]">
                  <input type="hidden" name="id" value={p.id} />
                  <select name="status" defaultValue={p.status} aria-label="Estado" className={fieldClass}>
                    <option value="pendiente">Pendiente</option>
                    <option value="en_curso">En curso</option>
                    <option value="resuelto">Resuelto</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                  <input type="date" name="follow_up_on" defaultValue={p.follow_up_on ?? ""} aria-label="Seguimiento" className={fieldClass} />
                  <input name="notes" defaultValue={p.notes ?? ""} placeholder="Nota: horario, acuerdo, a quién derivar…" aria-label="Nota" className={fieldClass} />
                  <button className="btn btn-outline">Guardar</button>
                  <label className="flex items-center gap-2 text-xs text-stone-500 md:col-span-4">
                    <input type="checkbox" name="responsible" value="yo" defaultChecked={p.responsible_id === user.id} />
                    Yo me hago cargo{p.responsible_id && p.responsible_id !== user.id ? ` (hoy: ${names.get(p.responsible_id) ?? "otra persona"})` : ""}
                  </label>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
