# Lista de producción — Grupos Pequeños

Lo que ya está hecho en el código está marcado con [x]. Lo que falta configurar en cada panel está con [ ].

## Código (hecho)
- [x] Next.js 15.5.x (corrige las vulnerabilidades críticas de la rama 14) y React 19.
- [x] Cabeceras de seguridad (anti clickjacking, HSTS, nosniff, referrer, permisos).
- [x] RLS activo en todas las tablas; reglas probadas por rol (ver `supabase/migrations`).
- [x] Escalera de roles y cambios de rol con historial (`role_history`).
- [x] Páginas de error y 404 propias; el sitio no se indexa (`robots.txt`).
- [x] Endpoint de salud: `GET /api/health` (200 = app y base de datos responden).
- [x] Pruebas automáticas (`npm test`) y CI en GitHub (tipos, pruebas y build en cada push).

## Supabase (pendiente, en el panel)
- [ ] Ejecutar las migraciones 001 a 008 en orden.
- [ ] **Authentication → SMTP Settings:** configurar un SMTP propio (Resend, Brevo o el correo de ARM). El correo por defecto de Supabase tiene un límite muy bajo por hora.
- [ ] **Authentication → URL Configuration:** Site URL = dominio final; Redirect URLs = `https://TU-DOMINIO/auth/callback`.
- [ ] **Authentication → Sign In / Providers → Email:** "Confirm email" activado; largo mínimo de contraseña 8; desactivar los proveedores que no se usan (Google).
- [ ] **Authentication → Rate Limits:** revisar los límites de registro e inicio de sesión.
- [ ] **Authentication → Email Templates:** traducir al español y poner el nombre "Grupos Pequeños".
- [ ] Protección contra contraseñas filtradas (plan Pro) y MFA para administradores, si el plan lo permite.
- [ ] **Backups:** plan Pro incluye copias diarias; para más seguridad activar Point-in-Time Recovery. En el plan gratuito no hay copias: programar un `pg_dump` periódico.
- [ ] Borrar los datos de ejemplo antes de lanzar: `supabase/seed_demo_cleanup.sql`.
- [ ] No usar nunca la clave `service_role` en el código del sitio.

## Vercel (pendiente, en el panel)
- [ ] Variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Production.
- [ ] Dominio propio con HTTPS.
- [ ] Settings → Deployment Protection: proteger los despliegues de vista previa (Preview).
- [ ] Activar Vercel Firewall / Attack Challenge Mode si hay tráfico sospechoso.

## GitHub (pendiente)
- [ ] Activar 2FA en la cuenta.
- [ ] Settings → Branches: proteger `main` (exigir que pase el CI).
- [ ] Settings → Code security: Dependabot alerts y Secret scanning.

## Monitoreo (pendiente)
- [ ] Un monitor de disponibilidad (UptimeRobot, Better Stack) apuntando a `/api/health`, con aviso por correo o WhatsApp.
- [ ] Un servicio de errores (por ejemplo Sentry) conectado en `app/error.tsx`.

## Operación
- **Quitar acceso a alguien:** en Supabase → Authentication → Users, bloquear o eliminar el usuario.
- **Cambiar un rol hacia abajo** (solo el administrador, desde el SQL Editor):
  `update profiles set role = 'alumno' where id = (select id from auth.users where email = 'persona@correo.com');`
  El cambio queda en `role_history`.
- **Sospecha de filtración de claves:** en Supabase → Project Settings → API, regenerar las claves y actualizarlas en Vercel.
- **Privacidad:** reemplazar el texto de `/privacidad` por la política oficial de ARM Global antes de abrir el registro.
