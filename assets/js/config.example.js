// Copia este archivo como config.js y completa los valores.
// La anon key es publica por diseno: toda la seguridad la aplica RLS en Postgres.
// La service_role key NO va aqui ni en ningun archivo del repositorio.
export const SUPABASE_URL      = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_ANON_KEY = 'TU-ANON-KEY';

// Solo se pueden registrar correos de este dominio. La regla real la aplica
// el trigger guard_email_domain (supabase/tasks.sql); si cambias uno, cambia
// el otro. Vacio = sin restriccion en el formulario.
export const ALLOWED_EMAIL_DOMAIN = 'perseo.ec';
