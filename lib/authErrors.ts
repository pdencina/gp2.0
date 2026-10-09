// Traduce los errores de Supabase Auth a mensajes claros en español.
export function authMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.";
  if (m.includes("email not confirmed")) return "Aún no confirmas tu correo. Revisa tu bandeja de entrada (y el spam).";
  if (m.includes("already registered") || m.includes("already been registered")) return "Ese correo ya tiene una cuenta. Ingresa o recupera tu contraseña.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
  if (m.includes("password") && (m.includes("weak") || m.includes("least") || m.includes("short"))) return "La contraseña es muy débil. Usa al menos 8 caracteres con letras y números.";
  if (m.includes("same password")) return "La nueva contraseña debe ser distinta a la anterior.";
  if (m.includes("expired") || m.includes("invalid") && m.includes("token")) return "El enlace venció o ya fue usado. Solicita uno nuevo.";
  if (m.includes("network") || m.includes("fetch")) return "No pudimos conectar. Revisa tu internet e inténtalo otra vez.";
  return "Algo salió mal. Inténtalo de nuevo en unos minutos.";
}

// Mínimo 8 caracteres, con al menos una letra y un número.
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Incluye al menos una letra y un número.";
  return null;
}
