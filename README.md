# Grupos Pequeños ARM Global · GP 2.0

Plataforma de grupos pequeños: una inscripción continua a cada programa, una temporada anual de 36 encuentros, avance individual por unidades, GP presenciales y online, versiones de currículum con aprobación pastoral, certificados y habilitación sede por sede.

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Supabase (Auth, Postgres con RLS, Storage) · Vercel.

## Roles

`admin` > `coordinador` (un programa) > `monitor` (grupos asignados) > `lider` (con respaldo opcional) > `alumno`. Más: revisores pastorales por programa y pastores designados por sede (certificados).

Cada persona ve solo lo que le corresponde: las reglas viven en la base de datos (políticas RLS), no solo en las pantallas.

## Documentación

| Para qué | Documento |
|---|---|
| Usar la plataforma, por rol | [docs/GUIA_DE_USO.md](docs/GUIA_DE_USO.md) |
| Poner en marcha una sede | [docs/HABILITACION_POR_SEDE.md](docs/HABILITACION_POR_SEDE.md) |
| Estado y criterios de aceptación | [docs/GP2_FASE6_CIERRE.md](docs/GP2_FASE6_CIERRE.md) |
| Diagnóstico y plan de GP 2.0 | [docs/GP2_DIAGNOSTICO_Y_PLAN.md](docs/GP2_DIAGNOSTICO_Y_PLAN.md) |
| Cada fase | [1 núcleo](docs/GP2_FASE1_NUCLEO.md) · [2 catálogo](docs/GP2_FASE2_CATALOGO.md) · [3 calendario](docs/GP2_FASE3_CALENDARIO.md) · [4 biblioteca](docs/GP2_FASE4_BIBLIOTECA.md) · [5 certificados](docs/GP2_FASE5_CERTIFICADOS.md) |
| Cómo se ve y se mueve (colores, componentes, animaciones) | [docs/SISTEMA_DE_DISENO.md](docs/SISTEMA_DE_DISENO.md) |
| Producción (seguridad, respaldos, correo) | [docs/PRODUCCION.md](docs/PRODUCCION.md) |
| Migración desde la plataforma anterior | [docs/MIGRACION.md](docs/MIGRACION.md) |

## Base de datos

Las migraciones están en `supabase/v2/` y se ejecutan **en orden, una sola vez**, en el SQL Editor de Supabase (con un respaldo antes):

`001_schema` → `004_rendimiento` → `005_panel` → `006_gp2_nucleo` → `007_catalogo` → `008_calendario` → `009_biblioteca` → `010_certificados` → `011_habilitacion` → `013_sedes_por_lote`

(`002`, `003` y `012` son de la importación (`012` es la importación "solo lo nuevo") y se quitan al terminar con `003`; `000` solo se usa al actualizar desde la versión 1.) Todas las posteriores a 001 solo agregan: no borran datos.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # URL y anon key de tu proyecto Supabase
npm run dev
```

## Pruebas

```bash
npm test             # reglas y permisos contra un Postgres real en memoria, flujos de la especificación y utilidades
npm run typecheck
npm run build
npm run smoke -- https://tu-sitio.vercel.app          # prueba de humo contra el sitio desplegado
node scripts/exposicion-publica.js https://tu-sitio.vercel.app   # qué lee un visitante sin sesión
GP2_BENCH=1 npx vitest run supabase/tests/rendimiento.test.ts   # medición con volumen real
```

## Despliegue

Cada push a `main` se despliega en Vercel. Variables: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. En Supabase → Authentication → URL Configuration, agrega `/auth/callback` de cada dirección.
