/* =====================================================================
   templates.service.js
   El checklist maestro. Solo el admin escribe; RLS lo hace cumplir.
   ===================================================================== */
import { supabase } from '../supabase.js';
import { state } from '../store.js';

const CAMPOS = `
  id, name, description, icon, color, resource_url, is_active, creates_event,
  created_by, created_at, updated_at
`;

const PASO = `
  id, template_id, title, description, sort_order, type, priority,
  default_duration_days, resource_url
`;

/** Con conteo de pasos, para la lista de plantillas. */
export async function list({ onlyActive = false } = {}) {
  let q = supabase
    .from('process_templates')
    .select(`${CAMPOS}, template_steps ( count )`)
    .order('name');
  if (onlyActive) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) return { data: null, error };

  const rows = data.map(t => ({ ...t, steps_count: t.template_steps?.[0]?.count ?? 0 }));
  return { data: rows, error: null };
}

export async function getById(id) {
  return supabase.from('process_templates').select(CAMPOS).eq('id', id).single();
}

export async function create(payload) {
  return supabase
    .from('process_templates')
    .insert({ ...payload, created_by: state.user.id })
    .select(CAMPOS)
    .single();
}

export async function update(id, patch) {
  return supabase.from('process_templates').update(patch).eq('id', id).select(CAMPOS).single();
}

export async function remove(id) {
  return supabase.from('process_templates').delete().eq('id', id);
}

/** Copia la plantilla y sus pasos. Nace desactivada para revisarla antes de usarla. */
export async function duplicate(id) {
  return supabase.rpc('duplicate_template', { p_template_id: id });
}

/* --- Pasos de la plantilla -------------------------------------------- */

export async function listSteps(templateId) {
  return supabase
    .from('template_steps')
    .select(PASO)
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
}

export async function insertStep(templateId, title = 'Paso nuevo') {
  const { data: id, error } = await supabase.rpc('insert_template_step', {
    p_template_id: templateId,
    p_title: title,
  });
  if (error) return { data: null, error };
  return supabase.from('template_steps').select(PASO).eq('id', id).single();
}

export async function updateStep(id, patch) {
  return supabase.from('template_steps').update(patch).eq('id', id).select(PASO).single();
}

export async function removeStep(id) {
  return supabase.from('template_steps').delete().eq('id', id);
}

export async function reorderSteps(templateId, orderedIds) {
  return supabase.rpc('reorder_template_steps', {
    p_template_id: templateId,
    p_ordered_ids: orderedIds,
  });
}
