const Dashboard = (() => {
  function init() {
    setUserInfo();
    setVersion();
    bindSidebarEvents();
    bindTopbarEvents();
    loadDefaultModule();
  }

  function setVersion() {
    const el = document.getElementById('sidebar-version');
    if (el && typeof PAYLOAD_VERSION !== 'undefined') el.textContent = 'v' + PAYLOAD_VERSION;
  }

  function setUserInfo() {
    const sesion = API.getSession() || {};
    const nombre = sesion.nombre || 'Usuario';
    const displayName = document.getElementById('display-name');
    const avatar = document.getElementById('topbar-avatar');
    if (displayName) displayName.textContent = nombre;
    if (avatar) avatar.textContent = nombre.charAt(0).toUpperCase();
  }

  function getRol() {
    return API.getSession()?.role || null;
  }

  function bindSidebarEvents() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const toggle = document.getElementById('sidebarToggle');

    document.querySelectorAll('#sidebar-nav .sidebar-item[data-role]').forEach(item => {
      const roles = item.dataset.role.split(',').map(role => role.trim());
      item.style.display = roles.some(role => Utils.puede(role)) ? '' : 'none';
    });
    document.querySelectorAll('.home-shortcut-chofer').forEach(item => {
      item.style.display = Utils.puede('CHOFER') ? '' : 'none';
    });

    if (toggle) {
      const freshToggle = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(freshToggle, toggle);
      freshToggle.addEventListener('click', () => {
        sidebar.classList.toggle('sidebar-open');
        document.getElementById('sidebarOverlay').classList.toggle('active');
      });
    }
    if (overlay) {
      const freshOverlay = overlay.cloneNode(true);
      overlay.parentNode.replaceChild(freshOverlay, overlay);
      freshOverlay.addEventListener('click', () => {
        sidebar.classList.remove('sidebar-open');
        document.getElementById('sidebarOverlay').classList.remove('active');
      });
    }

    document.querySelectorAll('#sidebar-nav .sidebar-item').forEach(item => {
      const freshItem = item.cloneNode(true);
      item.parentNode.replaceChild(freshItem, item);
      freshItem.addEventListener('click', (e) => {
        e.preventDefault();
        const view = freshItem.dataset.view;
        const module = freshItem.dataset.module;

        setActive(freshItem);
        Utils.cargarVista(view, module);

        sidebar.classList.remove('sidebar-open');
        document.getElementById('sidebarOverlay').classList.remove('active');
      });
    });
  }

  function setActive(el) {
    document.querySelectorAll('#sidebar-nav .sidebar-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
  }

  function bindTopbarEvents() {
    const btnReload = document.getElementById('btn-reload');
    const btnLogout = document.getElementById('btn-logout');

    if (btnReload) {
      const freshReload = btnReload.cloneNode(true);
      btnReload.parentNode.replaceChild(freshReload, btnReload);
      freshReload.addEventListener('click', () => Utils.recargarModulo());
    }
    if (btnLogout) {
      const freshLogout = btnLogout.cloneNode(true);
      btnLogout.parentNode.replaceChild(freshLogout, btnLogout);
      freshLogout.addEventListener('click', () => {
        Utils.confirmAction('Cerrar sesion', 'Estas seguro que deseas cerrar sesion?', 'Salir', 'btn-primary')
          .then(ok => { if (ok) Auth.logout(); });
      });
    }
  }

  function loadDefaultModule() {
    if (Utils.puede('CHOFER')) {
      const miViaje = document.querySelector('#sidebar-nav .sidebar-item[data-module="mi-viaje"]');
      if (miViaje) {
        miViaje.click();
        return;
      }
    }
    const last = localStorage.getItem('lastModule');
    if (last && last !== 'home') {
      const item = document.querySelector(`#sidebar-nav .sidebar-item[data-module="${last}"]`);
      if (item) {
        item.click();
        return;
      }
    }
    Utils.cargarVista('pages/dashboard-home.html', 'home');
  }

  return { init, getRol };
})();
