import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import type { Alert } from "@/lib/alerts";
import type { Cobertura, ContinuidadRow, Formacion, CurriculumRow, DistribucionRow, LiderRow, Resumen, Semana, TemporadaRow } from "@/lib/panel";
import { PanelView } from "@/components/PanelView";

export const dynamic = "force-dynamic";

export default async function PanelPage() {
  const { supabase, role } = await getSession();
  if (!["admin", "coordinador", "monitor"].includes(role)) redirect("/inicio");

  const [resumenR, semanalR, currR, tempR, contR, lidR, distR, alertR, cobR, forR] = await Promise.all([
    supabase.rpc("panel_resumen"),
    supabase.rpc("panel_semanal", { semanas: 12 }),
    supabase.rpc("panel_curriculums"),
    supabase.rpc("panel_temporadas"),
    supabase.rpc("panel_continuidad"),
    supabase.rpc("panel_lideres"),
    supabase.rpc("panel_distribucion"),
    supabase.rpc("my_alerts"),
    supabase.rpc("panel_cobertura"),
    supabase.rpc("panel_formacion"),
  ]);

  const missing = [resumenR, semanalR, currR].some((r) => r.error && /Could not find|404|PGRST202/i.test(r.error.message + (r.error.code ?? "")));
  if (missing) {
    return (
      <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
        <h1 className="page-title">Panel</h1>
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          Falta instalar las consultas del panel en la base de datos: ejecuta <code>supabase/v2/005_panel.sql</code> en el SQL Editor de Supabase.
        </p>
      </div>
    );
  }

  return (
    <PanelView
      role={role}
      resumen={((resumenR.data ?? [])[0] ?? null) as Resumen | null}
      semanal={(semanalR.data ?? []) as Semana[]}
      curriculums={(currR.data ?? []) as CurriculumRow[]}
      temporadas={(tempR.data ?? []) as TemporadaRow[]}
      continuidad={(contR.data ?? []) as ContinuidadRow[]}
      lideres={(lidR.data ?? []) as LiderRow[]}
      dist={(distR.data ?? []) as DistribucionRow[]}
      alerts={(alertR.data ?? []) as Alert[]}
      cobertura={cobR.error ? null : (((cobR.data ?? [])[0] ?? null) as Cobertura | null)}
      formacion={forR.error ? null : (((forR.data ?? [])[0] ?? null) as Formacion | null)}
      today={new Date()}
    />
  );
}
