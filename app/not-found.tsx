import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-medium">No encontramos esa página</h1>
        <p className="mt-2 text-sm text-stone-600">
          Puede que el enlace esté mal escrito o que no tengas acceso a este contenido.
        </p>
        <Link
          href="/inicio"
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand-orange px-5 text-sm font-medium text-white hover:brightness-95"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
