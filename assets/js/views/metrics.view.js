/* =====================================================================
   metrics.view.js · Informe del equipo de marketing (jefe de area)
   Todo se calcula en el navegador sobre las tareas creadas dentro del
   rango de fechas: el volumen de un equipo chico no justifica vistas
   agregadas en Postgres.

   Reglas de calculo (docs/09-tareas-y-metricas.md):
   - Una tarea entra al informe si se creo dentro del rango.
   - Una tarea con dos responsables cuenta para cada uno; los totales
     del equipo la cuentan una sola vez.
   - Promedio por dia/semana/mes = tareas / dias del rango (/7, /30.44).
   - Tiempo = fin - inicio, en horas de reloj. Sin alguna de las dos
     horas la tarea no entra al promedio.
   ===================================================================== */
import { state, nombreDe } from '../store.js';
import * as tasksService from '../services/tasks.service.js';
import { ESTADOS, PRIORIDADES } from '../services/tasks.service.js';
import {
  esc, empty, skeleton, today, parseDate, fmtDate, fmtHours,
  traducir, enableTips, ETIQUETA,
} from '../ui.js';

const COLOR_ESTADO = {
  completado: 'var(--st-completado)', en_revision: 'var(--st-en-revision)',
  en_curso: 'var(--st-en-curso)', bloqueado: 'var(--st-bloqueado)',
  pendiente: 'var(--st-pendiente)',
};
// Orden de las barras apiladas: de lo terminado a lo que no arranca.
const ORDEN_PILA = ['completado', 'en_revision', 'en_curso', 'bloqueado', 'pendiente'];
const SIN_ASIGNAR = '__none__';

let filtros = null;
let tiempoPor = 'persona';
let tareas = [];
let raiz = null;
let offTips = null;

function isoLocal(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function haceDias(n) {
  const d = parseDate(today());
  d.setDate(d.getDate() - n);
  return isoLocal(d);
}

function filtrosIniciales() {
  return { from: haceDias(29), to: today(), assignee: '', status: '', priority: '', type: '' };
}

export async function render(root) {
  raiz = root;
  filtros ||= filtrosIniciales();

  root.innerHTML = `
    <div class="view__head">
      <div>
        <h1 class="view__title">M&eacute;tricas del equipo</h1>
        <p class="view__sub">Tareas creadas en el rango elegido, por integrante.</p>
      </div>
      <button class="btn btn--secondary" id="btn-print">Imprimir informe</button>
    </div>
    <div class="view__rule"></div>

    <div class="toolbar">
      <div class="seg" role="group" aria-label="Rango rápido">
        <button type="button" data-rango="7">7 días</button>
        <button type="button" data-rango="30">30 días</button>
        <button type="button" data-rango="mes">Este mes</button>
        <button type="button" data-rango="90">90 días</button>
      </div>
      <label class="row xs muted">Desde <input class="input" id="m-from" type="date" style="min-width:0"></label>
      <label class="row xs muted">Hasta <input class="input" id="m-to" type="date" style="min-width:0"></label>
      <select class="select" id="m-assignee" aria-label="Filtrar por responsable">
        <option value="">Todo el equipo</option>
        ${state.profiles.map(p => `<option value="${esc(p.id)}">${esc(p.full_name || p.email)}</option>`).join('')}
      </select>
      <select class="select" id="m-status" aria-label="Filtrar por estado">
        <option value="">Todos los estados</option>
        ${ESTADOS.map(v => `<option value="${v}">${ETIQUETA[v]}</option>`).join('')}
      </select>
      <select class="select" id="m-priority" aria-label="Filtrar por prioridad">
        <option value="">Toda prioridad</option>
        ${PRIORIDADES.map(v => `<option value="${v}">${ETIQUETA[v]}</option>`).join('')}
      </select>
      <select class="select" id="m-type" aria-label="Filtrar por tipo">
        <option value="">Todo tipo</option>
        ${state.taskTypes.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
      </select>
      <button class="btn btn--ghost btn--sm" id="m-limpiar">Limpiar</button>
    </div>

    <div id="m-body">${skeleton(6)}</div>`;

  root.querySelector('#btn-print').addEventListener('click', () => window.print());

  const from = root.querySelector('#m-from');
  const to = root.querySelector('#m-to');
  from.value = filtros.from;
  to.value = filtros.to;
  const cambioFechas = () => {
    if (!from.value || !to.value) return;
    if (from.value > to.value) [from.value, to.value] = [to.value, from.value];
    filtros.from = from.value;
    filtros.to = to.value;
    marcarRango();
    cargar();
  };
  from.addEventListener('change', cambioFechas);
  to.addEventListener('change', cambioFechas);

  root.querySelectorAll('[data-rango]').forEach(b => b.addEventListener('click', () => {
    const r = b.dataset.rango;
    if (r === 'mes') {
      const d = parseDate(today());
      filtros.from = isoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      filtros.from = haceDias(Number(r) - 1);
    }
    filtros.to = today();
    from.value = filtros.from;
    to.value = filtros.to;
    marcarRango();
    cargar();
  }));

  for (const [id, key] of [['m-assignee', 'assignee'], ['m-status', 'status'],
                           ['m-priority', 'priority'], ['m-type', 'type']]) {
    const el = root.querySelector(`#${id}`);
    el.value = filtros[key];
    el.addEventListener('input', () => { filtros[key] = el.value; pintar(); });
  }

  root.querySelector('#m-limpiar').addEventListener('click', () => {
    filtros = filtrosIniciales();
    render(root);
  });

  marcarRango();
  await cargar();
}

export function destroy() {
  offTips?.();
  offTips = null;
}

function marcarRango() {
  const hoy = today();
  const d = parseDate(hoy);
  const inicioMes = isoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
  raiz.querySelectorAll('[data-rango]').forEach(b => {
    const r = b.dataset.rango;
    const on = filtros.to === hoy &&
      (r === 'mes' ? filtros.from === inicioMes : filtros.from === haceDias(Number(r) - 1));
    b.setAttribute('aria-pressed', String(on));
  });
}

async function cargar() {
  const host = raiz.querySelector('#m-body');
  host.innerHTML = skeleton(6);
  const { data, error } = await tasksService.list({ from: filtros.from, to: filtros.to });
  if (error) {
    host.innerHTML = `<div class="card">${empty({
      title: 'No se pudieron cargar las tareas', text: traducir(error),
      actionHtml: '<button class="btn btn--secondary" onclick="location.reload()">Reintentar</button>',
    })}</div>`;
    return;
  }
  tareas = data;
  pintar();
}

/* --- Calculo ------------------------------------------------------------- */

function filtradas() {
  return tareas.filter(t => {
    if (filtros.assignee && !t.assignees.includes(filtros.assignee)) return false;
    if (filtros.status && t.status !== filtros.status) return false;
    if (filtros.priority && t.priority !== filtros.priority) return false;
    if (filtros.type && t.type_id !== filtros.type) return false;
    return true;
  });
}

function diasDelRango() {
  return Math.round((parseDate(filtros.to) - parseDate(filtros.from)) / 86400000) + 1;
}

function promedioHoras(lista) {
  const hs = lista.map(tasksService.hours).filter(h => h !== null && h >= 0);
  return { avg: hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : null, n: hs.length };
}

function resumen(lista) {
  const dias = diasDelRango();
  const porEstado = Object.fromEntries(ESTADOS.map(s => [s, 0]));
  lista.forEach(t => { porEstado[t.status] += 1; });
  const total = lista.length;
  return {
    total,
    porEstado,
    avance: total ? porEstado.completado / total * 100 : 0,
    dia: total / dias,
    semana: total / (dias / 7),
    mes: total / (dias / 30.44),
    tiempo: promedioHoras(lista),
  };
}

/** Una fila por integrante (y "Sin asignar" si hace falta). */
function porPersona(lista) {
  const ids = filtros.assignee ? [filtros.assignee] : state.profiles.map(p => p.id);
  const filas = ids.map(id => ({
    id, nombre: nombreDe(id) || '—',
    ...resumen(lista.filter(t => t.assignees.includes(id))),
  }));
  const sueltas = lista.filter(t => !t.assignees.length);
  if (!filtros.assignee && sueltas.length) {
    filas.push({ id: SIN_ASIGNAR, nombre: 'Sin asignar', ...resumen(sueltas) });
  }
  return filas.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

const n1 = v => (Math.round(v * 10) / 10).toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* --- Pintado ------------------------------------------------------------- */

function pintar() {
  const host = raiz.querySelector('#m-body');
  if (!host) return;
  offTips?.();

  const lista = filtradas();
  const eq = resumen(lista);
  const personas = porPersona(lista);
  const dias = diasDelRango();

  host.innerHTML = `
    <p class="xs muted" style="margin-bottom:var(--s-3)">
      ${esc(fmtDate(filtros.from, true))} → ${esc(fmtDate(filtros.to, true))} · ${dias} día${dias === 1 ? '' : 's'}
    </p>

    <div class="grid-stats">
      ${stat('Tareas', eq.total)}
      ${stat('Completadas', `${eq.porEstado.completado}`, `${Math.round(eq.avance)}% de avance`)}
      ${stat('Por día', n1(eq.dia))}
      ${stat('Por semana', n1(eq.semana))}
      ${stat('Por mes', n1(eq.mes))}
      ${stat('Tiempo promedio', eq.tiempo.avg === null ? '—' : fmtHours(eq.tiempo.avg),
             `${eq.tiempo.n} tarea${eq.tiempo.n === 1 ? '' : 's'} medida${eq.tiempo.n === 1 ? '' : 's'}`)}
    </div>

    <section class="card mt-5">
      <div class="card__head">
        <h2 class="card__title">Informe por integrante</h2>
        <span class="xs muted">Clic en un nombre para ver solo a esa persona</span>
      </div>
      ${tabla(personas)}
    </section>

    <div class="grid-2 mt-5" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))">
      <section class="card">
        <div class="card__head"><h2 class="card__title">Avance de tareas</h2></div>
        ${graficoAvance(personas)}
      </section>
      <section class="card">
        <div class="card__head">
          <h2 class="card__title">Tiempo promedio</h2>
          <div class="seg" role="group" aria-label="Agrupar tiempo por">
            <button type="button" data-tiempo="persona" aria-pressed="${tiempoPor === 'persona'}">Integrante</button>
            <button type="button" data-tiempo="tipo" aria-pressed="${tiempoPor === 'tipo'}">Tipo</button>
          </div>
        </div>
        ${graficoTiempo(lista, personas)}
      </section>
    </div>

    <section class="card mt-5">
      <div class="card__head"><h2 class="card__title">${dias <= 31 ? 'Completadas por día' : 'Completadas por semana'}</h2></div>
      ${graficoCompletadas(lista, dias <= 31)}
    </section>

    <p class="xs dim mt-4">Una tarea con varios responsables cuenta para cada uno; los totales del equipo la cuentan una vez.
      El tiempo es el transcurrido entre el inicio y el fin de la actividad (horas de reloj).</p>`;

  host.querySelectorAll('[data-persona]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.persona === SIN_ASIGNAR) return;
    filtros.assignee = b.dataset.persona;
    raiz.querySelector('#m-assignee').value = filtros.assignee;
    pintar();
  }));

  host.querySelectorAll('[data-tiempo]').forEach(b => b.addEventListener('click', () => {
    tiempoPor = b.dataset.tiempo;
    pintar();
  }));

  offTips = enableTips(host);
}

function stat(label, value, sub = '') {
  return `<div class="card stat">
    <div class="stat__label">${esc(label)}</div>
    <div class="stat__value">${esc(value)}</div>
    ${sub ? `<div class="xs muted" style="margin-top:4px">${esc(sub)}</div>` : ''}
  </div>`;
}

function tabla(personas) {
  if (!personas.length) return empty({ title: 'Sin integrantes', text: 'Todavía no hay usuarios registrados.' });

  return `<div class="table__scroll"><table class="table">
    <thead><tr>
      <th>Integrante</th><th>Total</th>
      ${ESTADOS.map(s => `<th><span class="row" style="gap:5px"><i class="st-key" style="background:${COLOR_ESTADO[s]}"></i>${ETIQUETA[s]}</span></th>`).join('')}
      <th>Avance</th><th>Por día</th><th>Por semana</th><th>Por mes</th><th>Tiempo prom.</th>
    </tr></thead>
    <tbody>${personas.map(p => `<tr>
      <td><button type="button" class="btn btn--ghost btn--sm" data-persona="${esc(p.id)}" style="padding:0 6px">${esc(p.nombre)}</button></td>
      <td class="data bold">${p.total}</td>
      ${ESTADOS.map(s => `<td class="data${p.porEstado[s] ? '' : ' dim'}">${p.porEstado[s]}</td>`).join('')}
      <td class="data">${p.total ? `${Math.round(p.avance)}%` : '—'}</td>
      <td class="data">${n1(p.dia)}</td>
      <td class="data">${n1(p.semana)}</td>
      <td class="data">${n1(p.mes)}</td>
      <td class="data">${p.tiempo.avg === null ? '—' : esc(fmtHours(p.tiempo.avg))}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function leyendaEstados() {
  return `<div class="chart__legend">${ORDEN_PILA.map(s =>
    `<span><i class="st-key" style="background:${COLOR_ESTADO[s]}"></i>${ETIQUETA[s]}</span>`).join('')}</div>`;
}

function graficoAvance(personas) {
  const filas = personas.filter(p => p.total);
  if (!filas.length) return empty({ title: 'Sin tareas en el rango', text: 'Amplía las fechas o quita filtros.' });
  const max = Math.max(...filas.map(p => p.total));

  return `<div class="chart">
    ${leyendaEstados()}
    ${filas.map(p => `<div class="hbar">
      <span class="hbar__label" title="${esc(p.nombre)}">${esc(p.nombre)}</span>
      <div class="hbar__track" style="width:${p.total / max * 100}%">
        ${ORDEN_PILA.filter(s => p.porEstado[s]).map(s => `<span class="hbar__seg"
          style="flex:${p.porEstado[s]};background:${COLOR_ESTADO[s]}"
          data-tip="${esc(`<b>${esc(p.nombre)}</b><br>${ETIQUETA[s]}: ${p.porEstado[s]} de ${p.total}`)}"></span>`).join('')}
      </div>
      <span class="hbar__value">${Math.round(p.avance)}% · ${p.total}</span>
    </div>`).join('')}
  </div>`;
}

function graficoTiempo(lista, personas) {
  let filas;
  if (tiempoPor === 'tipo') {
    const grupos = new Map();
    lista.forEach(t => {
      const k = t.type_id || '';
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(t);
    });
    filas = [...grupos].map(([k, ts]) => ({ nombre: tasksService.typeName(k) || 'Sin tipo', ...promedioHoras(ts) }));
  } else {
    filas = personas.map(p => ({ nombre: p.nombre, ...p.tiempo }));
  }
  filas = filas.filter(f => f.avg !== null).sort((a, b) => b.avg - a.avg);

  if (!filas.length) {
    return empty({
      title: 'Sin tiempos medidos',
      text: 'Una tarea cuenta aquí cuando tiene hora de inicio y de fin: pásala por En curso y luego a Completado.',
    });
  }
  const max = Math.max(...filas.map(f => f.avg)) || 1;

  return `<div class="chart">
    ${filas.map(f => `<div class="hbar">
      <span class="hbar__label" title="${esc(f.nombre)}">${esc(f.nombre)}</span>
      <div class="hbar__track" style="width:${Math.max(1, f.avg / max * 100)}%">
        <span class="hbar__seg" style="flex:1;background:var(--accent)"
          data-tip="${esc(`<b>${esc(f.nombre)}</b><br>Promedio: ${esc(fmtHours(f.avg))}<br>${f.n} tarea${f.n === 1 ? '' : 's'} medida${f.n === 1 ? '' : 's'}`)}"></span>
      </div>
      <span class="hbar__value">${esc(fmtHours(f.avg))}</span>
    </div>`).join('')}
  </div>`;
}

function lunes(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function graficoCompletadas(lista, porDia) {
  const inicio = parseDate(filtros.from);
  const fin = parseDate(filtros.to);
  const cubetas = [];
  for (let d = porDia ? new Date(inicio) : lunes(inicio); d <= fin; d.setDate(d.getDate() + (porDia ? 1 : 7))) {
    cubetas.push({ key: isoLocal(d), n: 0 });
  }
  const idx = new Map(cubetas.map((c, i) => [c.key, i]));

  lista.forEach(t => {
    if (t.status !== 'completado' || !t.finished_at) return;
    const f = new Date(t.finished_at);
    const k = isoLocal(porDia ? f : lunes(f));
    if (idx.has(k)) cubetas[idx.get(k)].n += 1;
  });

  const total = cubetas.reduce((a, c) => a + c.n, 0);
  if (!total) {
    return empty({ title: 'Ninguna tarea completada en el rango', text: 'Cuando el equipo cierre tareas, verás aquí el ritmo.' });
  }
  const max = Math.max(...cubetas.map(c => c.n));
  // Con muchas columnas, se rotula una de cada N para que no se encimen.
  const paso = Math.ceil(cubetas.length / 12);

  return `<div class="chart">
    <div class="cols">${cubetas.map(c => {
      const etiqueta = porDia ? fmtDate(c.key) : `Semana del ${fmtDate(c.key)}`;
      return `<div class="cols__col" data-tip="${esc(`<b>${esc(etiqueta)}</b><br>${c.n} completada${c.n === 1 ? '' : 's'}`)}">
        ${c.n && c.n === max ? `<span class="cols__val">${c.n}</span>` : ''}
        <div class="cols__bar" style="height:${c.n / max * 100}%"></div>
      </div>`;
    }).join('')}</div>
    <div class="cols__axis">${cubetas.map((c, i) => `<span>${i % paso === 0 ? esc(fmtDate(c.key)) : ''}</span>`).join('')}</div>
    <p class="xs muted">${total} completada${total === 1 ? '' : 's'} en el rango, de las tareas creadas en él.</p>
  </div>`;
}
