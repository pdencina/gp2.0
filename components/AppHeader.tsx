import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { Role } from "@/lib/roles";

const LINKS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/inicio", label: "Inicio", roles: ["admin", "coordinador", "monitor", "lider", "alumno"] },
  { href: "/curriculums", label: "Currículums", roles: ["admin", "coordinador"] },
  { href: "/grupos", label: "Grupos", roles: ["admin", "coordinador", "monitor", "lider"] },
  { href: "/alertas", label: "Alertas", roles: ["admin", "coordinador", "monitor", "lider"] },
  { href: "/equipo", label: "Equipo", roles: ["admin", "coordinador", "monitor"] },
];

export function AppHeader({ role }: { role: Role }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <Logo />
      <nav className="flex flex-wrap items-center gap-4 text-sm">
        {LINKS.filter((l) => l.roles.includes(role)).map((l) => (
          <Link key={l.href} href={l.href} className="text-brand-teal hover:underline">
            {l.label}
          </Link>
        ))}
        <form action="/auth/signout" method="post">
          <button className="text-stone-600 hover:underline">Salir</button>
        </form>
      </nav>
    </header>
  );
}
