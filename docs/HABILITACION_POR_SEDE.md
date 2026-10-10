# Habilitación de GP 2.0, sede por sede

La plataforma ya tiene todos los datos migrados. Esta guía es el orden recomendado para ponerla en uso, primero en una sede piloto y después en las demás. Nada de esto borra información.

## Una vez, para toda la organización (administrador)

1. **Aplicar todas las migraciones** en el SQL Editor, en orden: `006` → `011` (cada una una sola vez; están en `supabase/v2/`). Hacer un respaldo antes.
2. **Comprobar seguridad**: `node scripts/exposicion-publica.js https://gp2-0.vercel.app` y `npm run smoke -- https://gp2-0.vercel.app`. Los dos deben terminar sin fallas.
3. **Habilitación → Reconciliación**: debe decir "Todo cuadra". Si hay un "Problema" en *Modelo*, no habilitar sedes hasta entenderlo.
4. **Clasificar el catálogo** (Currículums → Clasificar): confirmar las ofertas, ocultar las internas y revisar categorías.
5. **AR Hombres** (Currículums → HOMBRES → versión 1): asignar el año de cada módulo; definir el mínimo por año; validar o rechazar los créditos de la plataforma anterior; sincronizar el año de los grupos; recalcular el año de cada persona.
6. **Temporada anual**: crear o abrir la temporada del año y definir su calendario de 36 semanas con feriados (Temporadas).
7. **Sedes**: designar el pastor de cada sede (Certificados → Pastores designados por sede).
8. **Material**: cargar en la Biblioteca el material original, ubicarlo en módulos y unidades, armar el plan de 36 encuentros y llevar la versión por el flujo hasta publicarla (Currículums → Revisión).

## Para cada sede

| Paso | Quién | Dónde |
|---|---|---|
| Asignar la sede a cada uno de sus grupos | administrador / coordinador | Detalle del grupo → Sede |
| Revisar que cada grupo tenga líder (y, de preferencia, respaldo) | coordinador | Detalle del grupo → Responsables |
| Planificar el calendario de cada grupo | líder o coordinador | Grupo → Calendario → Planificar |
| Pedir a las personas que indiquen su sede | líderes | Perfil → Mi sede |
| Mirar que la sede aparezca "Lista para habilitarse" | administrador | Habilitación → Sedes |
| Pasar la sede a **Piloto** y luego a **Habilitada** | administrador | Habilitación → Sedes → Etapa |

### Qué significa "Lista para habilitarse"
La sede tiene grupos activos, **todos con líder y con calendario**, y **al menos un pastor designado**. Habilitar con pendientes es posible (hay una casilla de confirmación) y queda registrado, pero conviene resolverlos antes.

## Sede piloto: cómo probar
1. Elegir una sede pequeña con grupos presenciales y online.
2. Con 2 o 3 líderes y 5 o 6 participantes, recorrer: inscribirse desde el catálogo, elegir y cambiar de grupo, pasar lista de una sesión (incluida una dirigida por el respaldo), acreditar unidades, pausar y volver, pedir una recuperación.
3. Anotar lo que confunda o falte. Con eso se ajusta antes de abrir las demás sedes.
4. Repetir **Reconciliación** al final de la prueba.

## Fecha de corte con la plataforma anterior (decisión pendiente)
Los datos se migraron el 9 de octubre de 2026. Lo que se registre después en la plataforma anterior no llega aquí solo.

**Cuidado:** la importación completa (`npm run migrar`) **vuelve a escribir el estado de todo lo importado** con lo que diga la plataforma anterior (por ejemplo, el estado de una inscripción o de un grupo). Es segura mientras nadie haya usado GP 2.0, pero **no debe volver a ejecutarse después de que una sede empiece el piloto**: pisaría lo hecho aquí con lo importado.

Por eso hay que elegir una fecha de corte:
1. Una **importación final** justo antes de que arranque la primera sede piloto.
2. Desde ahí, las sedes que no son piloto siguen en la plataforma anterior, y **sus registros nuevos no llegarán** a GP 2.0 hasta que exista una importación "solo lo nuevo" (que agrega lo que falta y no modifica nada de lo ya cargado). Todavía no está construida: se puede hacer cuando se defina el calendario de habilitación.
3. Al cerrar la plataforma anterior de una sede, se hace esa importación "solo lo nuevo" y se revisa la **Reconciliación**.

## Si algo sale mal
- Una sede mal habilitada se vuelve a **Preparación** (no cambia ningún dato).
- Las migraciones solo agregan; no hay nada que deshacer en datos. Si una pantalla falla, la plataforma anterior sigue funcionando en paralelo.
- Cualquier cambio de estado, certificado o crédito queda en la auditoría (tabla `audit_log` en Supabase).
