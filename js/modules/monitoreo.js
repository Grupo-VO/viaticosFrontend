let refreshTimer = null;
let lastViajes = [];
let detalleActualId = null;
let detalleRefreshTimer = null;

export function init() {
  bindEvents();
  cargarMonitoreo();
  refreshTimer = setInterval(cargarMonitoreo, 15000);
}

export function destroy() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (detalleRefreshTimer) {
    clearInterval(detalleRefreshTimer);
    detalleRefreshTimer = null;
  }
}

function bindEvents() {
  document.getElementById('btnRefreshMonitoreo')?.addEventListener('click', cargarMonitoreo);
  document.getElementById('monitoreoContainer')?.addEventListener('click', (e) => {
    const card = e.target.closest('.monitoreo-card');
      if (card) verDetalle(parseInt(card.dataset.id));
  });
  document.getElementById('monitoreoVerAlertas')?.addEventListener('click', (e) => {
    const button = e.target.closest('[data-alerta-id]');
    if (button) atenderAlerta(parseInt(button.dataset.alertaId));
  });
}

async function cargarMonitoreo() {
  try {
    const viajes = await API.get('/monitoreo/viajes');
    lastViajes = viajes || [];
    renderCards(lastViajes);
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function renderCards(viajes) {
  const cont = document.getElementById('monitoreoContainer');
  if (!cont) return;
  if (viajes.length === 0) {
    cont.innerHTML = `<div class="empty-state monitoreo-empty"><i class="fas fa-satellite-dish"></i><p>No hay viajes en curso</p></div>`;
    return;
  }
  cont.innerHTML = viajes.map(v => {
    const pctComb = v.capacidadTanqueLitros > 0 ? Math.round((v.nivelCombustible / v.capacidadTanqueLitros) * 100) : 0;
    const sinUbicacion = v.ultimaLatitud == null;
    const sinComunicacion = v.comunicacionPerdida === true;
    return `
      <div class="monitoreo-card" data-id="${v.idViaje}">
        <div class="monitoreo-head">
          <span class="monitoreo-placa">${Utils.esc(v.placaVehiculo)}</span>
          <span class="monitoreo-choice">Chofer: ${Utils.esc(v.nombreChofer || '-')}</span>
        </div>
        <div class="monitoreo-ruta">
          <i class="fas fa-location-dot icon-primary"></i>
          ${Utils.esc(v.origenRuta || '-')} <i class="fas fa-arrow-right small"></i> ${Utils.esc(v.destinoRuta || '-')}
        </div>
        <div class="monitoreo-chips">
          <span class="chip">${v.destinosVisitados}/${v.destinosTotales} destinos</span>
           <span class="chip ${sinComunicacion ? 'chip-danger' : ''}">${sinComunicacion ? 'Sin comunicacion' : (sinUbicacion ? 'Sin senal' : v.velocidadKmh + ' km/h')}</span>
          <span class="chip ${pctComb < 20 ? 'chip-danger' : ''}">${pctComb}% combustible</span>
        </div>
        <div class="progress-slim mb-2">
          <div class="progress-slim-bar progress-width-dynamic ${pctComb < 20 ? 'progress-bar-danger' : ''}" data-progress="${pctComb}"></div>
        </div>
        <div class="monitoreo-foot">
           <span class="text-muted small">${sinUbicacion ? 'Sin ubicacion aun' : 'Ultima actualizacion: ' + Utils.formatFechaHora(v.ultimaFechaUbicacion)}</span>
          ${(v.alertasActivas || []).length > 0 ? `<span class="badge badge-danger">${v.alertasActivas.length} alerta(s)</span>` : ''}
        </div>
      </div>`;
  }).join('');
  document.querySelectorAll('#monitoreoContainer [data-progress]').forEach(bar => {
    bar.style.setProperty('--progress-width', `${bar.dataset.progress}%`);
  });
}

async function verDetalle(id, silencioso = false) {
  try {
    detalleActualId = id;
    const resumen = await API.get(`/viajes/${id}/resumen`);
    const viaje = resumen.viaje;
    const ubicaciones = resumen.ubicaciones || [];
    const alertas = resumen.alertas || [];
    const incidentes = resumen.incidentes || [];

    document.getElementById('monitoreoVerTitulo').textContent = `Viaje #${viaje.idViaje} — ${viaje.placaVehiculo}`;
    document.getElementById('monitoreoVerInfo').innerHTML = `
      <div class="detail-row"><span class="detail-label">Chofer</span><span class="detail-value">${Utils.esc(viaje.nombreChofer || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">Ruta</span><span class="detail-value">${Utils.esc(viaje.origenRuta || '-')} → ${Utils.esc(viaje.destinoRuta || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">Salida</span><span class="detail-value">${Utils.formatFechaHora(viaje.fechaSalida)}</span></div>
      <div class="detail-row"><span class="detail-label">Distancia</span><span class="detail-value">${viaje.distanciaKm != null ? viaje.distanciaKm + ' km' : '-'}</span></div>
      <div class="detail-row"><span class="detail-label">Pasajeros</span><span class="detail-value">${viaje.numeroPasajeros}</span></div>
      <div class="detail-row"><span class="detail-label">Ubicaciones</span><span class="detail-value">${ubicaciones.length}</span></div>`;

    document.getElementById('monitoreoVerAlertas').innerHTML = alertas.length
      ? alertas.map(a => `
          <div class="alerta-item ${a.activa === false ? 'alerta-item-inactiva' : ''}">
            <span class="badge ${a.activa === false ? 'badge-inactive' : 'badge-warning'}">${Utils.esc(a.tipo)}</span>
            <span class="alerta-msg">${Utils.esc(a.mensaje)}</span>
            <small class="text-muted">${Utils.formatFechaHora(a.fecha)}</small>
            ${a.activa ? `<button type="button" class="btn btn-sm btn-outline-secondary ms-auto" data-alerta-id="${a.idAlerta}">Atender</button>` : ''}
          </div>`).join('')
      : `<div class="empty-state"><p>Sin alertas registradas</p></div>`;

    const destinos = [...(viaje.destinos || [])].sort((a, b) => a.orden - b.orden);
    document.getElementById('monitoreoVerDestinosBody').innerHTML = destinos.length
      ? destinos.map(d => `
          <tr>
            <td>${d.orden + 1}</td>
            <td>${Utils.esc(d.nombre)}</td>
            <td>${Utils.badge(d.visitado ? 'Visitado' : 'Pendiente', d.visitado ? 'badge-active' : 'badge-inactive')}</td>
            <td>${d.fechaLlegada ? Utils.formatFechaHora(d.fechaLlegada) : '-'}</td>
          </tr>`).join('')
      : `<tr><td colspan="4"><div class="empty-state"><p>Sin destinos</p></div></td></tr>`;

    if (!silencioso) bootstrap.Modal.getOrCreateInstance(document.getElementById('monitoreoVerModal')).show();
    dibujarMapa(viaje, ubicaciones, incidentes);
    if (!silencioso) {
      if (detalleRefreshTimer) clearInterval(detalleRefreshTimer);
      detalleRefreshTimer = setInterval(() => {
        if (detalleActualId && document.getElementById('monitoreoVerModal')?.classList.contains('show')) {
          verDetalle(detalleActualId, true);
        }
      }, 15000);
    }
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function atenderAlerta(idAlerta) {
  try {
    await API.patch(`/monitoreo/alertas/${idAlerta}/atender`, {});
    Utils.showToast('Alerta atendida', 'success');
    await cargarMonitoreo();
    if (detalleActualId) await verDetalle(detalleActualId);
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function dibujarMapa(viaje, ubicaciones, incidentes = []) {
  const cont = document.getElementById('monitoreoMap');
  cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Cargando mapa...</span></div>';
  await Utils.cargarGoogleMaps();
  if (!(window.google && window.google.maps)) {
    cont.innerHTML = '<div class="map-placeholder"><i class="fas fa-map"></i><span>Mapa no disponible (configura GEO.API_KEY)</span></div>';
    return;
  }
  const destinos = [...(viaje.destinos || [])].sort((a, b) => a.orden - b.orden);
  const last = ubicaciones[ubicaciones.length - 1];
  const center = last
    ? { lat: last.latitud, lng: last.longitud }
    : destinos[0] ? { lat: destinos[0].latitud, lng: destinos[0].longitud } : { lat: 19.4326, lng: -99.1332 };
  const map = new google.maps.Map(cont, { center, zoom: 9, mapTypeControl: false, streetViewControl: false });

  destinos.forEach((d, i) => {
    new google.maps.Marker({
      position: { lat: d.latitud, lng: d.longitud }, map, label: String(i + 1),
      title: d.nombre,
      icon: d.visitado ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : undefined,
    });
  });

  if (ubicaciones.length > 0) {
    const path = ubicaciones.map(u => ({ lat: u.latitud, lng: u.longitud }));
    new google.maps.Polyline({ path, geodesic: true, strokeColor: '#25B1CF', strokeOpacity: 0.8, strokeWeight: 4 }).setMap(map);
    const lastPt = path[path.length - 1];
    new google.maps.Marker({ position: lastPt, map, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png', scaledSize: new google.maps.Size(36, 36) } });
  }
  const encoded = viaje.tipoTrayecto === 'CASETAS'
    ? [viaje.polylineCasetasIda || viaje.polylineCasetas, viaje.polylineCasetasRegreso]
    : [viaje.polylineLibreIda || viaje.polylineLibre, viaje.polylineLibreRegreso];
  encoded.filter(Boolean).forEach((trazo, index) => {
    const path = decodePolyline(trazo);
    new google.maps.Polyline({ path, geodesic: true, strokeColor: index === 0 ? '#83BC28' : '#25B1CF', strokeOpacity: 0.75, strokeWeight: 3 }).setMap(map);
  });
  const bounds = new google.maps.LatLngBounds();
  destinos.forEach(d => bounds.extend({ lat: d.latitud, lng: d.longitud }));
  if (ubicaciones.length) ubicaciones.forEach(u => bounds.extend({ lat: u.latitud, lng: u.longitud }));
  incidentes.forEach(i => {
    const marker = new google.maps.Marker({
      position: { lat: i.latitud, lng: i.longitud },
      map,
      title: `Incidente ${i.severidad}`,
      icon: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png',
    });
    const info = new google.maps.InfoWindow({
      content: `<strong>Incidente ${Utils.esc(i.severidad)}</strong><br>${Utils.esc(i.tipo)}<br>${Utils.esc(i.descripcion)}`,
    });
    marker.addListener('click', () => info.open({ map, anchor: marker }));
    bounds.extend({ lat: i.latitud, lng: i.longitud });
  });
  map.fitBounds(bounds);
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
