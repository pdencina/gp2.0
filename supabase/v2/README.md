# Esquema v2

`001_schema.sql` es el esquema completo de Grupos Pequeños 2.0, pensado para un **proyecto de Supabase nuevo y vacío**.
No se debe ejecutar sobre el proyecto actual (el de la versión 1): reemplaza las tablas de grupos, integrantes y sesiones.

## Cómo se prueba
`npm test` carga este archivo en un Postgres real en memoria (PGlite) y recorre los flujos con distintos roles:
inscripción, cupos, audiencia y ciclo previo, quién ve qué, pasar lista, ausencias, alertas, lecciones, cierre de ciclo,
continuación, escalera de roles y auditoría (`supabase/tests/schema_v2.test.ts`). El CI de GitHub lo ejecuta en cada push.

## Supuestos tomados mientras se confirman las decisiones abiertas
| Decisión | Valor usado | Dónde cambiarlo |
|---|---|---|
| Nombre de "reprobado" | `no_completo` | tipo `enrollment_status` |
| Cupo por grupo | 15 por defecto, ajustable por grupo (`groups.capacity`) y por currículum (`default_capacity`) | tablas `groups`, `curriculums` |
| Una persona en varios currículums a la vez | Permitido; solo una inscripción activa por currículum y temporada | índice `enrollments_one_active` |
| Inscripción al ciclo siguiente | La persona la confirma (`preinscrito` → `en_curso`) con `confirm_enrollment` | función `create_continuation` |
| Quién cierra el ciclo | El coordinador del currículum o el administrador, con `close_group` | función `can_close_group` |
| Máximo de ausencias | 3 por currículum (`max_absences`); `recuperado` cuenta como asistencia | tabla `curriculums` |

## Para la migración de datos antiguos
Las funciones de validación de inscripción se pueden saltar durante la carga histórica con
`select set_config('app.skip_checks', 'on', true);` dentro de la misma transacción.
