/* =====================================================================
   dashboard.view.js · Que me toca hoy y que se esta atrasando
   Orden de lectura: tareas en curso → tareas que requieren atencion →
   actividad reciente → procesos activos (y sus pasos atrasados) →
   proximos eventos.
   El selector Mias / Equipo solo afecta a los bloques de tareas.
   ===================================================================== */
import { supabase } from '../supabase.js';
import { state, nombreDe, on, isJefe } from '../store.js';
import * as processesService from '../services/processes.service.js';
import * as tasksService from '../services/tasks.service.js';
import * as eventsService from '../services/events.service.js';
import { areaName } from '../services/areas.service.js';
import {
  esc, pill, bar, ribbon, empty, skeleton, fmtRange, fmtDate, fmtTime, isoDay,
  relative, daysOverdue, today, initials, toast, traducir, ETIQUETA,
} from '../ui.js';

const ACTIVOS = ['planificado', 'en_curso', 'pausado'];
const ALCANCE_KEY = 'mkt.inicioAlcance';
const PESO_PRIORIDAD = { urgente: 0, alta: 1, media: 2, baja: 3 };
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

let offAttention = null;
let raiz = null;
let tareas = [];
let errorTareas = null;
let procesos = [];
let alcance = 'mias';

function leerAlcance() {
  try {
    const v = localStorage.getItem(ALCANCE_KEY);
    if (v === 'mias' || v === 'equipo') return v;
  } catch { /* sin storage */ }
  // El jefe entra mirando al equipo; el resto, lo suyo.
  return isJefe() ? 'equipo' : 'mias';
}

export async function render(root) {
  raiz = root;
  alcance = leerAlcance();

  root.innerHTML = `
    <div class="view__head">
      <div>
        <h1 class="view__title">Inicio</h1>
        <p class="view__sub">Lo que necesita atenci&oacute;n hoy.</p>
      </div>
      <div class="row-wrap">
        <div class="seg" role="group" aria-label="De quién son las tareas">
          <button type="button" data-alcance="mias" aria-pressed="${alcance === 'mias'}">Mis tareas</button>
          <button type="button" data-alcance="equipo" aria-pressed="${alcance === 'equipo'}">Equipo</button>
        </div>
        <a class="btn btn--primary" href="#/tareas">Ir a tareas</a>
      </div>
    </div>
    <div class="view__rule"></div>

    <div id="dash-stats" class="grid-stats">${skeleton(1)}</div>

    <div class="grid-2 mt-5">
      <div class="stack" style="gap:var(--s-5)">
        <section class="card" id="dash-curso"></section>
        <section class="card" id="dash-tattn"></section>
      </div>
      <section class="card" id="dash-reciente"></section>
    </div>

    <div class="grid-2 mt-5">
      <div class="stack" style="gap:var(--s-5)">
        <section class="card" id="dash-activos"></section>
        <section class="card" id="dash-attn"></section>
      </div>
      <section class="card" id="dash-eventos"></section>
    </div>`;

  root.querySelectorAll('[data-alcance]').forEach(b => b.addEventListener('click', () => {
    alcance = b.dataset.alcance;
    try { localStorage.setItem(ALCANCE_KEY, alcance); } catch { /* sin storage */ }
    root.querySelectorAll('[data-alcance]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    pintarTareas();
  }));

  const [tareasRes, procRes, pasosRecientes, eventosRes] = await Promise.all([
    tasksService.list(),
    processesService.list(),
    processesService.recentlyCompleted(10),
    eventsService.upcoming(6),
  ]);
  if (raiz !== root || !root.isConnected) return;   // el usuario ya navego a otra pantalla

  // Cada bloque falla por separado: que no carguen los eventos no esconde las tareas.
  tareas = tareasRes.data || [];
  errorTareas = tareasRes.error;
  procesos = procRes.data || [];
  const activos = procesos.filter(p => ACTIVOS.includes(p.status));

  // Los pasos de los procesos activos en una sola query: alimentan las cintas.
  const pasosPorProceso = new Map();
  if (activos.length) {
    const { data: pasos, error } = await supabase
      .from('process_steps')
      .select('id, process_id, title, status, sort_order, start_date, end_date')
      .in('process_id', activos.map(p => p.id))
      .order('sort_order', { ascending: true });

    if (error) toast.error('No se pudieron cargar las cintas de proceso. ' + traducir(error));
    for (const s of pasos || []) {
      if (!pasosPorProceso.has(s.process_id)) pasosPorProceso.set(s.process_id, []);
      pasosPorProceso.get(s.process_id).push(s);
    }
  }

  pintarTareas();
  pintarReciente(pasosRecientes);
  pintarActivos(activos, pasosPorProceso, procRes.error);
  pintarAtencion();
  pintarEventos(eventosRes);

  // El panel de pasos se repinta cuando el refresco de 5 minutos trae datos.
  offAttention = on('attention', pintarAtencion);
}

export function destroy() {
  offAttention?.();
  offAttention = null;
  raiz = null;
}

/* --- Fragmentos ---------------------------------------------------------- */

function stat(label, value, kind = '') {
  return `<div class="card stat">
    <div class="stat__label">${esc(label)}</div>
    <div class="stat__value${kind ? ` stat__value--${kind}` : ''}">${esc(value)}</div>
  </div>`;
}

function cabecera(titulo, n, linkHtml = '') {
  return `<div class="card__head">
    <h2 class="card__title">${titulo}</h2>
    <span class="row">${n === null ? '' : `<span class="data muted">${n}</span>`}${linkHtml}</span>
  </div>`;
}

function errorBloque(error) {
  return empty({ title: 'No se pudo cargar', text: traducir(error) });
}

function avatares(ids) {
  if (!ids.length) return '<span class="xs dim">Sin asignar</span>';
  return `<span class="who">${ids.slice(0, 3).map(id => {
    const n = nombreDe(id) || '?';
    return `<span class="avatar" title="${esc(n)}">${esc(initials(n))}</span>`;
  }).join('')}</span>`;
}

/* --- 1 y 2 · Tareas en curso y tareas que requieren atencion --------------- */

/** Por que una tarea abierta necesita que alguien la mire; null si va bien. */
function motivo(t) {
  if (t.status === 'completado') return null;
  const d = t.due_date ? daysOverdue(t.due_date) : null;
  if (d !== null && d > 0)  return { peso: 0, flag: 'vencido',   texto: `${d} día${d === 1 ? '' : 's'} de retraso` };
  if (d === 0)              return { peso: 1, flag: 'vence_hoy', texto: 'Vence hoy' };
  if (t.status === 'bloqueado')   return { peso: 2, flag: 'vencido',      texto: 'Bloqueada' };
  if (t.status === 'en_revision') return { peso: 3, flag: 'recordatorio', texto: 'Espera revisión' };
  return null;
}

function pintarTareas() {
  if (!raiz) return;
  const hostCurso = raiz.querySelector('#dash-curso');
  const hostAttn = raiz.querySelector('#dash-tattn');
  const err = errorTareas;

  const yo = state.user.id;
  const mias = alcance === 'mias';
  const visibles = mias ? tareas.filter(t => t.assignees.includes(yo)) : tareas;

  const enCurso = visibles
    .filter(t => t.status === 'en_curso')
    .sort((a, b) => PESO_PRIORIDAD[a.priority] - PESO_PRIORIDAD[b.priority]
                 || (a.due_date || '9999').localeCompare(b.due_date || '9999'));

  const atencion = visibles
    .map(t => ({ t, m: motivo(t) }))
    .filter(x => x.m)
    .sort((a, b) => a.m.peso - b.m.peso || (a.t.due_date || '9999').localeCompare(b.t.due_date || '9999'));

  // Numeros del momento
  const vencidosPaso = state.attention.filter(r => r.flag === 'vencido').length;
  raiz.querySelector('#dash-stats').innerHTML = [
    stat(mias ? 'Mis tareas en curso' : 'Tareas en curso', err ? '—' : enCurso.length),
    stat('Tareas que requieren atención', err ? '—' : atencion.length, atencion.length ? 'alert' : ''),
    stat('Procesos en curso', procesos.filter(p => p.status === 'en_curso').length),
    stat('Pasos de proceso vencidos', vencidosPaso, vencidosPaso ? 'warn' : ''),
  ].join('');

  const verTodas = '<a class="btn btn--ghost btn--sm" href="#/tareas">Ver todas</a>';

  hostCurso.innerHTML = cabecera(mias ? 'Mis tareas en curso' : 'Tareas en curso', err ? null : enCurso.length, verTodas) + (
    err ? errorBloque(err) :
    enCurso.length ? `<div class="attn">${enCurso.slice(0, 8).map(t => `
      <a class="attn__row" href="#/tareas?tarea=${esc(t.id)}">
        <span class="grow">
          <span class="truncate" style="display:block">${esc(t.title)}</span>
          <span class="xs muted">${esc([
            tasksService.typeName(t.type_id),
            areaName(t.area_id) && `Solicita: ${areaName(t.area_id)}`,
            t.started_at && `iniciada ${relative(t.started_at)}`,
          ].filter(Boolean).join(' · '))}</span>
        </span>
        ${mias ? '' : avatares(t.assignees)}
        ${pill(t.priority)}
        <span class="data muted xs" style="width:52px;text-align:right">${t.due_date ? esc(fmtDate(t.due_date)) : '—'}</span>
      </a>`).join('')}</div>
      ${enCurso.length > 8 ? `<div class="card__body sm muted">Y ${enCurso.length - 8} más.</div>` : ''}`
    : empty({
        title: mias ? 'No tienes tareas en curso' : 'Ninguna tarea en curso',
        text: 'Mueve una tarea a "En curso" y empezará a contar su tiempo.',
        actionHtml: '<a class="btn btn--secondary" href="#/tareas">Ir a tareas</a>',
      })
  );

  hostAttn.innerHTML = cabecera('Tareas que requieren atenci&oacute;n', err ? null : atencion.length) + (
    err ? errorBloque(err) :
    atencion.length ? `<div class="attn">${atencion.slice(0, 8).map(({ t, m }) => `
      <a class="attn__row" href="#/tareas?tarea=${esc(t.id)}">
        <span class="dot dot--${m.flag}"></span>
        <span class="grow">
          <span class="truncate" style="display:block">${esc(t.title)}</span>
          <span class="xs muted">${esc(t.assignees.map(nombreDe).filter(Boolean).join(', ') || 'Sin asignar')}</span>
        </span>
        <span class="data ${m.flag === 'vencido' ? 'step__dates--vencido' : ''}">${esc(m.texto)}</span>
      </a>`).join('')}</div>
      ${atencion.length > 8 ? `<div class="card__body sm muted">Y ${atencion.length - 8} más.</div>` : ''}`
    : empty({
        title: 'Nada atrasado',
        text: 'Ninguna tarea está vencida, bloqueada ni esperando revisión.',
      })
  );
}

/* --- 3 · Actividad reciente: tareas y pasos completados --------------------- */

function pintarReciente(pasosRes) {
  const host = raiz.querySelector('#dash-reciente');

  const deTareas = tareas
    .filter(t => t.status === 'completado' && t.finished_at)
    .map(t => ({
      at: t.finished_at, titulo: t.title, href: `#/tareas?tarea=${t.id}`,
      sub: ['Tarea', t.assignees.map(nombreDe).filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    }));

  const dePasos = (pasosRes.error ? [] : pasosRes.data || []).map(f => ({
    at: f.completed_at, titulo: f.title, href: `#/procesos/${f.process_id}?paso=${f.id}`,
    sub: [f.processes?.name, nombreDe(f.assignee_id)].filter(Boolean).join(' · '),
  }));

  const filas = [...deTareas, ...dePasos]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 12);

  host.innerHTML = cabecera('Actividad reciente', null) + (
    filas.length ? `<div class="attn">${filas.map(f => `
      <a class="attn__row" href="${esc(f.href)}">
        <span class="dot" style="background:var(--st-completado)"></span>
        <span class="grow">
          <span class="truncate" style="display:block">${esc(f.titulo)}</span>
          <span class="xs muted">${esc(f.sub)}</span>
        </span>
        <span class="data muted xs">${esc(relative(f.at))}</span>
      </a>`).join('')}</div>`
    : empty({
        title: 'Sin actividad todavía',
        text: 'Cuando el equipo complete tareas o pasos de un proceso, aparecerán aquí.',
      })
  );
}

/* --- 4 · Procesos activos y sus pasos atrasados ---------------------------- */

function pintarActivos(activos, pasosPorProceso, error) {
  const host = raiz.querySelector('#dash-activos');
  const overdue = processesService.overdueByProcess();

  host.innerHTML = cabecera('Procesos activos', error ? null : activos.length,
    '<a class="btn btn--ghost btn--sm" href="#/procesos">Ver todos</a>') + (
    error ? errorBloque(error) :
    activos.length ? `<div class="card__body grid-cards">${
      activos.slice(0, 6).map(p => tarjetaProceso(p, pasosPorProceso.get(p.id) || [], overdue.get(p.id) || 0)).join('')
    }</div>`
    : empty({
        title: 'Todavía no hay procesos activos',
        text: 'Crea el primero desde una plantilla y el equipo tendrá su checklist listo.',
        actionHtml: '<a class="btn btn--primary" href="#/procesos">Crear proceso</a>',
      })
  );
}

function tarjetaProceso(p, pasos, vencidos) {
  const pct = Number(p.progress_override ?? p.progress);
  return `<a class="card card--link" href="#/procesos/${esc(p.id)}" style="padding:var(--s-4)">
    <div class="spread">
      <span class="bold truncate">${esc(p.name)}</span>
      <span class="data muted">${Math.round(pct)}%</span>
    </div>
    <div class="row-wrap xs muted" style="margin:var(--s-2) 0">
      ${pill(p.status)}
      <span class="data">${esc(fmtRange(p.start_date, p.end_date))}</span>
      ${vencidos ? `<span class="row" style="gap:4px"><span class="dot dot--vencido"></span><span class="data">${vencidos}</span></span>` : ''}
    </div>
    ${pasos.length ? ribbon(pasos, { interactive: false, legend: false }) : bar(pct, pct >= 100)}
  </a>`;
}

function pintarAtencion() {
  const host = raiz?.querySelector('#dash-attn');
  if (!host) return;

  // Lo mas vencido primero; luego lo que vence hoy; al final los recordatorios.
  const PESO = { vencido: 0, vence_hoy: 1, recordatorio: 2 };
  const filas = [...state.attention].sort((a, b) => {
    const d = (PESO[a.flag] ?? 9) - (PESO[b.flag] ?? 9);
    if (d !== 0) return d;
    return (a.end_date || '9999').localeCompare(b.end_date || '9999');
  });

  host.innerHTML = cabecera('Pasos de proceso que requieren atenci&oacute;n', filas.length) + (
    filas.length ? `<div class="attn">${filas.slice(0, 8).map(filaAtencion).join('')}</div>
      ${filas.length > 8 ? `<div class="card__body sm muted">Y ${filas.length - 8} más. Ábrelos desde cada proceso.</div>` : ''}`
    : empty({
        title: 'Nada atrasado',
        text: 'Ningún paso está vencido ni tiene un recordatorio cumplido.',
      })
  );
}

function filaAtencion(r) {
  const dias = daysOverdue(r.end_date);
  const detalle =
    r.flag === 'vencido'      ? `${dias} día${dias === 1 ? '' : 's'} de retraso` :
    r.flag === 'vence_hoy'    ? 'Vence hoy' :
                                'Recordatorio';

  return `<a class="attn__row" href="#/procesos/${esc(r.process_id)}?paso=${esc(r.id)}">
    <span class="dot dot--${esc(r.flag)}"></span>
    <span class="grow">
      <span class="truncate" style="display:block">${esc(r.title)}</span>
      <span class="xs muted">${esc(r.process_name)}</span>
    </span>
    <span class="data ${r.flag === 'vencido' ? 'step__dates--vencido' : ''}">${esc(detalle)}</span>
  </a>`;
}

/* --- 5 · Proximos eventos --------------------------------------------------- */

function pintarEventos(res) {
  const host = raiz.querySelector('#dash-eventos');
  const filas = res.data || [];
  const hoy = today();

  host.innerHTML = cabecera('Pr&oacute;ximos eventos', null,
    '<a class="btn btn--ghost btn--sm" href="#/calendario">Calendario</a>') + (
    res.error ? errorBloque(res.error) :
    filas.length ? `<div class="attn">${filas.map(e => {
      const d = new Date(e.starts_at);
      const dia = isoDay(d);
      // Un evento de varios dias que ya empezo sigue "en curso" hasta su fin.
      const cuando = dia < hoy ? 'En curso' : dia === hoy ? 'Hoy' : `${DIAS[d.getDay()]} ${fmtDate(dia)}`;
      return `<a class="attn__row" href="#/calendario?evento=${esc(e.id)}">
        <i class="ev-key ev-key--${esc(e.status)}"></i>
        <span class="grow">
          <span class="truncate" style="display:block">${esc(e.title)}</span>
          <span class="xs muted">${esc([
            ETIQUETA[e.status], ETIQUETA[e.modality],
            e.areas.map(areaName).filter(Boolean).join(', '),
          ].filter(Boolean).join(' · '))}</span>
        </span>
        <span class="data xs" style="text-align:right;white-space:nowrap">${esc(cuando)}${
          e.all_day ? '' : `<br><span class="muted">${esc(fmtTime(e.starts_at))}</span>`}</span>
      </a>`;
    }).join('')}</div>`
    : empty({
        title: 'Sin eventos próximos',
        text: 'Los eventos confirmados o por aprobación aparecerán aquí.',
        actionHtml: '<a class="btn btn--secondary" href="#/calendario">Abrir calendario</a>',
      })
  );
}
