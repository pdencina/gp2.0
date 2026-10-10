import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { Icon } from "@/components/Icon";

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
      <div className="enter flex items-center justify-between text-sm">
        <Link href={canEdit ? `/ciclos/${lesson.cycle_id}` : "/inicio"} className="inline-flex items-center gap-1 font-medium text-stone-500 transition hover:text-brand-teal">
          <Icon name="arrow-left" className="h-4 w-4" />
          {canEdit ? "Lecciones del ciclo" : "Inicio"}
        </Link>
        {canEdit && (
          <Link href={`/lecciones/${lesson.id}/editar`} className="btn btn-secondary btn-sm">
            Editar
          </Link>
        )}
      </div>

      <header className="enter mt-5">
        <p className="eyebrow">
          {where} · Lección {lesson.number}
        </p>
        <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">{lesson.title}</h1>
        {lesson.summary && <p className="mt-3 text-lg text-stone-600">{lesson.summary}</p>}
      </header>

      {lesson.video_url && (
        <a href={lesson.video_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-5">
          <Icon name="video" className="h-4 w-4" />
          Ver video de la lección
        </a>
      )}

      <article className="enter mt-6 space-y-4 text-[1.0625rem] leading-relaxed text-stone-800">
        {paragraphs.map((p, idx) => (
          <p key={idx} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </article>

      {questions.length > 0 && (
        <section className="card mt-8 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Icon name="users" className="h-4 w-4 text-brand-teal" />
            Para conversar en el grupo
          </h2>
          <ol className="space-y-3">
            {questions.map((q, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-teal-50 text-xs font-bold tabular text-brand-teal-800">
                  {idx + 1}
                </span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {materials.length > 0 && (
        <section className="card mt-8 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Icon name="library" className="h-4 w-4 text-brand-teal" />
            Materiales
          </h2>
          <ul className="space-y-1">
            {materials.map((m) => (
              <li key={m.id}>
                <a href={`/api/materiales/${m.id}`} target="_blank" rel="noopener noreferrer" className="group row flex items-center gap-3 rounded-xl px-2 py-2 text-sm transition hover:bg-brand-teal-50/50">
                  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-teal-50 text-brand-teal">
                    <Icon name="file" className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium group-hover:text-brand-teal">{m.name}</span>
                    {m.description && <span className="block text-xs text-stone-500">{m.description}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="mt-8 flex justify-between gap-3 text-sm">
        {prev ? (
          <Link href={`/lecciones/${prev.id}`} className="card card-hover flex items-center gap-2 px-3.5 py-2.5">
            <Icon name="arrow-left" className="h-4 w-4 shrink-0 text-brand-teal" />
            <span className="min-w-0 truncate">{prev.number}. {prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/lecciones/${next.id}`} className="card card-hover flex items-center gap-2 px-3.5 py-2.5">
            <span className="min-w-0 truncate">{next.number}. {next.title}</span>
            <Icon name="arrow-right" className="h-4 w-4 shrink-0 text-brand-teal" />
          </Link>
        )}
      </nav>
    </div>
  );
}
