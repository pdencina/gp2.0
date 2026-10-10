"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui";
import { Icon } from "@/components/Icon";

type Member = { id: string; name: string };
type Mark = "presente" | "ausente" | "recuperado" | "justificado";

const OPTIONS: { value: Mark; label: string; on: string }[] = [
  { value: "presente", label: "Presente", on: "border-brand-green bg-brand-green text-white shadow-sm" },
  { value: "recuperado", label: "Recuperado", on: "border-brand-teal bg-brand-teal text-white shadow-sm" },
  { value: "justificado", label: "Justificó", on: "border-amber-500 bg-amber-500 text-white shadow-sm" },
  { value: "ausente", label: "Ausente", on: "border-stone-600 bg-stone-600 text-white shadow-sm" },
];

const ROW: Record<Mark, string> = {
  presente: "border-brand-green/40 bg-brand-green-50",
  recuperado: "border-brand-teal/40 bg-brand-teal-50",
  justificado: "border-amber-300 bg-amber-50",
  ausente: "border-stone-200 bg-white",
};

export function AttendanceList({
  members,
  initial,
}: {
  members: Member[];
  initial: Record<string, Mark>;
}) {
  const [marks, setMarks] = useState<Record<string, Mark>>(
    Object.fromEntries(members.map((m) => [m.id, initial[m.id] ?? "ausente"]))
  );

  const count = (v: Mark) => members.filter((m) => marks[m.id] === v).length;
  const attending = count("presente") + count("recuperado");
  const allPresent = count("presente") === members.length;
  const pct = members.length ? Math.round((attending / members.length) * 100) : 0;

  return (
    <>
      <div className="card sticky top-14 z-10 mb-4 p-3.5 md:top-2">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold tabular" aria-live="polite">
            {attending} de {members.length} asisten
            {count("recuperado") > 0 && <span className="font-normal text-stone-500"> · {count("recuperado")} recuperados</span>}
            {count("justificado") > 0 && <span className="font-normal text-stone-500"> · {count("justificado")} justificaron</span>}
          </span>
          <button
            type="button"
            onClick={() => setMarks(Object.fromEntries(members.map((m) => [m.id, allPresent ? "ausente" : "presente"])))}
            className="link text-sm"
          >
            {allPresent ? "Desmarcar a todos" : "Marcar a todos"}
          </button>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Asistencia de hoy">
          <span style={{ width: `${pct}%`, transition: "width 0.35s cubic-bezier(0.22, 1, 0.36, 1)", animation: "none" }} />
        </div>
      </div>

      <ul className="stagger space-y-2.5 pb-28">
        {members.map((m) => {
          const mark = marks[m.id];
          return (
            <li key={m.id} className={`rounded-2xl border px-4 py-3 transition-colors duration-200 ${ROW[mark]}`}>
              <div className="mb-2.5 flex items-center gap-3">
                <Avatar name={m.name} />
                <span className="flex-1 text-base font-medium">{m.name}</span>
                {mark !== "ausente" && (
                  <span className="pop-in text-brand-green" aria-hidden="true" key={mark}>
                    <Icon name="check-circle" className="h-5 w-5" />
                  </span>
                )}
              </div>
              <div role="radiogroup" aria-label={`Asistencia de ${m.name}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={mark === o.value}
                    onClick={() => setMarks((prev) => ({ ...prev, [m.id]: o.value }))}
                    className={`h-11 rounded-xl border text-sm font-semibold transition duration-150 active:scale-95 ${
                      mark === o.value ? o.on : "border-stone-300 bg-white text-stone-600 hover:border-stone-400 hover:bg-stone-50"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {mark === "presente" && <input type="hidden" name="present" value={m.id} />}
              {mark === "recuperado" && <input type="hidden" name="recovered" value={m.id} />}
              {mark === "justificado" && <input type="hidden" name="justified" value={m.id} />}
            </li>
          );
        })}
      </ul>
    </>
  );
}
