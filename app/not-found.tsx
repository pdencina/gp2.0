import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";

export const metadata = { title: "No encontramos esa página" };

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden p-6">
      <span aria-hidden="true" className="float-slow absolute -left-20 top-20 -z-10 h-64 w-64 rounded-full bg-brand-orange-100" />
      <span aria-hidden="true" className="float-slower absolute -right-16 bottom-16 -z-10 h-72 w-72 rounded-full bg-brand-teal-100" />
      <div className="enter max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <p className="text-7xl font-semibold tracking-tight text-brand-teal/30">404</p>
        <h1 className="page-title mt-2">No encontramos esa página</h1>
        <p className="mt-2 text-sm text-stone-600">
          Puede que el enlace esté mal escrito o que no tengas acceso a este contenido.
        </p>
        <Link href="/inicio" className="btn btn-primary btn-lg mt-6">
          Ir al inicio
          <Icon name="arrow-right" className="h-5 w-5" />
        </Link>
      </div>
    </main>
  );
}
