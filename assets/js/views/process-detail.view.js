/* =====================================================================
   process-detail.view.js · El corazon de la app
   Cabecera con la cinta, checklist editable en linea, drag & drop.
   ===================================================================== */
import { state, isAdmin, nombreDe } from '../store.js';
import * as processesService from '../services/processes.service.js';
import * as stepsService from '../services/steps.service.js';
import { navigate } from '../router.js';
import {
  esc, pill, ribbon, empty, skeleton, fmtRange, fmtDate,
  toLocalInput, fromLocalInput, daysOverdue, debounce, saveState,
  toast, traducir, openModal, confirmAction, confirmTyped, isValidUrl, ETIQUETA,
} from '../ui.js';

const ESTADOS_PASO   = ['pendiente', 'en_curso', 'bloqueado', 'completado', 'omitido'];
const PRIORIDADES    = ['baja', 'media', 'alta', 'urgente'];
const TIPOS_SUGERIDOS = ['Estrategia','Contenido','Diseño','Web','Técnico','Email','Ads','Ejecución','Análisis'];

let proceso = null;
let pasos = [];
let abierto = null;        // id del paso expandido; solo uno a la vez
let filtro = 'todos';
let sortable = null;
let raiz = null;

export async function render(root, { params, query } = { params: [], query: new URLSearchParams() }) {
  raiz = root;
  const id = params[0];
  abierto = query.get('paso') || null;
  filtro = 'todos';

  root.innerHTML = skeleton(6);

  const [procRes, pasosRes] = await Promise.all([
    processesService.getById(id),
    stepsService.listByProcess(id),
  ]);

  if (procRes.error) {
    root.innerHTML = empty({
      title: 'No se encontró el proceso',
      text: traducir(procRes.error),
      actionHtml: '<a class="btn btn--primary" href="#/procesos">Volver a procesos</a>',
    });
    return;
  }

  proceso = procRes.data;
  pasos = pasosRes.data || [];

  pintar();

  if (abierto) {
    const el = root.querySelector(`[data-step-id="${CSS.escape(abierto)}"]`);
    if (el) { expandir(el, abierto); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
}

export function destroy() {
  sortable?.destroy();
  sortable = null;
  proceso = null;
  pasos = [];
  abierto = null;
}

/* =====================================================================
   Pintado
   ===================================================================== */

function pintar() {
  const puedeBorrar = proceso.owner_id === state.user.id || isAdmin();
  const pct = Number(proceso.progress_override ?? proceso.progress);
  const manual = proceso.progress_override !== null && proceso.progress_override !== undefined;
  const hechos = pasos.filter(s => s.status === 'completado').length;
  const contables = pasos.filter(s => s.status !== 'omitido').length;

  raiz.innerHTML = `
    <a class="btn btn--ghost btn--sm" href="#/procesos" style="margin-left:calc(var(--s-3) * -1)">&larr; Procesos</a>

    <div class="view__head mt-4">
      <div class="grow">
        <h1 class="view__title" id="p-name">${esc(proceso.name)}</h1>
        <p class="view__sub">
          ${proceso.template ? `Plantilla: ${esc(proceso.template.name)}` : 'Sin plantilla'}
          · <span class="data">${esc(fmtRange(proceso.start_date, proceso.end_date))}</span>
        </p>
        ${proceso.description ? `<p class="sm muted mt-4" style="max-width:60ch">${esc(proceso.description)}</p>` : ''}
        <div class="row-wrap mt-4">
          ${pill(proceso.status)} ${pill(proceso.priority)}
          ${proceso.resource_url
            ? `<a class="tag" href="${esc(proceso.resource_url)}" target="_blank" rel="noopener">🔗 Recurso</a>` : ''}
          <button class="btn btn--secondary btn--sm" id="btn-editar">Editar proceso</button>
          ${puedeBorrar ? '<button class="btn btn--danger btn--sm" id="btn-borrar">Eliminar</button>' : ''}
        </div>
      </div>

      <div class="card progress-box" id="p-progress">
        <div class="progress-box__pct">${Math.round(pct)}%</div>
        <div class="progress-box__meta">${hechos} de ${contables} pasos</div>
        ${manual ? `<div class="progress-box__override">ajustado a mano · calculado ${Math.round(Number(proceso.progress))}%</div>` : ''}
      </div>
    </div>

    <div class="mt-4" id="p-ribbon"></div>

    <div class="toolbar mt-5">
      <div class="chips" id="p-chips"></div>
      <span class="grow"></span>
      <button class="btn btn--primary btn--sm" id="btn-add">+ Paso</button>
    </div>

    <section class="card" id="p-steps"></section>`;

  raiz.querySelector('#btn-editar').addEventListener('click', abrirEditarProceso);
  raiz.querySelector('#btn-borrar')?.addEventListener('click', borrarProceso);
  raiz.querySelector('#btn-add').addEventListener('click', () => agregarPaso(null));

  pintarRibbon();
  pintarChips();
  pintarPasos();
}

function pintarRibbon() {
  const host = raiz.querySelector('#p-ribbon');
  if (!host) return;
  host.innerHTML = pasos.length ? ribbon(pasos) : '';
  host.querySelectorAll('[data-ribbon-step]').forEach(seg => {
    seg.addEventListener('click', () => {
      const id = seg.dataset.ribbonStep;
      const el = raiz.querySelector(`[data-step-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      expandir(el, id);
    });
  });
}

function pintarProgreso() {
  const host = raiz.querySelector('#p-progress');
  if (!host) return;
  const pct = Number(proceso.progress_override ?? proceso.progress);
  const manual = proceso.progress_override !== null && proceso.progress_override !== undefined;
  const hechos = pasos.filter(s => s.status === 'completado').length;
  const contables = pasos.filter(s => s.status !== 'omitido').length;
  host.innerHTML = `
    <div class="progress-box__pct">${Math.round(pct)}%</div>
    <div class="progress-box__meta">${hechos} de ${contables} pasos</div>
    ${manual ? `<div class="progress-box__override">ajustado a mano · calculado ${Math.round(Number(proceso.progress))}%</div>` : ''}`;
}

function contarFiltro(nombre) {
  return pasos.filter(s => pasaFiltro(s, nombre)).length;
}

function pasaFiltro(s, f = filtro) {
  if (f === 'pendientes') return !['completado', 'omitido'].includes(s.status);
  if (f === 'vencidos')   return !['completado', 'omitido'].includes(s.status)
                                 && s.end_date && daysOverdue(s.end_date) > 0;
  if (f === 'mios')       return s.assignee_id === state.user.id;
  return true;
}

function pintarChips() {
  const host = raiz.querySelector('#p-chips');
  const defs = [
    ['todos', 'Todos'],
    ['pendientes', 'Pendientes'],
    ['vencidos', 'Vencidos'],
    ['mios', 'Mis pasos'],
  ];
  host.innerHTML = defs.map(([key, label]) => {
    const n = contarFiltro(key);
    return `<button class="chip" type="button" data-filtro="${key}" aria-pressed="${filtro === key}">
      ${esc(label)}${key !== 'todos' && n ? ` <span class="chip__count">${n}</span>` : ''}
    </button>`;
  }).join('');

  host.querySelectorAll('[data-filtro]').forEach(b => {
    b.addEventListener('click', () => {
      filtro = b.dataset.filtro;
      pintarChips();
      pintarPasos();
    });
  });
}

/* =====================================================================
   Lista de pasos
   ===================================================================== */

function pintarPasos() {
  const host = raiz.querySelector('#p-steps');

  if (!pasos.length) {
    sortable?.destroy(); sortable = null;
    host.innerHTML = empty({
      title: 'Todavía no hay pasos en este proceso',
      text: 'Agrega el primero y el checklist empieza a tomar forma.',
      actionHtml: '<button class="btn btn--primary" id="btn-vacio">Agregar paso</button>',
    });
    host.querySelector('#btn-vacio').addEventListener('click', () => agregarPaso(null));
    return;
  }

  const visibles = pasos.filter(s => pasaFiltro(s));

  if (!visibles.length) {
    sortable?.destroy(); sortable = null;
    host.innerHTML = empty({
      title: 'Ningún paso en este filtro',
      text: 'Cambia de pestaña para ver el resto del checklist.',
    });
    return;
  }

  const arrastrable = filtro === 'todos';

  host.innerHTML = `
    ${arrastrable ? '' : '<div class="card__body xs muted">Para reordenar, vuelve a “Todos”.</div>'}
    <div class="steps" id="steps-list">
      ${visibles.map(s => filaPaso(s, pasos.indexOf(s))).join(arrastrable ? gap() : '')}
    </div>
    <datalist id="tipos">${tipos().map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>`;

  const lista = host.querySelector('#steps-list');
  lista.addEventListener('click', onClickLista);
  lista.addEventListener('keydown', onKeyLista);

  activarSortable(lista, arrastrable);

  if (abierto && pasos.some(s => s.id === abierto && pasaFiltro(s))) {
    const el = lista.querySelector(`[data-step-id="${CSS.escape(abierto)}"]`);
    if (el) expandir(el, abierto, false);
  }
}

function gap() {
  return '<div class="gap"><button class="gap__btn" type="button" data-gap aria-label="Agregar paso aquí">+</button></div>';
}

function tipos() {
  const usados = pasos.map(s => s.type).filter(Boolean);
  return [...new Set([...usados, ...TIPOS_SUGERIDOS])].sort();
}

function filaPaso(s, index) {
  return `<article class="step step--${esc(s.status)}" data-step-id="${esc(s.id)}" data-open="false">
    <div class="step__main">${filaInterior(s, index)}</div>
  </article>`;
}

function filaInterior(s, index) {
  const retraso = daysOverdue(s.end_date);
  const vencido = !['completado', 'omitido'].includes(s.status) && retraso !== null && retraso > 0;
  const hoy     = !['completado', 'omitido'].includes(s.status) && retraso === 0;
  const recordatorio = s.reminder_at && new Date(s.reminder_at) <= new Date()
                       && !['completado', 'omitido'].includes(s.status);

  const clase = vencido ? ' step__dates--vencido' : hoy ? ' step__dates--hoy' : '';
  const quien = nombreDe(s.assignee_id);

  return `
    <button class="step__grip" type="button" data-grip
            aria-label="Reordenar: ${esc(s.title)}. Usa Ctrl y las flechas."
            title="Arrastra, o Ctrl + flechas">⠿</button>

    <input class="step__check" type="checkbox" data-check
           ${s.status === 'completado' ? 'checked' : ''}
           aria-label="Marcar como completado: ${esc(s.title)}">

    <span class="step__num">${String(index + 1).padStart(2, '0')}</span>
    <span class="step__title">${esc(s.title)}</span>

    ${s.type ? `<span class="tag plist__hide">${esc(s.type)}</span>` : ''}

    <span class="step__dates${clase}">
      ${vencido || hoy ? `<span class="dot dot--${vencido ? 'vencido' : 'vence_hoy'}"></span>` : ''}
      ${recordatorio ? '<span title="Recordatorio cumplido">🔔</span>' : ''}
      ${esc(fmtRange(s.start_date, s.end_date))}
    </span>

    ${quien ? `<span class="step__who plist__hide">${esc(quien)}</span>` : ''}
    ${pill(s.status)}

    <button class="icon-btn" type="button" data-toggle aria-label="Ver detalle del paso" aria-expanded="false">
      <svg class="step__caret" width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>`;
}

function panelPaso(s) {
  const puedeBorrar = true;   // equipo compartido: cualquiera edita pasos
  return `
    <div class="step__panel">
      <div class="field">
        <label for="t-${esc(s.id)}">T&iacute;tulo</label>
        <input class="input" id="t-${esc(s.id)}" type="text" data-f="title" value="${esc(s.title)}">
        <span class="saving" data-saving="title"></span>
      </div>

      <div class="field">
        <label for="d-${esc(s.id)}">Descripci&oacute;n</label>
        <textarea class="textarea" id="d-${esc(s.id)}" data-f="description"
                  placeholder="Qué implica este paso">${esc(s.description)}</textarea>
        <span class="saving" data-saving="description"></span>
      </div>

      <div class="field">
        <label for="o-${esc(s.id)}">Observaciones</label>
        <textarea class="textarea" id="o-${esc(s.id)}" data-f="observations"
                  placeholder="Notas de quien lo ejecuta">${esc(s.observations)}</textarea>
        <span class="saving" data-saving="observations"></span>
      </div>

      <div class="step__fields">
        <div class="field">
          <label for="s-${esc(s.id)}">Estado</label>
          <select class="select" id="s-${esc(s.id)}" data-f="status">
            ${ESTADOS_PASO.map(v => `<option value="${v}"${v === s.status ? ' selected' : ''}>${ETIQUETA[v]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="pr-${esc(s.id)}">Prioridad</label>
          <select class="select" id="pr-${esc(s.id)}" data-f="priority">
            ${PRIORIDADES.map(v => `<option value="${v}"${v === s.priority ? ' selected' : ''}>${ETIQUETA[v]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="ty-${esc(s.id)}">Tipo</label>
          <input class="input" id="ty-${esc(s.id)}" type="text" list="tipos" data-f="type" value="${esc(s.type)}">
        </div>
        <div class="field">
          <label for="as-${esc(s.id)}">Responsable</label>
          <select class="select" id="as-${esc(s.id)}" data-f="assignee_id">
            <option value="">Sin asignar</option>
            ${state.profiles.map(p => `<option value="${esc(p.id)}"${p.id === s.assignee_id ? ' selected' : ''}>${esc(p.full_name || p.email)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="sd-${esc(s.id)}">Inicio</label>
          <input class="input" id="sd-${esc(s.id)}" type="date" data-f="start_date" value="${esc(s.start_date)}">
        </div>
        <div class="field">
          <label for="ed-${esc(s.id)}">Fin</label>
          <input class="input" id="ed-${esc(s.id)}" type="date" data-f="end_date" value="${esc(s.end_date)}">
        </div>
        <div class="field">
          <label for="rm-${esc(s.id)}">Recordatorio</label>
          <input class="input" id="rm-${esc(s.id)}" type="datetime-local" data-f="reminder_at"
                 value="${esc(toLocalInput(s.reminder_at))}">
        </div>
        <div class="field">
          <label for="ru-${esc(s.id)}">Link del recurso</label>
          <input class="input" id="ru-${esc(s.id)}" type="url" data-f="resource_url"
                 placeholder="https://" value="${esc(s.resource_url)}">
          <span class="saving" data-saving="resource_url"></span>
        </div>
      </div>

      <p class="error-text" data-step-error role="alert"></p>

      <div class="step__actions">
        ${s.resource_url ? `<a class="btn btn--secondary btn--sm" href="${esc(s.resource_url)}" target="_blank" rel="noopener">Abrir recurso</a>` : ''}
        <button class="btn btn--secondary btn--sm" type="button" data-dup>Duplicar</button>
        ${puedeBorrar ? '<button class="btn btn--danger btn--sm" type="button" data-del>Eliminar</button>' : ''}
        <span class="grow"></span>
        ${s.completed_at ? `<span class="xs dim">Completado el ${esc(fmtDate(s.completed_at.slice(0, 10), true))}</span>` : ''}
      </div>
    </div>`;
}

/* =====================================================================
   Interaccion
   ===================================================================== */

function onClickLista(e) {
  const gapBtn = e.target.closest('[data-gap]');
  if (gapBtn) {
    const previa = gapBtn.closest('.gap').previousElementSibling;
    const s = pasoDe(previa);
    agregarPaso(s ? s.sort_order : null);
    return;
  }

  const art = e.target.closest('.step');
  if (!art) return;
  const s = pasoDe(art);
  if (!s) return;

  if (e.target.closest('[data-check]')) { cambiarEstadoDesdeCheck(art, s, e.target.checked); return; }
  if (e.target.closest('[data-toggle]')) { alternar(art, s.id); return; }
  if (e.target.closest('[data-dup]')) { duplicarPaso(s); return; }
  if (e.target.closest('[data-del]')) { borrarPaso(s); return; }

  // Clic en la zona muerta de la fila: tambien abre. El asa y los controles no.
  if (e.target.closest('.step__main') && !e.target.closest('button, input, select, a')) {
    alternar(art, s.id);
  }
}

/** Alternativa por teclado al drag & drop: Ctrl + flechas sobre el asa. */
function onKeyLista(e) {
  if (!e.ctrlKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const grip = e.target.closest('[data-grip]');
  if (!grip) return;
  e.preventDefault();

  const art = grip.closest('.step');
  const s = pasoDe(art);
  const i = pasos.findIndex(x => x.id === s.id);
  const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
  if (j < 0 || j >= pasos.length) return;

  const copia = [...pasos];
  copia.splice(j, 0, copia.splice(i, 1)[0]);
  guardarOrden(copia.map(x => x.id), s.id);
}

function pasoDe(el) {
  const id = el?.dataset?.stepId;
  return id ? pasos.find(s => s.id === id) : null;
}

function alternar(art, id) {
  if (art.dataset.open === 'true') { colapsar(art); abierto = null; return; }
  raiz.querySelectorAll('.step[data-open="true"]').forEach(colapsar);
  expandir(art, id);
}

function colapsar(art) {
  art.dataset.open = 'false';
  art.querySelector('.step__panel')?.remove();
  art.querySelector('[data-toggle]')?.setAttribute('aria-expanded', 'false');
}

function expandir(art, id, cerrarOtros = true) {
  if (cerrarOtros) raiz.querySelectorAll('.step[data-open="true"]').forEach(colapsar);
  const s = pasos.find(x => x.id === id);
  if (!s || art.dataset.open === 'true') return;

  art.insertAdjacentHTML('beforeend', panelPaso(s));
  art.dataset.open = 'true';
  art.querySelector('[data-toggle]')?.setAttribute('aria-expanded', 'true');
  abierto = id;
  conectarPanel(art, s);
}

/* --- Guardado de campos ------------------------------------------------ */

function conectarPanel(art, s) {
  const err = art.querySelector('[data-step-error]');

  // Texto: debounce de 800 ms con indicador junto al campo (doc 03 F10).
  art.querySelectorAll('[data-f="title"], [data-f="description"], [data-f="observations"], [data-f="resource_url"], [data-f="type"]')
    .forEach(el => {
      const campo = el.dataset.f;
      const marca = art.querySelector(`[data-saving="${campo}"]`);
      const guardar = debounce(async () => {
        const valor = el.value.trim();

        if (campo === 'title' && !valor) { err.textContent = 'El paso necesita un título.'; return; }
        if (campo === 'resource_url' && !isValidUrl(valor)) {
          err.textContent = 'El link debe empezar con http:// o https://';
          saveState(marca, 'error');
          return;
        }
        err.textContent = '';

        saveState(marca, 'saving');
        const { data, error } = await stepsService.update(s.id, { [campo]: valor || null });
        if (error) { saveState(marca, 'error'); toast.error(traducir(error)); return; }

        saveState(marca, 'saved');
        aplicar(data);
        if (campo === 'title' || campo === 'type') refrescarFila(data);
      }, 800);

      el.addEventListener('input', guardar);
      el.addEventListener('blur', () => guardar.flush());
    });

  // Selectores y fechas: guardado inmediato.
  art.querySelectorAll('[data-f="status"], [data-f="priority"], [data-f="assignee_id"], [data-f="start_date"], [data-f="end_date"], [data-f="reminder_at"]')
    .forEach(el => {
      el.addEventListener('change', async () => {
        const campo = el.dataset.f;
        let valor = el.value || null;
        if (campo === 'reminder_at') valor = fromLocalInput(el.value);

        // La base tiene el mismo check, pero avisar antes evita el viaje.
        const inicio = campo === 'start_date' ? valor : art.querySelector('[data-f="start_date"]').value || null;
        const fin    = campo === 'end_date'   ? valor : art.querySelector('[data-f="end_date"]').value || null;
        if (inicio && fin && fin < inicio) {
          err.textContent = 'La fecha de fin no puede ser anterior a la de inicio.';
          el.value = campo === 'end_date' ? (s.end_date || '') : (s.start_date || '');
          return;
        }
        err.textContent = '';

        const { data, error } = await stepsService.update(s.id, { [campo]: valor });
        if (error) { toast.error(traducir(error)); return; }

        aplicar(data);
        refrescarFila(data);
        if (campo === 'status') await trasCambioDeEstado();
        else { pintarRibbon(); pintarChips(); }
      });
    });
}

/** Deja la version del servidor en el array local. */
function aplicar(step) {
  const i = pasos.findIndex(s => s.id === step.id);
  if (i >= 0) pasos[i] = { ...pasos[i], ...step };
  return pasos[i];
}

/** Repinta solo la cabecera de la fila. El panel abierto queda intacto. */
function refrescarFila(step) {
  const art = raiz.querySelector(`[data-step-id="${CSS.escape(step.id)}"]`);
  if (!art) return;
  const abiertoAhora = art.dataset.open === 'true';
  art.className = `step step--${step.status}`;
  art.querySelector('.step__main').innerHTML = filaInterior(step, pasos.findIndex(s => s.id === step.id));
  art.querySelector('[data-toggle]')?.setAttribute('aria-expanded', String(abiertoAhora));
}

async function cambiarEstadoDesdeCheck(art, s, marcado) {
  const nuevo = marcado ? 'completado' : 'pendiente';
  const { data, error } = await stepsService.updateStatus(s.id, nuevo);
  if (error) {
    toast.error('No se pudo cambiar el estado. ' + traducir(error));
    art.querySelector('[data-check]').checked = s.status === 'completado';
    return;
  }
  aplicar(data);
  refrescarFila(data);

  // Si el panel esta abierto, su selector de estado tiene que reflejarlo.
  const sel = art.querySelector('[data-f="status"]');
  if (sel) sel.value = data.status;

  await trasCambioDeEstado();
}

/** El trigger recalculo el progreso en Postgres: hay que volver a leerlo. */
async function trasCambioDeEstado() {
  pintarRibbon();
  pintarChips();
  const { data, error } = await processesService.getById(proceso.id);
  if (!error && data) { proceso = data; pintarProgreso(); }
  await processesService.refreshAttention();
}

/* --- Alta, duplicado y baja de pasos ------------------------------------ */

async function agregarPaso(afterOrder) {
  const { data, error } = await stepsService.insertAt(proceso.id, afterOrder);
  if (error) return toast.error('No se pudo agregar el paso. ' + traducir(error));

  const { data: frescos } = await stepsService.listByProcess(proceso.id);
  pasos = frescos || pasos;
  abierto = data.id;
  pintarPasos();
  pintarRibbon();
  pintarChips();

  const art = raiz.querySelector(`[data-step-id="${CSS.escape(data.id)}"]`);
  if (art) {
    expandir(art, data.id);
    art.scrollIntoView({ block: 'center', behavior: 'smooth' });
    art.querySelector('[data-f="title"]')?.select();
  }
}

async function duplicarPaso(s) {
  const { data, error } = await stepsService.duplicate(s.id);
  if (error) return toast.error('No se pudo duplicar el paso. ' + traducir(error));

  const { data: frescos } = await stepsService.listByProcess(proceso.id);
  pasos = frescos || pasos;
  abierto = data.id;
  pintarPasos();
  pintarRibbon();
  pintarChips();
  toast.success('Paso duplicado');
}

async function borrarPaso(s) {
  const ok = await confirmAction({
    title: 'Eliminar paso',
    message: `Se elimina “${s.title}” con sus observaciones. No se puede deshacer.`,
  });
  if (!ok) return;

  const { error } = await stepsService.remove(s.id);
  if (error) return toast.error('No se pudo eliminar el paso. ' + traducir(error));

  pasos = pasos.filter(x => x.id !== s.id);
  if (abierto === s.id) abierto = null;
  pintarPasos();
  await trasCambioDeEstado();
  toast.success('Paso eliminado');
}

/* --- Reordenar ---------------------------------------------------------- */

function activarSortable(lista, habilitado) {
  sortable?.destroy();
  sortable = null;
  if (!habilitado || !window.Sortable) return;

  sortable = window.Sortable.create(lista, {
    handle: '.step__grip',
    draggable: '.step',
    animation: 150,
    ghostClass: 'step--ghost',
    chosenClass: 'step--chosen',
    dragClass: 'step--drag',
    delay: 200,
    delayOnTouchOnly: true,          // en movil no pelea con el scroll
    onEnd: () => {
      const ids = [...lista.querySelectorAll('[data-step-id]')].map(el => el.dataset.stepId);
      guardarOrden(ids);
    },
  });
}

async function guardarOrden(ids, focoEn = null) {
  const { error } = await stepsService.reorder(proceso.id, ids);
  if (error) {
    toast.error('No se pudo guardar el nuevo orden. Se restauró el anterior.');
  } else {
    // Se relee de la base en vez de deshacer a mano: la base manda.
    const { data } = await stepsService.listByProcess(proceso.id);
    if (data) pasos = data;
  }

  pintarPasos();
  pintarRibbon();

  if (focoEn) {
    const art = raiz.querySelector(`[data-step-id="${CSS.escape(focoEn)}"]`);
    art?.querySelector('[data-grip]')?.focus();
    art?.scrollIntoView({ block: 'nearest' });
  }
}

/* --- Editar y eliminar el proceso --------------------------------------- */

function abrirEditarProceso() {
  const p = proceso;
  openModal({
    title: 'Editar proceso',
    body: `
      <div class="field">
        <label for="ep-name">Nombre</label>
        <input class="input" id="ep-name" type="text" value="${esc(p.name)}">
      </div>
      <div class="field">
        <label for="ep-desc">Descripci&oacute;n</label>
        <textarea class="textarea" id="ep-desc">${esc(p.description)}</textarea>
      </div>
      <div class="step__fields">
        <div class="field">
          <label for="ep-status">Estado</label>
          <select class="select" id="ep-status">
            ${['planificado','en_curso','pausado','completado','cancelado']
              .map(v => `<option value="${v}"${v === p.status ? ' selected' : ''}>${ETIQUETA[v]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="ep-priority">Prioridad</label>
          <select class="select" id="ep-priority">
            ${PRIORIDADES.map(v => `<option value="${v}"${v === p.priority ? ' selected' : ''}>${ETIQUETA[v]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="ep-start">Inicio</label>
          <input class="input" id="ep-start" type="date" value="${esc(p.start_date)}">
        </div>
        <div class="field">
          <label for="ep-end">Fin</label>
          <input class="input" id="ep-end" type="date" value="${esc(p.end_date)}">
        </div>
      </div>
      <div class="field">
        <label for="ep-url">Link del recurso</label>
        <input class="input" id="ep-url" type="url" placeholder="https://" value="${esc(p.resource_url)}">
      </div>
      <div class="field">
        <label for="ep-override">Avance manual (%)</label>
        <input class="input" id="ep-override" type="number" min="0" max="100" step="1"
               placeholder="Vacío = usar el calculado" value="${p.progress_override ?? ''}">
        <span class="xs dim">Solo si el avance real no coincide con el conteo de pasos. El calculado sigue visible.</span>
      </div>
      <p class="error-text" id="ep-error" role="alert"></p>`,
    actions: [
      { label: 'Cancelar', variant: 'ghost', onClick: ({ close }) => close() },
      { label: 'Guardar', variant: 'primary', onClick: guardar },
    ],
  });

  async function guardar({ modal, close, btn }) {
    const err = modal.querySelector('#ep-error');
    err.textContent = '';

    const nombre = modal.querySelector('#ep-name').value.trim();
    const inicio = modal.querySelector('#ep-start').value || null;
    const fin    = modal.querySelector('#ep-end').value || null;
    const url    = modal.querySelector('#ep-url').value.trim();
    const ovRaw  = modal.querySelector('#ep-override').value.trim();

    if (!nombre) { err.textContent = 'El proceso necesita un nombre.'; return; }
    if (inicio && fin && fin < inicio) { err.textContent = 'La fecha de fin no puede ser anterior a la de inicio.'; return; }
    if (!isValidUrl(url)) { err.textContent = 'El link debe empezar con http:// o https://'; return; }

    const override = ovRaw === '' ? null : Math.max(0, Math.min(100, Number(ovRaw)));
    if (override !== null && Number.isNaN(override)) { err.textContent = 'El avance manual debe ser un número entre 0 y 100.'; return; }

    btn.disabled = true;
    const { data, error } = await processesService.update(p.id, {
      name: nombre,
      description: modal.querySelector('#ep-desc').value.trim() || null,
      status: modal.querySelector('#ep-status').value,
      priority: modal.querySelector('#ep-priority').value,
      start_date: inicio,
      end_date: fin,
      resource_url: url || null,
      progress_override: override,
    });
    btn.disabled = false;

    if (error) { err.textContent = traducir(error); return; }

    proceso = data;
    close();
    toast.success('Guardado');
    pintar();
    await processesService.refreshAttention();
  }
}

async function borrarProceso() {
  const ok = await confirmTyped({
    title: 'Eliminar proceso',
    message: `Se eliminan también sus ${pasos.length} pasos con todas las observaciones. No se puede deshacer.`,
    expected: proceso.name,
  });
  if (!ok) return;

  const { error } = await processesService.remove(proceso.id);
  if (error) return toast.error('No se pudo eliminar el proceso. ' + traducir(error));

  toast.success('Proceso eliminado');
  await processesService.refreshAttention();
  navigate('#/procesos');
}
