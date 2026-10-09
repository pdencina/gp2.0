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
| Asistencia | Se combinan las dos tablas antiguas; solo se crean reuniones en semanas con marcas |
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

## Paso 3. Preparar el acceso a la base nueva
Crea `migracion/.env.migracion` (no se sube a GitHub) con:
```
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        (Supabase → Project Settings → API → service_role)
DATABASE_URL=postgresql://...        (Supabase → Project Settings → Database → Connection string, modo Session)
```
La clave `service_role` da control total: no la compartas ni la pegues en chats.

## Paso 4. Prueba chica y luego completa
```
npm run migrar -- --muestra 20 --aplicar --si-estoy-seguro
npm run migrar -- --aplicar --si-estoy-seguro
```
`--muestra 20` importa solo 20 grupos y las personas que dependen de ellos. Revisa el resultado en la plataforma y recién entonces corre la importación completa.

## Cómo es de seguro
- Por defecto solo simula. Para escribir hace falta `--aplicar` **y** `--si-estoy-seguro`, y muestra el proyecto de destino.
- Se puede repetir: cada fila antigua produce siempre el mismo identificador, así que no duplica. No la repitas **después de abrir la plataforma al público**, porque volvería a pisar datos editados a mano.
- Nunca baja el rol de una cuenta que ya existe, ni borra el historial de roles de cuentas ya creadas.
- Si un currículum o temporada ya existe con el mismo nombre, el importado se renombra con "(importado)".
- Las inscripciones históricas se cargan saltando las reglas de inscripción (cupo, audiencia, ciclo previo); las reglas vuelven a aplicar de inmediato para todo lo que se haga después.

## Pruebas
`npm test` incluye una importación completa contra un Postgres real con el esquema v2.
