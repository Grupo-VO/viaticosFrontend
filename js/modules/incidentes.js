let state = { data: [], filteredData: [], searchQuery: '', viajes: [] };

const TIPO_LABELS = { FALLA: 'Falla', ACCIDENTE: 'Accidente', MULTA: 'Multa', DETALLE: 'Detalle' };
const SEVERIDAD_LABELS = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Critica' };
const ESTADO_LABELS = { NUEVO: 'Nuevo', EN_ATENCION: 'En atencion', RESUELTO: 'Resuelto', CANCELADO: 'Cancelado' };

export function init() {
  bindEvents();
  cargarViajes();
  cargarIncidentes();
}

function bindEvents() {
  document.getElementById('btnNuevoIncidente')?.addEventListener('click', () => abrirModal());
  document.getElementById('btnGuardarIncidente')?.addEventListener('click', guardarIncidente);
  document.getElementById('tableIncidentesBody')?.addEventListener('click', handleTableClick);
  document.getElementById('searchIncidentes')?.addEventListener('input', Utils.debounce(handleSearch, 300));
}

async function cargarViajes() {
  try {
    state.viajes = await API.get('/viajes');
    const sel = document.getElementById('incViaje');
    sel.innerHTML = '<option value="">Sin viaje (opcional)</option>' +
      state.viajes.map(v => `<option value="${v.idViaje}">#${v.idViaje} ${Utils.esc(v.origenRuta || '')} -> ${Utils.esc(v.destinoRuta || '')}${v.placaVehiculo ? ' (' + Utils.esc(v.placaVehiculo) + ')' : ''}</option>`).join('');
  } catch (err) {
    console.warn('No se pudieron cargar viajes', err);
  }
}

async function cargarIncidentes() {
  try {
    state.data = await API.get('/reportes');
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
    : state.data.filter(r =>
        `${r.tipo} ${r.descripcionViaje || ''} ${r.descripcion} ${r.nombreCreador || ''}`.toLowerCase().includes(state.searchQuery));
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableIncidentesBody');
  if (!tbody) return;
  const items = state.filteredData || state.data || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${state.searchQuery ? 'Sin resultados' : 'No hay incidentes'}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(r => `
    <tr>
      <td>${Utils.badge(TIPO_LABELS[r.tipo] || r.tipo, 'badge-danger')}</td>
      <td>${Utils.badge(SEVERIDAD_LABELS[r.severidad] || r.severidad || '-', r.severidad === 'CRITICA' ? 'badge-danger' : 'badge-warning')}</td>
      <td>${Utils.esc(r.descripcionViaje || 'Sin viaje')}</td>
      <td class="text-truncate description-cell" title="${Utils.esc(r.descripcion)}">${Utils.esc(r.descripcion)}</td>
      <td>${Utils.formatFechaHora(r.fecha)}</td>
      <td>${Utils.esc(r.nombreCreador || '-')}</td>
      <td>${r.evidenciaRuta
        ? `<button class="btn-action btn-action-descargar" data-id="${r.idReporte}" data-action="evidencia" title="Descargar"><i class="fas fa-file-download"></i></button>`
        : '-'}</td>
      <td>${Utils.badge(ESTADO_LABELS[r.estado] || r.estado || 'Nuevo', r.estado === 'RESUELTO' ? 'badge-active' : 'badge-info')}</td>
      <td class="acciones-cell">
        <button class="btn-action btn-action-ver" data-id="${r.idReporte}" title="Ver"><i class="fas fa-eye"></i></button>
        ${r.estado !== 'RESUELTO' && r.estado !== 'CANCELADO' ? `<button class="btn-action btn-action-atender" data-id="${r.idReporte}" data-action="atender" title="Avanzar estado"><i class="fas fa-check"></i></button>` : ''}
        <button class="btn-action btn-action-eliminar" data-id="${r.idReporte}" data-action="eliminar" title="Eliminar"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.classList.contains('btn-action-ver')) verIncidente(id);
  else if (btn.dataset.action === 'evidencia') descargarEvidencia(id);
  else if (btn.dataset.action === 'atender') avanzarEstado(id);
  else if (btn.dataset.action === 'eliminar') eliminarIncidente(id);
}

function abrirModal() {
  document.getElementById('formIncidente').reset();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('incidenteModal')).show();
}

async function guardarIncidente() {
  const tipo = document.getElementById('incTipo').value;
  const severidad = document.getElementById('incSeveridad').value;
  const idViajeRaw = document.getElementById('incViaje').value;
  const fechaRaw = document.getElementById('incFecha').value;
  const descripcion = document.getElementById('incDescripcion').value.trim();
  const file = document.getElementById('incEvidencia').files[0];

  if (!tipo || !severidad || !fechaRaw || !descripcion) {
    Utils.showToast('Completa todos los campos obligatorios', 'warning');
    return;
  }

  const payload = {
    idViaje: idViajeRaw ? parseInt(idViajeRaw) : null,
    tipo,
    severidad,
    descripcion,
    fecha: fechaRaw,
  };
  const fd = new FormData();
  fd.append('request', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  if (file) fd.append('evidencia', file);

  try {
    await API.multipart('/reportes', fd);
    Utils.showToast('Incidente reportado', 'success');
    bootstrap.Modal.getInstance(document.getElementById('incidenteModal'))?.hide();
    cargarIncidentes();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function verIncidente(id) {
  const r = state.data.find(r => r.idReporte === id);
  if (!r) return;
  document.getElementById('verIncTipo').textContent = TIPO_LABELS[r.tipo] || r.tipo;
  document.getElementById('verIncSeveridad').textContent = SEVERIDAD_LABELS[r.severidad] || r.severidad || '-';
  document.getElementById('verIncEstado').textContent = ESTADO_LABELS[r.estado] || r.estado || 'Nuevo';
  document.getElementById('verIncUbicacion').textContent = r.latitud != null && r.longitud != null
    ? `${Number(r.latitud).toFixed(6)}, ${Number(r.longitud).toFixed(6)}`
    : 'No disponible';
  document.getElementById('verIncViaje').textContent = r.descripcionViaje || 'Sin viaje';
  document.getElementById('verIncDescripcion').textContent = r.descripcion;
  document.getElementById('verIncFecha').textContent = Utils.formatFechaHora(r.fecha);
  document.getElementById('verIncCreador').textContent = r.nombreCreador || '-';
  const link = document.getElementById('verIncEvidenciaLink');
  if (r.evidenciaRuta) {
    link.style.display = '';
    link.onclick = (e) => { e.preventDefault(); descargarEvidencia(id); };
  } else {
    link.style.display = 'none';
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('incidenteVerModal')).show();
}

async function avanzarEstado(id) {
  const reporte = state.data.find(r => r.idReporte === id);
  if (!reporte) return;
  const siguiente = reporte.estado === 'NUEVO' ? 'EN_ATENCION' : 'RESUELTO';
  try {
    await API.patch(`/reportes/${id}/estado`, siguiente);
    Utils.showToast(siguiente === 'RESUELTO' ? 'Incidente resuelto' : 'Incidente tomado en atencion', 'success');
    cargarIncidentes();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function eliminarIncidente(id) {
  const confirmed = await Utils.confirmAction('¿Eliminar este incidente?', 'Esta accion no se puede deshacer.', 'Eliminar', 'btn-danger');
  if (!confirmed) return;
  try {
    await API.del('/reportes/' + id);
    Utils.showToast('Incidente eliminado', 'success');
    cargarIncidentes();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function descargarEvidencia(id) {
  try {
    await Utils.descargar('/reportes/' + id + '/evidencia', 'evidencia-incidente-' + id);
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}
