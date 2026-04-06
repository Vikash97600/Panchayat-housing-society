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
  
  // For demo, show seeded society
  setTimeout(() => {
    tbody.innerHTML = `
      <tr>
        <td>Mahindra Splendour</td>
        <td>Mumbai</td>
        <td>120</td>
        <td><span class="badge badge-primary">Premium</span></td>
        <td><span class="badge badge-success">Active</span></td>
        <td>
          <button class="btn btn-sm btn-outline-primary">
            <i class="fas fa-edit"></i> Edit
          </button>
        </td>
      </tr>
    `;
  }, 500);
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
          <button class="btn btn-sm btn-outline-primary">
            <i class="fas fa-download"></i>
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

// Services
async function loadServices() {
  const tbody = document.getElementById('services-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/services/');
    const data = await res.json();
    const services = data.results || [];
    
    if (services.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-4">
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
    
    tbody.innerHTML = services.map(s => `
      <tr>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="avatar avatar-sm" style="background: var(--brand-light); color: var(--brand-primary);">
              <i class="fas fa-tools"></i>
            </div>
            <strong>${s.name}</strong>
          </div>
        </td>
        <td>${s.vendor_name || '-'}</td>
        <td>${s.vendor_phone || '-'}</td>
        <td>₹${s.price_per_slot}</td>
        <td><span class="badge badge-${s.is_active ? 'success' : 'secondary'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="editService(${s.id})">
            <i class="fas fa-edit"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Services load error:', e);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Failed to load services</td></tr>';
  }
}

async function saveService() {
  const serviceId = document.getElementById('service-id')?.value;
  const data = {
    name: document.getElementById('service-name').value,
    description: document.getElementById('service-desc').value,
    vendor_name: document.getElementById('service-vendor').value,
    vendor_phone: document.getElementById('service-phone').value,
    price_per_slot: document.getElementById('service-price').value,
    is_active: document.getElementById('service-active').checked
  };
  
  const btn = document.querySelector('#serviceModal .btn-primary');
  setButtonLoading(btn, true);
  
  try {
    let res, result;
    
    if (serviceId) {
      // Update existing service
      res = await api.put(`/services/${serviceId}/update/`, data);
      result = await res.json();
      
      if (result.success) {
        showToast('Service updated successfully', 'success');
      } else {
        showToast(result.message || 'Failed to update service', 'error');
      }
    } else {
      // Create new service
      res = await api.post('/services/create/', data);
      result = await res.json();
      
      if (result.success) {
        showToast('Service created successfully', 'success');
      } else {
        showToast(result.message || 'Failed to create service', 'error');
      }
    }
    
    if (result.success) {
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
  try {
    const res = await api.get(`/services/${serviceId}/`);
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
  
  const btn = document.querySelector('#societyModal .btn-primary');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.post('/auth/societies/', data);
    const result = await res.json();
    
    if (result.success) {
      showToast('Society created successfully', 'success');
      bootstrap.Modal.getInstance(document.getElementById('societyModal')).hide();
      document.getElementById('society-form').reset();
      loadSocieties();
    } else {
      showToast(result.message || 'Failed to create society', 'error');
    }
  } catch (e) {
    showToast('Error creating society', 'error');
  }
  
  setButtonLoading(btn, false);
}

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
window.loadAISummary = loadAISummary;
window.loadSocieties = loadSocieties;
window.loadUsers = loadUsers;
window.saveUser = saveUser;
window.loadBylaws = loadBylaws;
window.uploadBylaw = uploadBylaw;
window.loadServices = loadServices;
window.saveService = saveService;
window.editService = editService;
window.saveSociety = saveSociety;
window.approveUser = approveUser;
