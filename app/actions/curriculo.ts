"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { intOrNull, orNull, text } from "@/lib/action-helpers";
import { friendly } from "@/lib/action-helpers";
import { isValidAudience, isValidKind, safeFileName } from "@/lib/materials";

const base = (cid: string, v?: string) => `/curriculums/${cid}${v ? `?v=${v}` : ""}`;
const withParam = (path: string, key: string, value: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

function back(path: string, error?: string): never {
  revalidatePath(path.split("?")[0]);
  redirect(error ? withParam(path, "error", friendly(error)) : withParam(path, "ok", "1"));
}

// ---------- Versiones y flujo editorial ----------
const STATES = ["en_adaptacion", "en_revision_pastoral", "aprobado", "publicado", "archivado"];

export async function cambiarEstadoVersion(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const v = text(fd, "version_id");
  const to = text(fd, "to");
  const path = base(cid, v);
  if (!STATES.includes(to)) back(path, "Ese paso no existe.");
  const { error } = await (await createClient()).rpc("advance_curriculum_version", {
    vid: v,
    to_status: to,
    note: orNull(text(fd, "note")),
  });
  back(path, error?.message);
}

export async function copiarVersion(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const { data, error } = await (await createClient()).rpc("clone_version", {
    from_vid: text(fd, "version_id"),
    new_label: orNull(text(fd, "label")),
  });
  if (error) back(base(cid, text(fd, "version_id")), error.message);
  revalidatePath(`/curriculums/${cid}`);
  redirect(withParam(base(cid, data as string), "ok", "1"));
}

export async function agregarRevisor(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const reviewer = text(fd, "reviewer_id");
  if (!reviewer) back(base(cid, text(fd, "version_id")), "Elige a la persona que revisará.");
  const { error } = await (await createClient()).from("curriculum_reviewers").insert({ curriculum_id: cid, reviewer_id: reviewer });
  back(base(cid, text(fd, "version_id")), error?.message);
}

export async function quitarRevisor(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const { error } = await (await createClient())
    .from("curriculum_reviewers")
    .delete()
    .eq("curriculum_id", cid)
    .eq("reviewer_id", text(fd, "reviewer_id"));
  back(base(cid, text(fd, "version_id")), error?.message);
}

export async function crearModulo(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const v = text(fd, "version_id");
  const path = base(cid, v);
  const number = intOrNull(text(fd, "number"));
  if (!number || number < 1) back(path, "Escribe el número del módulo.");
  const year = intOrNull(text(fd, "formative_year")) ?? 1;
  const stage = text(fd, "stage_kind");
  const { error } = await (await createClient()).from("cycles").insert({
    curriculum_id: cid,
    version_id: v,
    number,
    title: orNull(text(fd, "title")),
    classes: intOrNull(text(fd, "classes")) ?? 11,
    formative_year: Math.max(1, year),
    stage_kind: ["modulo", "nivel", "etapa", "anio"].includes(stage) ? stage : "modulo",
    prerequisite_cycle_id: orNull(text(fd, "prerequisite_cycle_id")),
  });
  back(path, error?.message);
}

// ---------- Plan de 36 encuentros ----------
const planPath = (cid: string, v: string, year: number) => `/curriculums/${cid}/plan?v=${v}&year=${year}`;

export async function proponerDistribucion(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const v = text(fd, "version_id");
  const year = intOrNull(text(fd, "year")) ?? 1;
  const { error } = await (await createClient()).rpc("propose_plan_distribution", { vid: v, year });
  back(planPath(cid, v, year), error?.message);
}

export async function guardarPosicion(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const v = text(fd, "version_id");
  const year = intOrNull(text(fd, "year")) ?? 1;
  const supabase = await createClient();
  const plan = await supabase.rpc("ensure_plan", { vid: v, year });
  if (plan.error) back(planPath(cid, v, year), plan.error.message);
  const { error } = await supabase.rpc("save_plan_slot", {
    pid: plan.data as string,
    pos: intOrNull(text(fd, "position")) ?? 0,
    slot_kind: text(fd, "kind") || "contenido",
    slot_title: text(fd, "title"),
    slot_notes: text(fd, "notes"),
    unit_ids: fd.getAll("unit").map(String),
  });
  back(planPath(cid, v, year), error?.message);
}

// ---------- Biblioteca de materiales ----------
// 1) El navegador pide un permiso de subida; 2) sube el archivo directo a Storage (sin pasar por el servidor,
// que limita el tamaño); 3) registra el material.
export async function prepararSubida(curriculumId: string, fileName: string, size: number) {
  if (!/^[0-9a-f-]{36}$/i.test(curriculumId)) return { error: "Programa no válido." };
  if (!Number.isFinite(size) || size <= 0 || size > 50 * 1024 * 1024) return { error: "El archivo debe pesar hasta 50 MB." };
  const path = `${curriculumId}/${randomUUID()}-${safeFileName(fileName)}`;
  const { data, error } = await (await createClient()).storage.from("materiales").createSignedUploadUrl(path);
  if (error || !data) return { error: "No tienes permiso para subir archivos a este programa." };
  return { path: data.path, token: data.token };
}

export async function registrarMaterial(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const dest = withParam("/biblioteca", "programa", cid);
  const name = text(fd, "name");
  if (name.length < 2) back(dest, "Ponle un nombre al material.");
  const kind = text(fd, "kind") || "otro";
  const audience = text(fd, "audience");
  if (!isValidKind(kind) || !isValidAudience(audience)) back(dest, "Elige el tipo y para quién es el material.");

  const url = text(fd, "read_url");
  const filePath = text(fd, "file_path");
  if (!url && !filePath) back(dest, "Sube un archivo o pega un enlace.");
  if (url && !/^https:\/\/\S+$/.test(url)) back(dest, "El enlace debe comenzar con https://");
  if (filePath && !filePath.startsWith(`${cid}/`)) back(dest, "El archivo no pertenece a este programa.");

  const [kindLink, linkId] = text(fd, "link").split(":"); // "ciclo:<id>" o "unidad:<id>"
  const { error } = await (await createClient()).from("resources").insert({
    curriculum_id: cid,
    name,
    kind,
    audience,
    read_url: orNull(url),
    file_path: orNull(filePath),
    file_name: orNull(text(fd, "file_name")),
    mime_type: orNull(text(fd, "mime_type")),
    size_bytes: intOrNull(text(fd, "size_bytes")),
    description: orNull(text(fd, "description")),
    source_note: orNull(text(fd, "source_note")),
    cycle_id: kindLink === "ciclo" ? linkId : null,
    unit_id: kindLink === "unidad" ? linkId : null,
  });
  back(dest, error?.message);
}

export async function vincularMaterial(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const [kindLink, linkId] = text(fd, "link").split(":");
  const { data, error } = await (await createClient())
    .from("resources")
    .update({ cycle_id: kindLink === "ciclo" ? linkId : null, unit_id: kindLink === "unidad" ? linkId : null })
    .eq("id", text(fd, "id"))
    .select("id");
  back(withParam("/biblioteca", "programa", cid), error?.message ?? (data?.length ? undefined : "No tienes permiso para hacer este cambio."));
}

export async function archivarMaterial(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const archived = text(fd, "archived") === "si";
  const { data, error } = await (await createClient()).from("resources").update({ archived }).eq("id", text(fd, "id")).select("id");
  back(withParam("/biblioteca", "programa", cid), error?.message ?? (data?.length ? undefined : "No tienes permiso para hacer este cambio."));
}
