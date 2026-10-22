let state = { data: [], filteredData: [], searchQuery: '', vehiculos: [], filtroVehiculo: '' };

const puedeCrear = () => Utils.puede('ADMINISTRADOR', 'CHOFER');
const puedeExportar = () => Utils.puede('ADMINISTRADOR', 'AUDITORIA');

export function init() {
  if (!puedeCrear()) {
    const btn = document.getElementById('btnNuevaCarga');
    if (btn) btn.style.display = 'none';
  }
  if (!puedeExportar()) {
    const exp = document.getElementById('exportCombustible');
    if (exp) exp.style.display = 'none';
  }
  bindEvents();
  cargarVehiculos();
  cargarCargas();
}

function bindEvents() {
  document.getElementById('btnNuevaCarga')?.addEventListener('click', () => abrirModalCarga());
  document.getElementById('btnGuardarCarga')?.addEventListener('click', guardarCarga);
  document.getElementById('tableCargasBody')?.addEventListener('click', handleTableClick);
  document.getElementById('searchCargas')?.addEventListener('input', Utils.debounce(handleSearch, 300));
  document.getElementById('filtroVehiculoCarga')?.addEventListener('change', (e) => {
    state.filtroVehiculo = e.target.value;
    aplicarFiltros();
  });
  document.getElementById('cargaVehiculo')?.addEventListener('change', actualizarLimiteCarga);
  document.getElementById('btnExpCombustibleXlsx')?.addEventListener('click', () => exportar('xlsx'));
  document.getElementById('btnExpCombustiblePdf')?.addEventListener('click', () => exportar('pdf'));
}

async function cargarVehiculos() {
  try {
    state.vehiculos = await API.get('/vehiculos');
    const activos = state.vehiculos.filter(v => v.activo !== false);
    Utils.rellenarSelect('cargaVehiculo', activos, 'idVehiculo', v => `${v.placa} — ${v.marca} ${v.modelo}`);
    Utils.rellenarSelect('filtroVehiculoCarga', [], 'idVehiculo', '');
    const filtro = document.getElementById('filtroVehiculoCarga');
    filtro.innerHTML = `<option value="">Todos los vehiculos</option>` +
      state.vehiculos.map(v => `<option value="${v.idVehiculo}">${Utils.esc(v.placa)} — ${Utils.esc(v.marca)} ${Utils.esc(v.modelo)}</option>`).join('');
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function cargarCargas() {
  try {
    state.data = await API.get('/cargas-combustible');
    aplicarFiltros();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function handleSearch(e) {
  state.searchQuery = (e?.target?.value || '').toLowerCase().trim();
  aplicarFiltros();
}

function aplicarFiltros() {
  state.filteredData = (state.data || []).filter(c =>
    (!state.filtroVehiculo || c.idVehiculo == state.filtroVehiculo) &&
    (!state.searchQuery ||
      `${c.placaVehiculo} ${c.vehiculoDescripcion}`.toLowerCase().includes(state.searchQuery))
  );
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableCargasBody');
  if (!tbody) return;
  const items = state.filteredData || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-gas-pump"></i><p>${state.searchQuery ? 'Sin resultados' : 'No hay cargas de combustible'}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(c => `
    <tr>
      <td class="fw-medium">${Utils.esc(c.placaVehiculo)} <small class="text-muted">${Utils.esc(c.vehiculoDescripcion || '')}</small></td>
      <td>${Utils.formatFechaHora(c.fecha)}</td>
      <td>${c.litros} L</td>
      <td>${Utils.moneda(c.costoTotal)}</td>
      <td>${Number(c.odometro || 0).toLocaleString('es-MX')} km</td>
      <td>${c.comprobanteRuta
        ? `<button class="btn-action btn-action-descargar" data-id="${c.idCarga}" data-action="comprobante" title="Descargar"><i class="fas fa-file-download"></i></button>`
        : '-'}</td>
      <td class="acciones-cell">
        <button class="btn-action btn-action-ver" data-id="${c.idCarga}" title="Ver"><i class="fas fa-eye"></i></button>
      </td>
    </tr>`).join('');
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.classList.contains('btn-action-ver')) verCarga(id);
  else if (btn.dataset.action === 'comprobante') descargarComprobante(id);
}

function abrirModalCarga() {
  document.getElementById('formCarga').reset();
  actualizarLimiteCarga();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('cargaModal')).show();
}

function actualizarLimiteCarga() {
  const vehiculo = state.vehiculos.find(v => v.idVehiculo == document.getElementById('cargaVehiculo')?.value);
  const litros = document.getElementById('cargaLitros');
  if (!litros || !vehiculo) return;
  const disponible = Math.max(0, Number(vehiculo.capacidadTanqueLitros || 0) - Number(vehiculo.nivelCombustible || 0));
  litros.max = disponible.toFixed(2);
  litros.title = `Espacio disponible: ${disponible.toFixed(2)} L`;
  litros.setCustomValidity('');
}

async function guardarCarga() {
  const idVehiculo = parseInt(document.getElementById('cargaVehiculo').value);
  const fechaRaw = document.getElementById('cargaFecha').value;
  const litros = parseFloat(document.getElementById('cargaLitros').value);
  const odometro = parseFloat(document.getElementById('cargaOdometro').value);
  const file = document.getElementById('cargaComprobante').files[0];
  const vehiculo = state.vehiculos.find(v => v.idVehiculo === idVehiculo);
  const disponible = vehiculo
    ? Number(vehiculo.capacidadTanqueLitros || 0) - Number(vehiculo.nivelCombustible || 0)
    : 0;

  if (isNaN(idVehiculo) || !fechaRaw || isNaN(litros) || isNaN(odometro)) {
    Utils.showToast('Completa todos los campos obligatorios', 'warning');
    return;
  }
  if (litros > disponible + 0.0001) {
    Utils.showToast(`La carga excede el espacio disponible del tanque (${disponible.toFixed(2)} L)`, 'warning');
    return;
  }

  const payload = {
    idVehiculo,
    fecha: fechaRaw,
    litros,
    odometro,
  };

  const fd = new FormData();
  fd.append('request', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  if (file) fd.append('comprobante', file);

  try {
    await API.multipart('/cargas-combustible', fd);
    Utils.showToast('Carga registrada', 'success');
    bootstrap.Modal.getInstance(document.getElementById('cargaModal'))?.hide();
    cargarCargas();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function verCarga(id) {
  const c = state.data.find(c => c.idCarga === id);
  if (!c) return;
  document.getElementById('verCargaVehiculo').textContent = `${c.placaVehiculo} ${c.vehiculoDescripcion || ''}`;
  document.getElementById('verCargaFecha').textContent = Utils.formatFechaHora(c.fecha);
  document.getElementById('verCargaLitros').textContent = c.litros + ' L';
  document.getElementById('verCargaCosto').textContent = Utils.moneda(c.costoTotal);
  document.getElementById('verCargaOdometro').textContent = Number(c.odometro || 0).toLocaleString('es-MX') + ' km';
  const link = document.getElementById('verComprobanteLink');
  if (c.comprobanteRuta) {
    link.style.display = '';
    link.onclick = (e) => { e.preventDefault(); descargarComprobante(id); };
  } else {
    link.style.display = 'none';
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('cargaVerModal')).show();
}

async function descargarComprobante(id) {
  try {
    await Utils.descargar('/cargas-combustible/' + id + '/comprobante', 'comprobante-carga-' + id);
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function exportar(tipo) {
  try {
    await Utils.descargar('/exportaciones/combustible.' + tipo, 'cargas-combustible.' + tipo);
    Utils.showToast('Exportacion generada', 'success');
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}
