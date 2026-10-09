import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <section className="flex flex-col justify-between gap-10 bg-brand-teal p-8 text-white md:p-12">
        <Logo light />
        <div>
          <h1 className="mb-3 text-3xl font-medium leading-tight md:text-4xl">
            La fe se vive mejor en comunidad
          </h1>
          <p className="max-w-md text-white/90">
            Encuentra tu grupo, mantén el contacto con tu líder y sigue tu camino semana a semana.
          </p>
        </div>
        <p className="text-sm text-white/80">ARM Global</p>
      </section>

      <section className="flex items-center justify-center bg-white p-6 md:p-12">
        <LoginForm />
      </section>
    </main>
  );
}
