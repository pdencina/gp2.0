import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LeccionPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { supabase, role } = await getSession();

  const { data } = await supabase
    .from("lessons")
    .select("id, cycle_id, number, title, summary, content, questions, video_url, cycles(number, title, curriculums(name))")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const lesson = data as unknown as {
    id: string;
    cycle_id: string;
    number: number;
    title: string;
    summary: string | null;
    content: string | null;
    questions: string | null;
    video_url: string | null;
    cycles: { number: number; title: string | null; curriculums: { name: string } | null } | null;
  };

  // Solo las lecciones a las que tienes acceso (RLS), para ubicar la anterior y la siguiente.
  const { data: all } = await supabase
    .from("lessons")
    .select("id, number, title")
    .eq("cycle_id", lesson.cycle_id)
    .order("number");
  const list = (all ?? []) as { id: string; number: number; title: string }[];
  const i = list.findIndex((l) => l.id === lesson.id);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;

  // Materiales de la unidad y de su módulo (la base de datos decide cuáles puede ver cada persona)
  const { data: mats } = await supabase
    .from("resources")
    .select("id, name, kind, description")
    .eq("cycle_id", lesson.cycle_id)
    .eq("archived", false)
    .or(`unit_id.eq.${lesson.id},unit_id.is.null`)
    .order("created_at");
  const materials = (mats ?? []) as { id: string; name: string; kind: string | null; description: string | null }[];

  const canEdit = role === "admin" || role === "coordinador";
  const where = `${lesson.cycles?.curriculums?.name ?? ""} · Ciclo ${lesson.cycles?.number ?? ""}`;
  const paragraphs = (lesson.content ?? "").split(/\n\s*\n/).filter((p) => p.trim());
  const questions = (lesson.questions ?? "").split("\n").map((q) => q.trim()).filter(Boolean);

  return (
    <div className="enter mx-auto max-w-2xl p-4 pb-16 md:p-8 md:pb-16">
      <div className="flex items-center justify-between text-sm">
        <Link href={canEdit ? `/ciclos/${lesson.cycle_id}` : "/inicio"} className="link">
          ← {canEdit ? "Lecciones del ciclo" : "Inicio"}
        </Link>
        {canEdit && (
          <Link href={`/lecciones/${lesson.id}/editar`} className="link">
            Editar
          </Link>
        )}
      </div>

      <p className="mt-4 text-sm text-stone-500">
        {where} · Lección {lesson.number}
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

      {materials.length > 0 && (
        <section className="mt-8 rounded-xl bg-white p-5 ring-1 ring-stone-200">
          <h2 className="mb-3 font-medium">Materiales</h2>
          <ul className="space-y-2">
            {materials.map((m) => (
              <li key={m.id}>
                <a href={`/api/materiales/${m.id}`} target="_blank" rel="noopener noreferrer" className="link">
                  {m.name}
                </a>
                {m.description && <span className="ml-2 text-sm text-stone-500">{m.description}</span>}
              </li>
            ))}
          </ul>
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
