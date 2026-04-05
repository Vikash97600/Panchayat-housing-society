// Committee Dashboard JavaScript

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
window.loadAISummary = loadAISummary;
window.loadComplaints = loadComplaints;
window.loadNotices = loadNotices;
window.postNotice = postNotice;
window.deleteNotice = deleteNotice;
window.loadMaintenance = loadMaintenance;
window.loadDues = loadDues;
window.markPaid = markPaid;
window.loadBookings = loadBookings;
