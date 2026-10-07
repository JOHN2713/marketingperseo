/* =====================================================================
   router.js · Hash router
   El chequeo de rol aqui es de conveniencia: evita pantallas rotas.
   La seguridad real la aplica RLS en Postgres.
   ===================================================================== */
import { isAdmin, isJefe } from './store.js';
import { skeleton, empty } from './ui.js';

// need: quien puede entrar. Sin `need`, cualquiera con sesion.
const routes = [
  { path: /^#\/$/,                 view: 'dashboard'                         },
  { path: /^#\/procesos$/,         view: 'processes'                         },
  { path: /^#\/procesos\/(.+)$/,   view: 'process-detail'                    },
  { path: /^#\/tareas$/,           view: 'tasks'                             },
  { path: /^#\/calendario$/,       view: 'calendar'                          },
  { path: /^#\/metricas$/,         view: 'metrics',         need: 'jefe'     },
  { path: /^#\/plantillas$/,       view: 'templates',       need: 'admin'    },
  { path: /^#\/plantillas\/(.+)$/, view: 'template-detail', need: 'admin'    },
  { path: /^#\/usuarios$/,         view: 'users',           need: 'admin'    },
  { path: /^#\/auditoria$/,        view: 'audit',           need: 'admin'    },
];

const PERMITE = { admin: isAdmin, jefe: isJefe };

let current = null;   // modulo de la vista montada, para poder desmontarla

function match(hash) {
  for (const r of routes) {
    const m = hash.match(r.path);
    if (m) return { route: r, params: m.slice(1).map(decodeURIComponent) };
  }
  return null;
}

function marcarActivo(hash) {
  const base = '#/' + (hash.split('/')[1] || '');
  document.querySelectorAll('.navlink[href^="#/"]').forEach(a => {
    const on = a.getAttribute('href') === base || (base === '#/' && a.getAttribute('href') === '#/');
    a.toggleAttribute('aria-current', on);
    if (on) a.setAttribute('aria-current', 'page');
  });
}

export function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

async function render() {
  const root = document.getElementById('view');
  if (!root) return;

  const hash = location.hash || '#/';
  // El hash puede llevar query propia: #/procesos/<id>?paso=<id>
  const [path, qs] = hash.split('?');
  const found = match(path);
  const query = new URLSearchParams(qs || '');

  // Desmonta la vista anterior: cancela intervalos y quita listeners globales.
  try { current?.destroy?.(); } catch (e) { console.error(e); }
  current = null;

  if (!found) {
    root.innerHTML = empty({
      title: 'Esa pantalla no existe',
      text: 'El enlace apunta a algo que no está en la aplicación.',
      actionHtml: '<a class="btn btn--primary" href="#/">Ir al inicio</a>',
    });
    return;
  }

  if (found.route.need && !PERMITE[found.route.need]()) {
    const jefe = found.route.need === 'jefe';
    root.innerHTML = empty({
      title: jefe ? 'Sección solo para el jefe de área' : 'Sección solo para administradores',
      text: 'Pide a un administrador que te dé ese permiso desde Usuarios.',
      actionHtml: '<a class="btn btn--primary" href="#/">Ir al inicio</a>',
    });
    return;
  }

  marcarActivo(path);
  root.innerHTML = skeleton(5);
  root.scrollIntoView({ block: 'start' });

  try {
    const mod = await import(`./views/${found.route.view}.view.js`);
    current = mod;
    await mod.render(root, { params: found.params, query });
  } catch (err) {
    console.error(err);
    root.innerHTML = empty({
      title: 'No se pudo cargar la pantalla',
      text: 'Recarga la página. Si vuelve a pasar, revisa la consola del navegador.',
      actionHtml: '<button class="btn btn--secondary" onclick="location.reload()">Recargar</button>',
    });
  }
}

export function start() {
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/';
  else render();
}
