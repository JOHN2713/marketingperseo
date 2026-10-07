# 10 · Áreas, calendario de eventos, Inicio y auditoría

Tercera etapa. Script SQL: [`supabase/events-audit.sql`](../supabase/events-audit.sql). Se ejecuta después de `tasks.sql` y se puede volver a correr sin romper nada.

---

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Áreas | Un solo catálogo para el área que solicita una tarea y para las áreas responsables de un evento. Lo mantiene el jefe |
| Evento de una Masterclass | Se crea junto con el proceso. La fecha y hora se piden al crear; si se dejan vacías, queda de día completo en la fecha de fin del proceso |
| Qué plantillas crean evento | Las que tengan activada la opción en su pantalla. Masterclass la trae activada |
| Quién crea eventos | Todos. Nacen **Por aprobación** |
| Quién confirma o rechaza | Solo el jefe de área o el admin |
| Inicio | Selector *Mis tareas / Equipo*: el jefe entra viendo al equipo; el resto, lo suyo |
| Auditoría | Solo cambios en los datos (altas, ediciones y bajas). No registra inicios de sesión |

---

## Áreas

Tabla `areas (id, name, sort_order, is_active)`. Vienen sembradas Marketing, Comercial, Operaciones, Post Venta, Socio Perseo y Otros.

- **En tareas**: campo *Área que solicita* (`tasks.area_id`), filtro por área en Tareas y en Métricas, y agrupación por área en el gráfico de tiempo promedio.
- **En eventos**: una o varias áreas responsables (`event_areas`).
- El jefe las gestiona con el botón **Áreas** de Tareas o de Calendario: agregar, renombrar y desactivar. Un área inactiva deja de ofrecerse, pero lo que ya la usa la conserva.

---

## Calendario de eventos (`#/calendario`)

### Modelo

```
events       id, title, description, starts_at, ends_at, all_day,
             status (por_aprobacion | confirmado | rechazado),
             modality (presencial | virtual), location,
             process_id → processes (único, borrado en cascada), created_by
event_areas  event_id → events, area_id → areas
```

### Permisos

| Acción | Quién |
|---|---|
| Ver eventos | Todo el equipo |
| Crear | Cualquiera. El trigger `guard_event_status` fuerza *Por aprobación* si no es jefe |
| Editar datos o eliminar | Jefe/admin o quien lo creó |
| Cambiar el estado | Solo jefe/admin |

### Conexión con los procesos

- La RPC `create_process_with_event` reemplaza a `create_process_from_template` en el formulario *Crear proceso*: clona la plantilla y, si esta tiene `creates_event`, inserta el evento con el nombre del proceso, tipo Virtual y Marketing como responsable. Todo en una transacción.
- Al ejecutar el script por primera vez, los procesos de Masterclass que ya existían reciben su evento (día completo en su fecha de fin).
- El evento queda enlazado: desde su ficha se abre el proceso. Si se **elimina el proceso**, su evento se elimina con él. Eliminar el evento no toca el proceso.
- Después de creado, el evento es independiente: cambiar el nombre o las fechas del proceso no lo mueve.

### Pantalla

- Vista **Mes** (cuadrícula de lunes a domingo) y **Agenda** (lista por día). En pantallas angostas se entra por la agenda.
- Clic en un día crea un evento en esa fecha; clic en un evento abre su ficha.
- Un evento de varios días aparece en cada día que ocupa.
- Filtros por estado, tipo y área responsable.
- El estado se distingue por algo más que el color: borde sólido (confirmado), punteado (por aprobación) o título tachado (rechazado).

---

## Inicio

Orden de los bloques:

1. Cifras: tareas en curso, tareas que requieren atención, procesos en curso y pasos de proceso vencidos.
2. **Tareas en curso**.
3. **Tareas que requieren atención**: vencidas, que vencen hoy, bloqueadas y en revisión.
4. **Actividad reciente**: tareas y pasos de proceso completados, mezclados por fecha.
5. **Procesos activos** y **pasos de proceso que requieren atención**.
6. **Próximos eventos**: desde hoy, sin los rechazados.

El selector *Mis tareas / Equipo* afecta solo a los bloques 1 a 3 y recuerda la elección en ese navegador. Cada bloque carga por separado: si uno falla, los demás se muestran.

---

## Auditoría (`#/auditoria`, solo admin)

### Qué se registra

Tabla `audit_log (id, at, actor_id, action, table_name, record_id, label, context, changes)`, llenada por el trigger `audit_row` en: tareas (con sus responsables y links), tipos de tarea, áreas, eventos (con sus áreas), procesos, pasos, plantillas, pasos de plantilla y usuarios.

- **Edición**: solo los campos que cambiaron, con el valor anterior y el nuevo.
- **Alta y baja**: la fila completa.
- `label` guarda el nombre del registro en ese momento, así se entiende aunque después se borre.

### Qué no se registra, a propósito

- Campos que cambian solos: `updated_at`, `sort_order`, `progress`, `completed_at`. Reordenar pasos o recalcular el avance no genera registros.
- Los 24 pasos que nacen al clonar una plantilla: queda un solo registro, el del proceso.
- Los hijos que se borran en cascada con su padre.
- Guardar una tarea sin cambiar nada.
- Inicios y cierres de sesión.

### Garantías

- Solo el admin lee el registro (RLS). El jefe y los integrantes reciben cero filas.
- No hay políticas de inserción, edición ni borrado: **nadie con sesión puede alterarlo**, tampoco el admin. Solo se puede tocar desde el SQL Editor de Supabase.
- `actor_id` no es llave foránea: el registro sobrevive si se elimina al usuario (se muestra "Usuario eliminado"). Los cambios hechos desde el SQL Editor aparecen como "Sistema".
- La auditoría empieza el día en que se ejecuta el script; no reconstruye el pasado.
- No hay limpieza automática. Para un equipo de este tamaño son pocos miles de filas al año.

### Pantalla

Filtros por fechas (últimos 7 días por defecto), usuario, módulo, acción y nombre del registro. Clic en una fila muestra el detalle campo por campo. Carga de a 100 registros y exporta a CSV lo que esté cargado.

---

## Puesta en marcha

1. En el SQL Editor de Supabase, ejecutar [`supabase/events-audit.sql`](../supabase/events-audit.sql) (después de `tasks.sql`).
2. Revisar en **Calendario** los eventos creados para las Masterclass existentes y ajustarles fecha y hora.
3. Si otra plantilla debe crear evento, activarlo en **Plantillas → (la plantilla)**.
