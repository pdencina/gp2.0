// Prueba de humo contra un sitio ya desplegado: no necesita cuentas ni datos.
//   node scripts/smoke.js https://gp2-0.vercel.app
// Comprueba que las páginas públicas responden, que las privadas mandan a iniciar sesión y que no se filtra nada.
const base = (process.argv[2] || process.env.SMOKE_URL || "").replace(/\/$/, "");
if (!base) {
  console.error("Indica la dirección: node scripts/smoke.js https://tu-sitio.vercel.app");
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

async function get(path, init = {}) {
  return fetch(base + path, { redirect: "manual", ...init });
}

async function main() {
  // Públicas
  let r = await get("/login");
  check("/login responde", r.status === 200, `HTTP ${r.status}`);

  r = await get("/api/health");
  check("/api/health responde", r.status === 200, `HTTP ${r.status}`);

  r = await get("/verificar");
  check("/verificar es pública", r.status === 200, `HTTP ${r.status}`);
  const html = await r.text();
  check("/verificar pide un código", /Verificar un certificado/.test(html));

  r = await get("/verificar?codigo=AAAAAAAAAAAA");
  const notFound = await r.text();
  check("un código inexistente no revela nada", r.status === 200 && /No encontramos/.test(notFound) && !/[\w.-]+@[\w-]+\.\w+/.test(notFound));

  r = await get("/verificar?codigo=xx");
  check("un código mal escrito se explica", /12 letras y números/.test(await r.text()));

  r = await get("/privacidad");
  check("/privacidad es pública", r.status === 200, `HTTP ${r.status}`);

  // Privadas: deben mandar a iniciar sesión
  for (const p of ["/inicio", "/mi-progreso", "/catalogo", "/panel", "/certificados", "/biblioteca", "/revision", "/habilitacion", "/curriculums", "/grupos", "/reencuentro", "/alertas", "/recuperacion", "/perfil"]) {
    r = await get(p);
    const to = r.headers.get("location") || "";
    check(`${p} exige iniciar sesión`, [301, 302, 303, 307, 308].includes(r.status) && /\/login/.test(to), `HTTP ${r.status} → ${to || "—"}`);
  }
  r = await get("/api/materiales/00000000-0000-0000-0000-000000000000");
  check("los materiales exigen iniciar sesión", [301, 302, 303, 307, 308].includes(r.status) && /\/login/.test(r.headers.get("location") || ""), `HTTP ${r.status}`);

  // Las acciones no aceptan peticiones anónimas
  r = await get("/auth/signout", { method: "POST" });
  check("cerrar sesión no falla sin sesión", r.status < 500, `HTTP ${r.status}`);

  // Cabeceras de seguridad
  r = await get("/login");
  for (const h of ["x-content-type-options", "x-frame-options", "referrer-policy"]) {
    check(`cabecera ${h}`, Boolean(r.headers.get(h)), r.headers.get(h) || "falta");
  }

  // La API de Supabase con la llave pública no debe dar datos sin sesión (si se indica el proyecto)
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (url && anon) {
    for (const t of ["profiles", "enrollments", "groups", "curriculum_versions", "certificates", "group_private", "resources"]) {
      const res = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
      const body = res.ok ? await res.json() : [];
      check(`sin sesión no se lee ${t}`, !res.ok || (Array.isArray(body) && body.length === 0), `HTTP ${res.status}, ${Array.isArray(body) ? body.length : "?"} filas`);
    }
  }
}

main()
  .catch((e) => check("la prueba terminó sin errores", false, String(e)))
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
    console.log(`\n${results.length - failed.length} de ${results.length} comprobaciones correctas.`);
    process.exit(failed.length ? 1 : 0);
  });
