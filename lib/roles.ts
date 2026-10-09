export type Role = "admin" | "coordinador" | "monitor" | "lider" | "alumno";

type RoleView = {
  label: string;
  scope: string;
  action: string;
  listTitle: string;
};

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
