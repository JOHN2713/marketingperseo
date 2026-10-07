/* =====================================================================
   areas.service.js
   Catalogo de areas. Lo usan las tareas (area que solicita) y los
   eventos (areas responsables). Lo mantiene el jefe de area.
   ===================================================================== */
import { supabase } from '../supabase.js';
import { state } from '../store.js';

export async function list() {
  return supabase.from('areas')
    .select('id, name, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
}

export async function refresh() {
  const { data, error } = await list();
  if (!error) state.areas = data;
  return { data, error };
}

export async function create(name) {
  const orden = Math.max(0, ...state.areas.map(a => a.sort_order)) + 1;
  return supabase.from('areas').insert({ name, sort_order: orden }).select().single();
}

export async function update(id, patch) {
  return supabase.from('areas').update(patch).eq('id', id).select().single();
}

export const areaName = id => state.areas.find(a => a.id === id)?.name || null;
