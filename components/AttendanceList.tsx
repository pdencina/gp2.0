"use client";

import { useState } from "react";

type Member = { id: string; name: string };

export function AttendanceList({ members, initial }: { members: Member[]; initial: string[] }) {
  const [present, setPresent] = useState<Set<string>>(new Set(initial));

  function toggle(id: string) {
    setPresent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allMarked = present.size === members.length;

  return (
    <>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium" aria-live="polite">
          {present.size} de {members.length} presentes
        </span>
        <button
          type="button"
          onClick={() => setPresent(allMarked ? new Set() : new Set(members.map((m) => m.id)))}
          className="text-brand-teal hover:underline"
        >
          {allMarked ? "Desmarcar a todos" : "Marcar a todos"}
        </button>
      </div>

      <ul className="space-y-2 pb-24">
        {members.map((m) => {
          const on = present.has(m.id);
          return (
            <li key={m.id}>
              <label
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal ${
                  on ? "border-brand-green bg-green-50" : "border-stone-200 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  name="present"
                  value={m.id}
                  checked={on}
                  onChange={() => toggle(m.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm ${
                    on ? "border-brand-green bg-brand-green text-white" : "border-stone-300 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="text-base">{m.name}</span>
                <span className={`ml-auto text-xs ${on ? "text-green-800" : "text-stone-400"}`}>
                  {on ? "Presente" : "Ausente"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}
