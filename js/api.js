const API = (() => {
  // Keep the API on the same local hostname as the page so SameSite cookies work.
  const esProduccion = window.location.hostname === 'viaticos.grupovo.com.mx';
  const API_HOST = window.location.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
  const BASE_URL = esProduccion
    ? `${window.location.origin}/api/v1`
    : `http://${API_HOST}:8099/api/v1`;
  let csrfToken = null;
  let session = null;
  let refreshPromise = null;

  const esAuth = (url) => /\/auth\/(login|refresh-token|logout|csrf)$/.test(url);
  const esMutacion = (method) => !['GET', 'HEAD', 'OPTIONS'].includes(method);

  async function cargarCsrf() {
    const res = await fetch(`${BASE_URL}/auth/csrf`, { credentials: 'include' });
    if (!res.ok) throw new Error('No se pudo inicializar la protección CSRF');
    const data = await res.json();
    csrfToken = data.token;
    return csrfToken;
  }

  async function asegurarCsrf() {
    if (!csrfToken) await cargarCsrf();
  }

  function limpiarSesion() {
    session = null;
    localStorage.removeItem('username');
    localStorage.removeItem('nombre');
    localStorage.removeItem('rol');
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
  }

  async function refrescarSesion() {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          await asegurarCsrf();
          const res = await fetch(`${BASE_URL}/auth/refresh-token`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-XSRF-TOKEN': csrfToken },
          });
          if (!res.ok) throw new Error('Sesion expirada');
          const data = await res.json();
          establecerSesion(data);
          return true;
        } finally {
          refreshPromise = null;
        }
      })();
    }
    return refreshPromise;
  }

  function establecerSesion(data) {
    session = data || null;
  }

  async function cerrarSesion() {
    try {
      await asegurarCsrf();
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-XSRF-TOKEN': csrfToken },
      });
    } catch (_) {
      // La sesión local se limpia aunque el servidor ya no esté disponible.
    } finally {
      limpiarSesion();
    }
  }

  async function request(url, options = {}, retry = true) {
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    const method = options.method || 'GET';
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (esMutacion(method) && !/\/auth\/login$/.test(url)) {
      await asegurarCsrf();
      headers['X-XSRF-TOKEN'] = csrfToken;
    }

    const res = await fetch(fullUrl, { ...options, credentials: 'include', headers });
    if (res.status === 401 && retry && !esAuth(url)) {
      try {
        await refrescarSesion();
        return request(url, options, false);
      } catch (_) {
        limpiarSesion();
        throw new Error('Sesion expirada');
      }
    }
    if (!res.ok) {
      let errorMsg = `Error ${res.status}`;
      try {
        const errBody = await res.json();
        errorMsg = errBody.message || errBody.error || errorMsg;
      } catch (_) {}
      throw new Error(errorMsg);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function blob(url, retry = true) {
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    const res = await fetch(fullUrl, { credentials: 'include' });
    if (res.status === 401 && retry) {
      await refrescarSesion();
      return blob(url, false);
    }
    if (!res.ok) throw new Error('Error al descargar el archivo');
    return res.blob();
  }

  async function multipart(url, formData, retry = true) {
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    await asegurarCsrf();
    const res = await fetch(fullUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-XSRF-TOKEN': csrfToken },
      body: formData,
    });
    if (res.status === 401 && retry) {
      await refrescarSesion();
      return multipart(url, formData, false);
    }
    if (!res.ok) {
      let errorMsg = `Error ${res.status}`;
      try { const body = await res.json(); errorMsg = body.message || body.error || errorMsg; } catch (_) {}
      throw new Error(errorMsg);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    baseUrl: BASE_URL,
    fileUrl: (path) => `${BASE_URL.replace(/\/api\/v1\/?$/, '')}/${String(path || '').replace(/^\/+/, '')}`,
    getSession: () => session,
    setSession: establecerSesion,
    getToken: () => null,
    tokenExpirado: () => false,
    cargarCsrf,
    cerrarSesion,
    get: (url) => request(url, { method: 'GET' }),
    post: (url, data) => request(url, { method: 'POST', body: JSON.stringify(data) }),
    put: (url, data) => request(url, { method: 'PUT', body: JSON.stringify(data) }),
    patch: (url, data) => request(url, { method: 'PATCH', body: JSON.stringify(data) }),
    del: (url) => request(url, { method: 'DELETE' }),
    upload: multipart,
    multipart,
    blob,
  };
})();
