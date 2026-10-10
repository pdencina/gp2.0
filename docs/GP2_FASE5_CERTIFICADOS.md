# GP 2.0 — Fase 5: progreso multianual, AR Hombres y certificados

Requiere `006` a `009` y la migración nueva `supabase/v2/010_certificados.sql` (aditiva y repetible).

## Tus respuestas y cómo las apliqué
- **¿Quién emite certificados? "Sí" a "solo administradores, o también pastores designados por sede".** Lo entendí como **ambos**: el administrador y los pastores que el administrador designe en cada sede. El coordinador ve quién está listo para certificarse, pero no emite. Si querías otra cosa, se cambia en una función (`can_issue_certificate`).
- **¿Los 13 ciclos antiguos de HOMBRES son AR Hombres de tres años? Sí.** La migración deja HOMBRES con **3 años de duración y certificable**, y le pone la etiqueta de oferta "AR Hombres". **No repartí los 13 ciclos entre los tres años**: me confirmaste que corresponden, pero no cuántos van en cada año, y eso no se inventa. Se asigna desde la pantalla (abajo). Todos los ciclos quedan en el año 1 hasta que lo hagas.

## Cómo aplicarla y ponerla a andar
1. Respaldo y pegar `010_certificados.sql` en el SQL Editor.
2. **Currículums → HOMBRES → versión 1**: en cada uno de los 13 módulos, elige su **año** (1, 2 o 3) y pulsa *Cambiar*. Es la única decisión que necesito de ti (ver "Qué falta").
3. En la misma pantalla, **Años y requisitos**: define el porcentaje mínimo de cada año (por defecto 100 %).
4. **Créditos de la plataforma anterior**: valida o rechaza, módulo por módulo, lo que figuraba como aprobado (es asistencia, no equivalencia con el material nuevo).
5. **Sincronizar el año de los grupos** y luego **Recalcular el año de cada persona**: el año de cada persona se deduce de lo acreditado o validado.
6. **Certificados → Pastores designados por sede**: designa a cada pastor.
7. Que cada persona indique su **sede en su perfil**, y el administrador asigne la **sede de cada grupo** (en el detalle del grupo). Los grupos importados no tienen sede porque la plataforma anterior casi no la registraba.

## Qué hay

| Pantalla | Quién | Qué hace |
|---|---|---|
| `/mi-progreso/[id]` | la persona | **Tu ruta**: año 1, 2 y 3 con su avance y el mínimo que se pide; **tus encuentros del año** (cuadrícula de las 36 semanas: completa, parcial, pendiente); botón *Pasar al año N* cuando la etapa está cumplida; tus certificados |
| `/curriculums/[id]` | administrador, coordinador | Año de cada módulo, % mínimo por año, recalcular años de las personas, sincronizar grupos |
| `/curriculums/[id]/creditos` | idem | Revisar lo heredado por módulo: ver por estado, validar o rechazar en bloque (con confirmación) o por persona, con nota |
| `/certificados` | administrador, coordinadores y pastores de sede | Quién está listo (por programa y por año), emitir uno o hasta 100 a la vez, certificados emitidos, revocar (administrador), designar pastores (administrador) |
| `/certificados/[id]` | la persona y quien administra | Certificado listo para imprimir o guardar como PDF, con código de verificación |
| `/verificar` | **público** | Se escribe el código y se ve si es válido, a nombre de quién, qué programa/etapa y si fue revocado. Nada más |
| `/panel` | administrador, coordinador, monitor | Bloque **Formación**: inscritos únicos, en curso, en pausa, completaron, reincorporados, asistieron en 30 días y certificados de programa y de etapa |
| Perfil, grupos | todos / administrador | Sede de la persona; programa, año y sede al crear un grupo; sede de un grupo existente |

## Reglas (en la base de datos)
- **El avance es por ítems.** Cada unidad acreditada cuenta uno. Un módulo heredado sin unidades cuenta como **una etapa** y solo se da por cumplido si una persona **validó** su crédito. Un año se cumple al llegar al porcentaje mínimo.
- **Nada avanza solo.** Se pasa de año únicamente con la etapa cumplida y a petición de la persona o de quien la acompaña; no por calendario ni por asistir.
- **El año se deduce de la evidencia**: el primero que todavía no se cumple (o el último, si están todos). Quien no tiene nada, parte en el año 1.
- Los grupos que se ofrecen a una persona son los de **su año**.
- **Certificar**: el programa debe ser certificable; el certificado de **programa** exige todos los años cumplidos y deja la inscripción como *completada*; el de **etapa** (solo programas de varios años) exige ese año. Emitir dos veces devuelve el mismo certificado.
- **Autoridad**: administrador, o el pastor designado en la **sede de la persona** (la de su grupo vigente o último; si no tiene, la de su perfil). Sin sede conocida, solo el administrador.
- **Auditable**: cada certificado guarda la regla con que se emitió (años, ítems, mínimo, versión, sede); emitir, revocar y revisar créditos quedan en la auditoría; los cambios de año también.
- **Revocar** exige motivo y es del administrador; el certificado revocado se ve como revocado al verificarlo, y se puede emitir uno nuevo con otro código.
- La verificación pública no revela correo, teléfono ni datos del grupo.

## Pruebas
```bash
npm test          # 359 pruebas
npm run typecheck
npx next build
```
Cubren: AR Hombres y la migración (sin tocar otros programas ni repartir los 13 ciclos); avance por año y mínimos configurables; que asistir no cuenta; avanzar de año y sus límites; validación de créditos heredados, permisos y auditoría; año deducido de la evidencia; grupos por año; quién ve y quién emite certificados por sede; emisión idempotente, revocación y verificación anónima; certificados por etapa y de programas de un año; reincorporaciones y cifras de formación; y repetir la migración.

## Qué falta o conviene saber
- **Decisión tuya pendiente**: cuántos de los 13 ciclos de HOMBRES van en cada año (por ejemplo "1–4 año 1, 5–8 año 2, 9–13 año 3", solo a modo de ejemplo). Dímelo y lo dejo asignado, o hazlo desde la pantalla.
- **No lo vi renderizado con datos reales**; la lógica y los permisos están probados contra un Postgres real.
- La asistencia no es requisito de certificación (solo lo acreditado). Si quieres exigir también un mínimo de asistencia, hay que definir cómo se mide por año.
- No hay QR en el certificado ni correo automático al emitirlo.
- Los pastores sin rol de coordinador o administrador ven el menú "Certificados" solo si están designados en alguna sede.

## Siguiente: Fase 6
Reconciliación de datos (conteos antes/después), pruebas de extremo a extremo de los flujos F1–F8 y habilitación por campus.
