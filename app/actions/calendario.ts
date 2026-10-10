"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { finish, orNull, text } from "@/lib/action-helpers";
import { parseDates } from "@/lib/calendar";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const calendar = (gid: string) => `/grupos/${gid}/calendario`;

function done(path: string, notice: string): never {
  revalidatePath(path);
  redirect(`${path}?aviso=${encodeURIComponent(notice)}`);
}

// ---------- Calendario del grupo ----------
export async function planificarGrupo(fd: FormData) {
  const gid = text(fd, "group_id");
  const first = text(fd, "first_date");
  const { dates, invalid } = parseDates(text(fd, "breaks"));
  if (invalid.length) finish(calendar(gid), `No entendí estas fechas: ${invalid.join(", ")}. Usa el formato 04/05/2026.`);
  if (first && !ISO.test(first)) finish(calendar(gid), "Elige una fecha válida para la primera reunión.");

  const { data, error } = await (await createClient()).rpc("plan_group_sessions", {
    gid,
    first_date: first || null,
    breaks: dates,
  });
  if (error) finish(calendar(gid), error.message);
  done(calendar(gid), `Se planificaron ${data as number} sesiones.`);
}

export async function reprogramarSesion(fd: FormData) {
  const gid = text(fd, "group_id");
  const date = text(fd, "new_date");
  if (!ISO.test(date)) finish(calendar(gid), "Elige la nueva fecha.");
  const { error } = await (await createClient()).rpc("reschedule_session", { mid: text(fd, "mid"), new_date: date });
  finish(calendar(gid), error?.message);
}

export async function cancelarSesion(fd: FormData) {
  const gid = text(fd, "group_id");
  const { error } = await (await createClient()).rpc("cancel_session", { mid: text(fd, "mid"), reason: orNull(text(fd, "reason")) });
  finish(calendar(gid), error?.message);
}

export async function dirigirSesion(fd: FormData) {
  const gid = text(fd, "group_id");
  const { error } = await (await createClient()).rpc("set_session_facilitator", {
    mid: text(fd, "mid"),
    person: orNull(text(fd, "person")),
  });
  finish(calendar(gid), error?.message);
}

export async function asignarRespaldo(fd: FormData) {
  const gid = text(fd, "group_id");
  const { error } = await (await createClient()).rpc("set_group_backup", { gid, person: orNull(text(fd, "person")) });
  revalidatePath(`/grupos/${gid}`);
  finish(calendar(gid), error?.message);
}

export async function acreditarSesion(fd: FormData) {
  const gid = text(fd, "group_id");
  const { data, error } = await (await createClient()).rpc("accredit_session", { mid: text(fd, "mid") });
  if (error) finish(calendar(gid), error.message);
  const r = data as { acreditadas: number; ya_acreditadas: number; omitidas: { motivo: string }[] };
  const parts = [`${r.acreditadas} unidades acreditadas`];
  if (r.ya_acreditadas) parts.push(`${r.ya_acreditadas} ya lo estaban`);
  if (r.omitidas.length) parts.push(`${r.omitidas.length} no se pudieron acreditar (${r.omitidas[0].motivo})`);
  done(calendar(gid), parts.join(" · "));
}

// ---------- Recuperación ----------
export async function actualizarRecuperacion(fd: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const status = text(fd, "status");
  if (!["pendiente", "en_curso", "resuelto", "cancelado"].includes(status)) finish("/recuperacion", "Elige un estado válido.");
  const follow = text(fd, "follow_up_on");
  if (follow && !ISO.test(follow)) finish("/recuperacion", "La fecha de seguimiento no es válida.");

  const patch: Record<string, unknown> = { status, follow_up_on: follow || null, notes: orNull(text(fd, "notes")) };
  if (text(fd, "responsible") === "yo" && user) patch.responsible_id = user.id;
  const { data, error } = await supabase.from("catchup_plans").update(patch).eq("id", text(fd, "id")).select("id");
  finish("/recuperacion", error?.message ?? (data?.length ? undefined : "No tienes permiso para hacer este cambio."));
}

// ---------- Calendario de la temporada (administrador) ----------
export async function definirCalendarioTemporada(fd: FormData) {
  const first = text(fd, "first_week");
  if (!ISO.test(first)) finish("/temporadas", "Elige la fecha de la primera semana.");
  const { dates, invalid } = parseDates(text(fd, "breaks"));
  if (invalid.length) finish("/temporadas", `No entendí estas fechas: ${invalid.join(", ")}. Usa el formato 04/05/2026.`);
  const { data, error } = await (await createClient()).rpc("generate_season_weeks", {
    sid: text(fd, "season_id"),
    first_week: first,
    breaks: dates,
  });
  if (error) finish("/temporadas", error.message);
  done("/temporadas", `Calendario creado: la semana 36 empieza el ${String(data).split("-").reverse().join("/")}.`);
}
