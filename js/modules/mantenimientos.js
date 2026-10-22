let state = { data: [], filteredData: [], searchQuery: '', vehiculos: [], filtroVehiculo: '' };

const puedeCrear = () => Utils.puede('ADMINISTRADOR', 'CHOFER');
const esAdmin = () => Utils.puede('ADMINISTRADOR');
const puedeExportar = () => Utils.puede('ADMINISTRADOR', 'AUDITORIA');

export function init() {
  if (!puedeCrear()) {
    const btn = document.getElementById('btnNuevoMantenimiento');
    if (btn) btn.style.display = 'none';
  }
  if (!puedeExportar()) {
    const exp = document.getElementById('exportMantenimientos');
    if (exp) exp.style.display = 'none';
  }
  bindEvents();
  cargarVehiculos();
  cargarMantenimientos();
}

function bindEvents() {
  document.getElementById('btnNuevoMantenimiento')?.addEventListener('click', () => abrirModal());
  document.getElementById('btnGuardarMantenimiento')?.addEventListener('click', guardarMantenimiento);
  document.getElementById('tableMantenimientosBody')?.addEventListener('click', handleTableClick);
  document.getElementById('searchMantenimientos')?.addEventListener('input', Utils.debounce(handleSearch, 300));
  document.getElementById('filtroVehiculoMant')?.addEventListener('change', (e) => {
    state.filtroVehiculo = e.target.value;
    aplicarFiltros();
  });
  document.getElementById('btnExpMantXlsx')?.addEventListener('click', () => exportar('xlsx'));
  document.getElementById('btnExpMantPdf')?.addEventListener('click', () => exportar('pdf'));
}

async function cargarVehiculos() {
  try {
    state.vehiculos = await API.get('/vehiculos');
    const activos = state.vehiculos.filter(v => v.activo !== false);
    Utils.rellenarSelect('mantVehiculo', activos, 'idVehiculo', v => `${v.placa} — ${v.marca} ${v.modelo}`);
    const filtro = document.getElementById('filtroVehiculoMant');
    filtro.innerHTML = `<option value="">Todos los vehiculos</option>` +
      state.vehiculos.map(v => `<option value="${v.idVehiculo}">${Utils.esc(v.placa)} — ${Utils.esc(v.marca)} ${Utils.esc(v.modelo)}</option>`).join('');
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function cargarMantenimientos() {
  try {
    state.data = await API.get('/mantenimientos');
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
  state.filteredData = (state.data || []).filter(m =>
    (!state.filtroVehiculo || m.idVehiculo == state.filtroVehiculo) &&
    (!state.searchQuery ||
      `${m.placaVehiculo} ${m.vehiculoDescripcion} ${m.tipo} ${m.descripcion}`.toLowerCase().includes(state.searchQuery))
  );
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableMantenimientosBody');
  if (!tbody) return;
  const items = state.filteredData || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-wrench"></i><p>${state.searchQuery ? 'Sin resultados' : 'No hay mantenimientos'}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(m => {
    const completado = m.estado === 'COMPLETADO';
    const acciones = `
      <button class="btn-action btn-action-ver" data-id="${m.idMantenimiento}" title="Ver"><i class="fas fa-eye"></i></button>
      ${esAdmin() && !completado
        ? `<button class="btn-action btn-action-completar" data-id="${m.idMantenimiento}" data-action="completar" title="Completar"><i class="fas fa-check"></i></button>`
        : ''}
      ${esAdmin()
        ? `<button class="btn-action btn-action-eliminar" data-id="${m.idMantenimiento}" data-action="eliminar" title="Eliminar"><i class="fas fa-trash"></i></button>`
        : ''}`;
    return `<tr>
      <td class="fw-medium">${Utils.esc(m.placaVehiculo)} <small class="text-muted">${Utils.esc(m.vehiculoDescripcion || '')}</small></td>
      <td>${Utils.capitalize(m.tipo || '')}</td>
      <td>${Utils.formatFechaHora(m.fecha)}</td>
      <td class="text-truncate description-cell-maintenance" title="${Utils.esc(m.descripcion)}">${Utils.esc(m.descripcion)}</td>
      <td>${Utils.moneda(m.costo)}</td>
      <td>${Number(m.odometro || 0).toLocaleString('es-MX')} km</td>
      <td>${Utils.badge(completado ? 'Completado' : 'En curso', completado ? 'badge-active' : 'badge-warning')}</td>
      <td>${m.evidenciaRuta
        ? `<button class="btn-action btn-action-descargar" data-id="${m.idMantenimiento}" data-action="evidencia" title="Descargar"><i class="fas fa-file-download"></i></button>`
        : '-'}</td>
      <td class="acciones-cell">${acciones}</td>
    </tr>`;
  }).join('');
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.classList.contains('btn-action-ver')) verMantenimiento(id);
  else if (btn.dataset.action === 'completar') completarMantenimiento(id);
  else if (btn.dataset.action === 'eliminar') eliminarMantenimiento(id);
  else if (btn.dataset.action === 'evidencia') descargarEvidencia(id);
}

function abrirModal() {
  document.getElementById('formMantenimiento').reset();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('mantenimientoModal')).show();
}

async function guardarMantenimiento() {
  const idVehiculo = parseInt(document.getElementById('mantVehiculo').value);
  const tipo = document.getElementById('mantTipo').value;
  const fechaRaw = document.getElementById('mantFecha').value;
  const descripcion = document.getElementById('mantDescripcion').value.trim();
  const costo = parseFloat(document.getElementById('mantCosto').value);
  const odometro = parseFloat(document.getElementById('mantOdometro').value);
  const file = document.getElementById('mantEvidencia').files[0];

  if (isNaN(idVehiculo) || !tipo || !fechaRaw || !descripcion || isNaN(costo) || isNaN(odometro)) {
    Utils.showToast('Completa todos los campos obligatorios', 'warning');
    return;
  }

  const payload = { idVehiculo, tipo, fecha: fechaRaw, descripcion, costo, odometro };
  const fd = new FormData();
  fd.append('request', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  if (file) fd.append('evidencia', file);

  try {
    await API.multipart('/mantenimientos', fd);
    Utils.showToast('Mantenimiento registrado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('mantenimientoModal'))?.hide();
    cargarMantenimientos();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function verMantenimiento(id) {
  const m = state.data.find(m => m.idMantenimiento === id);
  if (!m) return;
  document.getElementById('verMantVehiculo').textContent = `${m.placaVehiculo} ${m.vehiculoDescripcion || ''}`;
  document.getElementById('verMantTipo').textContent = Utils.capitalize(m.tipo || '');
  document.getElementById('verMantFecha').textContent = Utils.formatFechaHora(m.fecha);
  document.getElementById('verMantDescripcion').textContent = m.descripcion;
  document.getElementById('verMantCosto').textContent = Utils.moneda(m.costo);
  document.getElementById('verMantOdometro').textContent = Number(m.odometro || 0).toLocaleString('es-MX') + ' km';
  document.getElementById('verMantFechaCreacion').textContent = Utils.formatFechaHora(m.fechaCreacion);
  const st = document.getElementById('verMantEstado');
  const completado = m.estado === 'COMPLETADO';
  st.textContent = completado ? 'Completado' : 'En curso';
  st.className = `badge-status ${completado ? 'badge-active' : 'badge-warning'}`;
  const link = document.getElementById('verMantEvidenciaLink');
  if (m.evidenciaRuta) {
    link.style.display = '';
    link.onclick = (e) => { e.preventDefault(); descargarEvidencia(id); };
  } else {
    link.style.display = 'none';
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('mantenimientoVerModal')).show();
}

async function completarMantenimiento(id) {
  const confirmed = await Utils.confirmAction('¿Completar este mantenimiento?', 'Se marcara como completado.', 'Completar', 'btn-primary');
  if (!confirmed) return;
  try {
    await API.patch('/mantenimientos/' + id + '/completar', {});
    Utils.showToast('Mantenimiento completado', 'success');
    cargarMantenimientos();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function eliminarMantenimiento(id) {
  const confirmed = await Utils.confirmAction('¿Eliminar este mantenimiento?', 'Esta accion no se puede deshacer.', 'Eliminar', 'btn-danger');
  if (!confirmed) return;
  try {
    await API.del('/mantenimientos/' + id);
    Utils.showToast('Mantenimiento eliminado', 'success');
    cargarMantenimientos();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function descargarEvidencia(id) {
  try {
    await Utils.descargar('/mantenimientos/' + id + '/evidencia', 'evidencia-mantenimiento-' + id);
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function exportar(tipo) {
  try {
    await Utils.descargar('/exportaciones/mantenimientos.' + tipo, 'mantenimientos.' + tipo);
    Utils.showToast('Exportacion generada', 'success');
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}
