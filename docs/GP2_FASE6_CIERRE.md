# GP 2.0 — Fase 6: pruebas, reconciliación y habilitación por sede

Requiere `006` a `010` y la migración nueva `supabase/v2/011_habilitacion.sql` (aditiva y repetible).

## Cómo aplicarla
1. Respaldo y pegar `011_habilitacion.sql` en el SQL Editor de Supabase.
2. Desplegar. Después de aplicar el SQL, correr desde tu computador:
   ```bash
   node scripts/exposicion-publica.js https://gp2-0.vercel.app
   npm run smoke -- https://gp2-0.vercel.app
   ```
3. Entrar como administrador a **Habilitación**.

## Hallazgo de seguridad (corregido en 011)
Con la llave pública de la aplicación (la que cualquier visitante ve en el navegador) se podían leer sin iniciar sesión las **versiones publicadas de un currículum** (`curriculum_versions`) y, cuando existan, su plan de encuentros. Lo comprobé en producción con `scripts/exposicion-publica.js`: **1 tabla expuesta, con 1 fila (la etiqueta "Plataforma anterior")**; ninguna tabla con datos de personas, grupos, asistencia, direcciones, certificados ni materiales se puede leer sin sesión. `011` limita esas lecturas a quien inició sesión. Tras aplicarla, el mismo script debe decir "Ninguna tabla se puede leer sin iniciar sesión".

## Qué se agregó

| Pieza | Para qué |
|---|---|
| `reconciliacion()` y pantalla **Habilitación → Reconciliación** (administrador) | Compara lo que hay hoy con lo que trajo la importación (12.713 personas, 37.442 inscripciones, 32.958 reuniones, 340.104 registros de asistencia…): hoy debe haber **al menos** eso. Revisa además 11 reglas del modelo nuevo que deben dar cero problemas (inscripciones sin inscripción curricular, personas con dos inscripciones abiertas al mismo programa, direcciones a la vista, asistencia en sesiones no realizadas, unidades de otra versión, etc.), y muestra cifras para mirar |
| `campus_readiness()`, `set_campus_status()` y pantalla **Habilitación → Sedes** | Por sede: grupos activos, sin líder, sin respaldo, sin calendario, sesiones por registrar, personas y pastores; una frase de qué falta; etapa (preparación, piloto, habilitada). Habilitar una sede con pendientes pide confirmación expresa y queda en la auditoría. La etapa es un registro: **no bloquea ninguna función** |
| Filtros de grupos en "Mi progreso" | Por modalidad (presencial / online), sede y día, como pide la especificación |
| `scripts/smoke.js` (`npm run smoke`) | 22 comprobaciones contra el sitio desplegado: páginas públicas, páginas privadas que mandan a iniciar sesión, cabeceras de seguridad, verificación de certificados |
| `scripts/exposicion-publica.js` | Qué puede leer cualquier visitante con la llave pública |
| `supabase/tests/gp2_flujos.test.ts` | Los flujos F1–F8 de la especificación de principio a fin, más las comprobaciones estructurales de seguridad y la reconciliación |
| `supabase/tests/rendimiento.test.ts` | Medición con volumen real (no corre con el resto: `GP2_BENCH=1 npx vitest run supabase/tests/rendimiento.test.ts`) |

## Los flujos de la especificación, probados

| Flujo | Qué se comprueba |
|---|---|
| **F1** Nuevo participante | Se registra una vez, ve las ofertas presencial y online, elige grupo, empieza su progreso; repetir no duplica |
| **F2** Grupo sin su líder titular | El respaldo dirige y registra la sesión; no nace otra temporada ni otro grupo; el respaldo no inscribe ni planifica |
| **F3** Pausa y regreso | Completa 1–5, se cierra la temporada, pausa, vuelve al año siguiente y sigue en la unidad 6; si no hay grupo compatible se pide recuperación una sola vez; **asistir a la semana 20 no acredita las unidades 6–19** |
| **F4** Presencial → online | La misma inscripción, el mismo avance y **ninguna asistencia duplicada**; el grupo anterior queda en el historial |
| **F5** AR Hombres | No pasa al año 2 con la etapa a medias; pasa al cumplirla; pausar y cerrar la temporada no reinicia nada; cada año tiene su plan de 36 independiente; no se certifica antes de los tres años |
| **F6** Currículum corto | 18 unidades en 36 semanas (cada una ocupa dos) sin crear contenido; un libro de 4 partes conserva sus 4 módulos y su orden |
| **F7** Experiencia recreativa | Running tiene 36 fechas y asistencia, sin unidades ni certificado y sin errores de revisión |
| **F8** Nueva versión | Se prepara, revisa, aprueba y publica; quien ya cursaba conserva su versión y sus grupos; los nuevos entran a la vigente; la anterior no se puede editar |

## Estructurales (se vuelven a verificar con cada prueba)
- Todas las tablas del esquema público tienen control de acceso por fila.
- Toda función con permisos elevados fija su `search_path`.
- Sin sesión no se lee nada de ninguna tabla con datos; solo se puede verificar un código de certificado.
- Las migraciones `006` a `011` se pueden volver a ejecutar, en orden, sin cambiar los datos. (Para eso se ajustaron dos puntos de 006 que chocaban con migraciones posteriores.)

## Criterios de aceptación de la especificación

| Criterio | Cómo está cubierto |
|---|---|
| Una temporada anual de 36 posiciones | `seasons.planned_weeks`, calendario de la temporada con feriados (Temporadas); pruebas `gp2_nucleo`, `gp2_calendario` |
| Dos GP, mismo currículum, sin duplicar contenido ni inscripciones | F1, F4 |
| Libro Morado en 36 semanas conservando sus cuatro subdivisiones | F6 (libro de cuatro partes) |
| AR Hombres: 3 años y 36 encuentros por año, avance persistente | F5, `gp2_certificados` |
| Unidades 1–5 en 2027 y regreso en 2028: conserva 5, sigue la 6 | F3 |
| No promete un GP compatible; deriva a recuperación | F3, `/recuperacion` |
| Cambiar de campus, grupo o modalidad no borra avance ni duplica | F4, `gp2_nucleo` |
| Asistencia y acreditación independientes | `gp2_nucleo`, `gp2_calendario`, F3 |
| Asistir a la semana 20 no aprueba 6–19 | F3 |
| Presencial y online filtrables; ubicaciones y enlaces protegidos | Filtros de "Mi progreso"; `gp2_nucleo` (dirección y enlace) |
| Respaldo opera con permisos limitados | `gp2_calendario`, F2 |
| Al cerrar 2027 la formación incompleta sigue en su ruta | F3 |
| Currículums solo se publican tras aprobación; versiones previas se preservan | `gp2_biblioteca`, F8 |
| Recreativos/comunitarios sin 36 lecciones ni certificación | F7 |
| Históricos 3×12 consultables; equivalencias ambiguas no se fabrican | migración 006 (créditos "por revisar"), 010 (validación humana) |
| Cifras separadas: inscritos únicos, activos, asistentes, completados, pausados, reincorporados, certificados | Panel → Formación; `gp2_certificados` |
| Pruebas de reinscripción duplicada, cambio de modalidad, avance multianual, pausas, permisos y migración | 398 pruebas automáticas |

## Rendimiento
Con 8.000 personas, 1.500 grupos, 20.000 inscripciones y 63.000 asistencias (en un Postgres de prueba dentro de Node, que es más lento que Supabase), las consultas principales responden en **3 a 100 milisegundos**; la excepción son las alertas del administrador y del coordinador (**~2 segundos**, 4.100 avisos) y el resumen del panel (0,6 s). No hizo falta agregar índices. Con tus 4.190 grupos solo ~250 están activos, así que las alertas tendrán mucho menos trabajo que en la prueba. Si en producción alguna pantalla tarda, el primer lugar a mirar son las alertas.

## Preguntas de la especificación (sección 16)

| # | Estado |
|---|---|
| 1 Cuáles son las 23 ofertas | **Pendiente tuyo**: la pantalla de clasificar está lista; falta la lista final |
| 2 ¿"Hombres" = AR Hombres de 3 años? | **Respondida: sí.** Falta cuántos ciclos van en cada año |
| 3 Estructura y orden de cada material | **Pendiente tuyo**: se carga con la biblioteca y el plan de 36 |
| 4 Evidencia para completar una unidad | Por defecto asistencia + validación del líder; otros métodos existen en el modelo |
| 5 Cómo se ofrecen recuperaciones | Hoy: otro grupo compatible o plan de recuperación con responsable y seguimiento. Sesiones con líder y recursos online supervisados se pueden agregar |
| 6 Feriados y pausas | Configurables por temporada y por grupo |
| 7 Quién aprueba y certifica | **Respondida**: revisores pastorales y administrador aprueban; administrador y pastores por sede certifican |
| 8 Menores de edad | **Pendiente tuyo**: hoy se piden los datos del tutor en el perfil; no hay autorización por inscripción ni reglas especiales de visualización |
| 9 Más de un currículum a la vez | Permitido, uno por programa |
| 10 Online internacional | Cada grupo guarda su zona horaria (`groups.timezone`); todavía no se muestra en pantalla |

## Complementos posteriores al cierre

| Pieza | Para qué |
|---|---|
| `012_importar_solo_nuevo.sql` y `npm run migrar:solo-nuevo` | Traer lo que se siga registrando en la plataforma anterior **sin pisar nada** de lo hecho en GP 2.0 (resuelve la advertencia sobre la fecha de corte). Probado: no cambia roles, teléfonos, líderes, direcciones, coordinadores ni asistencia existentes; solo cierra lo que allá terminó y aquí seguía abierto |
| `013_sedes_por_lote.sql` y **Habilitación → Asignar sedes por lote** | Dar sede a grupos y personas por criterio (programa, modalidad, sede del líder, ciudad, sede del grupo) y no uno por uno; nunca cambia una sede ya asignada; una sola anotación en la auditoría por acción |
| Zona horaria de cada grupo | Se edita en el detalle del grupo; en los grupos online quien participa ve la hora en su propia zona |

## Qué queda por delante (no es de código)
1. Aplicar `011` y correr los dos scripts de comprobación.
2. Dejar los datos listos: el reparto de los 13 ciclos de HOMBRES en años, la revisión de créditos heredados, las sedes de grupos y personas, los pastores por sede, la lista final de ofertas y la carga de tus materiales. La guía paso a paso está en [HABILITACION_POR_SEDE.md](HABILITACION_POR_SEDE.md).
3. Probar con personas reales de una sede piloto antes de abrir más.
4. **Elegir la fecha de corte con la plataforma anterior.** Una importación completa final antes del primer piloto; después, solo la importación "solo lo nuevo" (ver la guía de habilitación).

## Límites
- Las pruebas verifican reglas y permisos contra un Postgres real y la compilación, pero **ninguna prueba abre las pantallas en un navegador con una cuenta real**: la revisión visual con usuarios de verdad (una sede piloto) sigue pendiente.
- La subida de archivos a Storage solo está probada en sus reglas de acceso con un Storage simulado.
- No hay copias de seguridad automatizadas ni correo transaccional configurado (ver `docs/PRODUCCION.md`).
