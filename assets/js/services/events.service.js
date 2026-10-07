/* =====================================================================
   events.service.js
   Calendario de eventos. Los de una Masterclass nacen junto con su
   proceso (RPC create_process_with_event) y llevan process_id.
   ===================================================================== */
import { supabase } from '../supabase.js';
import { state, isJefe } from '../store.js';

export const ESTADOS_EVENTO = ['por_aprobacion', 'confirmado', 'rechazado'];
export const MODALIDADES = ['presencial', 'virtual'];

const CAMPOS = `
  id, title, description, starts_at, ends_at, all_day, status, modality,
  location, process_id, created_by, created_at,
  areas:event_areas ( area_id )
`;

function normalizar(e) {
  return { ...e, areas: (e.areas || []).map(a => a.area_id) };
}

/**
 * Eventos que tocan el intervalo [from, to) — `from` y `to` son Date.
 * Un evento de varios dias entra si termina despues de `from`.
 */
export async function list({ from, to }) {
  const { data, error } = await supabase
    .from('events')
    .select(CAMPOS)
    .lt('starts_at', to.toISOString())
    .or(`starts_at.gte."${from.toISOString()}",ends_at.gte."${from.toISOString()}"`)
    .order('starts_at', { ascending: true });
  return error ? { data: null, error } : { data: data.map(normalizar), error: null };
}

/** Proximos eventos desde hoy, sin los rechazados. Para Inicio. */
export async function upcoming(limit = 6) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('events')
    .select(CAMPOS)
    .neq('status', 'rechazado')
    .or(`starts_at.gte."${hoy.toISOString()}",ends_at.gte."${hoy.toISOString()}"`)
    .order('starts_at', { ascending: true })
    .limit(limit);
  return error ? { data: null, error } : { data: data.map(normalizar), error: null };
}

export async function getById(id) {
  const { data, error } = await supabase.from('events').select(CAMPOS).eq('id', id).single();
  return error ? { data: null, error } : { data: normalizar(data), error: null };
}

/** Crea o actualiza el evento y sus areas responsables en una transaccion. */
export async function save(id, data, areas = null) {
  return supabase.rpc('save_event', { p_id: id || null, p_data: data, p_areas: areas });
}

export async function remove(id) {
  const { data, error } = await supabase.from('events').delete().eq('id', id).select('id');
  if (error) return { error };
  // RLS no da error al bloquear un delete: simplemente no borra nada.
  return data.length ? { error: null } : { error: { code: '42501' } };
}

/** Edita el jefe/admin o quien lo creo. El estado, solo el jefe/admin. */
export function canEdit(event) {
  if (!event) return true;
  return isJefe() || event.created_by === state.user?.id;
}

/** Ultimo dia (local) que ocupa el evento. */
export function lastDay(event) {
  return new Date(event.ends_at || event.starts_at);
}
