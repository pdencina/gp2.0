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
| Asignar la sede a sus grupos y a sus personas, por criterios y no uno por uno | administrador | Habilitación → Asignar sedes por lote |
| Ajustar la sede o la zona horaria de un grupo en particular | administrador / coordinador | Detalle del grupo |
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

## Fecha de corte con la plataforma anterior
Los datos se migraron el 9 de octubre de 2026. Lo que se registre después en la plataforma anterior no llega aquí solo.

**Cuidado:** la importación completa (`npm run migrar`) vuelve a escribir el estado de todo lo importado. Es segura mientras nadie haya usado GP 2.0, pero **no debe ejecutarse después de que una sede empiece el piloto**.

Para eso existe la importación **solo lo nuevo** (`012_importar_solo_nuevo.sql`, `npm run migrar:solo-nuevo`): agrega lo que falta y no modifica nada de lo ya cargado (detalle en `migracion/LEEME.md`). El plan recomendado:
1. Una **importación completa final** justo antes de que arranque la primera sede piloto.
2. Desde ahí, para traer lo que las sedes que aún usan la plataforma anterior vayan registrando: **solo lo nuevo**, con la frecuencia que se acuerde (por ejemplo, semanal).
3. Al cerrar la plataforma anterior de una sede: una última importación solo lo nuevo y una revisión de **Reconciliación**.

## Si algo sale mal
- Una sede mal habilitada se vuelve a **Preparación** (no cambia ningún dato).
- Las migraciones solo agregan; no hay nada que deshacer en datos. Si una pantalla falla, la plataforma anterior sigue funcionando en paralelo.
- Cualquier cambio de estado, certificado o crédito queda en la auditoría (tabla `audit_log` en Supabase).
