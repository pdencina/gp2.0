import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession, type Person } from "@/lib/session";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Callout, PageHeader } from "@/components/ui";
import {
  agregarRevisor,
  cambiarEstadoVersion,
  copiarVersion,
  crearModulo,
  quitarRevisor,
} from "@/app/actions/curriculo";
import { cambiarAnioModulo, guardarRequisito, recalcularAnios, sincronizarGrupos } from "@/app/actions/certificados";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  availableSteps,
  isEditable,
  isLegacy,
  type Issue,
  type VersionRow,
} from "@/lib/versions";

export const dynamic = "force-dynamic";

type Cycle = {
  id: string;
  number: number;
  title: string | null;
  classes: number;
  prerequisite_cycle_id: string | null;
  formative_year: number;
  stage_kind: string;
};
type EventRow = { id: string; from_status: string | null; to_status: string; note: string | null; created_at: string; actor: string | null };

const dateEs = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

export default async function CurriculumPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; v?: string }>;
}) {
  const params = await props.params;
  const sp = await props.searchParams;
  const { supabase, user, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect("/inicio");
  const isAdmin = role === "admin";

  const { data: curriculum } = await supabase
    .from("curriculums")
    .select("id, name, description, kind, duration_years, certifiable")
    .eq("id", params.id)
    .maybeSingle();
  if (!curriculum) notFound();

  const { data: vrows, error: vErr } = await supabase
    .from("curriculum_versions")
    .select("id, curriculum_id, version, label, status, is_current, content_frozen, source_note, approved_at, published_at")
    .eq("curriculum_id", curriculum.id)
    .order("version", { ascending: false });
  if (vErr) {
    return (
      <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
        <PageHeader title={curriculum.name} back={{ href: "/curriculums", label: "Currículums" }} />
        <Callout tone="warn">
          Falta instalar las versiones en la base de datos: ejecuta <code>supabase/v2/009_biblioteca.sql</code> en el SQL Editor de Supabase.
        </Callout>
      </div>
    );
  }
  const versions = (vrows ?? []) as VersionRow[];
  const selected = versions.find((v) => v.id === sp.v) ?? versions.find((v) => v.is_current) ?? versions[0];
  if (!selected) notFound();
  const editable = isEditable(selected);

  const [cyclesR, revR, linkR, issuesR, eventsR, coordR, reqR] = await Promise.all([
    supabase
      .from("cycles")
      .select("id, number, title, classes, prerequisite_cycle_id, formative_year, stage_kind")
      .eq("version_id", selected.id)
      .order("formative_year")
      .order("number"),
    supabase.from("curriculum_reviewers").select("reviewer_id").eq("curriculum_id", curriculum.id),
    supabase.from("lessons").select("cycle_id, cycles!inner(version_id)").eq("cycles.version_id", selected.id),
    supabase.rpc("version_readiness", { vid: selected.id }),
    supabase.from("version_events").select("id, from_status, to_status, note, created_at, actor").eq("version_id", selected.id).order("created_at", { ascending: false }),
    supabase.from("curriculum_coordinators").select("coordinator_id").eq("curriculum_id", curriculum.id).eq("coordinator_id", user.id),
    supabase.from("year_requirements").select("formative_year, min_pct").eq("version_id", selected.id),
  ]);
  const minPct = new Map(((reqR.data ?? []) as { formative_year: number; min_pct: number | string }[]).map((r) => [r.formative_year, Number(r.min_pct)]));
  const cycles = (cyclesR.data ?? []) as Cycle[];
  const reviewerIds = ((revR.data ?? []) as { reviewer_id: string }[]).map((r) => r.reviewer_id);
  const lessonCount = (cid: string) => ((linkR.data ?? []) as { cycle_id: string }[]).filter((l) => l.cycle_id === cid).length;
  const issues = ((issuesR.data ?? []) as Issue[]) ?? [];
  const events = (eventsR.data ?? []) as EventRow[];
  const isCoordinator = (coordR.data ?? []).length > 0;
  const isReviewer = isAdmin || reviewerIds.includes(user.id);
  const steps = availableSteps(selected.status, { isAdmin, isCoordinator, isReviewer });

  const personIds = Array.from(new Set([...reviewerIds, ...events.map((e) => e.actor).filter(Boolean)])) as string[];
  const { data: names } = personIds.length ? await supabase.from("profiles").select("id, full_name").in("id", personIds) : { data: [] as Person[] };
  const nameOf = (pid: string | null) => (pid ? (names ?? []).find((p) => p.id === pid)?.full_name || "Sin nombre" : "—");
  const candidates: Person[] = isAdmin ? (((await supabase.rpc("assignable_people", { r: "lider" })).data ?? []) as Person[]) : [];

  const nextNumber = (cycles[cycles.length - 1]?.number ?? 0) + 1;
  const years = Math.max(curriculum.duration_years ?? 1, ...cycles.map((c) => c.formative_year));

  return (
    <div className="enter mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        title={curriculum.name}
        back={{ href: "/curriculums", label: "Currículums" }}
        subtitle={`${curriculum.description || "Módulos, unidades y plan de encuentros"} · ${curriculum.duration_years > 1 ? `${curriculum.duration_years} años` : "1 año"}`}
      />
      <Flash error={sp.error} ok={sp.ok} />

      {/* Versiones */}
      <nav aria-label="Versiones" className="mb-4 flex flex-wrap gap-2">
        {versions.map((v) => (
          <Link
            key={v.id}
            href={`/curriculums/${curriculum.id}?v=${v.id}`}
            aria-current={v.id === selected.id ? "page" : undefined}
            className={`rounded-xl border px-3.5 py-1.5 text-sm transition ${v.id === selected.id ? "border-brand-teal bg-brand-teal-50 font-semibold text-brand-teal-800 shadow-sm" : "border-stone-200 bg-white text-stone-600 hover:border-brand-teal-200 hover:bg-brand-teal-50/40"}`}
          >
            Versión {v.version}
            {v.is_current ? " · vigente" : ""}
          </Link>
        ))}
      </nav>

      <section className="mb-5 card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium">
              {selected.label || `Versión ${selected.version}`}
              <span className={`ml-2 chip font-normal ${STATUS_STYLE[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
            </h2>
            <p className="text-xs text-stone-500">
              {selected.source_note}
              {selected.published_at ? ` · Publicada el ${dateEs(selected.published_at)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/curriculums/${curriculum.id}/plan?v=${selected.id}`} className="btn btn-secondary btn-sm">
              <Icon name="calendar" className="h-4 w-4" />
              Plan de 36 encuentros
            </Link>
            <Link href={`/biblioteca?programa=${curriculum.id}`} className="btn btn-secondary btn-sm">
              <Icon name="library" className="h-4 w-4" />
              Biblioteca
            </Link>
          </div>
        </div>

        {isLegacy(selected) && (
          <Callout tone="warn" className="mt-3">
            Esta es la versión que trajo la migración: nunca pasó por revisión pastoral y todavía se puede editar. Para publicar contenido aprobado, crea una versión nueva a partir de ella.
          </Callout>
        )}
        {!editable && selected.status !== "archivado" && (
          <Callout tone="info" className="mt-3">
            Esta versión está {selected.status === "publicado" ? "publicada y congelada" : "en revisión o aprobada"}: no se edita. Si hay que cambiar algo, copia la versión.
          </Callout>
        )}

        {/* Listo para revisar */}
        {issues.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {issues.map((i) => (
              <li key={i.code} className={i.level === "error" ? "text-red-700" : "text-stone-500"}>
                <Icon name={i.level === "error" ? "x" : "info"} className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> {i.detail}
              </li>
            ))}
          </ul>
        )}

        {/* Pasos del flujo */}
        {steps.length > 0 && (
          <form action={cambiarEstadoVersion} className="mt-4 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
            <input type="hidden" name="curriculum_id" value={curriculum.id} />
            <input type="hidden" name="version_id" value={selected.id} />
            <label className="min-w-[14rem] flex-1 text-xs text-stone-500">
              Nota (obligatoria al devolver)
              <input name="note" placeholder="Qué se aprobó o qué debe corregirse" className={`${fieldClass} mt-1`} />
            </label>
            {steps.map((s) => (
              <button
                key={s.to + s.label}
                name="to"
                value={s.to}
                className={
                  s.tone === "primary"
                    ? primaryBtn
                    : s.tone === "warn"
                      ? "h-10 rounded-lg border border-amber-500 px-4 text-sm text-amber-800 hover:bg-amber-50"
                      : "btn btn-secondary"
                }
              >
                {s.label}
              </button>
            ))}
          </form>
        )}

        <form action={copiarVersion} className="mt-3 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
          <input type="hidden" name="curriculum_id" value={curriculum.id} />
          <input type="hidden" name="version_id" value={selected.id} />
          <label className="min-w-[14rem] flex-1 text-xs text-stone-500">
            Crear una versión nueva a partir de esta
            <input name="label" placeholder="Nombre (ej. Edición 2027)" className={`${fieldClass} mt-1`} />
          </label>
          <button className="btn btn-outline">Copiar versión</button>
        </form>
      </section>

      {/* Módulos */}
      <section className="mb-5 card p-4">
        <h2 className="mb-2 section-title">Módulos y unidades</h2>
        {cycles.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-500">Todavía no hay módulos en esta versión.</p>
        ) : (
          <ul>
            {cycles.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 border-b border-stone-100 py-3 text-sm last:border-0">
                <span>
                  <span className="font-medium">Módulo {c.number}</span>
                  {c.title && <span className="ml-2 text-stone-600">{c.title}</span>}
                  <span className="ml-2 text-stone-400">
                    {years > 1 ? `Año ${c.formative_year} · ` : ""}
                    {lessonCount(c.id)} {lessonCount(c.id) === 1 ? "unidad" : "unidades"}
                  </span>
                  {c.prerequisite_cycle_id && (
                    <span className="ml-2 text-xs text-stone-400">(requiere módulo {cycles.find((x) => x.id === c.prerequisite_cycle_id)?.number})</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {years > 1 && editable && (
                    <form action={cambiarAnioModulo} className="flex items-center gap-1">
                      <input type="hidden" name="curriculum_id" value={curriculum.id} />
                      <input type="hidden" name="version_id" value={selected.id} />
                      <input type="hidden" name="cycle_id" value={c.id} />
                      <select name="formative_year" defaultValue={c.formative_year} aria-label={`Año del módulo ${c.number}`} className="h-8 rounded border border-stone-300 bg-white px-1 text-xs">
                        {Array.from({ length: years }, (_, i) => i + 1).map((y) => <option key={y} value={y}>Año {y}</option>)}
                      </select>
                      <button className="text-xs link">Cambiar</button>
                    </form>
                  )}
                  <Link href={`/ciclos/${c.id}`} className="link">
                    Unidades →
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <form action={crearModulo} className="mt-3 border-t border-stone-100 pt-3">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">Nuevo módulo</h3>
            <input type="hidden" name="curriculum_id" value={curriculum.id} />
            <input type="hidden" name="version_id" value={selected.id} />
            <div className="grid gap-2 md:grid-cols-5">
              <input name="number" type="number" min={1} defaultValue={nextNumber} aria-label="Número" className={fieldClass} />
              <input name="title" placeholder="Título (opcional)" aria-label="Título" className={`${fieldClass} md:col-span-2`} />
              <select name="stage_kind" aria-label="Tipo" defaultValue="modulo" className={fieldClass}>
                <option value="modulo">Módulo</option>
                <option value="nivel">Nivel</option>
                <option value="etapa">Etapa</option>
                <option value="anio">Año</option>
              </select>
              <input name="formative_year" type="number" min={1} max={10} defaultValue={1} aria-label="Año formativo" className={fieldClass} />
            </div>
            {cycles.length > 0 && (
              <label className="mt-2 block text-xs text-stone-500">
                Módulo que debe completarse antes (opcional)
                <select name="prerequisite_cycle_id" defaultValue="" className={`${fieldClass} mt-1`}>
                  <option value="">Ninguno</option>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      Módulo {c.number}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className={`${primaryBtn} mt-3`}>Crear módulo</button>
          </form>
        )}
      </section>

      {/* Años y requisitos */}
      {(years > 1 || curriculum.certifiable) && (
        <section className="mb-5 card p-4">
          <h2 className="mb-1 section-title">Años y requisitos de certificación</h2>
          <p className="mb-3 text-xs text-stone-500">
            Cada año es una etapa. Se cumple cuando la persona tiene acreditado al menos este porcentaje de sus unidades (un módulo heredado sin unidades cuenta como una etapa, y vale cuando alguien valida su crédito). Los certificados ya emitidos guardan la regla con la que se emitieron.
          </p>
          <ul className="space-y-2">
            {Array.from({ length: years }, (_, i) => i + 1).map((y) => (
              <li key={y}>
                <form action={guardarRequisito} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="curriculum_id" value={curriculum.id} />
                  <input type="hidden" name="version_id" value={selected.id} />
                  <input type="hidden" name="formative_year" value={y} />
                  <span className="w-16 font-medium">Año {y}</span>
                  <span className="text-xs text-stone-500">{cycles.filter((c) => c.formative_year === y).length} módulos</span>
                  <input name="min_pct" type="number" min={1} max={100} step="0.5" defaultValue={minPct.get(y) ?? 100} aria-label={`Porcentaje mínimo del año ${y}`} className={`${fieldClass} w-24`} />
                  <span className="text-xs text-stone-500">% mínimo</span>
                  <button className="btn btn-outline">Guardar</button>
                </form>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
            <Link href={`/curriculums/${curriculum.id}/creditos`} className="h-10 rounded-lg border border-stone-300 px-3 text-sm leading-10 text-stone-700 hover:bg-stone-50">
              Créditos de la plataforma anterior →
            </Link>
            <form action={recalcularAnios}>
              <input type="hidden" name="curriculum_id" value={curriculum.id} />
              <input type="hidden" name="version_id" value={selected.id} />
              <button className="btn btn-secondary">Recalcular el año de cada persona</button>
            </form>
            <form action={sincronizarGrupos}>
              <input type="hidden" name="curriculum_id" value={curriculum.id} />
              <input type="hidden" name="version_id" value={selected.id} />
              <button className="btn btn-secondary">Sincronizar el año de los grupos</button>
            </form>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Después de asignar el año de cada módulo: primero valida los créditos, luego sincroniza los grupos y recalcula el año de cada persona. El año se deduce de lo acreditado o validado; no se asume.
          </p>
        </section>
      )}

      {/* Revisores */}
      <section className="mb-5 card p-4">
        <h2 className="mb-1 section-title">Revisión pastoral</h2>
        <p className="mb-2 text-xs text-stone-500">Quienes pueden aprobar y publicar versiones de este programa, además del administrador.</p>
        {reviewerIds.length === 0 && <p className="text-sm text-stone-400">Solo el administrador.</p>}
        <div className="flex flex-wrap gap-2">
          {reviewerIds.map((rid) => (
            <span key={rid} className="inline-flex items-center gap-1 chip bg-stone-100 text-sm">
              {nameOf(rid)}
              {isAdmin && (
                <form action={quitarRevisor} className="inline">
                  <input type="hidden" name="curriculum_id" value={curriculum.id} />
                  <input type="hidden" name="version_id" value={selected.id} />
                  <input type="hidden" name="reviewer_id" value={rid} />
                  <button className="text-xs text-stone-500 hover:text-red-700" aria-label={`Quitar a ${nameOf(rid)}`}>×</button>
                </form>
              )}
            </span>
          ))}
        </div>
        {isAdmin && (
          <form action={agregarRevisor} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="curriculum_id" value={curriculum.id} />
            <input type="hidden" name="version_id" value={selected.id} />
            <select name="reviewer_id" defaultValue="" aria-label="Agregar revisor" className={`${fieldClass} max-w-xs`}>
              <option value="" disabled>Agregar revisor…</option>
              {candidates.filter((p) => !reviewerIds.includes(p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || "Sin nombre"}</option>
              ))}
            </select>
            <button className="btn btn-outline">Agregar</button>
          </form>
        )}
      </section>

      {/* Bitácora */}
      {events.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 section-title">Historial de esta versión</h2>
          <ul className="space-y-1.5 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {e.from_status ? `${STATUS_LABEL[e.from_status as keyof typeof STATUS_LABEL] ?? e.from_status} → ` : ""}
                  <strong className="font-medium">{STATUS_LABEL[e.to_status as keyof typeof STATUS_LABEL] ?? e.to_status}</strong>
                  {e.note && <span className="ml-2 text-stone-500">“{e.note}”</span>}
                </span>
                <span className="text-xs text-stone-400">{nameOf(e.actor)} · {dateEs(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
