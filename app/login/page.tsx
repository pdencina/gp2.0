import { BrandLogo } from "@/components/BrandLogo";
import { LogoPlay } from "@/components/LogoPlay";
import { Icon, type IconName } from "@/components/Icon";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Ingresar" };

const POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: "route", title: "Tu camino, siempre contigo", text: "Tu avance se conserva aunque cambies de grupo, de horario o de año." },
  { icon: "users", title: "Cerca de tu líder", text: "Presencial u online, con quien te acompaña semana a semana." },
  { icon: "award", title: "Cada etapa cuenta", text: "Ves lo que llevas, lo que sigue y recibes tu certificado." },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative isolate flex flex-col justify-between gap-10 overflow-hidden bg-gradient-to-br from-brand-teal-800 via-brand-teal-700 to-brand-teal p-8 text-white md:p-12">
        {/* formas que flotan despacio */}
        <span aria-hidden="true" className="float-slow absolute -right-14 -top-14 -z-10 h-40 w-40 rounded-full md:-right-16 md:-top-16 md:h-72 md:w-72 bg-brand-orange-400/90 blur-[2px]" />
        <span aria-hidden="true" className="float-slower absolute -bottom-16 right-16 -z-10 h-36 w-36 rounded-full md:-bottom-24 md:right-24 md:h-80 md:w-80 bg-brand-green-400/80" />
        <span aria-hidden="true" className="float-slow absolute bottom-40 -left-20 -z-10 hidden h-56 w-56 rounded-full md:block bg-white/10" />

        <div className="flex items-center gap-3">
          <span className="chip bg-white/15 px-3 py-1.5 text-white ring-1 ring-white/25 backdrop-blur">
            <span className="rounded-full bg-brand-orange-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-brand-teal-900">2.0</span>
            Nueva plataforma
          </span>
        </div>

        <div className="max-w-lg">
          <LogoPlay className="mb-8 w-full max-w-[22rem] md:max-w-[26rem]">
            <BrandLogo variant="stacked" tone="light" anim="intro" className="h-auto w-full" />
          </LogoPlay>
          <h1 className="enter text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">
            La fe se vive mejor en comunidad
          </h1>
          <p className="enter mt-4 max-w-md text-lg text-white/85" style={{ animationDelay: "0.1s" }}>
            Encuentra tu grupo, mantén el contacto con tu líder y sigue tu camino semana a semana.
          </p>

          <ul className="stagger mt-10 hidden space-y-4 md:block">
            {POINTS.map((p) => (
              <li key={p.title} className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                  <Icon name={p.icon} className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm text-white/75">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-white/70">ARM Global · Grupos Pequeños</p>
      </section>

      <section className="flex items-center justify-center bg-white p-6 md:p-12">
        <LoginForm />
      </section>
    </main>
  );
}
