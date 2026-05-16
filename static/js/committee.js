// Committee Dashboard JavaScript

// Console logging helper
const DEBUG = true;
function log(section, message, data = null) {
  if (DEBUG) {
    console.log(`[COMMITTEE-${section}] ${message}`, data || '');
  }
}

const committeeState = {
  complaints: [],
  notices: [],
  quickStats: {
    openTickets: 0,
    resolvedTickets: 0,
  },
  upcomingMeetingText: 'No meetings scheduled',
  loading: {
    dashboard: false,
    notices: false,
  },
  errors: {
    dashboard: null,
    notices: null,
  }
};

function setCommitteeState(changes) {
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'quickStats' && typeof value === 'object') {
      committeeState.quickStats = {
        ...committeeState.quickStats,
        ...value
      };
      continue;
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof committeeState[key] === 'object') {
      committeeState[key] = {
        ...committeeState[key],
        ...value
      };
      continue;
    }

    committeeState[key] = value;
  }

  renderCommitteeProfile();
}

function renderCommitteeStats() {
  const openTicketsEl = document.getElementById('profile-tickets-open');
  const resolvedTicketsEl = document.getElementById('profile-tickets-resolved');
  const openValue = Number.isFinite(committeeState.quickStats.openTickets) ? committeeState.quickStats.openTickets : '--';
  const resolvedValue = Number.isFinite(committeeState.quickStats.resolvedTickets) ? committeeState.quickStats.resolvedTickets : '--';

  if (openTicketsEl) openTicketsEl.textContent = openValue;
  if (resolvedTicketsEl) resolvedTicketsEl.textContent = resolvedValue;
}

function deriveUpcomingMeetingText(notices) {
  if (!Array.isArray(notices) || notices.length === 0) {
    return 'No meetings scheduled';
  }

  const normalized = notices.map(n => ({
    ...n,
    matchText: `${n.title || ''} ${n.body || ''}`.toLowerCase()
  }));

  const meetingNotice = normalized.find(n => /\b(meeting|agm|general meeting|committee meeting|notice of meeting|board meeting)\b/.test(n.matchText));
  if (meetingNotice) {
    const when = meetingNotice.expires_at ? ` on ${formatDate(meetingNotice.expires_at)}` : '';
    return `Next meeting: ${meetingNotice.title}${when}`;
  }

  const futureNotice = normalized
    .filter(n => n.expires_at && new Date(n.expires_at) > new Date())
    .sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at))[0];

  if (futureNotice) {
    return `Upcoming notice: ${futureNotice.title} expires on ${formatDate(futureNotice.expires_at)}`;
  }

  const pinnedNotice = normalized.find(n => n.is_pinned);
  if (pinnedNotice) {
    return `Pinned notice: ${pinnedNotice.title}`;
  }

  return `Latest update: ${normalized[0].title}`;
}

function renderCommitteeUpcoming() {
  const upcomingEl = document.getElementById('profile-next-meeting');
  if (!upcomingEl) return;

  upcomingEl.textContent = committeeState.upcomingMeetingText;
  upcomingEl.className = `small ${committeeState.upcomingMeetingText.startsWith('No meetings') ? 'text-muted' : 'text-dark'}`;
}

function renderCommitteeProfile() {
  renderCommitteeStats();
  renderCommitteeUpcoming();
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[COMMITTEE] DOMContentLoaded fired');
  console.log('[COMMITTEE] requireAuth available:', typeof requireAuth);
  console.log('[COMMITTEE] auth.isAuthenticated:', typeof auth !== 'undefined' ? auth.isAuthenticated() : 'auth not defined');
  
  if (!requireAuth()) return;
  if (!['admin', 'secretary', 'treasurer', 'committee'].includes(localStorage.getItem('panchayat_role'))) {
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

  document.getElementById('edit-profile-form')?.addEventListener('submit', saveProfile);
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

  const openTickets = complaints.filter(c => c.status === 'open').length;
  const resolvedTickets = complaints.filter(c => c.status === 'resolved').length;

  setCommitteeState({
    complaints,
    quickStats: {
      openTickets,
      resolvedTickets
    },
    errors: {
      dashboard: null
    }
  });

  document.getElementById('stat-open').textContent = openTickets;
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
    
    const currentUser = auth.getUser();
    const currentSocietyId = currentUser?.society;
    
    if (data.results) {
      let users = data.results.filter(u => ['admin', 'secretary', 'treasurer', 'committee'].includes(u.role));
      
      if (currentSocietyId) {
        users = users.filter(u => u.society === currentSocietyId);
      }
      
      console.log('[COMPLAINT] Filtered users:', users);
      
      select.innerHTML = '<option value="">-- Unassigned --</option>' + 
        users.map(u => `<option value="${u.id}" ${u.id == currentAssigneeId ? 'selected' : ''}>${u.full_name || u.email} (${u.role})</option>`).join('');
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
      setCommitteeState({
        notices,
        upcomingMeetingText: deriveUpcomingMeetingText(notices),
        errors: { notices: null }
      });

      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><div class="empty-state"><i class="fas fa-bullhorn empty-state-icon"></i><h4>No Notices</h4><p>Post your first notice</p></div></td></tr>';
      return;
    }

    setCommitteeState({
      notices,
      upcomingMeetingText: deriveUpcomingMeetingText(notices),
      errors: { notices: null }
    });

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
    setCommitteeState({
      notices: [],
      upcomingMeetingText: 'No meetings scheduled',
      errors: { notices: e.message || 'Failed to load notices' }
    });
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
      
      const total = data.data.total || 0;
      
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
      `).join('') + `<tr class="table-primary"><td><strong>Total</strong></td><td><strong>₹${total.toLocaleString()}</strong></td></tr>`;
      
      const totalEl = document.getElementById('maintenance-total');
      if (totalEl) totalEl.textContent = '₹' + total.toLocaleString();

      const aiCard = document.getElementById('maintenance-ai');
      if (aiCard && data.data.ai_summary) {
        aiCard.style.display = 'block';
        document.getElementById('maintenance-ai-text').textContent = data.data.ai_summary;
      }
    } else {
      tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-4">No maintenance data for this month</td></tr>';
      
      const totalEl = document.getElementById('maintenance-total');
      if (totalEl) totalEl.textContent = '₹0';
      
      const aiCard = document.getElementById('maintenance-ai');
      if (aiCard) {
        aiCard.style.display = 'block';
        document.getElementById('maintenance-ai-text').textContent = `Total maintenance for ${month || 'selected month'}: ₹0. No expenses recorded.`;
      }
      
      const inputIds = ['maintenance-staff-salaries', 'maintenance-lift-amc', 'maintenance-generator-fuel', 'maintenance-water-charges', 'maintenance-sinking-fund', 'maintenance-garden'];
      inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    }
  } catch (e) {
    console.error('Maintenance load error:', e);
    tbody.innerHTML = '<tr><td colspan="2" class="text-center text-danger py-4">Failed to load maintenance data</td></tr>';
    
    const totalEl = document.getElementById('maintenance-total');
    if (totalEl) totalEl.textContent = '₹0';
    
    const aiCard = document.getElementById('maintenance-ai');
    if (aiCard) {
      aiCard.style.display = 'none';
    }
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
      if (typeof loadDues === 'function') {
        loadDues();
      }
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
        option.textContent = s.name + (s.society ? ' (' + s.society.name + ')' : '');
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
    if (document.getElementById('select-all-services')) {
      document.getElementById('select-all-services').checked = false;
    }
    
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

async function loadServicesForSlots() {
  const select = document.getElementById('slot-service');
  if (!select) return;
  
  try {
    const res = await api.get('/services/');
    const data = await res.json();
    const services = data.results || [];
    
    select.innerHTML = '<option value="">Choose a service...</option>' +
      services.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  } catch (e) {
    console.error('Error loading services for slots:', e);
  }
}

async function generateSlots() {
  const serviceId = document.getElementById('slot-service').value;
  const startDate = document.getElementById('slot-start-date').value;
  const endDate = document.getElementById('slot-end-date').value;
  const startTime = document.getElementById('slot-start-time').value || '09:00';
  const endTime = document.getElementById('slot-end-time').value || '18:00';
  
  if (!serviceId || !startDate || !endDate) {
    showToast('Please fill all required fields', 'error');
    return;
  }
  
  const btn = document.querySelector('#generateSlotsModal .btn-primary');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.post('/services/generate-slots/', {
      service_id: serviceId,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime
    });
    const result = await res.json();
    
    if (res.ok && result.success) {
      showToast(result.message, 'success');
      bootstrap.Modal.getInstance(document.getElementById('generateSlotsModal')).hide();
      document.getElementById('generate-slots-form').reset();
    } else {
      showToast(result.message || 'Failed to generate slots', 'error');
    }
  } catch (e) {
    showToast('Error generating slots', 'error');
  }
  
  setButtonLoading(btn, false);
}

document.getElementById('generateSlotsModal')?.addEventListener('show.bs.modal', function() {
  loadServicesForSlots();
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('slot-start-date').min = today;
  document.getElementById('slot-end-date').min = today;
});

async function editService(serviceId) {
  console.log('[COMMITTEE] editService called with ID:', serviceId);
  
  // Show loading on the button
  const editBtn = document.querySelector(`.edit-btn[data-service-id="${serviceId}"]`);
  if (editBtn) {
    editBtn.disabled = true;
    editBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }
  
  try {
    const res = await api.get(`/services/${serviceId}/`);
    if (!res.ok) {
      console.error('[COMMITTEE] API error:', res.status, res.statusText);
      showToast('Failed to load service details', 'error');
      return;
    }
    const data = await res.json();
    console.log('[COMMITTEE] Service data received:', data);
    
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
      console.log('[COMMITTEE] Modal shown successfully');
    } else {
      console.error('[COMMITTEE] Invalid service data:', data);
      showToast('Failed to load service details', 'error');
    }
  } catch (e) {
    console.error('[COMMITTEE] Error loading service:', e);
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
  if (document.getElementById('service-form')) {
    document.getElementById('service-form').reset();
  }
  if (document.querySelector('#serviceModal .modal-title')) {
    document.querySelector('#serviceModal .modal-title').innerHTML = '<i class="fas fa-tools me-2"></i>Add New Service';
  }
  if (document.querySelector('#serviceModal .btn-primary')) {
    document.querySelector('#serviceModal .btn-primary').innerHTML = '<i class="fas fa-save me-2"></i>Save Service';
  }
  if (document.getElementById('service-active')) {
    document.getElementById('service-active').checked = true;
  }
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
  const searchInput = document.getElementById('service-search');
  const statusSelect = document.getElementById('service-status-filter');
  
  if (!searchInput || !statusSelect) return;
  
  const searchTerm = searchInput.value.toLowerCase();
  const statusFilter = statusSelect.value;
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
  if (document.getElementById('service-search')) document.getElementById('service-search').value = '';
  if (document.getElementById('service-status-filter')) document.getElementById('service-status-filter').value = '';
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
window.loadServices = loadServices;
window.saveService = saveService;
window.editService = editService;
window.filterServices = filterServices;
window.clearServiceFilters = clearServiceFilters;
window.updateBulkActions = updateBulkActions;
window.bulkDeleteServices = bulkDeleteServices;
window.bulkUpdateServices = bulkUpdateServices;
window.generateSlots = generateSlots;
window.editProfile = editProfile;
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
    phone: phone || null
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
document.addEventListener('DOMContentLoaded', async () => {
  // Load society name
  try {
    const res = await api.get('/auth/me/');
    const result = await res.json();
    if (result.success && result.data && result.data.society_name) {
      const societyEl = document.getElementById('society-name');
      if (societyEl) societyEl.textContent = result.data.society_name;
    }
  } catch (e) {
    console.error('Error loading society:', e);
  }
  
  // Override switchTab to load profile when profile tab is activated
  const originalSwitchTab = window.switchTab;
  window.switchTab = function(tabId) {
    originalSwitchTab(tabId);
    if (tabId === 'profile') {
      loadProfile();
    }
    if (tabId === 'residents') {
      loadResidents();
    }
    if (tabId === 'chat') {
      if (typeof initChat === 'function') {
        initChat();
      }
    }
    if (tabId === 'services') {
      loadServices();
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
  if (activeTab === 'residents') {
    loadResidents();
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

// ============================================
// Resident Management
// ============================================
async function loadResidents() {
  try {
    const res = await api.get('/auth/resident/list/');
    const result = await res.json();
    
    const tbody = document.getElementById('residents-tbody');
    const countBadge = document.getElementById('resident-count');
    
    if (result.success && result.data) {
      if (countBadge) countBadge.textContent = result.data.length;
      
      if (result.data.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center text-muted py-4">
              <div class="empty-state">
                <i class="fas fa-users empty-state-icon"></i>
                <h4>No Residents</h4>
                <p>Add residents to your society</p>
              </div>
            </td>
          </tr>
        `;
        return;
      }
      
      tbody.innerHTML = result.data.map(r => `
        <tr>
          <td>${r.user_name || 'N/A'}</td>
          <td>${r.user_email || 'N/A'}</td>
          <td>${r.flat_no || 'N/A'}</td>
          <td>${r.wing_no || 'N/A'}</td>
          <td>${r.mobile_no || 'N/A'}</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-danger py-4">Failed to load residents</td>
        </tr>
      `;
    }
  } catch (e) {
    console.error('Error loading residents:', e);
    const tbody = document.getElementById('residents-tbody');
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-danger py-4">Failed to load residents</td>
      </tr>
    `;
  }
}

async function addResident() {
  const password = document.getElementById('resident-password').value;
  const confirmPassword = document.getElementById('resident-confirm-password').value;
  
  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }
  
  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }
  
  const data = {
    name: document.getElementById('resident-name').value,
    email: document.getElementById('resident-email').value,
    mobile_no: document.getElementById('resident-mobile').value,
    flat_no: document.getElementById('resident-flat').value,
    wing_no: document.getElementById('resident-wing').value,
    password: password,
    confirm_password: confirmPassword
  };
  
  const btn = document.querySelector('#resident-form .btn-primary');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.post('/auth/resident/add/', data);
    const result = await res.json();
    
    if (result.success) {
      showToast('Resident added successfully', 'success');
      document.getElementById('resident-form').reset();
      loadResidents();
    } else {
      showToast(result.message || 'Failed to add resident', 'error');
    }
  } catch (e) {
    showToast('Error adding resident', 'error');
  }
  
  setButtonLoading(btn, false);
}
