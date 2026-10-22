let state = { data: [], filteredData: [], editingId: null, searchQuery: '' };

const esAdmin = () => Utils.puede('ADMINISTRADOR');

export function init() {
  if (!esAdmin()) {
    const btn = document.getElementById('btnNuevaConfig');
    if (btn) btn.style.display = 'none';
  }
  bindEvents();
  cargarConfigs();
}

function bindEvents() {
  document.getElementById('btnNuevaConfig')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarConfig')?.addEventListener('click', guardarConfig);
  document.getElementById('tableConfigsBody')?.addEventListener('click', handleTableClick);
  document.getElementById('searchConfigs')?.addEventListener('input', Utils.debounce(handleSearch, 300));
}

async function cargarConfigs() {
  try {
    state.data = await API.get('/configuraciones');
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
    : state.data.filter(c => `${c.clave} ${c.valor} ${c.descripcion || ''}`.toLowerCase().includes(state.searchQuery));
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableConfigsBody');
  if (!tbody) return;
  const items = state.filteredData || state.data || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-cog"></i><p>${state.searchQuery ? 'Sin resultados' : 'No hay configuraciones'}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(c => `
    <tr>
      <td class="fw-medium"><code>${Utils.esc(c.clave)}</code></td>
      <td>${Utils.esc(c.valor)}</td>
      <td>${Utils.esc(c.descripcion || '-')}</td>
      <td>${Utils.formatDate(c.fechaCreacion)}</td>
      <td class="acciones-cell">
        ${esAdmin() ? `
          <button class="btn-action btn-action-editar" data-id="${c.idConfiguracion}" title="Editar"><i class="fas fa-pen"></i></button>
          <button class="btn-action btn-action-eliminar" data-id="${c.idConfiguracion}" data-action="eliminar" title="Eliminar"><i class="fas fa-trash"></i></button>
        ` : ''}
      </td>
    </tr>`).join('');
}

function handleTableClick(e) {
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.classList.contains('btn-action-editar')) abrirModal(id);
  else if (btn.dataset.action === 'eliminar') eliminarConfig(id);
}

function abrirModal(id) {
  state.editingId = id;
  document.getElementById('configModalTitle').textContent = id ? 'Editar Configuracion' : 'Nueva Configuracion';
  document.getElementById('formConfig').reset();
  document.getElementById('configId').value = '';
  if (id) {
    const c = state.data.find(c => c.idConfiguracion === id);
    if (c) {
      document.getElementById('configId').value = c.idConfiguracion;
      document.getElementById('configClave').value = c.clave || '';
      document.getElementById('configValor').value = c.valor || '';
      document.getElementById('configDescripcion').value = c.descripcion || '';
    }
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('configModal')).show();
}

async function guardarConfig() {
  const clave = document.getElementById('configClave').value.trim();
  const valor = document.getElementById('configValor').value.trim();
  const descripcion = document.getElementById('configDescripcion').value.trim();
  if (!clave || !valor) {
    Utils.showToast('Clave y valor son obligatorios', 'warning');
    return;
  }
  try {
    const data = { clave, valor, ...(descripcion ? { descripcion } : {}) };
    if (state.editingId) {
      await API.put('/configuraciones/' + state.editingId, data);
      Utils.showToast('Configuracion actualizada', 'success');
    } else {
      await API.post('/configuraciones', data);
      Utils.showToast('Configuracion creada', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('configModal'))?.hide();
    cargarConfigs();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function eliminarConfig(id) {
  const confirmed = await Utils.confirmAction('¿Eliminar esta configuracion?', 'Esta accion no se puede deshacer.', 'Eliminar', 'btn-danger');
  if (!confirmed) return;
  try {
    await API.del('/configuraciones/' + id);
    Utils.showToast('Configuracion eliminada', 'success');
    cargarConfigs();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}