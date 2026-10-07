/* =====================================================================
   catalog-modal.js · Editor de un catalogo simple (nombre + activo)
   Lo comparten los tipos de tarea y las areas: agregar, renombrar y
   desactivar. No se borra: lo que ya usa un valor lo conserva.
   ===================================================================== */
import { esc, openModal, traducir } from './ui.js';

/**
 * @param {object}   o
 * @param {string}   o.title
 * @param {string}   o.help         texto bajo el titulo
 * @param {string}   o.placeholder  del campo "nuevo"
 * @param {Function} o.items        () => [{ id, name, is_active }] (lee el cache)
 * @param {Function} o.create       name => { error }
 * @param {Function} o.update       (id, patch) => { error }
 * @param {Function} o.refresh      relee el catalogo y actualiza el cache
 * @param {Function} [o.onClose]
 */
export function openCatalog({ title, help, placeholder, items, create, update, refresh, onClose }) {
  const filasHtml = () => items().map(x => `
    <div class="res-row" style="grid-template-columns:minmax(0,1fr) auto" data-item="${esc(x.id)}">
      <input class="input" type="text" value="${esc(x.name)}" aria-label="Nombre">
      <label class="row xs muted" style="gap:6px;white-space:nowrap">
        <input type="checkbox"${x.is_active ? ' checked' : ''}> Activo
      </label>
    </div>`).join('');

  openModal({
    title,
    body: `
      <p class="modal__text">${esc(help)}</p>
      <div class="stack" id="cat-list">${filasHtml()}</div>
      <div class="row">
        <input class="input" id="cat-new" type="text" placeholder="${esc(placeholder)}" autocomplete="off">
        <button type="button" class="btn btn--secondary" id="cat-add">Agregar</button>
      </div>
      <p class="error-text" id="cat-error" role="alert"></p>`,
    actions: [{ label: 'Listo', variant: 'primary', onClick: ({ close }) => close() }],
    onOpen: ({ modal }) => {
      const err = modal.querySelector('#cat-error');

      const enlazar = () => {
        modal.querySelectorAll('[data-item]').forEach(row => {
          const id = row.dataset.item;
          const nombre = row.querySelector('input[type="text"]');
          const activo = row.querySelector('input[type="checkbox"]');

          nombre.addEventListener('change', async () => {
            const v = nombre.value.trim();
            const actual = items().find(x => x.id === id)?.name || '';
            if (!v) { nombre.value = actual; return; }
            const { error } = await update(id, { name: v });
            err.textContent = error ? traducir(error) : '';
            if (error) nombre.value = actual;
            await refresh();
          });

          activo.addEventListener('change', async () => {
            const { error } = await update(id, { is_active: activo.checked });
            if (error) { err.textContent = traducir(error); activo.checked = !activo.checked; return; }
            await refresh();
          });
        });
      };
      enlazar();

      const agregar = async () => {
        const input = modal.querySelector('#cat-new');
        const v = input.value.trim();
        if (!v) return;
        const { error } = await create(v);
        if (error) { err.textContent = traducir(error); return; }
        err.textContent = '';
        input.value = '';
        await refresh();
        modal.querySelector('#cat-list').innerHTML = filasHtml();
        enlazar();
        input.focus();
      };
      modal.querySelector('#cat-add').addEventListener('click', agregar);
      modal.querySelector('#cat-new').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); agregar(); }
      });
    },
    onClose,
  });
}

/** El de areas se abre desde Tareas y desde Calendario: vive aqui. */
export async function openAreasCatalog(onClose) {
  const areasService = await import('./services/areas.service.js');
  const { state } = await import('./store.js');
  openCatalog({
    title: 'Áreas',
    help: 'Se usan como área solicitante en las tareas y como responsables en los eventos. Un área inactiva deja de ofrecerse, pero lo que ya la usa la conserva.',
    placeholder: 'Nueva área: Finanzas, Gerencia, Soporte...',
    items: () => state.areas,
    create: areasService.create,
    update: areasService.update,
    refresh: areasService.refresh,
    onClose,
  });
}
