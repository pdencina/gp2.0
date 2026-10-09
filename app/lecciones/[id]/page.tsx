import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function LeccionPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { supabase, role } = await getSession();

  const { data } = await supabase
    .from("lessons")
    .select("id, curriculum_id, number, title, summary, content, questions, video_url, curriculums(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const lesson = data as unknown as {
    id: string;
    curriculum_id: string;
    number: number;
    title: string;
    summary: string | null;
    content: string | null;
    questions: string | null;
    video_url: string | null;
    curriculums: { name: string } | null;
  };

  // Solo las lecciones a las que tienes acceso (RLS), para ubicar la anterior y la siguiente.
  const { data: all } = await supabase
    .from("lessons")
    .select("id, number, title")
    .eq("curriculum_id", lesson.curriculum_id)
    .order("number");
  const list = (all ?? []) as { id: string; number: number; title: string }[];
  const i = list.findIndex((l) => l.id === lesson.id);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;

  const canEdit = role === "admin" || role === "coordinador";
  const curriculumName = lesson.curriculums?.name;
  const paragraphs = (lesson.content ?? "").split(/\n\s*\n/).filter((p) => p.trim());
  const questions = (lesson.questions ?? "").split("\n").map((q) => q.trim()).filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <AppHeader role={role} />
      <div className="flex items-center justify-between text-sm">
        <Link href={canEdit ? `/curriculums/${lesson.curriculum_id}` : "/inicio"} className="text-brand-teal hover:underline">
          ← {canEdit ? curriculumName : "Inicio"}
        </Link>
        {canEdit && (
          <Link href={`/lecciones/${lesson.id}/editar`} className="text-brand-teal hover:underline">
            Editar
          </Link>
        )}
      </div>

      <p className="mt-4 text-sm text-stone-500">
        {curriculumName} · Lección {lesson.number}
      </p>
      <h1 className="mt-1 text-3xl font-medium leading-tight">{lesson.title}</h1>
      {lesson.summary && <p className="mt-3 text-lg text-stone-600">{lesson.summary}</p>}

      {lesson.video_url && (
        <a
          href={lesson.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-block rounded-lg bg-brand-teal px-4 py-2.5 text-sm font-medium text-white hover:brightness-95"
        >
          Ver video de la lección
        </a>
      )}

      <article className="mt-6 space-y-4 text-base leading-relaxed">
        {paragraphs.map((p, idx) => (
          <p key={idx} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </article>

      {questions.length > 0 && (
        <section className="mt-8 rounded-xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="mb-3 font-medium">Para conversar en el grupo</h2>
          <ol className="list-decimal space-y-2 pl-5">
            {questions.map((q, idx) => (
              <li key={idx}>{q}</li>
            ))}
          </ol>
        </section>
      )}

      <nav className="mt-8 flex justify-between gap-3 text-sm">
        {prev ? (
          <Link href={`/lecciones/${prev.id}`} className="rounded-lg border border-stone-300 px-3 py-2 hover:bg-white">
            ← {prev.number}. {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/lecciones/${next.id}`} className="rounded-lg border border-stone-300 px-3 py-2 hover:bg-white">
            {next.number}. {next.title} →
          </Link>
        )}
      </nav>
    </div>
  );
}
