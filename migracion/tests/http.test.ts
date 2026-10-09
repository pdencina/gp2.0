import { describe, expect, it, vi } from "vitest";
import { httpAuthCreator, httpRpc } from "../lib/http";

const KEY = "clave-secreta-de-prueba";
const res = (status: number, body: unknown = "") =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const noWait = async () => {};

describe("llamadas a la API de Supabase", () => {
  it("envía la función, la clave y el contenido correctos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, 5));
    const rpc = httpRpc("https://abc.supabase.co/", KEY, fetchMock as unknown as typeof fetch, noWait);
    expect(await rpc("import_profiles", { rows: [{ id: 1 }] })).toBe(5);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://abc.supabase.co/rest/v1/rpc/import_profiles");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ apikey: KEY, Authorization: `Bearer ${KEY}` });
    expect(JSON.parse(init.body)).toEqual({ rows: [{ id: 1 }] });
  });

  it("reintenta ante un fallo temporal y luego sigue", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(503, "busy"))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(res(200, []));
    const rpc = httpRpc("https://abc.supabase.co", KEY, fetchMock as unknown as typeof fetch, noWait);
    expect(await rpc("import_auth_map", { emails: [] })).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("un error real se informa sin repetir y sin mostrar la clave", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(400, { message: "invalid input syntax for type uuid" }));
    const rpc = httpRpc("https://abc.supabase.co", KEY, fetchMock as unknown as typeof fetch, noWait);
    const error = await rpc("import_groups", { rows: [] }).catch((e: Error) => e);
    expect((error as Error).message).toContain("import_groups: 400");
    expect((error as Error).message).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("se rinde tras varios fallos seguidos", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => res(500, "boom"));
    const rpc = httpRpc("https://abc.supabase.co", KEY, fetchMock as unknown as typeof fetch, noWait);
    await expect(rpc("import_groups", { rows: [] })).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe("creación de cuentas", () => {
  const person = { email: "a@x.cl", passwordHash: "$2a$10$" + "a".repeat(53), fullName: "Ana" };

  it("manda el correo, el nombre y la contraseña ya cifrada, y confirma el correo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, {}));
    await httpAuthCreator("https://abc.supabase.co", KEY, fetchMock as unknown as typeof fetch, noWait)(person);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://abc.supabase.co/auth/v1/admin/users");
    expect(JSON.parse(init.body)).toEqual({
      email: "a@x.cl", email_confirm: true, user_metadata: { full_name: "Ana" }, password_hash: person.passwordHash,
    });
  });

  it("sin contraseña válida crea la cuenta sin contraseña", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, {}));
    await httpAuthCreator("https://abc.supabase.co", KEY, fetchMock as unknown as typeof fetch, noWait)({ ...person, passwordHash: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("password_hash");
  });

  it("si la cuenta ya existía, no es un error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(422, { msg: "A user with this email address has already been registered" }));
    await expect(httpAuthCreator("https://abc.supabase.co", KEY, fetchMock as unknown as typeof fetch, noWait)(person)).resolves.toBeUndefined();
  });

  it("un rechazo real se informa", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(403, "not allowed"));
    await expect(httpAuthCreator("https://abc.supabase.co", KEY, fetchMock as unknown as typeof fetch, noWait)(person)).rejects.toThrow(/403/);
  });
});
