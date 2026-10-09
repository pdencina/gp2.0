# Grupos Pequeños 2.0 — Propuesta de diseño

Borrador para aprobar antes de escribir código. Parte de cómo debe funcionar el sistema; del sistema antiguo solo se toma la lógica de negocio y los datos (ver `MIGRACION.md`).

## 1. Principios
1. **Una persona, una cuenta, un historial.** Alumno, líder, monitor y coordinador son etapas de la misma persona, no cuentas distintas.
2. **Cada rol ve solo lo suyo y tiene una acción principal.** Simple y cercano, pensado primero para el celular.
3. **El sistema avisa antes de que algo falle.** Alertas a tiempo, no calificaciones al final.
4. **Nada de números mágicos.** Los estados tienen nombre.
5. **Lo que se puede calcular no se guarda.** Cupos, porcentajes, avance.
6. **Privacidad desde el diseño.** Menores con tutor, datos mínimos, acceso por alcance.

## 2. Estructura del negocio
```
Temporada (ej. 2026)
 └ Currículum (Hombres, Mujeres, Freedom…)  ── con sus Ciclos (Ciclo 1, Ciclo 2…) y Lecciones
     └ Grupo (un horario concreto de un ciclo, con líder y monitor)
         └ Inscripción (una persona en un grupo)
             └ Asistencia por reunión (presente, ausente, recuperado)
```
Personas: `perfil` + `historial de roles`. Asignaciones: coordinador ↔ currículums (varios), monitor ↔ grupos, líder ↔ su grupo.

## 3. Modelo de datos (nuevo)
| Tabla | Para qué | Cambios respecto a lo construido |
|---|---|---|
| `profiles` | La persona: nombre, teléfono internacional, país, nacimiento, tutor si es menor, términos aceptados | Agrega país, nacimiento, tutor, términos |
| `role_history` | Cada cambio de rol, quién y cuándo | Ya existe |
| `curriculums` | Currículum, audiencia (hombres, mujeres, parejas, todos), edades, clases por ciclo | Reemplaza el coordinador único |
| `curriculum_coordinators` | Varios coordinadores por currículum | Nueva |
| `seasons` | Temporada con estado: borrador, inscripciones abiertas, en curso, cerrada | Nueva |
| `cycles` | Ciclo de un currículum, con ciclo previo opcional | Nueva |
| `groups` | Un horario: día, hora de inicio y fin, modalidad, dirección, cupo, estado, "continúa a" | Reemplaza `groups` actual |
| `enrollments` | Persona en grupo y temporada, con estado: preinscrito, en curso, aprobado, no completó, cancelado | Reemplaza `group_members` |
| `meetings` | Cada reunión del grupo, con su lección | Reemplaza `sessions` |
| `attendance` | Estado por inscripción y reunión | Agrega "recuperado" |
| `lessons`, `resources` | Contenido por ciclo y enlaces | Lecciones ya existen |
| `contacts` | Seguimiento a personas | Ya existe |
| `audit_log` | Quién cambió qué en datos sensibles | Nueva |

## 4. Flujos clave
1. **Inscribirse.** La persona crea su cuenta, elige un currículum (solo ve los que le corresponden por edad y audiencia), un ciclo y un grupo con cupo (día, hora, modalidad) y se inscribe. Un coordinador puede inscribir a otros y hay importación masiva.
2. **Día de reunión.** El líder abre su lista en el celular, marca presentes y recuperados, y ve la lección de hoy.
3. **Seguimiento.** Alertas por faltas, personas nuevas sin contacto, grupos sin líder o con baja asistencia, con WhatsApp y registro del contacto. Lo que ya está construido.
4. **Riesgo antes del cierre.** Con 2 ausencias el alumno queda "en riesgo" y se avisa al líder y al monitor. La regla de fondo se mantiene: hasta 3 ausencias se aprueba; "recuperado" cuenta como asistencia.
5. **Cierre y continuación.** El coordinador cierra el ciclo, el sistema calcula aprobados y crea el grupo del ciclo siguiente con los que aprobaron, en un paso.
6. **Escalera de roles.** Se mantiene (alumno, líder, monitor, coordinador), con candidatos sugeridos: quienes completaron ciclos y tienen buena asistencia.
7. **Reasignar.** Mover un alumno de grupo conserva su asistencia ya registrada.

## 5. Pantallas por rol
- **Alumno:** su grupo, su lección, su avance y su asistencia, y la inscripción al siguiente ciclo.
- **Líder:** pasar lista, lección de hoy, alertas de su grupo y WhatsApp.
- **Monitor:** sus grupos, salud de cada uno (asistencia, riesgo) y alertas.
- **Coordinador:** su currículum, ciclos, grupos, cupos, retención entre ciclos y candidatos a líder.
- **Administrador:** vista global, temporadas, usuarios y auditoría.

## 6. Qué no se hace en esta etapa
Aportes económicos, matrimonios y fútbol (datos sensibles, se evalúan en una segunda etapa), correos masivos y app móvil nativa (la web funciona como app instalable).

## 7. Migración
Se traducen los datos al diseño aprobado: personas unificadas por correo con su rol más alto y su historial, contraseñas conservadas (bcrypt), currículums, ciclos, grupos, inscripciones y asistencia con los 4 estados. "Reprobado" pasa a "no completó".

## 8. Decisiones que necesito
1. ¿Apruebas el modelo de la sección 3?
2. ¿"Reprobado" se llama "no completó"?
3. ¿Mantenemos el tope de 15 alumnos por grupo o varía por currículum?
4. ¿Un alumno puede estar a la vez en grupos de distintos currículums?
5. ¿La inscripción al siguiente ciclo es automática para quienes aprueban o la confirma cada persona?
6. ¿Quién cierra el ciclo: el coordinador o el sistema al terminar las clases?
