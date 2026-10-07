/* =====================================================================
   audit.view.js · Registro de auditoria (admin)
   Quien creo, edito o elimino cada cosa, con el valor anterior y el
   nuevo. Es de solo lectura: ni el admin puede alterarlo desde la app.
   ===================================================================== */
import { state, nombreDe } from '../store.js';
import * as auditService from '../services/audit.service.js';
import { PAGINA } from '../services/audit.service.js';
import { typeName } from '../services/tasks.service.js';
import { areaName } from '../services/areas.service.js';
import {
  esc, empty, skeleton, today, parseDate, isoDay, fmtDate, fmtDateTime,
  toast, traducir, debounce, ETIQUETA, ROL,
} from '../ui.js';

/* Como se llama cada tabla para una persona, y en que modulo cae. */
const TABLA = {
  tasks: 'Tarea', task_assignees: 'Tarea', task_resources: 'Tarea',
  task_types: 'Tipo de tarea', areas: 'Área',
  events: 'Evento', event_areas: 'Evento',
  processes: 'Proceso', process_steps: 'Paso de proceso',
  process_templates: 'Plantilla', template_steps: 'Paso de plantilla',
  profiles: 'Usuario',
};

const MODULOS = {
  tareas:     { label: 'Tareas',     tables: ['tasks', 'task_assignees', 'task_resources'] },
  eventos:    { label: 'Eventos',    tables: ['events', 'event_areas'] },
  procesos:   { label: 'Procesos',   tables: ['processes', 'process_steps'] },
  plantillas: { label: 'Plantillas', tables: ['process_templates', 'template_steps'] },
  catalogos:  { label: 'Catálogos',  tables: ['task_types', 'areas'] },
  usuarios:   { label: 'Usuarios',   tables: ['profiles'] },
};

const ACCION = { INSERT: 'Creó', UPDATE: 'Editó', DELETE: 'Eliminó' };
const ACCION_PILL = { INSERT: 'completado', UPDATE: 'en_curso', DELETE: 'bloqueado' };

const CAMPO = {
  title: 'Título', name: 'Nombre', full_name: 'Nombre', email: 'Correo', role: 'Rol',
  description: 'Descripción', observations: 'Observaciones',
  status: 'Estado', priority: 'Prioridad', type: 'Tipo', type_id: 'Tipo', area_id: 'Área solicitante',
  due_date: 'Fecha límite', started_at: 'Inicio', finished_at: 'Fin',
  start_date: 'Fecha de inicio', end_date: 'Fecha de fin', reminder_at: 'Recordatorio',
  starts_at: 'Inicio', ends_at: 'Fin', all_day: 'Todo el día', modality: 'Tipo', location: 'Lugar o link',
  assignee_id: 'Responsable', owner_id: 'Dueño', created_by: 'Creado por', profile_id: 'Responsable',
  resource_url: 'Recurso', url: 'Link', label: 'Etiqueta',
  is_active: 'Activo', creates_event: 'Crea evento', progress_override: 'Avance manual',
  default_duration_days: 'Duración (días)', icon: 'Ícono', color: 'Color',
  template_id: 'Plantilla', process_id: 'Proceso',
};

// Identificadores internos que no le dicen nada a quien lee el registro.
const OCULTOS = new Set(['id', 'task_id', 'event_id']);
const PERSONAS = new Set(['assignee_id', 'owner_id', 'created_by', 'profile_id']);
const MOMENTOS = new Set(['started_at', 'finished_at', 'starts_at', 'ends_at', 'reminder_at']);
const FECHAS = new Set(['due_date', 'start_date', 'end_date']);

let raiz = null;
let filas = [];
let hayMas = false;
let cargando = false;
let filtros = null;

function haceDias(n) {
  const d = parseDate(today());
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

function filtrosIniciales() {
  return { from: haceDias(6), to: today(), actor: '', modulo: '', action: '', q: '' };
}

export async function render(root) {
  raiz = root;
  filtros ||= filtrosIniciales();

  root.innerHTML = `
    <div class="view__head">
      <div>
        <h1 class="view__title">Auditor&iacute;a</h1>
        <p class="view__sub">Qui&eacute;n cre&oacute;, edit&oacute; o elimin&oacute; cada registro. Solo lectura.</p>
      </div>
      <button class="btn btn--secondary" id="au-csv">Exportar CSV</button>
    </div>
    <div class="view__rule"></div>

    <div class="toolbar">
      <label class="row xs muted">Desde <input class="input" id="au-from" type="date" style="min-width:0"></label>
      <label class="row xs muted">Hasta <input class="input" id="au-to" type="date" style="min-width:0"></label>
      <select class="select" id="au-actor" aria-label="Filtrar por usuario">
        <option value="">Todos los usuarios</option>
        ${state.profiles.map(p => `<option value="${esc(p.id)}">${esc(p.full_name || p.email)}</option>`).join('')}
      </select>
      <select class="select" id="au-modulo" aria-label="Filtrar por módulo">
        <option value="">Todos los módulos</option>
        ${Object.entries(MODULOS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('')}
      </select>
      <select class="select" id="au-action" aria-label="Filtrar por acción">
        <option value="">Toda acción</option>
        ${Object.entries(ACCION).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <input class="input input--search" id="au-q" type="search" placeholder="Buscar por nombre del registro...">
      <button class="btn btn--ghost btn--sm" id="au-limpiar">Limpiar</button>
    </div>

    <section class="card" id="au-body">${skeleton(6)}</section>`;

  const recargar = () => cargar(false);
  for (const [id, key] of [['au-from', 'from'], ['au-to', 'to'], ['au-actor', 'actor'],
                           ['au-modulo', 'modulo'], ['au-action', 'action']]) {
    const el = root.querySelector(`#${id}`);
    el.value = filtros[key];
    el.addEventListener('change', () => { filtros[key] = el.value; recargar(); });
  }
  const q = root.querySelector('#au-q');
  q.value = filtros.q;
  q.addEventListener('input', debounce(() => { filtros.q = q.value; recargar(); }, 400));

  root.querySelector('#au-limpiar').addEventListener('click', () => {
    filtros = filtrosIniciales();
    render(root);
  });
  root.querySelector('#au-csv').addEventListener('click', exportar);

  await cargar(false);
}

export function destroy() { raiz = null; }

async function cargar(mas) {
  if (cargando) return;
  cargando = true;
  const host = raiz.querySelector('#au-body');
  if (!mas) host.innerHTML = skeleton(6);

  const { data, error } = await auditService.list({
    from: filtros.from, to: filtros.to,
    actor: filtros.actor,
    tables: filtros.modulo ? MODULOS[filtros.modulo].tables : null,
    action: filtros.action,
    q: filtros.q.trim(),
    before: mas ? filas[filas.length - 1]?.id : null,
  });
  cargando = false;
  if (!raiz) return;

  if (error) {
    host.innerHTML = empty({
      title: 'No se pudo cargar la auditoría',
      text: traducir(error),
      actionHtml: '<button class="btn btn--secondary" onclick="location.reload()">Reintentar</button>',
    });
    return;
  }

  filas = mas ? [...filas, ...data] : data;
  hayMas = data.length === PAGINA;
  pintar();
}

/* --- Lectura humana de un registro ---------------------------------------- */

function actor(r) {
  if (!r.actor_id) return 'Sistema';
  return nombreDe(r.actor_id) || 'Usuario eliminado';
}

function valor(campo, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (PERSONAS.has(campo)) return nombreDe(v) || 'Usuario eliminado';
  if (campo === 'type_id') return typeName(v) || 'Tipo eliminado';
  if (campo === 'area_id') return areaName(v) || 'Área eliminada';
  if (campo === 'template_id') return state.templates.find(t => t.id === v)?.name || 'Plantilla';
  if (campo === 'role') return ROL[v] || v;
  if (MOMENTOS.has(campo)) return fmtDateTime(v);
  if (FECHAS.has(campo)) return fmtDate(v, true);
  if (campo === 'progress_override') return `${v}%`;
  if (typeof v === 'string' && ETIQUETA[v] && ['status', 'priority', 'modality'].includes(campo)) return ETIQUETA[v];
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Frase corta de lo que paso, para la columna Detalle. */
function resumen(r) {
  const c = r.changes || {};
  const alta = r.action === 'INSERT';

  if (r.table_name === 'task_assignees') {
    return `${alta ? 'Asignó a' : 'Quitó a'} ${valor('profile_id', c.profile_id)}`;
  }
  if (r.table_name === 'task_resources') {
    return `${alta ? 'Agregó el link' : 'Quitó el link'} ${c.label ? `${c.label}: ` : ''}${c.url || ''}`;
  }
  if (r.table_name === 'event_areas') {
    return `${alta ? 'Agregó el área' : 'Quitó el área'} ${valor('area_id', c.area_id)}`;
  }
  if (r.table_name === 'profiles' && alta) return 'Se registró';

  if (r.action === 'UPDATE') {
    const campos = Object.keys(c);
    // Un solo campo cambiado se lee completo; varios, se listan.
    if (campos.length === 1) {
      const k = campos[0];
      return `${CAMPO[k] || k}: ${valor(k, c[k][0])} → ${valor(k, c[k][1])}`;
    }
    return `Cambió ${campos.map(k => (CAMPO[k] || k).toLowerCase()).join(', ')}`;
  }
  return alta ? 'Creó el registro' : 'Eliminó el registro';
}

function detalleHtml(r) {
  const c = r.changes || {};
  const campos = Object.keys(c).filter(k => !OCULTOS.has(k));
  if (!campos.length) return '<p class="xs muted">Sin más detalle.</p>';

  if (r.action === 'UPDATE') {
    return `<table class="table audit__diff">
      <thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
      <tbody>${campos.map(k => `<tr>
        <td class="sm muted">${esc(CAMPO[k] || k)}</td>
        <td class="sm audit__old">${esc(valor(k, c[k][0]))}</td>
        <td class="sm">${esc(valor(k, c[k][1]))}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  return `<table class="table audit__diff">
    <thead><tr><th>Campo</th><th>${r.action === 'INSERT' ? 'Valor inicial' : 'Valor al eliminar'}</th></tr></thead>
    <tbody>${campos.map(k => `<tr>
      <td class="sm muted">${esc(CAMPO[k] || k)}</td>
      <td class="sm">${esc(valor(k, c[k]))}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

/* --- Pintado ---------------------------------------------------------------- */

function pintar() {
  const host = raiz.querySelector('#au-body');
  if (!filas.length) {
    host.innerHTML = empty({
      title: 'Sin registros con esos filtros',
      text: 'Amplía las fechas o quita filtros. La auditoría empieza el día en que se ejecutó el script que la instala.',
    });
    return;
  }

  host.innerHTML = `
    <div class="table__scroll"><table class="table audit">
      <thead><tr>
        <th>Fecha</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Registro</th><th>Detalle</th><th></th>
      </tr></thead>
      <tbody>${filas.map(r => `
        <tr class="audit__row" data-id="${r.id}" tabindex="0" role="button" aria-expanded="false">
          <td class="data muted" style="white-space:nowrap">${esc(fmtDateTime(r.at))}</td>
          <td class="sm">${esc(actor(r))}</td>
          <td><span class="pill pill--${ACCION_PILL[r.action]}">${ACCION[r.action]}</span></td>
          <td class="sm muted" style="white-space:nowrap">${esc(TABLA[r.table_name] || r.table_name)}</td>
          <td class="sm">
            <span class="bold">${esc(r.label || '—')}</span>
            ${r.context ? `<div class="xs muted">${esc(r.context)}</div>` : ''}
          </td>
          <td class="sm audit__sum">${esc(resumen(r))}</td>
          <td class="dim" aria-hidden="true">&#9662;</td>
        </tr>
        <tr class="audit__detail hidden" data-detail="${r.id}"><td colspan="7">${detalleHtml(r)}</td></tr>`).join('')}
      </tbody>
    </table></div>
    <div class="card__body spread xs muted">
      <span>${filas.length} registro${filas.length === 1 ? '' : 's'}${hayMas ? ' cargados' : ''}</span>
      ${hayMas ? '<button class="btn btn--secondary btn--sm" id="au-mas">Cargar más</button>' : ''}
    </div>`;

  host.querySelectorAll('.audit__row').forEach(tr => {
    const alternar = () => {
      const det = host.querySelector(`[data-detail="${tr.dataset.id}"]`);
      const abierto = det.classList.toggle('hidden');
      tr.setAttribute('aria-expanded', String(!abierto));
    };
    tr.addEventListener('click', alternar);
    tr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); }
    });
  });

  host.querySelector('#au-mas')?.addEventListener('click', () => cargar(true));
}

/* --- Exportar --------------------------------------------------------------- */

function exportar() {
  if (!filas.length) { toast.info('No hay registros que exportar.'); return; }

  // Un valor que empieza con = + - @ lo ejecutaria Excel como formula.
  const celda = v => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const lineas = [
    ['Fecha', 'Usuario', 'Acción', 'Módulo', 'Registro', 'Pertenece a', 'Detalle'].map(celda).join(','),
    ...filas.map(r => [
      new Date(r.at).toLocaleString('es-EC'), actor(r), ACCION[r.action],
      TABLA[r.table_name] || r.table_name, r.label || '', r.context || '', resumen(r),
    ].map(celda).join(',')),
  ];

  // BOM para que Excel lea las tildes.
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `auditoria_${filtros.from}_${filtros.to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  if (hayMas) toast.info(`Se exportaron los ${filas.length} registros cargados. Usa "Cargar más" para incluir el resto.`);
}
