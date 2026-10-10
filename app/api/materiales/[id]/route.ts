import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Abre un material: un enlace se redirige; un archivo privado se entrega con una dirección temporal.
// Quién puede verlo lo decide la base de datos (can_see_material), no esta ruta.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data } = await supabase.from("resources").select("read_url, file_path, file_name").eq("id", id).maybeSingle();
  if (!data) return new NextResponse("No encontrado", { status: 404 });

  if (data.file_path) {
    const { data: signed, error } = await supabase.storage
      .from("materiales")
      .createSignedUrl(data.file_path, 120, { download: false });
    if (error || !signed) return new NextResponse("No se pudo abrir el archivo", { status: 404 });
    return NextResponse.redirect(signed.signedUrl);
  }
  if (data.read_url && /^https:\/\//.test(data.read_url)) return NextResponse.redirect(data.read_url);
  return new NextResponse("Este material no tiene archivo ni enlace", { status: 404 });
}
