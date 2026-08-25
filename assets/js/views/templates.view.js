/* =====================================================================
   templates.view.js · Catalogo de plantillas (admin)
   ===================================================================== */
import { state } from '../store.js';
import * as templatesService from '../services/templates.service.js';
import { navigate } from '../router.js';
import {
  esc, empty, skeleton, fmtDate, toast, traducir,
  openModal, confirmTyped, isValidUrl,
} from '../ui.js';

const ICONOS = ['📋','🎓','🚀','📣','✉️','🎯','🛠️','📊','🎬','🧪'];
const COLORES = ['#6D28D9','#2563C9','#0F766E','#B45309','#BE123C','#4B5563'];

let plantillas = [];

export async function render(root) {
  root.innerHTML = `
    <div class="view__head">
      <div>
        <h1 class="view__title">Plantillas</h1>
        <p class="view__sub">El checklist maestro. Editarla no toca los procesos ya creados.</p>
      </div>
      <button class="btn btn--primary" id="btn-nueva">+ Nueva plantilla</button>
    </div>
    <div class="view__rule"></div>
    <section class="card" id="lista">${skeleton(4)}</section>`;

  root.querySelector('#btn-nueva').addEventListener('click', () => abrirFormulario(null, root));

  await recargar(root);
}

async function recargar(root) {
  const { data, error } = await templatesService.list();
  const host = root.querySelector('#lista');

  if (error) {
    host.innerHTML = empty({
      title: 'No se pudieron cargar las plantillas',
      text: traducir(error),
      actionHtml: '<button class="btn btn--secondary" onclick="location.reload()">Reintentar</button>',
    });
    return;
  }

  plantillas = data;
  state.templates = data.filter(t => t.is_active);

  if (!plantillas.length) {
    host.innerHTML = empty({
      title: 'Todavía no hay plantillas',
      text: 'Una plantilla es el checklist que se clona cada vez que arranca un proceso.',
      actionHtml: '<button class="btn btn--primary" id="btn-vacio">Crear plantilla</button>',
    });
    host.querySelector('#btn-vacio').addEventListener('click', () => abrirFormulario(null, root));
    return;
  }

  host.innerHTML = `
    <div class="table__scroll">
      <table class="table">
        <thead>
          <tr>
            <th>Plantilla</th><th>Pasos</th><th>Estado</th><th>Creada</th><th></th>
          </tr>
        </thead>
        <tbody>${plantillas.map(filaHtml).join('')}</tbody>
      </table>
    </div>`;

  host.querySelector('tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const t = plantillas.find(x => x.id === tr.dataset.id);
    if (!t) return;

    if (e.target.closest('[data-edit]'))   return abrirFormulario(t, root);
    if (e.target.closest('[data-dup]'))    return duplicar(t);
    if (e.target.closest('[data-toggle]')) return alternarActiva(t, root);
    if (e.target.closest('[data-del]'))    return borrar(t, root);
    navigate(`#/plantillas/${t.id}`);
  });
}

function filaHtml(t) {
  return `<tr data-id="${esc(t.id)}" style="cursor:pointer">
    <td>
      <div class="row">
        <span style="font-size:20px">${esc(t.icon || '📋')}</span>
        <span>
          <span class="bold" style="display:block">${esc(t.name)}</span>
          <span class="xs muted truncate" style="display:block;max-width:46ch">${esc(t.description)}</span>
        </span>
      </div>
    </td>
    <td class="data">${t.steps_count}</td>
    <td>${t.is_active
      ? '<span class="pill pill--completado">Activa</span>'
      : '<span class="pill pill--omitido">Inactiva</span>'}</td>
    <td class="data muted">${esc(fmtDate(t.created_at.slice(0, 10), true))}</td>
    <td>
      <div class="row" style="justify-content:flex-end">
        <button class="btn btn--ghost btn--sm" type="button" data-edit>Editar</button>
        <button class="btn btn--ghost btn--sm" type="button" data-dup>Duplicar</button>
        <button class="btn btn--ghost btn--sm" type="button" data-toggle>${t.is_active ? 'Desactivar' : 'Activar'}</button>
        <button class="btn btn--danger btn--sm" type="button" data-del>Eliminar</button>
      </div>
    </td>
  </tr>`;
}

/* --- Crear y editar ----------------------------------------------------- */

function abrirFormulario(t, root) {
  const esNueva = !t;

  openModal({
    title: esNueva ? 'Nueva plantilla' : 'Editar plantilla',
    body: `
      <div class="field">
        <label for="tp-name">Nombre</label>
        <input class="input" id="tp-name" type="text" value="${esc(t?.name)}" placeholder="Webinar de ventas">
      </div>
      <div class="field">
        <label for="tp-desc">Descripci&oacute;n</label>
        <textarea class="textarea" id="tp-desc" placeholder="Qué cubre este proceso de principio a fin">${esc(t?.description)}</textarea>
      </div>
      <div class="field">
        <label for="tp-icon">&Iacute;cono</label>
        <select class="select" id="tp-icon">
          ${ICONOS.map(i => `<option value="${i}"${i === (t?.icon || '📋') ? ' selected' : ''}>${i}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="tp-color">Color</label>
        <select class="select" id="tp-color">
          ${COLORES.map(c => `<option value="${c}"${c === (t?.color || COLORES[0]) ? ' selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="tp-url">Link del recurso general</label>
        <input class="input" id="tp-url" type="url" placeholder="https://" value="${esc(t?.resource_url)}">
      </div>
      <p class="error-text" id="tp-error" role="alert"></p>`,
    actions: [
      { label: 'Cancelar', variant: 'ghost', onClick: ({ close }) => close() },
      { label: esNueva ? 'Crear' : 'Guardar', variant: 'primary', onClick: guardar },
    ],
  });

  async function guardar({ modal, close, btn }) {
    const err = modal.querySelector('#tp-error');
    err.textContent = '';

    const name = modal.querySelector('#tp-name').value.trim();
    const url  = modal.querySelector('#tp-url').value.trim();
    if (!name) { err.textContent = 'La plantilla necesita un nombre.'; return; }
    if (!isValidUrl(url)) { err.textContent = 'El link debe empezar con http:// o https://'; return; }

    const payload = {
      name,
      description: modal.querySelector('#tp-desc').value.trim() || null,
      icon: modal.querySelector('#tp-icon').value,
      color: modal.querySelector('#tp-color').value,
      resource_url: url || null,
    };

    btn.disabled = true;
    const res = esNueva
      ? await templatesService.create(payload)
      : await templatesService.update(t.id, payload);
    btn.disabled = false;

    if (res.error) { err.textContent = traducir(res.error); return; }

    close();
    toast.success(esNueva ? 'Plantilla creada' : 'Guardado');
    if (esNueva) navigate(`#/plantillas/${res.data.id}`);
    else if (root) await recargar(root);
  }
}

async function duplicar(t) {
  const { data, error } = await templatesService.duplicate(t.id);
  if (error) return toast.error('No se pudo duplicar la plantilla. ' + traducir(error));
  toast.success('Copia creada. Nace desactivada para que la revises antes de usarla.');
  navigate(`#/plantillas/${data}`);
}

async function alternarActiva(t, root) {
  const { error } = await templatesService.update(t.id, { is_active: !t.is_active });
  if (error) return toast.error(traducir(error));
  toast.success(t.is_active
    ? 'Plantilla desactivada. Ya no aparece al crear procesos.'
    : 'Plantilla activada.');
  await recargar(root);
}

async function borrar(t, root) {
  const ok = await confirmTyped({
    title: 'Eliminar plantilla',
    message: `Se eliminan sus ${t.steps_count} pasos. Los procesos ya creados con ella no se tocan.`,
    expected: t.name,
  });
  if (!ok) return;

  const { error } = await templatesService.remove(t.id);
  if (error) return toast.error('No se pudo eliminar la plantilla. ' + traducir(error));
  toast.success('Plantilla eliminada');
  await recargar(root);
}
