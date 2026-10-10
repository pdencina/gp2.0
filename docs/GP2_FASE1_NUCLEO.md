# GP 2.0 — Fase 1: núcleo de dominio y migración segura

Es **aditiva**: no borra tablas, columnas ni filas. La aplicación actual sigue funcionando sin cambios mientras se aplica.

## Qué se entrega

| Archivo | Para qué |
|---|---|
| `supabase/v2/006_gp2_nucleo.sql` | Migración (idempotente, en una transacción) |
| `supabase/tests/gp2_nucleo.test.ts` | 55 pruebas contra un Postgres real (incluye la migración sobre datos anteriores) |
| `migracion/tests/apply.test.ts` | Ahora carga también 005 y 006: el importador sigue funcionando sobre el modelo nuevo |
| `docs/GP2_DIAGNOSTICO_Y_PLAN.md` | Fase 0 |

## Cómo aplicarla (tú, en Supabase → SQL Editor)

1. Si aún no lo hiciste, pega y ejecuta `supabase/v2/005_panel.sql`.
2. Pega y ejecuta `supabase/v2/006_gp2_nucleo.sql` completo.
3. Puedes ejecutarla más de una vez: no duplica nada.

Antes, haz un respaldo (Supabase → Database → Backups). Nada de esto se aplica a producción sin que tú lo pegues.

## Qué cambia en el modelo

- **Inscripción curricular continua** (`curriculum_enrollments`): una por persona y programa mientras esté activa o pausada (índice único en la base). Las inscripciones a grupos (`enrollments`) pasan a ser *membresías* enlazadas a ella.
- **Cambiar de grupo/modalidad** (`change_group`): cierra la membresía, abre otra, **no toca la inscripción curricular ni el avance**.
- **Pausar / reanudar**: conserva todo; reanudar no reinicia.
- **Acreditación por unidad** (`unit_completions`, `record_unit_completion`): separada de la asistencia, con método, evidencia, quién validó y respeto de requisitos (`unit_prerequisites`). Pasar lista **no acredita**.
- **Progreso** (`curriculum_progress`): la siguiente unidad es la *primera no acreditada*; los huecos no se rellenan.
- **Recuperación** (`catchup_plans`, `request_catchup`, `compatible_groups`): no promete que exista un grupo que calce.
- **Versiones y flujo editorial** (`curriculum_versions`, `advance_curriculum_version`, `curriculum_reviewers`): cargado → en adaptación → en revisión pastoral → aprobado → publicado → archivado. Solo un revisor o el administrador aprueba y publica; el estado no se puede cambiar a mano.
- **Plan de 36 encuentros** (`annual_learning_plans`, `learning_plan_slots`, `plan_coverage`): detecta semanas vacías, semanas sin contenido y unidades sin cobertura.
- **Calendario anual** (`seasons.planned_weeks`, `season_weeks`, `generate_season_weeks`): 36 posiciones saltando semanas de pausa.
- **Sedes** (`campuses`): las 9 de la plataforma anterior.
- **Backup del grupo** (`groups.backup_leader_id`): puede pasar lista y ve a los inscritos; **no** inscribe ni acredita. Queda registrado como facilitador de la sesión.
- **Dirección y enlace protegidos** (`group_private`): solo inscritos y responsables del grupo. `group_overview.address` ya no la muestra a cualquier usuario con sesión. Lo que se escriba en `groups.address` se redirige solo a la tabla protegida.
- **Grupos sin ciclo**: `groups.cycle_id` es opcional; un disparador completa currículum, versión y año formativo desde el ciclo cuando existe.
- **Créditos históricos** (`stage_credits`): lo que el sistema anterior daba por "aprobado" queda `por_revisar`. **No** se convierte en unidades acreditadas.
- **Trazabilidad**: auditoría de acreditaciones, cambios de estado de versiones e inscripciones, y recuperaciones; `migration_mapping` para la equivalencia 37 → 23 ofertas.

## Qué hace la migración con tus datos

Orden, todo con `where not exists` / `on conflict do nothing`:

1. Versión 1 "Plataforma anterior" por programa (vigente).
2. Versión de cada ciclo y datos del grupo (programa, versión, año formativo).
3. Direcciones → `group_private`; `groups.address` queda vacío.
4. Una inscripción curricular por persona y programa: **activa** si tiene un grupo vigente, **pausada** si no (marcada `imported`).
5. Enlace de todas las membresías.
6. Créditos históricos por revisar.
7. Temporadas de menos de 200 días quedan como `legado`; el resto como `anual`.

No pasa por la auditoría de grupos (se desactiva solo durante la carga masiva) para no escribir miles de filas.

## Pruebas

```bash
npm test               # 196 pruebas
npm run typecheck
```

Cubren los criterios de aceptación de la especificación: inscripción única; cambio de grupo/modalidad sin duplicar ni perder avance; asistencia ≠ acreditación; la sesión 20 no acredita la 6–19; volver de una pausa; sin promesa de grupo compatible; permisos de líder/backup/coordinador; dirección y enlace protegidos; cerrar temporada no altera el aprendizaje; flujo editorial; plan de 36; y la migración sobre datos anteriores, repetida.

## Riesgos y decisiones reversibles

- **Una persona puede cursar varios programas a la vez** (una inscripción por programa). Es un supuesto; si no corresponde, es una restricción más.
- **"Pausado" importado ≠ terminó la ruta.** Se revisa en la Fase 2 con los créditos históricos.
- **Clasificación de programas**: solo Fútbol y Senderismo pasaron a *recreación*; todo lo demás queda como *formación* hasta que lo recategorices en la Fase 2. No se adivinó contenido.
- **`justificado`** ya existe como valor de asistencia, pero las cuentas de ausencias (`enrollment_progress`, alertas) todavía lo tratan como falta. Cambiar esa regla es una decisión tuya (¿una falta justificada cuenta?) y va en la Fase 3.
- El panel de continuidad y "aprobado = asistencia" siguen siendo del modelo antiguo hasta la Fase 2/5.
- Aplicar 006 sobre ~25.000 inscripciones es una sola carga; en el entorno de pruebas se ejecuta en milisegundos con datos de ejemplo. Mídelo con tu respaldo si te preocupa.

## Siguiente: Fase 2 (catálogo, inscripción única, "Mi progreso")

Pantallas: catálogo con las ofertas (agrupando variantes con tabla de equivalencias que tú apruebas), inscripción al programa sin elegir grupo, elegir/cambiar grupo y modalidad, y "Mi progreso". Antes de empezar, conviene responder las cinco preguntas de `GP2_DIAGNOSTICO_Y_PLAN.md`, sobre todo el mapa 37 → 23.
