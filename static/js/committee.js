// Committee Dashboard JavaScript

// Console logging helper
const DEBUG = true;
function log(section, message, data = null) {
  if (DEBUG) {
    console.log(`[COMMITTEE-${section}] ${message}`, data || '');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  if (!['admin', 'committee'].includes(localStorage.getItem('panchayat_role'))) {
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

  // Set default month
  const now = new Date();
  const monthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const monthInput = document.getElementById('maintenance-month');
  const duesMonthInput = document.getElementById('dues-month');
  if (monthInput) monthInput.value = monthStr;
  if (duesMonthInput) duesMonthInput.value = monthStr;

  loadDashboard();
  loadProfile();
  loadComplaints();
  loadNotices();
  loadMaintenance();
  loadDues();
  loadBookings();
});

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => {
    t.classList.add('d-none');
    t.classList.remove('active');
  });
  document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
  
  const target = document.getElementById('tab-' + tabId);
  if (target) {
    target.classList.remove('d-none');
    target.classList.add('active');
  }
  
  const activeLink = document.querySelector('.sidebar [data-tab="' + tabId + '"]');
  if (activeLink) {
    activeLink.classList.add('active');
  }
}

// Dashboard - AI Summary
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

async function loadDashboard() {
  loadAISummary();

  const [complaintsRes, duesRes, noticesRes] = await Promise.all([
    api.get('/complaints/'),
    api.get('/finance/dues/'),
    api.get('/notices/')
  ]);

  const complaints = (await complaintsRes.json()).results || [];
  const dues = (await duesRes.json()).results || [];
  const notices = (await noticesRes.json()).results || [];

  const today = new Date().toISOString().split('T')[0];
  const todayResolved = complaints.filter(c => c.status === 'resolved' && c.updated_at && c.updated_at.startsWith(today)).length;

  document.getElementById('stat-open').textContent = complaints.filter(c => c.status === 'open').length;
  document.getElementById('stat-resolved').textContent = todayResolved;
  document.getElementById('stat-pending-dues').textContent = dues.filter(d => !d.is_paid).length;
  document.getElementById('stat-notices').textContent = notices.length;
}

// Complaints
async function loadComplaints(status = '', priority = '', category = '') {
  let url = '/complaints/';
  const params = [];
  if (status) params.push(`status=${status}`);
  if (priority) params.push(`priority=${priority}`);
  if (category) params.push(`category=${category}`);
  if (params.length) url += '?' + params.join('&');

  const tbody = document.getElementById('complaints-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><div class="spinner"></div></td></tr>';

  try {
    const res = await api.get(url);
    const data = await res.json();
    const complaints = data.results || [];
    
    if (complaints.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No complaints found</td></tr>';
      return;
    }

    tbody.innerHTML = complaints.map(c => `
      <tr>
        <td>#${c.id}</td>
        <td>${c.flat_no || '-'}</td>
        <td>${c.title}</td>
        <td><span class="badge badge-secondary">${c.category}</span></td>
        <td><span class="badge badge-${c.priority}">${c.priority}</span></td>
        <td><span class="badge badge-${c.status === 'open' ? 'open' : c.status === 'resolved' ? 'resolved' : 'progress'}">${c.status}</span></td>
        <td>${c.assigned_to_name || '-'}</td>
        <td>${formatDate(c.created_at)}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Complaints load error:', e);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Failed to load complaints</td></tr>';
  }
}

document.getElementById('complaint-status')?.addEventListener('change', () => {
  loadComplaints(
    document.getElementById('complaint-status').value,
    document.getElementById('complaint-priority').value,
    document.getElementById('complaint-category').value
  );
});

// Notices
async function loadNotices() {
  const tbody = document.getElementById('notices-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/notices/');
    const data = await res.json();
    const notices = data.results || [];
    
    if (notices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4"><div class="empty-state"><i class="fas fa-bullhorn empty-state-icon"></i><h4>No Notices</h4><p>Post your first notice</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = notices.map(n => `
      <tr class="${n.is_pinned ? 'pinned-notice' : ''}">
        <td>${n.title}</td>
        <td>${(n.body || '').substring(0, 50)}...</td>
        <td>${n.is_pinned ? '<i class="fas fa-thumbtack text-warning"></i>' : '-'}</td>
        <td>${formatDate(n.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteNotice(${n.id})">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Failed to load notices</td></tr>';
  }
}

async function postNotice() {
  const data = {
    title: document.getElementById('notice-title').value,
    body: document.getElementById('notice-body').value,
    is_pinned: document.getElementById('notice-pinned').checked
  };

  const btn = document.querySelector('#noticeModal .btn-primary');
  setButtonLoading(btn, true);

  try {
    const res = await api.post('/notices/', data);
    const result = await res.json();
    if (result.success) {
      showToast('Notice posted', 'success');
      bootstrap.Modal.getInstance(document.getElementById('noticeModal')).hide();
      document.getElementById('notice-title').value = '';
      document.getElementById('notice-body').value = '';
      document.getElementById('notice-pinned').checked = false;
      loadNotices();
    } else {
      showToast(result.message || 'Failed to post notice', 'error');
    }
  } catch (e) {
    showToast('Error posting notice', 'error');
  }
  
  setButtonLoading(btn, false);
}

async function deleteNotice(id) {
  if (!confirm('Delete this notice?')) return;
  
  try {
    const res = await api.delete('/notices/' + id + '/');
    if (res.ok) {
      showToast('Notice deleted', 'success');
      loadNotices();
    }
  } catch (e) {
    showToast('Error deleting notice', 'error');
  }
}

// Maintenance
async function loadMaintenance() {
  const month = document.getElementById('maintenance-month')?.value;
  const tbody = document.getElementById('maintenance-tbody');
  tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/finance/maintenance/' + (month || '') + '/');
    const data = await res.json();

    if (data.success && data.data.breakdown.length > 0) {
      tbody.innerHTML = data.data.breakdown.map(b => `
        <tr><td>${b.category}</td><td>₹${b.amount.toLocaleString()}</td><td>-</td></tr>
      `).join('') + `<tr><td><strong>Total</strong></td><td><strong>₹${data.data.total.toLocaleString()}</strong></td><td></td></tr>`;

      const aiCard = document.getElementById('maintenance-ai');
      if (aiCard) {
        aiCard.style.display = 'block';
        document.getElementById('maintenance-ai-text').textContent = data.data.ai_summary;
      }
    } else {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-4">No maintenance data for this month</td></tr>';
    }
  } catch (e) {
    console.error('Maintenance load error:', e);
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger py-4">Failed to load maintenance data</td></tr>';
  }
}

document.getElementById('maintenance-month')?.addEventListener('change', loadMaintenance);

// Dues
async function loadDues() {
  const tbody = document.getElementById('dues-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/finance/dues/');
    const data = await res.json();
    const dues = data.results || [];
    
    if (dues.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No dues found</td></tr>';
      return;
    }

    tbody.innerHTML = dues.map(d => `
      <tr>
        <td>${d.flat_no || '-'}</td>
        <td>${d.resident_name}</td>
        <td>₹${d.amount}</td>
        <td>${d.is_paid ? '<span class="badge badge-success">Paid</span>' : '<span class="badge badge-danger">Unpaid</span>'}</td>
        <td>${d.paid_at ? formatDate(d.paid_at) : '-'}</td>
        <td>${d.payment_ref || '-'}</td>
        <td>${!d.is_paid ? `<button class="btn btn-sm btn-success" onclick="markPaid(${d.id})"><i class="fas fa-check"></i> Mark Paid</button>` : '-'}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Dues load error:', e);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Failed to load dues</td></tr>';
  }
}

document.getElementById('dues-month')?.addEventListener('change', loadDues);

async function markPaid(dueId) {
  const ref = prompt('Enter payment reference:');
  if (!ref) return;
  
  try {
    const res = await api.put('/finance/dues/' + dueId + '/mark-paid/', { payment_ref: ref });
    const result = await res.json();
    if (result.success) {
      showToast('Marked as paid', 'success');
      loadDues();
    } else {
      showToast(result.message || 'Failed to mark paid', 'error');
    }
  } catch (e) {
    showToast('Error marking as paid', 'error');
  }
}

// Bookings
async function loadBookings() {
  const tbody = document.getElementById('bookings-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/services/bookings/');
    const data = await res.json();
    const bookings = data.results || [];
    
    if (bookings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><div class="empty-state"><i class="fas fa-calendar empty-state-icon"></i><h4>No Bookings</h4><p>No service bookings yet</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = bookings.map(b => `
      <tr>
        <td>${b.service_name}</td>
        <td>${formatDate(b.slot_date)}</td>
        <td>${b.start_time} - ${b.end_time}</td>
        <td>${b.resident_name}</td>
        <td>${b.resident?.flat_no || '-'}</td>
        <td><span class="badge badge-${b.status === 'confirmed' ? 'success' : 'warning'}">${b.status}</span></td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Bookings load error:', e);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Failed to load bookings</td></tr>';
  }
}

// Export
window.switchTab = switchTab;
window.loadProfile = loadProfile;
window.loadAISummary = loadAISummary;
window.loadComplaints = loadComplaints;
window.loadNotices = loadNotices;
window.postNotice = postNotice;
window.deleteNotice = deleteNotice;
window.loadMaintenance = loadMaintenance;
window.loadDues = loadDues;
window.markPaid = markPaid;
window.loadBookings = loadBookings;

// ============================================
// Profile Management
// ============================================
async function loadProfile() {
  console.log('[COMMITTEE-PROFILE] Starting loadProfile...');
  
  try {
    // Fetch fresh profile data from API
    console.log('[COMMITTEE-PROFILE] Calling /auth/me/ API...');
    const res = await api.get('/auth/me/');
    console.log('[COMMITTEE-PROFILE] API Response status:', res.status);
    const result = await res.json();
    console.log('[COMMITTEE-PROFILE] API Response data:', result);
    
    let user = null;
    
    if (res.ok && result.success) {
      user = result.data;
      console.log('[COMMITTEE-PROFILE] Got user from API:', user);
      // Update localStorage with fresh data
      localStorage.setItem('panchayat_user', JSON.stringify(user));
    } else {
      // Fallback to cached data
      console.log('[COMMITTEE-PROFILE] API failed, using cached data');
      user = auth.getUser();
    }
    
    if (!user) {
      console.log('[COMMITTEE-PROFILE] No user found');
      return;
    }
    
    console.log('[COMMITTEE-PROFILE] User data:', user);
    
    // Get DOM elements
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const phoneEl = document.getElementById('profile-phone');
    const roleEl = document.getElementById('profile-role');
    const flatEl = document.getElementById('profile-flat');
    const wingEl = document.getElementById('profile-wing');
    const userAvatar = document.getElementById('profile-avatar');
    const roleBadge = document.getElementById('profile-role-badge');
    
    console.log('[COMMITTEE-PROFILE] DOM Elements found:', {
      nameEl: !!nameEl,
      emailEl: !!emailEl,
      phoneEl: !!phoneEl,
      roleEl: !!roleEl,
      flatEl: !!flatEl,
      wingEl: !!wingEl,
      userAvatar: !!userAvatar,
      roleBadge: !!roleBadge
    });
    
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
    
    console.log('[COMMITTEE-PROFILE] Profile loaded successfully');
  } catch (e) {
    console.error('[COMMITTEE-PROFILE] Error loading profile:', e);
    // Fallback to cached data
    const user = auth.getUser();
    console.log('[COMMITTEE-PROFILE] Fallback user:', user);
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
  const activeTab = activeTabLink?.dataset?.tab || (document.getElementById('tab-profile')?.classList.contains('active') ? 'profile' : null);
  if (activeTab === 'profile') {
    loadProfile();
  }
});
