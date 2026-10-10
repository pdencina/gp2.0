// Comprueba qué puede leer cualquier visitante con la llave pública de la aplicación (la misma que va en la página).
//   node scripts/exposicion-publica.js https://gp2-0.vercel.app
// Solo hace lecturas (GET) y no necesita ninguna cuenta. Lo esperado: ninguna tabla devuelve filas.
const base = (process.argv[2] || "").replace(/\/$/, "");
if (!base) {
  console.error("Indica la dirección del sitio: node scripts/exposicion-publica.js https://tu-sitio.vercel.app");
  process.exit(2);
}

const TABLAS = [
  "profiles", "enrollments", "groups", "group_private", "meetings", "attendance", "contacts", "curriculums",
  "curriculum_versions", "annual_learning_plans", "learning_plan_slots", "lessons", "resources", "certificates",
  "curriculum_enrollments", "unit_completions", "stage_credits", "catchup_plans", "campuses", "campus_pastors",
  "migration_expected", "audit_log", "seasons", "cycles",
  // reencuentro (014) y archivo histórico (015)
  "outreach_log", "legacy_archive", "role_history", "curriculum_coordinators",
];

// [función, argumentos de prueba]: ninguna debe devolver datos a un visitante sin sesión
const NIL = "00000000-0000-0000-0000-000000000000";
const FUNCIONES = [
  ["reengagement_summary", {}],
  ["reengagement_list", {}],
  ["reengagement_history", { p_ce: NIL }],
  ["log_outreach", { p_ce: NIL, p_kind: "mensaje", p_outcome: "sin_respuesta" }],
  ["my_comeback", {}],
  ["legacy_archive_summary", {}],
  ["legacy_for_person", { p_person: NIL }],
  ["archive_legacy_rows", { p_table: "x", p_rows: [] }],
  ["reconciliacion", {}],
  ["campus_readiness", {}],
  ["my_alerts", {}],
  ["panel_resumen", {}],
];

async function main() {
  const html = await (await fetch(base + "/login")).text();
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"\\]+\.js/g)].map((m) => m[0]))];
  let url = null;
  let key = null;
  for (const c of chunks) {
    const text = await (await fetch(base + c)).text();
    url = url || (text.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0] || null;
    key = key || (text.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/) || [])[0] || null;
    if (url && key) break;
  }
  if (!url || !key) {
    console.log("No pude encontrar el proyecto de Supabase en la página.");
    process.exit(2);
  }
  console.log(`Proyecto: ${url}\n`);

  let expuestas = 0;
  for (const t of TABLAS) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const body = r.ok ? await r.json() : null;
    const n = Array.isArray(body) ? body.length : 0;
    if (n > 0) expuestas += 1;
    console.log(`${n > 0 ? "✗ EXPUESTA" : "✓"} ${t.padEnd(24)} HTTP ${r.status}${n > 0 ? `  → ${n} fila(s) visibles sin iniciar sesión` : ""}`);
  }
  console.log(expuestas ? `\n${expuestas} tabla(s) se pueden leer sin iniciar sesión.` : "\nNinguna tabla se puede leer sin iniciar sesión.");

  // Funciones: un visitante sin sesión no debe poder llamarlas ni obtener datos de ellas
  let filtran = 0;
  for (const [fn, args] of FUNCIONES) {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    let body = null;
    try { body = await r.json(); } catch { /* sin cuerpo */ }
    const filas = Array.isArray(body) ? body.length : body && r.ok ? 1 : 0;
    if (r.ok && filas > 0) filtran += 1;
    const estado = !r.ok ? "rechazada" : filas > 0 ? "✗ DEVUELVE DATOS" : "responde vacío";
    console.log(`${r.ok && filas > 0 ? "✗" : "✓"} ${fn.padEnd(26)} HTTP ${r.status}  ${estado}`);
  }
  console.log(filtran ? `\n${filtran} función(es) devuelven datos sin iniciar sesión.` : "\nNinguna función devuelve datos sin iniciar sesión.");
  process.exit(expuestas || filtran ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
