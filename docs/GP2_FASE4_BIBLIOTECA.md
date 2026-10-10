# GP 2.0 — Fase 4: biblioteca de materiales, editor curricular y aprobación pastoral

Requiere `006` a `008` y la migración nueva `supabase/v2/009_biblioteca.sql` (aditiva y repetible).

**No se inventó contenido.** Esta fase construye el lugar y el proceso para cargar tus materiales originales, organizarlos y aprobarlos. Todo lo que aparece vacío se llena con tu material.

## Cómo aplicarla
1. Respaldo y luego pegar `009_biblioteca.sql` en el SQL Editor de Supabase. Crea además el espacio privado de archivos (`materiales`, hasta 50 MB por archivo; PDF, video, audio, presentaciones, documentos e imágenes).
2. Desplegar la aplicación. Si sale antes que el SQL, las pantallas nuevas avisan qué falta y las de siempre siguen funcionando.
3. En cada programa: **Currículums → programa → Revisión pastoral**: el administrador agrega a las personas que pueden aprobar y publicar.

## Dos correcciones de fases anteriores (incluidas en 009)
- **Permisos del plan (Fase 1, 006).** La regla que gobierna las unidades de cada semana del plan permitía que cualquier persona con sesión que pudiera *ver* un plan publicado cambiara sus unidades. Ahora solo el administrador o el coordinador del programa. En producción todavía no existen planes, por lo que no hubo nada que alterar; la prueba nueva lo cubre.
- **Continuar un grupo (001 + 006).** Desde 006 la dirección vive en una tabla protegida, y "crear el grupo del ciclo siguiente" seguía copiándola desde la columna vacía: el grupo nuevo se quedaba sin dirección. Ahora copia dirección, enlace online, respaldo y sede, y no confunde módulos de distintas versiones.

## Qué hay

| Pantalla | Quién | Qué hace |
|---|---|---|
| `/curriculums/[id]` | administrador, coordinador | **Versiones** del programa. Estado, lista de lo que falta antes de revisar, pasos del flujo con nota, crear una versión nueva copiando otra, módulos y unidades, revisores y bitácora |
| `/curriculums/[id]/plan` | idem | **Plan de 36 encuentros** por año formativo (AR Hombres: años 1 a 3). Cada semana: tipo, título, notas y las unidades del material que se trabajan. Botón "Proponer una distribución pareja" como punto de partida |
| `/biblioteca` | idem | Todo el material original: subir un archivo (directo y privado) o pegar un enlace; tipo, para quién es, origen o autoría; ubicarlo en un módulo o unidad; archivar |
| `/revision` | idem | Versiones en camino a publicarse, con lo que falta de cada una |
| `/lecciones/[id]` | quien tenga acceso | Muestra los materiales de la unidad y su módulo que esa persona puede ver |

## El flujo editorial

`cargado → en adaptación → en revisión pastoral → aprobado → publicado → archivado`

- Quien prepara (coordinador) puede empezar la adaptación y enviar a revisión. **Aprobar y publicar** es de un revisor del programa o del administrador. Devolver a adaptación **exige una nota** con lo que debe corregirse.
- No se envía a revisión una versión de un programa de formación sin unidades; no se aprueba si hay unidades que no están en ninguna semana del plan. Otros avisos (semanas sin definir, unidades sin material, años que faltan) se muestran pero no bloquean.
- **Una versión en revisión, aprobada o publicada no se edita** (módulos, unidades, plan, vínculos de material): lo hace cumplir la base de datos. Para cambiar algo se **copia la versión**.
- **Publicar** deja la versión como vigente y **congela la anterior**: las cohortes que la cursan la conservan intacta; los grupos nuevos toman la vigente. El original y las versiones anteriores nunca se pierden.
- La versión que trajo la migración (sin contenido ni revisión) se marca como "heredada" y sigue editable hasta que se reemplace.
- Cada paso queda en la bitácora con quién, cuándo y su nota.

## Quién ve qué material y qué unidad

- **Material**: el equipo editorial ve todo. El equipo de los grupos (líder, monitor, respaldo) ve lo ubicado en una versión publicada o en la que enseña su grupo. Los participantes ven solo lo marcado "También los participantes", de una versión publicada. Lo no ubicado o archivado queda solo para el equipo editorial. Los archivos se abren con una dirección temporal de 2 minutos.
- **Unidades (cambio importante)**: antes se liberaban según el ciclo del grupo, y los grupos de GP 2.0 no tienen ciclo. Ahora un participante ve una unidad de una versión publicada si ya la acreditó, si su grupo ya la dio (según el plan de la sesión), o si es la de la **próxima sesión**; el modelo anterior sigue valiendo para los grupos con ciclo.
- Los materiales que ya existían (enlaces por ciclo) siguen visibles para quienes cursan ese ciclo; lo nuevo parte visible solo para el equipo.

## Reglas de seguridad

- Un archivo solo puede colgar de la carpeta de su propio programa (restricción en la base de datos), así que nadie puede registrar el archivo de otro programa para leerlo.
- Solo el equipo editorial del programa sube archivos; el borrado físico queda en manos del administrador. Archivar no borra nada.
- Cambiar un material hacia o desde una versión congelada se bloquea.

## Pruebas
```bash
npm test          # 318 pruebas (34 nuevas de base de datos, más versiones, materiales y calendario)
npm run typecheck
npx next build
```
Cubren: copia de versiones sin tocar la original; edición, bloqueo y reapertura según estado; aprobación solo del revisor y con validaciones; publicación y congelado; bitácora; distribución del plan con 18, 36 y 72 unidades; guardar semanas; visibilidad de materiales por rol y por versión; reglas de archivos; acceso a unidades sin ciclo; continuación de grupos; y la migración sobre datos anteriores, repetida. También se subió el tiempo máximo de cada prueba (`vitest.config.ts`) porque cargar el esquema completo tardaba más de 5 segundos en equipos cargados.

## Límites
- **No lo vi renderizado**, y la subida real de archivos (permiso de subida y envío desde el navegador a Storage) está probada solo en sus reglas de acceso con un Storage simulado: conviene probarla con un PDF pequeño después de desplegar.
- No hay lector ni vista previa dentro de la plataforma: el material se abre en una pestaña nueva.
- No hay todavía carga masiva, búsqueda de texto dentro de los archivos ni versionado por archivo (reemplazar un archivo es subir otro y archivar el anterior).
- Los revisores deben tener sesión como administrador o coordinador para ver las pantallas de revisión.
- Los certificados y los requisitos de AR Hombres por etapa son de la Fase 5.

## Siguiente: Fase 5
Progreso multianual, AR Hombres a 3 años con requisitos por etapa y certificados.
