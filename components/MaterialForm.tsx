"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { prepararSubida, registrarMaterial } from "@/app/actions/curriculo";
import { AUDIENCES, MATERIAL_KINDS, formatSize } from "@/lib/materials";
import { fieldClass, primaryBtn } from "@/components/Flash";

export type LinkOption = { value: string; label: string; group: string };

type Uploaded = { path: string; name: string; type: string; size: number };

const MAX = 50 * 1024 * 1024;

export function MaterialForm({ curriculumId, links }: { curriculumId: string; links: LinkOption[] }) {
  const [mode, setMode] = useState<"archivo" | "enlace">("archivo");
  const [state, setState] = useState<"idle" | "subiendo" | "listo" | "error">("idle");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<Uploaded | null>(null);

  const groups = Array.from(new Set(links.map((l) => l.group)));

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFile(null);
    if (!f) return setState("idle");
    if (f.size > MAX) {
      setState("error");
      return setMessage("El archivo pesa más de 50 MB. Súbelo comprimido o pega un enlace.");
    }
    setState("subiendo");
    setMessage("");
    const prep = await prepararSubida(curriculumId, f.name, f.size);
    if ("error" in prep && prep.error) {
      setState("error");
      return setMessage(prep.error);
    }
    const { path, token } = prep as { path: string; token: string };
    const { error } = await createClient().storage.from("materiales").uploadToSignedUrl(path, token, f, { contentType: f.type || undefined });
    if (error) {
      setState("error");
      return setMessage("No se pudo subir el archivo. Revisa su tipo (PDF, video, audio, presentación, documento o imagen) e inténtalo de nuevo.");
    }
    setFile({ path, name: f.name, type: f.type, size: f.size });
    setState("listo");
  }

  const canSubmit = mode === "enlace" || state === "listo";

  return (
    <form action={registrarMaterial} className="card p-4">
      <h2 className="mb-3 section-title">Agregar un material</h2>
      <input type="hidden" name="curriculum_id" value={curriculumId} />
      {mode === "archivo" && file && (
        <>
          <input type="hidden" name="file_path" value={file.path} />
          <input type="hidden" name="file_name" value={file.name} />
          <input type="hidden" name="mime_type" value={file.type} />
          <input type="hidden" name="size_bytes" value={file.size} />
        </>
      )}

      <div className="mb-3 flex gap-4 text-sm" role="radiogroup" aria-label="Origen del material">
        {(["archivo", "enlace"] as const).map((m) => (
          <label key={m} className="flex items-center gap-2">
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} /> {m === "archivo" ? "Subir un archivo" : "Pegar un enlace"}
          </label>
        ))}
      </div>

      {mode === "archivo" ? (
        <div className="mb-3">
          <input type="file" onChange={onPick} aria-label="Archivo" className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-stone-300 file:bg-white file:px-3 file:py-2 file:text-sm hover:file:bg-stone-50" />
          <p className="mt-1 text-xs text-stone-500" aria-live="polite">
            {state === "subiendo" && "Subiendo…"}
            {state === "listo" && file && `✓ ${file.name} (${formatSize(file.size)}) subido`}
            {state === "error" && <span className="text-red-700">{message}</span>}
            {state === "idle" && "PDF, video, audio, presentación, documento o imagen. Hasta 50 MB. El archivo es privado."}
          </p>
        </div>
      ) : (
        <input name="read_url" placeholder="https://…" aria-label="Enlace" className={`${fieldClass} mb-3`} />
      )}

      <div className="grid gap-2 md:grid-cols-2">
        <input name="name" placeholder="Nombre del material" aria-label="Nombre" className={fieldClass} />
        <select name="kind" defaultValue="libro" aria-label="Tipo" className={fieldClass}>
          {MATERIAL_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <select name="audience" defaultValue="equipo" aria-label="Para quién es" className={fieldClass}>
          {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <select name="link" defaultValue="" aria-label="Dónde se usa" className={fieldClass}>
          <option value="">Sin ubicar todavía (solo biblioteca)</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {links.filter((l) => l.group === g).map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </optgroup>
          ))}
        </select>
        <input name="description" placeholder="Descripción (opcional)" aria-label="Descripción" className={`${fieldClass} md:col-span-2`} />
        <input name="source_note" placeholder="Origen o autoría (ej. edición, año, quién lo entregó)" aria-label="Origen" className={`${fieldClass} md:col-span-2`} />
      </div>
      <button disabled={!canSubmit || state === "subiendo"} className={`${primaryBtn} mt-3 disabled:opacity-50`}>
        Guardar en la biblioteca
      </button>
    </form>
  );
}
