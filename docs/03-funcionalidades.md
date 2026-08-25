# 03 · Funcionalidades

---

## F1 · Autenticación

**Registro** con nombre completo, correo y contraseña (mínimo 8 caracteres). Al confirmar, Supabase crea el usuario y el trigger crea el perfil con rol `user`.

**Inicio de sesión** con correo y contraseña. La sesión se guarda en `localStorage` y `supabase-js` la refresca sola.

**Guardia de sesión**: `app.html` verifica `getSession()` antes de renderizar. Sin sesión, redirige a `index.html`.

**Recuperación de contraseña** vía `resetPasswordForEmail`. La plantilla del correo se edita en Supabase → Authentication → Email Templates.

En desarrollo conviene desactivar la confirmación por correo (Authentication → Providers → Email → *Confirm email*). En producción se deja activada.

---

## F2 · Roles

| Puede | Usuario | Admin |
|---|---|---|
| Ver todos los procesos | Sí | Sí |
| Crear procesos desde plantilla | Sí | Sí |
| Editar cualquier proceso y sus pasos | Sí | Sí |
| Eliminar un proceso | Solo los propios | Cualquiera |
| Crear y editar plantillas | No | Sí |
| Ver y cambiar roles de usuarios | No | Sí |

El menú lateral oculta las secciones de admin para los usuarios normales. Si alguien fuerza la URL, la vista se carga vacía y Postgres rechaza cualquier escritura.

---

## F3 · Plantillas (admin)

CRUD completo sobre `process_templates` y `template_steps`.

- Crear plantilla: nombre, descripción, ícono, color, link de recurso general
- Agregar, editar y eliminar pasos
- Reordenar pasos arrastrando
- Duplicar una plantilla completa (crea una copia con sufijo "(copia)")
- Desactivar una plantilla: deja de aparecer al crear procesos nuevos, pero los procesos existentes que la usaron siguen funcionando

Cada paso de plantilla define: título, descripción, tipo, prioridad sugerida, duración estimada en días y link de recurso.

**Editar una plantilla no afecta a los procesos ya creados.** Son copias independientes. Esto es intencional: si cambias el checklist a mitad de una ejecución en curso, el equipo pierde el hilo.

---

## F4 · Procesos

### Crear

Dos caminos:

1. **Desde plantilla** — se elige la plantilla, se pone nombre y fecha de inicio. La RPC `create_process_from_template` clona los pasos y calcula las fechas en cascada.
2. **En blanco** — proceso vacío al que se le agregan pasos a mano.

Las fechas calculadas son secuenciales: cada paso arranca cuando termina el anterior. En la vida real muchos pasos van en paralelo, así que el resultado es un cronograma conservador que el usuario comprime editando fechas.

### Listar

Tabla con filtros por estado, prioridad, plantilla y responsable, más buscador por nombre. Orden por defecto: los `en_curso` primero, luego por fecha de fin más cercana.

Cada fila muestra nombre, plantilla, estado, prioridad, rango de fechas, barra de avance y cantidad de pasos vencidos.

### Editar

Nombre, descripción, estado, prioridad, fechas, link de recurso y `progress_override`.

### Eliminar

Solo el dueño o un admin. Confirmación escribiendo el nombre del proceso, porque arrastra todos los pasos y sus observaciones.

---

## F5 · Pasos del checklist

El detalle de un proceso es una lista de pasos. Cada uno se puede expandir para editar todos sus campos.

### Campos editables

| Campo | Control | Nota |
|---|---|---|
| Título | Texto | |
| Descripción | Área de texto | Qué implica el paso |
| Observaciones | Área de texto | Notas del ejecutor. Se guarda con debounce de 800 ms |
| Estado | Selector | pendiente, en curso, bloqueado, completado, omitido |
| Prioridad | Selector | baja, media, alta, urgente |
| Tipo | Texto con sugerencias | Lista de tipos ya usados en el proceso |
| Fecha de inicio | Fecha | |
| Fecha de fin | Fecha | No puede ser anterior al inicio |
| Recordatorio | Fecha y hora | Opcional |
| Responsable | Selector | Cualquier usuario registrado |
| Link del recurso | URL | Se valida que empiece con `http` |

### Marcar como completado

Un checkbox al inicio de la fila. Cambia el estado a `completado`, dispara el trigger de progreso y llena `completed_at`. Desmarcarlo lo devuelve a `pendiente` y limpia la fecha.

### Agregar, duplicar y eliminar

- **Agregar** al final, o entre dos pasos con el botón `+` que aparece al pasar el mouse por el separador
- **Duplicar** copia todo excepto estado, observaciones y `completed_at`
- **Eliminar** con confirmación

### Reordenar (drag & drop)

Con SortableJS sobre el contenedor de la lista.

```js
// process-detail.view.js
Sortable.create(listEl, {
  handle: '.step__grip',
  animation: 150,
  ghostClass: 'step--ghost',
  onEnd: async () => {
    const ids = [...listEl.querySelectorAll('[data-step-id]')]
      .map(el => el.dataset.stepId);
    const { error } = await stepsService.reorder(processId, ids);
    if (error) {
      ui.toast.error('No se pudo guardar el nuevo orden. Se restauró el anterior.');
      await render();          // vuelve a leer de la base
    }
  }
});
```

Detalles que importan:

- El asa de arrastre (`.step__grip`) es un elemento propio, no toda la fila. Si toda la fila arrastra, editar texto se vuelve incómodo.
- El reordenamiento visual es inmediato; la persistencia va después. Si la llamada falla, se vuelve a leer desde la base en vez de intentar deshacer a mano.
- En móvil se agrega `delay: 200` y `delayOnTouchOnly: true` para no bloquear el scroll.
- El mismo patrón aplica al editor de plantillas con `reorder_template_steps`.

---

## F6 · Porcentaje de avance

Se calcula en la base:

```
avance = pasos_completados / pasos_no_omitidos × 100
```

Se muestra en tres lugares: la barra en la lista de procesos, el número grande en el detalle, y la cinta de proceso.

Si `progress_override` tiene valor, la UI muestra ese número con una marca de "ajustado manualmente" y el valor calculado en pequeño al lado. Sirve para el caso de "vamos por el paso 8 de 24 pero ese paso es el 60% del trabajo".

---

## F7 · Recordatorios y vencimientos

Solo visuales. No se envían correos.

La vista `v_steps_attention` devuelve los pasos que necesitan atención, con una bandera:

| Bandera | Condición | Presentación |
|---|---|---|
| `vencido` | `end_date < hoy` | Punto rojo, fecha en rojo |
| `vence_hoy` | `end_date = hoy` | Punto ámbar, etiqueta "Vence hoy" |
| `recordatorio` | `reminder_at <= ahora` | Ícono de campana activa |

Se excluyen pasos completados u omitidos, y procesos completados o cancelados.

Dónde aparece:

- **Contador en el menú lateral** junto a "Procesos", con el total de pasos vencidos
- **Panel "Requiere atención"** en el dashboard, ordenado por fecha más vencida primero
- **En la fila del paso**, con el punto de color
- **En la lista de procesos**, con el conteo de vencidos por proceso

El conteo se refresca al cargar cada vista y cada 5 minutos con un intervalo. No hay websockets en v1.

---

## F8 · Dashboard

Cuatro bloques:

1. **Números del momento** — procesos en curso, pasos vencidos, pasos que vencen hoy, avance promedio de los procesos activos
2. **Requiere atención** — los pasos con bandera, con enlace directo al paso dentro de su proceso
3. **Procesos activos** — tarjetas con nombre, cinta de proceso y avance
4. **Actividad reciente** — últimos 10 pasos completados, con quién y cuándo

---

## F9 · Usuarios (admin)

Lista de todos los perfiles con correo, nombre, rol y fecha de registro. El admin puede cambiar el rol con un selector.

Un admin no puede quitarse a sí mismo el rol de admin si es el único que queda. La validación va en el frontend y también como comprobación antes de guardar; si se salta, el sistema quedaría sin administrador.

No hay creación de usuarios desde el panel: la gente se registra sola y el admin la promueve.

---

## F10 · Comportamiento general

**Guardado de campos de texto**: debounce de 800 ms, con indicador "Guardando…" → "Guardado" junto al campo. Sin botones de guardar por campo.

**Guardado de selectores y fechas**: inmediato al cambiar.

**Estados vacíos**: cada lista vacía explica qué falta y ofrece la acción. "Todavía no hay procesos. Crea el primero desde una plantilla." con el botón al lado.

**Confirmaciones**: solo para acciones destructivas. Eliminar un paso pide confirmación simple; eliminar un proceso pide escribir el nombre.

**Responsive**: a partir de 768 px el menú lateral se colapsa en un botón. La lista de pasos pasa de tabla a tarjetas apiladas.

**Accesibilidad**: foco visible en todos los controles, la lista de pasos se puede reordenar también con teclado (`Ctrl` + flechas sobre el asa), y `prefers-reduced-motion` desactiva las animaciones de arrastre.
