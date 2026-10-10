// Catálogo de ofertas de GP 2.0: clasificación, agrupación de variantes y elegibilidad.
// La base de datos es la autoridad (enroll_curriculum vuelve a validar); esto solo evita
// ofrecer a alguien algo que de todos modos le va a rechazar.

export type Category = "comunidad" | "formacion" | "experiencia" | "recreacion";
export type Kind = "curriculo" | "taller" | "comunidad" | "actividad";

export const CATEGORY_LABEL: Record<Category, string> = {
  comunidad: "Comunidad",
  formacion: "Formación",
  experiencia: "Experiencias",
  recreacion: "Recreación",
};

export const CATEGORY_ORDER: Category[] = ["formacion", "comunidad", "experiencia", "recreacion"];

export const KIND_LABEL: Record<Kind, string> = {
  curriculo: "Currículo",
  taller: "Taller",
  comunidad: "Comunidad",
  actividad: "Actividad",
};

export const LIFE_STAGE_LABEL: Record<string, string> = {
  tweens: "Tweens",
  teens: "Teens",
  jovenes: "Jóvenes",
  gold: "Gold",
  matrimonios: "Matrimonios",
  padres: "Padres",
  mujeres: "Mujeres",
  hombres: "Hombres",
};

export type CatalogProgram = {
  id: string;
  name: string;
  description: string | null;
  audience: "todos" | "hombres" | "mujeres" | "parejas";
  age_min: number | null;
  age_max: number | null;
  active: boolean;
  category: Category;
  kind: Kind;
  life_stage: string | null;
  duration_years: number;
  certifiable: boolean;
  visibility: "publico" | "privado";
  offering: string | null;
};

export type ProfileForEligibility = {
  gender: string | null;
  birth_date: string | null;
};

const strip = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type OfferingSuggestion = { offering: string; internal: boolean; category?: Category };

// Propuesta (la aprueba el administrador) para agrupar los programas heredados de la plataforma anterior.
const FAMILIES: [RegExp, string, Category?][] = [
  [/^biblia creativa/, "Biblia Creativa"],
  [/^freedom single/, "Freedom Single"],
  [/^(ar )?jovenes/, "AR Jóvenes"],
  [/^mas alla del exito/, "Más Allá del Éxito"],
  [/^futbol/, "AR Fútbol", "recreacion"],
  [/^senderismo/, "Senderismo", "recreacion"],
  [/^baile/, "Baile Entretenido", "recreacion"],
  [/^running/, "Running", "recreacion"],
];

const INTERNAL = [/^coord global/, /^palabras (del|de) genio/];

export function suggestOffering(name: string): OfferingSuggestion {
  const n = strip(name);
  const internal = INTERNAL.some((r) => r.test(n));
  for (const [re, offering, category] of FAMILIES) {
    if (re.test(n)) return { offering, internal, category };
  }
  return { offering: name.trim(), internal };
}

export const offeringOf = (p: Pick<CatalogProgram, "name" | "offering">) => p.offering?.trim() || p.name;

export type Offering = { name: string; category: Category; programs: CatalogProgram[] };

// Agrupa los programas visibles en ofertas, ordenadas por categoría y nombre.
export function groupOfferings(programs: CatalogProgram[]): Offering[] {
  const map = new Map<string, Offering>();
  for (const p of programs) {
    if (!p.active || p.visibility !== "publico") continue;
    const key = offeringOf(p);
    const o = map.get(key) ?? { name: key, category: p.category, programs: [] };
    o.programs.push(p);
    map.set(key, o);
  }
  const order = (c: Category) => CATEGORY_ORDER.indexOf(c);
  return Array.from(map.values())
    .map((o) => ({ ...o, programs: o.programs.sort((a, b) => a.name.localeCompare(b.name, "es")) }))
    .sort((a, b) => order(a.category) - order(b.category) || a.name.localeCompare(b.name, "es"));
}

export const ageOn = (birth: string, today: Date = new Date()) => {
  const b = new Date(`${birth}T00:00:00Z`);
  let years = today.getUTCFullYear() - b.getUTCFullYear();
  const m = today.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < b.getUTCDate())) years -= 1;
  return years;
};

// Mismas reglas que eligibility_error() en la base de datos. null = puede inscribirse.
export function eligibilityError(
  profile: ProfileForEligibility | null,
  p: Pick<CatalogProgram, "audience" | "age_min" | "age_max">,
  today: Date = new Date(),
): string | null {
  if (p.audience === "hombres" || p.audience === "mujeres") {
    if (!profile?.gender) return "Completa tu género en el perfil.";
    if ((p.audience === "hombres") !== (profile.gender === "hombre")) return "No está disponible para tu perfil.";
  }
  if (p.age_min != null || p.age_max != null) {
    if (!profile?.birth_date) return "Completa tu fecha de nacimiento en el perfil.";
    const years = ageOn(profile.birth_date, today);
    if ((p.age_min != null && years < p.age_min) || (p.age_max != null && years > p.age_max)) {
      return "No está disponible para tu edad.";
    }
  }
  return null;
}

export function audienceLabel(p: Pick<CatalogProgram, "audience" | "age_min" | "age_max">): string {
  const who = { todos: "Todos", hombres: "Hombres", mujeres: "Mujeres", parejas: "Parejas" }[p.audience];
  const ages =
    p.age_min != null && p.age_max != null && p.age_max < 100
      ? `${p.age_min} a ${p.age_max} años`
      : p.age_min != null && p.age_min > 0
        ? `desde ${p.age_min} años`
        : p.age_max != null && p.age_max < 100
          ? `hasta ${p.age_max} años`
          : "";
  return [who, ages].filter(Boolean).join(" · ");
}
