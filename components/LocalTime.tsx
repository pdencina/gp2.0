"use client";

import { useEffect, useState } from "react";
import { inZone, timezoneLabel } from "@/lib/format";

// Para un grupo online: la hora de la reunión en la zona del grupo y, si es otra, en la zona de quien mira.
export function LocalTime({ time, zone }: { time: string | null; zone: string | null }) {
  const [mine, setMine] = useState<string | null>(null);

  useEffect(() => {
    if (!time || !zone) return;
    try {
      const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (here && here !== zone) setMine(`${inZone(time.slice(0, 5), zone, here)} (${here.split("/").pop()?.replace(/_/g, " ")})`);
    } catch {
      setMine(null);
    }
  }, [time, zone]);

  if (!time || !zone) return null;
  return (
    <span className="text-xs text-stone-500">
      Hora de {timezoneLabel(zone)}
      {mine ? ` · en tu zona: ${mine}` : ""}
    </span>
  );
}
