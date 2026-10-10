import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { LessonForm } from "@/components/LessonForm";

export const dynamic = "force-dynamic";

export default async function EditarLeccionPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect(`/lecciones/${params.id}`);

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, cycle_id, number, title, summary, content, questions, video_url")
    .eq("id", params.id)
    .maybeSingle();
  if (!lesson) notFound();

  return (
    <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
      <Link href={`/lecciones/${lesson.id}`} className="text-sm link">
        ← Ver lección
      </Link>
      <h1 className="mb-5 mt-2 page-title">Editar lección {lesson.number}</h1>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <LessonForm cycleId={lesson.cycle_id} lesson={lesson} />
    </div>
  );
}
