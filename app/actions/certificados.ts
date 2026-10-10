"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendly, intOrNull, orNull, text } from "@/lib/action-helpers";

const withParam = (path: string, key: string, value: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

function back(path: string, error?: string, notice?: string): never {
  revalidatePath(path.split("?")[0]);
  if (error) redirect(withParam(path, "error", friendly(error)));
  redirect(notice ? withParam(path, "aviso", notice) : withParam(path, "ok", "1"));
}

// ---------- Mi progreso ----------
export async function avanzarAnio(fd: FormData) {
  const ce = text(fd, "ce");
  const { data, error } = await (await createClient()).rpc("advance_formative_year", { ce });
  revalidatePath("/mi-progreso");
  back(`/mi-progreso/${ce}`, error?.message, error ? undefined : `Pasaste al año ${data as number}.`);
}

// ---------- Certificados ----------
const scope = (fd: FormData) => {
  const p = new URLSearchParams();
  if (text(fd, "programa")) p.set("programa", text(fd, "programa"));
  if (text(fd, "anio")) p.set("anio", text(fd, "anio"));
  const q = p.toString();
  return `/certificados${q ? `?${q}` : ""}`;
};

export async function emitirCertificado(fd: FormData) {
  const year = intOrNull(text(fd, "year"));
  const { error } = await (await createClient()).rpc("issue_certificate", { ce: text(fd, "ce"), year });
  back(scope(fd), error?.message, error ? undefined : "Certificado emitido.");
}

// Emite a quienes cumplen (hasta 100 por vez) y cuenta lo que no se pudo
export async function emitirVarios(fd: FormData) {
  const supabase = await createClient();
  const programa = text(fd, "programa");
  const year = intOrNull(text(fd, "anio"));
  const { data, error } = await supabase.rpc("certificate_candidates", { cid: programa, y: year, lim: 100 });
  if (error) back(scope(fd), error.message);
  let ok = 0;
  let skipped = 0;
  for (const c of (data ?? []) as { ce_id: string; can_issue: boolean; formative_year: number | null }[]) {
    if (!c.can_issue) {
      skipped += 1;
      continue;
    }
    const r = await supabase.rpc("issue_certificate", { ce: c.ce_id, year: c.formative_year });
    if (r.error) skipped += 1;
    else ok += 1;
  }
  back(scope(fd), undefined, `${ok} certificados emitidos${skipped ? `; ${skipped} no se pudieron emitir (otra sede o falta de permiso)` : ""}.`);
}

export async function revocarCertificado(fd: FormData) {
  const { error } = await (await createClient()).rpc("revoke_certificate", { cert: text(fd, "id"), reason: text(fd, "reason") });
  back(scope(fd), error?.message, error ? undefined : "Certificado revocado.");
}

export async function agregarPastor(fd: FormData) {
  const person = text(fd, "person");
  const campus = text(fd, "campus");
  if (!person || !campus) back("/certificados", "Elige a la persona y la sede.");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("campus_pastors").insert({ person_id: person, campus_id: campus, created_by: user?.id ?? null });
  back("/certificados", error?.message);
}

export async function quitarPastor(fd: FormData) {
  const { error } = await (await createClient())
    .from("campus_pastors")
    .delete()
    .eq("person_id", text(fd, "person"))
    .eq("campus_id", text(fd, "campus"));
  back("/certificados", error?.message);
}

// ---------- Años, requisitos y créditos heredados (pantalla del currículum) ----------
const prog = (cid: string, v: string) => `/curriculums/${cid}?v=${v}`;

export async function cambiarAnioModulo(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const v = text(fd, "version_id");
  const year = intOrNull(text(fd, "formative_year"));
  if (!year || year < 1 || year > 10) back(prog(cid, v), "El año debe estar entre 1 y 10.");
  const { data, error } = await (await createClient()).from("cycles").update({ formative_year: year }).eq("id", text(fd, "cycle_id")).select("id");
  back(prog(cid, v), error?.message ?? (data?.length ? undefined : "No tienes permiso para hacer este cambio."));
}

export async function guardarRequisito(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const v = text(fd, "version_id");
  const pct = Number(text(fd, "min_pct").replace(",", "."));
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) back(prog(cid, v), "El porcentaje debe estar entre 1 y 100.");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("year_requirements")
    .upsert({ version_id: v, formative_year: intOrNull(text(fd, "formative_year")) ?? 1, min_pct: pct, updated_by: user?.id ?? null, updated_at: new Date().toISOString() });
  back(prog(cid, v), error?.message);
}

export async function recalcularAnios(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const v = text(fd, "version_id");
  const { data, error } = await (await createClient()).rpc("recompute_formative_years", { cid });
  back(prog(cid, v), error?.message, error ? undefined : `Se actualizó el año de ${data as number} personas.`);
}

export async function sincronizarGrupos(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const v = text(fd, "version_id");
  const { data, error } = await (await createClient()).rpc("resync_group_years", { cid });
  back(prog(cid, v), error?.message, error ? undefined : `Se actualizó el año de ${data as number} grupos.`);
}

export async function revisarCreditos(fd: FormData) {
  const cid = text(fd, "curriculum_id");
  const stage = text(fd, "stage_id");
  const path = `/curriculums/${cid}/creditos?modulo=${stage}`;
  const people = fd.getAll("person").map(String);
  if (!people.length && text(fd, "all") !== "si") back(path, "Marca a las personas, o confirma que la decisión es para todas las de este módulo.");
  const { data, error } = await (await createClient()).rpc("review_stage_credits", {
    stage,
    decision: text(fd, "decision"),
    persons: people.length ? people : null,
    note: orNull(text(fd, "note")),
  });
  back(path, error?.message, error ? undefined : `${data as number} créditos actualizados.`);
}
