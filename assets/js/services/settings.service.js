/* =====================================================================
   settings.service.js
   Configuracion general (una sola fila): horario laboral con el que se
   mide el tiempo de las tareas y dias tras los que una tarea completada
   pasa al archivo. La edita el jefe de area.
   ===================================================================== */
import { supabase } from '../supabase.js';
import { state } from '../store.js';
import { DEFAULT_SETTINGS } from '../worktime.js';

const CAMPOS = 'id, work_days, work_start, work_end, archive_after_days';

/**
 * Lee la configuracion al cache. Si la tabla aun no existe (falta correr
 * work-hours.sql) la app sigue con los valores por defecto: lun a vie,
 * 09:00–18:00, archivo a los 3 dias.
 */
export async function load() {
  const { data, error } = await supabase.from('app_settings').select(CAMPOS).limit(1).maybeSingle();
  if (error || !data) {
    if (error) console.warn('Sin app_settings; se usan los valores por defecto.', error);
    state.settings = { ...DEFAULT_SETTINGS };
    return { data: state.settings, error };
  }
  state.settings = data;
  return { data, error: null };
}

export async function update(patch) {
  if (!state.settings.id) return { data: null, error: { code: '42P01' } };
  const { data, error } = await supabase
    .from('app_settings').update(patch).eq('id', state.settings.id).select(CAMPOS);
  if (error) return { data: null, error };
  // RLS no da error al bloquear un update: simplemente no toca la fila.
  if (!data.length) return { data: null, error: { code: '42501' } };
  state.settings = data[0];
  return { data: data[0], error: null };
}
