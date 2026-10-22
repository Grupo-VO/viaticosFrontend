const Auth = (() => {
  function init() {
    bindEvents();
    checkAuthStatus();
  }

  function bindEvents() {
    const form = document.getElementById('login-form');
    if (form) form.addEventListener('submit', handleLogin);

    const togglePw = document.getElementById('toggle-password');
    if (togglePw) togglePw.addEventListener('click', togglePassword);
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
      Utils.showToast('Ingresa usuario y contrasena', 'warning');
      return;
    }

    setLoading(true);
    try {
      const data = await API.post('/auth/login', { username, password });
      API.setSession(data);

      Utils.showToast('Sesion iniciada correctamente', 'success');
      setTimeout(() => showDashboard(), 400);
    } catch (err) {
      Utils.showToast(err.message || 'Credenciales incorrectas', 'error');
    } finally {
      setLoading(false);
    }
  }

  function setLoading(on) {
    const btn = document.getElementById('btn-login');
    const text = document.getElementById('btn-login-text');
    const loader = document.getElementById('btn-login-loader');
    if (btn) btn.disabled = on;
    if (text) text.classList.toggle('d-none', on);
    if (loader) loader.classList.toggle('d-none', !on);
  }

  function togglePassword() {
    const input = document.getElementById('password');
    const icon = document.getElementById('toggle-password-icon');
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (icon) icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
  }

  async function checkAuthStatus() {
    try {
      await API.cargarCsrf();
      const data = await API.get('/auth/me');
      API.setSession(data);
      showDashboard();
    } catch (_) {
      showLogin();
    }
  }

  function showLogin() {
    document.getElementById('login-view')?.classList.remove('d-none');
    document.getElementById('dashboard-view')?.classList.add('d-none');
    document.getElementById('accent-line')?.classList.add('d-none');
  }

  function showDashboard() {
    document.getElementById('login-view')?.classList.add('d-none');
    document.getElementById('dashboard-view')?.classList.remove('d-none');
    document.getElementById('accent-line')?.classList.remove('d-none');
    Dashboard.init();
  }

  function logout() {
    API.cerrarSesion().finally(() => {
      localStorage.removeItem('lastModule');
      showLogin();
      Utils.showToast('Sesion cerrada', 'info');
    });
  }

  return { init, logout, showLogin, showDashboard };
})();

document.addEventListener('DOMContentLoaded', () => Auth.init());
