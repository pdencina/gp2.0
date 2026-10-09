# Grupos Pequeños ARM Global

Next.js 14 + TypeScript + Tailwind + Supabase (Auth y Postgres con RLS), desplegable en Vercel.

## Roles

`admin` > `coordinador` (un currículum) > `monitor` (grupos asignados) > `lider` (máx. 15 alumnos) > `alumno`

Cada rol ve solo lo que le corresponde gracias a las políticas RLS de `supabase/migrations/001_schema.sql`.

## Puesta en marcha local

1. `npm install`
2. Copia `.env.example` a `.env.local` y completa la URL y la anon key de tu proyecto Supabase.
3. En el SQL Editor de Supabase ejecuta `supabase/migrations/001_schema.sql`.
4. `npm run dev` y abre http://localhost:3000

Para dar un rol a un usuario (por defecto todos nacen como `alumno`):

```sql
update profiles set role = 'admin' where id = (select id from auth.users where email = 'tu@correo.com');
```

## Supabase: configuración de Auth

- Authentication → URL Configuration: agrega `http://localhost:3000/auth/callback` y la URL de Vercel `/auth/callback`.
- Google: actívalo en Authentication → Providers (opcional).

## Despliegue

Sube a GitHub, importa el repo en Vercel y define `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
