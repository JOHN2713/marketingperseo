# 05 · Plan de desarrollo

Ocho fases. Cada una termina con algo que se puede abrir en el navegador y probar. No se pasa a la siguiente sin cerrar el criterio de la anterior.

---

## Fase 0 · Preparación

- [ ] Crear proyecto en Supabase (región más cercana: `us-east-1` desde Ecuador)
- [ ] Guardar `Project URL` y `anon public key`
- [ ] Crear repositorio en GitHub, privado
- [ ] Estructura de carpetas según [01 · Arquitectura](01-arquitectura.md)
- [ ] `.gitignore` con `assets/js/config.js`, `.DS_Store`, `.env`
- [ ] `config.example.js` commiteado

**Cierra cuando:** el repositorio existe y `npx serve .` levanta un `index.html` vacío.

---

## Fase 1 · Base de datos

- [ ] Ejecutar `schema.sql`
- [ ] Ejecutar `functions.sql`
- [ ] Ejecutar `policies.sql`
- [ ] Verificar que las 5 tablas tengan `rowsecurity = true`
- [ ] Ejecutar `seed-masterclass.sql`
- [ ] Probar `create_process_from_template` desde el SQL Editor y revisar que las fechas salgan en cascada
- [ ] Marcar 3 pasos como completados y confirmar que `processes.progress` cambia solo
- [ ] Probar `reorder_process_steps` con un array desordenado

**Cierra cuando:** los triggers funcionan sin tocar el frontend.

---

## Fase 2 · Autenticación

- [ ] `index.html` con formularios de login y registro
- [ ] `config.js` y `supabase.js`
- [ ] `auth.js`: `signUp`, `signInWithPassword`, `signOut`, `getSession`
- [ ] Redirección: con sesión → `app.html`, sin sesión → `index.html`
- [ ] `app.html` con el shell y el menú lateral
- [ ] Cargar el perfil y el rol en `store.js` al iniciar
- [ ] Ocultar la sección ADMIN si el rol no es admin
- [ ] Promover el primer usuario a admin por SQL

**Cierra cuando:** puedes registrarte, entrar, ver tu nombre en el menú y salir.

---

## Fase 3 · Procesos (lectura)

- [ ] `router.js` con las 6 rutas
- [ ] `processes.service.js`: `list`, `getById`
- [ ] `processes.view.js`: tabla con estado, prioridad, fechas y barra de avance
- [ ] Filtros por estado y prioridad, buscador por nombre
- [ ] `process-detail.view.js`: cabecera + lista de pasos en modo lectura
- [ ] Estados vacíos redactados

**Cierra cuando:** ves el proceso de prueba creado en la Fase 1, con sus 24 pasos en orden.

---

## Fase 4 · Pasos (escritura)

Esta es la fase más larga y la que define si el producto sirve.

- [ ] `steps.service.js`: `update`, `create`, `remove`, `duplicate`, `reorder`
- [ ] Checkbox de completado con actualización del progreso en pantalla
- [ ] Fila expandible con todos los campos
- [ ] Observaciones con debounce de 800 ms e indicador de guardado
- [ ] Selectores de estado, prioridad y tipo
- [ ] Campos de fecha de inicio, fin y recordatorio
- [ ] Selector de responsable
- [ ] Campo de link con validación de URL
- [ ] Agregar paso al final y entre pasos
- [ ] Duplicar y eliminar paso
- [ ] Validación: fecha de fin no anterior a la de inicio

**Cierra cuando:** puedes ejecutar un proceso completo de principio a fin sin tocar el SQL Editor.

---

## Fase 5 · Drag & drop

- [ ] Cargar SortableJS por CDN
- [ ] Asa de arrastre en cada fila
- [ ] `onEnd` que envía el array de IDs a `reorder`
- [ ] Manejo de error: recargar desde la base si falla
- [ ] Ajustes táctiles: `delay: 200`, `delayOnTouchOnly: true`
- [ ] Renumeración visual (01, 02, 03…) después de soltar
- [ ] Alternativa por teclado con `Ctrl` + flechas
- [ ] Respetar `prefers-reduced-motion`

**Cierra cuando:** reordenas 5 pasos, recargas la página y el orden se mantiene.

---

## Fase 6 · Plantillas y usuarios (admin)

- [ ] `templates.service.js` y `users.service.js`
- [ ] `templates.view.js`: lista con conteo de pasos y botón de duplicar
- [ ] `template-detail.view.js`: CRUD de pasos con drag & drop
- [ ] Activar / desactivar plantilla
- [ ] Modal "Crear proceso desde plantilla" con nombre y fecha de inicio
- [ ] `users.view.js`: lista de perfiles con selector de rol
- [ ] Bloqueo: no permitir quitar el último admin

**Cierra cuando:** un admin crea una plantilla nueva desde cero y genera un proceso con ella.

---

## Fase 7 · Dashboard y recordatorios

- [ ] `v_steps_attention` conectada
- [ ] Cuatro números del momento
- [ ] Panel "Requiere atención" con enlace al paso
- [ ] Contador de vencidos en el menú lateral
- [ ] Punto de color en filas vencidas y que vencen hoy
- [ ] Ícono de campana en pasos con recordatorio cumplido
- [ ] Refresco cada 5 minutos
- [ ] Actividad reciente

**Cierra cuando:** un paso con fecha de ayer aparece marcado en rojo en el dashboard, en la lista y en el detalle.

---

## Fase 8 · Pulido y despliegue

- [ ] La cinta de proceso, con tooltip y salto al paso
- [ ] `progress_override` con su marca visual
- [ ] Responsive hasta 360 px
- [ ] Foco visible en todos los controles
- [ ] Verificar contraste de las pastillas de estado
- [ ] Traducción de errores de Postgres a mensajes en español
- [ ] `404.html` y `vercel.json`
- [ ] Deploy a Vercel
- [ ] Agregar el dominio de Vercel a las Redirect URLs de Supabase Auth
- [ ] Prueba en producción con un usuario que no seas tú

**Cierra cuando:** alguien del equipo entra desde su teléfono y completa un paso.

---

## Estimación

| Fase | Sesiones de trabajo |
|---|---|
| 0 · Preparación | 0.5 |
| 1 · Base de datos | 1 |
| 2 · Autenticación | 1.5 |
| 3 · Procesos lectura | 2 |
| 4 · Pasos escritura | 4 |
| 5 · Drag & drop | 1 |
| 6 · Admin | 3 |
| 7 · Dashboard | 2 |
| 8 · Pulido | 2 |
| **Total** | **17** |

Una sesión son unas 3 horas de trabajo enfocado. La estimación asume que las decisiones ya están tomadas, que es justamente para lo que sirve esta documentación.

---

## Riesgos y cómo se manejan

**El `security definer` mal configurado abre un hueco.** Las funciones con `security definer` llevan `set search_path = public` fijo. Revisar esto antes del deploy es obligatorio.

**Alguien se queda sin admin.** Si el único admin se auto-degrada, nadie puede editar plantillas. Hay bloqueo en la UI, y como respaldo siempre se puede promover a alguien desde el SQL Editor de Supabase.

**El drag & drop en móvil pelea con el scroll.** Se resuelve con `delayOnTouchOnly`. Si aun así molesta, la alternativa es mover el reordenamiento a un modo "Reordenar" explícito en pantallas chicas.

**La cascada de fechas genera cronogramas irreales.** Es esperado: la cascada es secuencial y la realidad es paralela. La documentación lo dice y la UI permite editar fechas en bloque. Si se vuelve un problema real, se agrega un campo `depends_on` a `template_steps` en v2.
