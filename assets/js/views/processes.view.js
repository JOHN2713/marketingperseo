/* =====================================================================
   processes.view.js · Lista de procesos con filtros y creacion
   ===================================================================== */
import { state } from '../store.js';
import * as processesService from '../services/processes.service.js';
import { supabase } from '../supabase.js';
import { navigate } from '../router.js';
import {
  esc, pill, bar, empty, skeleton, fmtRange, today, fromLocalInput,
  toast, traducir, openModal, ETIQUETA,
} from '../ui.js';

let procesos = [];
let filtros = { status: '', priority: '', template: '', assignee: '', q: '' };

export async function render(root) {
  root.innerHTML = `
    <div class="view__head">
      <div>
        <h1 class="view__title">Procesos</h1>
        <p class="view__sub">Cada proceso es una copia ejecutable de una plantilla.</p>
      </div>
      <button class="btn btn--primary" id="btn-nuevo">+ Nuevo proceso</button>
    </div>
    <div class="view__rule"></div>

    <div class="toolbar">
      <input class="input input--search" id="f-q" type="search" placeholder="Buscar por nombre..." value="${esc(filtros.q)}">
      <select class="select" id="f-status" aria-label="Filtrar por estado">
        <option value="">Todos los estados</option>
        ${['planificado','en_curso','pausado','completado','cancelado']
          .map(v => `<option value="${v}">${ETIQUETA[v]}</option>`).join('')}
      </select>
      <select class="select" id="f-priority" aria-label="Filtrar por prioridad">
        <option value="">Toda prioridad</option>
        ${['urgente','alta','media','baja'].map(v => `<option value="${v}">${ETIQUETA[v]}</option>`).join('')}
      </select>
      <select class="select" id="f-template" aria-label="Filtrar por plantilla">
        <option value="">Toda plantilla</option>
        ${state.templates.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
      </select>
      <select class="select" id="f-assignee" aria-label="Filtrar por responsable">
        <option value="">Todo responsable</option>
        ${state.profiles.map(p => `<option value="${esc(p.id)}">${esc(p.full_name || p.email)}</option>`).join('')}
      </select>
      <button class="btn btn--ghost btn--sm" id="btn-limpiar">Limpiar</button>
    </div>

    <section class="card" id="lista">${skeleton(5)}</section>`;

  root.querySelector('#btn-nuevo').addEventListener('click', abrirNuevo);

  for (const [id, key] of [['f-q','q'], ['f-status','status'], ['f-priority','priority'],
                           ['f-template','template'], ['f-assignee','assignee']]) {
    const el = root.querySelector(`#${id}`);
    el.value = filtros[key];
    el.addEventListener('input', () => { filtros[key] = el.value; pintar(root); });
  }

  root.querySelector('#btn-limpiar').addEventListener('click', () => {
    filtros = { status: '', priority: '', template: '', assignee: '', q: '' };
    render(root);
  });

  const { data, error } = await processesService.list();
  if (error) {
    root.querySelector('#lista').innerHTML = empty({
      title: 'No se pudieron cargar los procesos',
      text: traducir(error),
      actionHtml: '<button class="btn btn--secondary" onclick="location.reload()">Reintentar</button>',
    });
    return;
  }
  procesos = data;

  // El filtro por responsable mira los pasos, no el proceso: hay que saber en
  // que procesos participa cada persona.
  await cargarResponsables();
  pintar(root);
}

let responsablesPorProceso = new Map();

async function cargarResponsables() {
  const { data, error } = await supabase
    .from('process_steps')
    .select('process_id, assignee_id')
    .not('assignee_id', 'is', null);
  if (error) return;

  responsablesPorProceso = new Map();
  for (const r of data) {
    if (!responsablesPorProceso.has(r.process_id)) responsablesPorProceso.set(r.process_id, new Set());
    responsablesPorProceso.get(r.process_id).add(r.assignee_id);
  }
}

function aplicarFiltros() {
  const q = filtros.q.trim().toLowerCase();
  return procesos.filter(p => {
    if (filtros.status && p.status !== filtros.status) return false;
    if (filtros.priority && p.priority !== filtros.priority) return false;
    if (filtros.template && p.template_id !== filtros.template) return false;
    if (filtros.assignee && !responsablesPorProceso.get(p.id)?.has(filtros.assignee)) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

function pintar(root) {
  const host = root.querySelector('#lista');
  if (!host) return;
  const filas = aplicarFiltros();
  const overdue = processesService.overdueByProcess();

  if (!procesos.length) {
    host.innerHTML = empty({
      title: 'Todavía no hay procesos',
      text: 'Crea el primero desde una plantilla. El sistema clona los pasos y calcula las fechas.',
      actionHtml: '<button class="btn btn--primary" id="btn-vacio">Crear proceso</button>',
    });
    host.querySelector('#btn-vacio')?.addEventListener('click', abrirNuevo);
    return;
  }

  if (!filas.length) {
    host.innerHTML = empty({
      title: 'Ningún proceso coincide',
      text: 'Prueba con otros filtros o limpia la búsqueda.',
    });
    return;
  }

  host.innerHTML = `<div class="plist">${filas.map(p => fila(p, overdue.get(p.id) || 0)).join('')}</div>`;
}

function fila(p, vencidos) {
  const pct = Number(p.progress_override ?? p.progress);
  const manual = p.progress_override !== null && p.progress_override !== undefined;

  return `<a class="plist__row" href="#/procesos/${esc(p.id)}">
    <div class="grow">
      <div class="plist__name truncate">${esc(p.name)}</div>
      <div class="plist__meta truncate">
        ${p.template ? `${esc(p.template.icon || '')} ${esc(p.template.name)}` : 'Sin plantilla'}
      </div>
    </div>
    <div class="plist__hide">${pill(p.status)}</div>
    <div class="plist__hide">${pill(p.priority)}</div>
    <div class="plist__hide data muted">
      ${esc(fmtRange(p.start_date, p.end_date))}
      ${vencidos ? `<div class="row xs step__dates--vencido" style="gap:4px;margin-top:3px">
        <span class="dot dot--vencido"></span>${vencidos} vencido${vencidos === 1 ? '' : 's'}</div>` : ''}
    </div>
    <div>
      ${bar(pct, pct >= 100)}
      <div class="plist__pct">${Math.round(pct)}%${manual ? ' ajustado' : ''}</div>
    </div>
  </a>`;
}

/* --- Crear proceso ------------------------------------------------------ */

function abrirNuevo() {
  const plantillas = state.templates;

  openModal({
    title: 'Crear proceso',
    body: `
      <div class="field">
        <label for="np-template">Plantilla</label>
        <select class="select" id="np-template">
          ${plantillas.map(t => `<option value="${esc(t.id)}">${esc(t.icon || '')} ${esc(t.name)} · ${t.steps_count} pasos</option>`).join('')}
          <option value="">En blanco (sin pasos)</option>
        </select>
        ${plantillas.length ? '' : '<span class="xs dim">No hay plantillas activas. Se creará un proceso en blanco.</span>'}
      </div>
      <div class="field">
        <label for="np-name">Nombre</label>
        <input class="input" id="np-name" type="text" placeholder="Masterclass Octubre" autocomplete="off">
      </div>
      <div class="field">
        <label for="np-start">Fecha de inicio</label>
        <input class="input" id="np-start" type="date" value="${today()}">
        <span class="xs dim">Las fechas de los pasos se calculan en cascada desde aquí. Después las mueves.</span>
      </div>
      <div class="field hidden" id="np-event-field">
        <label for="np-event">Fecha y hora del evento</label>
        <input class="input" id="np-event" type="datetime-local">
        <span class="xs dim">Esta plantilla crea su evento en el Calendario, por aprobación del jefe de área.
          Si lo dejas vacío, queda de día completo en la fecha de fin del proceso.</span>
      </div>
      <p class="error-text" id="np-error" role="alert"></p>`,
    actions: [
      { label: 'Cancelar', variant: 'ghost', onClick: ({ close }) => close() },
      { label: 'Crear', variant: 'primary', onClick: crear },
    ],
    onOpen: ({ modal }) => {
      const sel = modal.querySelector('#np-template');
      if (!plantillas.length) sel.value = '';
      const sync = () => modal.querySelector('#np-event-field')
        .classList.toggle('hidden', !plantillas.find(t => t.id === sel.value)?.creates_event);
      sel.addEventListener('change', sync);
      sync();
      modal.querySelector('#np-name').focus();
    },
  });

  async function crear({ modal, close, btn }) {
    const err = modal.querySelector('#np-error');
    err.textContent = '';

    const templateId = modal.querySelector('#np-template').value;
    const name = modal.querySelector('#np-name').value.trim();
    const start = modal.querySelector('#np-start').value;
    const conEvento = !!plantillas.find(t => t.id === templateId)?.creates_event;
    const eventoLocal = conEvento ? modal.querySelector('#np-event').value : '';
    const eventAt = fromLocalInput(eventoLocal);

    if (!name) { err.textContent = 'Ponle un nombre al proceso.'; return; }
    if (templateId && !start) { err.textContent = 'Indica la fecha de inicio para calcular el cronograma.'; return; }
    if (eventoLocal && eventoLocal.slice(0, 10) < start) { err.textContent = 'El evento no puede ser antes de que empiece el proceso.'; return; }

    btn.disabled = true;
    btn.textContent = 'Creando...';

    const res = templateId
      ? await processesService.createFromTemplate(templateId, name, start, eventAt)
      : await processesService.create({ name, start_date: start || null });

    btn.disabled = false;
    btn.textContent = 'Crear';

    if (res.error) { err.textContent = traducir(res.error); return; }

    const id = templateId ? res.data : res.data.id;
    close();
    toast.success(conEvento ? 'Proceso creado, con su evento en el Calendario' : 'Proceso creado');
    await processesService.refreshAttention();
    navigate(`#/procesos/${id}`);
  }
}
