// Admin Dashboard JavaScript
// Modern admin panel functionality

document.addEventListener('DOMContentLoaded', () => {
  // Check auth
  if (!requireAuth()) return;
  if (localStorage.getItem('panchayat_role') !== 'admin') {
    window.location.href = '/login/';
    return;
  }

  // Tab navigation
  document.querySelectorAll('.sidebar .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.dataset.tab;
      switchTab(tabId);
    });
  });

  // Load initial data
  loadDashboard();
  loadProfile();
  loadSocieties();
  loadUsers();
  loadBylaws();
  loadServices();
  loadAuditLog();
});

// Tab switching
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => {
    t.classList.add('d-none');
    t.classList.remove('active');
  });
  document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
  
  const target = document.getElementById(`tab-${tabId}`);
  if (target) {
    target.classList.remove('d-none');
    target.classList.add('active');
  }
  
  const activeLink = document.querySelector(`.sidebar [data-tab="${tabId}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }
}

// Dashboard
async function loadDashboard() {
  try {
    const [usersRes, complaintsRes, duesRes] = await Promise.all([
      api.get('/auth/users/'),
      api.get('/complaints/'),
      api.get('/finance/dues/')
    ]);

    const usersData = await usersRes.json();
    const complaintsData = await complaintsRes.json();
    const duesData = await duesRes.json();

    const users = usersData.results || [];
    const complaints = complaintsData.results || [];
    const dues = duesData.results || [];

    // Animate numbers
    animateValue('stat-societies', 0, 1, 500);
    animateValue('stat-users', 0, users.length, 500);
    animateValue('stat-complaints', 0, complaints.filter(c => c.status === 'open').length, 500);
    animateValue('stat-dues', 0, dues.filter(d => !d.is_paid).length, 500);
  } catch (e) {
    console.error('Dashboard load error:', e);
    showToast('Failed to load dashboard data', 'error');
  }
}

function animateValue(id, start, end, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  
  const range = end - start;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const value = Math.floor(progress * range + start);
    el.textContent = value;
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

// AI Summary
async function loadAISummary() {
  const content = document.getElementById('ai-summary-content');
  content.innerHTML = '<div class="spinner"></div>';
  
  try {
    const res = await api.get('/ai/summary/');
    const data = await res.json();
    
    if (data.success) {
      content.innerHTML = `<p>${data.data.summary.replace(/\n/g, '<br>')}</p>
        <small class="text-muted">Generated at ${new Date(data.data.generated_at).toLocaleTimeString()}</small>`;
    } else {
      content.innerHTML = '<p class="text-danger">No summary available</p>';
    }
  } catch (e) {
    content.innerHTML = '<p class="text-danger">Failed to load summary</p>';
  }
}

// Societies
async function loadSocieties() {
  const tbody = document.getElementById('societies-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/auth/societies/');
    const result = await res.json();
    const societies = result.data || [];
    
    if (societies.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-4">
            <div class="empty-state">
              <i class="fas fa-building empty-state-icon"></i>
              <h4>No Societies</h4>
              <p>Add your first society to get started</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = societies.map(s => `
      <tr data-society-id="${s.id}">
        <td>${s.name}</td>
        <td>${s.city}</td>
        <td>${s.total_flats}</td>
        <td><span class="badge badge-${s.plan_type === 'premium' ? 'primary' : s.plan_type === 'standard' ? 'warning' : 'info'}">${s.plan_type || 'N/A'}</span></td>
        <td><span class="badge badge-${s.is_active ? 'success' : 'secondary'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="editSociety(${s.id})" data-society-id="${s.id}" title="Edit Society">
            <i class="fas fa-edit"></i> Edit
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Societies load error:', e);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Failed to load societies</td></tr>';
  }
}

async function editSociety(societyId) {
  console.log('[ADMIN] editSociety called with ID:', societyId);
  
  // Find edit button in the table row
  const row = document.querySelector(`tr[data-society-id="${societyId}"]`);
  const editBtn = row ? row.querySelector('button[data-society-id]') : null;
  
  if (editBtn) {
    editBtn.disabled = true;
    editBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }
  
  try {
    const res = await api.get(`/auth/societies/${societyId}/`);
    if (!res.ok) {
      console.error('[ADMIN] API error:', res.status, res.statusText);
      showToast('Failed to load society details', 'error');
      return;
    }
    const result = await res.json();
    const data = result.data;
    console.log('[ADMIN] Society data received:', data);
    
    if (data && data.id) {
      let idField = document.getElementById('society-id');
      if (!idField) {
        idField = document.createElement('input');
        idField.type = 'hidden';
        idField.id = 'society-id';
        document.getElementById('society-form').appendChild(idField);
      }
      idField.value = societyId;
      
      document.getElementById('society-name').value = data.name || '';
      document.getElementById('society-address').value = data.address || '';
      document.getElementById('society-city').value = data.city || '';
      document.getElementById('society-state').value = data.state || '';
      document.getElementById('society-wings').value = data.wing_count || 1;
      document.getElementById('society-flats').value = data.total_flats || '';
      document.getElementById('society-plan').value = data.plan_type || 'standard';
      
      document.querySelector('#societyModal .modal-title').innerHTML = '<i class="fas fa-edit me-2"></i>Edit Society';
      document.querySelector('#societyModal .btn-primary').innerHTML = '<i class="fas fa-save me-2"></i>Update Society';
      
      const modalElement = document.getElementById('societyModal');
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
      console.log('[ADMIN] Society modal shown successfully');
    } else {
      console.error('[ADMIN] Invalid society data:', data);
      showToast('Failed to load society details', 'error');
    }
  } catch (e) {
    console.error('[ADMIN] Error loading society:', e);
    showToast('Failed to load society details', 'error');
  } finally {
    if (editBtn) {
      editBtn.disabled = false;
      editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
    }
  }
}

// Users
async function loadUsers(role = '') {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/auth/users/');
    const data = await res.json();
    const users = data.results || [];
    
    const filtered = role ? users.filter(u => u.role === role) : users;
    
    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-4">
            <div class="empty-state">
              <i class="fas fa-users empty-state-icon"></i>
              <h4>No Users Found</h4>
              <p>Add your first user to get started</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = filtered.map(u => `
      <tr>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="avatar avatar-sm">${u.first_name ? u.first_name.charAt(0).toUpperCase() : 'U'}</div>
            <div>
              <div class="font-semibold">${u.full_name || u.first_name || '-'}</div>
              <small class="text-muted">${u.flat_no ? 'Flat ' + u.flat_no : ''}</small>
            </div>
          </div>
        </td>
        <td>${u.email}</td>
        <td><span class="badge badge-${u.role === 'admin' ? 'danger' : u.role === 'committee' ? 'warning' : 'info'}">${u.role}</span></td>
        <td>${u.flat_no || '-'}</td>
        <td>${u.is_approved ? '<span class="badge badge-success">Approved</span>' : '<span class="badge badge-warning">Pending</span>'}</td>
        <td>
          ${!u.is_approved ? `<button class="btn btn-sm btn-success" onclick="approveUser(${u.id})">
            <i class="fas fa-check"></i> Approve
          </button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Users load error:', e);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Failed to load users</td></tr>';
  }
}

document.getElementById('role-filter')?.addEventListener('change', (e) => {
  loadUsers(e.target.value);
});

async function saveUser() {
  const name = document.getElementById('user-name').value.split(' ');
  const data = {
    first_name: name[0] || '',
    last_name: name.slice(1).join(' ') || '',
    email: document.getElementById('user-email').value,
    role: document.getElementById('user-role').value,
    flat_no: document.getElementById('user-flat').value,
    wing: document.getElementById('user-wing').value,
    phone: document.getElementById('user-phone').value,
    password: 'Temp@123',
    password_confirm: 'Temp@123'
  };
  
  const btn = document.querySelector('#userModal .btn-primary');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.post('/auth/register/', data);
    const result = await res.json();
    
    if (result.success) {
      showToast('User created successfully', 'success');
      bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
      document.getElementById('user-form').reset();
      loadUsers();
    } else {
      showToast(result.message || 'Failed to create user', 'error');
    }
  } catch (e) {
    showToast('Error creating user', 'error');
  }
  
  setButtonLoading(btn, false);
}

// Bylaws
async function loadBylaws() {
  const tbody = document.getElementById('bylaws-tbody');
  tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/bylaws/');
    const data = await res.json();
    const bylaws = data.results || [];
    
    if (bylaws.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted py-4">
            <div class="empty-state">
              <i class="fas fa-file-pdf empty-state-icon"></i>
              <h4>No Bylaws</h4>
              <p>Upload your first bylaw document</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = bylaws.map(b => `
      <tr>
        <td>${b.title}</td>
        <td>v${b.version}</td>
        <td>${formatDate(b.uploaded_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="downloadBylaw(${b.id}, '${b.title}')" title="Download Bylaw PDF">
            <i class="fas fa-download"></i> Download
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4">Failed to load bylaws</td></tr>';
  }
}

async function uploadBylaw() {
  const file = document.getElementById('bylaw-file').files[0];
  if (!file) {
    showToast('Please select a PDF file', 'error');
    return;
  }
  
  const formData = new FormData();
  formData.append('title', document.getElementById('bylaw-title').value);
  formData.append('version', document.getElementById('bylaw-version').value);
  formData.append('pdf', file);
  
  const btn = document.querySelector('#bylawModal .btn-primary');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.upload('/bylaws/upload/', formData);
    const result = await res.json();
    
    if (result.success) {
      showToast('Bylaw uploaded successfully', 'success');
      bootstrap.Modal.getInstance(document.getElementById('bylawModal')).hide();
      document.getElementById('bylaw-form').reset();
      loadBylaws();
    } else {
      showToast(result.message || 'Upload failed', 'error');
    }
  } catch (e) {
    showToast('Error uploading bylaw', 'error');
  }
  
  setButtonLoading(btn, false);
}

async function downloadBylaw(bylawId, bylawTitle) {
  try {
    const res = await api.get(`/bylaws/${bylawId}/download/`);
    
    if (!res.ok) {
      showToast('Failed to download bylaw', 'error');
      return;
    }
    
    // Create a blob from the response
    const blob = await res.blob();
    
    // Create a temporary URL for the blob
    const url = window.URL.createObjectURL(blob);
    
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = `${bylawTitle}.pdf`;
    
    // Trigger the download
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    showToast('Bylaw downloaded successfully', 'success');
  } catch (e) {
    console.error('Error downloading bylaw:', e);
    showToast('Error downloading bylaw', 'error');
  }
}

// Services
async function loadServices() {
  const tbody = document.getElementById('services-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/services/');
    const data = await res.json();
    const services = data.results || [];
    
    if (services.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-4">
            <div class="empty-state">
              <i class="fas fa-tools empty-state-icon"></i>
              <h4>No Services</h4>
              <p>Add your first service to get started</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
tbody.innerHTML = services.map(s => {
      const serviceName = s.name || 'N/A';
      const vendorName = s.vendor_name || '-';
      const vendorPhone = s.vendor_phone || '-';
      const price = s.price_per_slot || 0;
      const isActive = s.is_active;
      const updatedAt = s.updated_at;
      const updatedByName = s.updated_by_name;
      
      const statusBadge = `<span class="badge badge-${isActive ? 'success' : 'secondary'}">${isActive ? 'Active' : 'Inactive'}</span>`;
      
      const lastModified = updatedAt && updatedAt !== null && updatedAt !== '' ? 
        new Date(updatedAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }) : 'Never';
      
      const modifiedBy = updatedByName && updatedByName !== null && updatedByName !== '' ? '<br>' + updatedByName : '';
      
      return `
        <tr data-service-id="${s.id}">
          <td style="width: 40px;" class="text-center">
            <input type="checkbox" class="service-checkbox" value="${s.id}">
          </td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="avatar avatar-sm" style="background: var(--brand-light); color: var(--brand-primary);">
                <i class="fas fa-tools"></i>
              </div>
              <strong>${serviceName}</strong>
            </div>
          </td>
          <td>${vendorName}</td>
          <td>${vendorPhone}</td>
          <td>₹${price}</td>
          <td>${statusBadge}</td>
          <td>
            <small class="text-muted">
              ${lastModified}${modifiedBy}
            </small>
          </td>
          <td>
            <button class="btn btn-sm btn-outline-primary edit-btn" onclick="editService(${s.id})" data-service-id="${s.id}" title="Edit Service">
              <i class="fas fa-edit"></i> Edit
            </button>
          </td>
        </tr>
      `;
    }).join('');
    
    // Reset select-all checkbox
    document.getElementById('select-all-services').checked = false;
    
    // Update bulk action buttons
    updateBulkActions();
  } catch (e) {
    console.error('Services load error:', e);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Failed to load services</td></tr>';
  }
}

async function saveService() {
  // Client-side validation
  const name = document.getElementById('service-name').value.trim();
  const price = document.getElementById('service-price').value;
  
  if (!name) {
    showToast('Service name is required', 'error');
    document.getElementById('service-name').focus();
    return;
  }
  
  if (!price || parseFloat(price) < 0) {
    showToast('Please enter a valid price', 'error');
    document.getElementById('service-price').focus();
    return;
  }
  
  const serviceId = document.getElementById('service-id')?.value;
  const isActive = document.getElementById('service-active').checked;
  
  // Confirmation for deactivation
  if (serviceId && !isActive) {
    if (!confirm('Are you sure you want to deactivate this service? Residents will no longer be able to book it.')) {
      return;
    }
  }
  
  const data = {
    name: name,
    description: document.getElementById('service-desc').value.trim(),
    vendor_name: document.getElementById('service-vendor').value.trim(),
    vendor_phone: document.getElementById('service-phone').value.trim(),
    price_per_slot: parseFloat(price),
    is_active: isActive
  };
  
  const btn = document.querySelector('#serviceModal .btn-primary');
  setButtonLoading(btn, true);
  
  try {
    let res, result;
    
    if (serviceId) {
      // Update existing service
      res = await api.put(`/services/${serviceId}/update/`, data);
      result = await res.json();
      
      if (res.ok && result.success) {
        showToast('Service updated successfully', 'success');
      } else {
        showToast(result.message || 'Failed to update service', 'error');
      }
    } else {
      // Create new service
      res = await api.post('/services/create/', data);
      result = await res.json();
      
      if (res.ok && result.success) {
        showToast('Service created successfully', 'success');
      } else {
        showToast(result.message || 'Failed to create service', 'error');
      }
    }
    
    if (res.ok && result.success) {
      bootstrap.Modal.getInstance(document.getElementById('serviceModal')).hide();
      document.getElementById('service-form').reset();
      document.getElementById('service-id')?.remove();
      loadServices();
    }
  } catch (e) {
    showToast('Error saving service', 'error');
  }
  
  setButtonLoading(btn, false);
}

async function editService(serviceId) {
  console.log('[ADMIN] editService called with ID:', serviceId);
  
  // Show loading on the button
  const editBtn = document.querySelector(`.edit-btn[data-service-id="${serviceId}"]`);
  if (editBtn) {
    editBtn.disabled = true;
    editBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }
  
  try {
    const res = await api.get(`/services/${serviceId}/`);
    if (!res.ok) {
      console.error('[ADMIN] API error:', res.status, res.statusText);
      showToast('Failed to load service details', 'error');
      return;
    }
    const data = await res.json();
    console.log('[ADMIN] Service data received:', data);
    
    if (data && data.id) {
      // Set service ID in hidden field
      let idField = document.getElementById('service-id');
      if (!idField) {
        idField = document.createElement('input');
        idField.type = 'hidden';
        idField.id = 'service-id';
        document.getElementById('service-form').appendChild(idField);
      }
      idField.value = serviceId;
      
      // Populate form fields
      document.getElementById('service-name').value = data.name || '';
      document.getElementById('service-desc').value = data.description || '';
      document.getElementById('service-vendor').value = data.vendor_name || '';
      document.getElementById('service-phone').value = data.vendor_phone || '';
      document.getElementById('service-price').value = data.price_per_slot || '0';
      document.getElementById('service-active').checked = data.is_active !== false;
      
      // Update modal title
      document.querySelector('#serviceModal .modal-title').innerHTML = '<i class="fas fa-edit me-2"></i>Edit Service';
      document.querySelector('#serviceModal .btn-primary').innerHTML = '<i class="fas fa-save me-2"></i>Update Service';
      
      // Show modal
      const modalElement = document.getElementById('serviceModal');
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
      console.log('[ADMIN] Modal shown successfully');
    } else {
      console.error('[ADMIN] Invalid service data:', data);
      showToast('Failed to load service details', 'error');
    }
  } catch (e) {
    console.error('[ADMIN] Error loading service:', e);
    showToast('Failed to load service details', 'error');
  } finally {
    // Reset button
    if (editBtn) {
      editBtn.disabled = false;
      editBtn.innerHTML = '<i class="fas fa-edit"></i>';
    }
  }
}

// Reset service form when modal closes
document.getElementById('serviceModal')?.addEventListener('hidden.bs.modal', function() {
  const idField = document.getElementById('service-id');
  if (idField) idField.remove();
  document.getElementById('service-form').reset();
  document.querySelector('#serviceModal .modal-title').innerHTML = '<i class="fas fa-tools me-2"></i>Add New Service';
  document.querySelector('#serviceModal .btn-primary').innerHTML = '<i class="fas fa-save me-2"></i>Save Service';
  document.getElementById('service-active').checked = true;
});

// Services search and filter
document.getElementById('service-search')?.addEventListener('input', filterServices);
document.getElementById('service-status-filter')?.addEventListener('change', filterServices);
document.getElementById('clear-filters')?.addEventListener('click', clearServiceFilters);

// Select all checkbox
document.getElementById('select-all-services')?.addEventListener('change', function() {
  const checkboxes = document.querySelectorAll('.service-checkbox');
  checkboxes.forEach(cb => cb.checked = this.checked);
  updateBulkActions();
});

// Individual checkboxes
document.addEventListener('change', function(e) {
  if (e.target.classList.contains('service-checkbox')) {
    updateBulkActions();
  }
});

// Bulk actions
document.getElementById('bulk-delete-btn')?.addEventListener('click', bulkDeleteServices);
document.getElementById('bulk-activate-btn')?.addEventListener('click', () => bulkUpdateServices(true));
document.getElementById('bulk-deactivate-btn')?.addEventListener('click', () => bulkUpdateServices(false));

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key === 'e') {
    e.preventDefault();
    const selectedRow = document.querySelector('#services-table tbody tr.selected');
    if (selectedRow) {
      const serviceId = selectedRow.dataset.serviceId;
      if (serviceId) editService(serviceId);
    }
  }
});

// Row selection for keyboard shortcuts (but don't interfere with checkboxes)
document.addEventListener('click', function(e) {
  // Don't select row if clicking on checkbox
  if (e.target.classList.contains('service-checkbox')) return;
  
  const row = e.target.closest('#services-table tbody tr');
  if (row) {
    document.querySelectorAll('#services-table tbody tr').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
  }
});

function filterServices() {
  const searchTerm = document.getElementById('service-search').value.toLowerCase();
  const statusFilter = document.getElementById('service-status-filter').value;
  const rows = document.querySelectorAll('#services-tbody tr[data-service-id]');
  
  rows.forEach(row => {
    // Cell indices: 0=checkbox, 1=service name, 2=vendor name, 3=vendor phone, 4=price, 5=status, 6=last modified, 7=actions
    const serviceName = row.cells[1]?.textContent?.toLowerCase() || '';
    const vendorName = row.cells[2]?.textContent?.toLowerCase() || '';
    const statusText = row.cells[5]?.textContent?.toLowerCase()?.trim() || '';
    const status = statusText.includes('active') ? 'active' : 'inactive';
    
    const matchesSearch = serviceName.includes(searchTerm) || vendorName.includes(searchTerm);
    const matchesStatus = !statusFilter || status === statusFilter;
    
    row.style.display = matchesSearch && matchesStatus ? '' : 'none';
  });
  
  // Update bulk action buttons after filtering
  updateBulkActions();
}

function clearServiceFilters() {
  document.getElementById('service-search').value = '';
  document.getElementById('service-status-filter').value = '';
  filterServices();
}

function updateBulkActions() {
  // Only count checkboxes from visible rows
  const visibleRows = document.querySelectorAll('#services-tbody tr[data-service-id]:not([style*="display: none"])');
  const checkedBoxes = visibleRows.length > 0 
    ? document.querySelectorAll('#services-tbody tr[data-service-id]:not([style*="display: none"]) .service-checkbox:checked')
    : document.querySelectorAll('.service-checkbox:checked');
  
  const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
  const bulkActivateBtn = document.getElementById('bulk-activate-btn');
  const bulkDeactivateBtn = document.getElementById('bulk-deactivate-btn');
  
  if (bulkDeleteBtn && bulkActivateBtn && bulkDeactivateBtn) {
    const hasSelection = checkedBoxes.length > 0;
    bulkDeleteBtn.disabled = !hasSelection;
    bulkActivateBtn.disabled = !hasSelection;
    bulkDeactivateBtn.disabled = !hasSelection;
    
    // Update button text with count
    const count = checkedBoxes.length;
    if (count > 0) {
      bulkDeleteBtn.innerHTML = `<i class="fas fa-trash me-2"></i>Delete Selected (${count})`;
      bulkActivateBtn.innerHTML = `<i class="fas fa-check me-2"></i>Activate Selected (${count})`;
      bulkDeactivateBtn.innerHTML = `<i class="fas fa-times me-2"></i>Deactivate Selected (${count})`;
    } else {
      bulkDeleteBtn.innerHTML = '<i class="fas fa-trash me-2"></i>Delete Selected';
      bulkActivateBtn.innerHTML = '<i class="fas fa-check me-2"></i>Activate Selected';
      bulkDeactivateBtn.innerHTML = '<i class="fas fa-times me-2"></i>Deactivate Selected';
    }
  }
}

async function bulkDeleteServices() {
  const checkedBoxes = document.querySelectorAll('.service-checkbox:checked');
  if (checkedBoxes.length === 0) {
    showToast('Please select at least one service', 'warning');
    return;
  }
  
  const serviceIds = Array.from(checkedBoxes).map(cb => cb.value);
  
  if (!confirm(`Are you sure you want to delete ${serviceIds.length} service(s)? This action cannot be undone.`)) {
    return;
  }
  
  const btn = document.getElementById('bulk-delete-btn');
  setButtonLoading(btn, true);
  
  try {
    const deletePromises = serviceIds.map(id => api.delete(`/services/${id}/delete/`));
    await Promise.all(deletePromises);
    showToast(`${serviceIds.length} service(s) deleted successfully`, 'success');
    loadServices();
  } catch (e) {
    console.error('Bulk delete error:', e);
    showToast('Failed to delete some services', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function bulkUpdateServices(activate) {
  const checkedBoxes = document.querySelectorAll('.service-checkbox:checked');
  if (checkedBoxes.length === 0) {
    showToast('Please select at least one service', 'warning');
    return;
  }
  
  const serviceIds = Array.from(checkedBoxes).map(cb => cb.value);
  const action = activate ? 'activate' : 'deactivate';
  const message = activate ? 'This will make the service available for residents.' : 'Residents will no longer be able to book this service.';
  
  if (!confirm(`Are you sure you want to ${action} ${serviceIds.length} service(s)?\n\n${message}`)) {
    return;
  }
  
  const btnId = activate ? 'bulk-activate-btn' : 'bulk-deactivate-btn';
  const btn = document.getElementById(btnId);
  setButtonLoading(btn, true);
  
  try {
    const updatePromises = serviceIds.map(id => 
      api.put(`/services/${id}/update/`, { is_active: activate })
    );
    const results = await Promise.all(updatePromises);
    
    // Check if all updates were successful
    const allSuccess = results.every(r => r.ok);
    if (allSuccess) {
      showToast(`${serviceIds.length} service(s) ${action}d successfully`, 'success');
      loadServices();
    } else {
      showToast('Some services could not be updated', 'warning');
      loadServices();
    }
  } catch (e) {
    console.error('Bulk update error:', e);
    showToast(`Failed to ${action} some services`, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

// Audit Log
async function loadAuditLog() {
  const tbody = document.getElementById('audit-tbody');
  tbody.innerHTML = `
    <tr>
      <td colspan="4" class="text-center text-muted py-4">
        <div class="empty-state">
          <i class="fas fa-history empty-state-icon"></i>
          <h4>No Activity</h4>
          <p>System activity will be logged here</p>
        </div>
      </td>
    </tr>
  `;
  
  const fullTbody = document.getElementById('full-audit-tbody');
  fullTbody.innerHTML = tbody.innerHTML;
}

// Save Society
async function saveSociety() {
  const data = {
    name: document.getElementById('society-name').value,
    address: document.getElementById('society-address').value,
    city: document.getElementById('society-city').value,
    state: document.getElementById('society-state').value,
    wing_count: document.getElementById('society-wings').value,
    total_flats: document.getElementById('society-flats').value,
    plan_type: document.getElementById('society-plan').value
  };
  
  const societyId = document.getElementById('society-id')?.value;
  
  const btn = document.querySelector('#societyModal .btn-primary');
  setButtonLoading(btn, true);
  
  try {
    let res, result;
    
    if (societyId) {
      res = await api.put(`/auth/societies/${societyId}/`, data);
      result = await res.json();
      
      if (res.ok && result.success) {
        showToast('Society updated successfully', 'success');
      } else {
        showToast(result.message || 'Failed to update society', 'error');
      }
    } else {
      res = await api.post('/auth/societies/', data);
      result = await res.json();
      
      if (result.success) {
        showToast('Society created successfully', 'success');
      } else {
        showToast(result.message || 'Failed to create society', 'error');
      }
    }
    
    if (res.ok && result.success) {
      bootstrap.Modal.getInstance(document.getElementById('societyModal')).hide();
      document.getElementById('society-form').reset();
      document.getElementById('society-id')?.remove();
      loadSocieties();
    }
  } catch (e) {
    showToast('Error saving society', 'error');
  }
  
  setButtonLoading(btn, false);
}

// Reset society form when modal closes
document.getElementById('societyModal')?.addEventListener('hidden.bs.modal', function() {
  const idField = document.getElementById('society-id');
  if (idField) idField.remove();
  document.getElementById('society-form').reset();
  document.querySelector('#societyModal .modal-title').innerHTML = '<i class="fas fa-building me-2"></i>Add New Society';
  document.querySelector('#societyModal .btn-primary').innerHTML = '<i class="fas fa-save me-2"></i>Save Society';
});

// Approve User
async function approveUser(userId) {
  try {
    const res = await api.put(`/auth/users/${userId}/approve/`, { is_approved: true });
    const result = await res.json();
    
    if (result.success) {
      showToast('User approved', 'success');
      loadUsers();
    } else {
      showToast(result.message || 'Failed to approve', 'error');
    }
  } catch (e) {
    showToast('Error approving user', 'error');
  }
}

// Export functions to global scope
window.switchTab = switchTab;
window.loadProfile = loadProfile;
window.loadAISummary = loadAISummary;
window.loadSocieties = loadSocieties;
window.loadUsers = loadUsers;
window.saveUser = saveUser;
window.loadBylaws = loadBylaws;
window.uploadBylaw = uploadBylaw;
window.downloadBylaw = downloadBylaw;
window.loadServices = loadServices;
window.saveService = saveService;
window.editService = editService;
window.filterServices = filterServices;
window.clearServiceFilters = clearServiceFilters;
window.updateBulkActions = updateBulkActions;
window.bulkDeleteServices = bulkDeleteServices;
window.bulkUpdateServices = bulkUpdateServices;
window.saveSociety = saveSociety;
window.editSociety = editSociety;
window.approveUser = approveUser;

// ============================================
// Profile Management
// ============================================
async function loadProfile() {
  log('PROFILE', 'Loading profile...');
  
  try {
    // Fetch fresh profile data from API
    const res = await api.get('/auth/me/');
    const result = await res.json();
    
    let user = null;
    
    if (res.ok && result.success) {
      user = result.data;
      // Update localStorage with fresh data
      localStorage.setItem('panchayat_user', JSON.stringify(user));
    } else {
      // Fallback to cached data
      user = auth.getUser();
    }
    
    if (!user) {
      log('PROFILE', 'No user found');
      return;
    }
    
    log('PROFILE', 'User data:', user);
    
    // Get DOM elements
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const phoneEl = document.getElementById('profile-phone');
    const roleEl = document.getElementById('profile-role');
    const flatEl = document.getElementById('profile-flat');
    const wingEl = document.getElementById('profile-wing');
    const userAvatar = document.getElementById('profile-avatar');
    const roleBadge = document.getElementById('profile-role-badge');
    
    // Format full name
    const nameValue = user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.email || 'User';
    
    // Get avatar initial
    const avatarInitial = (user.full_name || user.first_name || user.last_name || user.username || user.email || 'U')[0].toUpperCase();
    
    // Format role for display
    const roleDisplay = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User';
    
    // Update DOM elements
    if (nameEl) nameEl.textContent = nameValue;
    if (emailEl) emailEl.textContent = user.email || 'N/A';
    if (phoneEl) phoneEl.textContent = user.phone || 'N/A';
    if (roleEl) roleEl.textContent = roleDisplay;
    if (flatEl) flatEl.textContent = user.flat_no || 'N/A';
    if (wingEl) wingEl.textContent = user.wing || 'N/A';
    if (userAvatar) userAvatar.textContent = avatarInitial;
    if (roleBadge) roleBadge.textContent = roleDisplay;
    
    log('PROFILE', 'Profile loaded successfully');
  } catch (e) {
    console.error('PROFILE', 'Error loading profile:', e);
    // Fallback to cached data
    const user = auth.getUser();
    if (user) {
      const nameEl = document.getElementById('profile-name');
      const emailEl = document.getElementById('profile-email');
      const phoneEl = document.getElementById('profile-phone');
      const userAvatar = document.getElementById('profile-avatar');
      
      const nameValue = user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.email || 'User';
      const avatarInitial = (user.full_name || user.first_name || user.last_name || user.username || user.email || 'U')[0].toUpperCase();
      
      if (nameEl) nameEl.textContent = nameValue;
      if (emailEl) emailEl.textContent = user.email || 'N/A';
      if (phoneEl) phoneEl.textContent = user.phone || 'N/A';
      if (userAvatar) userAvatar.textContent = avatarInitial;
    }
  }
}

// ============================================
// Change Password Form Handler
// ============================================
document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  log('PASSWORD', 'Change password form submitted');
  
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  
  // Client-side validation
  if (!currentPassword) {
    showToast('Please enter your current password', 'error');
    return;
  }
  
  if (!newPassword) {
    showToast('Please enter a new password', 'error');
    return;
  }
  
  if (newPassword.length < 8) {
    showToast('New password must be at least 8 characters long', 'error');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', 'error');
    return;
  }
  
  if (currentPassword === newPassword) {
    showToast('New password must be different from current password', 'error');
    return;
  }
  
  const btn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.post('/auth/change-password/', {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword
    });
    
    const result = await res.json();
    log('PASSWORD', 'Change password response:', result);
    
    if (res.ok && result.success) {
      showToast('Password changed successfully! Please log in again.', 'success');
      e.target.reset();
      
      // Close modal
      const modal = document.getElementById('changePasswordModal');
      if (modal) {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) bsModal.hide();
      }
      
      // Log out user after successful password change
      setTimeout(() => {
        auth.logout();
        window.location.href = '/login/';
      }, 2000);
    } else {
      showToast(result.message || result.error || 'Failed to change password', 'error');
    }
  } catch (e) {
    console.error('PASSWORD', 'Error:', e);
    showToast('Failed to change password. Please try again.', 'error');
  }
  
  setButtonLoading(btn, false);
});

// ============================================
// Initialize Profile on Tab Switch
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Override switchTab to load profile when profile tab is activated
  const originalSwitchTab = window.switchTab;
  window.switchTab = function(tabId) {
    originalSwitchTab(tabId);
    if (tabId === 'profile') {
      loadProfile();
    }
  };

  const activeTabLink = document.querySelector('.sidebar .nav-link.active');
  const activeTab = activeTabLink?.dataset?.tab || document.getElementById('tab-profile')?.classList.contains('active') && 'profile';
  if (activeTab === 'profile') {
    loadProfile();
  }
});
