/* =====================================================================
   tasks.service.js
   Tareas, sus responsables, sus recursos y el catalogo de tipos.
   ===================================================================== */
import { supabase } from '../supabase.js';
import { state, isJefe } from '../store.js';
import { workHours, archiveCutoff } from '../worktime.js';

export const ESTADOS = ['pendiente', 'en_curso', 'en_revision', 'completado', 'bloqueado'];
export const PRIORIDADES = ['urgente', 'alta', 'media', 'baja'];

const CAMPOS = `
  id, title, type_id, area_id, priority, status, due_date, started_at, finished_at,
  observations, created_by, created_at, updated_at,
  assignees:task_assignees ( profile_id ),
  resources:task_resources ( id, label, url, sort_order )
`;

/** Aplana el embed de responsables a un array de ids. */
function normalizar(t) {
  return {
    ...t,
    assignees: (t.assignees || []).map(a => a.profile_id),
    resources: [...(t.resources || [])].sort((a, b) => a.sort_order - b.sort_order),
  };
}

/**
 * Lista de tareas. `from` / `to` son fechas 'YYYY-MM-DD' locales y filtran
 * por fecha de creacion (dia de asignacion), ambos extremos incluidos.
 *
 * `scope`:
 *   'all'      todas — lo usan las Metricas: archivar no saca a una tarea
 *              de ningun promedio.
 *   'active'   las de trabajo diario: todo lo no completado y lo completado
 *              hace menos de `archive_after_days`.
 *   'archived' completadas hace mas de eso, de la mas reciente a la mas vieja.
 *
 * El archivo no es una marca guardada: sale de comparar finished_at con el
 * corte, asi que reabrir una tarea la devuelve sola a las activas.
 */
export async function list({ from = null, to = null, scope = 'all' } = {}) {
  let q = supabase.from('tasks').select(CAMPOS);
  const corte = archiveCutoff(state.settings).toISOString();

  if (scope === 'archived') {
    q = q.eq('status', 'completado').lt('finished_at', corte)
         .order('finished_at', { ascending: false });
  } else {
    if (scope === 'active') {
      q = q.or(`status.neq.completado,finished_at.is.null,finished_at.gte."${corte}"`);
    }
    q = q.order('created_at', { ascending: false });
  }

  if (from) q = q.gte('created_at', new Date(`${from}T00:00:00`).toISOString());
  if (to) {
    const fin = new Date(`${to}T00:00:00`);
    fin.setDate(fin.getDate() + 1);
    q = q.lt('created_at', fin.toISOString());
  }
  const { data, error } = await q;
  if (error) return { data: null, error };
  return { data: data.map(normalizar), error: null };
}

export async function getById(id) {
  const { data, error } = await supabase.from('tasks').select(CAMPOS).eq('id', id).single();
  return error ? { data: null, error } : { data: normalizar(data), error: null };
}

/**
 * Crea o actualiza la tarea con responsables y recursos en una transaccion.
 * `assignees` / `resources` en null = no tocarlos.
 */
export async function save(id, data, { assignees = null, resources = null } = {}) {
  return supabase.rpc('save_task', {
    p_id: id || null,
    p_data: data,
    p_assignees: assignees,
    p_resources: resources,
  });
}

/** Cambio de estado desde el Kanban. El trigger pone las horas. */
export async function setStatus(id, status) {
  const { data, error } = await supabase
    .from('tasks').update({ status }).eq('id', id).select(CAMPOS);
  if (error) return { data: null, error };
  // RLS no da error al bloquear un update: simplemente no toca la fila.
  if (!data.length) return { data: null, error: { code: '42501' } };
  return { data: normalizar(data[0]), error: null };
}

export async function remove(id) {
  return supabase.from('tasks').delete().eq('id', id);
}

/** Quien puede editar: jefe/admin, quien la creo o un responsable. */
export function canEdit(task) {
  if (!task) return true;                       // tarea nueva
  const yo = state.user?.id;
  return isJefe() || task.created_by === yo || task.assignees.includes(yo);
}

export function canDelete(task) {
  return isJefe() || task.created_by === state.user?.id;
}

/**
 * Horas laborales entre inicio y fin (solo dentro del horario de la
 * empresa); null si falta alguna de las dos.
 */
export function hours(task) {
  return workHours(task.started_at, task.finished_at, state.settings);
}

/* --- Tipos de tarea ---------------------------------------------------- */

export async function listTypes() {
  return supabase.from('task_types')
    .select('id, name, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
}

export async function refreshTypes() {
  const { data, error } = await listTypes();
  if (!error) state.taskTypes = data;
  return { data, error };
}

export async function createType(name) {
  const orden = Math.max(0, ...state.taskTypes.map(t => t.sort_order)) + 1;
  return supabase.from('task_types').insert({ name, sort_order: orden }).select().single();
}

export async function updateType(id, patch) {
  return supabase.from('task_types').update(patch).eq('id', id).select().single();
}

export const typeName = id => state.taskTypes.find(t => t.id === id)?.name || null;
