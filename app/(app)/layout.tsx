import { getSession } from "@/lib/session";
import { ROLE_VIEWS } from "@/lib/roles";
import { navFor } from "@/lib/nav";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, fullName, user } = await getSession();
  const userName = fullName || (user.email ?? "").split("@")[0];

  return (
    <div className="min-h-screen md:flex">
      <Sidebar sections={navFor(role)} userName={userName} roleLabel={ROLE_VIEWS[role].label} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
