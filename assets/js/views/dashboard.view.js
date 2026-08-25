/* =====================================================================
   dashboard.view.js · Que me toca hoy y que se esta atrasando
   Cuatro bloques: numeros del momento, requiere atencion,
   procesos activos y actividad reciente.
   ===================================================================== */
import { supabase } from '../supabase.js';
import { state, nombreDe, on } from '../store.js';
import * as processesService from '../services/processes.service.js';
import {
  esc, pill, bar, ribbon, empty, skeleton, fmtRange,
  relative, daysOverdue, today, toast, traducir,
} from '../ui.js';

let offAttention = null;

const ACTIVOS = ['planificado', 'en_curso', 'pausado'];

export async function render(root) {
  root.innerHTML = `
    <div class="view__head">
      <div>
        <h1 class="view__title">Inicio</h1>
        <p class="view__sub">Lo que necesita tu atenci&oacute;n hoy.</p>
      </div>
      <a class="btn btn--primary" href="#/procesos">Ver todos los procesos</a>
    </div>
    <div class="view__rule"></div>
    <div id="dash-stats" class="grid-stats"></div>
    <div class="grid-2 mt-5">
      <div class="stack">
        <section class="card" id="dash-attn"></section>
        <section class="card" id="dash-activos"></section>
      </div>
      <section class="card" id="dash-reciente"></section>
    </div>`;

  root.querySelector('#dash-stats').innerHTML = skeleton(1);

  const [procRes, activityRes] = await Promise.all([
    processesService.list(),
    processesService.recentlyCompleted(10),
  ]);

  if (procRes.error) {
    root.innerHTML = empty({
      title: 'No se pudieron cargar los procesos',
      text: traducir(procRes.error),
      actionHtml: '<button class="btn btn--secondary" onclick="location.reload()">Reintentar</button>',
    });
    return;
  }

  const procesos = procRes.data;
  const activos = procesos.filter(p => ACTIVOS.includes(p.status));

  // Los pasos de los procesos activos en una sola query: alimentan las cintas.
  let pasosPorProceso = new Map();
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

  pintarStats(root, procesos);
  pintarAtencion(root);
  pintarActivos(root, activos, pasosPorProceso);
  pintarReciente(root, activityRes);

  // El panel de atencion se repinta cuando el refresco de 5 minutos trae datos.
  offAttention = on('attention', () => pintarAtencion(root));
}

export function destroy() {
  offAttention?.();
  offAttention = null;
}

/* --- 1 · Numeros del momento ------------------------------------------ */

function pintarStats(root, procesos) {
  const hoy = today();
  const enCurso = procesos.filter(p => p.status === 'en_curso').length;
  const vencidos = state.attention.filter(r => r.flag === 'vencido').length;
  const venceHoy = state.attention.filter(r => r.end_date === hoy).length;

  const activos = procesos.filter(p => ACTIVOS.includes(p.status));
  const avance = activos.length
    ? Math.round(activos.reduce((sum, p) => sum + Number(p.progress_override ?? p.progress), 0) / activos.length)
    : 0;

  root.querySelector('#dash-stats').innerHTML = [
    stat('Procesos en curso', enCurso),
    stat('Pasos vencidos', vencidos, vencidos ? 'alert' : ''),
    stat('Vencen hoy', venceHoy, venceHoy ? 'warn' : ''),
    stat('Avance promedio', activos.length ? `${avance}%` : '—'),
  ].join('');
}

function stat(label, value, kind = '') {
  return `<div class="card stat">
    <div class="stat__label">${esc(label)}</div>
    <div class="stat__value${kind ? ` stat__value--${kind}` : ''}">${esc(value)}</div>
  </div>`;
}

/* --- 2 · Requiere atencion --------------------------------------------- */

function pintarAtencion(root) {
  const host = root.querySelector('#dash-attn');
  if (!host) return;

  // Lo mas vencido primero; luego lo que vence hoy; al final los recordatorios.
  const PESO = { vencido: 0, vence_hoy: 1, recordatorio: 2 };
  const filas = [...state.attention].sort((a, b) => {
    const d = (PESO[a.flag] ?? 9) - (PESO[b.flag] ?? 9);
    if (d !== 0) return d;
    return (a.end_date || '9999').localeCompare(b.end_date || '9999');
  });

  host.innerHTML = `
    <div class="card__head">
      <h2 class="card__title">Requiere atenci&oacute;n</h2>
      <span class="data muted">${filas.length}</span>
    </div>
    ${filas.length ? `<div class="attn">${filas.slice(0, 12).map(filaAtencion).join('')}</div>` : empty({
      title: 'Nada atrasado',
      text: 'Ningún paso está vencido ni tiene un recordatorio cumplido. Buen momento para adelantar trabajo.',
    })}
    ${filas.length > 12 ? `<div class="card__body sm muted">Y ${filas.length - 12} más. Ábrelos desde cada proceso.</div>` : ''}`;
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

/* --- 3 · Procesos activos ---------------------------------------------- */

function pintarActivos(root, activos, pasosPorProceso) {
  const host = root.querySelector('#dash-activos');
  const overdue = processesService.overdueByProcess();

  host.innerHTML = `
    <div class="card__head">
      <h2 class="card__title">Procesos activos</h2>
      <a class="btn btn--ghost btn--sm" href="#/procesos">Ver todos</a>
    </div>
    ${activos.length ? `<div class="card__body grid-cards">${
      activos.slice(0, 6).map(p => tarjetaProceso(p, pasosPorProceso.get(p.id) || [], overdue.get(p.id) || 0)).join('')
    }</div>` : empty({
      title: 'Todavía no hay procesos activos',
      text: 'Crea el primero desde una plantilla y el equipo tendrá su checklist listo.',
      actionHtml: '<a class="btn btn--primary" href="#/procesos">Crear proceso</a>',
    })}`;
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

/* --- 4 · Actividad reciente -------------------------------------------- */

function pintarReciente(root, res) {
  const host = root.querySelector('#dash-reciente');
  const filas = res.error ? [] : (res.data || []);

  host.innerHTML = `
    <div class="card__head"><h2 class="card__title">Actividad reciente</h2></div>
    ${filas.length ? `<div class="attn">${filas.map(f => `
      <a class="attn__row" href="#/procesos/${esc(f.process_id)}?paso=${esc(f.id)}">
        <span class="dot" style="background:var(--st-completado)"></span>
        <span class="grow">
          <span class="truncate" style="display:block">${esc(f.title)}</span>
          <span class="xs muted">${esc(f.processes?.name || '')}${
            nombreDe(f.assignee_id) ? ` · ${esc(nombreDe(f.assignee_id))}` : ''
          }</span>
        </span>
        <span class="data muted xs">${esc(relative(f.completed_at))}</span>
      </a>`).join('')}</div>` : empty({
      title: 'Sin actividad todavía',
      text: 'Cuando el equipo marque pasos como completados, aparecerán aquí.',
    })}`;
}
