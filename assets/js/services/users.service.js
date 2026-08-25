/* =====================================================================
   users.service.js
   La gente se registra sola. El admin solo cambia roles.
   ===================================================================== */
import { supabase } from '../supabase.js';

const CAMPOS = 'id, email, full_name, role, created_at';

export async function list() {
  return supabase.from('profiles').select(CAMPOS).order('created_at', { ascending: true });
}

export async function updateRole(id, role) {
  return supabase.from('profiles').update({ role }).eq('id', id).select(CAMPOS).single();
}

export async function updateName(id, full_name) {
  return supabase.from('profiles').update({ full_name }).eq('id', id).select(CAMPOS).single();
}

/**
 * Cuantos admins quedan. Se consulta antes de degradar a alguien: si el
 * sistema se queda sin administrador, nadie puede editar plantillas y hay
 * que volver al SQL Editor de Supabase para arreglarlo.
 */
export async function adminCount() {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin');
  return { count, error };
}
