import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Callout, EmptyState, PageHeader } from "@/components/ui";
import { LessonForm } from "@/components/LessonForm";
import { STATUS_LABEL, isEditable, type EditorialStatus } from "@/lib/versions";

export const dynamic = "force-dynamic";

export default async function CicloPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect("/inicio");

  const first = await supabase
    .from("cycles")
    .select("id, number, title, curriculum_id, version_id, curriculums(name), curriculum_versions:version_id(version, status, content_frozen)")
    .eq("id", params.id)
    .maybeSingle();
  // Si todavía no se instaló 009_biblioteca.sql, la pantalla sigue funcionando como antes
  const { data } = first.error
    ? await supabase.from("cycles").select("id, number, title, curriculum_id, curriculums(name)").eq("id", params.id).maybeSingle()
    : first;
  if (!data) notFound();
  const cycle = data as unknown as {
    id: string;
    number: number;
    title: string | null;
    curriculum_id: string;
    version_id?: string | null;
    curriculums: { name: string } | null;
    curriculum_versions?: { version: number; status: EditorialStatus; content_frozen: boolean } | null;
  };
  const ver = cycle.curriculum_versions ?? null;
  const editable = ver ? isEditable(ver) : true;

  const { data: rows } = await supabase
    .from("lessons")
    .select("id, number, title, summary")
    .eq("cycle_id", cycle.id)
    .order("number");
  const lessons = (rows ?? []) as { id: string; number: number; title: string; summary: string | null }[];
  const nextNumber = (lessons[lessons.length - 1]?.number ?? 0) + 1;

  return (
    <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        eyebrow={cycle.curriculums?.name}
        title={`Módulo ${cycle.number}${cycle.title ? ` · ${cycle.title}` : ""}`}
        back={{ href: `/curriculums/${cycle.curriculum_id}${cycle.version_id ? `?v=${cycle.version_id}` : ""}`, label: cycle.curriculums?.name ?? "Currículum" }}
        subtitle={`${lessons.length} ${lessons.length === 1 ? "unidad" : "unidades"}${ver ? ` · Versión ${ver.version} (${STATUS_LABEL[ver.status].toLowerCase()})` : ""}`}
      />
      {!editable && (
        <Callout tone="info" className="mb-4">
          Esta versión no se puede editar. Copia la versión desde el currículum para hacer cambios.
        </Callout>
      )}
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <section className="mb-6 card p-4">
        {lessons.length === 0 ? (
          <EmptyState icon="book" title="Todavía no hay unidades">
            {editable ? "Crea la primera con el formulario de abajo." : "Esta versión no tiene unidades cargadas."}
          </EmptyState>
        ) : (
          <ul className="stagger">
            {lessons.map((l) => (
              <li key={l.id} className="row flex items-center justify-between gap-3 border-b border-stone-100 py-2.5 text-sm last:border-0">
                <Link href={`/lecciones/${l.id}`} className="group flex min-w-0 items-start gap-3">
                  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal-50 text-xs font-bold tabular text-brand-teal-800 transition group-hover:bg-brand-teal group-hover:text-white">
                    {l.number}
                  </span>
                  <span className="min-w-0">
                    <span className="font-semibold group-hover:text-brand-teal">{l.title}</span>
                    {l.summary && <span className="block truncate text-stone-500">{l.summary}</span>}
                  </span>
                </Link>
                {editable && (
                  <Link href={`/lecciones/${l.id}/editar`} className="btn btn-ghost btn-sm shrink-0">
                    Editar
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editable && (
        <>
          <h2 className="mb-2 section-title flex items-center gap-2"><Icon name="plus" className="h-4 w-4 text-brand-teal" />Nueva unidad</h2>
          <LessonForm cycleId={cycle.id} nextNumber={nextNumber} />
        </>
      )}
    </div>
  );
}
