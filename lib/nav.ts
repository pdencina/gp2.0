import type { Role } from "@/lib/roles";

export type NavItem = { href: string; label: string; icon: string };
export type NavSection = { title: string; items: NavItem[] };

const ALL: Role[] = ["admin", "coordinador", "monitor", "lider", "alumno"];
const MANAGERS: Role[] = ["admin", "coordinador", "monitor", "lider"];

const ITEMS: { section: string; item: NavItem; roles: Role[] }[] = [
  { section: "Mi espacio", item: { href: "/inicio", label: "Inicio", icon: "home" }, roles: ALL },
  { section: "Mi espacio", item: { href: "/mi-progreso", label: "Mi progreso", icon: "route" }, roles: ALL },
  { section: "Mi espacio", item: { href: "/catalogo", label: "Catálogo", icon: "plus" }, roles: ALL },
  { section: "Mi espacio", item: { href: "/perfil", label: "Mi perfil", icon: "user" }, roles: ALL },
  { section: "Seguimiento", item: { href: "/panel", label: "Panel", icon: "chart" }, roles: ["admin", "coordinador", "monitor"] },
  { section: "Seguimiento", item: { href: "/grupos", label: "Grupos", icon: "grid" }, roles: MANAGERS },
  { section: "Seguimiento", item: { href: "/alertas", label: "Alertas", icon: "bell" }, roles: MANAGERS },
  { section: "Seguimiento", item: { href: "/recuperacion", label: "Recuperación", icon: "lifebuoy" }, roles: MANAGERS },
  { section: "Seguimiento", item: { href: "/equipo", label: "Equipo", icon: "users" }, roles: ["admin", "coordinador", "monitor"] },
  { section: "Administración", item: { href: "/curriculums", label: "Currículums", icon: "book" }, roles: ["admin", "coordinador"] },
  { section: "Administración", item: { href: "/biblioteca", label: "Biblioteca", icon: "library" }, roles: ["admin", "coordinador"] },
  { section: "Administración", item: { href: "/revision", label: "Revisión", icon: "check" }, roles: ["admin", "coordinador"] },
  { section: "Administración", item: { href: "/temporadas", label: "Temporadas", icon: "calendar" }, roles: ["admin"] },
];

export function navFor(role: Role): NavSection[] {
  const sections: NavSection[] = [];
  for (const { section, item, roles } of ITEMS) {
    if (!roles.includes(role)) continue;
    let s = sections.find((x) => x.title === section);
    if (!s) sections.push((s = { title: section, items: [] }));
    s.items.push(item);
  }
  return sections;
}
