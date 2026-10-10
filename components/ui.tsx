import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

// Piezas de interfaz compartidas. Son componentes de servidor (sin estado), salvo que se indique.

/* ------------------------------------------------------------------ Encabezado de página */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="enter mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-stone-500 transition hover:text-brand-teal">
          <Icon name="arrow-left" className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ Estado vacío */
export function EmptyState({
  icon = "sparkle",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="empty pop-in">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-teal/10 text-brand-teal">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="font-semibold text-brand-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-stone-500">{children}</p>}
      {action && (
        <Link href={action.href} className="btn btn-primary mt-4">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Aviso destacado */
const CALLOUT: Record<string, { box: string; icon: IconName; iconBox: string }> = {
  info: { box: "border-brand-teal/20 bg-brand-teal-50 text-brand-teal-800", icon: "info", iconBox: "bg-brand-teal/15 text-brand-teal" },
  warn: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: "alert", iconBox: "bg-amber-100 text-amber-700" },
  success: { box: "border-brand-green/25 bg-brand-green-50 text-brand-green-800", icon: "check-circle", iconBox: "bg-brand-green/15 text-brand-green" },
  danger: { box: "border-red-200 bg-red-50 text-red-800", icon: "alert", iconBox: "bg-red-100 text-red-600" },
};

export function Callout({
  tone = "info",
  children,
  href,
  action,
  className = "",
}: {
  tone?: "info" | "warn" | "success" | "danger";
  children: React.ReactNode;
  href?: string;
  action?: string;
  className?: string;
}) {
  const t = CALLOUT[tone];
  const body = (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${t.box} ${href ? "transition hover:brightness-[0.98]" : ""} ${className}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${t.iconBox}`}>
        <Icon name={t.icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {href && action && (
        <span className="flex shrink-0 items-center gap-1 font-semibold">
          {action}
          <Icon name="arrow-right" className="h-4 w-4" />
        </span>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ------------------------------------------------------------------ Avatar con iniciales */
const AVATAR_TONES = [
  "bg-brand-teal-100 text-brand-teal-800",
  "bg-brand-orange-100 text-brand-orange-800",
  "bg-brand-green-100 text-brand-green-800",
  "bg-violet-100 text-violet-800",
  "bg-sky-100 text-sky-800",
  "bg-rose-100 text-rose-800",
];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const clean = (name || "?").trim();
  const initials = clean.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  let h = 0;
  for (const ch of clean) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const dims = size === "sm" ? "h-7 w-7 text-[11px]" : size === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-sm";
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dims} ${AVATAR_TONES[h % AVATAR_TONES.length]}`}>
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ Anillo de avance */
export function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  label,
  tone = "green",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  tone?: "green" | "teal" | "orange";
  children?: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = tone === "teal" ? "#1E8082" : tone === "orange" ? "#C2501A" : "#2E8540";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(pct)} %`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEE9E1" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          style={{ ["--ring-circ" as string]: circ, animation: "ring-draw 1s cubic-bezier(0.22, 1, 0.36, 1) both" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular">{children ?? `${Math.round(pct)}%`}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ Barra de avance */
export function ProgressBar({ value, label, className = "" }: { value: number; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={`progress ${className}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Avance"}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ Puntito de urgencia */
export function Dot({ tone }: { tone: "red" | "amber" | "stone" | "green" }) {
  const c = tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : tone === "green" ? "bg-brand-green" : "bg-stone-300";
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${c}`} />;
}
