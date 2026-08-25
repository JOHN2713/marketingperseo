/* =====================================================================
   auth.js · Login, registro, recuperacion y guardia de sesion
   ===================================================================== */
import { supabase } from './supabase.js';
import { state, reset } from './store.js';

export const getSession = () => supabase.auth.getSession();

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password, fullName) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },   // lo lee el trigger handle_new_user
  });
}

export async function signOut() {
  const res = await supabase.auth.signOut();
  reset();
  return res;
}

export async function sendResetEmail(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL('index.html', location.href).href,
  });
}

export async function setNewPassword(password) {
  return supabase.auth.updateUser({ password });
}

/**
 * El enlace del correo de recuperacion vuelve a index.html con `type=recovery`
 * en el hash (o en la query, segun el flujo). Detectarlo evita que la guardia
 * de sesion mande al usuario a app.html antes de que elija su contrasena.
 */
export function isRecoveryFlow() {
  const hash  = new URLSearchParams(location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  return hash.get('type') === 'recovery' || query.get('type') === 'recovery';
}

/**
 * Guardia para app.html: sin sesion, redirige a index.html.
 * Con sesion, deja en el store el usuario y su perfil (rol incluido).
 */
export async function requireSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { location.replace('index.html'); return null; }

  state.user = data.session.user;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .eq('id', state.user.id)
    .single();

  if (error || !profile) {
    // Sin perfil la app no sabe que puede hacer el usuario. Es un estado roto,
    // no una pantalla vacia: se cierra la sesion en vez de fingir que funciona.
    console.error('No se pudo leer el perfil', error);
    await signOut();
    location.replace('index.html');
    return null;
  }

  state.profile = profile;
  return profile;
}

/** Si la sesion caduca o se cierra en otra pestana, se vuelve al login. */
export function watchSession() {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      reset();
      location.replace('index.html');
    }
  });
}
