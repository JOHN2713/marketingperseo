/* =====================================================================
   tasks.view.js · Tareas del equipo en lista o Kanban
   Cualquiera crea tareas para si mismo; el jefe de area asigna a otros
   y mantiene el catalogo de tipos. Las horas de inicio y fin las pone el
   trigger al cambiar de estado y se pueden corregir en el formulario.
   ===================================================================== */
import { state, isJefe, nombreDe } from '../store.js';
import * as tasksService from '../services/tasks.service.js';
import { ESTADOS, PRIORIDADES } from '../services/tasks.service.js';
import { areaName } from '../services/areas.service.js';
import { openCatalog, openAreasCatalog } from '../catalog-modal.js';
import {
  esc, pill, empty, skeleton, fmtDate, fmtDateTime, fmtDuration, daysOverdue,
  toLocalInput, fromLocalInput, initials, isValidUrl,
  toast, traducir, openModal, confirmAction, ETIQUETA,
} from '../ui.js';

const VISTA_KEY = 'mkt.tareasVista';
const PESO_PRIORIDAD = { urgente: 0, alta: 1, media: 2, baja: 3 };
const COLOR_ESTADO = {
  pendiente: 'var(--st-pendiente)', en_curso: 'var(--st-en-curso)',
  en_revision: 'var(--st-en-revision)', completado: 'var(--st-completado)',
  bloqueado: 'var(--st-bloqueado)',
};

let tareas = [];
let raiz = null;
let sortables = [];
let vista = leerVista();
let filtros = filtrosVacios();

function filtrosVacios() {
  return { q: '', status: '', assignee: '', priority: '', type: '', area: '', mias: false };
}

function leerVista() {
  try { return localStorage.getItem(VISTA_KEY) === 'kanban' ? 'kanban' : 'lista'; } catch { return 'lista'; }
}

export async function render(root, { query } = { query: new URLSearchParams() }) {
  raiz = root;
  const tiposActivos = state.taskTypes.filter(t => t.is_active);

  root.innerHTML = `
    <div class="view__head">
      <div>
        <h1 class="view__title">Tareas</h1>
        <p class="view__sub">El trabajo del día a día del equipo de marketing.</p>
      </div>
      <div class="row-wrap">
        ${isJefe() ? `<button class="btn btn--secondary" id="btn-tipos">Tipos de tarea</button>
                      <button class="btn btn--secondary" id="btn-areas">Áreas</button>` : ''}
        <button class="btn btn--primary" id="btn-nueva">+ Nueva tarea</button>
      </div>
    </div>
    <div class="view__rule"></div>

    <div class="toolbar">
      <div class="seg" role="group" aria-label="Forma de ver las tareas">
        <button type="button" data-vista="lista" aria-pressed="${vista === 'lista'}">Lista</button>
        <button type="button" data-vista="kanban" aria-pressed="${vista === 'kanban'}">Kanban</button>
      </div>
      <button type="button" class="chip" id="f-mias" aria-pressed="${filtros.mias}">Mis tareas</button>
      <input class="input input--search" id="f-q" type="search" placeholder="Buscar por tema...">
      <select class="select" id="f-status" aria-label="Filtrar por estado">
        <option value="">Todos los estados</option>
        ${ESTADOS.map(v => `<option value="${v}">${ETIQUETA[v]}</option>`).join('')}
      </select>
      <select class="select" id="f-assignee" aria-label="Filtrar por responsable">
        <option value="">Todo responsable</option>
        ${state.profiles.map(p => `<option value="${esc(p.id)}">${esc(p.full_name || p.email)}</option>`).join('')}
      </select>
      <select class="select" id="f-priority" aria-label="Filtrar por prioridad">
        <option value="">Toda prioridad</option>
        ${PRIORIDADES.map(v => `<option value="${v}">${ETIQUETA[v]}</option>`).join('')}
      </select>
      <select class="select" id="f-type" aria-label="Filtrar por tipo">
        <option value="">Todo tipo</option>
        ${tiposActivos.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
      </select>
      <select class="select" id="f-area" aria-label="Filtrar por área solicitante">
        <option value="">Toda área</option>
        ${state.areas.filter(a => a.is_active).map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}
      </select>
      <button class="btn btn--ghost btn--sm" id="btn-limpiar">Limpiar</button>
    </div>

    <section id="tareas">${skeleton(5)}</section>`;

  root.querySelector('#btn-nueva').addEventListener('click', () => abrirTarea(null));
  root.querySelector('#btn-tipos')?.addEventListener('click', abrirTipos);
  // Al cerrar, los selectores de la barra de filtros se rehacen con el catalogo nuevo.
  root.querySelector('#btn-areas')?.addEventListener('click',
    () => openAreasCatalog(() => render(raiz, { query: new URLSearchParams() })));

  root.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => {
    vista = b.dataset.vista;
    try { localStorage.setItem(VISTA_KEY, vista); } catch { /* sin storage */ }
    root.querySelectorAll('[data-vista]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    pintar();
  }));

  const chipMias = root.querySelector('#f-mias');
  chipMias.addEventListener('click', () => {
    filtros.mias = !filtros.mias;
    chipMias.setAttribute('aria-pressed', String(filtros.mias));
    pintar();
  });

  for (const [id, key] of [['f-q', 'q'], ['f-status', 'status'], ['f-assignee', 'assignee'],
                           ['f-priority', 'priority'], ['f-type', 'type'], ['f-area', 'area']]) {
    const el = root.querySelector(`#${id}`);
    el.value = filtros[key];
    el.addEventListener('input', () => { filtros[key] = el.value; pintar(); });
  }

  root.querySelector('#btn-limpiar').addEventListener('click', () => {
    filtros = filtrosVacios();
    render(root, { query: new URLSearchParams() });
  });

  await recargar();

  // Enlace directo desde Metricas: #/tareas?tarea=<id>
  const abrir = query?.get('tarea');
  if (abrir) {
    const t = tareas.find(x => x.id === abrir);
    if (t) abrirTarea(t);
  }
}

export function destroy() {
  sortables.forEach(s => s.destroy());
  sortables = [];
}

async function recargar() {
  const { data, error } = await tasksService.list();
  if (error) {
    raiz.querySelector('#tareas').innerHTML = `<div class="card">${empty({
      title: 'No se pudieron cargar las tareas',
      text: traducir(error),
      actionHtml: '<button class="btn btn--secondary" onclick="location.reload()">Reintentar</button>',
    })}</div>`;
    return;
  }
  tareas = data;
  pintar();
}

function aplicarFiltros() {
  const q = filtros.q.trim().toLowerCase();
  const yo = state.user.id;
  return tareas.filter(t => {
    if (filtros.mias && !t.assignees.includes(yo)) return false;
    if (filtros.status && t.status !== filtros.status) return false;
    if (filtros.assignee && !t.assignees.includes(filtros.assignee)) return false;
    if (filtros.priority && t.priority !== filtros.priority) return false;
    if (filtros.type && t.type_id !== filtros.type) return false;
    if (filtros.area && t.area_id !== filtros.area) return false;
    if (q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Lo urgente y lo que vence antes, arriba. */
function ordenar(lista) {
  return [...lista].sort((a, b) => {
    const p = PESO_PRIORIDAD[a.priority] - PESO_PRIORIDAD[b.priority];
    if (p !== 0) return p;
    return (a.due_date || '9999').localeCompare(b.due_date || '9999');
  });
}

function pintar() {
  const host = raiz?.querySelector('#tareas');
  if (!host) return;
  destroy();

  if (!tareas.length) {
    host.innerHTML = `<div class="card">${empty({
      title: 'Todavía no hay tareas',
      text: 'Crea la primera: tema, tipo, prioridad y responsable. El tiempo se mide solo al moverla de estado.',
      actionHtml: '<button class="btn btn--primary" id="btn-vacio">Crear tarea</button>',
    })}</div>`;
    host.querySelector('#btn-vacio').addEventListener('click', () => abrirTarea(null));
    return;
  }

  const filas = ordenar(aplicarFiltros());
  if (vista === 'kanban') pintarKanban(host, filas);
  else pintarLista(host, filas);
}

/* --- Fragmentos ---------------------------------------------------------- */

function avatares(ids) {
  if (!ids.length) return '<span class="xs dim">Sin asignar</span>';
  return `<span class="who">${ids.slice(0, 4).map(id => {
    const n = nombreDe(id) || '?';
    return `<span class="avatar" title="${esc(n)}">${esc(initials(n))}</span>`;
  }).join('')}${ids.length > 4 ? `<span class="xs muted" style="margin-left:4px">+${ids.length - 4}</span>` : ''}</span>`;
}

function fechaLimite(t) {
  if (!t.due_date) return '<span class="dim">—</span>';
  const abierta = t.status !== 'completado';
  const d = daysOverdue(t.due_date);
  const cls = abierta && d > 0 ? 'step__dates--vencido' : abierta && d === 0 ? 'step__dates--hoy' : '';
  return `<span class="step__dates ${cls}">${esc(fmtDate(t.due_date))}</span>`;
}

function tipoTag(t) {
  const n = tasksService.typeName(t.type_id);
  return n ? `<span class="tag">${esc(n)}</span>` : '<span class="dim xs">—</span>';
}

/* --- Lista ---------------------------------------------------------------- */

function pintarLista(host, filas) {
  if (!filas.length) {
    host.innerHTML = `<div class="card">${empty({ title: 'Ninguna tarea coincide', text: 'Prueba con otros filtros o limpia la búsqueda.' })}</div>`;
    return;
  }

  host.innerHTML = `<div class="card">
    <div class="tlist__row tlist__head" aria-hidden="true">
      <span>Tema</span><span class="tlist__hide">Tipo</span><span class="tlist__hide">Responsables</span>
      <span class="tlist__hide">Prioridad</span><span>Estado</span><span class="tlist__hide">Límite</span><span class="tlist__hide">Tiempo</span>
    </div>
    ${filas.map(t => `
      <button type="button" class="tlist__row" data-task="${esc(t.id)}">
        <span class="grow">
          <span class="truncate" style="display:block;font-weight:500">${esc(t.title)}</span>
          <span class="xs muted">${esc([
            areaName(t.area_id) && `Solicita: ${areaName(t.area_id)}`,
            t.resources.length && `${t.resources.length} recurso${t.resources.length === 1 ? '' : 's'}`,
          ].filter(Boolean).join(' · '))}</span>
        </span>
        <span class="tlist__hide">${tipoTag(t)}</span>
        <span class="tlist__hide">${avatares(t.assignees)}</span>
        <span class="tlist__hide">${pill(t.priority)}</span>
        <span>${pill(t.status)}</span>
        <span class="tlist__hide">${fechaLimite(t)}</span>
        <span class="tlist__hide data muted xs">${esc(fmtDuration(t.started_at, t.finished_at) || (t.started_at ? 'en marcha' : '—'))}</span>
      </button>`).join('')}
  </div>`;

  host.querySelectorAll('[data-task]').forEach(el =>
    el.addEventListener('click', () => abrirTarea(tareas.find(t => t.id === el.dataset.task))));
}

/* --- Kanban --------------------------------------------------------------- */

function pintarKanban(host, filas) {
  const columnas = filtros.status ? [filtros.status] : ESTADOS;

  host.innerHTML = `<div class="kanban">${columnas.map(st => {
    const items = filas.filter(t => t.status === st);
    return `<div class="kanban__col">
      <div class="kanban__head">
        <i class="st-key" style="background:${COLOR_ESTADO[st]}"></i>${ETIQUETA[st]}
        <span class="data">${items.length}</span>
      </div>
      <div class="kanban__list" data-status="${st}">${items.map(tarjeta).join('')}</div>
    </div>`;
  }).join('')}</div>`;

  host.querySelectorAll('[data-task]').forEach(el => {
    const abrir = () => abrirTarea(tareas.find(t => t.id === el.dataset.task));
    el.addEventListener('click', abrir);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
  });

  if (!window.Sortable) return;   // sin la libreria, el Kanban queda de solo lectura

  sortables = [...host.querySelectorAll('.kanban__list')].map(list => window.Sortable.create(list, {
    group: 'tareas',
    animation: 150,
    filter: '.kcard--locked',
    preventOnFilter: false,
    ghostClass: 'kcard--ghost',
    dragClass: 'kcard--drag',
    onEnd: async ev => {
      if (ev.from === ev.to) return;            // el orden dentro de una columna no se guarda
      const id = ev.item.dataset.task;
      const nuevo = ev.to.dataset.status;
      const { data, error } = await tasksService.setStatus(id, nuevo);
      if (error) {
        toast.error(traducir(error));
        pintar();                               // devuelve la tarjeta a su columna
        return;
      }
      tareas = tareas.map(t => (t.id === id ? data : t));
      pintar();
      if (nuevo === 'completado' && !data.started_at) {
        toast.info('Completada sin hora de inicio: ábrela y anótala para que cuente en el tiempo promedio.');
      }
    },
  }));
}

function tarjeta(t) {
  const bloqueada = !tasksService.canEdit(t);
  return `<div class="kcard${bloqueada ? ' kcard--locked' : ''}" data-task="${esc(t.id)}" tabindex="0" role="button"
               aria-label="${esc(t.title)}">
    <div class="kcard__title">${esc(t.title)}</div>
    <div class="row-wrap">${pill(t.priority)} ${tipoTag(t)}</div>
    ${areaName(t.area_id) ? `<div class="xs muted">Solicita: ${esc(areaName(t.area_id))}</div>` : ''}
    <div class="spread">
      ${avatares(t.assignees)}
      ${fechaLimite(t)}
    </div>
  </div>`;
}

/* --- Formulario de tarea ---------------------------------------------------- */

function abrirTarea(tarea) {
  const nueva = !tarea;
  const t = tarea || {
    title: '', type_id: '', area_id: '', priority: 'media', status: 'pendiente', due_date: '',
    started_at: null, finished_at: null, observations: '',
    assignees: [state.user.id], resources: [], created_by: state.user.id,
  };
  const editable = tasksService.canEdit(tarea);
  const jefe = isJefe();
  const dis = editable ? '' : ' disabled';
  const tipos = state.taskTypes.filter(x => x.is_active || x.id === t.type_id);
  const areas = state.areas.filter(x => x.is_active || x.id === t.area_id);

  // Sin ser jefe solo te puedes marcar o desmarcar a ti mismo.
  const personas = jefe ? state.profiles : state.profiles.filter(p => p.id === state.user.id || t.assignees.includes(p.id));

  const body = `
    ${editable ? '' : '<p class="modal__text">Solo puede editarla el jefe de área, quien la creó o sus responsables.</p>'}
    <div class="field">
      <label for="tk-title">Tema</label>
      <input class="input" id="tk-title" type="text" value="${esc(t.title)}" placeholder="Post de lanzamiento Masterclass" autocomplete="off"${dis}>
    </div>

    <div class="form-grid">
      <div class="field">
        <label for="tk-type">Tipo</label>
        <select class="select" id="tk-type"${dis}>
          <option value="">Sin tipo</option>
          ${tipos.map(x => `<option value="${esc(x.id)}"${x.id === t.type_id ? ' selected' : ''}>${esc(x.name)}${x.is_active ? '' : ' (inactivo)'}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="tk-area">Área que solicita</label>
        <select class="select" id="tk-area"${dis}>
          <option value="">Sin área</option>
          ${areas.map(x => `<option value="${esc(x.id)}"${x.id === t.area_id ? ' selected' : ''}>${esc(x.name)}${x.is_active ? '' : ' (inactiva)'}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="tk-priority">Prioridad</label>
        <select class="select" id="tk-priority"${dis}>
          ${PRIORIDADES.map(v => `<option value="${v}"${v === t.priority ? ' selected' : ''}>${ETIQUETA[v]}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="tk-status">Estado</label>
        <select class="select" id="tk-status"${dis}>
          ${ESTADOS.map(v => `<option value="${v}"${v === t.status ? ' selected' : ''}>${ETIQUETA[v]}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="tk-due">Fecha límite</label>
        <input class="input" id="tk-due" type="date" value="${esc(t.due_date || '')}"${dis}>
      </div>
    </div>

    <div class="field">
      <label>Responsables</label>
      <div class="checklist" id="tk-assignees">
        ${personas.map(p => {
          const puedo = editable && (jefe || p.id === state.user.id);
          return `<label><input type="checkbox" value="${esc(p.id)}"${t.assignees.includes(p.id) ? ' checked' : ''}${puedo ? '' : ' disabled'}>
            ${esc(p.full_name || p.email)}</label>`;
        }).join('')}
      </div>
      ${jefe ? '' : '<span class="xs dim">Solo el jefe de área asigna tareas a otras personas.</span>'}
    </div>

    <div class="form-grid">
      <div class="field">
        <label for="tk-start">Inicio de la actividad</label>
        <input class="input" id="tk-start" type="datetime-local" value="${esc(toLocalInput(t.started_at))}"${dis}>
      </div>
      <div class="field">
        <label for="tk-end">Fin de la actividad</label>
        <input class="input" id="tk-end" type="datetime-local" value="${esc(toLocalInput(t.finished_at))}"${dis}>
      </div>
      <div class="field">
        <label>Tiempo</label>
        <div class="duration" id="tk-duration" style="padding-top:8px"></div>
      </div>
    </div>
    <span class="xs dim" style="margin-top:-8px">Se llenan solos al pasar a En curso y a Completado. Corrígelos si hace falta.</span>

    <div class="field">
      <label>Recursos (links a repositorios, Drive, Figma…)</label>
      <div class="stack" id="tk-resources"></div>
      ${editable ? '<button type="button" class="btn btn--ghost btn--sm" id="tk-add-res" style="justify-self:start;width:max-content">+ Agregar link</button>' : ''}
    </div>

    <div class="field">
      <label for="tk-obs">Observaciones</label>
      <textarea class="textarea" id="tk-obs"${dis}>${esc(t.observations || '')}</textarea>
    </div>

    ${nueva ? '' : `<p class="xs dim">Creada por ${esc(nombreDe(t.created_by) || '—')} · ${esc(fmtDateTime(t.created_at))}</p>`}
    <p class="error-text" id="tk-error" role="alert"></p>`;

  const actions = [];
  if (!nueva && tasksService.canDelete(tarea)) {
    actions.push({ label: 'Eliminar', variant: 'danger', onClick: eliminar });
  }
  actions.push({ label: editable ? 'Cancelar' : 'Cerrar', variant: 'ghost', onClick: ({ close }) => close() });
  if (editable) actions.push({ label: nueva ? 'Crear tarea' : 'Guardar', variant: 'primary', onClick: guardar });

  openModal({
    title: nueva ? 'Nueva tarea' : 'Tarea',
    body,
    actions,
    wide: true,
    onOpen: ({ modal }) => {
      const resHost = modal.querySelector('#tk-resources');
      const agregarFila = (r = { label: '', url: '' }) => {
        const row = document.createElement('div');
        row.className = 'res-row';
        row.innerHTML = editable
          ? `<input class="input res-label" type="text" placeholder="Etiqueta" value="${esc(r.label || '')}" aria-label="Etiqueta del link">
             <input class="input res-url" type="url" placeholder="https://..." value="${esc(r.url)}" aria-label="Link">
             <button type="button" class="icon-btn" aria-label="Quitar link">&times;</button>`
          : `<span class="xs muted">${esc(r.label || 'Link')}</span>
             <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" class="truncate sm">${esc(r.url)}</a><span></span>`;
        row.querySelector('.icon-btn')?.addEventListener('click', () => row.remove());
        resHost.appendChild(row);
        return row;
      };
      t.resources.forEach(agregarFila);
      if (!t.resources.length && !editable) resHost.innerHTML = '<span class="xs dim">Sin recursos.</span>';
      modal.querySelector('#tk-add-res')?.addEventListener('click', () => agregarFila().querySelector('.res-label').focus());

      // En modo edicion, los links tambien se pueden abrir con doble clic.
      resHost.addEventListener('dblclick', e => {
        const url = e.target.closest('.res-url')?.value;
        if (url && isValidUrl(url)) window.open(url, '_blank', 'noopener');
      });

      const durar = () => {
        const a = fromLocalInput(modal.querySelector('#tk-start').value);
        const b = fromLocalInput(modal.querySelector('#tk-end').value);
        modal.querySelector('#tk-duration').textContent =
          fmtDuration(a, b) || (a ? 'En marcha' : 'Sin iniciar');
      };
      modal.querySelector('#tk-start').addEventListener('input', durar);
      modal.querySelector('#tk-end').addEventListener('input', durar);
      durar();
    },
  });

  async function guardar({ modal, close, btn }) {
    const err = modal.querySelector('#tk-error');
    err.textContent = '';
    const v = sel => modal.querySelector(sel).value;

    const title = v('#tk-title').trim();
    if (!title) { err.textContent = 'Escribe el tema de la tarea.'; return; }

    const started = fromLocalInput(v('#tk-start'));
    const finished = fromLocalInput(v('#tk-end'));
    if (started && finished && finished < started) {
      err.textContent = 'La hora de fin no puede ser anterior a la de inicio.'; return;
    }

    const recursos = [...modal.querySelectorAll('.res-row')].map(r => ({
      label: r.querySelector('.res-label')?.value.trim() || '',
      url: r.querySelector('.res-url')?.value.trim() || '',
    })).filter(r => r.url);
    if (recursos.some(r => !isValidUrl(r.url))) {
      err.textContent = 'Algún link no es válido. Debe empezar con http:// o https://'; return;
    }

    const asignados = [...modal.querySelectorAll('#tk-assignees input:checked')].map(i => i.value);
    const cambiaronAsignados = nueva ||
      asignados.length !== t.assignees.length || asignados.some(id => !t.assignees.includes(id));

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    const { data: id, error } = await tasksService.save(tarea?.id, {
      title,
      type_id: v('#tk-type'),
      area_id: v('#tk-area'),
      priority: v('#tk-priority'),
      status: v('#tk-status'),
      due_date: v('#tk-due'),
      started_at: started || '',
      finished_at: finished || '',
      observations: v('#tk-obs').trim(),
    }, {
      assignees: cambiaronAsignados ? asignados : null,
      resources: recursos,
    });
    btn.disabled = false;
    btn.textContent = nueva ? 'Crear tarea' : 'Guardar';

    if (error) { err.textContent = traducir(error); return; }

    close();
    toast.success(nueva ? 'Tarea creada' : 'Tarea guardada');
    const fresca = await tasksService.getById(id);
    if (fresca.data) {
      tareas = nueva ? [fresca.data, ...tareas] : tareas.map(x => (x.id === id ? fresca.data : x));
      pintar();
    } else {
      await recargar();
    }
  }

  async function eliminar({ close }) {
    const ok = await confirmAction({
      title: 'Eliminar tarea',
      message: `"${tarea.title}" se borra con sus links y observaciones. Deja de contar en las métricas.`,
    });
    if (!ok) return;
    const { error } = await tasksService.remove(tarea.id);
    if (error) { toast.error(traducir(error)); return; }
    close();
    toast.success('Tarea eliminada');
    tareas = tareas.filter(x => x.id !== tarea.id);
    pintar();
  }
}

/* --- Catalogo de tipos (jefe) --------------------------------------------- */

function abrirTipos() {
  openCatalog({
    title: 'Tipos de tarea',
    help: 'Los tipos inactivos dejan de ofrecerse en tareas nuevas, pero las tareas que ya los usan los conservan y siguen contando en las métricas.',
    placeholder: 'Nuevo tipo: Reel, Newsletter, Evento...',
    items: () => state.taskTypes,
    create: tasksService.createType,
    update: tasksService.updateType,
    refresh: tasksService.refreshTypes,
    onClose: () => render(raiz, { query: new URLSearchParams() }),
  });
}
