// Configuracion del proyecto de Supabase.
// La anon key es publica por diseno: toda la seguridad la aplica RLS en Postgres.
// La service_role key NO va aqui ni en ningun archivo del repositorio.
//
// SUPABASE_URL es la URL base del proyecto, sin /rest/v1: supabase-js arma
// esa ruta y las de auth, storage y realtime por su cuenta.
export const SUPABASE_URL      = 'https://ivngjgoxhqywclwmozml.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2bmdqZ294aHF5d2Nsd21vem1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2OTMxMDgsImV4cCI6MjEwMzI2OTEwOH0.fVY3lbpEd1ioIiAf5NLl_6Hwhyr6ensSPsfrpmUfUsk';

// Solo se pueden registrar correos de este dominio. La regla real la aplica
// el trigger guard_email_domain (supabase/tasks.sql); si cambias uno, cambia
// el otro. Vacio = sin restriccion en el formulario.
export const ALLOWED_EMAIL_DOMAIN = 'perseo.ec';
