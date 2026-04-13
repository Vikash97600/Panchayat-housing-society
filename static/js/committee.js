// Committee Dashboard JavaScript

// Console logging helper
const DEBUG = true;
function log(section, message, data = null) {
  if (DEBUG) {
    console.log(`[COMMITTEE-${section}] ${message}`, data || '');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[COMMITTEE] DOMContentLoaded fired');
  console.log('[COMMITTEE] requireAuth available:', typeof requireAuth);
  console.log('[COMMITTEE] auth.isAuthenticated:', typeof auth !== 'undefined' ? auth.isAuthenticated() : 'auth not defined');
  
  if (!requireAuth()) return;
  if (!['admin', 'committee'].includes(localStorage.getItem('panchayat_role'))) {
    window.location.href = '/login/';
    return;
  }

  console.log('[COMMITTEE] Auth check passed');

  // Tab navigation
  document.querySelectorAll('.sidebar .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.dataset.tab;
      console.log('[COMMITTEE] Nav link clicked, tabId:', tabId);
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
  console.log('[COMMITTEE] switchTab called with:', tabId);
  console.log('[COMMITTEE] Looking for element: tab-' + tabId);
  console.log('[COMMITTEE] Element found:', !!document.getElementById('tab-' + tabId));
  
  // Hide all tab contents
  const allTabs = document.querySelectorAll('.tab-content');
  console.log('[COMMITTEE] Found tab-content elements:', allTabs.length);
  allTabs.forEach(t => {
    t.classList.add('d-none');
    t.classList.remove('active');
  });
  
  // Remove active from all nav links
  const allNavLinks = document.querySelectorAll('.sidebar .nav-link');
  console.log('[COMMITTEE] Found nav-link elements:', allNavLinks.length);
  allNavLinks.forEach(l => l.classList.remove('active'));
  
  // Show target tab
  const target = document.getElementById('tab-' + tabId);
  if (target) {
    target.classList.remove('d-none');
    target.classList.add('active');
    console.log('[COMMITTEE] Target tab classes:', target.className);
  }
  
  // Activate nav link
  const activeLink = document.querySelector('.sidebar [data-tab="' + tabId + '"]');
  if (activeLink) {
    activeLink.classList.add('active');
    console.log('[COMMITTEE] Active link found');
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

  // Get today's date in local timezone
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  console.log('[DASHBOARD] Today date string:', todayStr);
  console.log('[DASHBOARD] Complaints sample:', complaints.slice(0, 3).map(c => ({ id: c.id, status: c.status, updated_at: c.updated_at })));

  // Count resolved today - check both updated_at and resolved_at
  const todayResolved = complaints.filter(c => {
    if (c.status !== 'resolved') return false;
    const updated = c.updated_at || c.resolved_at;
    if (!updated) return false;
    // Handle both formats: "2026-04-08T..." and "2026-04-08"
    return updated.startsWith(todayStr);
  }).length;

  console.log('[DASHBOARD] Today resolved count:', todayResolved);

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
  tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4"><div class="spinner"></div></td></tr>';

  try {
    const res = await api.get(url);
    const data = await res.json();
    const complaints = data.results || [];
    
    if (complaints.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No complaints found</td></tr>';
      return;
    }

    tbody.innerHTML = complaints.map(c => `
      <tr class="complaint-row" data-id="${c.id}">
        <td><button class="btn btn-sm btn-outline-primary toggle-details"><i class="fas fa-chevron-right"></i></button></td>
        <td>#${c.id}</td>
        <td>${c.flat_no || c.wing ? (c.wing ? c.wing + '-' : '') + (c.flat_no || '-') : '-'}</td>
        <td>${c.title}</td>
        <td><span class="badge badge-secondary">${c.category}</span></td>
        <td><span class="badge badge-${c.priority === 'urgent' ? 'danger' : c.priority === 'medium' ? 'warning' : 'info'}">${c.priority}</span></td>
        <td><span class="badge badge-${c.status === 'open' ? 'danger' : c.status === 'resolved' ? 'success' : 'warning'}">${c.status.replace('_', ' ')}</span></td>
        <td>${c.assigned_to_name || '-'}</td>
        <td>${formatDate(c.created_at)}</td>
      </tr>
      <tr class="complaint-details-row d-none">
        <td colspan="9" class="bg-light p-3">
          <div class="complaint-details" id="complaint-details-${c.id}">
            <div class="text-center"><div class="spinner"></div></div>
          </div>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.toggle-details').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        const detailsRow = row.nextElementSibling;
        const complaintId = row.dataset.id;
        
        detailsRow.classList.toggle('d-none');
        e.target.closest('button').classList.toggle('fa-rotate-90');
        
        if (!detailsRow.classList.contains('d-none')) {
          loadComplaintDetails(complaintId);
        }
      });
    });
  } catch (e) {
    console.error('Complaints load error:', e);
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger py-4">Failed to load complaints</td></tr>';
  }
}

document.getElementById('complaint-status')?.addEventListener('change', () => {
  loadComplaints(
    document.getElementById('complaint-status').value,
    document.getElementById('complaint-priority').value,
    document.getElementById('complaint-category').value
  );
});

document.getElementById('complaint-priority')?.addEventListener('change', () => {
  loadComplaints(
    document.getElementById('complaint-status').value,
    document.getElementById('complaint-priority').value,
    document.getElementById('complaint-category').value
  );
});

document.getElementById('complaint-category')?.addEventListener('change', () => {
  loadComplaints(
    document.getElementById('complaint-status').value,
    document.getElementById('complaint-priority').value,
    document.getElementById('complaint-category').value
  );
});

// Load complaint details for editing
async function loadComplaintDetails(complaintId) {
  const container = document.getElementById(`complaint-details-${complaintId}`);
  if (!container) return;

  try {
    const url = `/complaints/${complaintId}/`;
    console.log('[COMPLAINT] GET URL:', url);
    const res = await api.get(url);
    console.log('[COMPLAINT] GET response status:', res.status);
    const data = await res.json();
    console.log('[COMPLAINT] GET response data:', data);
    
    if (!data.id) {
      container.innerHTML = '<div class="text-danger">Failed to load details. ' + (data.message || '') + '</div>';
      return;
    }

    const c = data;
    const canEdit = c.can_edit !== false;
    console.log('[COMPLAINT] can_edit:', c.can_edit, 'canEdit:', canEdit);
    
    container.innerHTML = `
      <div class="row">
        <div class="col-md-8">
          <h6 class="fw-bold">Description</h6>
          <p class="text-muted">${c.description || 'No description'}</p>
          
          ${c.ai_transcript ? `
          <h6 class="fw-bold mt-3">Voice Transcript</h6>
          <p class="text-muted">${c.ai_transcript}</p>
          ` : ''}
          
          ${c.audio_file_path ? `
          <h6 class="fw-bold mt-3">Voice Complaint</h6>
          <audio controls class="w-100">
            <source src="${c.audio_file_path}" type="audio/mpeg">
            Your browser does not support audio.
          </audio>
          ` : ''}
          
          <h6 class="fw-bold mt-3">Notes</h6>
          <div id="complaint-notes-${c.id}" class="mb-2">
            ${c.notes && c.notes.length > 0 ? c.notes.map(n => `
              <div class="border rounded p-2 mb-2">
                <small class="text-muted">${n.author_name} - ${new Date(n.created_at).toLocaleString()}</small>
                <p class="mb-0">${n.note}</p>
              </div>
            `).join('') : '<small class="text-muted">No notes yet</small>'}
          </div>
          ${canEdit ? `
          <div class="input-group mb-3">
            <input type="text" class="form-control" id="note-input-${c.id}" placeholder="Add internal note...">
            <button class="btn btn-outline-primary" id="add-note-btn-${c.id}" data-id="${c.id}">Add Note</button>
          </div>
          ` : ''}
        </div>
        <div class="col-md-4">
          <h6 class="fw-bold">Actions</h6>
          ${canEdit ? `
          <div class="mb-3">
            <label class="form-label small">Status</label>
            <select class="form-select" id="status-${c.id}" onchange="updateComplaint(${c.id})">
              <option value="open" ${c.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="in_progress" ${c.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
              <option value="resolved" ${c.status === 'resolved' ? 'selected' : ''}>Resolved</option>
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label small">Assign To</label>
            <select class="form-select" id="assignee-${c.id}" onchange="updateComplaint(${c.id})">
              <option value="">-- Unassigned --</option>
            </select>
          </div>
          <button class="btn btn-primary btn-sm w-100" onclick="updateComplaint(${c.id})">
            <i class="fas fa-save me-1"></i> Save Changes
          </button>
          ` : '<p class="text-muted small">You can view but not edit this complaint.</p>'}
        </div>
      </div>
    `;

    if (canEdit) {
      loadAssignees(c.id, c.assigned_to);
    }
  } catch (e) {
    console.error('Error loading complaint details:', e);
    container.innerHTML = '<div class="text-danger">Failed to load details</div>';
  }
}

// Load available assignees
async function loadAssignees(complaintId, currentAssigneeId) {
  const select = document.getElementById(`assignee-${complaintId}`);
  if (!select) return;

  try {
    const res = await api.get('/auth/users/');
    const data = await res.json();
    
    console.log('[COMPLAINT] Users response:', data);
    
    if (data.results) {
      const users = data.results.filter(u => u.role === 'committee' || u.role === 'admin');
      console.log('[COMPLAINT] Filtered users:', users);
      
      select.innerHTML = '<option value="">-- Unassigned --</option>' + 
        users.map(u => `<option value="${u.id}" ${u.id == currentAssigneeId ? 'selected' : ''}>${u.full_name || u.email}</option>`).join('');
    }
  } catch (e) {
    console.error('Error loading assignees:', e);
  }
}

// Update complaint (status, assignee)
async function updateComplaint(complaintId) {
  const statusSelect = document.getElementById(`status-${complaintId}`);
  const assigneeSelect = document.getElementById(`assignee-${complaintId}`);
  
  if (!statusSelect) {
    showToast('Status element not found', 'error');
    return;
  }
  
  const status = statusSelect?.value;
  const assignee = assigneeSelect?.value;

  console.log('[COMPLAINT] Updating complaint:', complaintId, 'status:', status, 'assignee:', assignee);

  try {
    const res = await api.patch(`/complaints/${complaintId}/`, {
      status: status,
      assigned_to: assignee || null
    });
    console.log('[COMPLAINT] PATCH response status:', res.status);
    const data = await res.json();
    console.log('[COMPLAINT] PATCH response data:', data);
    
    if (res.ok && data.success) {
      showToast('Complaint updated successfully', 'success');
      // Refresh the complaints list
      loadComplaints(
        document.getElementById('complaint-status').value,
        document.getElementById('complaint-priority').value,
        document.getElementById('complaint-category').value
      );
    } else {
      showToast(data.message || 'Failed to update complaint', 'error');
    }
  } catch (e) {
    console.error('Error updating complaint:', e);
    showToast('Failed to update complaint: ' + e.message, 'error');
  }
}

// Add note to complaint
async function addComplaintNote(complaintId) {
  console.log('[NOTES] addComplaintNote called with ID:', complaintId, 'Type:', typeof complaintId);
  
  complaintId = parseInt(complaintId);
  console.log('[NOTES] Parsed ID:', complaintId, 'IsNaN:', isNaN(complaintId));
  
  if (!complaintId || isNaN(complaintId)) {
    showToast('Invalid complaint ID', 'error');
    return;
  }
  
  const input = document.getElementById(`note-input-${complaintId}`);
  console.log('[NOTES] Input element found:', !!input);
  
  if (!input) {
    console.error('[NOTES] Input element not found for ID:', `note-input-${complaintId}`);
    showToast('Input field not found', 'error');
    return;
  }
  
  const note = input.value.trim();
  console.log('[NOTES] Note value:', note);
  
  if (!note) {
    showToast('Please enter a note', 'error');
    return;
  }

  console.log('[NOTES] Adding note to complaint ID:', complaintId);

  const btn = input.nextElementSibling;
  const originalBtnText = btn ? btn.innerHTML : '';
  if (btn) btn.disabled = true;

  try {
    const url = `/complaints/${complaintId}/notes/`;
    console.log('[NOTES] Full URL:', window.location.origin + '/api' + url);
    console.log('[NOTES] Request body:', JSON.stringify({ note: note }));
    
    const res = await api.post(url, { note: note });
    console.log('[NOTES] Response status:', res.status);
    
    const responseText = await res.text();
    console.log('[NOTES] Response text:', responseText);
    
    if (!res.ok) {
      console.error('[NOTES] Error response:', responseText);
      try {
        const errorData = JSON.parse(responseText);
        showToast(errorData.message || 'Server error: ' + res.status, 'error');
      } catch {
        showToast('Server error: ' + res.status + ' - ' + responseText, 'error');
      }
      return;
    }
    
    const data = JSON.parse(responseText);
    console.log('[NOTES] Response data:', data);
    
    if (data.success) {
      showToast('Note added successfully', 'success');
      input.value = '';
      loadComplaintDetails(complaintId);
    } else {
      showToast(data.message || 'Failed to add note', 'error');
    }
  } catch (e) {
    console.error('[NOTES] Exception:', e.name, e.message, e.stack);
    showToast('Failed to add note: ' + e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Make function globally available
window.addComplaintNote = addComplaintNote;

// Notices
async function loadNotices() {
  const tbody = document.getElementById('notices-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    const res = await api.get('/notices/');
    const data = await res.json();
    const notices = data.results || [];
    
    console.log('[NOTICES] Loaded:', notices.length);
    
    if (notices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><div class="empty-state"><i class="fas fa-bullhorn empty-state-icon"></i><h4>No Notices</h4><p>Post your first notice</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = notices.map(n => `
      <tr class="${n.is_pinned ? 'pinned-notice' : ''}">
        <td>
          <button class="btn btn-sm btn-outline-primary toggle-notice" onclick="toggleNoticeBody(${n.id})">
            <i class="fas fa-chevron-right" id="toggle-icon-${n.id}"></i>
          </button>
        </td>
        <td>${n.title}</td>
        <td>
          <div id="notice-body-${n.id}" class="notice-body collapsed">
            ${n.body}
          </div>
        </td>
        <td>${n.is_pinned ? '<span class="badge bg-warning"><i class="fas fa-thumbtack me-1"></i>Pinned</span>' : '-'}</td>
        <td>${n.expires_at ? '<span class="badge ' + (new Date(n.expires_at) < new Date() ? 'bg-danger' : 'bg-info') + '">' + formatDate(n.expires_at) + '</span>' : '<span class="text-muted">No expiry</span>'}</td>
        <td>${formatDate(n.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-primary me-1" onclick="openEditNoticeModal(${n.id}, '${n.title.replace(/'/g, "\\'")}', '${n.body.replace(/'/g, "\\'").replace(/\n/g, "\\n")}', ${n.is_pinned}, '${n.expires_at || ''}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteNotice(${n.id})">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('[NOTICES] Error:', e);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Failed to load notices</td></tr>';
  }
}

// Toggle notice body expand/collapse
function toggleNoticeBody(noticeId) {
  const bodyEl = document.getElementById(`notice-body-${noticeId}`);
  const iconEl = document.getElementById(`toggle-icon-${noticeId}`);
  
  if (bodyEl && iconEl) {
    bodyEl.classList.toggle('collapsed');
    iconEl.classList.toggle('fa-rotate-90');
  }
}

async function postNotice() {
  console.log('[NOTICE] postNotice called');
  const title = document.getElementById('notice-title').value.trim();
  const body = document.getElementById('notice-body').value.trim();
  const isPinned = document.getElementById('notice-pinned').checked;
  const expiresAtInput = document.getElementById('notice-expires').value;
  
  console.log('[NOTICE] Form values - title:', title, 'body:', body, 'isPinned:', isPinned, 'expiresAt:', expiresAtInput);
  
  if (!title) {
    showToast('Please enter a title', 'error');
    return;
  }
  if (!body) {
    showToast('Please enter the notice body', 'error');
    return;
  }
  
  const data = {
    title: title,
    body: body,
    is_pinned: isPinned
  };
  
  // Convert datetime-local to ISO format for Django
  if (expiresAtInput) {
    const date = new Date(expiresAtInput);
    data.expires_at = date.toISOString();
  }

  console.log('[NOTICE] Posting notice:', data);
  
  const btn = document.querySelector('#noticeModal .btn-primary');
  console.log('[NOTICE] Post button found:', !!btn);
  if (btn) setButtonLoading(btn, true);

  try {
    console.log('[NOTICE] Making API call to /notices/create/');
    const res = await api.post('/notices/create/', data);
    console.log('[NOTICE] API response status:', res.status);
    const result = await res.json();
    console.log('[NOTICE] Response:', result);
    
    if (result.success) {
      showToast('Notice posted successfully', 'success');
      bootstrap.Modal.getInstance(document.getElementById('noticeModal')).hide();
      document.getElementById('notice-title').value = '';
      document.getElementById('notice-body').value = '';
      document.getElementById('notice-pinned').checked = false;
      document.getElementById('notice-expires').value = '';
      loadNotices();
    } else {
      showToast(result.message || 'Failed to post notice', 'error');
    }
  } catch (e) {
    console.error('[NOTICE] Error:', e);
    showToast('Error posting notice', 'error');
  }
  
  if (btn) setButtonLoading(btn, false);
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

function openEditNoticeModal(id, title, body, isPinned, expiresAt) {
  document.getElementById('edit-notice-id').value = id;
  document.getElementById('edit-notice-title').value = title;
  document.getElementById('edit-notice-body').value = body;
  document.getElementById('edit-notice-pinned').checked = isPinned;
  document.getElementById('edit-notice-expires').value = expiresAt ? expiresAt.slice(0, 16) : '';
  
  const modal = new bootstrap.Modal(document.getElementById('editNoticeModal'));
  modal.show();
}

async function updateNotice() {
  const id = document.getElementById('edit-notice-id').value;
  const title = document.getElementById('edit-notice-title').value.trim();
  const body = document.getElementById('edit-notice-body').value.trim();
  const isPinned = document.getElementById('edit-notice-pinned').checked;
  const expiresAtInput = document.getElementById('edit-notice-expires').value;
  
  if (!title) {
    showToast('Please enter a title', 'error');
    return;
  }
  if (!body) {
    showToast('Please enter the notice body', 'error');
    return;
  }
  
  const data = {
    title: title,
    body: body,
    is_pinned: isPinned
  };
  
  if (expiresAtInput) {
    const date = new Date(expiresAtInput);
    data.expires_at = date.toISOString();
  }
  
  console.log('[NOTICE] Updating notice:', id, data);
  
  const btn = document.querySelector('#editNoticeModal .btn-primary');
  if (btn) setButtonLoading(btn, true);

  try {
    const res = await api.put('/notices/' + id + '/update/', data);
    const result = await res.json();
    console.log('[NOTICE] Update response:', result);
    
    if (result.id || res.ok) {
      showToast('Notice updated successfully', 'success');
      bootstrap.Modal.getInstance(document.getElementById('editNoticeModal')).hide();
      loadNotices();
    } else {
      showToast(result.message || 'Failed to update notice', 'error');
    }
  } catch (e) {
    console.error('[NOTICE] Update error:', e);
    showToast('Error updating notice', 'error');
  }
  
  if (btn) setButtonLoading(btn, false);
}

// Maintenance
async function loadMaintenance() {
  const month = document.getElementById('maintenance-month')?.value;
  const tbody = document.getElementById('maintenance-tbody');
  
  if (!month) {
    tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-4">Please select a month first</td></tr>';
    return;
  }
  
  tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  // Clear inputs first
  const inputIds = ['maintenance-staff-salaries', 'maintenance-lift-amc', 'maintenance-generator-fuel', 'maintenance-water-charges', 'maintenance-sinking-fund', 'maintenance-garden'];
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  try {
    const res = await api.get('/finance/maintenance/' + month + '/');
    const data = await res.json();
    console.log('[MAINTENANCE] Load response:', data);

    if (data.success && data.data && data.data.breakdown && data.data.breakdown.length > 0) {
      const breakdownMap = {};
      data.data.breakdown.forEach(b => {
        breakdownMap[b.category] = b.amount;
      });
      
      const categoryToInput = {
        'Staff Salaries': 'maintenance-staff-salaries',
        'Lift AMC': 'maintenance-lift-amc',
        'Generator Fuel': 'maintenance-generator-fuel',
        'Water Charges': 'maintenance-water-charges',
        'Sinking Fund': 'maintenance-sinking-fund',
        'Garden': 'maintenance-garden'
      };
      
      Object.keys(categoryToInput).forEach(cat => {
        const inputId = categoryToInput[cat];
        const el = document.getElementById(inputId);
        if (el && breakdownMap[cat] !== undefined) {
          el.value = breakdownMap[cat];
        }
      });
      
      tbody.innerHTML = data.data.breakdown.map(b => `
        <tr><td>${b.category}</td><td>₹${b.amount.toLocaleString()}</td></tr>
      `).join('') + `<tr><td><strong>Total</strong></td><td><strong>₹${data.data.total.toLocaleString()}</strong></td></tr>`;

      const aiCard = document.getElementById('maintenance-ai');
      if (aiCard && data.data.ai_summary) {
        aiCard.style.display = 'block';
        document.getElementById('maintenance-ai-text').textContent = data.data.ai_summary;
      }
    } else {
      tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-4">No maintenance data for this month</td></tr>';
    }
  } catch (e) {
    console.error('Maintenance load error:', e);
    tbody.innerHTML = '<tr><td colspan="2" class="text-center text-danger py-4">Failed to load maintenance data</td></tr>';
  }
}

document.getElementById('maintenance-month')?.addEventListener('change', loadMaintenance);

document.getElementById('maintenance-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const month = document.getElementById('maintenance-month')?.value;
  if (!month) {
    showToast('Please select a month first', 'error');
    return;
  }
  
  const data = {
    month: month,
    staff_salaries: parseFloat(document.getElementById('maintenance-staff-salaries')?.value) || 0,
    lift_amc: parseFloat(document.getElementById('maintenance-lift-amc')?.value) || 0,
    generator_fuel: parseFloat(document.getElementById('maintenance-generator-fuel')?.value) || 0,
    water_charges: parseFloat(document.getElementById('maintenance-water-charges')?.value) || 0,
    sinking_fund: parseFloat(document.getElementById('maintenance-sinking-fund')?.value) || 0,
    garden: parseFloat(document.getElementById('maintenance-garden')?.value) || 0
  };
  
  const btn = document.getElementById('save-maintenance-btn');
  if (btn) setButtonLoading(btn, true);
  
  try {
    const res = await api.post('/finance/maintenance/save/', data);
    const result = await res.json();
    
    if (result.success) {
      showToast(result.message || 'Maintenance saved successfully', 'success');
      loadMaintenance();
    } else {
      showToast(result.message || 'Failed to save maintenance', 'error');
    }
  } catch (e) {
    console.error('Maintenance save error:', e);
    showToast('Error saving maintenance: ' + e.message, 'error');
  }
  
  if (btn) setButtonLoading(btn, false);
});

// Dues
async function loadDues() {
  const month = document.getElementById('dues-month')?.value;
  const tbody = document.getElementById('dues-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  try {
    let url = '/finance/dues/';
    if (month) {
      url += '?month=' + month;
    }
    const res = await api.get(url);
    const data = await res.json();
    const dues = data.results || [];
    
    if (dues.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No dues found for selected month</td></tr>';
      return;
    }

    tbody.innerHTML = dues.map(d => `
      <tr>
        <td>${d.month ? new Date(d.month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-'}</td>
        <td>${d.flat_no || '-'}</td>
        <td>${d.resident_name || '-'}</td>
        <td>₹${d.amount}</td>
        <td>${d.is_paid ? '<span class="badge badge-success">Paid</span>' : '<span class="badge badge-danger">Unpaid</span>'}</td>
        <td>${d.paid_at ? formatDate(d.paid_at) : '-'}</td>
        <td>${d.payment_ref || '-'}</td>
        <td>${!d.is_paid ? `<button class="btn btn-sm btn-success" onclick="markPaid(${d.id})"><i class="fas fa-check"></i> Mark Paid</button>` : '-'}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Dues load error:', e);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Failed to load dues</td></tr>';
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
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><div class="spinner"></div></td></tr>';
  
  // Build query params
  const serviceFilter = document.getElementById('booking-service-filter')?.value;
  const dateFilter = document.getElementById('booking-date-filter')?.value;
  
  let url = '/services/bookings/';
  const params = [];
  if (serviceFilter) params.push(`service=${serviceFilter}`);
  if (dateFilter) params.push(`date=${dateFilter}`);
  if (params.length) url += '?' + params.join('&');
  
  // Load services for filter dropdown if not loaded
  const serviceSelect = document.getElementById('booking-service-filter');
  if (serviceSelect && serviceSelect.options.length <= 1) {
    try {
      const servicesRes = await api.get('/services/');
      const servicesData = await servicesRes.json();
      const services = servicesData.results || [];
      services.forEach(s => {
        const option = document.createElement('option');
        option.value = s.id;
        option.textContent = s.name;
        serviceSelect.appendChild(option);
      });
    } catch (e) {
      console.error('Failed to load services:', e);
    }
  }
  
  try {
    const res = await api.get(url);
    const data = await res.json();
    console.log('[BOOKINGS] Load response:', data);
    const bookings = data.results || [];
    
    if (bookings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No bookings found</td></tr>';
      return;
    }

    const statusBadgeClass = {
      'pending': 'warning',
      'confirmed': 'primary',
      'informed': 'info',
      'completed': 'success',
      'cancelled': 'danger'
    };

    tbody.innerHTML = bookings.map(b => `
      <tr>
        <td>${b.service_name}</td>
        <td>${b.slot_date}</td>
        <td>${b.start_time} - ${b.end_time}</td>
        <td>${b.resident_name || '-'}</td>
        <td>${b.resident_wing ? b.resident_wing + '-' : ''}${b.resident_flat || '-'}</td>
        <td>${b.resident_phone ? `<a href="tel:${b.resident_phone}" class="btn btn-sm btn-outline-primary"><i class="fas fa-phone"></i> ${b.resident_phone}</a>` : '-'}</td>
        <td><span class="badge bg-${statusBadgeClass[b.status] || 'secondary'}">${b.status}</span></td>
        <td>
          ${b.status === 'confirmed' ? `<button class="btn btn-sm btn-info" onclick="updateBookingStatus(${b.id}, 'informed')"><i class="fas fa-bell"></i> Inform</button>` : ''}
          ${b.status === 'informed' ? `<button class="btn btn-sm btn-success" onclick="updateBookingStatus(${b.id}, 'completed')"><i class="fas fa-check"></i> Complete</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Bookings load error:', e);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Failed to load bookings</td></tr>';
  }
}

async function updateBookingStatus(bookingId, newStatus) {
  try {
    const res = await api.patch(`/services/bookings/${bookingId}/`, { status: newStatus });
    const result = await res.json();
    if (result.success) {
      showToast('Booking status updated', 'success');
      loadBookings();
    } else {
      showToast(result.message || 'Failed to update status', 'error');
    }
  } catch (e) {
    console.error('Status update error:', e);
    showToast('Error updating status', 'error');
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
window.openEditNoticeModal = openEditNoticeModal;
window.updateNotice = updateNotice;
window.loadMaintenance = loadMaintenance;
window.loadDues = loadDues;
window.markPaid = markPaid;
window.loadBookings = loadBookings;
window.updateBookingStatus = updateBookingStatus;
window.loadComplaintDetails = loadComplaintDetails;
window.updateComplaint = updateComplaint;
window.addComplaintNote = addComplaintNote;
window.loadAssignees = loadAssignees;

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
    if (tabId === 'chat') {
      if (typeof initChat === 'function') {
        initChat();
      }
    }
    // Stop chat polling when leaving chat tab
    if (tabId !== 'chat' && typeof stopPolling === 'function') {
      stopPolling();
    }
  };

  const activeTabLink = document.querySelector('.sidebar .nav-link.active');
  const activeTab = activeTabLink?.dataset?.tab || (document.getElementById('tab-profile')?.classList.contains('active') ? 'profile' : (document.getElementById('tab-chat')?.classList.contains('active') ? 'chat' : null));
  if (activeTab === 'profile') {
    loadProfile();
  }
  if (activeTab === 'chat' && typeof initChat === 'function') {
    initChat();
  }
});

// Toggle notice body expand/collapse
window.toggleNoticeBody = function(noticeId) {
  const bodyEl = document.getElementById(`notice-body-${noticeId}`);
  const iconEl = document.getElementById(`toggle-icon-${noticeId}`);
  
  if (bodyEl && iconEl) {
    bodyEl.classList.toggle('collapsed');
    iconEl.classList.toggle('fa-rotate-90');
  }
};

// Event delegation for complaint note buttons
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[id^="add-note-btn-"]');
  if (btn) {
    const complaintId = parseInt(btn.dataset.id);
    console.log('[NOTES] Button clicked, complaint ID:', complaintId);
    addComplaintNote(complaintId);
  }
});
