/* =====================================================================
   steps.service.js
   Los pasos de un proceso. Es lo que mas se escribe en toda la app.
   ===================================================================== */
import { supabase } from '../supabase.js';

const CAMPOS = `
  id, process_id, title, description, sort_order, observations,
  status, priority, type, start_date, end_date, reminder_at,
  resource_url, assignee_id, completed_at, created_at, updated_at
`;

export async function listByProcess(processId) {
  return supabase
    .from('process_steps')
    .select(CAMPOS)
    .eq('process_id', processId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
}

export async function update(id, patch) {
  return supabase.from('process_steps').update(patch).eq('id', id).select(CAMPOS).single();
}

export async function updateStatus(id, status) {
  return update(id, { status });
}

/**
 * Inserta un paso. `afterOrder` nulo lo pone al final; con valor, lo mete
 * justo despues de ese sort_order y corre los siguientes. El hueco lo abre
 * Postgres para que dos personas insertando a la vez no choquen.
 */
export async function insertAt(processId, afterOrder = null, title = 'Paso nuevo') {
  const { data: id, error } = await supabase.rpc('insert_process_step', {
    p_process_id: processId,
    p_title: title,
    p_after_order: afterOrder,
  });
  if (error) return { data: null, error };
  return supabase.from('process_steps').select(CAMPOS).eq('id', id).single();
}

export async function duplicate(stepId) {
  const { data: id, error } = await supabase.rpc('duplicate_process_step', { p_step_id: stepId });
  if (error) return { data: null, error };
  return supabase.from('process_steps').select(CAMPOS).eq('id', id).single();
}

export async function remove(id) {
  return supabase.from('process_steps').delete().eq('id', id);
}

/** Array completo de IDs en su nuevo orden. Una sola llamada, sin carreras. */
export async function reorder(processId, orderedIds) {
  return supabase.rpc('reorder_process_steps', {
    p_process_id: processId,
    p_ordered_ids: orderedIds,
  });
}
