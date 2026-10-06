/* =====================================================================
   app.js · Arranque de app.html
   Guardia de sesion, montaje del shell, carga del cache y router.
   ===================================================================== */
import { requireSession, signOut, watchSession, expireSession } from './auth.js';
import { startIdleWatch } from './session-guard.js';
import { state, on } from './store.js';
import { start } from './router.js';
import * as processesService from './services/processes.service.js';
import * as usersService from './services/users.service.js';
import * as templatesService from './services/templates.service.js';
import * as tasksService from './services/tasks.service.js';
import { toast, traducir, applyRoleUI } from './ui.js';

const REFRESCO_MS = 5 * 60 * 1000;   // doc 03 F7: sin websockets en v1

const shell = document.getElementById('shell');

/* --- 1 · Sesion ------------------------------------------------------- */
const profile = await requireSession();
if (!profile) throw new Error('sin sesión');   // requireSession ya redirigio
watchSession();

// 60 minutos sin actividad cierran la sesion, en esta y en las demas pestanas.
startIdleWatch({
  onWarn: () => toast.info('Tu sesión se cerrará en 5 minutos por inactividad. Mueve el mouse o pulsa una tecla para seguir.'),
  onExpire: expireSession,
});

/* --- 2 · Shell -------------------------------------------------------- */
document.getElementById('user-name').textContent = profile.full_name || profile.email;
applyRoleUI(profile.role);

shell.hidden = false;

document.getElementById('btn-logout').addEventListener('click', async e => {
  e.preventDefault();
  const { error } = await signOut();
  if (error) return toast.error('No se pudo cerrar la sesión. ' + traducir(error));
  location.replace('index.html');
});

/* Menu lateral en pantallas chicas */
const btnMenu = document.getElementById('btn-menu');
const abrirMenu = open => {
  shell.dataset.menu = open ? 'open' : 'closed';
  btnMenu.setAttribute('aria-expanded', String(open));
  document.getElementById('scrim')?.remove();
  if (open) {
    const scrim = document.createElement('div');
    scrim.id = 'scrim';
    scrim.className = 'scrim';
    scrim.addEventListener('click', () => abrirMenu(false));
    shell.appendChild(scrim);
  }
};
btnMenu.addEventListener('click', () => abrirMenu(shell.dataset.menu !== 'open'));
document.getElementById('sidebar').addEventListener('click', e => {
  if (e.target.closest('a')) abrirMenu(false);
});

/* --- 3 · Contador de vencidos ----------------------------------------- */
const badge = document.getElementById('badge-overdue');
on('attention', () => {
  const n = state.overdue;
  badge.classList.toggle('hidden', n === 0);
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.title = `${n} paso${n === 1 ? '' : 's'} vencido${n === 1 ? '' : 's'}`;
});

/* --- 4 · Cache ligero -------------------------------------------------- */
async function cargarCache() {
  const [perfiles, plantillas, tipos] = await Promise.all([
    usersService.list(),
    templatesService.list({ onlyActive: true }),
    tasksService.listTypes(),
  ]);
  if (perfiles.data)   state.profiles  = perfiles.data;
  if (plantillas.data) state.templates = plantillas.data;
  if (tipos.data)      state.taskTypes = tipos.data;
}

await Promise.all([cargarCache(), processesService.refreshAttention()]);

/* --- 5 · Router -------------------------------------------------------- */
start();

setInterval(processesService.refreshAttention, REFRESCO_MS);

/* Repintar el contador al volver a la pestana, sin esperar los 5 minutos. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') processesService.refreshAttention();
});
