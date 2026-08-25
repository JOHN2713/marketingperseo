# 04 · Diseño de interfaz

## Punto de partida

Quien usa esto es un equipo de marketing de 3 a 6 personas que ejecuta el mismo proceso cada mes. Abre la app varias veces al día para responder una sola pregunta: **¿qué me toca hoy y qué se está atrasando?**

De ahí salen dos decisiones que atraviesan todo el diseño:

- La densidad importa más que el respiro. Un proceso tiene 24 pasos y hay que verlos casi todos sin scroll.
- Las fechas y los porcentajes son datos que se leen de reojo, no párrafos. Van en una tipografía monoespaciada para que las columnas se alineen y el ojo compare rápido.

---

## Elemento distintivo: la cinta de proceso

En vez de una barra de progreso genérica, el detalle de un proceso abre con una **cinta segmentada horizontal**: un segmento por paso, con el ancho proporcional a su duración en días y el color según su estado.

```
FASE 1        FASE 2         FASE 3      FASE 4     FASE 5    FASE 6   FASE 7
├──┬──┬─┬─┼────────┬──────┼───┬───┬─┬─┼─┬──┬───┼─────┬─┬─┬─┼─────┬─┬─┼─┬─┬───┬──┤
 ██ ██ █ █  ████████ ▓▓▓▓▓▓ ░░░ ░░░ ░ ░ ░ ░░ ░░░  ░░░░░ ░ ░ ░  ░░░░░ ░ ░ ░ ░ ░░░ ░░
 └ completado      └ en curso    └ pendiente
```

Es útil, no decorativo: en una sola línea muestra el orden real, dónde está el equipo, qué pasos pesan más en el cronograma y si hay un bloqueo en medio. Al pasar el mouse por un segmento aparece el título del paso; al hacer clic, la lista salta a ese paso.

La numeración `01 / 02 / 03` sí se usa en la lista de pasos, porque aquí el orden **es** información: el paso 8 depende del 7. En otro tipo de lista sería decoración; en un checklist secuencial es la columna más importante después del título.

Todo lo demás en la interfaz es deliberadamente sobrio para que la cinta sea lo único que llame la atención.

---

## Tokens

```css
/* assets/css/tokens.css */
:root {
  /* Superficies */
  --ink-900:  #14121C;   /* menú lateral, títulos */
  --ink-700:  #33303F;
  --ink-500:  #5B5766;   /* texto secundario */
  --ink-300:  #8E8A9B;   /* texto terciario, placeholders */
  --paper:    #F1F0F4;   /* fondo de la app */
  --surface:  #FFFFFF;   /* tarjetas, filas */
  --line:     #DEDCE5;   /* bordes de un pixel */

  /* Acción */
  --accent:      #5B21B6;
  --accent-hover:#4C1D95;
  --accent-soft: #EDE7FB;
  --focus:       #7C3AED;

  /* Estado del paso */
  --st-pendiente:  #9993A5;
  --st-en-curso:   #2563C9;
  --st-bloqueado:  #C2413A;
  --st-completado: #2F855A;
  --st-omitido:    #C6C2CE;

  /* Prioridad */
  --pr-baja:    #8E8A9B;
  --pr-media:   #2563C9;
  --pr-alta:    #D97706;
  --pr-urgente: #C2413A;

  /* Tipografía */
  --font-display: 'Bricolage Grotesque', system-ui, sans-serif;
  --font-body:    'Inter', system-ui, sans-serif;
  --font-data:    'JetBrains Mono', ui-monospace, monospace;

  --fs-xs:   0.75rem;    /* etiquetas, metadatos */
  --fs-sm:   0.8125rem;  /* datos en tabla */
  --fs-base: 0.9375rem;  /* cuerpo */
  --fs-lg:   1.125rem;
  --fs-xl:   1.5rem;
  --fs-2xl:  2.25rem;    /* el porcentaje grande */

  /* Espaciado — escala de 4 */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;

  --radius:    6px;
  --radius-lg: 10px;

  --shadow-sm: 0 1px 2px rgba(20,18,28,.06);
  --shadow-md: 0 4px 16px rgba(20,18,28,.10);
}
```

### Tipografía en uso

| Rol | Fuente | Dónde |
|---|---|---|
| Display | Bricolage Grotesque 600 | Nombre del proceso, títulos de sección, el porcentaje grande |
| Cuerpo | Inter 400 / 500 | Títulos de paso, descripciones, observaciones, botones |
| Datos | JetBrains Mono 400 | Fechas, numeración de pasos, porcentajes pequeños, contadores |

Las tres se cargan desde Google Fonts con `display=swap` y solo los pesos que se usan.

---

## Pantallas

### Login

```
┌────────────────────────────────────────────────────┐
│                                                    │
│              MKT PROCESS                           │
│              ─────────────────                     │
│              Procesos de marketing                 │
│              que no se olvidan                     │
│                                                    │
│              ┌──────────────────────┐              │
│              │ Correo               │              │
│              ├──────────────────────┤              │
│              │ Contraseña           │              │
│              └──────────────────────┘              │
│              [    Entrar           ]               │
│              Crear cuenta · Olvidé mi contraseña   │
└────────────────────────────────────────────────────┘
```

Centrado, sin imagen de fondo, sin ilustración. Es una pantalla que se ve una vez al día durante dos segundos.

### Shell

```
┌──────────┬─────────────────────────────────────────────────┐
│ MKT      │  Procesos                        [+ Nuevo]      │
│          │  ─────────────────────────────────────────────  │
│ ○ Inicio │  ┌───────────────────────────────────────────┐  │
│ ● Proce  │  │ Masterclass Octubre        en curso   62% │  │
│   sos ③  │  │ ████████████░░░░░░░  15 nov → 29 dic   ●2 │  │
│          │  ├───────────────────────────────────────────┤  │
│ ─────    │  │ Masterclass Noviembre    planificado    0% │  │
│ ADMIN    │  │ ░░░░░░░░░░░░░░░░░░░  01 dic → 14 ene      │  │
│ ○ Planti │  └───────────────────────────────────────────┘  │
│ ○ Usuari │                                                 │
│          │                                                 │
│ ──────   │                                                 │
│ Ana R.   │                                                 │
│ Salir    │                                                 │
└──────────┴─────────────────────────────────────────────────┘
```

Menú lateral de 240 px en `--ink-900`, contenido sobre `--paper`. El `③` es el contador de pasos vencidos. El `●2` en la tarjeta indica cuántos pasos de ese proceso están vencidos.

### Detalle del proceso

```
┌─────────────────────────────────────────────────────────────┐
│ ← Procesos                                                  │
│                                                             │
│ Masterclass Octubre                    ┌──────────────────┐ │
│ Plantilla: Masterclass                 │       62%        │ │
│ 15 nov 2026 → 29 dic 2026              │  15 de 24 pasos  │ │
│ [en curso ▾] [alta ▾]  🔗 Recurso      └──────────────────┘ │
│                                                             │
│ ├█████┼███┼██┼░░░┼░░░░┼░┼░░┼░░░░░┼░┼░░░┼░░┼░░░░┤            │ ← cinta
│                                                             │
│ Todos · Pendientes · Vencidos ③ · Mis pasos      [+ Paso]   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ⠿ ☑ 01  Definir tema, promesa y público      Estrategia │ │
│ │        15–16 nov          Ana R.        completado      │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ ⠿ ☐ 08  Montar la landing de registro        Web        │ │
│ │        02–03 dic ●vencido  Luis M.      en curso    ▾   │ │
│ │  ┌───────────────────────────────────────────────────┐  │ │
│ │  │ Observaciones                                     │  │ │
│ │  │ Falta el formulario en móvil. Diseño ya aprobado. │  │ │
│ │  └───────────────────────────────────────────────────┘  │ │
│ │   Inicio [02/12] Fin [03/12] Recordatorio [02/12 09:00] │ │
│ │   Prioridad [alta ▾]  Tipo [Web]  🔗 Link del recurso   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

Un solo paso expandido a la vez. Al abrir otro, el anterior se cierra.

---

## Componentes

### Fila de paso

```
[asa] [checkbox] [nº] [título] [tipo] [fechas] [responsable] [estado] [▾]
 24px   20px      32   flex-1   auto   auto      auto         auto    24px
```

Altura 44 px cerrada. El asa (`⠿`) aparece al pasar el mouse; en táctil está siempre visible.

Estados visuales de la fila:

| Situación | Tratamiento |
|---|---|
| Completado | Título en `--ink-300`, tachado suave, checkbox lleno en verde |
| Omitido | Fila al 50% de opacidad, título tachado |
| Bloqueado | Borde izquierdo de 3 px en `--st-bloqueado` |
| Vencido | Fecha en `--pr-urgente` con punto antes |
| Arrastrando | Sombra `--shadow-md`, rotación de 1°, el hueco marcado con línea punteada |

### Etiquetas de estado y prioridad

Pastilla de 20 px de alto, texto en `--fs-xs` mayúscula con `letter-spacing: .04em`, fondo al 12% del color del estado y texto al 100%. Sin bordes.

### Botones

| Variante | Uso |
|---|---|
| Primario | Fondo `--accent`, texto blanco. Uno por pantalla |
| Secundario | Borde `--line`, fondo `--surface` |
| Fantasma | Sin fondo ni borde, solo texto en `--ink-500` |
| Destructivo | Texto en `--pr-urgente`, fondo al 8% en hover |

Todos con `min-height: 36px` y foco visible: `outline: 2px solid var(--focus); outline-offset: 2px`.

### Modales

Solo tres: crear proceso, crear/editar paso de plantilla, y confirmar eliminación. Todo lo demás se edita en línea. Ancho máximo 480 px, cierre con `Esc` y clic fuera, foco atrapado dentro.

### Avisos (toasts)

Esquina inferior derecha, 4 segundos, apilables. Éxito en verde, error en rojo, ambos con el texto en `--ink-900` sobre fondo suave. El error no se cierra solo si la acción falló de forma que el usuario deba reintentar.

---

## Redacción de la interfaz

- Verbos en infinitivo para acciones: "Crear proceso", "Eliminar paso"
- El botón y el resultado usan la misma palabra: si dice "Guardar", el aviso dice "Guardado"
- Los errores explican qué pasó y qué hacer, no piden disculpas: "No se pudo guardar el nuevo orden. Se restauró el anterior." en lugar de "Lo sentimos, ocurrió un error"
- Los estados vacíos invitan a actuar: "Todavía no hay pasos en este proceso. Agrega el primero."
- Nada de "elemento", "registro" o "ítem". Son procesos, pasos, plantillas y usuarios

---

## Piso de calidad

- Responsive real hasta 360 px
- Foco de teclado visible en todo control interactivo
- Contraste mínimo 4.5:1 en texto, verificado en las pastillas de estado
- `prefers-reduced-motion: reduce` desactiva la animación de arrastre y las transiciones de la cinta
- El color nunca es el único portador de información: cada estado tiene también texto, y los vencidos tienen punto además de color
