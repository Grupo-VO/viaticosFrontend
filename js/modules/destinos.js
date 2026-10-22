let state = { data: [], filteredData: [], editingId: null, searchQuery: '' };

const esAdmin = () => Utils.puede('ADMINISTRADOR');

export function init() {
  if (!esAdmin()) {
    const btn = document.getElementById('btnNuevoDestino');
    if (btn) btn.style.display = 'none';
  }
  bindEvents();
  cargarDestinos();
}

function bindEvents() {
  document.getElementById('btnNuevoDestino')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarDestino')?.addEventListener('click', guardarDestino);
  document.getElementById('tableDestinosBody')?.addEventListener('click', handleTableClick);
  document.getElementById('searchDestinos')?.addEventListener('input', Utils.debounce(handleSearch, 300));
}

async function cargarDestinos() {
  try {
    state.data = await API.get('/destinos');
    state.filteredData = [...state.data];
    renderTable();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function handleSearch(e) {
  state.searchQuery = (e?.target?.value || '').toLowerCase().trim();
  state.filteredData = !state.searchQuery
    ? [...state.data]
    : state.data.filter(d => `${d.nombre} ${d.direccion}`.toLowerCase().includes(state.searchQuery));
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableDestinosBody');
  if (!tbody) return;
  const items = state.filteredData || state.data || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-map-marker-alt"></i><p>${state.searchQuery ? 'Sin resultados' : 'No hay destinos'}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(d => {
    const activo = d.activo !== false;
    const acciones = `
      <button class="btn-action btn-action-ver" data-id="${d.idDestino}" title="Ver"><i class="fas fa-eye"></i></button>
      ${esAdmin() ? `
        <button class="btn-action btn-action-editar" data-id="${d.idDestino}" title="Editar"><i class="fas fa-pen"></i></button>
        ${activo
          ? `<button class="btn-action btn-action-eliminar" data-id="${d.idDestino}" data-action="desactivar" title="Desactivar"><i class="fas fa-ban"></i></button>`
          : `<button class="btn-action btn-action-reactivar" data-id="${d.idDestino}" data-action="reactivar" title="Reactivar"><i class="fas fa-check-circle"></i></button>`}
      ` : ''}`;
    return `<tr class="${activo ? '' : 'inactive-row'}">
      <td class="fw-medium">${Utils.esc(d.nombre)}</td>
      <td>${Utils.esc(d.direccion)}</td>
      <td>${d.latitud}</td>
      <td>${d.longitud}</td>
      <td>${Utils.badge(activo ? 'Activo' : 'Inactivo', activo ? 'badge-active' : 'badge-inactive')}</td>
      <td class="acciones-cell">${acciones}</td>
    </tr>`;
  }).join('');
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.classList.contains('btn-action-ver')) verDestino(id);
  else if (btn.classList.contains('btn-action-editar')) abrirModal(id);
  else if (btn.dataset.action === 'desactivar') cambiarEstado(id, false);
  else if (btn.dataset.action === 'reactivar') cambiarEstado(id, true);
}

function abrirModal(id) {
  state.editingId = id;
  document.getElementById('destinoModalTitle').textContent = id ? 'Editar Destino' : 'Nuevo Destino';
  document.getElementById('formDestino').reset();
  document.getElementById('destinoId').value = '';
  document.getElementById('destinoActivo').checked = true;
  if (id) {
    const d = state.data.find(d => d.idDestino === id);
    if (d) {
      document.getElementById('destinoId').value = d.idDestino;
      document.getElementById('destinoNombre').value = d.nombre || '';
      document.getElementById('destinoDireccion').value = d.direccion || '';
      document.getElementById('destinoLatitud').value = d.latitud ?? '';
      document.getElementById('destinoLongitud').value = d.longitud ?? '';
      document.getElementById('destinoActivo').checked = d.activo !== false;
    }
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('destinoModal')).show();
}

async function guardarDestino() {
  const data = {
    nombre: document.getElementById('destinoNombre').value.trim(),
    direccion: document.getElementById('destinoDireccion').value.trim(),
    latitud: parseFloat(document.getElementById('destinoLatitud').value),
    longitud: parseFloat(document.getElementById('destinoLongitud').value),
  };
  if (!data.nombre || !data.direccion || isNaN(data.latitud) || isNaN(data.longitud) ||
      data.latitud < -90 || data.latitud > 90 || data.longitud < -180 || data.longitud > 180) {
    Utils.showToast('Completa todos los campos obligatorios', 'warning');
    return;
  }
  try {
    const result = state.editingId
      ? await API.put('/destinos/' + state.editingId, data)
      : await API.post('/destinos', data);
    const activo = document.getElementById('destinoActivo').checked;
    const idGuardado = state.editingId || (result && result.idDestino);
    if (idGuardado && result && result.activo !== activo) {
      await API.patch('/destinos/' + idGuardado + '/estado', activo);
    }
    Utils.showToast(state.editingId ? 'Destino actualizado' : 'Destino creado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('destinoModal'))?.hide();
    cargarDestinos();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function verDestino(id) {
  const d = state.data.find(d => d.idDestino === id);
  if (!d) return;
  document.getElementById('verDestinoNombre').textContent = d.nombre;
  document.getElementById('verDestinoDireccion').textContent = d.direccion;
  document.getElementById('verDestinoLat').textContent = d.latitud;
  document.getElementById('verDestinoLng').textContent = d.longitud;
  document.getElementById('verDestinoActivo').textContent = d.activo !== false ? 'Si' : 'No';
  const st = document.getElementById('verDestinoEstado');
  st.textContent = d.activo !== false ? 'Activo' : 'Inactivo';
  st.className = `badge-status ${d.activo !== false ? 'badge-active' : 'badge-inactive'}`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('destinoVerModal')).show();
  dibujarMapaDestino(d);
}

async function dibujarMapaDestino(destino) {
  const cont = document.getElementById('destinoMap');
  if (!cont) return;
  cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Cargando mapa...</span></div>';
  await Utils.cargarGoogleMaps();
  if (!(window.google && window.google.maps)) {
    cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Mapa no disponible</span></div>';
    return;
  }
  const position = { lat: Number(destino.latitud), lng: Number(destino.longitud) };
  const map = new google.maps.Map(cont, {
    center: position,
    zoom: 15,
    mapTypeControl: false,
    streetViewControl: false,
  });
  new google.maps.Marker({ position, map, title: destino.nombre });
}

async function cambiarEstado(id, activar) {
  const confirmed = await Utils.confirmAction(
    activar ? '¿Reactivar este destino?' : '¿Desactivar este destino?',
    'Confirmar', activar ? 'Reactivar' : 'Desactivar', activar ? 'btn-success' : 'btn-danger'
  );
  if (!confirmed) return;
  try {
    await API.patch('/destinos/' + id + '/estado', activar);
    Utils.showToast(activar ? 'Destino reactivado' : 'Destino desactivado', 'success');
    cargarDestinos();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}
