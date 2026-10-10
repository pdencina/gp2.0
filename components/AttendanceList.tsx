"use client";

import { useState } from "react";

type Member = { id: string; name: string };
type Mark = "presente" | "ausente" | "recuperado" | "justificado";

const OPTIONS: { value: Mark; label: string; on: string }[] = [
  { value: "presente", label: "Presente", on: "bg-brand-green text-white border-brand-green" },
  { value: "recuperado", label: "Recuperado", on: "bg-brand-teal text-white border-brand-teal" },
  { value: "justificado", label: "Justificó", on: "bg-amber-500 text-white border-amber-500" },
  { value: "ausente", label: "Ausente", on: "bg-stone-600 text-white border-stone-600" },
];

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
  const allPresent = count("presente") === members.length;

  return (
    <>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium" aria-live="polite">
          {count("presente") + count("recuperado")} de {members.length} asisten
          {count("recuperado") > 0 && <span className="text-stone-500"> ({count("recuperado")} recuperados)</span>}
          {count("justificado") > 0 && <span className="text-stone-500"> · {count("justificado")} justificaron su falta</span>}
        </span>
        <button
          type="button"
          onClick={() =>
            setMarks(Object.fromEntries(members.map((m) => [m.id, allPresent ? "ausente" : "presente"])))
          }
          className="text-brand-teal hover:underline"
        >
          {allPresent ? "Desmarcar a todos" : "Marcar a todos"}
        </button>
      </div>

      <ul className="space-y-2 pb-24">
        {members.map((m) => {
          const mark = marks[m.id];
          return (
            <li
              key={m.id}
              className={`rounded-xl border px-4 py-3 ${
                mark === "ausente" ? "border-stone-200 bg-white" : "border-brand-green bg-green-50"
              }`}
            >
              <div className="mb-2 text-base">{m.name}</div>
              <div role="radiogroup" aria-label={`Asistencia de ${m.name}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={mark === o.value}
                    onClick={() => setMarks((prev) => ({ ...prev, [m.id]: o.value }))}
                    className={`h-11 rounded-lg border text-sm font-medium transition ${
                      mark === o.value ? o.on : "border-stone-300 bg-white text-stone-600"
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
