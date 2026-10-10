# GP 2.0 — Fase 3: calendario de 36 semanas, sesiones, líder/backup y recuperación

Requiere `006`, `007` y la migración nueva `supabase/v2/008_calendario.sql` (aditiva y repetible).

## Cómo aplicarla
1. Haz un respaldo y pega `008_calendario.sql` en el SQL Editor de Supabase.
2. Entra como administrador a **Temporadas** y, en la temporada anual, abre **Definir el calendario de 36 semanas**: indica la primera semana y los feriados o pausas (`04/05/2026, 29/06/2026`). Se numeran 36 semanas saltando las pausas.
3. En cada grupo: **Calendario → Planificar**. Si la temporada tiene calendario, las 36 sesiones caen en el día de reunión del grupo; si no, se indica la primera fecha y las pausas.

La aplicación sigue funcionando si el despliegue sale antes que el SQL: pasar lista usa los campos nuevos solo cuando se usan, y las pantallas nuevas avisan que falta instalar 008.

## Qué hay

| Pantalla | Quién | Qué hace |
|---|---|---|
| `/grupos/[id]/calendario` | miembros (solo lectura), líder, monitor, coordinador, administrador, backup | Las 36 posiciones con fecha real, estado (planificada, realizada, cancelada, reprogramada), contenido del plan, quién dirigió y asistencia. Reprogramar, cancelar con motivo, que dirija el respaldo, acreditar unidades de la sesión. Asignar o quitar el respaldo |
| `/grupos/[id]/lista` | idem (el backup puede) | Ahora con **Justificó**, modalidad de la sesión de ese día y aviso de qué posición del calendario ocupa la lista |
| `/recuperacion` | administrador, coordinador, monitor, líder | Personas que esperan ponerse al día: responsable, fecha de seguimiento, estado y dónde hay más espera por unidad |
| `/temporadas` | administrador | Calendario de 36 semanas de cada temporada |
| `/panel` | administrador, coordinador, monitor | Bloque "Calendario y cobertura": sesiones realizadas vs. planificadas, por registrar, grupos sin calendario o sin respaldo |
| `/mi-progreso/[id]` | la persona | Próxima reunión y acceso al calendario de su grupo |
| `/alertas` | quienes administran | Aviso nuevo "Sesión sin registrar" |

## Reglas (en la base de datos, no solo en pantalla)

- **Las 36 posiciones son planificación**: cada sesión tiene su número; cancelar o reprogramar **no cambia el número** y deja huella (fecha original, motivo y auditoría).
- **Pasar lista ocupa la sesión planificada más cercana** (hasta 3 días de diferencia). Una reunión lejos de todo calendario queda como "extra", sin posición.
- **Lo planificado, cancelado o sin registrar no cuenta como reunión dada**: no suma ausencias ni distorsiona alertas.
- **Falta justificada**: no cuenta como ausencia para el máximo del currículum (decisión por defecto, reversible; ver abajo).
- **Backup**: puede pasar lista y dirigir sesiones; **no** inscribe, no cancela ni reprograma sesiones, no acredita. Si dirigió una sesión, queda registrada a su nombre aunque el líder corrija la lista después.
- **Acreditar desde la sesión**: solo a quienes asistieron (presente o recuperado), solo las unidades que el plan asigna a esa posición, respetando los requisitos entre unidades, sin duplicar. Lo que no se puede acreditar se informa con el motivo. **Asistir no acredita**: es un paso explícito de líder, monitor o coordinador.
- **Recuperación**: la persona la pide; quien administra su grupo asigna responsable y fecha. Cerrarla registra cuándo se resolvió.
- **Cerrar o cambiar de grupo no toca el aprendizaje** (Fase 1) y el calendario del grupo no depende del líder titular.

## Pruebas
```bash
npm test          # 272 pruebas (39 nuevas de base de datos + 6 de calendario)
npm run typecheck
npx next build
```
Cubren: planificar 36 con pausas y con calendario de temporada; ligar posiciones al plan; reunión que ocupa su posición, que se corre ±3 días y que queda extra; reprogramar/cancelar conservando número; colisiones de fecha; backup con permisos limitados y facilitador conservado; acreditación solo a asistentes, con requisitos y sin duplicar; recuperación; alertas y panel; repetir la migración.

## Decisiones reversibles
- **Falta justificada = no cuenta como ausencia.** Si prefieres que cuente, se cambia en una línea de la vista `enrollment_progress`.
- **Tolerancia de ±3 días** para asignar una lista a una sesión planificada.
- **El respaldo se elige entre líderes, monitores y coordinadores** (no alumnos) y debe ser distinto del titular.
- La evidencia por defecto para acreditar es "asistencia + validación del líder" (método `asistencia_validada`); otros métodos ya existen en el modelo.

## Límites
- No lo vi renderizado con datos reales; está probado contra un Postgres real y compila.
- Los grupos existentes no tienen calendario hasta que se planifiquen (grupo por grupo). Planificar un grupo que ya tiene reuniones numera las que caen en la misma fecha.
- Las unidades de cada semana dependen del plan pedagógico, que se cargará con tus materiales originales (Fase 4). Hasta entonces el calendario muestra fechas y asistencia, no contenido: **no se inventó ningún contenido**.
- Aún no hay: recordatorios automáticos, calendario exportable (iCal) ni aviso al backup cuando lo designan.

## Siguiente: Fase 4
Biblioteca de materiales y editor curricular con flujo de aprobación, y construcción del plan de 36 encuentros a partir de tus materiales originales.
