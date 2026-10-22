let state = { data: [], filteredData: [], editingId: null, searchQuery: '' };

const STATUS_LABELS = {
  DISPONIBLE: 'Disponible',
  EN_SERVICIO: 'En Servicio',
  MANTENIMIENTO: 'Mantenimiento',
  FUERA_SERVICIO: 'Fuera de Servicio',
};

const STATUS_BADGES = {
  DISPONIBLE: 'badge-active',
  EN_SERVICIO: 'badge-info',
  MANTENIMIENTO: 'badge-warning',
  FUERA_SERVICIO: 'badge-inactive',
};

const esAdmin = () => Utils.puede('ADMINISTRADOR');

export function init() {
  if (!esAdmin()) {
    const btn = document.getElementById('btnNuevoVehiculo');
    if (btn) btn.style.display = 'none';
  }
  bindEvents();
  cargarVehiculos();
}

function bindEvents() {
  document.getElementById('btnNuevoVehiculo')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarVehiculo')?.addEventListener('click', guardarVehiculo);
  document.getElementById('tableVehiculosBody')?.addEventListener('click', handleTableClick);
  document.getElementById('searchVehiculos')?.addEventListener('input', Utils.debounce(handleSearch, 300));
}

async function cargarVehiculos() {
  try {
    state.data = await API.get('/vehiculos');
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
    state.filteredData = state.data.filter(v =>
      `${v.marca} ${v.modelo} ${v.placa} ${v.status}`.toLowerCase().includes(state.searchQuery)
    );
  }
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableVehiculosBody');
  if (!tbody) return;
  const items = state.filteredData || state.data || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-truck"></i><p>${state.searchQuery ? 'Sin resultados' : 'No hay vehiculos'}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(v => {
    const activo = v.activo !== false;
    const acciones = `
      <button class="btn-action btn-action-ver" data-id="${v.idVehiculo}" title="Ver"><i class="fas fa-eye"></i></button>
      ${esAdmin() ? `
        <button class="btn-action btn-action-editar" data-id="${v.idVehiculo}" title="Editar"><i class="fas fa-pen"></i></button>
        ${activo
          ? `<button class="btn-action btn-action-eliminar" data-id="${v.idVehiculo}" data-action="desactivar" title="Desactivar"><i class="fas fa-ban"></i></button>`
          : `<button class="btn-action btn-action-reactivar" data-id="${v.idVehiculo}" data-action="reactivar" title="Reactivar"><i class="fas fa-check-circle"></i></button>`}
      ` : ''}`;
    return `<tr class="${activo ? '' : 'inactive-row'}">
      <td class="fw-medium">${Utils.esc(v.placa)}</td>
      <td>${Utils.esc(v.marca)} ${Utils.esc(v.modelo)}</td>
      <td>${Number(v.kilometraje || 0).toLocaleString('es-MX')} km</td>
      <td>${v.rendimiento ?? '-'} km/l</td>
      <td>${v.limitePasajeros ?? '-'}</td>
       <td>${Utils.badge(formatearCombustible(v), porcentajeCombustible(v) < 20 ? 'badge-danger' : 'badge-info')}</td>
      <td>${Utils.badge(STATUS_LABELS[v.status] || v.status, STATUS_BADGES[v.status] || 'badge-inactive')}</td>
      <td>${Utils.badge(activo ? 'Activo' : 'Inactivo', activo ? 'badge-active' : 'badge-inactive')}</td>
      <td class="acciones-cell">${acciones}</td>
    </tr>`;
  }).join('');
}

function porcentajeCombustible(v) {
  if (v.nivelCombustible == null || !v.capacidadTanqueLitros) return 0;
  return (Number(v.nivelCombustible) / Number(v.capacidadTanqueLitros)) * 100;
}

function formatearCombustible(v) {
  if (v.nivelCombustible == null || v.capacidadTanqueLitros == null) return '-';
  return `${Number(v.nivelCombustible).toFixed(1)} L (${porcentajeCombustible(v).toFixed(0)}%)`;
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.classList.contains('btn-action-ver')) verVehiculo(id);
  else if (btn.classList.contains('btn-action-editar')) abrirModal(id);
  else if (btn.dataset.action === 'desactivar') cambiarEstado(id, false);
  else if (btn.dataset.action === 'reactivar') cambiarEstado(id, true);
}

function abrirModal(id) {
  state.editingId = id;
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('vehiculoModal'));
  document.getElementById('vehiculoModalTitle').textContent = id ? 'Editar Vehiculo' : 'Nuevo Vehiculo';
  document.getElementById('formVehiculo').reset();
  document.getElementById('vehiculoId').value = '';
  document.getElementById('vehiculoActivo').checked = true;

  if (id) {
    const v = state.data.find(v => v.idVehiculo === id);
    if (v) {
      document.getElementById('vehiculoId').value = v.idVehiculo;
      document.getElementById('vehiculoMarca').value = v.marca || '';
      document.getElementById('vehiculoModelo').value = v.modelo || '';
      document.getElementById('vehiculoPlaca').value = v.placa || '';
      document.getElementById('vehiculoKilometraje').value = v.kilometraje ?? '';
      document.getElementById('vehiculoRendimiento').value = v.rendimiento ?? '';
      document.getElementById('vehiculoLimitePasajeros').value = v.limitePasajeros ?? '';
      document.getElementById('vehiculoCapacidadTanque').value = v.capacidadTanqueLitros ?? '';
      document.getElementById('vehiculoStatus').value = v.status || '';
      document.getElementById('vehiculoActivo').checked = v.activo !== false;
    }
  }
  modal.show();
}

async function guardarVehiculo() {
  const data = {
    marca: document.getElementById('vehiculoMarca').value.trim(),
    modelo: document.getElementById('vehiculoModelo').value.trim(),
    placa: document.getElementById('vehiculoPlaca').value.trim(),
    kilometraje: parseFloat(document.getElementById('vehiculoKilometraje').value),
    rendimiento: parseFloat(document.getElementById('vehiculoRendimiento').value),
    limitePasajeros: parseInt(document.getElementById('vehiculoLimitePasajeros').value),
     capacidadTanqueLitros: parseFloat(document.getElementById('vehiculoCapacidadTanque').value),
    status: document.getElementById('vehiculoStatus').value,
  };

  if (!data.marca || !data.modelo || !data.placa || !data.status ||
      isNaN(data.kilometraje) || isNaN(data.rendimiento) ||
       isNaN(data.limitePasajeros) || isNaN(data.capacidadTanqueLitros) ||
       data.kilometraje < 0 || data.rendimiento <= 0 || data.limitePasajeros <= 0 || data.capacidadTanqueLitros <= 0) {
    Utils.showToast('Completa todos los campos obligatorios', 'warning');
    return;
  }

  try {
    const result = state.editingId
      ? await API.put('/vehiculos/' + state.editingId, data)
      : await API.post('/vehiculos', data);
    const activo = document.getElementById('vehiculoActivo').checked;
    const idGuardado = state.editingId || (result && result.idVehiculo);
    if (idGuardado && result && result.activo !== activo) {
      await API.patch('/vehiculos/' + idGuardado + '/estado', activo);
    }
    Utils.showToast(state.editingId ? 'Vehiculo actualizado' : 'Vehiculo creado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('vehiculoModal'))?.hide();
    cargarVehiculos();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function verVehiculo(id) {
  const v = state.data.find(v => v.idVehiculo === id);
  if (!v) return;
  document.getElementById('verVehiculoTitulo').textContent = `${v.marca} ${v.modelo}`;
  document.getElementById('verVehiculoPlaca').textContent = v.placa;
  document.getElementById('verVehiculoMarca').textContent = v.marca;
  document.getElementById('verVehiculoModelo').textContent = v.modelo;
  document.getElementById('verVehiculoKilometraje').textContent = Number(v.kilometraje || 0).toLocaleString('es-MX') + ' km';
  document.getElementById('verVehiculoRendimiento').textContent = (v.rendimiento ?? '-') + ' km/l';
  document.getElementById('verVehiculoPasajeros').textContent = v.limitePasajeros ?? '-';
  document.getElementById('verVehiculoTanque').textContent = (v.capacidadTanqueLitros ?? '-') + ' L';
   document.getElementById('verVehiculoCombustible').textContent = formatearCombustible(v);
  document.getElementById('verVehiculoActivo').textContent = v.activo !== false ? 'Si' : 'No';
  document.getElementById('verVehiculoFecha').textContent = Utils.formatDate(v.fechaCreacion);
  const st = document.getElementById('verVehiculoStatus');
  st.textContent = STATUS_LABELS[v.status] || v.status;
  st.className = `badge-status ${STATUS_BADGES[v.status] || 'badge-inactive'}`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('vehiculoVerModal')).show();
}

async function cambiarEstado(id, activar) {
  const confirmed = await Utils.confirmAction(
    activar ? '¿Reactivar este vehiculo?' : '¿Desactivar este vehiculo?',
    'Confirmar', activar ? 'Reactivar' : 'Desactivar', activar ? 'btn-success' : 'btn-danger'
  );
  if (!confirmed) return;
  try {
    await API.patch('/vehiculos/' + id + '/estado', activar);
    Utils.showToast(activar ? 'Vehiculo reactivado' : 'Vehiculo desactivado', 'success');
    cargarVehiculos();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}
