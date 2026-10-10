import { fieldClass, primaryBtn } from "@/components/Flash";
import { guardarLeccion } from "@/app/actions/gestion";

type Lesson = {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  content: string | null;
  questions: string | null;
  video_url: string | null;
};

const area =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20";

export function LessonForm({
  cycleId,
  lesson,
  nextNumber,
}: {
  cycleId: string;
  lesson?: Lesson;
  nextNumber?: number;
}) {
  return (
    <form action={guardarLeccion} className="space-y-3 card p-4">
      <input type="hidden" name="id" value={lesson?.id ?? ""} />
      <input type="hidden" name="cycle_id" value={cycleId} />

      <div className="grid gap-3 md:grid-cols-[110px_1fr]">
        <label className="text-xs text-stone-500">
          Número
          <input
            name="number"
            type="number"
            min={1}
            inputMode="numeric"
            defaultValue={lesson?.number ?? nextNumber ?? 1}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className="text-xs text-stone-500">
          Título
          <input name="title" defaultValue={lesson?.title ?? ""} placeholder="Ej. La oración" className={`${fieldClass} mt-1`} />
        </label>
      </div>

      <label className="block text-xs text-stone-500">
        Resumen (una o dos frases)
        <input name="summary" defaultValue={lesson?.summary ?? ""} className={`${fieldClass} mt-1`} />
      </label>

      <label className="block text-xs text-stone-500">
        Contenido (separa los párrafos con una línea en blanco)
        <textarea name="content" rows={10} defaultValue={lesson?.content ?? ""} className={`${area} mt-1`} />
      </label>

      <label className="block text-xs text-stone-500">
        Preguntas para conversar (una por línea)
        <textarea name="questions" rows={4} defaultValue={lesson?.questions ?? ""} className={`${area} mt-1`} />
      </label>

      <label className="block text-xs text-stone-500">
        Enlace de video (opcional, https://…)
        <input name="video_url" type="url" defaultValue={lesson?.video_url ?? ""} className={`${fieldClass} mt-1`} />
      </label>

      <button className={primaryBtn}>{lesson ? "Guardar cambios" : "Crear lección"}</button>
    </form>
  );
}
