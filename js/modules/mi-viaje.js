let viaje = null;
let map = null;
let marcadorActual = null;
let recorrido = null;
let watchId = null;
let refreshTimer = null;
let ultimaPosicionEnviada = 0;
let ultimaPosicion = null;
let directionsRenderer = null;
let navegacionActiva = false;

const INTERVALO_ENVIO_MS = 15000;

export function init() {
  document.getElementById('btnMiViajeIncidente')?.addEventListener('click', abrirModalIncidente);
  document.getElementById('btnEnviarMiViajeIncidente')?.addEventListener('click', enviarIncidente);
  document.getElementById('btnMiViajeNavegar')?.addEventListener('click', iniciarNavegacion);
  cargarViajeActivo();
  refreshTimer = setInterval(cargarViajeActivo, 30000);
}

export function destroy() {
  detenerGPS();
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  directionsRenderer?.setMap(null);
  directionsRenderer = null;
  navegacionActiva = false;
  document.getElementById('miViajeDirectionsWrap')?.classList.add('d-none');
}

async function cargarViajeActivo() {
  try {
    const anterior = viaje?.idViaje;
    viaje = await API.get('/viajes/activo');
    mostrarViaje();
    if (anterior !== viaje.idViaje || !map) {
      await dibujarMapa();
    }
    iniciarGPS();
  } catch (err) {
    detenerGPS();
    viaje = null;
    map = null;
    marcadorActual = null;
    recorrido = null;
    directionsRenderer?.setMap(null);
    directionsRenderer = null;
    navegacionActiva = false;
    document.getElementById('miViajeDirectionsWrap')?.classList.add('d-none');
    document.getElementById('miViajeContent')?.classList.add('d-none');
    document.getElementById('miViajeEmpty')?.classList.remove('d-none');
    actualizarEstadoGPS('GPS detenido', 'No hay viaje activo');
    if (!String(err.message || '').toLowerCase().includes('no tienes un viaje activo')) {
      Utils.showToast(err.message, 'error');
    }
  }
}

function mostrarViaje() {
  document.getElementById('miViajeEmpty')?.classList.add('d-none');
  document.getElementById('miViajeContent')?.classList.remove('d-none');
  document.getElementById('miViajeTitulo').textContent = `Viaje #${viaje.idViaje}`;
  document.getElementById('miViajeStatus').innerHTML = Utils.badge('En viaje', 'badge-warning');
  document.getElementById('miViajeVehiculo').textContent = `${viaje.placaVehiculo || '-'} — ${viaje.vehiculoDescripcion || ''}`;
  document.getElementById('miViajeSalida').textContent = Utils.formatFechaHora(viaje.fechaSalida);
  document.getElementById('miViajeDistancia').textContent = viaje.distanciaKm != null ? `${viaje.distanciaKm} km` : '-';
  document.getElementById('miViajeCombustible').textContent = viaje.litrosConsumidos != null
    ? `${viaje.litrosConsumidos} L estimados`
    : 'Calculando';

  const destinos = [...(viaje.destinos || [])].sort((a, b) => a.orden - b.orden);
  document.getElementById('miViajeDestinosBody').innerHTML = destinos.map(d => `
    <tr>
      <td>${d.orden + 1}</td>
      <td>${Utils.esc(d.nombre)}</td>
      <td>${Utils.badge(d.visitado ? 'Visitado' : 'Pendiente', d.visitado ? 'badge-active' : 'badge-inactive')}</td>
    </tr>`).join('');
}

function iniciarGPS() {
  if (watchId !== null) return;
  if (!navigator.geolocation) {
    actualizarEstadoGPS('GPS no disponible', 'Este dispositivo no permite geolocalizacion');
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    manejarPosicion,
    manejarErrorGPS,
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
  );
  actualizarEstadoGPS('GPS activo', 'Esperando posicion...');
}

function detenerGPS() {
  if (watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
}

async function manejarPosicion(position) {
  const coords = position.coords;
  const punto = { lat: coords.latitude, lng: coords.longitude };
  ultimaPosicion = punto;
  actualizarMapa(punto);
  const ahora = Date.now();
  if (ahora - ultimaPosicionEnviada < INTERVALO_ENVIO_MS) return;
  ultimaPosicionEnviada = ahora;

  try {
    await API.post('/ubicaciones', {
      idViaje: viaje.idViaje,
      latitud: coords.latitude,
      longitud: coords.longitude,
      velocidadKmh: coords.speed == null ? 0 : Math.max(0, coords.speed * 3.6),
    });
    document.getElementById('miViajeUltimaUbicacion').textContent = Utils.formatFechaHora(new Date().toISOString());
    actualizarEstadoGPS('GPS activo', 'Ubicacion enviada');
  } catch (err) {
    ultimaPosicionEnviada = 0;
    actualizarEstadoGPS('GPS con error', err.message || 'No se pudo enviar la ubicacion');
  }
}

function abrirModalIncidente() {
  document.getElementById('miViajeIncidenteForm')?.reset();
  document.getElementById('miViajeIncidenteSeveridad').value = 'MEDIA';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('miViajeIncidenteModal')).show();
}

async function enviarIncidente() {
  const tipo = document.getElementById('miViajeIncidenteTipo').value;
  const severidad = document.getElementById('miViajeIncidenteSeveridad').value;
  const descripcion = document.getElementById('miViajeIncidenteDescripcion').value.trim();
  const evidencia = document.getElementById('miViajeIncidenteEvidencia').files[0];
  if (!tipo || !severidad || !descripcion) {
    Utils.showToast('Completa tipo, severidad y descripción', 'warning');
    return;
  }
  const ahora = new Date().toISOString().slice(0, 19);
  const payload = {
    idViaje: viaje?.idViaje,
    tipo,
    severidad,
    descripcion,
    fecha: ahora,
    latitud: ultimaPosicion?.lat ?? null,
    longitud: ultimaPosicion?.lng ?? null,
  };
  const formData = new FormData();
  formData.append('request', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  if (evidencia) formData.append('evidencia', evidencia);
  try {
    await API.multipart('/reportes', formData);
    bootstrap.Modal.getInstance(document.getElementById('miViajeIncidenteModal'))?.hide();
    Utils.showToast('Incidente reportado correctamente', 'success');
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function manejarErrorGPS(error) {
  const mensajes = {
    1: 'Permiso de ubicacion denegado',
    2: 'No se pudo obtener la posicion',
    3: 'La solicitud de ubicacion tardo demasiado',
  };
  actualizarEstadoGPS('GPS con error', mensajes[error.code] || 'Error de geolocalizacion');
}

function actualizarEstadoGPS(titulo, mensaje) {
  const el = document.getElementById('miViajeGpsStatus');
  if (el) el.innerHTML = `<span class="live-dot"></span> ${Utils.esc(titulo)}`;
  const msg = document.getElementById('miViajeGpsMessage');
  if (msg) msg.textContent = mensaje;
}

async function dibujarMapa() {
  const cont = document.getElementById('miViajeMap');
  if (!cont) return;
  cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Cargando mapa...</span></div>';
  await Utils.cargarGoogleMaps();
  if (!(window.google && window.google.maps)) {
    cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Mapa no disponible</span></div>';
    return;
  }
  const destinos = [...(viaje.destinos || [])].sort((a, b) => a.orden - b.orden);
  const primero = destinos[0];
  const center = primero ? { lat: primero.latitud, lng: primero.longitud } : { lat: 19.4326, lng: -99.1332 };
  map = new google.maps.Map(cont, { center, zoom: 9, mapTypeControl: false, streetViewControl: false });
  destinos.forEach((destino, index) => {
    new google.maps.Marker({
      position: { lat: destino.latitud, lng: destino.longitud },
      map,
      label: String(index + 1),
      title: destino.nombre,
    });
  });
  const encoded = viaje.tipoTrayecto === 'CASETAS'
    ? [viaje.polylineCasetasIda || viaje.polylineCasetas, viaje.polylineCasetasRegreso]
    : [viaje.polylineLibreIda || viaje.polylineLibre, viaje.polylineLibreRegreso];
  const trazos = encoded.filter(Boolean);
  trazos.forEach((trazo, index) => {
    const path = decodePolyline(trazo);
    new google.maps.Polyline({ path, geodesic: true, strokeColor: index === 0 ? '#83BC28' : '#25B1CF', strokeOpacity: 0.8, strokeWeight: 4 }).setMap(map);
  });
  if (trazos.length) {
    const bounds = new google.maps.LatLngBounds();
    trazos.flatMap(decodePolyline).forEach(point => bounds.extend(point));
    map.fitBounds(bounds);
  }
}

async function iniciarNavegacion() {
  if (!viaje) return;
  await Utils.cargarGoogleMaps();
  if (!(window.google && window.google.maps)) {
    Utils.showToast('Google Maps no está disponible para iniciar navegación', 'error');
    return;
  }
  const destinos = [...(viaje.destinos || [])].sort((a, b) => a.orden - b.orden);
  const siguiente = destinos.find(d => d.orden > 0 && !d.visitado) || destinos[0];
  if (!siguiente) {
    Utils.showToast('No hay un destino disponible para navegar', 'warning');
    return;
  }
  const obtenerOrigen = (resolve) => {
    if (ultimaPosicion) return resolve(ultimaPosicion);
    navigator.geolocation?.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(destinos[0] ? { lat: destinos[0].latitud, lng: destinos[0].longitud } : null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  obtenerOrigen(origen => {
    if (!origen) return;
    const panel = document.getElementById('miViajeDirectionsPanel');
    const wrap = document.getElementById('miViajeDirectionsWrap');
    wrap?.classList.remove('d-none');
    directionsRenderer?.setMap(null);
    directionsRenderer = new google.maps.DirectionsRenderer({ map, panel, suppressMarkers: false, preserveViewport: true });
    const service = new google.maps.DirectionsService();
    service.route({
      origin: origen,
      destination: { lat: Number(siguiente.latitud), lng: Number(siguiente.longitud) },
      travelMode: google.maps.TravelMode.DRIVING,
      avoidTolls: viaje.tipoTrayecto !== 'CASETAS',
    }, (result, status) => {
      if (status !== 'OK') {
        Utils.showToast('No se pudieron obtener indicaciones: ' + status, 'error');
        return;
      }
      directionsRenderer.setDirections(result);
      navegacionActiva = true;
      document.getElementById('btnMiViajeNavegar').innerHTML = '<i class="fas fa-rotate me-2"></i>Actualizar navegación';
      Utils.showToast('Navegación activa hacia ' + siguiente.nombre, 'success');
    });
  });
}

function actualizarMapa(position) {
  if (!map) return;
  if (!marcadorActual) {
    marcadorActual = new google.maps.Marker({
      position,
      map,
      title: 'Mi ubicacion',
      icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
    });
    recorrido = new google.maps.Polyline({ path: [position], geodesic: true, strokeColor: '#25B1CF', strokeOpacity: 0.9, strokeWeight: 4, map });
  } else {
    marcadorActual.setPosition(position);
    recorrido.getPath().push(new google.maps.LatLng(position.lat, position.lng));
  }
  map.panTo(position);
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
