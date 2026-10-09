"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const orNull = (v: string) => (v === "" ? null : v);

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("row-level security")) return "No tienes permiso para hacer este cambio.";
  if (m.includes("groups_one_group_per_leader")) return "Ese líder ya tiene un grupo asignado.";
  if (m.includes("duplicate key")) return "Esa persona ya está en el grupo.";
  return message;
}

function finish(path: string, error?: string): never {
  revalidatePath(path);
  redirect(error ? `${path}?error=${encodeURIComponent(friendly(error))}` : `${path}?ok=1`);
}

export async function crearCurriculum(fd: FormData) {
  const name = text(fd, "name");
  if (name.length < 2) finish("/curriculums", "Escribe el nombre del currículum.");
  const { error } = await createClient()
    .from("curriculums")
    .insert({ name, description: orNull(text(fd, "description")) });
  finish("/curriculums", error?.message);
}

export async function asignarCoordinador(fd: FormData) {
  const { data, error } = await createClient()
    .from("curriculums")
    .update({ coordinator_id: orNull(text(fd, "coordinator_id")) })
    .eq("id", text(fd, "id"))
    .select("id");
  finish("/curriculums", error?.message ?? (data?.length ? undefined : "No tienes permiso para hacer este cambio."));
}

export async function crearGrupo(fd: FormData) {
  const name = text(fd, "name");
  if (name.length < 2) finish("/grupos", "Escribe el nombre del grupo.");
  if (!text(fd, "curriculum_id")) finish("/grupos", "Elige un currículum.");

  const { data, error } = await createClient()
    .from("groups")
    .insert({
      curriculum_id: text(fd, "curriculum_id"),
      name,
      meeting_day: orNull(text(fd, "meeting_day")),
      meeting_time: orNull(text(fd, "meeting_time")),
      location: orNull(text(fd, "location")),
    })
    .select("id")
    .single();
  if (error || !data) finish("/grupos", error?.message ?? "No se pudo crear el grupo.");
  revalidatePath("/grupos");
  redirect(`/grupos/${data.id}?ok=1`);
}

export async function asignarResponsables(fd: FormData) {
  const id = text(fd, "id");
  const path = `/grupos/${id}`;
  const { data, error } = await createClient()
    .from("groups")
    .update({
      monitor_id: orNull(text(fd, "monitor_id")),
      leader_id: orNull(text(fd, "leader_id")),
    })
    .eq("id", id)
    .select("id");
  finish(path, error?.message ?? (data?.length ? undefined : "No tienes permiso para hacer este cambio."));
}

export async function agregarAlumno(fd: FormData) {
  const group_id = text(fd, "group_id");
  const student_id = text(fd, "student_id");
  const path = `/grupos/${group_id}`;
  if (!student_id) finish(path, "Elige a la persona que quieres agregar.");
  const { error } = await createClient().from("group_members").insert({ group_id, student_id });
  finish(path, error?.message);
}

export async function guardarAsistencia(fd: FormData) {
  const group_id = text(fd, "group_id");
  const held_on = text(fd, "held_on");
  const lesson = parseInt(text(fd, "lesson_number"), 10);
  const back = `/grupos/${group_id}/lista`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(held_on)) finish(back, "Elige una fecha válida.");
  const present = fd.getAll("present").map(String);

  const { error } = await createClient().rpc("save_attendance", {
    gid: group_id,
    day: held_on,
    lesson: Number.isFinite(lesson) && lesson > 0 ? lesson : null,
    present,
  });
  if (error) finish(back, error.message);
  revalidatePath(`/grupos/${group_id}`);
  revalidatePath("/inicio");
  redirect(`/grupos/${group_id}?lista=${present.length}`);
}

export async function registrarContacto(fd: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const kind = text(fd, "kind");
  if (!["llamada", "mensaje", "visita"].includes(kind)) finish("/alertas", "Elige cómo contactaste a la persona.");

  const { error } = await supabase.from("contacts").insert({
    student_id: text(fd, "student_id"),
    group_id: text(fd, "group_id"),
    contacted_by: user.id,
    kind,
    note: orNull(text(fd, "note")),
  });
  revalidatePath("/inicio");
  finish("/alertas", error?.message);
}

export async function quitarAlumno(fd: FormData) {
  const group_id = text(fd, "group_id");
  const { error } = await createClient()
    .from("group_members")
    .delete()
    .eq("group_id", group_id)
    .eq("student_id", text(fd, "student_id"));
  finish(`/grupos/${group_id}`, error?.message);
}
