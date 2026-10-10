# Importación desde la plataforma antigua

Trae a Grupos Pequeños 2.0 lo que la plataforma nueva necesita, traducido a su modelo. **No copia todo**: ver más abajo.

## Qué trae y qué no

| Se importa | Cómo queda |
|---|---|
| Personas (alumnos, líderes, monitores, coordinadores, administradores) | Una sola cuenta por correo, con el rol más alto que tenga activo y su historial de roles reconstruido |
| Contraseñas | Se conservan (bcrypt). Si una persona tiene claves distintas en varias fichas, queda la del rol más alto |
| Datos personales | Nombre, teléfono (llevado a formato internacional con el país de la persona), género, nacimiento, país, ciudad, tutor y términos aceptados. Prevalece lo que la persona escribió como alumno |
| Currículums, ciclos, temporadas | Con audiencia y edades; los coordinadores activos quedan asignados |
| Grupos (horarios) | Día, hora y modalidad separados, dirección si es presencial, líder y monitor |
| Inscripciones | Con sus estados: reprobado pasa a "no completó" |
| Asistencia | Hasta 2025 se usa el calendario real de semanas. Desde 2026 la plataforma antigua guarda "Semana 1 a 11" **sin fecha**, así que la fecha de cada reunión se **estima** a partir de cuándo se marcó (ver más abajo). Solo se crean reuniones en semanas con marcas |
| Recursos | Solo enlaces `https://` |

**No se importa** (a propósito, para una segunda etapa): aportes económicos, matrimonios, evaluaciones, fútbol, soporte, contraseñas olvidadas y registros técnicos.

## Paso 1. Exportar el respaldo
En phpMyAdmin, base `wwarmi_app_archile` → **Exportar** → método **Personalizado** → formato **SQL** → **Estructura y datos**.
Marca solo estas tablas: `paises`, `users`, `liders`, `monitors`, `coordinadors`, `admins`, `grupospequenos`, `temporadas`, `ciclos`, `gpequenoliders`, `in_person_addresses`, `semanas`, `inscripcions`, `asistencias`, `attendance_weeks`, `recursos`.
Guarda el archivo como `migracion/datos/respaldo.sql`. Esa carpeta **no se sube a GitHub**; contiene datos personales.

## Paso 2. Simular (no escribe nada)
```
npm run migrar:simular
```
Muestra un informe y deja `migracion/salida/informe.json` y `avisos.csv`. Los avisos son lo que conviene revisar antes de importar: correos inválidos, teléfonos que no se pudieron resolver, duplicados, fechas invertidas.

## Paso 3. Preparar la base nueva y el acceso
1. En el SQL Editor de Supabase, ejecuta una sola vez `supabase/v2/002_importacion.sql`. Instala las funciones que usa el importador; solo las puede llamar la clave `service_role`. Al terminar la migración se quitan con `003_quitar_importacion.sql`.
2. Crea `migracion/.env.migracion` (no se sube a GitHub) con:
```
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        (Supabase → Project Settings → API → service_role)
```
La clave `service_role` da control total: no la compartas ni la pegues en chats. El importador habla con Supabase por HTTPS (la misma vía que la web), así que funciona en redes que bloquean la conexión directa a la base de datos. No hace falta la contraseña de la base.

## Paso 4. Prueba chica y luego completa
```
npm run migrar -- --muestra 20 --aplicar --si-estoy-seguro
npm run migrar -- --aplicar --si-estoy-seguro
```
`--muestra 20` importa solo 20 grupos y las personas que dependen de ellos. Revisa el resultado en la plataforma y recién entonces corre la importación completa.

## Cómo es de seguro
- Por defecto solo simula. Para escribir hace falta `--aplicar` **y** `--si-estoy-seguro`, y muestra el proyecto de destino.
- Cada llamada a la base es una transacción: si algo falla, esa parte no queda a medias y se puede volver a ejecutar.
- Se puede repetir: cada fila antigua produce siempre el mismo identificador, así que no duplica. No la repitas **después de abrir la plataforma al público**, porque volvería a pisar datos editados a mano.
- Nunca baja el rol de una cuenta que ya existe, ni borra el historial de roles de cuentas ya creadas.
- Si un currículum o temporada ya existe con el mismo nombre, el importado se renombra con "(importado)".
- Las inscripciones históricas se cargan saltando las reglas de inscripción (cupo, audiencia, ciclo previo); las reglas vuelven a aplicar de inmediato para todo lo que se haga después.

## Después de abrir GP 2.0: importar solo lo nuevo
La importación completa vuelve a escribir el estado de todo lo importado, así que **no se usa una vez que alguien trabaja en GP 2.0**. Para traer lo que se siga registrando en la plataforma anterior hay un modo que solo agrega:

1. Ejecuta una vez `supabase/v2/012_importar_solo_nuevo.sql` en el SQL Editor de Supabase (usa `003_quitar_importacion.sql` para quitarlo al terminar).
2. Exporta de nuevo el respaldo y córrelo:
```
npm run migrar:solo-nuevo -- --respaldo migracion/datos/respaldo.sql                         (simulación)
npm run migrar:solo-nuevo -- --respaldo migracion/datos/respaldo.sql --aplicar --si-estoy-seguro
```

Qué hace y qué no:
- **Agrega** personas, currículums, temporadas, ciclos, grupos, inscripciones, reuniones, marcas de asistencia y recursos que todavía no existen aquí. Las personas nuevas reciben su cuenta y su historial.
- **No modifica** nada de lo que ya existe: ni roles, ni teléfonos, ni líderes, ni direcciones, ni coordinadores, ni marcas de asistencia ya cargadas. Un coordinador que se quitó en GP 2.0 no vuelve.
- **Dos avances hacia adelante** (y nunca hacia atrás): una inscripción que aquí sigue "en curso" o "preinscrita" y allá se cerró (aprobado, no completó…) se cierra, y deja su crédito histórico por revisar; y un grupo que allá finalizó y aquí sigue abierto se finaliza.
- Es repetible: correrlo dos veces seguidas no cambia nada la segunda vez.
- Si una reunión nueva cae el mismo día que una que ya existe en el mismo grupo (por ejemplo, una planificada aquí), la nueva se omite junto con su asistencia.

## Archivo histórico: no perder lo que el modelo nuevo no recoge
La importación traduce los datos; algunas tablas (matrimonios, evaluaciones, fútbol, soporte) y columnas no tienen dónde quedar. Para no perderlas, cada fila se guarda **tal cual** en el archivo histórico (solo el administrador la lee; no se modifica ni se borra).
1. Ejecuta una vez `supabase/v2/015_archivo_historico.sql` en el SQL Editor de Supabase.
2. Simula (no escribe) y luego guarda:
```
npm run migrar:archivar -- --respaldo migracion/datos/respaldo.sql
npm run migrar:archivar -- --respaldo migracion/datos/respaldo.sql --aplicar --si-estoy-seguro
```
- Repetirlo no cambia nada (lo ya guardado no se sobrescribe).
- Nunca guarda contraseñas ni datos de sesión. Omite el documento de identidad salvo `--incluir-dni`.
- `--incluir-financiero` agrega los aportes económicos y `--incluir-asistencia-cruda`, las ~505 mil marcas originales.
- Detalle y cifras en `docs/HISTORICO_Y_REENCUENTRO.md`.

## Pruebas
`npm test` incluye una importación completa contra un Postgres real con el esquema v2.

## Cosas que conviene saber de los datos antiguos
- **Fechas de 2026 estimadas.** En los grupos con el modelo actual la fecha de inicio se calcula con la mediana de las fechas en que se marcó cada semana, y nunca queda en el futuro. Puede haber un error de una semana. El número de lección y la asistencia de cada persona sí son exactos.
- **Calendarios con errores.** Una temporada de 2022 traía el calendario de semanas copiado de 2021 y una de 2023 tenía el inicio y el término invertidos. El script los detecta y usa la mejor fuente disponible; queda anotado en `avisos.csv`.
- **Ciclo previo.** `ciclo_prela` es el identificador del ciclo que debe aprobarse antes, no su número.
- **Grupos sin horario enlazado.** Las temporadas antiguas casi no enlazaban cada inscripción con su horario. Se asignan por temporada, líder y texto del horario; las que no calzan con ninguno se agrupan en grupos creados para no perder la inscripción.
