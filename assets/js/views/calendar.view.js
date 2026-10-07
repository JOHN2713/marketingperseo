/* =====================================================================
   calendar.view.js · Calendario de eventos (mes y agenda)
   Reune los eventos de las Masterclass (creados junto con su proceso) y
   los que se agregan a mano. Cualquiera propone un evento; nace "Por
   aprobacion" y el jefe de area lo confirma o lo rechaza.
   ===================================================================== */
import { state, isJefe, nombreDe } from '../store.js';
import * as eventsService from '../services/events.service.js';
import { ESTADOS_EVENTO, MODALIDADES } from '../services/events.service.js';
import { areaName } from '../services/areas.service.js';
import { openAreasCatalog } from '../catalog-modal.js';
import {
  esc, pill, empty, skeleton, isoDay, parseDate, today, fmtDate, fmtTime, fmtDateTime,
  toast, traducir, openModal, confirmAction, ETIQUETA,
} from '../ui.js';

const VISTA_KEY = 'mkt.calendarioVista';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
               'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MAX_POR_CELDA = 3;

let raiz = null;
let eventos = [];
let mes = primerDia(new Date());          // primer dia del mes visible
let vista = leerVista();
let filtros = { status: '', modality: '', area: '' };

function primerDia(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

function leerVista() {
  try {
    const v = localStorage.getItem(VISTA_KEY);
    if (v === 'mes' || v === 'agenda') return v;
  } catch { /* sin storage */ }
  // En pantallas angostas la cuadricula no se lee: se entra por la agenda.
  return window.matchMedia('(max-width: 700px)').matches ? 'agenda' : 'mes';
}

/** Lunes de la semana en que cae el dia 1, y 6 semanas desde ahi. */
function rangoVisible() {
  const desde = new Date(mes);
  desde.setDate(1 - ((mes.getDay() + 6) % 7));
  const hasta = new Date(desde);
  hasta.setDate(desde.getDate() + 42);
  return { desde, hasta };
}

export async function render(root, { query } = { query: new URLSearchParams() }) {
  raiz = root;

  root.innerHTML = `
    <div class="view__head">
      <div>
        <h1 class="view__title">Calendario de eventos</h1>
        <p class="view__sub">Masterclass y demás eventos del área, con su estado de aprobación.</p>
      </div>
      <div class="row-wrap">
        ${isJefe() ? '<button class="btn btn--secondary" id="btn-areas">Áreas</button>' : ''}
        <button class="btn btn--primary" id="btn-nuevo">+ Nuevo evento</button>
      </div>
    </div>
    <div class="view__rule"></div>

    <div class="toolbar">
      <div class="row" style="gap:4px">
        <button class="btn btn--secondary btn--sm" id="cal-prev" aria-label="Mes anterior">&lsaquo;</button>
        <button class="btn btn--secondary btn--sm" id="cal-hoy">Hoy</button>
        <button class="btn btn--secondary btn--sm" id="cal-next" aria-label="Mes siguiente">&rsaquo;</button>
      </div>
      <h2 class="cal__month" id="cal-titulo" aria-live="polite"></h2>
      <div class="seg" role="group" aria-label="Forma de ver el calendario" style="margin-left:auto">
        <button type="button" data-vista="mes" aria-pressed="${vista === 'mes'}">Mes</button>
        <button type="button" data-vista="agenda" aria-pressed="${vista === 'agenda'}">Agenda</button>
      </div>
      <select class="select" id="c-status" aria-label="Filtrar por estado">
        <option value="">Todos los estados</option>
        ${ESTADOS_EVENTO.map(v => `<option value="${v}">${ETIQUETA[v]}</option>`).join('')}
      </select>
      <select class="select" id="c-modality" aria-label="Filtrar por tipo">
        <option value="">Presencial y virtual</option>
        ${MODALIDADES.map(v => `<option value="${v}">${ETIQUETA[v]}</option>`).join('')}
      </select>
      <select class="select" id="c-area" aria-label="Filtrar por área responsable">
        <option value="">Toda área</option>
        ${state.areas.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}
      </select>
    </div>

    <div class="chart__legend" style="margin-bottom:var(--s-3)">
      ${ESTADOS_EVENTO.map(s => `<span><i class="ev-key ev-key--${s}"></i>${ETIQUETA[s]}</span>`).join('')}
      <span><span class="tag" style="height:16px;padding:0 5px">MC</span> Viene de un proceso</span>
    </div>

    <section id="cal-body">${skeleton(6)}</section>`;

  root.querySelector('#btn-nuevo').addEventListener('click', () => abrirEvento(null, today()));
  root.querySelector('#btn-areas')?.addEventListener('click', () => openAreasCatalog(() => render(raiz)));

  const mover = n => { mes = new Date(mes.getFullYear(), mes.getMonth() + n, 1); cargar(); };
  root.querySelector('#cal-prev').addEventListener('click', () => mover(-1));
  root.querySelector('#cal-next').addEventListener('click', () => mover(1));
  root.querySelector('#cal-hoy').addEventListener('click', () => { mes = primerDia(new Date()); cargar(); });

  root.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => {
    vista = b.dataset.vista;
    try { localStorage.setItem(VISTA_KEY, vista); } catch { /* sin storage */ }
    root.querySelectorAll('[data-vista]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    pintar();
  }));

  for (const [id, key] of [['c-status', 'status'], ['c-modality', 'modality'], ['c-area', 'area']]) {
    const el = root.querySelector(`#${id}`);
    el.value = filtros[key];
    el.addEventListener('input', () => { filtros[key] = el.value; pintar(); });
  }

  // Enlace directo desde Inicio o desde un proceso: #/calendario?evento=<id>
  const abrir = query?.get('evento');
  if (abrir) {
    const { data } = await eventsService.getById(abrir);
    if (data) mes = primerDia(new Date(data.starts_at));
    await cargar();
    if (data) abrirEvento(data);
    return;
  }

  await cargar();
}

async function cargar() {
  const host = raiz.querySelector('#cal-body');
  raiz.querySelector('#cal-titulo').textContent = `${MESES[mes.getMonth()]} ${mes.getFullYear()}`;

  const { desde, hasta } = rangoVisible();
  const { data, error } = await eventsService.list({ from: desde, to: hasta });
  if (error) {
    host.innerHTML = `<div class="card">${empty({
      title: 'No se pudieron cargar los eventos', text: traducir(error),
      actionHtml: '<button class="btn btn--secondary" onclick="location.reload()">Reintentar</button>',
    })}</div>`;
    return;
  }
  eventos = data;
  pintar();
}

function filtrados() {
  return eventos.filter(e => {
    if (filtros.status && e.status !== filtros.status) return false;
    if (filtros.modality && e.modality !== filtros.modality) return false;
    if (filtros.area && !e.areas.includes(filtros.area)) return false;
    return true;
  });
}

/** Mapa dia ISO → eventos que lo tocan (uno de varios dias aparece en cada uno). */
function porDia(lista) {
  const mapa = new Map();
  for (const e of lista) {
    const d = parseDate(isoDay(e.starts_at));
    const fin = parseDate(isoDay(eventsService.lastDay(e)));
    for (let i = 0; d <= fin && i < 62; d.setDate(d.getDate() + 1), i++) {
      const k = isoDay(d);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(e);
    }
  }
  return mapa;
}

function pintar() {
  const host = raiz?.querySelector('#cal-body');
  if (!host) return;
  const lista = filtrados();
  if (vista === 'agenda') pintarAgenda(host, lista);
  else pintarMes(host, lista);

  host.querySelectorAll('[data-evento]').forEach(el => el.addEventListener('click', ev => {
    ev.stopPropagation();
    abrirEvento(eventos.find(e => e.id === el.dataset.evento));
  }));
}

function hora(e) {
  return e.all_day ? '' : fmtTime(e.starts_at);
}

function chip(e, dia) {
  // En los dias siguientes de un evento largo la hora de inicio no aplica.
  const h = isoDay(e.starts_at) === dia ? hora(e) : '';
  const tip = `${e.title} — ${ETIQUETA[e.status]} · ${ETIQUETA[e.modality]}${h ? ` · ${h}` : ''}`;
  return `<button type="button" class="ev ev--${esc(e.status)}" data-evento="${esc(e.id)}" title="${esc(tip)}">
    ${h ? `<span class="ev__time">${esc(h)}</span>` : ''}<span class="ev__title">${esc(e.title)}</span>
  </button>`;
}

/* --- Mes ------------------------------------------------------------------ */

function pintarMes(host, lista) {
  const { desde } = rangoVisible();
  const mapa = porDia(lista);
  const hoy = today();
  const celdas = [];

  for (let i = 0, d = new Date(desde); i < 42; i++, d.setDate(d.getDate() + 1)) {
    const k = isoDay(d);
    const items = mapa.get(k) || [];
    const fuera = d.getMonth() !== mes.getMonth();
    celdas.push(`<div class="cal__cell${fuera ? ' cal__cell--out' : ''}${k === hoy ? ' cal__cell--today' : ''}"
                      data-dia="${k}" role="button" tabindex="0"
                      aria-label="${d.getDate()} de ${MESES[d.getMonth()]}, ${items.length} evento${items.length === 1 ? '' : 's'}. Crear evento">
      <span class="cal__num">${d.getDate()}</span>
      ${items.slice(0, MAX_POR_CELDA).map(e => chip(e, k)).join('')}
      ${items.length > MAX_POR_CELDA
        ? `<button type="button" class="cal__more" data-mas="${k}">+${items.length - MAX_POR_CELDA} más</button>` : ''}
    </div>`);
  }

  host.innerHTML = `<div class="card cal">
    <div class="cal__head">${DIAS.map(d => `<span>${d}</span>`).join('')}</div>
    <div class="cal__grid">${celdas.join('')}</div>
  </div>`;

  host.querySelectorAll('[data-dia]').forEach(c => {
    const crear = () => abrirEvento(null, c.dataset.dia);
    c.addEventListener('click', crear);
    c.addEventListener('keydown', e => {
      if (e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); crear(); }
    });
  });

  host.querySelectorAll('[data-mas]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    abrirDia(b.dataset.mas, mapa.get(b.dataset.mas) || []);
  }));
}

function abrirDia(dia, items) {
  const { el, close } = openModal({
    title: `Eventos del ${fmtDate(dia, true)}`,
    body: `<div class="attn" style="margin:0 calc(var(--s-5) * -1)">${items.map(e => filaAgenda(e, dia)).join('')}</div>`,
    actions: [{ label: 'Cerrar', variant: 'ghost', onClick: ({ close: c }) => c() }],
  });
  el.querySelectorAll('[data-evento]').forEach(b => b.addEventListener('click', () => {
    close();
    abrirEvento(eventos.find(e => e.id === b.dataset.evento));
  }));
}

/* --- Agenda --------------------------------------------------------------- */

function filaAgenda(e, dia) {
  const h = e.all_day ? 'Todo el día'
    : isoDay(e.starts_at) === dia ? `${fmtTime(e.starts_at)}${e.ends_at ? `–${fmtTime(e.ends_at)}` : ''}` : 'Continúa';
  return `<button type="button" class="attn__row agenda__row" data-evento="${esc(e.id)}">
    <i class="ev-key ev-key--${esc(e.status)}"></i>
    <span class="data muted" style="width:104px;flex:0 0 auto;text-align:left">${esc(h)}</span>
    <span class="grow" style="text-align:left">
      <span class="truncate" style="display:block;font-weight:500">${esc(e.title)}
        ${e.process_id ? '<span class="tag" style="height:16px;padding:0 5px;margin-left:4px">MC</span>' : ''}</span>
      <span class="xs muted">${esc([ETIQUETA[e.modality], e.areas.map(areaName).filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</span>
    </span>
    ${pill(e.status)}
  </button>`;
}

function pintarAgenda(host, lista) {
  const mapa = porDia(lista);
  // Solo los dias del mes visible, no los de relleno de la cuadricula.
  const dias = [...mapa.keys()].filter(k => parseDate(k).getMonth() === mes.getMonth()).sort();

  if (!dias.length) {
    host.innerHTML = `<div class="card">${empty({
      title: 'Sin eventos este mes',
      text: 'Crea uno con "+ Nuevo evento", o inicia una Masterclass: su evento aparece aquí solo.',
    })}</div>`;
    return;
  }

  const hoy = today();
  host.innerHTML = `<div class="card">${dias.map(k => {
    const d = parseDate(k);
    return `<div class="agenda__day${k === hoy ? ' agenda__day--today' : ''}">
      <div class="agenda__date">${DIAS_LARGO[d.getDay()]} ${d.getDate()}${k === hoy ? ' · hoy' : ''}</div>
      <div class="attn">${mapa.get(k).map(e => filaAgenda(e, k)).join('')}</div>
    </div>`;
  }).join('')}</div>`;
}

/* --- Formulario de evento --------------------------------------------------- */

function abrirEvento(evento, diaInicial = today()) {
  const nuevo = !evento;
  const e = evento || {
    title: '', description: '', starts_at: null, ends_at: null, all_day: false,
    status: 'por_aprobacion', modality: 'virtual', location: '',
    areas: state.areas.filter(a => a.name === 'Marketing').map(a => a.id),
    process_id: null, created_by: state.user.id,
  };
  const editable = eventsService.canEdit(evento);
  const jefe = isJefe();
  const dis = editable ? '' : ' disabled';

  const fecha = e.starts_at ? isoDay(e.starts_at) : diaInicial;
  const fechaFin = e.ends_at && isoDay(e.ends_at) !== fecha ? isoDay(e.ends_at) : '';
  const horaIni = e.starts_at && !e.all_day ? fmtTime(e.starts_at) : '';
  const horaFin = e.ends_at && !e.all_day ? fmtTime(e.ends_at) : '';
  const areas = state.areas.filter(a => a.is_active || e.areas.includes(a.id));

  const body = `
    ${editable ? '' : '<p class="modal__text">Solo puede editarlo el jefe de área o quien lo creó.</p>'}
    ${e.process_id ? `<p class="modal__text">Evento de un proceso.
        <a href="#/procesos/${esc(e.process_id)}" id="ev-proceso">Ver el proceso &rarr;</a></p>` : ''}
    <div class="field">
      <label for="ev-title">Evento</label>
      <input class="input" id="ev-title" type="text" value="${esc(e.title)}" placeholder="Feria de emprendimiento" autocomplete="off"${dis}>
    </div>

    <div class="form-grid">
      <div class="field">
        <label for="ev-date">Fecha</label>
        <input class="input" id="ev-date" type="date" value="${esc(fecha)}"${dis}>
      </div>
      <div class="field" data-hora>
        <label for="ev-start">Hora de inicio</label>
        <input class="input" id="ev-start" type="time" value="${esc(horaIni)}"${dis}>
      </div>
      <div class="field" data-hora>
        <label for="ev-end">Hora de fin</label>
        <input class="input" id="ev-end" type="time" value="${esc(horaFin)}"${dis}>
      </div>
      <div class="field">
        <label for="ev-date-end">Fecha de fin <span class="dim">(si dura varios días)</span></label>
        <input class="input" id="ev-date-end" type="date" value="${esc(fechaFin)}"${dis}>
      </div>
    </div>
    <label class="row sm" style="gap:6px;margin-top:-6px">
      <input type="checkbox" id="ev-allday"${e.all_day ? ' checked' : ''}${dis}> Todo el día
    </label>

    <div class="form-grid">
      <div class="field">
        <label for="ev-status">Estado</label>
        <select class="select" id="ev-status"${editable && jefe ? '' : ' disabled'}>
          ${ESTADOS_EVENTO.map(v => `<option value="${v}"${v === e.status ? ' selected' : ''}>${ETIQUETA[v]}</option>`).join('')}
        </select>
        ${jefe ? '' : '<span class="xs dim">Lo confirma o rechaza el jefe de área.</span>'}
      </div>
      <div class="field">
        <label for="ev-modality">Tipo</label>
        <select class="select" id="ev-modality"${dis}>
          ${MODALIDADES.map(v => `<option value="${v}"${v === e.modality ? ' selected' : ''}>${ETIQUETA[v]}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="ev-location" id="ev-location-label">Lugar o link</label>
        <input class="input" id="ev-location" type="text" value="${esc(e.location || '')}"${dis}>
      </div>
    </div>

    <div class="field">
      <label>Responsables</label>
      <div class="checklist" id="ev-areas">
        ${areas.map(a => `<label><input type="checkbox" value="${esc(a.id)}"${e.areas.includes(a.id) ? ' checked' : ''}${dis}> ${esc(a.name)}</label>`).join('')}
      </div>
    </div>

    <div class="field">
      <label for="ev-desc">Detalle</label>
      <textarea class="textarea" id="ev-desc"${dis}>${esc(e.description || '')}</textarea>
    </div>

    ${nuevo ? '' : `<p class="xs dim">Creado por ${esc(nombreDe(e.created_by) || '—')} · ${esc(fmtDateTime(e.created_at))}</p>`}
    <p class="error-text" id="ev-error" role="alert"></p>`;

  const actions = [];
  if (!nuevo && editable) actions.push({ label: 'Eliminar', variant: 'danger', onClick: eliminar });
  actions.push({ label: editable ? 'Cancelar' : 'Cerrar', variant: 'ghost', onClick: ({ close }) => close() });
  if (editable) actions.push({ label: nuevo ? 'Crear evento' : 'Guardar', variant: 'primary', onClick: guardar });

  openModal({
    title: nuevo ? 'Nuevo evento' : 'Evento',
    body,
    actions,
    wide: true,
    onOpen: ({ modal, close }) => {
      const allday = modal.querySelector('#ev-allday');
      const modalidad = modal.querySelector('#ev-modality');
      const sync = () => {
        modal.querySelectorAll('[data-hora]').forEach(f => f.classList.toggle('hidden', allday.checked));
        const virtual = modalidad.value === 'virtual';
        modal.querySelector('#ev-location-label').textContent = virtual ? 'Link de la reunión' : 'Lugar';
        modal.querySelector('#ev-location').placeholder = virtual ? 'https://meet.google.com/...' : 'Dirección o sala';
      };
      allday.addEventListener('change', sync);
      modalidad.addEventListener('change', sync);
      sync();
      modal.querySelector('#ev-proceso')?.addEventListener('click', close);
    },
  });

  async function guardar({ modal, close, btn }) {
    const err = modal.querySelector('#ev-error');
    err.textContent = '';
    const v = sel => modal.querySelector(sel).value;

    const title = v('#ev-title').trim();
    const dia = v('#ev-date');
    const diaFin = v('#ev-date-end');
    const allDay = modal.querySelector('#ev-allday').checked;
    const hIni = v('#ev-start');
    const hFin = v('#ev-end');

    if (!title) { err.textContent = 'Ponle un nombre al evento.'; return; }
    if (!dia) { err.textContent = 'Indica la fecha del evento.'; return; }
    if (!allDay && !hIni) { err.textContent = 'Indica la hora de inicio o marca "Todo el día".'; return; }
    if (diaFin && diaFin < dia) { err.textContent = 'La fecha de fin no puede ser anterior a la de inicio.'; return; }

    const inicio = new Date(`${dia}T${allDay ? '00:00' : hIni}`);
    let fin = null;
    if (allDay) {
      if (diaFin) fin = new Date(`${diaFin}T23:59`);
    } else if (hFin || diaFin) {
      fin = new Date(`${diaFin || dia}T${hFin || hIni}`);
    }
    if (fin && fin < inicio) { err.textContent = 'La hora de fin no puede ser anterior a la de inicio.'; return; }

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    const { error } = await eventsService.save(evento?.id, {
      title,
      description: v('#ev-desc').trim(),
      starts_at: inicio.toISOString(),
      ends_at: fin ? fin.toISOString() : '',
      all_day: allDay,
      status: v('#ev-status'),
      modality: v('#ev-modality'),
      location: v('#ev-location').trim(),
    }, [...modal.querySelectorAll('#ev-areas input:checked')].map(i => i.value));
    btn.disabled = false;
    btn.textContent = nuevo ? 'Crear evento' : 'Guardar';

    if (error) { err.textContent = traducir(error); return; }

    close();
    toast.success(nuevo
      ? (jefe ? 'Evento creado' : 'Evento creado. Queda por aprobación del jefe de área.')
      : 'Evento guardado');
    // Si la fecha nueva cae en otro mes, el calendario lo sigue.
    if (inicio.getMonth() !== mes.getMonth() || inicio.getFullYear() !== mes.getFullYear()) {
      mes = primerDia(inicio);
    }
    await cargar();
  }

  async function eliminar({ close }) {
    const ok = await confirmAction({
      title: 'Eliminar evento',
      message: e.process_id
        ? `"${e.title}" sale del calendario. Su proceso no se toca.`
        : `"${e.title}" sale del calendario.`,
    });
    if (!ok) return;
    const { error } = await eventsService.remove(evento.id);
    if (error) { toast.error(traducir(error)); return; }
    close();
    toast.success('Evento eliminado');
    await cargar();
  }
}
