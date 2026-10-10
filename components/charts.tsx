import Link from "next/link";

// Gráficos sencillos en SVG y HTML. Se dibujan en el servidor, sin librerías.

type Tone = "teal" | "orange" | "green" | "stone" | "red";
const BAR: Record<Tone, string> = {
  teal: "bg-brand-teal", orange: "bg-brand-orange", green: "bg-brand-green", stone: "bg-stone-300", red: "bg-red-400",
};

export function Card({ title, subtitle, action, children, className = "" }: {
  title: string; subtitle?: string; action?: { href: string; label: string }; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-4 md:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
        </div>
        {action && (
          <Link href={action.href} className="text-sm text-brand-teal hover:underline">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, delta, href, tone = "stone" }: {
  label: string; value: string; sub?: string; href?: string; tone?: "stone" | "alert" | "good";
  delta?: { text: string; tone: "up" | "down" | "flat" } | null;
}) {
  const body = (
    <div className={`h-full rounded-xl border bg-white p-4 ${tone === "alert" ? "border-amber-300" : "border-stone-200"} ${href ? "transition hover:border-brand-teal" : ""}`}>
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-medium ${tone === "alert" ? "text-amber-700" : ""}`}>{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
        {delta && (
          <span className={delta.tone === "up" ? "text-green-700" : delta.tone === "down" ? "text-red-700" : "text-stone-500"}>
            {delta.text}
          </span>
        )}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

/** Barra horizontal con valor. `value` y `max` en las mismas unidades. */
export function Bar({ value, max = 100, tone = "teal", label }: { value: number | null; max?: number; tone?: Tone; label?: string }) {
  const w = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100" role="img" aria-label={label ?? `${w.toFixed(0)} %`}>
      <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Línea con área, para porcentajes de 0 a 100. El último punto puede marcarse como parcial. */
export function LineChart({ points, partialLast = false }: {
  points: { label: string; value: number | null; detail?: string }[]; partialLast?: boolean;
}) {
  const W = 640, H = 220, L = 36, R = 12, T = 12, B = 28;
  const usable = points.filter((p) => p.value !== null);
  if (usable.length < 2) return <p className="py-8 text-center text-sm text-stone-500">Todavía no hay suficientes semanas con asistencia.</p>;

  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, points.length - 1);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const solid = partialLast ? points.slice(0, -1) : points;
  const path = solid.map((p, i) => (p.value === null ? null : `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)).filter(Boolean).join(" ");
  const area = `${path} L${x(solid.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Asistencia semana a semana">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="stroke-stone-200" strokeWidth={1} />
          <text x={L - 6} y={y(g) + 4} textAnchor="end" className="fill-stone-400" fontSize={11}>{g}%</text>
        </g>
      ))}
      <path d={area} className="fill-brand-teal/10" />
      <path d={path} className="fill-none stroke-brand-teal" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {partialLast && last.value !== null && prev?.value !== null && prev && (
        <line x1={x(points.length - 2)} y1={y(prev.value!)} x2={x(points.length - 1)} y2={y(last.value)} className="stroke-brand-teal" strokeWidth={2} strokeDasharray="4 4" />
      )}
      {points.map((p, i) =>
        p.value === null ? null : (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={partialLast && i === points.length - 1 ? 3.5 : 4} className={partialLast && i === points.length - 1 ? "fill-white stroke-brand-teal" : "fill-brand-teal"} strokeWidth={2}>
              <title>{`${p.label}: ${p.value.toFixed(1).replace(".", ",")} %${p.detail ? ` · ${p.detail}` : ""}`}</title>
            </circle>
          </g>
        )
      )}
      {points.map((p, i) => (i % 2 === 0 || i === points.length - 1) && (
        <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="fill-stone-500" fontSize={11}>{p.label}</text>
      ))}
    </svg>
  );
}

/** Columnas apiladas: aprobados, no completaron y el resto (en curso). */
export function StackedColumns({ data }: { data: { label: string; ok: number; no: number; rest: number }[] }) {
  const W = 640, H = 220, L = 8, R = 8, T = 10, B = 30;
  const max = Math.max(1, ...data.map((d) => d.ok + d.no + d.rest));
  const slot = (W - L - R) / Math.max(1, data.length);
  const bw = Math.min(26, slot * 0.7);
  const h = (v: number) => (v / max) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Inscripciones por temporada">
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="stroke-stone-300" />
      {data.map((d, i) => {
        const cx = L + slot * i + slot / 2;
        let yy = H - B;
        const seg = (v: number, cls: string, name: string) => {
          if (v <= 0) return null;
          yy -= h(v);
          return <rect key={name} x={cx - bw / 2} y={yy} width={bw} height={h(v)} className={cls}><title>{`${d.label} · ${name}: ${v.toLocaleString("es-CL")}`}</title></rect>;
        };
        return (
          <g key={d.label}>
            {seg(d.ok, "fill-brand-green", "aprobaron")}
            {seg(d.no, "fill-stone-300", "no completaron")}
            {seg(d.rest, "fill-brand-teal", "en curso")}
            {(i % 2 === 0 || data.length < 10) && (
              <text x={cx} y={H - 10} textAnchor="middle" className="fill-stone-500" fontSize={10}>{d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; tone: Tone }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm ${BAR[i.tone]}`} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
