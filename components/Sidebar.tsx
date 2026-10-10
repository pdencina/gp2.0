"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Icon, isIconName } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import type { NavSection } from "@/lib/nav";

function NavContent({ sections, userName, roleLabel }: { sections: NavSection[]; userName: string; roleLabel: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-full flex-col">
      <div className="hidden px-5 pb-3 pt-6 md:block">
        <Link href="/inicio" aria-label="Ir al inicio">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Menú principal">
        {sections.map((s) => (
          <div key={s.title} className="mb-6">
            <p className="eyebrow mb-1.5 px-3">{s.title}</p>
            <ul className="space-y-0.5">
              {s.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition duration-150 ${
                        active
                          ? "bg-brand-teal-50 font-semibold text-brand-teal-800"
                          : "text-stone-600 hover:bg-stone-100 hover:text-brand-ink"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-teal transition-all duration-200 ${
                          active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
                        }`}
                      />
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition duration-150 ${
                          active ? "bg-brand-teal text-white shadow-sm" : "bg-stone-100 text-stone-500 group-hover:bg-white group-hover:text-brand-teal group-hover:shadow-sm"
                        }`}
                      >
                        <Icon name={isIconName(item.icon) ? item.icon : "home"} className="h-[18px] w-[18px]" />
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-stone-200/80 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-stone-50 p-2.5">
          <Avatar name={userName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{userName}</p>
            <p className="truncate text-xs text-stone-500">{roleLabel}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-white hover:text-red-600 hover:shadow-sm"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <Icon name="logout" className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
        <Link href="/perfil" className="mt-2 block rounded-lg px-2 py-1.5 text-center text-xs font-medium text-stone-500 hover:text-brand-teal">
          Mi perfil y mis datos
        </Link>
      </div>
    </div>
  );
}

export function Sidebar(props: { sections: NavSection[]; userName: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Al navegar, el menú del celular se cierra
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Escritorio: menú fijo a la izquierda */}
      <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 border-r border-stone-200/80 bg-white md:block print:hidden">
        <NavContent {...props} />
      </aside>

      {/* Celular: barra superior y menú desplegable */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-stone-200/80 bg-white/90 px-4 backdrop-blur md:hidden print:hidden">
        <Link href="/inicio" aria-label="Ir al inicio">
          <Logo size="sm" />
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir el menú"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-600 transition hover:bg-stone-100 active:scale-95"
        >
          <Icon name="menu" className="h-6 w-6" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button className="fade-in absolute inset-0 bg-brand-ink/40 backdrop-blur-[2px]" aria-label="Cerrar el menú" onClick={() => setOpen(false)} />
          <div className="slide-in-left relative h-full w-[19rem] max-w-[88%] bg-white shadow-pop">
            <div className="flex h-14 items-center justify-between border-b border-stone-200/80 px-4">
              <Logo size="sm" />
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar el menú"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100"
              >
                <Icon name="x" className="h-6 w-6" />
              </button>
            </div>
            <div className="h-[calc(100%-3.5rem)]">
              <NavContent {...props} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
