import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash, fieldClass } from "@/components/Flash";
import { MaterialForm, type LinkOption } from "@/components/MaterialForm";
import { archivarMaterial, vincularMaterial } from "@/app/actions/curriculo";
import { AUDIENCES, formatSize, kindLabel } from "@/lib/materials";
import { isEditable, type EditorialStatus } from "@/lib/versions";

export const dynamic = "force-dynamic";

type Program = { id: string; name: string };
type Resource = {
  id: string;
  name: string;
  kind: string | null;
  audience: string;
  read_url: string | null;
  file_path: string | null;
  file_name: string | null;
  size_bytes: number | null;
  description: string | null;
  source_note: string | null;
  archived: boolean;
  cycle_id: string | null;
  unit_id: string | null;
  created_at: string;
};
type CycleRow = {
  id: string;
  number: number;
  title: string | null;
  curriculum_versions: { version: number; status: EditorialStatus; content_frozen: boolean } | null;
};
type LessonRow = { id: string; number: number; title: string; cycle_id: string };

const dateEs = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

export default async function BibliotecaPage(props: {
  searchParams: Promise<{ error?: string; ok?: string; programa?: string; ver?: string }>;
}) {
  const sp = await props.searchParams;
  const { supabase, user, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect("/inicio");

  // Programas que puede alimentar: todos (administrador) o los que coordina
  const { data: all } = await supabase.from("curriculums").select("id, name").order("name");
  let programs = (all ?? []) as Program[];
  if (role !== "admin") {
    const { data: mine } = await supabase.from("curriculum_coordinators").select("curriculum_id").eq("coordinator_id", user.id);
    const ids = new Set(((mine ?? []) as { curriculum_id: string }[]).map((m) => m.curriculum_id));
    programs = programs.filter((p) => ids.has(p.id));
  }
  const program = programs.find((p) => p.id === sp.programa) ?? programs[0];

  if (!program) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <h1 className="text-2xl font-medium">Biblioteca</h1>
        <p className="mt-4 rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          No coordinas ningún programa todavía.
        </p>
      </div>
    );
  }

  const [resR, cycR] = await Promise.all([
    supabase
      .from("resources")
      .select("id, name, kind, audience, read_url, file_path, file_name, size_bytes, description, source_note, archived, cycle_id, unit_id, created_at")
      .eq("curriculum_id", program.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("cycles")
      .select("id, number, title, curriculum_versions:version_id(version, status, content_frozen)")
      .eq("curriculum_id", program.id)
      .order("number"),
  ]);
  if (resR.error) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <h1 className="text-2xl font-medium">Biblioteca</h1>
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          Falta instalar la biblioteca en la base de datos: ejecuta <code>supabase/v2/009_biblioteca.sql</code> en el SQL Editor de Supabase.
        </p>
      </div>
    );
  }
  const resources = (resR.data ?? []) as Resource[];
  const cycles = (cycR.data ?? []) as unknown as CycleRow[];
  const editableCycles = cycles.filter((c) => c.curriculum_versions && isEditable(c.curriculum_versions));
  const { data: lessonRows } = cycles.length
    ? await supabase.from("lessons").select("id, number, title, cycle_id").in("cycle_id", cycles.map((c) => c.id)).order("number")
    : { data: [] };
  const lessons = (lessonRows ?? []) as LessonRow[];

  // Dónde se puede ubicar un material: solo en versiones que todavía se editan
  const links: LinkOption[] = editableCycles.flatMap((c) => {
    const group = `Versión ${c.curriculum_versions?.version} · Módulo ${c.number}${c.title ? ` (${c.title})` : ""}`;
    return [
      { value: `ciclo:${c.id}`, label: "Todo el módulo", group },
      ...lessons.filter((l) => l.cycle_id === c.id).map((l) => ({ value: `unidad:${l.id}`, label: `Unidad ${l.number}. ${l.title}`, group })),
    ];
  });

  const cycleById = new Map(cycles.map((c) => [c.id, c]));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const where = (r: Resource) => {
    if (r.unit_id) {
      const l = lessonById.get(r.unit_id);
      const c = l ? cycleById.get(l.cycle_id) : undefined;
      return l ? `Versión ${c?.curriculum_versions?.version} · Módulo ${c?.number} · Unidad ${l.number}` : "Unidad";
    }
    if (r.cycle_id) {
      const c = cycleById.get(r.cycle_id);
      return `Versión ${c?.curriculum_versions?.version} · Módulo ${c?.number}`;
    }
    return "Sin ubicar";
  };
  const audienceLabel = (a: string) => AUDIENCES.find((x) => x.value === a)?.label.split(" (")[0] ?? a;
  const active = resources.filter((r) => !r.archived);
  const archived = resources.filter((r) => r.archived);

  const row = (r: Resource) => (
    <li key={r.id} className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <p className="font-medium">
            <Link href={`/api/materiales/${r.id}`} target="_blank" className="hover:underline">{r.name}</Link>
            <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-normal text-stone-600">{kindLabel(r.kind)}</span>
            <span className={`ml-1 rounded px-1.5 py-0.5 text-xs font-normal ${r.audience === "participantes" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
              {audienceLabel(r.audience)}
            </span>
          </p>
          <p className="text-xs text-stone-500">
            {where(r)} · {r.file_path ? `${r.file_name ?? "Archivo"} ${formatSize(r.size_bytes)}` : "Enlace"} · {dateEs(r.created_at)}
          </p>
          {r.description && <p className="text-xs text-stone-500">{r.description}</p>}
          {r.source_note && <p className="text-xs text-stone-400">Origen: {r.source_note}</p>}
        </div>
        <form action={archivarMaterial}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="curriculum_id" value={program.id} />
          <input type="hidden" name="archived" value={r.archived ? "no" : "si"} />
          <button className="text-xs text-stone-500 hover:text-brand-teal hover:underline">{r.archived ? "Restaurar" : "Archivar"}</button>
        </form>
      </div>
      {!r.archived && links.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-brand-teal">Cambiar dónde se usa</summary>
          <form action={vincularMaterial} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="curriculum_id" value={program.id} />
            <select name="link" defaultValue="" aria-label="Dónde se usa" className={`${fieldClass} md:max-w-md`}>
              <option value="">Sin ubicar</option>
              {Array.from(new Set(links.map((l) => l.group))).map((g) => (
                <optgroup key={g} label={g}>
                  {links.filter((l) => l.group === g).map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </optgroup>
              ))}
            </select>
            <button className="h-10 rounded-lg border border-brand-teal px-3 text-sm text-brand-teal hover:bg-brand-teal hover:text-white">Guardar</button>
          </form>
        </details>
      )}
    </li>
  );

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="text-2xl font-medium">Biblioteca</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Todo el material original de cada programa, en un solo lugar. Los archivos son privados: solo los ve quien corresponde, según para quién los marques y si su versión está publicada.
      </p>
      <Flash error={sp.error} ok={sp.ok} />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <label className="text-xs text-stone-500">
          Programa
          <select name="programa" defaultValue={program.id} className={`${fieldClass} mt-1 min-w-[16rem]`}>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button className="h-10 rounded-lg border border-stone-300 px-3 text-sm hover:bg-stone-50">Ver</button>
        <Link href={`/curriculums/${program.id}`} className="ml-auto text-sm text-brand-teal hover:underline">Currículum y versiones →</Link>
      </form>

      <MaterialForm curriculumId={program.id} links={links} />
      {links.length === 0 && (
        <p className="mt-2 text-xs text-stone-500">
          Este programa no tiene una versión en preparación con módulos: los materiales quedan sin ubicar hasta que las haya.
        </p>
      )}

      <h2 className="mb-2 mt-6 text-sm font-medium">{active.length} {active.length === 1 ? "material" : "materiales"}</h2>
      {active.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">Todavía no hay materiales de este programa.</p>
      ) : (
        <ul className="space-y-2">{active.map(row)}</ul>
      )}

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-stone-500">Archivados ({archived.length})</summary>
          <ul className="mt-2 space-y-2">{archived.map(row)}</ul>
        </details>
      )}
    </div>
  );
}
