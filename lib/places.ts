// Países de la plataforma y detección (aproximada) del país a partir de la zona horaria del dispositivo.
// No usa GPS ni pide permisos: solo la zona horaria que el navegador ya informa.

export const COUNTRIES: [string, string][] = [
  ["CL", "Chile"], ["VE", "Venezuela"], ["UY", "Uruguay"], ["US", "Estados Unidos"], ["CO", "Colombia"],
  ["AR", "Argentina"], ["PE", "Perú"], ["MX", "México"], ["BR", "Brasil"], ["EC", "Ecuador"],
  ["BO", "Bolivia"], ["PY", "Paraguay"], ["ES", "España"], ["DO", "República Dominicana"], ["NI", "Nicaragua"],
];

export const countryLabel = (code: string | null | undefined): string =>
  (code && COUNTRIES.find(([c]) => c === code.toUpperCase())?.[1]) || code || "";

const BY_ZONE: Record<string, string> = {
  "America/Santiago": "CL", "America/Punta_Arenas": "CL", "Pacific/Easter": "CL",
  "America/Caracas": "VE", "America/Montevideo": "UY", "America/Bogota": "CO", "America/Lima": "PE",
  "America/Guayaquil": "EC", "Pacific/Galapagos": "EC", "America/La_Paz": "BO", "America/Asuncion": "PY",
  "America/Santo_Domingo": "DO", "America/Managua": "NI",
  "America/Buenos_Aires": "AR",
  "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "Africa/Ceuta": "ES",
};
const US_ZONES = new Set([
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix",
  "America/Anchorage", "America/Detroit", "America/Boise", "America/Juneau", "America/Adak", "Pacific/Honolulu",
]);
const MX_ZONES = new Set([
  "America/Mexico_City", "America/Cancun", "America/Monterrey", "America/Merida", "America/Tijuana",
  "America/Chihuahua", "America/Hermosillo", "America/Mazatlan", "America/Bahia_Banderas",
]);
const BR_ZONES = new Set([
  "America/Sao_Paulo", "America/Manaus", "America/Bahia", "America/Fortaleza", "America/Recife", "America/Belem",
  "America/Cuiaba", "America/Campo_Grande", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha",
  "America/Araguaina", "America/Maceio", "America/Boa_Vista", "America/Santarem", "America/Eirunepe",
]);

/** País (código de 2 letras) de una zona horaria, o null si no es uno de los países de la plataforma. */
export function countryFromTimeZone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  if (BY_ZONE[tz]) return BY_ZONE[tz];
  if (tz.startsWith("America/Argentina/")) return "AR";
  if (tz.startsWith("America/Indiana/") || tz.startsWith("America/Kentucky/") || tz.startsWith("America/North_Dakota/") || US_ZONES.has(tz)) return "US";
  if (MX_ZONES.has(tz)) return "MX";
  if (BR_ZONES.has(tz)) return "BR";
  return null;
}

/** Si la persona parece estar en un país distinto al de su perfil, devuelve el país detectado. */
export function locationMismatch(profileCountry: string | null | undefined, tz: string | null | undefined): string | null {
  const detected = countryFromTimeZone(tz);
  const saved = (profileCountry ?? "").toUpperCase();
  if (!detected || !saved) return null;
  return detected !== saved ? detected : null;
}
