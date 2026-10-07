/* =====================================================================
   processes.service.js
   Todas las queries de `processes` viven aqui. Las vistas no tocan supabase.
   ===================================================================== */
import { supabase } from '../supabase.js';
import { state, setAttention } from '../store.js';

const CAMPOS = `
  id, template_id, name, description, owner_id, status, priority,
  start_date, end_date, resource_url, progress, progress_override,
  created_at, updated_at,
  template:process_templates ( id, name, icon, color )
`;

export async function list() {
  const { data, error } = await supabase
    .from('processes')
    .select(CAMPOS)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error };

  // Orden de la doc 03: los en_curso arriba, luego por fecha de fin mas cercana.
  const PESO = { en_curso: 0, planificado: 1, pausado: 2, completado: 3, cancelado: 4 };
  const rows = [...data].sort((a, b) => {
    const d = (PESO[a.status] ?? 9) - (PESO[b.status] ?? 9);
    if (d !== 0) return d;
    if (!a.end_date) return 1;
    if (!b.end_date) return -1;
    return a.end_date.localeCompare(b.end_date);
  });

  return { data: rows, error: null };
}

export async function getById(id) {
  return supabase.from('processes').select(CAMPOS).eq('id', id).single();
}

/** Proceso en blanco, sin plantilla. Los pasos se agregan a mano. */
export async function create({ name, description = null, start_date = null, priority = 'media' }) {
  return supabase
    .from('processes')
    .insert({ name, description, start_date, priority, owner_id: state.user.id })
    .select(CAMPOS)
    .single();
}

/**
 * Clona la plantilla con fechas en cascada. Si la plantilla tiene
 * `creates_event` (Masterclass), crea tambien su evento en el calendario:
 * en `eventAt`, o de dia completo en la fecha de fin si viene nulo.
 * Todo dentro de una transaccion.
 */
export async function createFromTemplate(templateId, name, startDate, eventAt = null) {
  const { data, error } = await supabase.rpc('create_process_with_event', {
    p_template_id: templateId,
    p_name: name,
    p_start_date: startDate,
    p_event_at: eventAt,
  });
  return { data, error };
}

export async function update(id, patch) {
  return supabase.from('processes').update(patch).eq('id', id).select(CAMPOS).single();
}

export async function remove(id) {
  return supabase.from('processes').delete().eq('id', id);
}

/* --- Recordatorios y vencimientos ------------------------------------ */

export async function attention() {
  return supabase
    .from('v_steps_attention')
    .select('*')
    .order('end_date', { ascending: true, nullsFirst: false });
}

/** Relee la vista de atencion y deja el resultado en el store. */
export async function refreshAttention() {
  const { data, error } = await attention();
  if (error) { console.error(error); return { error }; }
  setAttention(data);
  return { data };
}

/** Cuenta de pasos vencidos por proceso, para las filas de la lista. */
export function overdueByProcess(rows = state.attention) {
  const map = new Map();
  for (const r of rows) {
    if (r.flag !== 'vencido') continue;
    map.set(r.process_id, (map.get(r.process_id) || 0) + 1);
  }
  return map;
}

/* --- Dashboard -------------------------------------------------------- */

export async function recentlyCompleted(limit = 10) {
  return supabase
    .from('process_steps')
    .select('id, title, completed_at, assignee_id, process_id, processes!inner ( name )')
    .eq('status', 'completado')
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);
}
