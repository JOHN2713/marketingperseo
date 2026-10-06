/* =====================================================================
   session-guard.js · Cierre de sesion por inactividad
   El JWT de Supabase dura 1 hora (Auth → JWT expiry = 3600) y supabase-js
   lo renueva solo con el refresh token, incluso con la pestana olvidada.
   Este modulo pone el limite que falta: 60 minutos sin usar la app y la
   sesion se cierra. La ultima actividad se guarda en localStorage para que
   la compartan todas las pestanas y sobreviva a cerrar el navegador.
   ===================================================================== */

export const IDLE_LIMIT_MS = 60 * 60 * 1000;
const WARN_BEFORE_MS = 5 * 60 * 1000;
const CHECK_EVERY_MS = 30 * 1000;
const KEY = 'mkt.lastActivity';
const EVENTOS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];

function leer() {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
}

export function markActivity() {
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* sin storage */ }
}

export function clearActivity() {
  try { localStorage.removeItem(KEY); } catch { /* sin storage */ }
}

/**
 * true si hay registro de actividad y es mas viejo que el limite.
 * Sin registro (primer login en este navegador, storage bloqueado) no se
 * considera vencida: el login lo crea enseguida.
 */
export function isIdleExpired() {
  const last = leer();
  return last > 0 && Date.now() - last > IDLE_LIMIT_MS;
}

/**
 * Vigila la actividad. `onExpire` cierra la sesion; `onWarn` avisa cuando
 * faltan 5 minutos. Devuelve una funcion para detener la vigilancia.
 */
export function startIdleWatch({ onExpire, onWarn }) {
  let avisado = false;
  let ultimoGuardado = 0;

  // mousemove dispara cientos de veces por segundo: se escribe a lo sumo
  // una vez cada 15 segundos.
  const actividad = () => {
    const ahora = Date.now();
    if (ahora - ultimoGuardado < 15000) return;
    ultimoGuardado = ahora;
    avisado = false;
    markActivity();
  };

  const revisar = () => {
    const last = leer();
    if (!last) { markActivity(); return; }
    const inactivo = Date.now() - last;
    if (inactivo > IDLE_LIMIT_MS) { detener(); onExpire(); return; }
    if (!avisado && inactivo > IDLE_LIMIT_MS - WARN_BEFORE_MS) { avisado = true; onWarn?.(); }
  };

  EVENTOS.forEach(ev => window.addEventListener(ev, actividad, { passive: true }));
  document.addEventListener('visibilitychange', revisar);
  const timer = setInterval(revisar, CHECK_EVERY_MS);

  markActivity();

  function detener() {
    EVENTOS.forEach(ev => window.removeEventListener(ev, actividad));
    document.removeEventListener('visibilitychange', revisar);
    clearInterval(timer);
  }
  return detener;
}
