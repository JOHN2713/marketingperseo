/* =====================================================================
   users.view.js · Gestion de roles (admin)
   No se crean usuarios desde aqui: la gente se registra y el admin promueve.
   ===================================================================== */
import { state } from '../store.js';
import * as usersService from '../services/users.service.js';
import { esc, empty, skeleton, fmtDate, toast, traducir, confirmAction } from '../ui.js';

let perfiles = [];

export async function render(root) {
  root.innerHTML = `
    <div class="view__head">
      <div>
        <h1 class="view__title">Usuarios</h1>
        <p class="view__sub">La gente se registra sola desde la pantalla de acceso. Aquí solo se cambian roles.</p>
      </div>
    </div>
    <div class="view__rule"></div>
    <section class="card" id="lista">${skeleton(4)}</section>`;

  await recargar(root);
}

async function recargar(root) {
  const host = root.querySelector('#lista');
  const { data, error } = await usersService.list();

  if (error) {
    host.innerHTML = empty({
      title: 'No se pudieron cargar los usuarios',
      text: traducir(error),
      actionHtml: '<button class="btn btn--secondary" onclick="location.reload()">Reintentar</button>',
    });
    return;
  }

  perfiles = data;
  state.profiles = data;

  host.innerHTML = `
    <div class="table__scroll">
      <table class="table">
        <thead>
          <tr><th>Nombre</th><th>Correo</th><th>Registro</th><th>Rol</th></tr>
        </thead>
        <tbody>${perfiles.map(filaHtml).join('')}</tbody>
      </table>
    </div>
    <div class="card__body xs muted">
      ${admins()} administrador${admins() === 1 ? '' : 'es'} de ${perfiles.length} usuario${perfiles.length === 1 ? '' : 's'}.
      Siempre debe quedar al menos uno.
    </div>`;

  host.querySelectorAll('[data-role-select]').forEach(sel => {
    sel.addEventListener('change', () => cambiarRol(sel, root));
  });
}

function admins() {
  return perfiles.filter(p => p.role === 'admin').length;
}

function filaHtml(p) {
  const yo = p.id === state.user.id;
  return `<tr>
    <td>
      <span class="bold">${esc(p.full_name || '—')}</span>
      ${yo ? '<span class="tag" style="margin-left:8px">tú</span>' : ''}
    </td>
    <td class="sm muted">${esc(p.email)}</td>
    <td class="data muted">${esc(fmtDate(p.created_at.slice(0, 10), true))}</td>
    <td>
      <select class="select" data-role-select data-id="${esc(p.id)}" data-antes="${esc(p.role)}"
              aria-label="Rol de ${esc(p.full_name || p.email)}">
        <option value="user"${p.role === 'user' ? ' selected' : ''}>Usuario</option>
        <option value="admin"${p.role === 'admin' ? ' selected' : ''}>Administrador</option>
      </select>
    </td>
  </tr>`;
}

async function cambiarRol(sel, root) {
  const id = sel.dataset.id;
  const antes = sel.dataset.antes;
  const nuevo = sel.value;
  if (antes === nuevo) return;

  const perfil = perfiles.find(p => p.id === id);
  const restaurar = () => { sel.value = antes; };

  // Sin administrador nadie puede editar plantillas ni roles, y recuperarlo
  // exige volver al SQL Editor de Supabase. Se bloquea antes de guardar.
  if (antes === 'admin' && nuevo === 'user') {
    const { count, error } = await usersService.adminCount();
    if (error) { toast.error(traducir(error)); return restaurar(); }
    if (count <= 1) {
      toast.error('Es el único administrador. Promueve a alguien más antes de quitarle el rol.');
      return restaurar();
    }

    const ok = await confirmAction({
      title: id === state.user.id ? 'Quitarte el rol de administrador' : 'Quitar el rol de administrador',
      message: id === state.user.id
        ? 'Perderás el acceso a Plantillas y Usuarios en cuanto recargues. Otro administrador tendrá que devolvértelo.'
        : `${perfil.full_name || perfil.email} dejará de ver Plantillas y Usuarios.`,
      confirmText: 'Quitar rol',
    });
    if (!ok) return restaurar();
  }

  const { error } = await usersService.updateRole(id, nuevo);
  if (error) { toast.error(traducir(error)); return restaurar(); }

  toast.success(nuevo === 'admin' ? 'Ahora es administrador' : 'Ahora es usuario');
  await recargar(root);

  // Si me quite el rol a mi mismo, el menu tiene que reflejarlo sin recargar.
  if (id === state.user.id) {
    state.profile.role = nuevo;
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', nuevo !== 'admin'));
    document.getElementById('user-role').textContent = nuevo === 'admin' ? 'Administrador' : 'Usuario';
  }
}
