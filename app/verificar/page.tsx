import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { cleanCode, formatCode, isValidCode } from "@/lib/certificates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificar un certificado", robots: { index: false } };

type Result = {
  full_name: string;
  program: string;
  kind: "etapa" | "programa";
  formative_year: number | null;
  issued_at: string;
  status: "emitido" | "revocado";
  campus: string | null;
};

const longDate = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" });

export default async function VerificarPage(props: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo } = await props.searchParams;
  const typed = (codigo ?? "").trim();
  let result: Result | null = null;
  let checked = false;

  if (typed && isValidCode(typed)) {
    checked = true;
    const { data } = await (await createClient()).rpc("verify_certificate", { code: cleanCode(typed) });
    result = ((data ?? []) as Result[])[0] ?? null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-6">
      <div className="mb-6 flex justify-center"><Logo /></div>
      <h1 className="text-center text-2xl font-medium">Verificar un certificado</h1>
      <p className="mb-6 mt-1 text-center text-sm text-stone-500">Escribe el código que aparece al pie del certificado.</p>

      <form method="get" className="mb-6 flex gap-2">
        <input
          name="codigo"
          defaultValue={typed}
          placeholder="A1B2-C3D4-E5F6"
          autoComplete="off"
          aria-label="Código del certificado"
          className="h-12 w-full rounded-lg border border-stone-300 bg-white px-3 font-mono text-base uppercase outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
        />
        <button className="h-12 rounded-lg bg-brand-orange px-5 text-sm font-medium text-white hover:brightness-95">Verificar</button>
      </form>

      {typed && !isValidCode(typed) && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          El código tiene 12 letras y números (por ejemplo A1B2-C3D4-E5F6). Revísalo e inténtalo de nuevo.
        </p>
      )}

      {checked && !result && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          No encontramos ningún certificado con el código {formatCode(cleanCode(typed))}. Revisa que esté bien escrito.
        </p>
      )}

      {result && (
        <section
          role="status"
          className={`rounded-xl border p-5 ${result.status === "emitido" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
        >
          <p className={`mb-3 text-sm font-medium ${result.status === "emitido" ? "text-green-800" : "text-red-700"}`}>
            {result.status === "emitido" ? "✓ Certificado válido" : "✕ Este certificado fue revocado y ya no es válido"}
          </p>
          <p className="text-xl font-medium">{result.full_name}</p>
          <p className="mt-1 text-sm text-stone-700">
            {result.kind === "programa" ? "Completó el programa" : `Cumplió el año ${result.formative_year} del programa`} <strong className="font-medium">{result.program}</strong>
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {result.campus ? `Sede ${result.campus} · ` : ""}Emitido el {longDate(result.issued_at)}
          </p>
        </section>
      )}
    </main>
  );
}
