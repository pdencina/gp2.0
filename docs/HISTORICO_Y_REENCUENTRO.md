# Histórico y reencuentro

Dos compromisos: **no perder el historial de la plataforma anterior** y **poder recuperar a quienes dejaron su camino a medias**.

---

## 1. Que no se pierda nada del histórico

### Lo que se midió (contra el respaldo del 9 de octubre de 2026)
| Dato | En la plataforma anterior | En GP 2.0 | Qué pasó con la diferencia |
|---|---|---|---|
| Personas (5 tablas: alumno, líder, monitor, coordinador, admin) | 12.645 + 717 + 129 + 58 + 12 fichas | 12.713 cuentas | Una persona con varias fichas pasa a una sola cuenta (por correo), con su historial de roles |
| Inscripciones | 37.493 | 37.442 | 51 omitidas: 17 sin persona y 34 repetidas |
| Horarios (grupos) | 3.587 | 4.190 | Se crearon 603 grupos para no perder inscripciones antiguas que no tenían horario enlazado |
| Marcas de asistencia reales (presente, ausente, recuperado) | 340.750 | 340.104 | 646 (0,2 %) no se importaron; no se rastrearon una por una |
| Filas "inscrito sin marca" (estado 0) | 233.693 | no se importan como fila | Es la fila que el sistema antiguo creaba al inscribir. No es una marca; en GP 2.0 la falta se calcula igual (reuniones realizadas menos asistencias), como en el sistema antiguo |
| Matrimonios, evaluaciones, fútbol, soporte | 1.803 · 20 · 1.113 · 16 | sin pantalla todavía | Se guardan en el **archivo histórico** (abajo) |
| Aportes económicos | 2.934 (+7 bancos) | sin pantalla | Se guardan solo si se pide (`--incluir-financiero`) |

Lo que **no** se guarda nunca: contraseñas en el archivo (sí se conservan, cifradas, como clave de acceso de cada cuenta), datos de sesión y recuperación de contraseña. El documento de identidad (DNI) se omite salvo que se pida.

### Cómo se protege
1. **Archivo histórico** (`015_archivo_historico.sql`, `npm run migrar:archivar`): cada fila antigua se guarda *tal cual*, como JSON, en una tabla que solo agrega.
   - Solo la clave de importación escribe; solo el administrador lee (Habilitación → Archivo histórico).
   - Una fila ya guardada no se sobrescribe: repetir el comando no cambia nada.
   - Con el respaldo actual guardaría **130.303 filas** por defecto (simulación, sin escribir).
   - `--incluir-asistencia-cruda` agrega las ~505 mil marcas originales; `--incluir-financiero`, los aportes.
2. **Reconciliación** (Habilitación): compara lo que trajo la importación con lo que hay hoy; avisa si algo se perdió.
3. **Identificadores estables**: cada fila antigua produce siempre el mismo identificador en GP 2.0, así que se puede volver a importar sin duplicar.
4. **"Solo lo nuevo"**: trae lo que se siga registrando en la plataforma anterior sin pisar nada de GP 2.0.
5. **Lo único que hay que hacer fuera de la plataforma**: antes de apagar el servidor antiguo, guardar una **copia completa de la base MySQL** (todas las tablas) en un lugar seguro y cifrado, fuera de GP 2.0. Es la red de seguridad final.

### Una limitación que conviene conocer
- Las fechas de las reuniones de 2026 son **estimadas** (la plataforma antigua guardaba "Semana 1 a 11" sin fecha). El número de lección y la asistencia de cada persona sí son exactos, y las marcas originales (`attendance_weeks`) quedan en el archivo.

---

## 2. Recuperar a quienes se alejaron: Reencuentro

### Quién cuenta como "alejado"
Una persona con una inscripción curricular abierta (activa o pausada), **sin ningún grupo vigente** y cuya última actividad (asistencia, cierre de su último grupo o pausa) fue hace 3 meses o más. No aparecen:
- quienes completaron el programa,
- las cuentas desactivadas,
- (por defecto) quienes probablemente ya terminaron: aprobaron el último módulo del programa.

Con el respaldo actual, unas **9.300 personas** con historial no tienen hoy ninguna inscripción en curso; el Reencuentro las ordena por cuánto hace que se alejaron.

### Quién ve a quién
Cada persona la ve quien tiene relación con ella: el **administrador** (todas), el **coordinador** del programa, el **pastor** de su sede y el **líder, monitor o respaldo** de alguno de sus grupos. Un líder ve solo a quienes pasaron por sus grupos. Nadie ve su propia ficha.

### Qué se puede hacer
- Filtrar por antigüedad (3 meses a más de 2 años), programa, sede, etapa y nombre.
- **Escribir por WhatsApp** con un mensaje de partida cálido que recuerda que el avance se conserva. A una persona menor de edad se le escribe a su tutor, si hay teléfono.
- **Anotar el contacto** aunque la persona no esté en ningún grupo (cómo fue, cómo resultó, una nota y, si pidió tiempo, cuándo volver a escribirle).
- Seguir las etapas: *por contactar → esperando respuesta → seguimiento agendado → quiere volver → no continuará / datos por corregir*. Quien dijo "no continuará" no se vuelve a insistir.
- **Ver su camino** (lo que avanzó) y ayudarle a elegir un grupo cuando quiere volver.

### Cómo se sabe si funciona
El Panel muestra cuántas personas se alejaron, cuántas están sin contactar y **cuántas volvieron después de contactarlas** (asistieron a una reunión realizada luego del contacto). Esa es la cifra que dice si el esfuerzo da frutos.

### Para quien vuelve solo
Cuando una persona que dejó su camino hace más de un mes vuelve a iniciar sesión, la ventana de bienvenida le dice que **su avance sigue guardado** y le ofrece "Retomar".

### Cuidado con las personas
- Pedir no recibir recordatorios no impide un mensaje personal, pero se avisa en la ficha para actuar con delicadeza.
- La nota de cada contacto es de uso pastoral: máximo 500 letras, solo la ven quienes tienen relación con la persona.

---

## 3. Pasos para activarlo (en este orden)
1. En el SQL Editor de Supabase, ejecuta `supabase/v2/014_reencuentro.sql` y luego `supabase/v2/015_archivo_historico.sql`.
2. Ejecuta `analyze;` si acabas de hacer una importación grande (Supabase lo hace solo, pero tarda unos minutos y mientras tanto las consultas pesadas pueden ir lentas; `014` ya lo ejecuta al instalarse).
3. Archiva el respaldo (primero la simulación, que no escribe nada):
```
npm run migrar:archivar -- --respaldo migracion/datos/respaldo.sql
npm run migrar:archivar -- --respaldo migracion/datos/respaldo.sql --aplicar --si-estoy-seguro
```
4. Revisa en **Habilitación** que el archivo muestre las tablas y en **Reencuentro** que cada líder vea a su gente.
5. Guarda la copia completa de la base MySQL, fuera de la plataforma, antes de apagar el sistema antiguo.
