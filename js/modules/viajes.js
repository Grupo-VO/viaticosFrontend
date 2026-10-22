let state = {
  data: [], filteredData: [], searchQuery: '',
  vehiculos: [], choferes: [], destinos: [], rutas: [],
  editingId: null,
};

const STATUS_LABELS = { PROXIMO: 'Proximo', EN_VIAJE: 'En viaje', COMPLETADO: 'Completado', CANCELADO: 'Cancelado' };
const STATUS_BADGES = { PROXIMO: 'badge-info', EN_VIAJE: 'badge-warning', COMPLETADO: 'badge-active', CANCELADO: 'badge-inactive' };

const esAdmin = () => Utils.puede('ADMINISTRADOR');
const puedeIniciar = () => Utils.puede('ADMINISTRADOR', 'USUARIO_AUTORIZADO', 'CHOFER');
const puedeGestionar = () => Utils.puede('ADMINISTRADOR', 'USUARIO_AUTORIZADO');
const puedeExportar = () => Utils.puede('ADMINISTRADOR', 'AUDITORIA');

export function init() {
  if (!esAdmin()) {
    const btn = document.getElementById('btnNuevoViaje');
    if (btn) btn.style.display = 'none';
  }
  if (!puedeExportar()) {
    const exp = document.getElementById('exportViajes');
    if (exp) exp.style.display = 'none';
  }
  bindEvents();
  Promise.all([cargarVehiculos(), cargarChoferes(), cargarDestinos(), cargarRutas()]).finally(cargarViajes);
}

function bindEvents() {
  document.getElementById('btnNuevoViaje')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarViaje')?.addEventListener('click', guardarViaje);
  document.getElementById('tableViajesBody')?.addEventListener('click', handleTableClick);
  document.getElementById('searchViajes')?.addEventListener('input', Utils.debounce(handleSearch, 300));
  document.getElementById('btnAgregarDestino')?.addEventListener('click', () => agregarDestinoFila());
  document.getElementById('destinosContainer')?.addEventListener('click', (e) => {
    if (e.target.closest('.btn-remove-destino')) e.target.closest('.destino-row').remove();
  });
  document.getElementById('viajeTipoRuta')?.addEventListener('change', aplicaModoRuta);
  document.getElementById('viajeRutaGuardada')?.addEventListener('change', (e) => {
    const ruta = state.rutas.find(r => r.idRuta === parseInt(e.target.value));
    actualizarCamposRuta(ruta);
  });
  document.getElementById('btnExpViajesXlsx')?.addEventListener('click', () => exportarViajes('xlsx'));
  document.getElementById('btnExpViajesPdf')?.addEventListener('click', () => exportarViajes('pdf'));
}

async function cargarVehiculos() {
  try {
    state.vehiculos = await API.get('/vehiculos');
    Utils.rellenarSelect('viajeVehiculo', state.vehiculos.filter(v =>
      v.activo !== false && v.status !== 'MANTENIMIENTO' && v.status !== 'FUERA_SERVICIO'
    ), 'idVehiculo', v => `${v.placa} — ${v.marca} ${v.modelo}`);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function cargarChoferes() {
  try {
    state.choferes = await API.get('/personas?role=CHOFER');
    Utils.rellenarSelect('viajeChofer', state.choferes.filter(p => p.activa !== false), 'idPersona', p => `${p.nombre} ${p.apellidoPaterno} ${p.apellidoMaterno}`);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function cargarDestinos() {
  try {
    state.destinos = await API.get('/destinos');
    Utils.rellenarSelect('viajeOrigen', state.destinos.filter(d => d.activo !== false), 'idDestino', 'nombre');
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function cargarRutas() {
  try {
    state.rutas = await API.get('/rutas');
    Utils.rellenarSelect('viajeRutaGuardada', state.rutas.filter(r => r.activo !== false), 'idRuta', 'nombre');
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function aplicaModoRuta() {
  const modo = document.getElementById('viajeTipoRuta')?.value || 'GUARDADA';
  const guardada = modo === 'GUARDADA';
  document.getElementById('viajeRutaGuardadaWrap').classList.toggle('d-none', !guardada);
  document.getElementById('viajeRutaPersonalizadaWrap').classList.toggle('d-none', guardada);
  document.getElementById('viajeDestinosWrap').classList.toggle('d-none', guardada);
  document.getElementById('viajeOptimizarWrap').classList.toggle('d-none', guardada);
  const ruta = guardada
    ? state.rutas.find(r => r.idRuta === parseInt(document.getElementById('viajeRutaGuardada')?.value))
    : null;
  actualizarCamposRuta(ruta);
}

function actualizarCamposRuta(ruta) {
  const esPredefinida = document.getElementById('viajeTipoRuta')?.value === 'GUARDADA';
  const trayecto = document.getElementById('viajeTipoTrayecto');
  const comida = document.getElementById('viajeCostoComida');
  const hospedaje = document.getElementById('viajeCostoHospedaje');
  if (esPredefinida && ruta) {
    trayecto.value = ruta.usaCasetas ? 'CASETAS' : 'LIBRE';
    trayecto.disabled = true;
    comida.value = ruta.costoComida ?? 0;
    hospedaje.value = ruta.costoHospedaje ?? 0;
    comida.readOnly = true;
    hospedaje.readOnly = true;
  } else {
    trayecto.disabled = esPredefinida;
    comida.readOnly = esPredefinida;
    hospedaje.readOnly = esPredefinida;
  }
}

async function cargarViajes() {
  try {
    state.data = await API.get('/viajes');
    state.filteredData = [...state.data];
    renderTable();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function handleSearch(e) {
  state.searchQuery = (e?.target?.value || '').toLowerCase().trim();
  state.filteredData = !state.searchQuery
    ? [...state.data]
    : state.data.filter(v =>
        `${v.placaVehiculo} ${v.vehiculoDescripcion} ${v.nombreChofer} ${v.origenRuta} ${v.destinoRuta} ${v.status}`
          .toLowerCase().includes(state.searchQuery));
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableViajesBody');
  if (!tbody) return;
  const items = state.filteredData || state.data || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><i class="fas fa-route"></i><p>${state.searchQuery ? 'Sin resultados' : 'No hay viajes'}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(v => `
    <tr>
      <td class="fw-medium">#${v.idViaje}</td>
      <td>${Utils.esc(v.origenRuta || '-')} <i class="fas fa-arrow-right small text-muted"></i> ${Utils.esc(v.destinoRuta || '-')}</td>
      <td>${Utils.esc(v.placaVehiculo || '-')}</td>
      <td>${Utils.esc(v.nombreChofer || '-')}</td>
      <td>${v.numeroPasajeros}${v.excesoCapacidad ? ' <i class="fas fa-exclamation-triangle text-danger" title="Exceso de capacidad"></i>' : ''}</td>
      <td>${Utils.formatFechaHora(v.fechaSalida)}</td>
      <td>${Utils.formatFechaHora(v.fechaRegreso)}</td>
      <td class="fw-medium">${Utils.moneda(v.totalViaje)}</td>
      <td>${Utils.badge(STATUS_LABELS[v.status] || v.status, STATUS_BADGES[v.status] || 'badge-inactive')}</td>
      <td class="acciones-cell">${accionesViaje(v)}</td>
    </tr>`).join('');
}

function accionesViaje(v) {
  let html = `<button class="btn-action btn-action-ver" data-id="${v.idViaje}" title="Ver"><i class="fas fa-eye"></i></button>`;
  if (v.status === 'PROXIMO') {
    if (puedeIniciar()) html += `<button class="btn-action btn-action-iniciar" data-id="${v.idViaje}" data-action="iniciar" title="${v.alertaGasolinaBaja ? 'Combustible insuficiente' : 'Iniciar'}"><i class="fas fa-play ${v.alertaGasolinaBaja ? 'text-warning' : ''}"></i></button>`;
    if (puedeGestionar()) html += `<button class="btn-action btn-action-editar" data-id="${v.idViaje}" title="Editar"><i class="fas fa-pen"></i></button>`;
    if (puedeGestionar()) {
      html += `<button class="btn-action btn-action-completar" data-id="${v.idViaje}" data-action="completar" title="Completar"><i class="fas fa-check"></i></button>`;
      html += `<button class="btn-action btn-action-cancelar" data-id="${v.idViaje}" data-action="cancelar" title="Cancelar"><i class="fas fa-ban"></i></button>`;
    }
  } else if (v.status === 'EN_VIAJE' && puedeGestionar()) {
    html += `<button class="btn-action btn-action-completar" data-id="${v.idViaje}" data-action="completar" title="Completar"><i class="fas fa-check"></i></button>`;
  }
  return html;
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.classList.contains('btn-action-ver')) verViaje(id);
  else if (btn.classList.contains('btn-action-editar')) abrirModal(id);
  else if (btn.dataset.action === 'iniciar') cambiarEstado(id, 'iniciar');
  else if (btn.dataset.action === 'completar') cambiarEstado(id, 'completar');
  else if (btn.dataset.action === 'cancelar') cambiarEstado(id, 'cancelar');
}

function opcionesDestino(selected) {
  return state.destinos
    .filter(d => d.activo !== false)
    .map(d => `<option value="${d.idDestino}" ${d.idDestino === selected ? 'selected' : ''}>${Utils.esc(d.nombre)}</option>`)
    .join('');
}

function agregarDestinoFila(selected) {
  const cont = document.getElementById('destinosContainer');
  const row = document.createElement('div');
  row.className = 'destino-row';
  const orden = cont.children.length + 1;
  row.innerHTML = `
    <span class="destino-orden">${orden}</span>
    <select class="form-select form-green">${opcionesDestino(selected)}</select>
    <button type="button" class="btn btn-sm btn-outline-danger btn-remove-destino" title="Quitar"><i class="fas fa-times"></i></button>`;
  cont.appendChild(row);
}

function abrirModal(id) {
  state.editingId = id;
  document.getElementById('viajeModalTitle').textContent = id ? 'Editar Viaje' : 'Nuevo Viaje';
  document.getElementById('formViaje').reset();
  document.getElementById('viajeId').value = '';
  document.getElementById('destinosContainer').innerHTML = '';
  document.getElementById('viajeTipoTrayecto').value = 'CASETAS';
  document.getElementById('viajeOptimizar').checked = false;

  const esRutaGuardada = !!(id && state.data.find(v => v.idViaje === id)?.idRuta);
  document.getElementById('viajeTipoRuta').value = id
    ? (esRutaGuardada ? 'GUARDADA' : 'PERSONALIZADA')
    : 'GUARDADA';
  aplicaModoRuta();

  if (id) {
    const v = state.data.find(v => v.idViaje === id);
    if (v) {
      document.getElementById('viajeId').value = v.idViaje;
      document.getElementById('viajeVehiculo').value = v.idVehiculo ?? '';
      document.getElementById('viajeChofer').value = v.idChofer ?? '';
      document.getElementById('viajePasajeros').value = v.numeroPasajeros ?? '';
      document.getElementById('viajeTipoTrayecto').value = v.tipoTrayecto || 'CASETAS';
      document.getElementById('viajeFechaSalida').value = toDateTimeLocal(v.fechaSalida);
      document.getElementById('viajeFechaRegreso').value = toDateTimeLocal(v.fechaRegreso);
      document.getElementById('viajeCostoComida').value = v.costoComida ?? '';
      document.getElementById('viajeCostoHospedaje').value = v.costoHospedaje ?? '';

       if (esRutaGuardada) {
         document.getElementById('viajeRutaGuardada').value = v.idRuta ?? '';
         actualizarCamposRuta(state.rutas.find(r => r.idRuta === v.idRuta));
      } else {
        const destinos = [...(v.destinos || [])].sort((a, b) => a.orden - b.orden);
        if (destinos.length > 0) {
          document.getElementById('viajeOrigen').value = state.destinos.find(d => d.nombre === destinos[0].nombre)?.idDestino ?? '';
        }
        destinos.slice(1).forEach(d => {
          const sel = state.destinos.find(dd => dd.nombre === d.nombre);
          agregarDestinoFila(sel ? sel.idDestino : undefined);
        });
      }
    }
  } else {
    agregarDestinoFila();
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('viajeModal')).show();
}

function toDateTimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function guardarViaje() {
  const fechaSalida = document.getElementById('viajeFechaSalida').value;
  const fechaRegreso = document.getElementById('viajeFechaRegreso').value;
  if (fechaSalida && fechaRegreso && new Date(fechaRegreso) < new Date(fechaSalida)) {
    Utils.showToast('La fecha de regreso no puede ser anterior a la salida', 'warning');
    return;
  }

  const modo = document.getElementById('viajeTipoRuta')?.value || 'GUARDADA';
  const data = {
    idVehiculo: parseInt(document.getElementById('viajeVehiculo').value),
    idChofer: parseInt(document.getElementById('viajeChofer').value),
    numeroPasajeros: parseInt(document.getElementById('viajePasajeros').value),
    fechaSalida,
    fechaRegreso,
    tipoTrayecto: document.getElementById('viajeTipoTrayecto').value,
    costoComida: parseFloat(document.getElementById('viajeCostoComida').value),
    costoHospedaje: parseFloat(document.getElementById('viajeCostoHospedaje').value),
  };

  if (modo === 'GUARDADA') {
    data.idRuta = parseInt(document.getElementById('viajeRutaGuardada').value);
    data.optimizar = false;
    if (isNaN(data.idRuta)) {
      Utils.showToast('Selecciona una ruta guardada', 'warning');
      return;
    }
  } else {
    data.optimizar = document.getElementById('viajeOptimizar').checked;
    data.idOrigen = parseInt(document.getElementById('viajeOrigen').value);
    data.idDestinos = [...document.querySelectorAll('#destinosContainer .destino-row select')]
      .map(s => parseInt(s.value)).filter(v => !isNaN(v));
    if (isNaN(data.idOrigen) || data.idDestinos.length === 0) {
      Utils.showToast('Agrega origen y al menos un destino', 'warning');
      return;
    }
    const todos = [data.idOrigen, ...data.idDestinos];
    if (new Set(todos).size !== todos.length) {
      Utils.showToast('No uses destinos duplicados', 'warning');
      return;
    }
  }

  if (isNaN(data.idVehiculo) || isNaN(data.idChofer) || isNaN(data.numeroPasajeros) ||
      data.numeroPasajeros < 1 || !data.fechaSalida || !data.fechaRegreso ||
      isNaN(data.costoComida) || isNaN(data.costoHospedaje) ||
      data.costoComida < 0 || data.costoHospedaje < 0) {
    Utils.showToast('Completa todos los campos obligatorios', 'warning');
    return;
  }

  try {
    if (state.editingId) {
      await API.put('/viajes/' + state.editingId, data);
      Utils.showToast('Viaje actualizado', 'success');
    } else {
      await API.post('/viajes', data);
      Utils.showToast(modo === 'GUARDADA'
        ? 'Viaje creado con ruta guardada'
        : 'Viaje creado (ruta calculada con Google Maps)', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('viajeModal'))?.hide();
    cargarViajes();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function cambiarEstado(id, accion) {
  const msgs = {
    iniciar: ['Iniciar este viaje?', 'El viaje pasara a estado EN VIAJE.', 'Iniciar', 'btn-primary'],
    completar: ['Completar este viaje?', 'Se registrara el consumo de combustible y kilometraje.', 'Completar', 'btn-success'],
    cancelar: ['Cancelar este viaje?', 'Se liberara el vehiculo.', 'Cancelar', 'btn-warning'],
  };
  const viaje = state.data.find(v => v.idViaje === id);
  const [title, baseMsg, btnTxt, btnCls] = msgs[accion] || [];
  const msg = accion === 'iniciar' && viaje?.alertaGasolinaBaja
    ? `${baseMsg} Advertencia: faltan aproximadamente ${viaje.combustibleFaltante ?? 0} L para completar la ruta.`
    : baseMsg;
  const confirmed = await Utils.confirmAction(title, msg, btnTxt, btnCls);
  if (!confirmed) return;
  try {
    await API.post(`/viajes/${id}/${accion}`, {});
    Utils.showToast('Viaje ' + accion + 'do correctamente', 'success');
    cargarViajes();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function verViaje(id) {
  const v = state.data.find(v => v.idViaje === id);
  if (!v) return;
  document.getElementById('verViajeTitulo').textContent = `Viaje #${v.idViaje}`;
  const st = document.getElementById('verViajeStatus');
  st.innerHTML = Utils.badge(STATUS_LABELS[v.status] || v.status, STATUS_BADGES[v.status] || 'badge-inactive');
  document.getElementById('verViajeVehiculo').textContent = `${v.placaVehiculo} — ${v.vehiculoDescripcion || ''}`;
  document.getElementById('verViajeChofer').textContent = v.nombreChofer || '-';
  document.getElementById('verViajePasajeros').textContent = v.numeroPasajeros + (v.excesoCapacidad ? ' (exceso de capacidad!)' : '');
  document.getElementById('verViajeSalida').textContent = Utils.formatFechaHora(v.fechaSalida);
  document.getElementById('verViajeRegreso').textContent = Utils.formatFechaHora(v.fechaRegreso);
  document.getElementById('verViajeDistancia').textContent = v.distanciaKm != null ? v.distanciaKm + ' km' : '-';
  document.getElementById('verViajeDuracion').textContent = formatDuracion(v.duracionMinutos);
  document.getElementById('verViajeTrayecto').textContent = v.tipoTrayecto === 'CASETAS' ? 'Casetas' : 'Libre';
  document.getElementById('verViajeCombustible').textContent = v.litrosConsumidos != null
    ? `${v.litrosConsumidos} L (${Utils.moneda(v.costoCombustible)}) | Disponible: ${v.nivelCombustibleActual ?? '-'} L | Requerido: ${v.combustibleRequerido ?? '-'} L${v.combustibleFaltante > 0 ? ` | Faltan: ${v.combustibleFaltante} L` : ''}`
    : '-';

  document.getElementById('verTotComida').textContent = Utils.moneda(v.costoComida);
  document.getElementById('verTotHospedaje').textContent = Utils.moneda(v.costoHospedaje);
  document.getElementById('verTotCasetasCount').textContent = (v.casetas || []).length;
  document.getElementById('verTotCasetas').textContent = Utils.moneda(v.totalCasetas || 0);
  document.getElementById('verTotCombustible').textContent = Utils.moneda(v.costoCombustible || 0);
  document.getElementById('verTotViaje').textContent = Utils.moneda(v.totalViaje);

  const destinos = [...(v.destinos || [])].sort((a, b) => a.orden - b.orden);
  document.getElementById('verViajeDestinosBody').innerHTML = destinos.length
    ? destinos.map(d => `
        <tr>
          <td>${d.orden + 1}</td>
          <td>${Utils.esc(d.nombre)}</td>
          <td>${Utils.badge(d.visitado ? 'Visitado' : 'Pendiente', d.visitado ? 'badge-active' : 'badge-inactive')}</td>
          <td>${d.fechaLlegada ? Utils.formatFechaHora(d.fechaLlegada) : '-'}</td>
        </tr>`).join('')
    : `<tr><td colspan="4"><div class="empty-state"><p>Sin destinos</p></div></td></tr>`;

  const casetas = v.casetas || [];
  document.getElementById('verViajeCasetasBody').innerHTML = casetas.length
    ? casetas.map(c => `<tr><td>${c.orden}</td><td>${Utils.esc(c.nombre)}</td><td>${Utils.moneda(c.costo)}</td></tr>`).join('')
    : `<tr><td colspan="3"><div class="empty-state"><p>Sin casetas</p></div></td></tr>`;

  bootstrap.Modal.getOrCreateInstance(document.getElementById('viajeVerModal')).show();
  dibujarMapaViaje(v);
}

async function dibujarMapaViaje(v) {
  const cont = document.getElementById('viajeMap');
  cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Cargando mapa...</span></div>';
  await Utils.cargarGoogleMaps();
  if (!(window.google && window.google.maps)) {
    cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Mapa no disponible (configura GEO.API_KEY)</span></div>';
    return;
  }
  const destinos = [...(v.destinos || [])].sort((a, b) => a.orden - b.orden);
  const first = destinos[0];
  const center = first ? { lat: first.latitud, lng: first.longitud } : { lat: 19.4326, lng: -99.1332 };
  const map = new google.maps.Map(cont, { center, zoom: 8, mapTypeControl: false, streetViewControl: false });

  destinos.forEach((d, i) => {
    new google.maps.Marker({
      position: { lat: d.latitud, lng: d.longitud }, map,
      label: String(i + 1), title: d.nombre,
    });
  });
  (v.casetas || []).forEach(c => {
    if (c.latitud != null && c.longitud != null) {
      new google.maps.Marker({ position: { lat: c.latitud, lng: c.longitud }, map, icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png', title: c.nombre });
    }
  });
  const encoded = v.tipoTrayecto === 'CASETAS'
    ? [v.polylineCasetasIda || v.polylineCasetas, v.polylineCasetasRegreso]
    : [v.polylineLibreIda || v.polylineLibre, v.polylineLibreRegreso];
  encoded.filter(Boolean).forEach((trazo, index) => {
    const path = decodePolyline(trazo);
    new google.maps.Polyline({ path, geodesic: true, strokeColor: index === 0 ? '#25B1CF' : '#83BC28', strokeOpacity: 0.9, strokeWeight: 4 }).setMap(map);
  });
  const trazos = encoded.filter(Boolean);
  if (trazos.length) {
    const bounds = new google.maps.LatLngBounds();
    trazos.flatMap(decodePolyline).forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
  }
}

function formatDuracion(min) {
  if (min == null) return '-';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

async function exportarViajes(tipo) {
  try {
    await Utils.descargar('/exportaciones/viajes.' + tipo, 'viajes.' + tipo);
    Utils.showToast('Exportacion generada', 'success');
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}
