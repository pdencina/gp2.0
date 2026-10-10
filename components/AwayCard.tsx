import Link from "next/link";
import { Icon } from "@/components/Icon";
import { fieldClass } from "@/components/Flash";
import { Avatar } from "@/components/ui";
import {
  KIND_LABEL,
  OUTCOME_LABEL,
  RESULT_LABEL,
  STAGE_LABEL,
  STAGE_STYLE,
  awayLabel,
  contactNumber,
  progressLine,
  whatsappFor,
  type AwayRow,
  type Kind,
  type Outcome,
} from "@/lib/reencuentro";

export type History = { id: string; created_at: string; kind: Kind; outcome: Outcome; note: string | null; follow_up_on: string | null; by_name: string | null };

const dateEs = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

// Una persona que se alejó: quién es, cuánto avanzó, cómo contactarla y el registro de lo conversado.
export function AwayCard({
  r,
  history = [],
  sender,
  here,
  action,
}: {
  r: AwayRow;
  history?: History[];
  sender: string;
  /** Dónde volver después de anotar el contacto (conserva los filtros) */
  here: string;
  action: (fd: FormData) => void | Promise<void>;
}) {
  const { phone, toGuardian } = contactNumber(r);
  const wa = whatsappFor(r, sender);
  return (
    <li className="card card-hover p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={r.person_name || "Sin nombre"} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.person_name || "Sin nombre"}</span>
              <span className={`chip ${STAGE_STYLE[r.stage]}`}>{STAGE_LABEL[r.stage]}</span>
              {r.is_minor && <span className="chip bg-amber-50 text-amber-800">Menor de edad</span>}
            </p>
            <p className="text-sm text-stone-600">
              {r.curriculum}
              {r.formative_year > 1 ? ` · Año ${r.formative_year}` : ""}
              {r.campus ? ` · ${r.campus}` : ""}
            </p>
            <p className="mt-0.5 text-sm text-stone-500">
              <span className="font-medium text-stone-700">{awayLabel(r.months_away)}</span> · {progressLine(r)}
            </p>
            <p className="text-xs text-stone-400">
              {r.last_result ? `${RESULT_LABEL[r.last_result] ?? r.last_result}` : ""}
              {r.last_cycle_no && r.cycles_total ? ` (módulo ${r.last_cycle_no} de ${r.cycles_total})` : ""}
              {r.last_group ? ` · ${r.last_group}` : ""}
              {r.last_leader ? ` · con ${r.last_leader}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-sm bg-brand-green text-white hover:brightness-95">
              <Icon name="phone" className="h-4 w-4" />
              {toGuardian ? "Escribir a su tutor" : "Escribir por WhatsApp"}
            </a>
          ) : (
            <span className="chip bg-stone-100 text-stone-500">{phone ? "Teléfono por revisar" : "Sin teléfono"}</span>
          )}
          <Link href={`/mi-progreso/${r.ce_id}`} className="btn btn-secondary btn-sm">
            <Icon name="route" className="h-4 w-4" />
            Ver su camino
          </Link>
        </div>
      </div>

      {!r.accepts_comms && (
        <p className="mt-2 text-xs text-stone-500">
          <Icon name="info" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          Pidió no recibir recordatorios automáticos. Un mensaje personal sigue siendo válido, con cuidado.
        </p>
      )}

      {r.contacts > 0 && (
        <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-stone-500">
            {r.contacts} {r.contacts === 1 ? "contacto" : "contactos"}
            {r.follow_up_on ? ` · seguimiento el ${dateEs(r.follow_up_on)}` : ""}
          </p>
          <ul className="space-y-1">
            {history.map((h) => (
              <li key={h.id} className="text-stone-600">
                <span className="text-stone-400">{dateEs(h.created_at)}</span> · {KIND_LABEL[h.kind]} · <strong className="font-medium">{OUTCOME_LABEL[h.outcome]}</strong>
                {h.by_name ? ` · ${h.by_name}` : ""}
                {h.note ? <span className="block text-stone-500">“{h.note}”</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.stage === "en_camino" && (
        <p className="mt-3 text-sm text-brand-green-800">
          <Icon name="heart" className="mr-1 inline h-4 w-4 align-[-3px]" />
          Quiere volver: ayúdale a elegir un grupo desde{" "}
          <Link href={`/mi-progreso/${r.ce_id}`} className="link">
            su camino
          </Link>
          .
        </p>
      )}

      {r.stage !== "cerrado" && (
        <details className="mt-3">
          <summary className="btn btn-outline btn-sm cursor-pointer list-none">
            <Icon name="check" className="h-4 w-4" />
            Anotar un contacto
          </summary>
          <form action={action} className="mt-3 grid gap-2 md:grid-cols-[1fr_1.4fr_1fr]">
            <input type="hidden" name="ce" value={r.ce_id} />
            <input type="hidden" name="back" value={here} />
            <select name="kind" aria-label="Cómo lo contactaste" defaultValue="mensaje" className={fieldClass}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
            <select name="outcome" aria-label="Cómo resultó" defaultValue="" required className={fieldClass}>
              <option value="" disabled>¿Cómo resultó?</option>
              {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
                <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>
              ))}
            </select>
            <input type="date" name="follow_up_on" aria-label="Volver a escribirle el" title="Volver a escribirle el (opcional)" className={fieldClass} />
            <textarea name="note" rows={2} maxLength={500} placeholder="Nota: qué conversaron, qué necesita… (opcional)" aria-label="Nota" className={`${fieldClass} h-auto py-2 md:col-span-3`} />
            <div className="md:col-span-3">
              <button className="btn btn-primary">Guardar contacto</button>
            </div>
          </form>
        </details>
      )}
    </li>
  );
}
