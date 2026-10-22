let state = { data: [], filteredData: [], editingId: null, searchQuery: '', fotoFile: null };

export function init() {
  bindEvents();
  cargarPersonas();
}

function bindEvents() {
  document.getElementById('btnNuevaPersona')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarPersona')?.addEventListener('click', guardarPersona);
  document.getElementById('tablePersonasBody')?.addEventListener('click', handleTableClick);
  document.getElementById('searchPersonas')?.addEventListener('input', Utils.debounce(handleSearch, 300));
  document.getElementById('fotoInput')?.addEventListener('change', handleFotoPreview);
}

async function cargarPersonas() {
  try {
    state.data = await API.get('/personas');
    state.filteredData = [...state.data];
    renderTable();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function handleSearch(e) {
  state.searchQuery = (e?.target?.value || '').toLowerCase().trim();
  if (!state.searchQuery) {
    state.filteredData = [...state.data];
  } else {
    state.filteredData = state.data.filter(p => {
      const nombre = `${p.nombre} ${p.apellidoPaterno} ${p.apellidoMaterno}`.toLowerCase();
      const username = (p.username || '').toLowerCase();
      const rol = (p.role || '').toLowerCase();
      return nombre.includes(state.searchQuery) || username.includes(state.searchQuery) || rol.includes(state.searchQuery);
    });
  }
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tablePersonasBody');
  if (!tbody) return;

  const items = state.filteredData || state.data || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><p>${state.searchQuery ? 'Sin resultados' : 'No hay personas'}</p></div></td></tr>`;
    return;
  }

  const storageBase = API.fileUrl('uploads/');

  tbody.innerHTML = items.map(p => {
    const fotoHtml = p.foto
      ? `<img src="${storageBase}${p.foto}" class="tabla-foto" alt="">`
      : `<div class="tabla-foto tabla-foto-placeholder"><i class="fas fa-user"></i></div>`;
    const nombre = `${Utils.esc(p.nombre)} ${Utils.esc(p.apellidoPaterno)} ${Utils.esc(p.apellidoMaterno)}`;
    const activo = p.activa;
    return `<tr class="${activo ? '' : 'inactive-row'}">
      <td>${fotoHtml}</td>
      <td class="fw-medium">${nombre}</td>
      <td>${Utils.esc(p.username)}</td>
      <td>${Utils.esc(formatRole(p.role))}</td>
      <td><span class="badge-status ${activo ? 'badge-active' : 'badge-inactive'}">${activo ? 'Activa' : 'Inactiva'}</span></td>
      <td class="acciones-cell">
        <button class="btn-action btn-action-ver" data-id="${p.idPersona}" title="Ver"><i class="fas fa-eye"></i></button>
        <button class="btn-action btn-action-editar" data-id="${p.idPersona}" title="Editar"><i class="fas fa-pen"></i></button>
        ${activo
          ? `<button class="btn-action btn-action-eliminar" data-id="${p.idPersona}" data-action="desactivar" title="Desactivar"><i class="fas fa-ban"></i></button>`
          : `<button class="btn-action btn-action-reactivar" data-id="${p.idPersona}" data-action="reactivar" title="Reactivar"><i class="fas fa-check-circle"></i></button>`}
      </td>
    </tr>`;
  }).join('');
}

function formatRole(role) {
  const roles = { 'ADMINISTRADOR': 'Administrador', 'CHOFER': 'Chofer', 'USUARIO_AUTORIZADO': 'Usuario Autorizado', 'AUDITORIA': 'Auditoria' };
  return roles[role] || role;
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.classList.contains('btn-action-ver')) verPersona(id);
  else if (btn.classList.contains('btn-action-editar')) abrirModal(id);
  else if (btn.dataset.action === 'desactivar') cambiarEstado(id, false);
  else if (btn.dataset.action === 'reactivar') cambiarEstado(id, true);
}

function handleFotoPreview(e) {
  const file = e.target.files[0];
  if (!file) return;
  state.fotoFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const preview = document.getElementById('fotoPreview');
    preview.innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
  };
  reader.readAsDataURL(file);
}

function abrirModal(id) {
  state.editingId = id;
  state.fotoFile = null;
  const modal = new bootstrap.Modal(document.getElementById('personaModal'));
  document.getElementById('personaModalTitle').textContent = id ? 'Editar Persona' : 'Nueva Persona';
  document.getElementById('formPersona').reset();
  document.getElementById('personaId').value = '';
  document.getElementById('personaActiva').checked = true;
  document.getElementById('fotoPreview').innerHTML = '<i class="fas fa-user"></i>';
  document.getElementById('fotoInput').value = '';

  if (id) {
    const p = state.data.find(p => p.idPersona === id);
    if (p) {
      document.getElementById('personaId').value = p.idPersona;
      document.getElementById('personaNombre').value = p.nombre || '';
      document.getElementById('personaApellidoP').value = p.apellidoPaterno || '';
      document.getElementById('personaApellidoM').value = p.apellidoMaterno || '';
      document.getElementById('personaUsername').value = p.username || '';
      document.getElementById('personaRol').value = p.role || '';
      document.getElementById('personaActiva').checked = p.activa !== false;
      document.getElementById('labelPassword').innerHTML = 'Password';
      document.getElementById('personaPassword').required = false;

      if (p.foto) {
         document.getElementById('fotoPreview').innerHTML = `<img src="${Utils.esc(API.fileUrl(p.foto))}" alt="Preview">`;
      }
    }
  } else {
    document.getElementById('labelPassword').innerHTML = 'Password <span class="text-danger">*</span>';
    document.getElementById('personaPassword').required = true;
  }
  modal.show();
}

async function guardarPersona() {
  const data = {
    nombre: document.getElementById('personaNombre').value.trim(),
    apellidoPaterno: document.getElementById('personaApellidoP').value.trim(),
    apellidoMaterno: document.getElementById('personaApellidoM').value.trim(),
    username: document.getElementById('personaUsername').value.trim(),
    password: document.getElementById('personaPassword').value,
    role: document.getElementById('personaRol').value,
    activa: document.getElementById('personaActiva').checked,
  };

  if (!data.nombre || !data.apellidoPaterno || !data.apellidoMaterno || !data.username || !data.role) {
    Utils.showToast('Todos los campos marcados son obligatorios', 'warning');
    return;
  }

  if (!state.editingId && !data.password) {
    Utils.showToast('La contraseña es obligatoria', 'warning');
    return;
  }

  try {
    let result;
    if (state.editingId) {
      result = await API.put('/personas/' + state.editingId, data);
      Utils.showToast('Persona actualizada', 'success');
    } else {
      result = await API.post('/personas', data);
      Utils.showToast('Persona creada', 'success');
    }

    // subir foto si hay
    if (state.fotoFile && result && result.idPersona) {
      const fd = new FormData();
      fd.append('foto', state.fotoFile);
      await API.upload('/personas/' + result.idPersona + '/foto', fd);
    }

    bootstrap.Modal.getInstance(document.getElementById('personaModal'))?.hide();
    cargarPersonas();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function verPersona(id) {
  const p = state.data.find(p => p.idPersona === id);
  if (!p) return;
  const storageBase = API.fileUrl('uploads/');

  document.getElementById('verNombre').textContent = `${p.nombre} ${p.apellidoPaterno} ${p.apellidoMaterno}`;
  document.getElementById('verApellidoP').textContent = p.apellidoPaterno;
  document.getElementById('verApellidoM').textContent = p.apellidoMaterno;
  document.getElementById('verUsername').textContent = p.username;
  document.getElementById('verRol').textContent = formatRole(p.role);
  document.getElementById('verFecha').textContent = Utils.formatDate(p.fechaCreacion);

  const estadoEl = document.getElementById('verEstado');
  estadoEl.textContent = p.activa ? 'Activa' : 'Inactiva';
  estadoEl.className = `badge-status ${p.activa ? 'badge-active' : 'badge-inactive'}`;

  const fotoVer = document.getElementById('fotoVerPreview');
  if (p.foto) {
    fotoVer.innerHTML = `<img src="${storageBase}${p.foto}" alt="">`;
  } else {
    fotoVer.innerHTML = '<i class="fas fa-user"></i>';
  }

  const modal = new bootstrap.Modal(document.getElementById('personaVerModal'));
  modal.show();
}

async function cambiarEstado(id, activar) {
  const msg = activar ? '¿Reactivar esta persona?' : '¿Desactivar esta persona?';
  const btn = activar ? 'Reactivar' : 'Desactivar';
  const confirmed = await Utils.confirmAction(msg, 'Confirmar', btn);
  if (!confirmed) return;
  try {
    await API.patch('/personas/' + id + '/estado', activar);
    Utils.showToast(activar ? 'Persona reactivada' : 'Persona desactivada', 'success');
    cargarPersonas();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}
