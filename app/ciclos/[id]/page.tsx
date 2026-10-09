import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { Flash } from "@/components/Flash";
import { LessonForm } from "@/components/LessonForm";

export const dynamic = "force-dynamic";

export default async function CicloPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect("/inicio");

  const { data } = await supabase
    .from("cycles")
    .select("id, number, title, curriculum_id, curriculums(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const cycle = data as unknown as {
    id: string;
    number: number;
    title: string | null;
    curriculum_id: string;
    curriculums: { name: string } | null;
  };

  const { data: rows } = await supabase
    .from("lessons")
    .select("id, number, title, summary")
    .eq("cycle_id", cycle.id)
    .order("number");
  const lessons = (rows ?? []) as { id: string; number: number; title: string; summary: string | null }[];
  const nextNumber = (lessons[lessons.length - 1]?.number ?? 0) + 1;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <AppHeader role={role} />
      <Link href={`/curriculums/${cycle.curriculum_id}`} className="text-sm text-brand-teal hover:underline">
        ← {cycle.curriculums?.name}
      </Link>
      <h1 className="mt-2 text-2xl font-medium">
        Ciclo {cycle.number}
        {cycle.title ? ` · ${cycle.title}` : ""}
      </h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        {lessons.length} {lessons.length === 1 ? "lección" : "lecciones"}
      </p>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
        {lessons.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-500">Todavía no hay lecciones. Crea la primera abajo.</p>
        ) : (
          <ul>
            {lessons.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 border-b border-stone-100 py-2.5 text-sm last:border-0">
                <Link href={`/lecciones/${l.id}`} className="hover:underline">
                  <span className="mr-2 text-stone-400">{l.number}.</span>
                  <span className="font-medium">{l.title}</span>
                  {l.summary && <span className="ml-2 text-stone-500">{l.summary}</span>}
                </Link>
                <Link href={`/lecciones/${l.id}/editar`} className="shrink-0 text-xs text-brand-teal hover:underline">
                  Editar
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mb-2 text-sm font-medium">Nueva lección</h2>
      <LessonForm cycleId={cycle.id} nextNumber={nextNumber} />
    </div>
  );
}
