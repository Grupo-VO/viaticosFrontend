const Utils = (() => {
  const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (str) => String(str ?? '').replace(/[&<>"']/g, c => escapeMap[c]);
  const capitalize = (s) => String(s ?? '').charAt(0).toUpperCase() + String(s ?? '').slice(1).toLowerCase();
  const debounce = (fn, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const formatDate = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const formatFechaHora = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
           d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };
  const moneda = (n) => {
    const num = Number(n || 0);
    return num.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  };

  const cacheVersion = () => (typeof PAYLOAD_VERSION !== 'undefined') ? '?v=' + PAYLOAD_VERSION : '';

  // ─── Roles ───
  function rolActual() {
    return API.getSession()?.role || null;
  }
  function puede(...roles) {
    const rol = rolActual();
    return !!rol && roles.includes(rol);
  }

  // ─── Selects ───
  function rellenarSelect(selectId, items, valueKey, labelKey, placeholder = 'Seleccionar...') {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = `<option value="">${esc(placeholder)}</option>` +
      (items || []).map(it => {
        const val = typeof valueKey === 'function' ? valueKey(it) : it[valueKey];
        const lbl = typeof labelKey === 'function' ? labelKey(it) : it[labelKey];
        return `<option value="${esc(val)}">${esc(lbl)}</option>`;
      }).join('');
  }

  // ─── Descarga autenticada ───
  async function descargar(url, nombreArchivo) {
    const full = url.startsWith('http') ? url : (API.baseUrl || 'http://localhost:8099/api/v1') + url;
    const blob = await API.blob(full);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombreArchivo || 'archivo';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // ─── Google Maps (Maps JavaScript API) ───
  function cargarGoogleMaps() {
    if (typeof GEO !== 'undefined' && GEO.loadMap) return GEO.loadMap();
    return Promise.resolve();
  }

  // ─── Badge helper ───
  function badge(text, cls) {
    return `<span class="badge-status ${cls}">${esc(text)}</span>`;
  }

  // ─── Toast ───
  const iconMap = {
    success: 'fas fa-check-circle',
    error: 'fas fa-times-circle',
    info: 'fas fa-info-circle',
    warning: 'fas fa-exclamation-triangle',
  };

  function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-custom toast-${type}`;
    toast.innerHTML = `
      <i class="${iconMap[type] || iconMap.info} toast-icon"></i>
      <span class="toast-text">${esc(message)}</span>
      <button class="toast-close" aria-label="Cerrar"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(toast);

    const remove = () => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 350);
    };

    toast.querySelector('.toast-close').addEventListener('click', remove);
    if (duration > 0) setTimeout(remove, duration);
  }

  // ─── Confirm modal ───
  function confirmAction(title, message, buttonText = 'Eliminar', buttonClass = 'btn-danger') {
    return new Promise((resolve) => {
      const modalEl = document.getElementById('confirmModal');
      if (!modalEl) { resolve(false); return; }

      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMsg').textContent = message;
      const btn = document.getElementById('confirmBtn');
      btn.textContent = buttonText;
      btn.className = `btn px-4 ${buttonClass}`;

      const freshBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(freshBtn, btn);

      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

      const onConfirm = () => { modal.hide(); resolve(true); };
      const onClose = () => { resolve(false); };
      freshBtn.addEventListener('click', onConfirm, { once: true });
      modalEl.addEventListener('hidden.bs.modal', onClose, { once: true });

      modal.show();
    });
  }

  // ─── SPA view loading ───
  let vistaActual = null;
  let moduloActual = null;
  let moduloAnterior = null;
  let cargando = false;

  function destruirModuloAnterior() {
    if (moduloAnterior && typeof moduloAnterior.destroy === 'function') {
      try { moduloAnterior.destroy(); } catch {}
    }
    moduloAnterior = null;
  }

  async function cargarVista(ruta, modulo) {
    if (cargando) return;
    cargando = true;
    const main = document.getElementById('main-content');
    if (!main) { cargando = false; return; }

    destruirModuloAnterior();

    // cerrar modales abiertos
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
    document.querySelectorAll('.modal.show').forEach(m => {
      try { const inst = bootstrap.Modal.getInstance(m); if (inst) inst.hide(); } catch {}
      m.classList.remove('show');
    });
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');

    main.innerHTML = '<div class="d-flex justify-content-center align-items-center loading-view"><div class="spinner-table"></div></div>';

    const cacheV = cacheVersion();
    const fetchUrl = ruta + (cacheV ? (ruta.includes('?') ? '&' : '?') + cacheV.replace('?', '') : '');

    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      main.innerHTML = html;
      vistaActual = ruta;
      moduloActual = modulo;

      main.dataset.currentView = ruta;
      main.dataset.currentModule = modulo;

      if (modulo && modulo !== 'home') {
        localStorage.setItem('lastModule', modulo);
      }

      // importar modulo dinamicamente
      if (modulo && modulo !== 'home') {
        try {
          const module = await import(`./modules/${modulo}.js` + cacheV);
          if (module && typeof module.init === 'function') {
            moduloAnterior = module;
            module.init();
          } else {
            moduloAnterior = null;
          }
        } catch (err) {
          moduloAnterior = null;
          console.warn('Modulo no disponible:', modulo, err);
          Utils.showToast('El modulo ' + modulo + ' no esta disponible aun', 'warning');
        }
      } else {
        moduloAnterior = null;
      }
    } catch (err) {
      main.innerHTML = `<div class="welcome-container"><div class="welcome-card text-center"><i class="fas fa-exclamation-triangle fa-2x text-warning mb-3"></i><h5 class="fw-semibold mb-2">Error al cargar</h5><p class="text-muted">${esc(err.message)}</p><button class="btn btn-primary mt-3" onclick="Utils.recargarModulo()"><i class="fas fa-redo me-2"></i>Reintentar</button></div></div>`;
    } finally {
      cargando = false;
    }
  }

  async function recargarModulo() {
    const main = document.getElementById('main-content');
    if (main && main.dataset.currentView && main.dataset.currentModule) {
      await cargarVista(main.dataset.currentView, main.dataset.currentModule);
    } else if (vistaActual) {
      await cargarVista(vistaActual, moduloActual);
    }
  }

  function getModuloActual() { return moduloActual; }

  return {
    esc, capitalize, debounce, formatDate, formatFechaHora, moneda,
    rolActual, puede, rellenarSelect, descargar, cargarGoogleMaps, badge,
    showToast, confirmAction, cargarVista, recargarModulo, getModuloActual
  };
})();
