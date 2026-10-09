import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applyPlan, type AuthCreator, type Rpc } from "../lib/apply";
import { AccountRejected } from "../lib/errors";
import { httpAuthCreator } from "../lib/http";
import { parseDump } from "../lib/mysqldump";
import { transform } from "../lib/transform";
import { OLD_DB, toDump } from "./fixture";

const STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique,
    encrypted_password text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;
const sql = (rel: string) => readFileSync(join(__dirname, "../../supabase/v2", rel), "utf8");

describe("correos que Supabase rechaza", () => {
  it("el análisis los descarta de antemano si el formato no es válido", () => {
    const db = {
      ...OLD_DB,
      users: [
        ...OLD_DB.users,
        { ...OLD_DB.users[0], id: 90, email: "con.punto.final.@x.cl" },
        { ...OLD_DB.users[0], id: 91, email: "dominio@x.cl." },
        { ...OLD_DB.users[0], id: 92, email: "tilde@exámple.cl" },
        { ...OLD_DB.users[0], id: 93, email: "coma,@x.cl" },
        { ...OLD_DB.users[0], id: 94, email: "valido+etiqueta@x.cl" },
      ],
    };
    const plan = transform(parseDump(toDump(db)));
    const invalid = plan.issues.filter((i) => i.code === "correo_invalido").map((i) => String(i.oldId));
    expect(invalid.sort()).toEqual(["4", "90", "91", "92", "93"]);
    expect(plan.persons.some((p) => p.email === "valido+etiqueta@x.cl")).toBe(true);
  });

  it("un rechazo 400 no se confunde con un fallo de conexión", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response('{"msg":"Unable to validate email address: invalid format"}', { status: 400 }));
    const create = httpAuthCreator("https://abc.supabase.co", "k", fetchMock as unknown as typeof fetch, async () => {});
    const error = await create({ email: "a@x.cl", passwordHash: null, fullName: "A" }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(AccountRejected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("la importación sigue con las demás personas y anota a quien se rechazó", async () => {
    const db = new PGlite();
    await db.exec(STUBS);
    await db.exec(sql("001_schema.sql"));
    await db.exec(sql("002_importacion.sql"));
    const rpc: Rpc = async (fn, args) => {
      const [key, value] = Object.entries(args)[0];
      const cast = key === "rows" ? "jsonb" : key === "ids" ? "uuid[]" : "text[]";
      const r = await db.query<Record<string, unknown>>(`select * from ${fn}($1::${cast})`, [key === "rows" ? JSON.stringify(value) : value]);
      return fn === "import_auth_map" ? r.rows : r.rows[0][fn];
    };
    const createAuthUser: AuthCreator = async ({ email }) => {
      if (email === "luis@x.cl") throw new AccountRejected("(400) invalid format");
      await db.query(`insert into auth.users (email) values ($1)`, [email]);
    };
    const rejected: string[] = [];
    const plan = transform(parseDump(toDump(OLD_DB)), new Date("2026-10-09T00:00:00Z"));

    const result = await applyPlan(plan, { rpc, createAuthUser, onRejected: (email) => rejected.push(email) });

    expect(rejected).toEqual(["luis@x.cl"]);
    expect(result).toMatchObject({ cuentas_rechazadas: 1, cuentas_creadas: 5, perfiles: 5 });
    const profiles = (await db.query<{ n: number }>(`select count(*)::int as n from profiles`)).rows[0].n;
    expect(profiles).toBe(5);
    // lo que dependía de esa persona se omite sin romper el resto
    const enrolled = (await db.query<{ n: number }>(`select count(*)::int as n from enrollments`)).rows[0].n;
    expect(enrolled).toBeGreaterThan(0);
    expect(enrolled).toBeLessThan(plan.enrollments.length);
  });

  it("un error que no es de formato (permisos, caída) sí detiene la importación", async () => {
    const db = new PGlite();
    await db.exec(STUBS);
    await db.exec(sql("001_schema.sql"));
    await db.exec(sql("002_importacion.sql"));
    const rpc: Rpc = async (fn) => (fn === "import_auth_map" ? [] : 0);
    const plan = transform(parseDump(toDump(OLD_DB)));
    await expect(
      applyPlan(plan, { rpc, createAuthUser: async () => { throw new Error("No se pudo crear una cuenta (403): forbidden"); } })
    ).rejects.toThrow(/403/);
  });
});
