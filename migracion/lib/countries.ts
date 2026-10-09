// Países con su prefijo telefónico y el largo del número nacional (sin prefijo ni 0 inicial).

export type CountryInfo = { iso: string; dial: string; lengths: number[]; trunk0: boolean };

const C = (iso: string, dial: string, lengths: number[], trunk0 = false): CountryInfo => ({ iso, dial, lengths, trunk0 });

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const TABLE: Record<string, CountryInfo> = {
  chile: C("CL", "56", [9]),
  venezuela: C("VE", "58", [10], true),
  uruguay: C("UY", "598", [8], true),
  "estados unidos": C("US", "1", [10]),
  colombia: C("CO", "57", [10]),
  argentina: C("AR", "54", [10, 11], true),
  peru: C("PE", "51", [9]),
  mexico: C("MX", "52", [10]),
  brasil: C("BR", "55", [10, 11], true),
  ecuador: C("EC", "593", [9], true),
  bolivia: C("BO", "591", [8]),
  paraguay: C("PY", "595", [9], true),
  espana: C("ES", "34", [9]),
  "republica dominicana": C("DO", "1", [10]),
  nicaragua: C("NI", "505", [8]),
  panama: C("PA", "507", [8]),
  "costa rica": C("CR", "506", [8]),
  guatemala: C("GT", "502", [8]),
  honduras: C("HN", "504", [8]),
  "el salvador": C("SV", "503", [8]),
  cuba: C("CU", "53", [8]),
  haiti: C("HT", "509", [8]),
  canada: C("CA", "1", [10]),
  italia: C("IT", "39", [9, 10]),
  francia: C("FR", "33", [9]),
  alemania: C("DE", "49", [10, 11]),
  "reino unido": C("GB", "44", [10]),
  portugal: C("PT", "351", [9]),
  "puerto rico": C("PR", "1", [10]),
};

export function countryByName(name: string | null | undefined): CountryInfo | null {
  if (!name) return null;
  return TABLE[norm(name)] ?? null;
}

const DIALS = Array.from(new Set(Object.values(TABLE).map((c) => c.dial))).sort((a, b) => b.length - a.length);

export function allCountries(): [string, CountryInfo][] {
  return Object.entries(TABLE);
}

/** Intenta formar un teléfono internacional (+569…) a partir de un texto libre y del país de la persona. */
export function inferPhone(raw: string | null | undefined, countryName?: string | null): string | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  const valid = (d: string) => (/^\+\d{8,15}$/.test("+" + d) ? "+" + d : null);

  if (cleaned.startsWith("+")) return valid(cleaned.slice(1));
  if (cleaned.startsWith("00")) return valid(cleaned.slice(2));

  const digits = cleaned;
  const country = countryByName(countryName);

  if (country) {
    // ¿Ya trae el prefijo del país?
    if (digits.startsWith(country.dial) && country.lengths.includes(digits.length - country.dial.length)) {
      return valid(digits);
    }
    const national = country.trunk0 ? digits.replace(/^0+/, "") : digits;
    if (country.lengths.includes(national.length)) return valid(country.dial + national);
    const stripped = digits.replace(/^0+/, "");
    if (country.lengths.includes(stripped.length)) return valid(country.dial + stripped);
  }

  // Sin país o sin coincidencia: ¿empieza con algún prefijo conocido y el largo calza?
  for (const dial of DIALS) {
    if (!digits.startsWith(dial)) continue;
    const rest = digits.length - dial.length;
    const matches = Object.values(TABLE).some((c) => c.dial === dial && c.lengths.includes(rest));
    if (matches) return valid(digits);
  }
  return null;
}
