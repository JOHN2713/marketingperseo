/* =====================================================================
   audit.service.js
   Lectura del registro de auditoria. Solo el admin recibe filas (RLS) y
   nadie escribe desde aqui: lo llena el trigger audit_row en Postgres.
   ===================================================================== */
import { supabase } from '../supabase.js';

export const PAGINA = 100;

/**
 * @param {object} f
 * @param {string} [f.from]    'YYYY-MM-DD' local, incluido
 * @param {string} [f.to]      'YYYY-MM-DD' local, incluido
 * @param {string} [f.actor]   id de perfil
 * @param {string[]} [f.tables]
 * @param {string} [f.action]  INSERT | UPDATE | DELETE
 * @param {string} [f.q]       busca en el nombre del registro y su contexto
 * @param {number} [f.before]  id del ultimo registro ya cargado (paginacion)
 */
export async function list({ from, to, actor, tables, action, q, before } = {}) {
  let query = supabase
    .from('audit_log')
    .select('id, at, actor_id, action, table_name, record_id, label, context, changes')
    .order('id', { ascending: false })
    .limit(PAGINA);

  if (from) query = query.gte('at', new Date(`${from}T00:00:00`).toISOString());
  if (to) {
    const fin = new Date(`${to}T00:00:00`);
    fin.setDate(fin.getDate() + 1);
    query = query.lt('at', fin.toISOString());
  }
  if (actor) query = query.eq('actor_id', actor);
  if (tables?.length) query = query.in('table_name', tables);
  if (action) query = query.eq('action', action);
  if (before) query = query.lt('id', before);
  if (q) {
    // % , ( ) y comillas rompen la sintaxis de or(): se quitan del termino.
    const limpio = q.replace(/[%,()"\\]/g, ' ').trim();
    if (limpio) query = query.or(`label.ilike."%${limpio}%",context.ilike."%${limpio}%"`);
  }
  return query;
}
