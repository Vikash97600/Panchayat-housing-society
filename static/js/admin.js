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
  loadAuditLog();

  document.getElementById('edit-profile-form')?.addEventListener('submit', saveProfile);
});

const adminState = {
  societiesCount: 0,
  usersCount: 0,
  isLoading: false,
  error: null,
};

function setAdminState(partial) {
  Object.assign(adminState, partial);
  renderAdminStats();
}

function renderAdminStats() {
  const dashboardSocietiesEl = document.getElementById('stat-societies');
  const dashboardUsersEl = document.getElementById('stat-users');
  const profileSocietiesEl = document.getElementById('profile-admin-societies');
  const profileUsersEl = document.getElementById('profile-admin-users');

  const displaySocieties = adminState.isLoading ? '...' : adminState.error ? '--' : adminState.societiesCount;
  const displayUsers = adminState.isLoading ? '...' : adminState.error ? '--' : adminState.usersCount;

  if (dashboardSocietiesEl) dashboardSocietiesEl.textContent = displaySocieties;
  if (dashboardUsersEl) dashboardUsersEl.textContent = displayUsers;
  if (profileSocietiesEl) profileSocietiesEl.textContent = displaySocieties;
  if (profileUsersEl) profileUsersEl.textContent = displayUsers;

  if (!adminState.isLoading && !adminState.error) {
    animateValue('stat-societies', 0, adminState.societiesCount, 500);
    animateValue('stat-users', 0, adminState.usersCount, 500);
    animateValue('profile-admin-societies', 0, adminState.societiesCount, 500);
    animateValue('profile-admin-users', 0, adminState.usersCount, 500);
  }
}

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
  setAdminState({ isLoading: true, error: null });

  try {
    const [usersRes, complaintsRes, duesRes, societiesRes] = await Promise.all([
      api.get('/auth/users/'),
      api.get('/complaints/'),
      api.get('/finance/dues/'),
      api.get('/auth/societies/')
    ]);

    if (!usersRes.ok) throw new Error('Failed to fetch users');
    if (!complaintsRes.ok) throw new Error('Failed to fetch complaints');
    if (!duesRes.ok) throw new Error('Failed to fetch dues');
    if (!societiesRes.ok) throw new Error('Failed to fetch societies');

    const usersData = await usersRes.json();
    const complaintsData = await complaintsRes.json();
    const duesData = await duesRes.json();
    const societiesData = await societiesRes.json();

    const users = usersData.results || usersData.data || [];
    const complaints = complaintsData.results || complaintsData.data || [];
    const dues = duesData.results || duesData.data || [];
    const societies = societiesData.data || societiesData.results || [];

    const userCount = Array.isArray(users) ? users.length : 0;
    const societyCount = Array.isArray(societies) ? societies.length : 0;

    // Update dashboard and profile stats
    animateValue('stat-complaints', 0, Array.isArray(complaints) ? complaints.filter(c => c.status === 'open').length : 0, 500);
    animateValue('stat-dues', 0, Array.isArray(dues) ? dues.filter(d => !d.is_paid).length : 0, 500);
    setAdminState({ societiesCount: societyCount, usersCount: userCount, isLoading: false, error: null });

  } catch (e) {
    console.error('Dashboard load error:', e);
    showToast('Failed to load dashboard data: ' + e.message, 'error');
    
    setAdminState({ isLoading: false, error: e.message || 'Failed to load stats' });
    document.getElementById('stat-complaints').textContent = '--';
    document.getElementById('stat-dues').textContent = '--';
  }
}

function updateProfileStats(societiesCount, usersCount) {
  const societiesEl = document.getElementById('profile-admin-societies');
  const usersEl = document.getElementById('profile-admin-users');
  
  if (societiesEl) {
    animateValue('profile-admin-societies', 0, societiesCount, 500);
  }
  if (usersEl) {
    animateValue('profile-admin-users', 0, usersCount, 500);
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
let _aiSummaryTimer = null;

async function loadAISummary(forceRefresh = false) {
  const content = document.getElementById('ai-summary-content');
  if (!content) return;

  // Only show spinner on first load, not on silent refresh
  if (!forceRefresh && content.querySelector('.spinner')) {
    content.innerHTML = '<div class="spinner"></div>';
  }
  
  try {
    const url = forceRefresh ? '/ai/summary/?refresh=true' : '/ai/summary/';
    const res = await api.get(url);
    const data = await res.json();
    
    if (data.success && data.data) {
      const d = data.data;
      const count = d.complaint_count || 0;
      const categories = d.today_categories || [];
      const generatedAt = d.generated_at ? new Date(d.generated_at).toLocaleTimeString() : '';

      let headlineHtml = '';
      if (count === 0) {
        headlineHtml = `
          <div style="display:inline-flex;align-items:center;gap:8px;background:#e8f5e9;color:#2e7d32;padding:10px 16px;border-radius:8px;font-weight:600;margin-bottom:12px;">
            <i class="fas fa-check-circle"></i>
            No complaints submitted today.
          </div>`;
      } else {
        const headline = d.headline || `${count} complaint${count !== 1 ? 's' : ''} submitted today related to ${categories.join(', ')}.`;
        const categoryBadges = categories.map(cat =>
          `<span style="display:inline-block;padding:2px 8px;background:rgba(255,255,255,0.25);border-radius:12px;font-size:12px;margin-right:2px;">${cat}</span>`
        ).join('');
        headlineHtml = `
          <div style="background:linear-gradient(135deg,#1a2744,#2d4a8a);color:#fff;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
            <div style="font-size:15px;font-weight:700;margin-bottom:6px;">
              <i class="fas fa-exclamation-circle me-2" style="color:#F9A825;"></i>${headline}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">${categoryBadges}</div>
          </div>`;
      }

      let narrativeHtml = '';
      if (d.summary && d.summary.trim()) {
        narrativeHtml = `<div style="font-size:13px;color:var(--text-secondary,#666);line-height:1.6;">${d.summary.replace(/\n/g, '<br>')}</div>`;
      }

      content.innerHTML = headlineHtml + narrativeHtml +
        `<small class="text-muted d-block mt-2">Updated at ${generatedAt}${data.cached ? ' · cached' : ''}</small>`;
    } else {
      content.innerHTML = '<p class="text-danger">No summary available</p>';
    }
  } catch (e) {
    content.innerHTML = '<p class="text-danger">Failed to load summary. Check your connection.</p>';
  }

  // Set up auto-refresh every 60s (cancel previous timer)
  clearTimeout(_aiSummaryTimer);
  _aiSummaryTimer = setTimeout(() => loadAISummary(false), 60000);
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
          <div class="btn-group" role="group">
            <button class="btn btn-sm btn-outline-primary" onclick="editSociety(${s.id})" data-society-id="${s.id}" title="Edit Society">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteSociety(${s.id}, '${s.name.replace(/'/g, "\\'")}')" data-society-id="${s.id}" title="Delete Society">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
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

async function deleteSociety(societyId, societyName) {
  if (!confirm(`Are you sure you want to permanently delete "${societyName}"?\n\nThis will also delete:\n- All committee members (Secretary, Treasurer)\n- All residents\n- All bylaws\n- All services and bookings\n- All notices\n- All complaints\n- All maintenance records\n\nThis action cannot be undone!`)) {
    return;
  }
  
  const btn = document.activeElement;
  const originalHtml = btn ? btn.innerHTML : '<i class="fas fa-trash"></i> Delete';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }
  
  try {
    const res = await api.delete(`/auth/societies/${societyId}/`);
    const result = await res.json();
    
    if (res.ok && result.success) {
      showToast(result.message || 'Society deleted successfully', 'success');
      loadSocieties();
    } else {
      showToast(result.message || 'Failed to delete society', 'error');
    }
  } catch (e) {
    console.error('[ADMIN] Error deleting society:', e);
    showToast('Error deleting society', 'error');
  }
  
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// Users
async function loadUsers(role = '') {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/auth/users/');
    const data = await res.json();
    const users = data.data || data.results || [];
    
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
              <small class="text-muted">${u.flat_no ? 'Flat ' + u.flat_no + (u.wing ? '/' + u.wing : '') : ''}</small>
            </div>
          </div>
        </td>
        <td>${u.email}</td>
        <td><span class="badge badge-${u.role === 'admin' ? 'danger' : u.role === 'secretary' || u.role === 'treasurer' ? 'warning' : u.role === 'committee' ? 'warning' : 'info'}">${u.role}</span></td>
        <td>${u.society_name || '-'}</td>
        <td>${u.flat_no ? u.flat_no + (u.wing ? '/' + u.wing : '') : '-'}</td>
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
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Failed to load users</td></tr>';
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
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  const societySelect = document.getElementById('bylaw-society');
  const selectedSociety = societySelect?.value;
  const queryParam = selectedSociety ? `?society_id=${selectedSociety}` : '';
  
  try {
    const res = await api.get('/bylaws/' + queryParam);
    const data = await res.json();
    const bylaws = data.results || data || [];
    
    if (!Array.isArray(bylaws) || bylaws.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-4">
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
    
    tbody.innerHTML = '';
    bylaws.forEach(b => {
      const tr = document.createElement('tr');
      tr.id = `bylaw-row-${b.id}`;
      tr.innerHTML = `
        <td>${b.title || '-'}</td>
        <td>${b.society_name || 'N/A'}</td>
        <td>v${b.version || '1.0'}</td>
        <td>${formatDate(b.uploaded_at)}</td>
        <td>
          <div class="btn-group" role="group">
            <button class="btn btn-sm btn-outline-primary bylaw-download-btn" data-id="${b.id}" title="Download PDF">
              <i class="fas fa-download me-1"></i>Download
            </button>
            <button class="btn btn-sm btn-danger bylaw-delete-btn" data-id="${b.id}" title="Delete Bylaw">
              <i class="fas fa-trash me-1"></i>Delete
            </button>
          </div>
        </td>
      `;
      // Safe event binding — no inline string injection
      tr.querySelector('.bylaw-download-btn').addEventListener('click', () => downloadBylaw(b.id, b.title));
      tr.querySelector('.bylaw-delete-btn').addEventListener('click', () => deleteBylaw(b.id, b.title));
      tbody.appendChild(tr);
    });

  } catch (e) {
    console.error('Bylaws load error:', e);
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Failed to load bylaws</td></tr>';
  }
}


async function uploadBylaw() {
  const file = document.getElementById('bylaw-file').files[0];
  if (!file) {
    showToast('Please select a PDF file', 'error');
    return;
  }
  
  const societySelect = document.getElementById('bylaw-society');
  const societyId = societySelect?.value;
  if (!societyId) {
    showToast('Please select a society', 'error');
    return;
  }
  
  const formData = new FormData();
  formData.append('title', document.getElementById('bylaw-title').value);
  formData.append('version', document.getElementById('bylaw-version').value);
  formData.append('pdf', file);
  formData.append('society_id', societyId);
  
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

async function deleteBylaw(bylawId, bylawTitle) {
  if (!confirm(`Are you sure you want to permanently delete the bylaw:\n\n"${bylawTitle}"\n\nThis action cannot be undone. The PDF file will be removed and you can upload a new one afterwards.`)) {
    return;
  }

  try {
    const res = await api.delete(`/bylaws/${bylawId}/delete/`);
    const result = await res.json();

    if (res.ok && result.success) {
      showToast(result.message || 'Bylaw deleted successfully', 'success');
      // Remove the row from the table immediately for a snappy UX
      const row = document.getElementById(`bylaw-row-${bylawId}`);
      if (row) {
        row.style.transition = 'opacity 0.3s ease';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 300);
      } else {
        loadBylaws();
      }
    } else {
      showToast(result.message || 'Failed to delete bylaw', 'error');
    }
  } catch (e) {
    console.error('Error deleting bylaw:', e);
    showToast('Error deleting bylaw', 'error');
  }
}


// Audit Log - Format details to readable sentence
function formatAuditDetails(log) {
  if (!log.details) return '-';
  
  let details;
  try {
    details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
  } catch (e) {
    return String(log.details);
  }
  
  const action = log.action;
  const safeDetails = (typeof details === 'object' && details !== null) ? details : {};
  
  const actionPatterns = {
    'user_registered': `New user registered with email ${safeDetails.email || 'unknown'}`,
    'user_login': `User logged in successfully`,
    'user_logout': `User logged out`,
    'user_approved': `User account was approved`,
    'user_updated': `User profile was updated`,
    'password_changed': `User changed their password`,
    'password_reset': `User reset their password`,
    'password_reset_requested': `Password reset requested`,
    'society_created': `New society "${safeDetails.name || ''}" was created`,
    'society_updated': `Society "${safeDetails.name || ''}" was updated`,
    'service_created': `New service was created`,
    'service_updated': `Service was updated`,
    'service_deleted': `Service was deleted`,
    'booking_created': `New booking was created`,
    'booking_cancelled': `Booking was cancelled`,
    'notice_created': `New notice was published`,
    'notice_updated': `Notice was updated`,
    'notice_deleted': `Notice was deleted`,
    'complaint_created': `New complaint was submitted`,
    'complaint_updated': `Complaint status was updated`,
    'complaint_deleted': `Complaint was deleted`,
    'note_added': `Note added to complaint`,
    'bylaw_uploaded': `Bylaw document was uploaded`,
    'due_marked_paid': `Due payment was marked as paid`,
  };
  
  if (actionPatterns[action]) {
    return actionPatterns[action];
  }
  
  // Fallback: format key-value pairs
  if (details && typeof details === 'object') {
    const parts = [];
    for (const [key, value] of Object.entries(details)) {
      if (key !== 'id' && key !== 'created_at' && value !== null && value !== undefined) {
        parts.push(`${key}: ${value}`);
      }
    }
    return parts.length > 0 ? parts.join(', ') : '-';
  }
  
  return String(details || '-');
}

// Audit Log
async function loadAuditLog() {
  const tbody = document.getElementById('audit-tbody');
  const fullTbody = document.getElementById('full-audit-tbody');
  
  const loadingHtml = `
    <tr>
      <td colspan="4" class="text-center text-muted py-4">
        <div class="spinner"></div>
        <p class="mt-2">Loading audit logs...</p>
      </td>
    </tr>
  `;
  
  tbody.innerHTML = loadingHtml;
  fullTbody.innerHTML = loadingHtml;
  
  try {
    const res = await api.get('/auth/audit-logs/');
    const data = await res.json();
    
    const logs = data.data || data.results || [];
    
    if (logs.length > 0) {
      const rows = logs.map(log => `
        <tr>
          <td>${formatDate(log.timestamp)}</td>
          <td>${log.user_name || 'System'}</td>
          <td><span class="badge badge-primary">${log.action}</span></td>
          <td>${formatAuditDetails(log)}</td>
        </tr>
      `).join('');
      
      tbody.innerHTML = rows;
      fullTbody.innerHTML = rows;
    } else {
      const emptyHtml = `
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
      tbody.innerHTML = emptyHtml;
      fullTbody.innerHTML = emptyHtml;
    }
  } catch (error) {
    console.error('Error loading audit logs:', error);
    const errorHtml = `
      <tr>
        <td colspan="4" class="text-center text-danger py-4">
          <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
          <p>Failed to load audit logs</p>
        </td>
      </tr>
    `;
    tbody.innerHTML = errorHtml;
    fullTbody.innerHTML = errorHtml;
  }
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

// Populate societies for bylaw upload
async function populateBylawSocieties() {
  try {
    const res = await api.get('/auth/societies/');
    const result = await res.json();
    const societies = result.data || [];
    
    const select = document.getElementById('bylaw-society');
    if (select) {
      select.innerHTML = '<option value="">-- Select Society --</option>' +
        societies.map(s => `<option value="${s.id}">${s.name} (${s.city})</option>`).join('');
    }
  } catch (e) {
    console.error('Error loading societies:', e);
  }
}

// Add event listener for bylaw modal
document.getElementById('bylawModal')?.addEventListener('shown.bs.modal', function() {
  populateBylawSocieties();
});

document.getElementById('bylaw-society')?.addEventListener('change', function() {
  loadBylaws();
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
window.deleteBylaw = deleteBylaw;
window.editProfile = editProfile;
window.saveProfile = saveProfile;
window.saveSociety = saveSociety;
window.editSociety = editSociety;
window.deleteSociety = deleteSociety;
window.approveUser = approveUser;
window.assignCommittee = assignCommittee;
window.exportSocietiesReport = exportSocietiesReport;
window.exportUsersReport = exportUsersReport;
window.exportAuditLogReport = exportAuditLogReport;

// ============================================
// Committee Management
// ============================================
async function loadCommitteeSocieties() {
  try {
    const res = await api.get('/auth/societies/');
    const result = await res.json();
    
    if (result.success && result.data) {
      const inactiveSocieties = result.data.filter(s => s.is_active === false);
      const select = document.getElementById('committee-society');
      select.innerHTML = '<option value="">-- Select Society --</option>' +
        inactiveSocieties.map(s => `<option value="${s.id}">${s.name} (${s.city})</option>`).join('');
    }
  } catch (e) {
    console.error('Error loading societies:', e);
  }
}

async function assignCommittee() {
  const data = {
    society_id: parseInt(document.getElementById('committee-society').value),
    secretary: {
      name: document.getElementById('secretary-name').value,
      email: document.getElementById('secretary-email').value,
      mobile: document.getElementById('secretary-mobile').value,
      password: document.getElementById('secretary-password').value
    },
    treasurer: {
      name: document.getElementById('treasurer-name').value,
      email: document.getElementById('treasurer-email').value,
      mobile: document.getElementById('treasurer-mobile').value,
      password: document.getElementById('treasurer-password').value
    }
  };
  
  if (!data.society_id) {
    showToast('Please select a society', 'error');
    return;
  }
  
  const btn = document.querySelector('#committee-form .btn-primary');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.post('/auth/committee/assign/', data);
    const result = await res.json();
    
    if (result.success) {
      showToast('Committee assigned successfully! Society is now active.', 'success');
      document.getElementById('committee-form').reset();
      loadSocieties();
      loadCommitteeSocieties();
    } else {
      showToast(result.message || 'Failed to assign committee', 'error');
    }
  } catch (e) {
    showToast('Error assigning committee', 'error');
  }
  
  setButtonLoading(btn, false);
}

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

async function editProfile() {
  try {
    const cachedUser = auth.getUser() || JSON.parse(localStorage.getItem('panchayat_user') || 'null');
    if (!cachedUser) {
      showToast('Unable to load profile for editing', 'error');
      return;
    }

    const nameInput = document.getElementById('edit-profile-name');
    const emailInput = document.getElementById('edit-profile-email');
    const phoneInput = document.getElementById('edit-profile-phone');

    if (nameInput) nameInput.value = cachedUser.full_name || [cachedUser.first_name, cachedUser.last_name].filter(Boolean).join(' ') || '';
    if (emailInput) emailInput.value = cachedUser.email || '';
    if (phoneInput) phoneInput.value = cachedUser.phone || '';

    const modalElement = document.getElementById('editProfileModal');
    if (!modalElement) {
      showToast('Edit profile modal is unavailable', 'error');
      return;
    }

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
  } catch (e) {
    console.error('PROFILE', 'Error opening edit profile form:', e);
    showToast('Failed to open edit profile form', 'error');
  }
}

async function saveProfile(event) {
  event.preventDefault();

  const email = document.getElementById('edit-profile-email')?.value.trim();
  const phone = document.getElementById('edit-profile-phone')?.value.trim();

  if (!email) {
    showToast('Email is required', 'error');
    return;
  }

  const payload = {
    email,
    phone: phone || null,
  };

  const btn = document.querySelector('#edit-profile-form button[type="submit"]');
  setButtonLoading(btn, true);

  try {
    const res = await api.patch('/auth/me/', payload);
    const result = await res.json();

    if (res.ok && result.success) {
      showToast('Profile updated successfully', 'success');
      localStorage.setItem('panchayat_user', JSON.stringify(result.data));
      loadProfile();
      const modalElement = document.getElementById('editProfileModal');
      const modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
      modal.hide();
    } else {
      const errorMessage = result.message || result.error || (result.errors ? Object.values(result.errors).flat().join(', ') : 'Failed to update profile');
      showToast(errorMessage, 'error');
    }
  } catch (e) {
    console.error('PROFILE', 'Error saving profile:', e);
    showToast('Error saving profile', 'error');
  } finally {
    setButtonLoading(btn, false);
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
    } else if (tabId === 'committee') {
      loadCommitteeSocieties();
    }
  };

  const activeTabLink = document.querySelector('.sidebar .nav-link.active');
  const activeTab = activeTabLink?.dataset?.tab || document.getElementById('tab-profile')?.classList.contains('active') && 'profile';
  if (activeTab === 'profile') {
    loadProfile();
  } else if (activeTab === 'committee') {
    loadCommitteeSocieties();
  }
});

// ============================================
// Export Functionality
// ============================================
function generateAdminReport(title, columns, rows) {
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const printWindow = window.open('', '_blank');
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title} - Admin Report</title>
      <style>
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #333;
          margin: 0;
          padding: 40px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #1a2744;
        }
        .header h1 {
          margin: 0;
          color: #1a2744;
          font-size: 28px;
        }
        .header p {
          margin: 5px 0 0;
          color: #666;
          font-size: 14px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        th, td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #f8f9fa;
          font-weight: 600;
          color: #1a2744;
        }
        tr:nth-child(even) {
          background-color: #fcfcfc;
        }
        .footer {
          margin-top: 50px;
          text-align: center;
          font-size: 12px;
          color: #888;
          border-top: 1px solid #eee;
          padding-top: 20px;
        }
        @media print {
          body { padding: 0; }
          button { display: none; }
          @page { margin: 1cm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Panchayat - System Admin</h1>
        <p>${title}</p>
        <p>Generated on: ${currentDate}</p>
      </div>
      
      <table>
        <thead>
          <tr>
            ${columns.map(col => `<th>${col}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              ${row.map(cell => `<td>${cell !== null && cell !== undefined ? cell : '-'}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="footer">
        <p>This is an automatically generated report from the Panchayat Admin System.</p>
      </div>
      
      <script>
        window.onload = function() {
          setTimeout(() => {
            window.print();
            window.onafterprint = function() { window.close(); };
          }, 500);
        };
      </script>
    </body>
    </html>
  `;
  
  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

async function exportSocietiesReport() {
  try {
    showToast('Preparing societies report...', 'info');
    const res = await api.get('/auth/societies/');
    const result = await res.json();
    const societies = result.data || [];
    
    if (societies.length === 0) {
      showToast('No societies to export', 'warning');
      return;
    }

    const columns = ['Society Name', 'City', 'State', 'Total Flats', 'Plan Type', 'Status'];
    const rows = societies.map(s => [
      s.name,
      s.city,
      s.state,
      s.total_flats,
      (s.plan_type || 'Standard').toUpperCase(),
      s.is_active ? 'Active' : 'Inactive'
    ]);

    generateAdminReport('Registered Societies Report', columns, rows);
  } catch (error) {
    console.error('Export error:', error);
    showToast('Failed to generate report', 'error');
  }
}

async function exportUsersReport() {
  try {
    showToast('Preparing users report...', 'info');
    const res = await api.get('/auth/users/');
    const result = await res.json();
    const users = result.data || result.results || [];
    
    if (users.length === 0) {
      showToast('No users to export', 'warning');
      return;
    }

    const columns = ['Name', 'Email', 'Role', 'Society', 'Flat No', 'Status'];
    const rows = users.map(u => [
      u.full_name || u.first_name || '-',
      u.email,
      (u.role || '-').toUpperCase(),
      u.society_name || '-',
      u.flat_no ? `${u.flat_no}${u.wing ? '/' + u.wing : ''}` : '-',
      u.is_approved ? 'Approved' : 'Pending'
    ]);

    generateAdminReport('System Users Report', columns, rows);
  } catch (error) {
    console.error('Export error:', error);
    showToast('Failed to generate report', 'error');
  }
}

async function exportAuditLogReport() {
  try {
    showToast('Preparing audit log report...', 'info');
    const res = await api.get('/auth/audit-logs/');
    const result = await res.json();
    const logs = result.data || result.results || [];
    
    if (logs.length === 0) {
      showToast('No audit logs to export', 'warning');
      return;
    }

    const columns = ['Timestamp', 'User', 'Action', 'Details'];
    const rows = logs.map(log => [
      formatDate(log.timestamp) + ' ' + formatTime(log.timestamp),
      log.user_name || 'System',
      log.action,
      formatAuditDetails(log)
    ]);

    generateAdminReport('System Audit Log', columns, rows);
  } catch (error) {
    console.error('Export error:', error);
    showToast('Failed to generate report', 'error');
  }
}

