"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Icon } from "@/components/Icon";
import { ProgressRing } from "@/components/ui";
import { countryLabel, locationMismatch } from "@/lib/places";
import type { MissingField } from "@/lib/profile-check";
import { awayLabel, progressLine } from "@/lib/reencuentro";

/** Un camino que la persona dejó hace tiempo y sigue guardado (my_comeback) */
export type Comeback = {
  ce_id: string;
  curriculum: string;
  months_away: number;
  units_done: number;
  units_total: number;
  modules_done: number;
  modules_total: number;
};

// Ventana de bienvenida: una vez por inicio de sesión. Saluda, avisa de los datos personales que
// faltan y, si el dispositivo parece estar en otro país que el del perfil, invita a actualizarlo.

const MAX_LISTED = 6;

export function WelcomeDialog({
  userId,
  signInKey,
  firstName,
  country,
  missing,
  percent,
  blocking,
  comeback = [],
}: {
  userId: string;
  /** Cambia en cada inicio de sesión (así la ventana vuelve a salir, pero no en cada página) */
  signInKey: string;
  firstName: string;
  country: string | null;
  missing: MissingField[];
  percent: number;
  blocking: boolean;
  comeback?: Comeback[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [elsewhere, setElsewhere] = useState<string | null>(null);

  useEffect(() => {
    const seenKey = `gp-welcome:${signInKey}`;
    try {
      if (sessionStorage.getItem(seenKey)) return;
      // Si ya está editando su perfil, no se le tapa la pantalla
      if (pathname.startsWith("/perfil")) {
        sessionStorage.setItem(seenKey, "1");
        return;
      }
      sessionStorage.setItem(seenKey, "1");
    } catch {
      // sin almacenamiento (modo privado): se muestra igual, una vez por carga
    }
    let detected: string | null = null;
    try {
      detected = locationMismatch(country, Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (detected && localStorage.getItem(`gp-loc:${userId}`) === detected) detected = null;
    } catch {
      detected = null;
    }
    setElsewhere(detected);
    setOpen(true);
    // solo al entrar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);

  const close = () => {
    ref.current?.close();
    setOpen(false);
  };
  const keepCountry = () => {
    try {
      if (elsewhere) localStorage.setItem(`gp-loc:${userId}`, elsewhere);
    } catch {
      /* nada */
    }
    setElsewhere(null);
  };

  if (!open) return null;

  const shown = missing.slice(0, MAX_LISTED);
  const rest = missing.length - shown.length;
  const hasMissing = missing.length > 0;
  const hasComeback = comeback.length > 0;
  const needsAction = hasMissing || !!elsewhere || hasComeback;
  const greeting = firstName ? `Te damos la bienvenida, ${firstName}` : "Te damos la bienvenida";
  const lead = hasComeback
    ? "Qué bueno verte de nuevo. Lo que avanzaste sigue guardado: puedes continuar desde donde lo dejaste."
    : blocking
      ? "Para poder inscribirte a un programa necesitamos que completes algunos datos."
      : hasMissing
        ? "Tu perfil está casi listo. Estos datos ayudan a que tu líder pueda acompañarte mejor."
        : "Qué bueno verte de nuevo. Tus datos personales están al día.";

  return (
    <dialog
      ref={ref}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      aria-labelledby="welcome-title"
      className="pop-in m-auto w-[min(92vw,30rem)] max-h-[92vh] overflow-y-auto rounded-3xl border-0 bg-white p-0 text-brand-ink shadow-pop backdrop:bg-brand-ink/50 backdrop:backdrop-blur-sm"
    >
      <div className="relative overflow-hidden px-6 pb-6 pt-7 sm:px-8">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-teal-400 via-brand-green-400 to-brand-orange-400" />
        <div className="mb-3 flex justify-center">
          <BrandLogo variant="mark" anim="intro" className="h-20 w-auto" label={null} />
        </div>
        <h2 id="welcome-title" className="text-center text-2xl font-semibold tracking-tight">
          {greeting}
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-center text-sm text-stone-600">{lead}</p>

        {hasComeback && (
          <section aria-label="Tu camino sigue guardado" className="mt-5 space-y-2">
            {comeback.map((c) => (
              <div key={c.ce_id} className="flex items-center gap-3 rounded-2xl border border-brand-green/25 bg-brand-green-50/60 p-3">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-green shadow-sm">
                  <Icon name="route" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.curriculum}</p>
                  <p className="text-xs text-stone-600">
                    {progressLine(c)} · {awayLabel(c.months_away)}
                  </p>
                </div>
                <Link href={`/mi-progreso/${c.ce_id}`} onClick={close} className="btn btn-primary btn-sm shrink-0">
                  Retomar
                </Link>
              </div>
            ))}
          </section>
        )}

        {hasMissing && (
          <section aria-label="Datos por completar" className="mt-5 rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
            <div className="mb-3 flex items-center gap-3">
              <ProgressRing value={percent} size={52} stroke={6} tone={blocking ? "orange" : "teal"} label={`Perfil completo al ${percent} %`}>
                <span className="text-xs font-semibold tabular">{percent}%</span>
              </ProgressRing>
              <p className="text-sm font-semibold">
                Faltan {missing.length} {missing.length === 1 ? "dato" : "datos"} por completar
              </p>
            </div>
            <ul className="space-y-1.5">
              {shown.map((m) => (
                <li key={m.key} className="flex items-start gap-2 text-sm">
                  <Icon name={m.needed ? "alert" : "info"} className={`mt-0.5 h-4 w-4 shrink-0 ${m.needed ? "text-amber-600" : "text-stone-400"}`} />
                  <span className="flex-1">{m.label}</span>
                  {m.needed && <span className="chip shrink-0 bg-amber-50 text-[11px] text-amber-800">para inscribirte</span>}
                </li>
              ))}
            </ul>
            {rest > 0 && <p className="mt-2 text-xs text-stone-500">y {rest} más en tu perfil.</p>}
          </section>
        )}

        {elsewhere && (
          <section aria-label="Cambio de lugar" className="mt-4 rounded-2xl border border-brand-teal-200 bg-brand-teal-50/60 p-4 text-sm">
            <p className="flex items-start gap-2 font-medium text-brand-teal-900">
              <Icon name="globe" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Parece que estás en {countryLabel(elsewhere)}, pero en tu perfil figura {countryLabel(country) || "otro país"}.
              </span>
            </p>
            <p className="mt-1 pl-6 text-stone-600">Si cambiaste de lugar, actualiza tus datos para que tu grupo y tus horarios sean los correctos.</p>
            <div className="mt-3 flex flex-wrap gap-2 pl-6">
              <Link href={`/perfil?pais=${elsewhere}`} onClick={close} className="btn btn-primary btn-sm">
                Actualizar mi ubicación
              </Link>
              <button type="button" onClick={keepCountry} className="btn btn-ghost btn-sm">
                Sigo en {countryLabel(country) || "el mismo lugar"}
              </button>
            </div>
          </section>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {needsAction ? (
            <>
              <button type="button" onClick={close} className="btn btn-ghost">
                Más tarde
              </button>
              {hasMissing && (
                <Link href="/perfil" onClick={close} className="btn btn-primary">
                  Completar mis datos
                  <Icon name="arrow-right" className="h-4 w-4" />
                </Link>
              )}
            </>
          ) : (
            <button type="button" onClick={close} autoFocus className="btn btn-primary w-full sm:w-auto">
              Entrar
              <Icon name="arrow-right" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
