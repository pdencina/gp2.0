import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash, fieldClass } from "@/components/Flash";
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
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="text-2xl font-medium">Recuperación</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Personas que necesitan ponerse al día porque no hay un grupo que calce con su siguiente unidad. Asigna un responsable y una fecha de seguimiento.
      </p>
      <Flash error={sp.error} ok={sp.ok} />
      {error && (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          No se pudo leer la lista. Si acabas de actualizar, ejecuta <code>supabase/v2/008_calendario.sql</code> en Supabase.
        </p>
      )}

      {topDemand.length > 0 && (
        <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium">Dónde hay más espera</h2>
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
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">Nadie está esperando recuperación. 🎉</p>
      ) : (
        <ul className="space-y-3">
          {plans.map((p) => {
            const who = p.curriculum_enrollments?.person_id;
            const late = p.follow_up_on && p.follow_up_on < new Date().toISOString().slice(0, 10);
            return (
              <li key={p.id} className="rounded-xl border border-stone-200 bg-white p-4">
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
                  <span className={`rounded px-2 py-0.5 text-xs ${late ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
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
                  <button className="h-10 rounded-lg border border-brand-teal px-3 text-sm text-brand-teal hover:bg-brand-teal hover:text-white">Guardar</button>
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
