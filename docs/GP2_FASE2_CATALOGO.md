# GP 2.0 — Fase 2: catálogo, inscripción única y "Mi progreso"

Requiere haber aplicado `006_gp2_nucleo.sql`. Esta fase agrega **una migración pequeña** (`007_catalogo.sql`) y las pantallas.

## Cómo aplicarla

1. En Supabase → SQL Editor: pega y ejecuta `supabase/v2/007_catalogo.sql` (aditiva, repetible). **Hazlo antes de abrir el catálogo**: la pantalla usa la columna nueva `offering`.
2. El despliegue de la aplicación sale con el push a `main`.
3. Entra como administrador a **Currículums → Clasificar** y revisa la propuesta de agrupación (abajo).

## Pantallas

| Ruta | Quién | Qué hace |
|---|---|---|
| `/catalogo` | todos | Ofertas por categoría. Cada persona ve solo lo elegible para su perfil (audiencia y edad) y se **inscribe al programa** sin elegir grupo. Muestra cuántos grupos hay abiertos, presenciales y virtuales |
| `/mi-progreso` | todos | Sus programas con barra de avance, la unidad siguiente, su grupo actual o el aviso "aún no tienes grupo" |
| `/mi-progreso/[id]` | la persona, y quien administra su grupo | Avance por módulo y unidad, créditos de la plataforma anterior (por revisar), grupo actual, **elegir o cambiar de grupo/horario/modalidad**, pausar y retomar, **pedir recuperación** si no hay grupo compatible, historial de grupos |
| `/curriculums/clasificar` | administrador | Oferta (agrupa variantes), categoría, tipo, etapa de vida, años de ruta, si da certificado y visibilidad. Botón para aplicar la propuesta solo a lo que no tiene oferta |

La navegación cambia: **Mi progreso** y **Catálogo** reemplazan a "Inscripción". `/inscripcion` sigue funcionando (inscripción directa a un grupo) y también deja la inscripción curricular enlazada.

## Propuesta de agrupación (la apruebas tú)

Con los nombres reales de la plataforma anterior:

| Oferta | Variantes que agrupa |
|---|---|
| AR Jóvenes | AR JÓVENES, JÓVENES 17 a 23, 24 a 29, 17 a 29 |
| Biblia Creativa | 8 a 13 años, 14 a 17 años, sin límites |
| Freedom Single | general, hombres, mujer |
| Más Allá del Éxito | church, secular |
| AR Fútbol | Fútbol, Fútbol Punta Arenas (recreación) |
| Senderismo | hombres, mujeres (recreación) |
| Baile Entretenido, Running | recreación |

- **No se agrupan** (quedan como ofertas propias): LIBRO MORADO, CREER, LA HISTORIA, HOMBRES, MUJERES, TEENS, TWEENS, TWEENS Y TEENS, AR GOLD, DINNER, CHAT, SALUD FINANCIERA y el resto. Si alguna debe unirse a otra, se escribe el nombre de la oferta en esa fila.
- **Marcados como internos y ocultos** por la propuesta: COORD GLOBAL y PALABRAS DEL GENIO. Ocultar no borra nada: el programa deja de ofrecerse, y su coordinador, sus líderes y quienes ya participan lo siguen viendo.
- Todo es una etiqueta de agrupación: no toca grupos, inscripciones ni asistencia. Se revierte editando la fila.
- Con 37 programas y esta propuesta quedan unas 25 ofertas, no 23: la diferencia es lo que el administrador decida agrupar u ocultar. Cuando confirmes la lista final de 23, la dejo exacta.

## Reglas que se mantienen

- La inscripción curricular es única por persona y programa; cambiar de grupo no la duplica ni pierde avance (probado en Fase 1).
- Un programa privado nunca aparece en el catálogo, ni sus grupos abiertos para extraños.
- Solo el administrador cambia la clasificación del catálogo; el coordinador sigue editando el resto de su currículum (lo hace cumplir la base de datos).
- La pantalla evita ofrecer lo que no es elegible, pero la base de datos vuelve a validar (`eligibility_error`).
- Al ver el avance de otra persona (líder, monitor, coordinador) rige el mismo permiso de la base: nadie ve inscripciones fuera de su alcance.

## Archivos

- `supabase/v2/007_catalogo.sql`, `supabase/tests/gp2_nucleo.test.ts` (+3 pruebas)
- `lib/programs.ts` (+ test): categorías, propuesta de ofertas, agrupación, elegibilidad
- `lib/progress.ts` (+ test), `lib/action-helpers.ts` (helpers compartidos de acciones)
- `app/actions/programa.ts`
- `app/(app)/catalogo`, `app/(app)/mi-progreso`, `app/(app)/mi-progreso/[id]`, `app/(app)/curriculums/clasificar`

## Pruebas

```bash
npm test          # 227 pruebas
npm run typecheck
npx next build
```

## Límites y riesgos

- **No lo vi renderizado con datos reales**: las pantallas compilan y su lógica y permisos están probados contra un Postgres real, pero la revisión visual con tu cuenta queda pendiente después del despliegue.
- Los programas importados casi no tienen unidades cargadas (la plataforma anterior no las tenía), así que "Mi progreso" mostrará "todavía no tiene unidades" hasta que se cargue el currículum en la Fase 4. Lo que sí se ve: grupo actual, historial y créditos por revisar.
- Las personas importadas con grupo vigente quedan **activas**; las demás, **pausadas** (se pueden retomar con un clic).
- `compatible_groups` lista los grupos abiertos del programa; no promete que calcen con la unidad pendiente. Si no hay ninguno, se ofrece la solicitud de recuperación.
- Falta decidir si una falta justificada cuenta como ausencia (Fase 3).

## Siguiente: Fase 3

Calendario de 36 semanas por grupo, sesiones planificadas vs. realizadas, líder y respaldo, asistencia con "justificado", recuperación y acreditación de unidades desde la lista de asistencia.
