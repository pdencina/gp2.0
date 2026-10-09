import type { AuthCreator, Rpc } from "./apply";

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const trim = (url: string) => url.replace(/\/+$/, "");

/** Llama a las funciones de importación por la API de Supabase (HTTPS), con reintentos. */
export function httpRpc(url: string, serviceKey: string, fetchImpl: Fetch = fetch, wait = sleep): Rpc {
  return async (fn, args) => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(`${trim(url)}/rest/v1/rpc/${fn}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify(args),
        });
      } catch (e) {
        if (attempt === 5) throw new Error(`${fn}: no se pudo conectar (${(e as Error).message})`);
        await wait(500 * attempt * attempt);
        continue;
      }
      const text = await res.text();
      if (res.ok) return text ? JSON.parse(text) : null;
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await wait(500 * attempt * attempt);
        continue;
      }
      throw new Error(`${fn}: ${res.status} ${text.slice(0, 300)}`);
    }
    throw new Error(`${fn}: sin respuesta`);
  };
}

/** Crea una cuenta de acceso con su contraseña ya cifrada (API de administración de Supabase). */
export function httpAuthCreator(url: string, serviceKey: string, fetchImpl: Fetch = fetch, wait = sleep): AuthCreator {
  return async ({ email, passwordHash, fullName }) => {
    const body: Record<string, unknown> = { email, email_confirm: true, user_metadata: { full_name: fullName } };
    if (passwordHash) body.password_hash = passwordHash;
    for (let attempt = 1; attempt <= 5; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(`${trim(url)}/auth/v1/admin/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify(body),
        });
      } catch (e) {
        if (attempt === 5) throw new Error(`No se pudo conectar para crear una cuenta (${(e as Error).message})`);
        await wait(500 * attempt * attempt);
        continue;
      }
      if (res.ok) return;
      const text = await res.text();
      if (res.status === 422 && /already|exists|registered/i.test(text)) return; // ya existía: se deja como está
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await wait(500 * attempt * attempt);
        continue;
      }
      throw new Error(`No se pudo crear una cuenta (${res.status}): ${text.slice(0, 160)}`);
    }
  };
}
