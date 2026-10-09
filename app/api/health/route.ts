import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Para monitores de disponibilidad (UptimeRobot, Better Stack, etc.).
// No devuelve datos: solo confirma que la app y la base de datos responden.
export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("curriculums").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
