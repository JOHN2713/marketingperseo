# MKT Process

Aplicativo web para ejecutar procesos de marketing como checklists vivos. El primer proceso es **Masterclass**, pero el sistema está diseñado para que se agreguen otros (Lanzamiento, Webinar, Campaña de Ads) sin tocar código.

---

## Qué resuelve

Un proceso de marketing se repite cada mes con los mismos 24 pasos, pero cada edición tiene fechas distintas, responsables distintos y cosas que se olvidan. Este app separa dos cosas:

- **Plantilla** — el checklist maestro. Lo edita el admin. Cambia poco.
- **Proceso** — una copia ejecutable de esa plantilla, con sus fechas, observaciones y estados. Cambia todos los días.

Cuando creas "Masterclass Octubre", el sistema clona la plantilla, calcula las fechas de cada paso a partir de la fecha de inicio, y a partir de ahí el equipo trabaja sobre esa copia. La plantilla queda intacta.

---

## Decisiones tomadas

| Decisión | Valor | Por qué |
|---|---|---|
| Visibilidad | Equipo compartido: todos ven todos los procesos | Es un equipo chico; la fricción de permisos no compensa |
| Recordatorios | Solo visuales (badges, alertas, contadores) | Sin cron jobs ni Edge Functions en v1 |
| Autenticación | Email + contraseña (Supabase Auth) | Simple, sin dependencias externas |
| Roles | `admin` y `user` en tabla `profiles` | Admin gestiona plantillas y usuarios |
| Build step | Ninguno | HTML/CSS/JS plano, todo por CDN. Deploy directo a Vercel |
| Drag & drop | SortableJS + RPC `reorder_process_steps` | Reordena en una sola llamada, sin condiciones de carrera |
| % de avance | Calculado por trigger en Postgres | Nunca se desincroniza con los pasos |

---

## Stack

- **Frontend**: HTML5, CSS (custom properties, sin framework), JavaScript ES Modules
- **Librerías por CDN**: `@supabase/supabase-js@2` (esm.sh), `SortableJS@1.15` (jsDelivr)
- **Tipografías**: Bricolage Grotesque, Inter y JetBrains Mono desde Google Fonts
- **Base de datos + Auth**: Supabase (Postgres 15 con RLS)
- **Repositorio**: GitHub
- **Hosting**: Vercel (sitio estático)

---

## Documentación

| Doc | Contenido |
|---|---|
| [01 · Arquitectura](docs/01-arquitectura.md) | Estructura de archivos, routing, capas, flujo de datos |
| [02 · Modelo de datos](docs/02-modelo-de-datos.md) | Tablas, enums, triggers, funciones RPC, políticas RLS |
| [03 · Funcionalidades](docs/03-funcionalidades.md) | Spec detallada de cada feature y sus reglas |
| [04 · Diseño de interfaz](docs/04-diseno-interfaz.md) | Sistema de diseño, tokens, pantallas, componentes |
| [05 · Plan de desarrollo](docs/05-plan-desarrollo.md) | 8 fases con checklist de tareas y criterios de cierre |
| [06 · Despliegue](docs/06-despliegue.md) | Supabase, GitHub, Vercel, variables, dominio |
| [07 · Plantilla Masterclass](docs/07-plantilla-masterclass.md) | Los 24 pasos del proceso con tipo, prioridad y duración |
| [08 · Notas de implementación](docs/08-notas-de-implementacion.md) | Correcciones a los scripts SQL y decisiones tomadas al construir |

Los scripts SQL listos para pegar en Supabase están en [`supabase/`](supabase/).

---

## Arranque rápido

```bash
git clone https://github.com/TU-USUARIO/mkt-process.git
cd mkt-process
# Abre assets/js/config.js y pega tu Project URL y tu anon key
npx serve .                                          # http://localhost:3000
```

`config.js` viene commiteado con valores de ejemplo. La app detecta que no lo has completado y te lo dice en pantalla en vez de fallar en silencio.

En Supabase, ejecuta en orden: `schema.sql` → `functions.sql` → `policies.sql` → `seed-masterclass.sql`.

Luego registra tu usuario desde la app y promuévelo a admin:

```sql
update public.profiles set role = 'admin' where email = 'tu@correo.com';
```

---

## Fuera de alcance en v1

Estas cosas están pensadas pero no se construyen todavía. Están listadas para que no se cuelen a mitad del desarrollo:

- Notificaciones por email o WhatsApp
- Subida de archivos adjuntos por paso
- Comentarios con hilos (el campo `observations` cubre el caso por ahora)
- Vista Gantt o calendario mensual
- Exportación a PDF o Excel
- Histórico de cambios / auditoría
- Multi-workspace o multi-cliente
