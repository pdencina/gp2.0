# Sistema de diseño de Grupos Pequeños

Una sola manera de verse y de moverse en toda la plataforma. Todo vive en tres lugares: `tailwind.config.ts` (colores y sombras), `app/globals.css` (componentes y movimiento) y `components/` (piezas reutilizables).

## Para verlo
En desarrollo (`npm run dev`) abre `http://localhost:3000/diseno`: una galería con el menú, indicadores, avisos, botones, formularios, anillos de avance, la cuadrícula de 36 encuentros, gráficos, la lista de asistencia y los estados de carga y vacío. En producción esa ruta responde 404.

## Colores
| Uso | Color | Nota |
|---|---|---|
| Acción principal | `brand-orange` `#C2501A` | Texto blanco encima pasa el contraste AA (el naranja original `#F08A4B` no lo pasaba). El naranja claro (`brand-orange-400`) queda para ilustraciones |
| Marca y enlaces | `brand-teal` `#1E8082` | Sirve como texto sobre blanco y como fondo con texto blanco. La variante clara `brand-teal-400` es para detalles |
| Avance y éxito | `brand-green` `#2E8540` | Variante clara `brand-green-400` para barras y formas |
| Fondo | `brand-sand` `#F7F5F1` · tarjetas blancas | |
| Texto | `brand-ink` `#1F2430` | |

Cada color tiene escala 50 a 900 (`bg-brand-teal-50`, `text-brand-teal-800`…).

## Clases de componentes (`globals.css`)
- Contenedores: `card`, `card-hover` (se eleva al pasar el mouse), `empty` (estado vacío), `page`.
- Botones: `btn` + `btn-primary` · `btn-secondary` · `btn-outline` · `btn-ghost` · `btn-danger`; tamaños `btn-sm`, `btn-lg`.
- Formularios: `input`, `label`. Etiquetas: `chip` (+ colores). Enlaces: `link`. Filas de lista: `row`.
- Texto: `page-title`, `page-sub`, `section-title`, `eyebrow`.
- Avance: `progress` (barra animada). Carga: `skeleton` (brillo que recorre).

## Piezas (`components/`)
`Icon` (más de 40 íconos de trazo) · `ui.tsx`: `PageHeader`, `EmptyState`, `Callout` (avisos informativos, de atención, de éxito y de peligro), `Avatar` (iniciales con color estable por nombre), `ProgressRing`, `ProgressBar`, `Dot` · `CountUp` (cifras que cuentan) · `Flash`/`Notice` (mensajes de las acciones) · `Sidebar` (menú con indicador activo, panel deslizable en el celular y tarjeta de la persona) · `charts` (`Kpi` con número animado, `Card`, línea que se dibuja, columnas que suben, barras que crecen).

## Movimiento
Pensado para dar vida sin distraer:
- Cada página **entra** con un deslizamiento suave (`enter`); las listas y cuadrículas entran **escalonadas** (`stagger`).
- Las cifras de los indicadores **cuentan** hasta su valor; los anillos, las barras, la línea de asistencia y las columnas **se dibujan** al aparecer.
- Tarjetas que se elevan al pasar el mouse, botones que se hunden al pulsar, avisos que "saltan" al aparecer, menú del celular que se desliza.
- En el ingreso y la portada, formas que **flotan** muy despacio.
- Los esqueletos de carga (`app/(app)/loading.tsx`) reemplazan la pantalla en blanco mientras carga cualquier página del menú.
- **Reducir movimiento**: si la persona lo pide en su sistema, todo el movimiento se apaga.

## Accesibilidad
Contraste AA en botones y enlaces, foco visible en teal, íconos decorativos ocultos a lectores de pantalla, barras y anillos con su texto alternativo, zonas táctiles de al menos 44 px en la lista de asistencia.

## Fuente
Inter, cargada con `next/font` (se descarga al compilar y se sirve desde el propio sitio).

## Logo animado
El logo de Grupos Pequeños (tres personajes que se reúnen: la "g" naranja, la "p" turquesa y el círculo verde) vive como vector, no como imagen, para poder animarlo y verse nítido en cualquier tamaño.

- **Originales** (los que entregó la iglesia): `public/brand/` (wordmark oscuro, wordmark crema, isotipo y versiones blancas). Se conservan tal cual.
- **Vector**: `lib/brand-paths.ts` (generado por trazado de los originales; no se edita a mano) y `components/BrandLogo.tsx`.
- **Variantes**: `variant="mark"` (solo los personajes), `"stacked"` (con el nombre debajo) y `"horizontal"` (para menú y barras). `tone="light"` usa el nombre en crema para fondos oscuros.
- **Con la insignia "2.0"**: el componente `Logo` (menú, ingreso, páginas de error) agrega la insignia; en el diploma y en la verificación pública va sin ella.

Qué hace (`anim`):
| Valor | Comportamiento |
|---|---|
| `intro` | Los tres llegan desde lados distintos y se juntan; después aparecen las caras |
| `idle` | Flotan con ritmos propios y parpadean de vez en cuando |
| `loading` | Laten en cadena (pantallas de carga) |
| `none` | Quieto |

Además: al pasar el mouse **se acercan como en un abrazo** y la sonrisa se ensancha; en el ingreso y en el 404 (`LogoPlay`) **los ojos siguen al puntero** y, al tocarlos, **saltan**. En el 404 y en la pantalla de error la expresión es triste (`mood="sad"`). Todo se apaga con "reducir movimiento".

Otros usos de la marca: favicon (`app/icon.svg`), ícono para iOS (`app/apple-icon.png`) e imagen al compartir el enlace (`app/opengraph-image.png`). Para ver el original junto al vectorizado: `/diseno/logo` (solo en desarrollo).
