export type Role = "admin" | "coordinador" | "monitor" | "lider" | "alumno";

type RoleView = {
  label: string;
  scope: string;
  action: string;
  listTitle: string;
};

// Escalera de ascenso: alumno -> líder -> monitor -> coordinador (el admin queda fuera).
export const NEXT_ROLE: Partial<Record<Role, Role>> = {
  alumno: "lider",
  lider: "monitor",
  monitor: "coordinador",
};

const RANK: Record<Role, number> = { alumno: 1, lider: 2, monitor: 3, coordinador: 4, admin: 5 };

// Un rol puede promover si es superior al rol destino (el admin siempre puede).
export function canPromote(caller: Role, target: Role): Role | null {
  const next = NEXT_ROLE[target];
  if (!next) return null;
  return caller === "admin" || RANK[caller] > RANK[next] ? next : null;
}

export const ROLE_VIEWS: Record<Role, RoleView> = {
  admin: {
    label: "Gran administrador",
    scope: "Vista global · todos los currículums",
    action: "Crear currículum",
    listTitle: "Todos los grupos",
  },
  coordinador: {
    label: "Coordinador",
    scope: "Tu currículum",
    action: "Asignar grupos",
    listTitle: "Grupos de tu currículum",
  },
  monitor: {
    label: "Monitor",
    scope: "Tus grupos pequeños",
    action: "Ver alertas",
    listTitle: "Grupos a tu cargo",
  },
  lider: {
    label: "Líder",
    scope: "Tu grupo",
    action: "Pasar lista",
    listTitle: "Tu grupo",
  },
  alumno: {
    label: "Alumno",
    scope: "Tu camino",
    action: "Ver lección de hoy",
    listTitle: "Tu grupo",
  },
};
