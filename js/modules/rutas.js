let state = {
  data: [], filteredData: [], editingId: null, searchQuery: '', destinos: [],
  rutaTrazo: null, directionsRenderer: null, formDirectionsRenderer: null,
  formDirectionsRenderers: [],
  formRouteResult: null,
};

const esAdmin = () => Utils.puede('ADMINISTRADOR');

export function init() {
  if (!esAdmin()) {
    const btn = document.getElementById('btnNuevaRuta');
    if (btn) btn.style.display = 'none';
  }
  bindEvents();
  cargarDestinos();
  cargarRutas();
}

function bindEvents() {
  document.getElementById('btnNuevaRuta')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarRuta')?.addEventListener('click', guardarRuta);
  document.getElementById('btnEditarTrazoRuta')?.addEventListener('click', editarTrazo);
  document.getElementById('btnGuardarTrazoRuta')?.addEventListener('click', guardarTrazo);
  document.getElementById('tableRutasBody')?.addEventListener('click', handleTableClick);
  document.getElementById('searchRutas')?.addEventListener('input', Utils.debounce(handleSearch, 300));
  document.getElementById('rutaOrigen')?.addEventListener('change', previsualizarRuta);
  document.getElementById('rutaDestino')?.addEventListener('change', previsualizarRuta);
  document.getElementById('rutaUsaCasetas')?.addEventListener('change', previsualizarRuta);
}

async function cargarDestinos() {
  try {
    state.destinos = await API.get('/destinos');
  } catch (err) {
    console.warn('No se pudieron cargar destinos', err);
  }
}

async function cargarRutas() {
  try {
    state.data = await API.get('/rutas');
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
        `${r.nombre} ${r.origen?.nombre || ''} ${r.destino?.nombre || ''}`.toLowerCase().includes(state.searchQuery));
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableRutasBody');
  if (!tbody) return;
  const items = state.filteredData || state.data || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-road"></i><p>${state.searchQuery ? 'Sin resultados' : 'No hay rutas'}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(r => {
    const activo = r.activo !== false;
    const casetas = r.casetas ? r.casetas.length : 0;
    const acciones = `
      <button class="btn-action btn-action-ver" data-id="${r.idRuta}" title="Ver"><i class="fas fa-eye"></i></button>
      ${esAdmin() ? `
        <button class="btn-action btn-action-editar" data-id="${r.idRuta}" title="Editar"><i class="fas fa-pen"></i></button>
        <button class="btn-action btn-action-iniciar" data-id="${r.idRuta}" data-action="refrescar" title="Refrescar casetas"><i class="fas fa-sync-alt"></i></button>
        ${activo
          ? `<button class="btn-action btn-action-eliminar" data-id="${r.idRuta}" data-action="desactivar" title="Desactivar"><i class="fas fa-ban"></i></button>`
          : `<button class="btn-action btn-action-reactivar" data-id="${r.idRuta}" data-action="reactivar" title="Reactivar"><i class="fas fa-check-circle"></i></button>`}
      ` : ''}`;
    return `<tr class="${activo ? '' : 'inactive-row'}">
      <td class="fw-medium">${Utils.esc(r.nombre)}</td>
      <td>${Utils.esc(r.origen?.nombre || '-')}</td>
      <td>${Utils.esc(r.destino?.nombre || '-')}</td>
      <td>${r.distanciaKm != null ? r.distanciaKm + ' km' : '-'}</td>
      <td>${formatDuracion(r.duracionMinutos)}</td>
      <td>${casetas} (${Utils.moneda(r.costoTotalCasetas || 0)})</td>
      <td>${Utils.badge(activo ? 'Activa' : 'Inactiva', activo ? 'badge-active' : 'badge-inactive')}</td>
      <td class="acciones-cell">${acciones}</td>
    </tr>`;
  }).join('');
}

function formatDuracion(min) {
  if (min == null) return '-';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.classList.contains('btn-action-ver')) verRuta(id);
  else if (btn.classList.contains('btn-action-editar')) abrirModal(id);
  else if (btn.dataset.action === 'refrescar') refrescarRuta(id);
  else if (btn.dataset.action === 'desactivar') cambiarEstado(id, false);
  else if (btn.dataset.action === 'reactivar') cambiarEstado(id, true);
}

function abrirModal(id) {
  state.editingId = id;
  Utils.rellenarSelect('rutaOrigen', state.destinos.filter(d => d.activo !== false), 'idDestino', 'nombre');
  Utils.rellenarSelect('rutaDestino', state.destinos.filter(d => d.activo !== false), 'idDestino', 'nombre');
  document.getElementById('rutaModalTitle').textContent = id ? 'Editar Ruta' : 'Nueva Ruta';
  document.getElementById('formRuta').reset();
  document.getElementById('rutaId').value = '';
  document.getElementById('rutaUsaCasetas').checked = true;
  state.formRouteResult = null;
  state.formDirectionsRenderers.forEach(renderer => renderer.setMap(null));
  state.formDirectionsRenderers = [];
  if (id) {
    const r = state.data.find(r => r.idRuta === id);
    if (r) {
      document.getElementById('rutaId').value = r.idRuta;
      document.getElementById('rutaNombre').value = r.nombre || '';
      document.getElementById('rutaOrigen').value = r.origen?.idDestino ?? '';
      document.getElementById('rutaDestino').value = r.destino?.idDestino ?? '';
      document.getElementById('rutaCostoComida').value = r.costoComida ?? '';
      document.getElementById('rutaCostoHospedaje').value = r.costoHospedaje ?? '';
      document.getElementById('rutaUsaCasetas').checked = r.usaCasetas !== false;
    }
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('rutaModal')).show();
  window.setTimeout(previsualizarRuta, 250);
}

async function guardarRuta() {
  const data = {
    nombre: document.getElementById('rutaNombre').value.trim(),
    idOrigen: parseInt(document.getElementById('rutaOrigen').value),
    idDestino: parseInt(document.getElementById('rutaDestino').value),
    usaCasetas: document.getElementById('rutaUsaCasetas').checked,
    costoComida: parseFloat(document.getElementById('rutaCostoComida').value),
    costoHospedaje: parseFloat(document.getElementById('rutaCostoHospedaje').value),
  };
  if (!data.nombre || isNaN(data.idOrigen) || isNaN(data.idDestino) ||
      isNaN(data.costoComida) || isNaN(data.costoHospedaje) ||
      data.costoComida < 0 || data.costoHospedaje < 0) {
    Utils.showToast('Completa todos los campos obligatorios', 'warning');
    return;
  }
  if (data.idOrigen === data.idDestino) {
    Utils.showToast('El origen y el destino deben ser distintos', 'warning');
    return;
  }
  try {
    let rutaGuardada;
    const trazoEditado = obtenerTrazoFormulario();
    if (state.editingId) {
      rutaGuardada = await API.put('/rutas/' + state.editingId, data);
      if (trazoEditado) await guardarTrazoResultado(rutaGuardada, trazoEditado);
      Utils.showToast('Ruta actualizada', 'success');
    } else {
      rutaGuardada = await API.post('/rutas', data);
      if (trazoEditado) await guardarTrazoResultado(rutaGuardada, trazoEditado);
      Utils.showToast('Ruta creada y calculada con Google Maps', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('rutaModal'))?.hide();
    cargarRutas();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function previsualizarRuta() {
  const origenId = parseInt(document.getElementById('rutaOrigen')?.value);
  const destinoId = parseInt(document.getElementById('rutaDestino')?.value);
  const origenDestino = state.destinos.find(d => d.idDestino === origenId);
  const destino = state.destinos.find(d => d.idDestino === destinoId);
  if (!origenDestino || !destino || origenId === destinoId) {
    state.formRouteResult = null;
    const cont = document.getElementById('rutaFormMap');
    if (cont) cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Selecciona un origen y destino distintos</span></div>';
    return;
  }
  state.formRouteResult = null;
  await Utils.cargarGoogleMaps();
  if (!(window.google && window.google.maps)) return;
  const cont = document.getElementById('rutaFormMap');
  const origen = { lat: Number(origenDestino.latitud), lng: Number(origenDestino.longitud) };
  const destinoPoint = { lat: Number(destino.latitud), lng: Number(destino.longitud) };
  if (![origen.lat, origen.lng, destinoPoint.lat, destinoPoint.lng].every(Number.isFinite)
      || Math.abs(origen.lat) > 90 || Math.abs(destinoPoint.lat) > 90
      || Math.abs(origen.lng) > 180 || Math.abs(destinoPoint.lng) > 180) {
    const cont = document.getElementById('rutaFormMap');
    if (cont) cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-triangle-exclamation"></i><span>El origen o destino no tiene coordenadas válidas</span></div>';
    Utils.showToast('El origen o destino seleccionado no tiene coordenadas válidas', 'warning');
    return;
  }
  const map = new google.maps.Map(cont, { center: origen, zoom: 8, mapTypeControl: false, streetViewControl: false });
  state.formDirectionsRenderers.forEach(renderer => renderer.setMap(null));
  state.formDirectionsRenderers = [
    new google.maps.DirectionsRenderer({ draggable: true, suppressMarkers: false, map, polylineOptions: { strokeColor: '#25B1CF', strokeWeight: 5 } }),
    new google.maps.DirectionsRenderer({ draggable: true, suppressMarkers: false, map, polylineOptions: { strokeColor: '#83BC28', strokeWeight: 5 } }),
  ];
  state.formRouteResult = null;
  const service = new google.maps.DirectionsService();
  const opciones = { travelMode: google.maps.TravelMode.DRIVING, avoidTolls: document.getElementById('rutaUsaCasetas')?.checked === false };
  const solicitar = (salida, llegada, salidaTexto, llegadaTexto) => new Promise((resolve, reject) => {
    service.route({ ...opciones, origin: salida, destination: llegada }, (result, status) => {
      if (status === 'OK') resolve(result);
      else if (status === 'NOT_FOUND' && salidaTexto && llegadaTexto) {
        service.route({ ...opciones, origin: salidaTexto, destination: llegadaTexto }, (retryResult, retryStatus) => {
          retryStatus === 'OK' ? resolve(retryResult) : reject(retryStatus);
        });
      } else reject(status);
    });
  });
  Promise.all([
    solicitar(origen, destinoPoint, origenDestino.direccion, destino.direccion),
    solicitar(destinoPoint, origen, destino.direccion, origenDestino.direccion),
  ])
    .then(([ida, regreso]) => {
      state.formDirectionsRenderers[0].setDirections(ida);
      state.formDirectionsRenderers[1].setDirections(regreso);
      state.formRouteResult = { ida, regreso };
    })
    .catch(status => {
      state.formRouteResult = null;
      Utils.showToast('No se pudo calcular la ruta: ' + status + '. Verifica las coordenadas de los destinos.', 'error');
    });
}

async function guardarTrazoResultado(ruta, result) {
  const ida = result?.ida?.routes?.[0] || result?.routes?.[0];
  const regreso = result?.regreso?.routes?.[0];
  if (!ruta?.idRuta || !ida) return ruta;
  const polylineIda = encodePath(ida.legs?.[0]?.steps?.flatMap(step => step.path) || []);
  const polylineRegreso = regreso
    ? encodePath(regreso.legs?.[0]?.steps?.flatMap(step => step.path) || []) : null;
  const polyline = typeof ida.overview_polyline === 'string' ? ida.overview_polyline : ida.overview_polyline?.points;
  if (!polyline || !polylineIda) return ruta;
  const legs = [ida, regreso].filter(Boolean).flatMap(route => route.legs || []);
  return API.patch('/rutas/' + ruta.idRuta + '/trazo', {
    polyline,
    distanciaKm: Math.round(legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0) / 10) / 100,
    duracionMinutos: Math.round(legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0) / 6) / 10,
    tipo: ruta.usaCasetas ? 'CASETA' : 'LIBRE',
    polylineIda,
    polylineRegreso,
  });
}

function obtenerTrazoFormulario() {
  if (state.formDirectionsRenderers.length === 2) {
    return {
      ida: state.formDirectionsRenderers[0].getDirections(),
      regreso: state.formDirectionsRenderers[1].getDirections(),
    };
  }
  return state.formRouteResult;
}

async function refrescarRuta(id) {
  const confirmed = await Utils.confirmAction('Recalcular casetas y distancia?', 'Se consultara Google Maps nuevamente.', 'Refrescar', 'btn-primary');
  if (!confirmed) return;
  try {
    await API.post('/rutas/' + id + '/refrescar', {});
    Utils.showToast('Ruta recalculada', 'success');
    cargarRutas();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function cambiarEstado(id, activar) {
  const confirmed = await Utils.confirmAction(
    activar ? '¿Reactivar esta ruta?' : '¿Desactivar esta ruta?',
    'Confirmar', activar ? 'Reactivar' : 'Desactivar', activar ? 'btn-success' : 'btn-danger');
  if (!confirmed) return;
  try {
    await API.patch('/rutas/' + id + '/estado', activar);
    Utils.showToast(activar ? 'Ruta reactivada' : 'Ruta desactivada', 'success');
    cargarRutas();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function verRuta(id) {
  const r = state.data.find(r => r.idRuta === id);
  if (!r) return;
  document.getElementById('verRutaTitulo').textContent = r.nombre;
  document.getElementById('verRutaOrigen').textContent = r.origen?.nombre || '-';
  document.getElementById('verRutaDestino').textContent = r.destino?.nombre || '-';
  document.getElementById('verRutaDistancia').textContent = r.distanciaKm != null ? r.distanciaKm + ' km' : '-';
  document.getElementById('verRutaDuracion').textContent = formatDuracion(r.duracionMinutos);
  document.getElementById('verRutaCasetas').textContent = Utils.moneda(r.costoTotalCasetas || 0);
  document.getElementById('verRutaComida').textContent = Utils.moneda(r.costoComida || 0);
  document.getElementById('verRutaHospedaje').textContent = Utils.moneda(r.costoHospedaje || 0);
  state.rutaTrazo = r;
  document.getElementById('btnEditarTrazoRuta')?.classList.remove('d-none');
  document.getElementById('btnGuardarTrazoRuta')?.classList.add('d-none');
  document.getElementById('rutaEditorHelp')?.classList.add('d-none');

  const casetas = r.casetas || [];
  document.getElementById('verRutaCasetasBody').innerHTML = casetas.length
    ? casetas.map(c => `<tr><td>${c.orden}</td><td>${Utils.esc(c.nombre)}</td><td>${Utils.moneda(c.costo || 0)}</td></tr>`).join('')
    : `<tr><td colspan="3"><div class="empty-state"><p>Sin casetas</p></div></td></tr>`;

  bootstrap.Modal.getOrCreateInstance(document.getElementById('rutaVerModal')).show();
  dibujarMapaRuta(r);
}

async function editarTrazo() {
  if (!state.rutaTrazo) return;
  await Utils.cargarGoogleMaps();
  if (!(window.google && window.google.maps)) {
    Utils.showToast('Google Maps no está disponible', 'error');
    return;
  }
  const r = state.rutaTrazo;
  const cont = document.getElementById('rutaMap');
  const service = new google.maps.DirectionsService();
  state.directionsRenderer?.setMap(null);
  state.directionsRenderer = new google.maps.DirectionsRenderer({
    draggable: true,
    suppressMarkers: false,
    map: new google.maps.Map(cont, { center: { lat: r.origen.latitud, lng: r.origen.longitud }, zoom: 8 }),
  });
  const origen = { lat: Number(r.origen.latitud), lng: Number(r.origen.longitud) };
  const destino = { lat: Number(r.destino.latitud), lng: Number(r.destino.longitud) };
  service.route({
    origin: origen,
    destination: origen,
    waypoints: [{ location: destino, stopover: true }],
    optimizeWaypoints: false,
    travelMode: google.maps.TravelMode.DRIVING,
    avoidTolls: r.usaCasetas === false,
  }, (result, status) => {
    if (status !== 'OK') {
      Utils.showToast('No se pudo cargar la ruta editable: ' + status, 'error');
      return;
    }
    state.directionsRenderer.setDirections(result);
    document.getElementById('rutaEditorHelp')?.classList.remove('d-none');
    document.getElementById('btnEditarTrazoRuta')?.classList.add('d-none');
    document.getElementById('btnGuardarTrazoRuta')?.classList.remove('d-none');
  });
}

async function guardarTrazo() {
  const result = state.directionsRenderer?.getDirections();
  const r = state.rutaTrazo;
  const route = result?.routes?.[0];
  if (!route || !r) return;
  const distanciaMetros = route.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
  const duracionSegundos = route.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
  const polyline = typeof route.overview_polyline === 'string'
    ? route.overview_polyline
    : route.overview_polyline?.points;
  if (!polyline) {
    Utils.showToast('Google Maps no devolvió el trazo editable', 'error');
    return;
  }
  try {
    const actualizada = await API.patch('/rutas/' + r.idRuta + '/trazo', {
      polyline,
      distanciaKm: Math.round(distanciaMetros / 10) / 100,
      duracionMinutos: Math.round(duracionSegundos / 6) / 10,
      tipo: r.usaCasetas ? 'CASETA' : 'LIBRE',
      polylineIda: encodePath(route.legs?.[0]?.steps?.flatMap(step => step.path) || []),
      polylineRegreso: encodePath(route.legs?.[1]?.steps?.flatMap(step => step.path) || []),
    });
    state.rutaTrazo = actualizada;
    Utils.showToast('Trazo de ruta guardado', 'success');
    document.getElementById('btnGuardarTrazoRuta')?.classList.add('d-none');
    document.getElementById('btnEditarTrazoRuta')?.classList.remove('d-none');
    document.getElementById('rutaEditorHelp')?.classList.add('d-none');
    await cargarRutas();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function encodePath(path) {
  let previousLat = 0;
  let previousLng = 0;
  let encoded = '';
  path.forEach(point => {
    const lat = Math.round(point.lat() * 1e5);
    const lng = Math.round(point.lng() * 1e5);
    encoded += encodeCoordinate(lat - previousLat);
    encoded += encodeCoordinate(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  });
  return encoded || null;
}

function encodeCoordinate(value) {
  let number = value < 0 ? ~(value << 1) : value << 1;
  let result = '';
  while (number >= 0x20) {
    result += String.fromCharCode((0x20 | (number & 0x1f)) + 63);
    number >>= 5;
  }
  return result + String.fromCharCode(number + 63);
}

async function dibujarMapaRuta(r) {
  const cont = document.getElementById('rutaMap');
  cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Cargando mapa...</span></div>';
  await Utils.cargarGoogleMaps();
  if (!(window.google && window.google.maps) || !r.origen) {
    cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Mapa no disponible (configura GEO.API_KEY)</span></div>';
    return;
  }
  const center = { lat: r.origen.latitud, lng: r.origen.longitud };
  const map = new google.maps.Map(cont, { center, zoom: 8, mapTypeControl: false, streetViewControl: false });
  new google.maps.Marker({ position: center, map, label: 'A', title: r.origen.nombre });
  if (r.destino) {
    new google.maps.Marker({ position: { lat: r.destino.latitud, lng: r.destino.longitud }, map, label: 'B', title: r.destino.nombre });
  }
  (r.casetas || []).forEach(c => {
    if (c.latitud != null && c.longitud != null) {
      new google.maps.Marker({ position: { lat: c.latitud, lng: c.longitud }, map, icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png', title: c.nombre });
    }
  });
  const encoded = r.usaCasetas
    ? [r.polylineCasetasIda || r.polylineCasetas, r.polylineCasetasRegreso]
    : [r.polylineLibreIda || r.polylineLibre, r.polylineLibreRegreso];
  encoded.filter(Boolean).forEach((trazo, index) => {
    const path = decodePolyline(trazo);
    new google.maps.Polyline({ path, geodesic: true, strokeColor: index === 0 ? '#25B1CF' : '#83BC28', strokeOpacity: 0.9, strokeWeight: 4 }).setMap(map);
  });
  if (!encoded[1] && r.origen && r.destino) {
    new google.maps.DirectionsService().route({
      origin: { lat: Number(r.destino.latitud), lng: Number(r.destino.longitud) },
      destination: { lat: Number(r.origen.latitud), lng: Number(r.origen.longitud) },
      travelMode: google.maps.TravelMode.DRIVING,
      avoidTolls: r.usaCasetas === false,
    }, (result, status) => {
      if (status === 'OK') {
        new google.maps.DirectionsRenderer({
          map,
          directions: result,
          suppressMarkers: true,
          polylineOptions: { strokeColor: '#83BC28', strokeOpacity: 0.9, strokeWeight: 4 },
        });
      }
    });
  }
  const trazos = encoded.filter(Boolean);
  if (trazos.length) {
    const bounds = new google.maps.LatLngBounds();
    trazos.flatMap(decodePolyline).forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
  }
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
