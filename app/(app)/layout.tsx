import { getSession } from "@/lib/session";
import { ROLE_VIEWS } from "@/lib/roles";
import { navFor } from "@/lib/nav";
import { firstName, profileCheck, type ProfileData } from "@/lib/profile-check";
import { Sidebar } from "@/components/Sidebar";
import { WelcomeDialog, type Comeback } from "@/components/WelcomeDialog";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role, fullName, user } = await getSession();
  // ¿Es pastor designado en alguna sede? (habilita Certificados)
  const { data: pastorRows } = await supabase.from("campus_pastors").select("campus_id").eq("person_id", user.id).limit(1);
  const isPastor = (pastorRows ?? []).length > 0;
  const userName = fullName || (user.email ?? "").split("@")[0];

  // Datos personales: la ventana de bienvenida avisa lo que falta
  const [{ data: prof }, { count: campusCount }, comebackR] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, gender, country, city, birth_date, guardian_name, guardian_email, guardian_phone, terms_accepted_at, campus_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("campuses").select("id", { count: "exact", head: true }).eq("active", true),
    // Caminos que la persona dejó hace tiempo (si falta instalar 014, simplemente no hay mensaje)
    supabase.rpc("my_comeback"),
  ]);
  const comeback = comebackR.error ? [] : ((comebackR.data ?? []) as Comeback[]);
  const check = prof ? profileCheck(prof as ProfileData, { campusesExist: (campusCount ?? 0) > 0 }) : null;

  return (
    <div className="min-h-screen md:flex">
      <Sidebar sections={navFor(role, { pastor: isPastor })} userName={userName} roleLabel={ROLE_VIEWS[role].label} />
      <div className="min-w-0 flex-1">{children}</div>
      {check && (
        <WelcomeDialog
          userId={user.id}
          signInKey={user.last_sign_in_at ?? user.id}
          firstName={firstName(fullName)}
          country={(prof as ProfileData).country}
          missing={check.missing}
          percent={check.percent}
          blocking={check.blocking}
          comeback={comeback}
        />
      )}
    </div>
  );
}
