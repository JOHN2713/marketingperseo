# 09 · Tareas, métricas y seguridad de sesión

Segunda etapa del app: además de los procesos, el equipo registra su trabajo diario como **tareas**, y el jefe de área ve un **informe por integrante**. También se endureció el acceso.

Script SQL: [`supabase/tasks.sql`](../supabase/tasks.sql). Se ejecuta después de los cuatro scripts originales y se puede volver a correr sin romper nada.

---

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Sesión | Se cierra tras **60 minutos sin actividad**, en todas las pestañas. El JWT dura 1 hora y se renueva solo mientras se usa la app |
| Registro | Solo correos **@perseo.ec**. Lo aplica un trigger en `auth.users`; el formulario solo avisa antes |
| Roles | `user` (integrante), `jefe` (jefe de área), `admin`. El admin tiene todo lo del jefe |
| Quién crea tareas | Todos. Un integrante solo se asigna a sí mismo; el jefe asigna a cualquiera |
| Tiempo | Automático al cambiar de estado y editable a mano |
| Estados | Pendiente → En curso → En revisión → Completado, más Bloqueado |
| Tipos | Catálogo que mantiene el jefe. Vienen sembrados Imagen, Video, Pauta, Blog y Web |
| Recursos | Varios links por tarea, cada uno con su etiqueta |

---

## Seguridad de sesión

**Inactividad.** [`session-guard.js`](../assets/js/session-guard.js) guarda la hora de la última actividad (clic, tecla, scroll, movimiento) en `localStorage`. Cada 30 segundos y al volver a la pestaña la compara con el límite:

- a los 55 minutos avisa con un mensaje;
- a los 60 cierra la sesión y lleva al login con el motivo.

Como el registro vive en `localStorage`, todas las pestañas lo comparten y sobrevive a cerrar el navegador: quien vuelve al día siguiente encuentra la sesión cerrada, aunque el refresh token de Supabase siga vigente.

**Límite del lado del servidor.** El control anterior corre en el navegador. Para que el servidor también lo aplique:

1. **Authentication → Sessions (o JWT Keys) → Access token expiry** = `3600` segundos. Es el valor por defecto; hay que confirmar que nadie lo cambió.
2. Si el proyecto está en plan Pro: **Authentication → Sessions → Inactivity timeout** = `1 hour`. Con eso Supabase también deja de renovar tokens de sesiones inactivas.

**Visor de contraseña.** Los tres campos de contraseña del login (entrar, crear cuenta y contraseña nueva) tienen el botón del ojo. La contraseña vuelve a ocultarse al enviar el formulario o al cambiar de pantalla.

**Dominio de registro.** El trigger `guard_email_domain` rechaza cualquier alta o cambio de correo fuera de `perseo.ec`. Para cambiar el dominio hay que tocarlo en dos lugares: la constante `v_dominio` del trigger y `ALLOWED_EMAIL_DOMAIN` en `assets/js/config.js`. Las cuentas que ya existían no se ven afectadas.

---

## Modelo de datos

```
task_types      id, name (único), sort_order, is_active
tasks           id, title, type_id → task_types, priority, status (task_status),
                due_date, started_at, finished_at, observations, created_by, created_at
task_assignees  task_id → tasks, profile_id → profiles          (PK compuesta)
task_resources  id, task_id → tasks, label, url (http/https), sort_order
```

- `task_status` es un enum nuevo: `pendiente, en_curso, en_revision, completado, bloqueado`.
- `user_role` gana el valor `jefe`. Como `ADD VALUE` no deja usar el valor en la misma transacción, todo el script compara `role::text`.

### Horas automáticas — trigger `set_task_times`

| Cambio de estado | Efecto |
|---|---|
| a En curso o En revisión, sin inicio | `started_at = now()` |
| a Completado, sin fin | `finished_at = now()` |
| a Completado sin haber pasado por En curso | el inicio **queda vacío**: inventarlo daría duraciones de cero que falsean el promedio. El Kanban avisa para que lo completen |
| de Completado a otro estado | se borra el fin, salvo que en la misma edición se haya escrito uno a mano |

Lo que el usuario corrige a mano no se sobrescribe: el trigger solo llena campos vacíos.

### RPC `save_task(p_id, p_data, p_assignees, p_resources)`

Crea o actualiza la tarea, sus responsables y sus links **en una sola transacción**. Es `security invoker`, así que RLS se aplica igual que si el usuario escribiera directo en las tablas. Pasar `null` en responsables o recursos los deja como están.

### Permisos (RLS)

| Acción | Quién |
|---|---|
| Ver tareas, tipos, responsables y links | Todo el equipo |
| Crear tarea | Cualquiera (queda como `created_by`) |
| Editar tarea y sus links | Jefe/admin, quien la creó o un responsable (`can_edit_task`) |
| Asignar o quitar responsables | Jefe/admin. Los demás solo a sí mismos y en tareas que crearon |
| Eliminar tarea | Jefe/admin o quien la creó |
| Gestionar tipos | Jefe/admin |
| Cambiar roles | Solo admin (trigger `guard_role_change`, sin cambios) |

---

## Pantalla Tareas (`#/tareas`)

- **Lista** o **Kanban**: el selector recuerda la última elección en ese navegador.
- Filtros: *Mis tareas*, búsqueda por tema, estado, responsable, prioridad y tipo.
- **Kanban**: arrastrar una tarjeta a otra columna cambia su estado. Las tarjetas que el usuario no puede editar no se arrastran. El orden dentro de cada columna es automático (prioridad y luego fecha límite) y no se guarda.
- **Formulario**: tema, tipo, prioridad, estado, fecha límite, responsables, inicio y fin de la actividad (con la duración calculada), links de recursos y observaciones.
- El jefe tiene el botón **Tipos de tarea** para agregar, renombrar o desactivar tipos. Un tipo desactivado deja de ofrecerse, pero las tareas que lo usan lo conservan.

---

## Pantalla Métricas (`#/metricas`, jefe y admin)

### Reglas de cálculo

- **Qué entra**: las tareas **creadas** dentro del rango de fechas que cumplen los filtros (responsable, estado, prioridad y tipo).
- **Varios responsables**: la tarea cuenta para cada uno en su fila; los totales del equipo la cuentan una vez.
- **Promedios**: tareas ÷ días del rango (por día), ÷ días/7 (por semana) y ÷ días/30,44 (por mes). Con el filtro de estado en *Completado*, se convierten en el ritmo de cierre.
- **Tiempo**: `fin − inicio` en horas de reloj (no descuenta noches ni fines de semana). Una tarea sin alguna de las dos horas no entra al promedio; la tarjeta muestra cuántas sí se midieron.

### Contenido

1. Cifras del equipo: tareas, completadas y avance, por día, por semana, por mes y tiempo promedio.
2. **Informe por integrante**: total, cantidad por estado, avance, promedios y tiempo promedio. Al hacer clic en un nombre se filtra a esa persona.
3. **Avance de tareas**: barra apilada por estado para cada integrante.
4. **Tiempo promedio**: por integrante o por tipo.
5. **Completadas por día** (en rangos de hasta 31 días) o **por semana**.
6. **Imprimir informe**: abre la impresión del navegador sin el menú ni los filtros, lista para guardar como PDF.

Rangos rápidos: 7 días, 30 días, este mes y 90 días. Por defecto: los últimos 30 días.

> Las métricas son una pantalla de jefe y admin, pero las tareas en sí las ve todo el equipo: el modelo sigue siendo de equipo compartido.

---

## Puesta en marcha

1. En el SQL Editor de Supabase, ejecutar [`supabase/tasks.sql`](../supabase/tasks.sql).
2. Revisar los ajustes de sesión de la sección *Límite del lado del servidor*.
3. Nombrar al jefe de área desde **Usuarios** (como admin) o por SQL:

   ```sql
   update public.profiles set role = 'jefe' where email = 'jefe@perseo.ec';
   ```

4. Compartir el enlace con el equipo para que cada integrante cree su cuenta con su correo @perseo.ec.
