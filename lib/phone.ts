// Normaliza un teléfono a formato internacional (+56912345678).
// Devuelve null si no es válido. Un celular chileno de 9 dígitos (9xxxxxxxx) asume +56.
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (!digits.startsWith("+")) {
    if (/^9\d{8}$/.test(digits)) digits = "+56" + digits;
    else return null;
  }
  return /^\+\d{8,15}$/.test(digits) ? digits : null;
}

export function whatsappLink(phone: string, message?: string): string {
  const base = `https://wa.me/${phone.replace(/^\+/, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
