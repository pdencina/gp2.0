const fs = require("fs");
const read = (f) => fs.readFileSync(f, "utf8").split("\r\n").join("\n");
const edit = (file, pairs) => {
  let t = read(file);
  for (const [a, b] of pairs) { if (!t.includes(a)) throw new Error(file + ": no encontrado: " + a.slice(0, 60)); t = t.replace(a, b); }
  fs.writeFileSync(file, t);
};

// 1) correo estricto, como el que acepta Supabase
edit("migracion/lib/transform.ts", [[
  "const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;",
  "// Formato estricto (ASCII, sin puntos pegados ni al borde): el que Supabase acepta de verdad\nconst EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;",
]]);

// 2) un rechazo de formato no es un fallo de conexión
edit("migracion/lib/http.ts", [
  ['import type { AuthCreator, Rpc } from "./apply";', 'import type { AuthCreator, Rpc } from "./apply";\nimport { AccountRejected } from "./errors";'],
  ["      throw new Error(`No se pudo crear una cuenta (${res.status}): ${text.slice(0, 160)}`);",
   "      if (res.status === 400 || res.status === 422) throw new AccountRejected(`(${res.status}) ${text.slice(0, 160)}`);\n      throw new Error(`No se pudo crear una cuenta (${res.status}): ${text.slice(0, 160)}`);"],
]);
fs.writeFileSync("migracion/lib/errors.ts", `/** Supabase rechazó los datos de una cuenta (por ejemplo, un correo con formato inválido). No es un fallo de conexión. */
export class AccountRejected extends Error {
  constructor(detail: string) {
    super(\`Cuenta rechazada \${detail}\`);
    this.name = "AccountRejected";
  }
}
`);

// 3) apply: seguir con el resto y anotar a quienes se rechazó
edit("migracion/lib/apply.ts", [
  ['import { uuid5 } from "./ids";', 'import { uuid5 } from "./ids";\nimport { AccountRejected } from "./errors";'],
  ["  log?: (msg: string) => void;\n  concurrency?: number;\n};", "  log?: (msg: string) => void;\n  concurrency?: number;\n  /** Se llama por cada cuenta que Supabase rechazó; la importación sigue con las demás. */\n  onRejected?: (email: string, reason: string) => void;\n};"],
  ["  let done = 0;\n  await pool(toCreate, opts.concurrency ?? 6, async (p: PersonOut) => {\n    await createAuthUser({ email: p.email, passwordHash: p.passwordHash, fullName: p.fullName });\n    if (++done % 500 === 0) log(`  ${done}/${toCreate.length} cuentas creadas`);\n  });",
   "  let done = 0;\n  let rejected = 0;\n  await pool(toCreate, opts.concurrency ?? 6, async (p: PersonOut) => {\n    try {\n      await createAuthUser({ email: p.email, passwordHash: p.passwordHash, fullName: p.fullName });\n    } catch (e) {\n      if (!(e instanceof AccountRejected)) throw e;\n      rejected++;\n      opts.onRejected?.(p.email, e.message);\n    }\n    if (++done % 500 === 0) log(`  ${done}/${toCreate.length} cuentas procesadas`);\n  });\n  if (rejected) log(`Aviso: Supabase rechazó ${rejected} cuentas; esas personas se omiten`);\n  result.cuentas_rechazadas = rejected;"],
  ["  result.cuentas_creadas = toCreate.length;", "  result.cuentas_creadas = toCreate.length - rejected;"],
]);

// 4) la herramienta guarda la lista de rechazadas
edit("migracion/importar.ts", [
  ["  const result = await applyPlan(plan, {", "  const rechazadas: string[] = [];\n  const result = await applyPlan(plan, {"],
  ["    log: (m) => console.log(m),\n  });", "    log: (m) => console.log(m),\n    onRejected: (email, reason) => rechazadas.push(`${email},${JSON.stringify(reason)}`),\n  });\n  if (rechazadas.length) {\n    writeFileSync(join(outDir, \"cuentas-rechazadas.csv\"), [\"correo,motivo\", ...rechazadas].join(\"\n\"));\n    console.log(`\nSe omitieron ${rechazadas.length} personas cuyo correo Supabase rechazó (lista en ${join(outDir, \"cuentas-rechazadas.csv\")}).`);\n  }"],
]);
console.log("ok");
