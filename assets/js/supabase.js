import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

if (!SUPABASE_URL || SUPABASE_URL.includes('TU-PROYECTO')) {
  document.body.innerHTML =
    '<main style="font:15px/1.5 system-ui;max-width:520px;margin:15vh auto;padding:24px">' +
    '<h1 style="font-size:20px;margin-bottom:12px">Falta la configuraci&oacute;n</h1>' +
    '<p style="color:#5B5766">Copia <code>assets/js/config.example.js</code> a ' +
    '<code>assets/js/config.js</code> y pega la Project URL y la anon key de tu proyecto ' +
    'de Supabase (Project Settings &rarr; API).</p></main>';
  throw new Error('config.js sin completar');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
