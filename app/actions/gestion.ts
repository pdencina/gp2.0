"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const orNull = (v: string) => (v === "" ? null : v);
const intOrNull = (v: string) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("row-level security")) return "No tienes permiso para hacer este cambio.";
  if (m.includes("enrollments_one_active")) return "Ya estás inscrito en este currículum en esta temporada.";
  if (m.includes("lessons_cycle_id_number_key")) return "Ya existe una lección con ese número en este ciclo.";
  if (m.includes("cycles_curriculum_id_number_key")) return "Ya existe un ciclo con ese número en este currículum.";
  if (m.includes("seasons_name_key")) return "Ya existe una temporada con ese nombre.";
  if (m.includes("curriculums_name_key")) return "Ya existe un currículum con ese nombre.";
  if (m.includes("enrollments_person_id_group_id_key")) return "Esa persona ya estuvo inscrita en este grupo.";
  if (m.includes("duplicate key")) return "Ese registro ya existe.";
  if (m.includes("violates check constraint")) return "Algún dato no tiene un formato válido. Revísalo e inténtalo de nuevo.";
  return message;
}

function finish(path: string, error?: string): never {
  revalidatePath(path);
  redirect(error ? `${path}?error=${encodeURIComponent(friendly(error))}` : `${path}?ok=1`);
}

// Solo rutas internas, para no redirigir a otros sitios.
function backTo(fd: FormData, fallback: string) {
  const b = text(fd, "back");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
}

// ---------- Currículums, ciclos y temporadas ----------
export async function crearCurriculum(fd: FormData) {
  const name = text(fd, "name");
  if (name.length < 2) finish("/curriculums", "Escribe el nombre del currículum.");
  const { error } = await (await createClient()).from("curriculums").insert({
    name,
    description: orNull(text(fd, "description")),
    audience: text(fd, "audience") || "todos",
    age_min: intOrNull(text(fd, "age_min")),
    age_max: intOrNull(text(fd, "age_max")),
    default_capacity: intOrNull(text(fd, "default_capacity")) ?? 15,
    max_absences: intOrNull(text(fd, "max_absences")) ?? 3,
  });
  finish("/curriculums", error?.message);
}

export async function agregarCoordinador(fd: FormData) {
  const coordinator_id = text(fd, "coordinator_id");
  if (!coordinator_id) finish("/curriculums", "Elige a la persona que será coordinadora.");
  const { error } = await (await createClient())
    .from("curriculum_coordinators")
    .insert({ curriculum_id: text(fd, "curriculum_id"), coordinator_id });
  finish("/curriculums", error?.message);
}

export async function quitarCoordinador(fd: FormData) {
  const { error } = await (await createClient())
    .from("curriculum_coordinators")
    .delete()
    .eq("curriculum_id", text(fd, "curriculum_id"))
    .eq("coordinator_id", text(fd, "coordinator_id"));
  finish("/curriculums", error?.message);
}

export async function crearCiclo(fd: FormData) {
  const curriculum_id = text(fd, "curriculum_id");
  const path = `/curriculums/${curriculum_id}`;
  const number = intOrNull(text(fd, "number"));
  if (!number || number < 1) finish(path, "Escribe el número del ciclo.");
  const { error } = await (await createClient()).from("cycles").insert({
    curriculum_id,
    number,
    title: orNull(text(fd, "title")),
    classes: intOrNull(text(fd, "classes")) ?? 11,
    prerequisite_cycle_id: orNull(text(fd, "prerequisite_cycle_id")),
  });
  finish(path, error?.message);
}

export async function crearTemporada(fd: FormData) {
  const name = text(fd, "name");
  const start = text(fd, "start_date");
  const end = text(fd, "end_date");
  if (name.length < 2) finish("/temporadas", "Escribe el nombre de la temporada.");
  if (!start || !end) finish("/temporadas", "Elige las fechas de inicio y término.");
  const { error } = await (await createClient())
    .from("seasons")
    .insert({ name, start_date: start, end_date: end, status: "borrador" });
  finish("/temporadas", error?.message);
}

export async function cambiarEstadoTemporada(fd: FormData) {
  const { data, error } = await (await createClient())
    .from("seasons")
    .update({ status: text(fd, "status") })
    .eq("id", text(fd, "id"))
    .select("id");
  finish("/temporadas", error?.message ?? (data?.length ? undefined : "No tienes permiso para hacer este cambio."));
}

// ---------- Lecciones ----------
export async function guardarLeccion(fd: FormData) {
  const id = text(fd, "id");
  const cycle_id = text(fd, "cycle_id");
  const back = id ? `/lecciones/${id}/editar` : `/ciclos/${cycle_id}`;

  const number = intOrNull(text(fd, "number"));
  if (!number || number < 1) finish(back, "Escribe el número de la lección.");
  const title = text(fd, "title");
  if (title.length < 2) finish(back, "Escribe el título de la lección.");
  const video = text(fd, "video_url");
  if (video && !/^https:\/\/\S+$/.test(video)) finish(back, "El enlace del video debe comenzar con https://");

  const row = {
    cycle_id,
    number,
    title,
    summary: orNull(text(fd, "summary")),
    content: orNull(text(fd, "content")),
    questions: orNull(text(fd, "questions")),
    video_url: orNull(video),
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("lessons").update(row).eq("id", id).select("id")
    : await supabase.from("lessons").insert(row).select("id");
  finish(back, error?.message ?? (data?.length ? undefined : "No tienes permiso para hacer este cambio."));
}

// ---------- Grupos ----------
export async function crearGrupo(fd: FormData) {
  const name = text(fd, "name");
  if (name.length < 2) finish("/grupos", "Escribe el nombre del grupo.");
  if (!text(fd, "cycle_id")) finish("/grupos", "Elige un ciclo.");
  if (!text(fd, "season_id")) finish("/grupos", "Elige una temporada.");

  const { data, error } = await (await createClient())
    .from("groups")
    .insert({
      season_id: text(fd, "season_id"),
      cycle_id: text(fd, "cycle_id"),
      name,
      weekday: intOrNull(text(fd, "weekday")),
      start_time: orNull(text(fd, "start_time")),
      end_time: orNull(text(fd, "end_time")),
      modality: text(fd, "modality") || "virtual",
      address: orNull(text(fd, "address")),
      capacity: intOrNull(text(fd, "capacity")) ?? 15,
    })
    .select("id")
    .single();
  if (error || !data) finish("/grupos", error?.message ?? "No se pudo crear el grupo.");
  revalidatePath("/grupos");
  redirect(`/grupos/${data.id}?ok=1`);
}

export async function asignarResponsables(fd: FormData) {
  const id = text(fd, "id");
  const { data, error } = await (await createClient())
    .from("groups")
    .update({ leader_id: orNull(text(fd, "leader_id")), monitor_id: orNull(text(fd, "monitor_id")) })
    .eq("id", id)
    .select("id");
  finish(`/grupos/${id}`, error?.message ?? (data?.length ? undefined : "No tienes permiso para hacer este cambio."));
}

export async function cerrarGrupo(fd: FormData) {
  const id = text(fd, "group_id");
  const { error } = await (await createClient()).rpc("close_group", { gid: id });
  revalidatePath("/inicio");
  finish(`/grupos/${id}`, error?.message);
}

export async function crearContinuacion(fd: FormData) {
  const id = text(fd, "group_id");
  const { data, error } = await (await createClient()).rpc("create_continuation", { gid: id });
  if (error || !data) finish(`/grupos/${id}`, error?.message ?? "No se pudo crear la continuación.");
  revalidatePath("/grupos");
  redirect(`/grupos/${data}?ok=1`);
}

// ---------- Inscripciones ----------
export async function inscribirme(fd: FormData) {
  const { error } = await (await createClient()).rpc("enroll", { gid: text(fd, "group_id") });
  if (error) finish("/inscripcion", error.message);
  revalidatePath("/inicio");
  redirect("/inicio?ok=1");
}

export async function inscribirPersona(fd: FormData) {
  const group_id = text(fd, "group_id");
  const person = text(fd, "person");
  if (!person) finish(`/grupos/${group_id}`, "Elige a la persona que quieres inscribir.");
  const { error } = await (await createClient()).rpc("enroll_person", { gid: group_id, person });
  finish(`/grupos/${group_id}`, error?.message);
}

export async function cancelarInscripcion(fd: FormData) {
  const back = backTo(fd, "/inicio");
  const { error } = await (await createClient()).rpc("cancel_enrollment", { eid: text(fd, "enrollment_id") });
  revalidatePath("/inicio");
  finish(back, error?.message);
}

export async function confirmarInscripcion(fd: FormData) {
  const { error } = await (await createClient()).rpc("confirm_enrollment", {
    eid: text(fd, "enrollment_id"),
    accept: text(fd, "accept") === "si",
  });
  finish("/inicio", error?.message);
}

// ---------- Asistencia y seguimiento ----------
export async function guardarAsistencia(fd: FormData) {
  const group_id = text(fd, "group_id");
  const held_on = text(fd, "held_on");
  const back = `/grupos/${group_id}/lista`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(held_on)) finish(back, "Elige una fecha válida.");

  const present = fd.getAll("present").map(String);
  const recovered = fd.getAll("recovered").map(String);
  const lesson = intOrNull(text(fd, "lesson_number"));

  const { error } = await (await createClient()).rpc("save_attendance", {
    gid: group_id,
    day: held_on,
    lesson: lesson && lesson > 0 ? lesson : null,
    present,
    recovered,
  });
  if (error) finish(back, error.message);
  revalidatePath(`/grupos/${group_id}`);
  revalidatePath("/inicio");
  redirect(`/grupos/${group_id}?lista=${present.length + recovered.length}`);
}

export async function registrarContacto(fd: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const kind = text(fd, "kind");
  if (!["llamada", "mensaje", "visita"].includes(kind)) finish("/alertas", "Elige cómo contactaste a la persona.");

  const { error } = await supabase.from("contacts").insert({
    person_id: text(fd, "person_id"),
    group_id: text(fd, "group_id"),
    contacted_by: user.id,
    kind,
    note: orNull(text(fd, "note")),
  });
  revalidatePath("/inicio");
  finish("/alertas", error?.message);
}

// ---------- Perfil ----------
export async function actualizarPerfil(fd: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = text(fd, "full_name");
  if (name.length < 2) finish("/perfil", "Escribe tu nombre completo.");

  const rawPhone = text(fd, "phone");
  const phone = normalizePhone(rawPhone);
  if (rawPhone && !phone) {
    finish("/perfil", "El teléfono no es válido. Incluye el código de país, por ejemplo +56 9 1234 5678.");
  }

  const gender = text(fd, "gender");
  if (gender && !["hombre", "mujer"].includes(gender)) finish("/perfil", "Elige una opción de género válida.");

  const country = text(fd, "country").toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) finish("/perfil", "El país debe ser un código de 2 letras, por ejemplo CL.");

  const birth = text(fd, "birth_date");
  if (birth && new Date(birth) > new Date()) finish("/perfil", "La fecha de nacimiento no puede ser futura.");

  const update: Record<string, unknown> = {
    full_name: name,
    phone,
    gender: orNull(gender),
    country: orNull(country),
    city: orNull(text(fd, "city")),
    birth_date: orNull(birth),
    guardian_name: orNull(text(fd, "guardian_name")),
    guardian_email: orNull(text(fd, "guardian_email")),
    guardian_phone: orNull(text(fd, "guardian_phone")),
    accepts_comms: text(fd, "accepts_comms") === "on",
  };
  if (text(fd, "accept_terms") === "on") {
    update.terms_accepted_at = new Date().toISOString();
    update.terms_version = "2026-1";
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  revalidatePath("/inicio");
  finish("/perfil", error?.message);
}
