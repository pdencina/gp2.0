# Esquema v2

Dos caminos, según el proyecto de Supabase que se use:

| Situación | Qué ejecutar, en este orden |
|---|---|
| Proyecto **nuevo y vacío** | Solo `001_schema.sql` |
| Proyecto **que ya está en la versión 1** (el actual) | `000_preparar_desde_v1.sql` y luego `001_schema.sql` |

## Actualizar el proyecto actual (versión 1 → 2)
**No ejecutar hasta que la aplicación web esté actualizada a la versión 2**: las pantallas actuales dejarían de funcionar.

- **Conserva:** cuentas, perfiles (nombre, rol, teléfono) e historial de roles.
- **Borra:** `groups`, `group_members`, `sessions`, `attendance`, `contacts`, `lessons` y `curriculums` de la versión 1, con sus datos.
- **Antes:** hacer un respaldo (Supabase → Database → Backups) y confirmar que esos datos no se necesitan.
- **Seguros:** `000` solo actúa si se quitan los guiones de la línea `set app.confirmo_borrar_v1`; `001` se niega a correr sobre una versión 1 sin pasar por `000`; ambos son de todo o nada (transacción).

## Después de 011
- `013_sedes_por_lote.sql`: asignar sedes por criterios (solo administrador).
- `014_reencuentro.sql`: recuperar a quienes se alejaron (registro de contactos y consultas por alcance).
- `015_archivo_historico.sql`: archivo de solo agregar con las filas de la plataforma anterior (lo escribe la clave de importación; lo lee el administrador).
- `016_historial_de_roles_rapido.sql`: la política de `role_history` pasa a evaluarse una vez por consulta y solo con sesión (antes una consulta sin sesión agotaba el tiempo).

## Cómo se prueba
`npm test` carga los scripts en un Postgres real en memoria (PGlite):
- `supabase/tests/schema_v2.test.ts`: proyecto limpio. Inscripción, cupos, audiencia y ciclo previo, quién ve qué, pasar lista, ausencias, alertas, lecciones, cierre de ciclo, continuación, escalera de roles y auditoría.
- `supabase/tests/upgrade_from_v1.test.ts`: aplica las 8 migraciones reales de la versión 1, con datos, y luego la actualización. Verifica que se conservan las cuentas, roles, teléfonos e historial, que las guardas funcionan y que el flujo nuevo corre sobre el proyecto actualizado.

El CI de GitHub lo ejecuta en cada push.

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
Las validaciones de inscripción se pueden saltar durante la carga histórica con
`select set_config('app.skip_checks', 'on', true);` dentro de la misma transacción.
