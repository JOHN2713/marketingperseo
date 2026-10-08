# 06 · Despliegue

---

## 1 · Supabase

### Crear el proyecto

1. [supabase.com](https://supabase.com) → **New project**
2. Nombre: `mkt-process`. Región: la más cercana (`East US` desde Ecuador)
3. Guardar la contraseña de la base en un gestor de contraseñas. No se puede recuperar.

### Ejecutar los scripts

En **SQL Editor**, en este orden y uno por uno:

```
1. supabase/schema.sql
2. supabase/functions.sql
3. supabase/policies.sql
4. supabase/seed-masterclass.sql
5. supabase/tasks.sql
6. supabase/events-audit.sql
7. supabase/work-hours.sql
```

Verificar que RLS quedó activo:

```sql
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
 order by tablename;
```

Todas las tablas deben decir `true`. Si alguna dice `false`, la app quedaría abierta a cualquiera con la `anon key`, que es pública.

### Configurar Auth

**Authentication → Providers → Email**

- Enable email provider: activado
- Confirm email: desactivado en desarrollo, activado en producción
- Minimum password length: 8

**Authentication → Sessions**

- Access token (JWT) expiry: `3600` segundos
- Inactivity timeout: `1 hour` (solo en plan Pro; la app ya cierra por inactividad del lado del navegador, ver doc 09)

**Authentication → URL Configuration**

| Campo | Valor |
|---|---|
| Site URL | `https://marketingperseo.vercel.app` |
| Redirect URLs | `http://localhost:3000/**` y `https://marketingperseo.vercel.app/**` |

Sin esto, el enlace de recuperación de contraseña rebota.

### Obtener las llaves

**Project Settings → API**

- `Project URL` → va en `config.js`
- `anon public` → va en `config.js`
- `service_role` → **no se usa en este proyecto**. No la copies a ningún archivo del repositorio.

---

## 2 · Archivos de configuración

### `assets/js/config.example.js`

```js
// Copia este archivo como config.js y completa los valores.
// La anon key es pública por diseño: toda la seguridad la aplica RLS en Postgres.
export const SUPABASE_URL      = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_ANON_KEY = 'TU-ANON-KEY';
```

### `assets/js/supabase.js`

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});
```

### `.gitignore`

```
node_modules/
.vercel
.DS_Store
Thumbs.db
.env
.env.*
```

`assets/js/config.js` **no** está aquí a propósito: se commitea (opción A, más abajo). Si estuviera ignorado, Vercel no lo recibiría y la app desplegada mostraría la pantalla de "falta la configuración".

### `vercel.json`

```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

No hay reescrituras a `index.html` porque el routing es por hash: el navegador nunca pide una ruta que el servidor no tenga.

---

## 3 · GitHub

```bash
git init
git add .
git commit -m "Estructura inicial y documentación"
git branch -M main
git remote add origin https://github.com/JOHN2713/marketingperseo.git
git push -u origin main
```

### Ramas

| Rama | Uso | Deploy |
|---|---|---|
| `main` | Producción | Automático a producción |
| `dev` | Trabajo diario | Preview automático |
| `feat/*` | Una fase del plan | Preview automático |

Cada fase del [plan de desarrollo](05-plan-desarrollo.md) es una rama y un pull request. Aunque trabajes solo, el PR te da un preview funcionando antes de mezclar.

### Mensajes de commit

Formato corto y en español, con prefijo de área:

```
db: agregar trigger de progreso
ui: fila de paso expandible
fix: la fecha de fin permitía ser anterior al inicio
docs: plan de desarrollo
```

---

## 4 · Vercel

### Conectar

1. [vercel.com](https://vercel.com) → **Add New → Project**
2. Importar el repositorio de GitHub
3. Framework Preset: **Other**
4. Build Command: vacío
5. Output Directory: `.` (la raíz)
6. Install Command: vacío

Como no hay build step, Vercel solo copia los archivos. El deploy toma segundos.

### El problema de `config.js`

`config.js` está en `.gitignore`, así que Vercel no lo recibe. Hay dos salidas:

**Opción A — commitear `config.js` (la que usa este repositorio)**

La `anon key` es pública. Si RLS está bien puesto, no hay riesgo. `config.js` ya está fuera del `.gitignore`: solo hay que pegarle la URL y la llave y commitearlo. Es lo más simple y lo que hace la mayoría de proyectos con Supabase.

Antes de commitearla, confirma que las cinco tablas devuelven `rowsecurity = true` con la consulta de más arriba. Es la única condición que hace segura esta opción.

**Opción B — generarlo en el build**

Si prefieres no tenerla en el repositorio, define las variables en Vercel y genera el archivo:

```json
{
  "buildCommand": "node -e \"require('fs').writeFileSync('assets/js/config.js', `export const SUPABASE_URL='${process.env.SUPABASE_URL}';export const SUPABASE_ANON_KEY='${process.env.SUPABASE_ANON_KEY}';`)\""
}
```

Con `SUPABASE_URL` y `SUPABASE_ANON_KEY` en **Settings → Environment Variables**. La llave termina igual en el navegador; solo deja de estar en el historial de git.

### Después del primer deploy

- [ ] Copiar la URL de Vercel
- [ ] Pegarla en Supabase → Authentication → URL Configuration (Site URL y Redirect URLs)
- [ ] Abrir la app en incógnito y registrarse
- [ ] Promover ese usuario a admin por SQL
- [ ] Crear un proceso desde la plantilla Masterclass
- [ ] Probar desde un teléfono

### Dominio propio (opcional)

**Settings → Domains** → agregar el dominio y apuntar el DNS según indique Vercel. Después, actualizar de nuevo las URLs en Supabase Auth.

---

## 5 · Mantenimiento

**Respaldos.** Supabase hace respaldo diario en el plan gratuito, con 7 días de retención. Para algo más largo, exporta manualmente:

```bash
pg_dump "postgresql://postgres:CONTRASEÑA@db.ivngjgoxhqywclwmozml.supabase.co:5432/postgres" \
  --schema=public --data-only > respaldo-$(date +%F).sql
```

**Proyecto pausado.** El plan gratuito de Supabase pausa proyectos sin actividad por una semana. Si el equipo usa la app a diario no pasa; si es estacional, conviene el plan pago o entrar cada tanto.

**Migraciones.** Cada cambio de esquema va en un archivo nuevo en `supabase/migrations/`, numerado y con fecha. Nunca se edita un script ya ejecutado en producción.

```
supabase/migrations/
  2026-09-01-agregar-depends-on.sql
  2026-09-14-indice-assignee.sql
```
