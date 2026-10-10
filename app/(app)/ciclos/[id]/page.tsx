import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash } from "@/components/Flash";
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
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <Link href={`/curriculums/${cycle.curriculum_id}${cycle.version_id ? `?v=${cycle.version_id}` : ""}`} className="text-sm text-brand-teal hover:underline">
        ← {cycle.curriculums?.name}
      </Link>
      <h1 className="mt-2 text-2xl font-medium">
        Módulo {cycle.number}
        {cycle.title ? ` · ${cycle.title}` : ""}
      </h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        {lessons.length} {lessons.length === 1 ? "unidad" : "unidades"}
        {ver ? ` · Versión ${ver.version} (${STATUS_LABEL[ver.status].toLowerCase()})` : ""}
      </p>
      {!editable && (
        <p className="mb-4 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
          Esta versión no se puede editar. Copia la versión desde el currículum para hacer cambios.
        </p>
      )}
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
        {lessons.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-500">Todavía no hay unidades.{editable ? " Crea la primera abajo." : ""}</p>
        ) : (
          <ul>
            {lessons.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 border-b border-stone-100 py-2.5 text-sm last:border-0">
                <Link href={`/lecciones/${l.id}`} className="hover:underline">
                  <span className="mr-2 text-stone-400">{l.number}.</span>
                  <span className="font-medium">{l.title}</span>
                  {l.summary && <span className="ml-2 text-stone-500">{l.summary}</span>}
                </Link>
                {editable && (
                  <Link href={`/lecciones/${l.id}/editar`} className="shrink-0 text-xs text-brand-teal hover:underline">
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
          <h2 className="mb-2 text-sm font-medium">Nueva unidad</h2>
          <LessonForm cycleId={cycle.id} nextNumber={nextNumber} />
        </>
      )}
    </div>
  );
}
