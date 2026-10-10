import { ageOn } from "./programs";

// Qué datos personales faltan, y cuáles son indispensables para inscribirse.
export type ProfileData = {
  full_name: string | null;
  phone: string | null;
  gender: string | null;
  country: string | null;
  city: string | null;
  birth_date: string | null;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone: string | null;
  terms_accepted_at: string | null;
  campus_id: string | null;
};

export type MissingField = {
  key: string;
  label: string;
  /** Sin esto no se puede inscribir a un programa */
  needed: boolean;
};

export type ProfileCheck = {
  missing: MissingField[];
  /** Cuántos datos aplican a esta persona (los del tutor solo si es menor) */
  total: number;
  /** 0 a 100 */
  percent: number;
  minor: boolean;
  /** Falta algo indispensable para inscribirse */
  blocking: boolean;
};

const blank = (v: string | null | undefined) => !v || v.trim() === "";

export function profileCheck(
  p: Partial<ProfileData> | null | undefined,
  opts: { campusesExist?: boolean; today?: Date } = {},
): ProfileCheck {
  const d = p ?? {};
  const today = opts.today ?? new Date();
  const minor = !blank(d.birth_date) && ageOn(d.birth_date!, today) < 18;

  const checks: { key: string; label: string; needed: boolean; ok: boolean; applies: boolean }[] = [
    { key: "full_name", label: "Tu nombre completo", needed: false, ok: !blank(d.full_name) && d.full_name!.trim().length >= 2, applies: true },
    { key: "gender", label: "Tu género", needed: true, ok: !blank(d.gender), applies: true },
    { key: "birth_date", label: "Tu fecha de nacimiento", needed: true, ok: !blank(d.birth_date), applies: true },
    { key: "terms", label: "Aceptar los términos y la política de privacidad", needed: true, ok: !blank(d.terms_accepted_at), applies: true },
    { key: "phone", label: "Tu teléfono (WhatsApp)", needed: false, ok: !blank(d.phone), applies: true },
    { key: "country", label: "Tu país", needed: false, ok: !blank(d.country), applies: true },
    { key: "city", label: "Tu ciudad", needed: false, ok: !blank(d.city), applies: true },
    { key: "campus", label: "Tu sede", needed: false, ok: !blank(d.campus_id), applies: !!opts.campusesExist },
    { key: "guardian_name", label: "El nombre de tu tutor", needed: true, ok: !blank(d.guardian_name), applies: minor },
    {
      key: "guardian_contact",
      label: "Un correo o teléfono de tu tutor",
      needed: true,
      ok: !blank(d.guardian_email) || !blank(d.guardian_phone),
      applies: minor,
    },
  ];
  const applicable = checks.filter((c) => c.applies);
  const missing = applicable.filter((c) => !c.ok).map(({ key, label, needed }) => ({ key, label, needed }));
  const total = applicable.length;
  return {
    missing,
    total,
    percent: total === 0 ? 100 : Math.round(((total - missing.length) / total) * 100),
    minor,
    blocking: missing.some((m) => m.needed),
  };
}

/** Primer nombre para saludar ("Pablo Encina" -> "Pablo"); vacío si no hay nombre. */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}
