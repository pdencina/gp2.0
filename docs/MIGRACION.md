# Migración del sistema antiguo (Laravel + MySQL) a Grupos Pequeños 2.0

Base analizada: `wwarmi_app_archile` (MySQL 5.7, Laravel). Análisis hecho en modo lectura; solo cifras agregadas.
Este documento no contiene datos personales.

## 1. Cómo funciona hoy

| Concepto | Tabla antigua | Volumen |
|---|---|---|
| Grupo pequeño = currículum (Hombres, Mujeres, Freedom Single, Fútbol…) | `grupospequenos` | 24 |
| Temporada (año/periodo, 17 desde 2020; la 2026 está activa) | `temporadas` | 17 |
| Ciclo de un currículum (11 clases cada uno) | `ciclos` | 152 |
| Horario = un grupo concreto en un ciclo y temporada (líder, monitor, día/hora, presencial o virtual) | `gpequenoliders` | 3.587 (678 en 2026) |
| Dirección de un horario presencial | `in_person_addresses` | 200 |
| Alumnos | `users` | 12.645 |
| Líderes | `liders` | 717 |
| Monitores | `monitors` | 129 |
| Coordinadores (varios por currículum, hasta 6) | `coordinadors` | 58 |
| Administradores | `admins` | 12 |
| Inscripción de una persona a un horario/ciclo | `inscripcions` | 37.493 |
| Asistencia por semana | `asistencias` y `attendance_weeks` | ~508.000 y ~68.500 |
| Recursos del currículum (links de lectura y escritura) | `recursos` | 230 |
| Aportes económicos ("amor de casa") | `loveofhouses`, `banckings`, `accounts` | 2.934 |
| Matrimonios (inscripción de parejas) | `matrimonios` | 1.803 |
| Evaluaciones a líderes | `evaluations` | 20 |
| Soporte | `tickets` | 16 |
| Fútbol (datos extra) | `additional_ar_futbol` | 1.113 |

La escalera de roles **ya existe en los datos**: alrededor de 670 personas aparecen como alumno y líder, unas 100 como alumno, líder y monitor, y algunas como coordinador.

## 2. Contraseñas
Todas están en **bcrypt (`$2y$`, 60 caracteres)** en las 5 tablas de personas, salvo un líder con una clave inválida.
Se pueden importar a Supabase cambiando el prefijo `$2y$` por `$2a$`. **Los usuarios conservan su contraseña.**

## 3. Problemas encontrados en la base antigua (y su mejora)
1. **5 tablas de personas con columnas repetidas** (alumno, líder, monitor, coordinador, admin). Una misma persona tiene hasta 5 filas y 5 contraseñas distintas. → Una sola tabla de perfiles, con el rol y su historial.
2. **Dos tablas de asistencia** (`asistencias` y `attendance_weeks`) con datos distintos. → Una sola.
3. **Estados numéricos sin documentar** (`status` 0, 1, 2, 3). → Valores con nombre (presente, ausente, recuperado, pendiente). Hay que confirmar el significado exacto con el código.
4. **El horario es texto libre** (`horario varchar`). → Día, hora de inicio, hora de fin y modalidad como campos separados.
5. **Un solo coordinador por currículum en mi esquema, pero en los datos hay hasta 6.** → Relación de muchos a muchos entre coordinadores y currículums.
6. **Contadores guardados** (`cuposabiertos`, `cuposdisponibles`). Se desactualizan. → Calcularlos.
7. **Correo sin verificar en casi todos los usuarios** (solo se registran 879 con términos aceptados de 12.645). → Verificar y pedir aceptación de términos en el primer ingreso.
8. **Teléfonos inconsistentes**: ~6.250 de Chile con 9 dígitos, ~1.900 con `+`, ~3.700 solo dígitos de otros países y ~800 con otro formato. → Inferir el código de país desde el país del perfil; lo irrecuperable se marca para corregir.
9. **Datos sucios puntuales**: una temporada con fecha de inicio posterior a la de término, registros de prueba, cuentas inactivas.
10. **Flags sin uso** (`is_lider`, `is_monitor` están en 0 en todos los registros).

## 4. Mapa de migración (tabla antigua → nueva)
- `users`, `liders`, `monitors`, `coordinadors`, `admins` → `auth.users` + `profiles` (unificadas por correo; rol = el más alto; `role_history` reconstruido con las fechas de alta de cada tabla).
- `grupospequenos` → `curriculums` (con audiencia, edades, libro, cantidad de clases).
- `coordinadors.grupopequeno_id` → `curriculum_coordinators` (nueva, muchos a muchos).
- `temporadas` → `seasons` (nueva).
- `ciclos` → `cycles` (nueva).
- `gpequenoliders` + `in_person_addresses` → `groups` (con temporada, ciclo, modalidad, horario y dirección).
- `inscripcions` → `enrollments` (nueva).
- `asistencias` / `attendance_weeks` → `attendance` (con 4 estados).
- `recursos` → recursos por currículum y ciclo.
- `loveofhouses`, `banckings`, `accounts`, `matrimonios`, `evaluations`, `additional_ar_futbol`, `tickets` → a decidir módulo por módulo.
- No se migran: `password_resets`, `failed_jobs`, `migrations`, `constants`.

## 5. Cambios necesarios en el esquema nuevo antes de migrar
- Temporadas y ciclos (con 11 clases por ciclo y estado en curso o finalizado).
- Grupo = horario de un ciclo: día, hora de inicio y fin, modalidad, dirección si es presencial, y enlace a su continuación.
- Asistencia con 4 estados (incluye "recuperado") y la regla de máximo 3 ausencias por ciclo.
- Inscripciones (un alumno por ciclo y grupo), separadas de la pertenencia a un grupo.
- Varios coordinadores por currículum.
- Un mismo perfil puede tener historial de varios roles.

## 6. Reglas confirmadas en el código antiguo (Laravel, `app/Helpers` y controladores)
**Asistencia (`asistencias.status`):** 0 = inscrito sin marca, 1 = presente, 2 = ausente, 3 = recuperado.
**Inscripción (`inscripcions.status`):** 0 = reprobado, 1 = inscrito (en curso), 2 = aprobado, 3 = preinscrito, 9 = no participó.
**Calificación al cerrar la temporada:** se cuentan como inasistencia las semanas en 0 y en 2. Con más de 3 inasistencias la inscripción pasa a reprobado; con 3 o menos, a aprobado (el 30 % de 12 semanas).
**Inscripción:** una persona solo puede estar una vez por grupo pequeño y temporada; si el horario ya terminó, puede reinscribirse. Hay inscripción individual, de matrimonios (pareja) e importación masiva por CSV. El coordinador cancela; el administrador puede cambiar cualquier estado.
**Alcance:** el coordinador y el monitor ven solo los grupos pequeños que tienen asignados.
**Reasignar alumnos:** existe una pantalla que mueve inscripciones de un horario a otro y recrea las semanas de asistencia.
**Distribución real de inscripciones:** 20.803 aprobadas, 14.509 reprobadas, 2.040 en curso, 14 preinscritas y 3 sin participar.

## 6.1 Pendiente de decidir
- Qué módulos económicos (aportes, matrimonios, fútbol) hay que traer.
- Si "reprobado" se mantiene tal cual o se replantea (hoy es el 39 % de las inscripciones).
- Prerrequisitos entre ciclos (`ciclo_prela`) y su uso real.

## 6.2 Hallazgos de seguridad en el servidor actual (revisar aparte de la migración)
- Existe un archivo `credenciales.txt` en texto plano en la carpeta del servidor `gpv2server`. No fue abierto. Debe moverse a un gestor de contraseñas y borrarse; todas las claves que contenga deben considerarse expuestas y rotarse.
- Hay copias comprimidas de la aplicación (`apparchile.zip`, `apparchiledev.zip`) en la carpeta principal, que pueden incluir claves.
- La contraseña de la base de datos y del correo viven en archivos de entorno en el mismo servidor; rotarlas al terminar la migración.

## 7. Plan
1. Aprobar el esquema v2 (sección 5).
2. Escribir el script de importación en modo de prueba, con informe de datos sucios.
3. Probar en un proyecto de Supabase aparte, con una copia de los datos.
4. Revisar el resultado con un coordinador.
5. Carga final y corte, con el sistema antiguo en solo lectura durante la migración.
6. Correo de aviso a los usuarios con el nuevo enlace.
