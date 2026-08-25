/* =====================================================================
   store.js · Estado en memoria de la sesion
   Usuario, perfil, rol y un cache ligero de cosas que casi no cambian
   (perfiles del equipo, plantillas activas) para no repetir queries.
   ===================================================================== */

export const state = {
  user: null,           // auth.users
  profile: null,        // public.profiles
  profiles: [],         // todo el equipo, para los selectores de responsable
  templates: [],        // plantillas activas
  overdue: 0,           // pasos vencidos, alimenta el contador del menu
  attention: [],        // filas de v_steps_attention
};

export const isAdmin = () => state.profile?.role === 'admin';

export const nombreDe = id => {
  if (!id) return null;
  const p = state.profiles.find(x => x.id === id);
  return p ? (p.full_name || p.email) : null;
};

/* --- Suscripciones ---------------------------------------------------
   Un pub/sub minimo. Lo usa el contador de vencidos del menu lateral,
   que tiene que repintarse desde cualquier vista.
   ------------------------------------------------------------------- */

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach(fn => {
    try { fn(payload); } catch (e) { console.error(e); }
  });
}

export function setAttention(rows) {
  state.attention = rows || [];
  state.overdue = state.attention.filter(r => r.flag === 'vencido').length;
  emit('attention', state.attention);
}

export function reset() {
  state.user = null;
  state.profile = null;
  state.profiles = [];
  state.templates = [];
  state.overdue = 0;
  state.attention = [];
}
