import { getSession } from "@/lib/session";
import { ROLE_VIEWS } from "@/lib/roles";
import { navFor } from "@/lib/nav";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role, fullName, user } = await getSession();
  // ¿Es pastor designado en alguna sede? (habilita Certificados)
  const { data: pastorRows } = await supabase.from("campus_pastors").select("campus_id").eq("person_id", user.id).limit(1);
  const isPastor = (pastorRows ?? []).length > 0;
  const userName = fullName || (user.email ?? "").split("@")[0];

  return (
    <div className="min-h-screen md:flex">
      <Sidebar sections={navFor(role, { pastor: isPastor })} userName={userName} roleLabel={ROLE_VIEWS[role].label} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
