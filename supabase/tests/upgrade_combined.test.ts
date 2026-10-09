import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// El archivo único "aplicar_en_orden.sql" debe estar al día y funcionar sobre la versión 1.

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

describe("aplicar_en_orden.sql", () => {
  it("coincide con lo que genera el script a partir de 000 y 001", () => {
    const committed = read("v2/aplicar_en_orden.sql");
    execFileSync("node", [join(root, "..", "scripts", "build-apply-sql.js")]);
    expect(read("v2/aplicar_en_orden.sql")).toBe(committed);
  });

  it("actualiza un proyecto en versión 1 de una sola vez y conserva las cuentas", async () => {
    const db = new PGlite();
    await db.exec(STUBS);
    for (const f of readdirSync(join(root, "migrations")).filter((x) => x.endsWith(".sql")).sort()) {
      await db.exec(read(`migrations/${f}`));
    }
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data) values
        ('00000000-0000-0000-0000-000000000001', 'a@t.local', '{"full_name":"Admin"}');
      update profiles set role = 'admin', phone = '+56912345678';
      insert into curriculums (id, name) values ('00000000-0000-0000-0000-000000000100', 'Viejo');
    `);

    await db.exec(read("v2/aplicar_en_orden.sql"));

    const p = (await db.query<{ role: string; phone: string }>(`select role, phone from profiles`)).rows;
    expect(p).toEqual([{ role: "admin", phone: "+56912345678" }]);
    const t = (await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('seasons', 'cycles', 'enrollments', 'group_members')`
    )).rows.map((r) => r.table_name).sort();
    expect(t).toEqual(["cycles", "enrollments", "seasons"]);
    const v = (await db.query(`select 1 from information_schema.views where table_name in ('group_overview', 'roster', 'meeting_summary')`)).rows;
    expect(v).toHaveLength(3);
  });
});
