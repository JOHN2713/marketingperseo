/* =====================================================================
   template-detail.view.js · Editor de la plantilla (admin)
   Mismo patron de drag & drop que el detalle de proceso, con
   reorder_template_steps en lugar de reorder_process_steps.
   ===================================================================== */
import { state } from '../store.js';
import * as templatesService from '../services/templates.service.js';
import {
  esc, pill, empty, skeleton, debounce, saveState,
  toast, traducir, confirmAction, isValidUrl, ETIQUETA,
} from '../ui.js';

const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];
const TIPOS = ['Estrategia','Contenido','Diseño','Web','Técnico','Email','Ads','Ejecución','Análisis'];

let plantilla = null;
let pasos = [];
let abierto = null;
let sortable = null;
let raiz = null;

export async function render(root, { params } = { params: [] }) {
  raiz = root;
  const id = params[0];
  root.innerHTML = skeleton(6);

  const [tplRes, pasosRes] = await Promise.all([
    templatesService.getById(id),
    templatesService.listSteps(id),
  ]);

  if (tplRes.error) {
    root.innerHTML = empty({
      title: 'No se encontró la plantilla',
      text: traducir(tplRes.error),
      actionHtml: '<a class="btn btn--primary" href="#/plantillas">Volver a plantillas</a>',
    });
    return;
  }

  plantilla = tplRes.data;
  pasos = pasosRes.data || [];
  pintar();
}

export function destroy() {
  sortable?.destroy();
  sortable = null;
  plantilla = null;
  pasos = [];
  abierto = null;
}

function duracionTotal() {
  return pasos.reduce((n, s) => n + (Number(s.default_duration_days) || 0), 0);
}

function pintar() {
  raiz.innerHTML = `
    <a class="btn btn--ghost btn--sm" href="#/plantillas" style="margin-left:calc(var(--s-3) * -1)">&larr; Plantillas</a>

    <div class="view__head mt-4">
      <div class="grow">
        <h1 class="view__title">${esc(plantilla.icon || '')} ${esc(plantilla.name)}</h1>
        <p class="view__sub">
          <span class="data">${pasos.length}</span> pasos ·
          <span class="data">${duracionTotal()}</span> días si se ejecutan en secuencia
        </p>
        ${plantilla.description ? `<p class="sm muted mt-4" style="max-width:60ch">${esc(plantilla.description)}</p>` : ''}
        <div class="row-wrap mt-4">
          ${plantilla.is_active
            ? '<span class="pill pill--completado">Activa</span>'
            : '<span class="pill pill--omitido">Inactiva</span>'}
          ${plantilla.resource_url
            ? `<a class="tag" href="${esc(plantilla.resource_url)}" target="_blank" rel="noopener">🔗 Recurso</a>` : ''}
        </div>
        <label class="row sm mt-4" style="gap:8px">
          <input type="checkbox" id="tpl-event"${plantilla.creates_event ? ' checked' : ''}>
          Cada proceso de esta plantilla crea su evento en el Calendario
        </label>
      </div>
      <button class="btn btn--primary" id="btn-add">+ Paso</button>
    </div>

    <div class="view__rule"></div>
    <section class="card" id="t-steps"></section>

    <p class="sm muted mt-4">
      Editar esta plantilla no cambia los procesos ya creados: son copias independientes.
    </p>`;

  raiz.querySelector('#btn-add').addEventListener('click', agregarPaso);

  const chkEvento = raiz.querySelector('#tpl-event');
  chkEvento.addEventListener('change', async () => {
    const { data, error } = await templatesService.update(plantilla.id, { creates_event: chkEvento.checked });
    if (error) { toast.error(traducir(error)); chkEvento.checked = !chkEvento.checked; return; }
    plantilla = data;
    // El formulario de "Crear proceso" lee este dato del cache.
    const enCache = state.templates.find(t => t.id === plantilla.id);
    if (enCache) enCache.creates_event = plantilla.creates_event;
    toast.success(plantilla.creates_event
      ? 'Los procesos nuevos de esta plantilla crearán su evento'
      : 'Los procesos nuevos ya no crearán evento');
  });

  pintarPasos();
}

function pintarPasos() {
  const host = raiz.querySelector('#t-steps');

  if (!pasos.length) {
    sortable?.destroy(); sortable = null;
    host.innerHTML = empty({
      title: 'Esta plantilla no tiene pasos',
      text: 'Agrega el primero. Cada paso define título, tipo, prioridad y cuántos días suele tomar.',
      actionHtml: '<button class="btn btn--primary" id="btn-vacio">Agregar paso</button>',
    });
    host.querySelector('#btn-vacio').addEventListener('click', agregarPaso);
    return;
  }

  host.innerHTML = `
    <div class="steps" id="tsteps-list">${pasos.map(filaPaso).join('')}</div>
    <datalist id="tipos-tpl">${tipos().map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>`;

  const lista = host.querySelector('#tsteps-list');
  lista.addEventListener('click', onClick);
  lista.addEventListener('keydown', onKey);
  activarSortable(lista);

  if (abierto) {
    const el = lista.querySelector(`[data-step-id="${CSS.escape(abierto)}"]`);
    if (el) expandir(el, abierto);
  }
}

function tipos() {
  return [...new Set([...pasos.map(s => s.type).filter(Boolean), ...TIPOS])].sort();
}

function filaPaso(s, index) {
  return `<article class="step" data-step-id="${esc(s.id)}" data-open="false">
    <div class="step__main">${filaInterior(s, index)}</div>
  </article>`;
}

function filaInterior(s, index) {
  const dias = Number(s.default_duration_days) || 1;
  return `
    <button class="step__grip" type="button" data-grip
            aria-label="Reordenar: ${esc(s.title)}. Usa Ctrl y las flechas."
            title="Arrastra, o Ctrl + flechas">⠿</button>
    <span class="step__num">${String(index + 1).padStart(2, '0')}</span>
    <span class="step__title">${esc(s.title)}</span>
    ${s.type ? `<span class="tag plist__hide">${esc(s.type)}</span>` : ''}
    <span class="step__dates">${dias} día${dias === 1 ? '' : 's'}</span>
    ${pill(s.priority)}
    <button class="icon-btn" type="button" data-toggle aria-label="Editar paso" aria-expanded="false">
      <svg class="step__caret" width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>`;
}

function panelPaso(s) {
  return `
    <div class="step__panel">
      <div class="field">
        <label for="tt-${esc(s.id)}">T&iacute;tulo</label>
        <input class="input" id="tt-${esc(s.id)}" type="text" data-f="title" value="${esc(s.title)}">
        <span class="saving" data-saving="title"></span>
      </div>
      <div class="field">
        <label for="td-${esc(s.id)}">Descripci&oacute;n</label>
        <textarea class="textarea" id="td-${esc(s.id)}" data-f="description"
                  placeholder="Qué implica este paso">${esc(s.description)}</textarea>
        <span class="saving" data-saving="description"></span>
      </div>
      <div class="step__fields">
        <div class="field">
          <label for="tty-${esc(s.id)}">Tipo</label>
          <input class="input" id="tty-${esc(s.id)}" type="text" list="tipos-tpl" data-f="type" value="${esc(s.type)}">
          <span class="saving" data-saving="type"></span>
        </div>
        <div class="field">
          <label for="tp-${esc(s.id)}">Prioridad sugerida</label>
          <select class="select" id="tp-${esc(s.id)}" data-f="priority">
            ${PRIORIDADES.map(v => `<option value="${v}"${v === s.priority ? ' selected' : ''}>${ETIQUETA[v]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="tdd-${esc(s.id)}">Duraci&oacute;n (d&iacute;as)</label>
          <input class="input" id="tdd-${esc(s.id)}" type="number" min="1" max="365" step="1"
                 data-f="default_duration_days" value="${Number(s.default_duration_days) || 1}">
        </div>
        <div class="field">
          <label for="tru-${esc(s.id)}">Link del recurso</label>
          <input class="input" id="tru-${esc(s.id)}" type="url" data-f="resource_url"
                 placeholder="https://" value="${esc(s.resource_url)}">
          <span class="saving" data-saving="resource_url"></span>
        </div>
      </div>
      <p class="error-text" data-step-error role="alert"></p>
      <div class="step__actions">
        <button class="btn btn--danger btn--sm" type="button" data-del>Eliminar paso</button>
      </div>
    </div>`;
}

/* --- Interaccion --------------------------------------------------------- */

function onClick(e) {
  const art = e.target.closest('.step');
  if (!art) return;
  const s = pasos.find(x => x.id === art.dataset.stepId);
  if (!s) return;

  if (e.target.closest('[data-del]')) return borrarPaso(s);
  if (e.target.closest('[data-toggle]')) return alternar(art, s.id);
  if (e.target.closest('.step__main') && !e.target.closest('button, input, select, a')) alternar(art, s.id);
}

function onKey(e) {
  if (!e.ctrlKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const grip = e.target.closest('[data-grip]');
  if (!grip) return;
  e.preventDefault();

  const id = grip.closest('.step').dataset.stepId;
  const i = pasos.findIndex(x => x.id === id);
  const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
  if (j < 0 || j >= pasos.length) return;

  const copia = [...pasos];
  copia.splice(j, 0, copia.splice(i, 1)[0]);
  guardarOrden(copia.map(x => x.id), id);
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

function expandir(art, id) {
  const s = pasos.find(x => x.id === id);
  if (!s || art.dataset.open === 'true') return;
  art.insertAdjacentHTML('beforeend', panelPaso(s));
  art.dataset.open = 'true';
  art.querySelector('[data-toggle]')?.setAttribute('aria-expanded', 'true');
  abierto = id;
  conectarPanel(art, s);
}

function conectarPanel(art, s) {
  const err = art.querySelector('[data-step-error]');

  art.querySelectorAll('[data-f="title"], [data-f="description"], [data-f="type"], [data-f="resource_url"]')
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
        const { data, error } = await templatesService.updateStep(s.id, { [campo]: valor || null });
        if (error) { saveState(marca, 'error'); toast.error(traducir(error)); return; }
        saveState(marca, 'saved');
        aplicar(data);
        if (campo === 'title' || campo === 'type') refrescarFila(data);
      }, 800);

      el.addEventListener('input', guardar);
      el.addEventListener('blur', () => guardar.flush());
    });

  art.querySelectorAll('[data-f="priority"], [data-f="default_duration_days"]').forEach(el => {
    el.addEventListener('change', async () => {
      const campo = el.dataset.f;
      let valor = el.value;
      if (campo === 'default_duration_days') {
        valor = Math.max(1, Math.min(365, parseInt(valor, 10) || 1));
        el.value = valor;
      }
      const { data, error } = await templatesService.updateStep(s.id, { [campo]: valor });
      if (error) return toast.error(traducir(error));
      aplicar(data);
      refrescarFila(data);
      actualizarResumen();
    });
  });
}

function aplicar(step) {
  const i = pasos.findIndex(s => s.id === step.id);
  if (i >= 0) pasos[i] = { ...pasos[i], ...step };
}

function refrescarFila(step) {
  const art = raiz.querySelector(`[data-step-id="${CSS.escape(step.id)}"]`);
  if (!art) return;
  const abiertoAhora = art.dataset.open === 'true';
  art.querySelector('.step__main').innerHTML = filaInterior(step, pasos.findIndex(s => s.id === step.id));
  art.querySelector('[data-toggle]')?.setAttribute('aria-expanded', String(abiertoAhora));
}

function actualizarResumen() {
  const sub = raiz.querySelector('.view__sub');
  if (sub) sub.innerHTML =
    `<span class="data">${pasos.length}</span> pasos · <span class="data">${duracionTotal()}</span> días si se ejecutan en secuencia`;
}

/* --- Alta, baja y orden --------------------------------------------------- */

async function agregarPaso() {
  const { data, error } = await templatesService.insertStep(plantilla.id);
  if (error) return toast.error('No se pudo agregar el paso. ' + traducir(error));

  pasos.push(data);
  abierto = data.id;
  pintarPasos();
  actualizarResumen();

  const art = raiz.querySelector(`[data-step-id="${CSS.escape(data.id)}"]`);
  art?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  art?.querySelector('[data-f="title"]')?.select();
}

async function borrarPaso(s) {
  const ok = await confirmAction({
    title: 'Eliminar paso de la plantilla',
    message: `Se elimina “${s.title}”. Los procesos ya creados no se tocan.`,
  });
  if (!ok) return;

  const { error } = await templatesService.removeStep(s.id);
  if (error) return toast.error('No se pudo eliminar el paso. ' + traducir(error));

  pasos = pasos.filter(x => x.id !== s.id);
  if (abierto === s.id) abierto = null;
  pintarPasos();
  actualizarResumen();
  toast.success('Paso eliminado');
}

function activarSortable(lista) {
  sortable?.destroy();
  sortable = null;
  if (!window.Sortable) return;

  sortable = window.Sortable.create(lista, {
    handle: '.step__grip',
    draggable: '.step',
    animation: 150,
    ghostClass: 'step--ghost',
    chosenClass: 'step--chosen',
    dragClass: 'step--drag',
    delay: 200,
    delayOnTouchOnly: true,
    onEnd: () => {
      const ids = [...lista.querySelectorAll('[data-step-id]')].map(el => el.dataset.stepId);
      guardarOrden(ids);
    },
  });
}

async function guardarOrden(ids, focoEn = null) {
  const { error } = await templatesService.reorderSteps(plantilla.id, ids);
  if (error) {
    toast.error('No se pudo guardar el nuevo orden. Se restauró el anterior.');
  } else {
    const { data } = await templatesService.listSteps(plantilla.id);
    if (data) pasos = data;
  }

  pintarPasos();

  if (focoEn) {
    const art = raiz.querySelector(`[data-step-id="${CSS.escape(focoEn)}"]`);
    art?.querySelector('[data-grip]')?.focus();
    art?.scrollIntoView({ block: 'nearest' });
  }
}
