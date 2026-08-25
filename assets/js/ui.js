/* =====================================================================
   ui.js · Avisos, modales, confirmaciones, fechas y traduccion de errores
   No conoce Supabase. Solo DOM y formato.
   ===================================================================== */

/* --- Texto ---------------------------------------------------------- */

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function debounce(fn, ms = 800) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

/* --- Fechas ---------------------------------------------------------
   Las columnas `date` llegan como 'YYYY-MM-DD'. Pasarlas por new Date()
   las interpreta como UTC y en Ecuador (UTC-5) restan un dia. Se parsean
   a mano para que el 15 de noviembre siga siendo el 15 de noviembre.
   ------------------------------------------------------------------- */

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

export function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function today() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function fmtDate(iso, withYear = false) {
  const d = parseDate(iso);
  if (!d) return '—';
  const base = `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

export function fmtRange(from, to) {
  if (!from && !to) return '—';
  const year = new Date().getFullYear();
  const cross = [from, to].some(v => v && parseDate(v).getFullYear() !== year);
  if (!to)   return fmtDate(from, cross);
  if (!from) return `hasta ${fmtDate(to, cross)}`;
  return `${fmtDate(from, cross)} → ${fmtDate(to, cross)}`;
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${hh}:${mm}`;
}

/** Convierte un timestamptz al valor que espera <input type="datetime-local">. */
export function toLocalInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Y de vuelta: el valor local del input a ISO con zona horaria. */
export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d) ? null : d.toISOString();
}

export function relative(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1)   return 'hace un momento';
  if (min < 60)  return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24)    return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1)   return 'ayer';
  if (d < 30)    return `hace ${d} días`;
  return fmtDate(new Date(ts).toISOString().slice(0, 10), true);
}

/** Dias de retraso respecto de hoy. Negativo = todavia no vence. */
export function daysOverdue(endDate) {
  const d = parseDate(endDate);
  if (!d) return null;
  const t = parseDate(today());
  return Math.round((t - d) / 86400000);
}

/* --- Traduccion de errores ------------------------------------------ */

const CODIGOS = {
  '42501':    'No tienes permiso para hacer este cambio.',
  '23505':    'Ya existe un registro con ese nombre.',
  '23503':    'Ese elemento está en uso y no se puede eliminar.',
  '23514':    'Alguno de los datos está fuera de rango. Revisa fechas y porcentajes.',
  'PGRST116': 'No se encontró el registro. Puede que alguien lo haya eliminado.',
  'P0002':    'No se encontró el registro. Puede que alguien lo haya eliminado.',
};

const MENSAJES = [
  [/invalid login credentials/i,        'Correo o contraseña incorrectos.'],
  [/email not confirmed/i,              'Todavía no confirmas tu correo. Revisa la bandeja de entrada.'],
  [/user already registered/i,          'Ya hay una cuenta con ese correo. Entra en lugar de crearla.'],
  [/password should be at least/i,      'La contraseña necesita al menos 8 caracteres.'],
  [/rate limit|too many requests/i,     'Demasiados intentos seguidos. Espera un minuto.'],
  [/failed to fetch|networkerror/i,     'Sin conexión con el servidor. Revisa tu internet y reintenta.'],
  [/process_steps_date_range/i,         'La fecha de fin no puede ser anterior a la de inicio.'],
  [/administrador puede cambiar el rol/i, 'Solo un administrador puede cambiar el rol de un usuario.'],
];

export function traducir(error) {
  if (!error) return '';
  if (error.code && CODIGOS[error.code]) return CODIGOS[error.code];

  const raw = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  for (const [re, msg] of MENSAJES) if (re.test(raw)) return msg;

  return error.message || 'No se pudo completar la operación. Intenta otra vez.';
}

/* --- Avisos ---------------------------------------------------------- */

function toastsHost() {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.className = 'toasts';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

function pushToast(message, kind) {
  const host = toastsHost();
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="grow">${esc(message)}</span>
    <button class="toast__close" type="button" aria-label="Cerrar">&times;</button>`;

  const close = () => { el.remove(); };
  el.querySelector('.toast__close').addEventListener('click', close);
  host.appendChild(el);

  // El error se queda hasta que el usuario lo cierre: implica reintentar algo.
  if (kind !== 'error') setTimeout(close, 4000);
  return close;
}

export const toast = {
  success: msg => pushToast(msg, 'success'),
  error:   msg => pushToast(msg, 'error'),
  info:    msg => pushToast(msg, 'info'),
};

/* --- Modales ---------------------------------------------------------- */

/**
 * Abre un modal. `body` es HTML. `actions` define los botones del pie.
 * Devuelve { el, close } — `el` es el nodo del modal, para leer sus campos.
 */
export function openModal({ title, body = '', actions = [], onOpen, onClose }) {
  const previousFocus = document.activeElement;

  const scrim = document.createElement('div');
  scrim.className = 'modal-scrim';
  scrim.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal__head"><h2 class="modal__title">${esc(title)}</h2></div>
      <div class="modal__body">${body}</div>
      <div class="modal__foot"></div>
    </div>`;

  const modal = scrim.querySelector('.modal');
  const foot  = scrim.querySelector('.modal__foot');

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    scrim.remove();
    if (previousFocus && previousFocus.focus) previousFocus.focus();
    onClose?.();
  };

  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn--${a.variant || 'secondary'}`;
    btn.textContent = a.label;
    if (a.id) btn.id = a.id;
    if (a.disabled) btn.disabled = true;
    btn.addEventListener('click', () => a.onClick?.({ modal, close, btn }));
    foot.appendChild(btn);
  });

  // Esc cierra, Tab queda atrapado dentro del modal.
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const focusables = modal.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);

  scrim.addEventListener('mousedown', e => { if (e.target === scrim) close(); });

  document.body.appendChild(scrim);
  const firstField = modal.querySelector('input, select, textarea') || foot.querySelector('button');
  if (firstField) firstField.focus();
  onOpen?.({ modal, close });

  return { el: modal, close };
}

/** Confirmacion simple. Resuelve a true si el usuario acepta. */
export function confirmAction({ title, message, confirmText = 'Eliminar', variant = 'danger' }) {
  return new Promise(resolve => {
    let answer = false;
    openModal({
      title,
      body: `<p class="modal__text">${esc(message)}</p>`,
      actions: [
        { label: 'Cancelar', variant: 'ghost', onClick: ({ close }) => close() },
        { label: confirmText, variant, onClick: ({ close }) => { answer = true; close(); } },
      ],
      // Cerrar con Esc o clic fuera cuenta como cancelar.
      onClose: () => resolve(answer),
    });
  });
}

/** Confirmacion escribiendo el nombre exacto. Para lo que arrastra datos. */
export function confirmTyped({ title, message, expected, confirmText = 'Eliminar' }) {
  return new Promise(resolve => {
    let answer = false;
    openModal({
      title,
      body: `
        <p class="modal__text">${esc(message)}</p>
        <div class="field">
          <label for="confirm-typed">Escribe <b>${esc(expected)}</b> para confirmar</label>
          <input class="input" id="confirm-typed" type="text" autocomplete="off">
        </div>`,
      actions: [
        { label: 'Cancelar', variant: 'ghost', onClick: ({ close }) => close() },
        { label: confirmText, variant: 'danger', id: 'confirm-typed-ok',
          onClick: ({ close }) => { answer = true; close(); } },
      ],
      onOpen: ({ modal }) => {
        const input = modal.querySelector('#confirm-typed');
        const ok    = modal.querySelector('#confirm-typed-ok');
        ok.disabled = true;
        input.addEventListener('input', () => { ok.disabled = input.value.trim() !== expected; });
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !ok.disabled) { e.preventDefault(); ok.click(); }
        });
      },
      onClose: () => resolve(answer),
    });
  });
}

/* --- Indicador de guardado ------------------------------------------- */

/** Pinta "Guardando… / Guardado / No se guardó" junto a un campo. */
export function saveState(el, state) {
  if (!el) return;
  el.classList.remove('saving--ok', 'saving--err');
  if (state === 'saving') { el.textContent = 'Guardando…'; return; }
  if (state === 'saved')  {
    el.textContent = 'Guardado';
    el.classList.add('saving--ok');
    setTimeout(() => { if (el.textContent === 'Guardado') el.textContent = ''; }, 2000);
    return;
  }
  if (state === 'error')  { el.textContent = 'No se guardó'; el.classList.add('saving--err'); return; }
  el.textContent = '';
}

/* --- Fragmentos reutilizables ---------------------------------------- */

export const ETIQUETA = {
  pendiente: 'Pendiente', en_curso: 'En curso', bloqueado: 'Bloqueado',
  completado: 'Completado', omitido: 'Omitido',
  planificado: 'Planificado', pausado: 'Pausado', cancelado: 'Cancelado',
  baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente',
};

export function pill(value) {
  if (!value) return '';
  return `<span class="pill pill--${esc(value)}">${esc(ETIQUETA[value] || value)}</span>`;
}

export function bar(pct, done = false) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="bar" role="progressbar" aria-valuenow="${Math.round(v)}" aria-valuemin="0" aria-valuemax="100">
            <div class="bar__fill${done ? ' bar__fill--done' : ''}" style="width:${v}%"></div>
          </div>`;
}

/** Dias que ocupa un paso en el cronograma. Sin fechas, cuenta como uno. */
export function stepDays(step) {
  const a = parseDate(step.start_date);
  const b = parseDate(step.end_date);
  if (!a || !b) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/**
 * Cinta de proceso: un segmento por paso, ancho proporcional a su duracion
 * y color segun estado. Es el elemento distintivo de la interfaz (doc 04).
 * `interactive:false` la dibuja con <span> para poder anidarla dentro de un
 * enlace sin meter un boton dentro de otro control.
 */
export function ribbon(steps, { interactive = true, legend = true } = {}) {
  if (!steps || !steps.length) return '';

  const tag = interactive ? 'button' : 'span';
  const segs = steps.map((s, i) => {
    const num = String(i + 1).padStart(2, '0');
    const label = `${num} · ${s.title} — ${ETIQUETA[s.status] || s.status}`;
    const attrs = interactive
      ? `type="button" data-ribbon-step="${esc(s.id)}" aria-label="${esc(label)}"`
      : 'aria-hidden="true"';
    return `<${tag} class="ribbon__seg ribbon__seg--${esc(s.status)}"
      style="flex-grow:${stepDays(s)}" title="${esc(label)}" ${attrs}></${tag}>`;
  }).join('');

  const claves = ['completado', 'en_curso', 'bloqueado', 'pendiente']
    .map(k => `<span><i class="ribbon__key" style="background:var(--st-${k.replace('_', '-')})"></i>${ETIQUETA[k]}</span>`)
    .join('');

  return `<div class="ribbon">${segs}</div>` +
         (legend ? `<div class="ribbon__legend">${claves}</div>` : '');
}

export function empty({ title, text, actionHtml = '' }) {
  return `<div class="empty">
    <p class="empty__title">${esc(title)}</p>
    <p class="empty__text">${esc(text)}</p>
    ${actionHtml}
  </div>`;
}

export function skeleton(rows = 4) {
  return `<div class="stack">${'<div class="skeleton"></div>'.repeat(rows)}</div>`;
}

export function isValidUrl(value) {
  if (!value) return true;              // vacio es valido: el campo es opcional
  return /^https?:\/\/\S+$/i.test(value.trim());
}
