"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import type { NavSection } from "@/lib/nav";

const ICONS: Record<string, string> = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  lifebuoy: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 15a3 3 0 100-6 3 3 0 000 6zM5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M18.4 5.6l-3.5 3.5M9.1 14.9l-3.5 3.5",
  library: "M4 4v16M9 4v16M14 6l5 14M4 20h10",
  check: "M5 12l4 4 10-10M4 20h16",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  award: "M12 15a6 6 0 100-12 6 6 0 000 12zM8.5 14l-1.5 7 5-3 5 3-1.5-7",
  route: "M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h6a4 4 0 000-8h-4a3 3 0 010-6h5",
  plus: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v8M8 12h8",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  bell: "M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4",
  users: "M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M16 11a3 3 0 100-6M21 20a6 6 0 00-4-5.6",
  book: "M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-4a3 3 0 00-3 3M20 4v14h-5",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] ?? ICONS.home} />
    </svg>
  );
}

function NavContent({ sections, userName, roleLabel }: { sections: NavSection[]; userName: string; roleLabel: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-full flex-col">
      <div className="hidden px-5 pb-4 pt-6 md:block">
        <Logo />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Menú principal">
        {sections.map((s) => (
          <div key={s.title} className="mb-5">
            <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-stone-400">{s.title}</p>
            <ul className="space-y-0.5">
              {s.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                        active
                          ? "bg-brand-teal/10 font-medium text-brand-teal"
                          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                      }`}
                    >
                      <Icon name={item.icon} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-stone-200 p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-orange/15 text-sm font-medium text-brand-orange">
            {(userName.trim()[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-xs text-stone-500">{roleLabel}</p>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50">
            Salir
          </button>
        </form>
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
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-stone-200 bg-white md:block print:hidden">
        <NavContent {...props} />
      </aside>

      {/* Celular: barra superior y menú desplegable */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-stone-200 bg-white px-4 md:hidden print:hidden">
        <Logo />
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir el menú"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-stone-100"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button className="absolute inset-0 bg-black/40" aria-label="Cerrar el menú" onClick={() => setOpen(false)} />
          <div className="relative h-full w-72 max-w-[85%] bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-stone-200 px-4">
              <Logo />
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar el menú"
                className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-stone-100"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
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
