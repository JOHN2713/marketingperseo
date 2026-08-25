# 02 · Modelo de datos

Los scripts ejecutables están en [`supabase/`](../supabase/). Este documento explica el porqué de cada pieza.

---

## Diagrama

```
auth.users
    │ 1:1
    ▼
profiles ─────────────────┐
 (role: admin|user)       │ owner_id
                          │
process_templates         │
    │ 1:N                 │
    ▼                     │
template_steps            │
                          │
       clonar ──────────► processes ◄──── template_id
                              │ 1:N
                              ▼
                         process_steps
                          (observations, fechas,
                           recordatorio, estado,
                           prioridad, tipo, link)
```

---

## Enums

Se usan enums de Postgres, no `text` con `check`. Ventaja: el error de valor inválido llega desde la base y no depende de que el frontend valide bien.

```sql
user_role       → admin | user
process_status  → planificado | en_curso | pausado | completado | cancelado
step_status     → pendiente | en_curso | bloqueado | completado | omitido
priority_level  → baja | media | alta | urgente
```

`step_type` **no** es enum: es `text`. Los tipos de actividad (Contenido, Diseño, Ads…) cambian según el proceso y agregar valores a un enum requiere una migración. Se validan en el frontend con una lista de sugerencias, pero se acepta texto libre.

---

## Tablas

### `profiles`

Espejo de `auth.users` con los datos que la app necesita leer. Se crea automáticamente con un trigger en `auth.users`.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | FK a `auth.users`, cascade on delete |
| `email` | text | |
| `full_name` | text | Del metadata del registro, o la parte antes del `@` |
| `role` | user_role | Default `user`. Solo un admin puede cambiarlo |
| `created_at` | timestamptz | |

> El primer admin se crea a mano con un `update` desde el SQL editor de Supabase. No hay forma de auto-promoverse desde la app.

### `process_templates`

El catálogo de procesos disponibles. "Masterclass" es una fila aquí.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | Único |
| `description` | text | |
| `icon` | text | Emoji o nombre de ícono |
| `color` | text | Hex, para distinguirla visualmente |
| `resource_url` | text | Carpeta o documento general del proceso |
| `is_active` | boolean | Las inactivas no aparecen al crear un proceso nuevo |
| `created_by` | uuid | FK a `profiles` |

### `template_steps`

Los pasos del checklist maestro.

| Campo | Tipo | Nota |
|---|---|---|
| `template_id` | uuid | FK, cascade |
| `title` | text | |
| `description` | text | Qué implica el paso |
| `sort_order` | int | Orden dentro de la plantilla |
| `type` | text | Contenido, Diseño, Ads… |
| `priority` | priority_level | Prioridad sugerida |
| `default_duration_days` | int | Días que suele tomar. Sirve para calcular fechas al clonar |
| `resource_url` | text | Link específico del paso |

> **Por qué `sort_order` y no `position`:** `position` es una función SQL estándar. Usarla como nombre de columna funciona pero obliga a citarla en varios contextos. `sort_order` evita el problema.

### `processes`

Una ejecución concreta. "Masterclass Octubre 2026".

| Campo | Tipo | Nota |
|---|---|---|
| `template_id` | uuid | Nullable — se puede crear un proceso desde cero |
| `name` | text | |
| `description` | text | |
| `owner_id` | uuid | Quién lo creó. Puede eliminarlo |
| `status` | process_status | |
| `priority` | priority_level | |
| `start_date` / `end_date` | date | `end_date` se recalcula desde los pasos |
| `resource_url` | text | |
| `progress` | numeric(5,2) | **Calculado por trigger. Nunca se escribe desde el frontend** |
| `progress_override` | numeric(5,2) | Nullable. Si tiene valor, la UI lo muestra en lugar de `progress` |

`progress_override` existe para el caso real de "el proceso está al 40% de pasos pero al 70% de trabajo". Es una anotación humana, no reemplaza el cálculo.

### `process_steps`

El corazón del app. Aquí está todo lo que el usuario edita día a día.

| Campo | Tipo | Nota |
|---|---|---|
| `process_id` | uuid | FK, cascade |
| `title` | text | |
| `description` | text | |
| `sort_order` | int | Reordenable con drag & drop |
| `observations` | text | Notas del ejecutor. Campo libre, sin límite |
| `status` | step_status | Default `pendiente` |
| `priority` | priority_level | Default `media` |
| `type` | text | |
| `start_date` / `end_date` | date | |
| `reminder_at` | timestamptz | Fecha y hora del recordatorio visual |
| `resource_url` | text | |
| `assignee_id` | uuid | Nullable. FK a `profiles` |
| `completed_at` | timestamptz | Lo pone un trigger al pasar a `completado` |

---

## Triggers

### `handle_new_user`

En `auth.users` after insert. Crea la fila en `profiles`. Sin esto, un usuario registrado no existiría para la app.

### `set_updated_at`

En todas las tablas con `updated_at`. Before update.

### `process_steps_progress`

After insert / update of status / delete en `process_steps`. Llama a `recalc_process_progress(process_id)`, que hace:

```
progress = pasos_completados / pasos_no_omitidos * 100
```

Los pasos con estado `omitido` salen del denominador. Un proceso donde omites 4 de 24 pasos y completas los 20 restantes está al 100%, no al 83%.

Si no queda ningún paso contable, el progreso es 0.

### `set_step_completed_at`

Before update en `process_steps`. Si `status` pasa a `completado` y `completed_at` está vacío, lo llena con `now()`. Si sale de `completado`, lo limpia.

---

## Funciones RPC

### `create_process_from_template(template_id, name, start_date)`

Clona la plantilla en un proceso nuevo:

1. Crea la fila en `processes` heredando descripción y `resource_url` de la plantilla
2. Recorre `template_steps` en orden y crea un `process_step` por cada uno
3. Calcula fechas en cascada: el paso 1 arranca en `start_date`, el paso 2 arranca cuando termina el 1, y así
4. Ajusta `end_date` del proceso al máximo `end_date` de sus pasos
5. Recalcula el progreso

Todo en una transacción. Si algo falla, no queda un proceso a medias.

> Las fechas calculadas son un punto de partida, no una imposición. El usuario las mueve después.

### `reorder_process_steps(process_id, ordered_ids[])`

Recibe el array completo de IDs en su nuevo orden y reasigna `sort_order` de 1 a N en una sola sentencia.

Alternativa descartada: actualizar solo el paso movido con una posición fraccionaria. Es más eficiente pero acumula errores de precisión y complica la lógica. Con checklists de 20–40 pasos, reescribir todo es instantáneo.

La misma función existe para plantillas: `reorder_template_steps(template_id, ordered_ids[])`.

### `insert_process_step(process_id, title, after_order)`

Crea un paso. Con `after_order` nulo lo pone al final; con valor, corre en uno el `sort_order` de los siguientes y deja el hueco. Va en Postgres y no en JavaScript porque dos personas insertando a la vez desde dos navegadores terminarían con dos pasos en el mismo `sort_order`.

`insert_template_step(template_id, title)` hace lo propio en la plantilla, siempre al final.

### `duplicate_process_step(step_id)`

Copia el paso justo debajo del original, con todo excepto estado, observaciones y `completed_at`. Corre los siguientes para hacerle sitio.

### `duplicate_template(template_id)`

Copia la plantilla y todos sus pasos. Como `name` es único, busca el primer sufijo libre (`(copia)`, `(copia 2)`…). La copia nace con `is_active = false` para que el admin la revise antes de que aparezca al crear procesos.

---

## Políticas RLS

Modelo: **equipo compartido**. Todos los autenticados ven y editan los procesos. Las plantillas son territorio del admin.

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | Autenticados | Trigger | Propio, o admin | Admin |
| `process_templates` | Autenticados | Admin | Admin | Admin |
| `template_steps` | Autenticados | Admin | Admin | Admin |
| `processes` | Autenticados | Autenticados (`owner_id = auth.uid()`) | Autenticados | Owner o admin |
| `process_steps` | Autenticados | Autenticados | Autenticados | Autenticados |

Dos decisiones que vale la pena hacer explícitas:

**Eliminar un proceso es más restrictivo que editarlo.** Borrar un proceso arrastra sus 24 pasos con sus observaciones. Editar es reversible; borrar no. Por eso solo el dueño o un admin pueden hacerlo.

**Cambiar el rol de un usuario solo lo puede hacer un admin.** La política de update en `profiles` permite que cualquiera edite su propio `full_name`, pero hay un trigger que bloquea el cambio de `role` si quien lo hace no es admin. Sin ese trigger, un usuario podría promoverse a sí mismo editando su propia fila.

### Función auxiliar

```sql
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.profiles where id = auth.uid() and role = 'admin'
); $$;
```

Es `security definer` para que pueda leer `profiles` sin quedar atrapada en la propia política RLS de `profiles`. `search_path` fijo evita que se pueda secuestrar con un esquema falso.

---

## Índices

```sql
create index on process_steps (process_id, sort_order);
create index on process_steps (status);
create index on process_steps (reminder_at) where reminder_at is not null;
create index on process_steps (end_date) where end_date is not null;
create index on processes (status);
create index on template_steps (template_id, sort_order);
```

Los índices parciales de `reminder_at` y `end_date` sirven a las dos queries del dashboard: recordatorios activos y pasos vencidos. La mayoría de filas tiene esos campos en null, así que el índice queda chico.
