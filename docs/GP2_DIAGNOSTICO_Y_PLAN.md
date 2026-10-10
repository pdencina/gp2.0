# GP 2.0 — Fase 0: diagnóstico, mapa de impacto y plan

Responde a la sección 17 de `GP2_0_Especificacion_para_Claude.md`. Está hecho sobre el código y los datos reales (no sobre supuestos).

## 1. Diagnóstico de la plataforma actual

**Stack confirmado:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS) · Vercel. 141 pruebas automáticas (reglas de acceso y flujos contra un Postgres real), CI en GitHub.

**Pantallas (rutas):** `inicio`, `panel`, `inscripcion`, `grupos`, `grupos/[id]`, `grupos/[id]/lista`, `alertas`, `equipo`, `curriculums`, `curriculums/[id]`, `ciclos/[id]`, `lecciones/[id]` (+ editar), `temporadas`, `perfil`, `login`, `privacidad`.

**Modelo de datos hoy:** `profiles`, `role_history`, `curriculums`, `curriculum_coordinators`, `seasons`, `cycles`, `lessons`, `resources`, `groups`, `enrollments`, `meetings`, `attendance`, `contacts`, `audit_log` (+ vistas `group_overview`, `roster`, `meeting_summary`, `enrollment_progress`).

**Permisos:** cinco roles (`admin`, `coordinador`, `monitor`, `lider`, `alumno`) aplicados **en la base de datos** (RLS), no solo en pantalla. Coordinadores por currículum (varios). No existe rol de pastor/responsable curricular, ni backup, ni alcance por sede.

**Datos reales cargados:** 12.713 personas, 37 currículums, 4.190 grupos, 37.442 inscripciones, 32.958 reuniones, 340.104 registros de asistencia (2020–2026).

### Cómo piensa hoy el sistema (y por qué choca con GP 2.0)

| Hoy | GP 2.0 |
|---|---|
| Una **inscripción por grupo y temporada** (`enrollments`). Al terminar el ciclo se crea un grupo nuevo y se **preinscribe** a quien aprobó. | **Inscripción curricular única y continua**; el grupo es solo una membresía que puede cambiar. |
| `cycle_id` es obligatorio en el grupo: **el grupo pertenece a un ciclo**. | El grupo imparte una versión del currículum, un año formativo y una modalidad. |
| "Aprobado" = tuvo 3 ausencias o menos (`close_group`). **La asistencia decide la aprobación.** | Asistencia y acreditación son datos distintos; nada se acredita por transcurso ni por asistir. |
| Temporadas libres (en lo importado hay 3 por año de ~12 semanas; 2026 ya es una de 33). | Una temporada anual de 36 posiciones, con calendario real. |
| `lessons` existe, pero **sin datos** (la plataforma antigua no tenía lecciones, solo enlaces). Sin versiones ni plan semanal. | Currículum versionado, material original, plan de 36 encuentros aprobado. |
| El progreso del alumno es "su inscripción actual" y "ciclos aprobados". | Progreso por unidades acreditadas, persistente entre años, grupos y modalidades. |

### Hallazgos sobre los datos antiguos
- **37 currículums antiguos vs 23 ofertas del catálogo.** Hay variantes que deberían ser una oferta: *Biblia Creativa* (8–13, 14–17, 18+), *Freedom Single* (general, hombres, mujer), *Jóvenes* (17–23, 24–29, 17–29), *Fútbol* (y Punta Arenas), *Senderismo* (hombres, mujeres), *Más Allá del Éxito* (church, secular), *Tweens y Teens*. Y 2 internos: *COORD GLOBAL* y *Palabras del Genio*.
- **"Ciclo" en lo antiguo = partes de un libro**, no períodos del año: LIBRO MORADO tiene 4 (coincide con la especificación), CREER 7, LA HISTORIA 8, JÓVENES 17 a 29 tiene 20, y **HOMBRES tiene 13**. Esto confirma que "ciclo" ya funciona como módulo/nivel y debe renombrarse así.
- **Sedes: la plataforma antigua tenía 9** (Virtual, Puente Alto, Santiago centro, Punta Arenas, Montevideo, Maracaibo, Miami, Katy, Concepción), pero **no se importaron** y solo 1.592 de 37.493 inscripciones tenían sede. Hay que crearlas.
- **Domicilios:** 200 horarios presenciales traen dirección (probablemente casas particulares).

### Riesgos detectados hoy (independientes de GP 2.0)
1. **Privacidad de domicilios.** Los grupos abiertos a inscripción son visibles para cualquier usuario con sesión, y la vista `group_overview` incluye la dirección. La especificación exige direcciones y enlaces visibles solo a inscritos y responsables. **Se corrige en la Fase 1.**
2. Los alumnos están marcados como "pausados" o "aprobados" por reglas de asistencia que la nueva visión no acepta como acreditación. Se conservan como **créditos históricos por revisar**, no como unidades acreditadas.

## 2. Mapa de impacto

| Concepto de la especificación | Estado | Qué se hace |
|---|---|---|
| Temporada anual de 36 posiciones | existe `seasons` | **modificar** (`year`, `planned_weeks`, tipo) + **crear** `season_weeks` |
| Catálogo de 23 ofertas, categoría/tipo/audiencia | existe `curriculums` (37) | **modificar** (categoría, tipo, etapa de vida, duración, certificable) + pantalla de recategorización |
| Currículum versionado y flujo editorial | no existe | **crear** `curriculum_versions` (cargado → publicado) |
| Módulo / nivel / etapa | existe como `cycles` | **reutilizar** `cycles` y renombrar en pantalla ("módulos") |
| Unidad curricular | existe `lessons` (vacía) | **reutilizar** como unidades; agregar objetivo y requisitos |
| Plan pedagógico de 36 encuentros | no existe | **crear** `annual_learning_plans`, `learning_plan_slots` |
| Grupo (modalidad, backup, sede, campus) | existe `groups` | **modificar**: `cycle_id` opcional, versión, año formativo, sede, backup |
| Enlace/dirección protegidos | `groups.address` expuesta | **crear** `group_private` con acceso solo a inscritos y responsables |
| Inscripción curricular continua | no existe | **crear** `curriculum_enrollments` |
| Membresía de grupo con historial | existe `enrollments` | **reutilizar** como membresía; enlazar a la inscripción curricular |
| Asistencia | existe `attendance` | **modificar** (agregar "justificado", quién registró) |
| Acreditación por unidad | no existe | **crear** `unit_completions` y `unit_prerequisites` |
| Créditos del sistema antiguo | no existe | **crear** `stage_credits` (marcados por revisar) |
| Recuperación | no existe | **crear** `catchup_plans` |
| Sesión planificada vs. realizada | `meetings` solo realizadas | **modificar** (posición del plan, estado, quién facilitó) |
| Sedes | no existen | **crear** `campuses` con las 9 de la plataforma antigua |
| Biblioteca de materiales | no existe | **crear** (Fase 4) |
| Certificados | no existe | **crear** (Fase 5) |
| Roles pastor/backup | no existen | pastor: **tabla de revisores**; backup: **columna del grupo** (sin cambiar los roles actuales) |
| Trazabilidad | existe `audit_log` | **reutilizar** + `migration_mapping` |

## 3. Plan por fases

| Fase | Contenido | Archivos principales | ¿Toca producción? |
|---|---|---|---|
| **0** | Este diagnóstico | `docs/GP2_DIAGNOSTICO_Y_PLAN.md` | No |
| **1** | Núcleo de dominio **aditivo** y migración segura | `supabase/v2/006_gp2_nucleo.sql`, `supabase/tests/gp2_nucleo.test.ts` | Solo si pegas el SQL (no borra nada) |
| **2** | Catálogo, inscripción única y cambio de grupo; "Mi progreso" | `app/(app)/inscripcion`, `app/(app)/catalogo`, `app/(app)/mi-progreso` | Con despliegue |
| **3** | Calendario de 36 semanas por grupo, sesiones, líder/backup, recuperación | `app/(app)/grupos/[id]/calendario`, `lista` | Con despliegue |
| **4** | Biblioteca y editor curricular con flujo de aprobación | `material_assets`, `app/(app)/curriculums/[id]/versiones` | Con despliegue |
| **5** | Progreso multianual, AR Hombres a 3 años, certificados | `certificates`, reglas configurables | Con despliegue |
| **6** | Reconciliación, pruebas de extremo a extremo, habilitación por campus | `docs/`, pruebas E2E | Controlado |

**Orden de migración (Fase 1):** versión 1 por currículum → módulos con versión → grupos con currículum/versión → inscripciones curriculares → membresías enlazadas → créditos históricos. Todo con `insert … where not exists`, así se puede repetir sin duplicar.

## 4. Modelo y reglas aplicadas al código real

**Reglas de negocio que quedan garantizadas en la base de datos (no solo en pantalla):**
1. Una inscripción **activa o pausada** por persona y currículum.
2. Cambiar de grupo, líder, sede o modalidad **no crea otra inscripción curricular** ni toca el avance.
3. La acreditación de una unidad solo la registra quien corresponde (administrador, coordinador del currículum, líder, monitor o backup del grupo de esa persona), con método y evidencia, y **respetando los requisitos** declarados entre unidades.
4. Asistir a una sesión **no acredita** unidades. Asistir a la semana 20 no deja a nadie con las 6 a 19 aprobadas.
5. El "siguiente requisito" es **la primera unidad no acreditada**, no "la última + 1": las faltas intermitentes no se rellenan.
6. Pausar conserva todo; reanudar no reinicia.
7. Dirección y enlace online: solo inscritos y responsables del grupo.
8. Cerrar una temporada no cambia el estado de aprendizaje de nadie.

**Supuestos reversibles (documentados, ninguno inventa contenido):**
- "Pastor/responsable curricular" = administrador, más una lista de **revisores** por currículum que pueden aprobar versiones.
- Las 23 ofertas parten como el subconjunto visible de los 37 currículums; las variantes se agrupan en la Fase 2 con una tabla de equivalencias que **tú apruebas**.
- Una persona puede cursar **varios** currículums a la vez (una inscripción por currículum).
- Los años de AR Hombres se modelan como `duration_years = 3` y módulos con `formative_year`; los 13 ciclos antiguos de HOMBRES **no se convierten en años sin tu confirmación**.
- Lo importado como "aprobó el ciclo N" queda como **crédito histórico por revisar**; no se convierte en unidades acreditadas porque no existe equivalencia demostrable (las lecciones antiguas no existían).
- "Pausado" en lo importado = quien terminó de asistir y no tiene grupo activo; no significa que haya completado la ruta.

**Puntos de riesgo y cómo se controlan:**
- Cambia la base de las funciones de acceso (`can_manage_group`, `managed_group_ids`, validación de inscripción) → se cubren con las 141 pruebas existentes más las nuevas.
- Backfill de unas 25.000 inscripciones curriculares → es un solo bloque idempotente, medido sobre tus datos reales.
- El importador y el panel dependen de `cycle_id` → se mantiene compatible: un disparador completa currículum y versión del grupo desde su ciclo.

## 5. Preguntas bloqueantes

Ninguna impide empezar la Fase 1, que es aditiva y reversible. Estas cinco **sí cambian cómo se ve y se usa** lo que viene; las tomé con los supuestos de arriba y las confirmamos antes de la Fase 2:

1. **¿"HOMBRES" (13 ciclos en la plataforma antigua) es AR Hombres de tres años?** Define cómo se agrupan esos módulos por año.
2. **¿Quién aprueba y publica un currículum, y quién emite certificados?** (¿solo administradores o también pastores designados por sede?)
3. **¿Qué cuenta como evidencia para acreditar una unidad?** Propongo por defecto: asistencia + validación del líder, configurable por currículum.
4. **¿Cómo se agrupan los 37 currículums antiguos en las 23 ofertas?** Te dejo una propuesta para corregir.
5. **¿Qué protocolo aplica a menores (Tweens/Teens)?** Hoy se piden datos del tutor solo en el perfil; no hay autorización por inscripción.
