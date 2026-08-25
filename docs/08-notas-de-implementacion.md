# 08 · Notas de implementación

Lo que cambió entre la documentación de diseño y el código que quedó en el repositorio, y por qué.

---

## Correcciones a los scripts SQL

Cuatro cosas de los scripts originales habrían fallado al ejecutarlos. Están corregidas en `supabase/`.

### 1 · `set_step_completed_at` abortaba al insertar un paso

El trigger era `before insert or update of status` y su cuerpo leía `coalesce(old.status, 'pendiente')`. En un trigger de `INSERT`, `OLD` no está asignado, y PL/pgSQL no devuelve null al leerlo: aborta con `record "old" is not assigned yet`.

Como todo paso nace por un `insert` —el clonado de la plantilla, el botón `+ Paso`, el duplicado—, **ningún paso se habría podido crear**. Ahora la función bifurca por `TG_OP` y solo lee `OLD` en la rama de `UPDATE`.

### 2 · `guard_role_change` bloqueaba la creación del primer admin

El trigger levantaba una excepción si quien cambia un rol no es admin. Pero en el SQL Editor de Supabase `auth.uid()` es null, así que la comprobación fallaba también ahí, y el `update public.profiles set role = 'admin'` del arranque —la única forma documentada de crear el primer administrador— quedaba bloqueado. Sin admin no hay quien edite plantillas ni promueva a nadie: el sistema nacía sin salida.

Ahora el trigger deja pasar el cambio cuando `auth.uid()` es null. Esa condición solo se da fuera de una sesión de usuario: SQL Editor o `service_role`, que ya tienen control total de la base. Desde la app, la regla sigue igual de estricta.

### 3 · Faltaban las RPC de tres funcionalidades documentadas

`docs/03-funcionalidades.md` pide duplicar una plantilla (F3), y agregar un paso entre dos y duplicar un paso (F5). No había SQL para ninguna. Se agregaron a `functions.sql`, con sus `grant execute` en `policies.sql`:

- `insert_process_step(process_id, title, after_order)`
- `duplicate_process_step(step_id)`
- `duplicate_template(template_id)`
- `insert_template_step(template_id, title)`

Insertar en medio y duplicar tocan el `sort_order` de varias filas a la vez. Hacerlo desde JavaScript significaría varias llamadas sin transacción: si dos personas insertan a la vez, quedan dos pasos con el mismo orden. En Postgres es una sola sentencia atómica.

### 4 · Detalles menores

- `set_updated_at` no fijaba `search_path`. El linter de Supabase lo marca (`function_search_path_mutable`) y es la misma precaución que el resto de funciones `security definer` ya tomaba.
- Se agregó un índice parcial sobre `process_steps (assignee_id)`. El filtro "Mis pasos" y el filtro por responsable de la lista de procesos lo recorren en cada carga.

---

## Requisito de versión de Postgres

`v_steps_attention` se crea con `security_invoker = true`, que existe desde **PostgreSQL 15**. Los proyectos nuevos de Supabase usan 15 o superior. En uno más viejo, la vista se crea sin esa opción y correría con los permisos de su dueño, saltándose RLS: hay que actualizar el proyecto antes de ejecutar `functions.sql`.

---

## Decisiones tomadas al construir

**`config.js` se commitea.** Es la opción A de `06-despliegue.md`, la recomendada ahí mismo. Vercel no puede servir un archivo que git no tiene, y generar el archivo en un build step contradice el "sin build step" que rige toda la arquitectura. `supabase.js` detecta los valores de ejemplo sin reemplazar y lo dice en pantalla, en vez de fallar con un error de red confuso.

**Se agregó `assets/js/app.js`.** El árbol de `01-arquitectura.md` no contemplaba un módulo de entrada para `app.html`. Lo que pasa una sola vez por sesión —guardia de sesión, montaje del menú, caché de perfiles y plantillas, arranque del router— no cabía ni en el router ni en una vista sin ensuciar ambos.

**Las fechas se parsean a mano.** Las columnas `date` llegan como `'2026-11-15'`. Pasarlas por `new Date()` las interpreta como medianoche UTC, y en Ecuador (UTC−5) se muestran como el día anterior. `ui.js` las parte por guiones y construye la fecha en horario local.

**El reordenamiento se desactiva con filtros activos.** Arrastrar con filas ocultas de por medio produce un orden que el usuario no ve ni entiende. Con un filtro puesto, la lista muestra un aviso de que hay que volver a "Todos" para reordenar.

**Los nombres de responsables salen del caché, no de un join.** `store.state.profiles` tiene a todo el equipo desde el arranque. Resolver `assignee_id` contra ese array evita un embed de PostgREST en cada consulta de pasos.

---

## Estado de las fases

Las ocho fases de `05-plan-desarrollo.md` están implementadas en código. Lo que falta es la ejecución de la Fase 1 —correr los cuatro scripts en Supabase— y las verificaciones de cada fase contra la base real, que no se pueden hacer sin un proyecto de Supabase conectado.
