# 01 · Arquitectura

## Principio rector

Sin build step. Todo lo que se sube al repositorio es lo que corre en el navegador. Esto elimina Node, npm, bundlers y pipelines de CI, y hace que el deploy en Vercel sea copiar archivos. El costo es que no hay TypeScript ni imports de npm: se usan ES Modules nativos y CDNs.

---

## Estructura de archivos

```
mkt-process/
├── index.html                    Login y registro
├── app.html                      Shell de la aplicación (todas las vistas viven aquí)
├── 404.html
├── vercel.json
├── .gitignore
│
├── assets/
│   ├── css/
│   │   ├── tokens.css            Variables: color, tipografía, espaciado, sombras
│   │   ├── base.css              Reset, tipografía base, utilidades
│   │   ├── layout.css            Shell, sidebar, grid de contenido
│   │   └── components.css        Botones, cards, tablas, modales, badges, ribbon
│   │
│   ├── js/
│   │   ├── config.example.js     Plantilla — se copia a config.js
│   │   ├── config.js             URL + anon key (commiteado, ver nota)
│   │   ├── supabase.js           Instancia única del cliente
│   │   ├── app.js                Entrada de app.html: sesión, shell, arranque
│   │   ├── auth.js               Login, registro, logout, guardia de sesión
│   │   ├── router.js             Hash router
│   │   ├── store.js              Estado en memoria (usuario, rol, cache ligero)
│   │   ├── ui.js                 Toasts, modales, confirmaciones, formateo de fechas
│   │   │
│   │   ├── services/
│   │   │   ├── templates.service.js
│   │   │   ├── processes.service.js
│   │   │   ├── steps.service.js
│   │   │   └── users.service.js
│   │   │
│   │   └── views/
│   │       ├── dashboard.view.js
│   │       ├── processes.view.js
│   │       ├── process-detail.view.js
│   │       ├── templates.view.js         (admin)
│   │       ├── template-detail.view.js   (admin)
│   │       └── users.view.js             (admin)
│   │
│   └── img/
│       └── logo.svg
│
├── supabase/
│   ├── schema.sql
│   ├── functions.sql
│   ├── policies.sql
│   └── seed-masterclass.sql
│
└── docs/
```

### Nota sobre `config.js`

La `anon key` de Supabase es pública por diseño: está pensada para vivir en el navegador y toda la seguridad real la aplica RLS. Se commitea sin riesgo **siempre que las políticas RLS estén activas en todas las tablas** — que es la opción A de [06 · Despliegue](06-despliegue.md) y la que sigue este repositorio. Por eso `config.js` **no** está en `.gitignore`: si lo estuviera, Vercel no lo recibiría y la app desplegada no arrancaría.

`config.example.js` se mantiene como referencia de qué valores hacen falta.

Lo que **nunca** va al repositorio ni al navegador es la `service_role key`.

### Nota sobre `app.js`

`app.html` carga un único módulo de entrada. Ahí viven las cuatro cosas que pasan una sola vez por sesión: la guardia de sesión, el montaje del menú lateral, la carga del caché ligero (perfiles y plantillas) y el arranque del router. Ninguna vista necesita repetirlas.

---

## Capas

```
┌──────────────────────────────────────────────┐
│  views/          Renderizan HTML y escuchan   │
│                  eventos del DOM              │
└──────────────────┬───────────────────────────┘
                   │ llaman
┌──────────────────▼───────────────────────────┐
│  services/       Traducen intención de la     │
│                  vista a queries de Supabase  │
└──────────────────┬───────────────────────────┘
                   │ usan
┌──────────────────▼───────────────────────────┐
│  supabase.js     Cliente único                │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│  Postgres        RLS + triggers + RPC         │
│                  La lógica crítica vive aquí  │
└──────────────────────────────────────────────┘
```

**Regla:** una vista nunca llama a `supabase` directamente. Siempre pasa por un service. Esto mantiene las queries en un solo lugar cuando haya que cambiar el esquema.

**Regla:** cálculos que deben ser siempre correctos (porcentaje de avance, orden, fechas al clonar plantilla) viven en Postgres, no en JavaScript. Si el navegador se cierra a mitad de una operación, la base queda consistente.

---

## Routing

Hash router simple dentro de `app.html`. Sin dependencias, sin configuración de servidor.

| Ruta | Vista | Acceso |
|---|---|---|
| `#/` | Dashboard | Todos |
| `#/procesos` | Lista de procesos | Todos |
| `#/procesos/:id` | Detalle con checklist | Todos |
| `#/plantillas` | Lista de plantillas | Admin |
| `#/plantillas/:id` | Editor de plantilla | Admin |
| `#/usuarios` | Gestión de usuarios | Admin |

El router hace tres cosas: parsea el hash, verifica que haya sesión activa (si no, redirige a `index.html`), y verifica el rol si la ruta lo exige.

```js
// router.js — esqueleto
const routes = [
  { path: /^#\/$/,                    view: 'dashboard',      admin: false },
  { path: /^#\/procesos$/,            view: 'processes',      admin: false },
  { path: /^#\/procesos\/(.+)$/,      view: 'process-detail', admin: false },
  { path: /^#\/plantillas$/,          view: 'templates',      admin: true  },
  { path: /^#\/plantillas\/(.+)$/,    view: 'template-detail',admin: true  },
  { path: /^#\/usuarios$/,            view: 'users',          admin: true  },
];
```

El chequeo de rol en el router es **de conveniencia**, no de seguridad. Oculta enlaces y evita pantallas rotas. La seguridad real la hace RLS: aunque alguien fuerce `#/plantillas`, Postgres rechaza el `insert`.

---

## Flujo de una acción típica

Marcar un paso como completado:

```
1. Usuario hace clic en el checkbox del paso
2. process-detail.view.js llama a stepsService.updateStatus(stepId, 'completado')
3. El service ejecuta: supabase.from('process_steps').update({status}).eq('id', stepId)
4. RLS verifica que el usuario esté autenticado → permite
5. Trigger process_steps_progress recalcula processes.progress
6. El service devuelve el paso actualizado
7. La vista actualiza el checkbox, el badge de estado y vuelve a leer el progreso del proceso
8. La cinta de proceso (ribbon) se repinta
```

Se actualiza la UI **después** de la confirmación de la base, no antes. Con un equipo chico y operaciones rápidas, el optimistic update añade complejidad sin ganancia perceptible. La excepción es el drag & drop, donde el reordenamiento visual sí es inmediato porque SortableJS ya movió el nodo.

---

## Manejo de errores

Todo service devuelve `{ data, error }` siguiendo la convención de supabase-js. La vista decide qué mostrar:

```js
const { data, error } = await processesService.create(payload);
if (error) return ui.toast.error('No se pudo crear el proceso. ' + traducir(error));
ui.toast.success('Proceso creado');
```

Los mensajes de error dicen qué pasó y qué hacer, nunca se disculpan ni muestran el error crudo de Postgres. Hay un mapa `traducir()` en `ui.js` para los códigos más comunes:

| Código Postgres | Mensaje al usuario |
|---|---|
| `42501` | No tienes permiso para hacer este cambio. |
| `23505` | Ya existe un registro con ese nombre. |
| `23503` | Ese elemento está en uso y no se puede eliminar. |
| `PGRST116` | No se encontró el registro. Puede que alguien lo haya eliminado. |
