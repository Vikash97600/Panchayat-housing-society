// Resident Dashboard JavaScript - Debug Version
// ===============================================

// Console logging helper
const DEBUG = true;
function log(section, message, data = null) {
  if (DEBUG) {
    console.log(`[RESIDENT-${section}] ${message}`, data || '');
  }
}

// Global variables
let currentServiceId = null;
let selectedSlotId = null;

// ============================================
// DOMContentLoaded - Main Initialization
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  log('INIT', 'Starting resident dashboard initialization...');
  
  // Check authentication
  if (!requireAuth()) {
    log('AUTH', 'Not authenticated, redirecting to login');
    return;
  }
  
  // Check role
  const role = localStorage.getItem('panchayat_role');
  log('AUTH', 'User role:', role);
  if (role !== 'resident') {
    log('AUTH', 'Not a resident, redirecting to login');
    window.location.href = '/login/';
    return;
  }
  
  // Get user and display welcome message
  const user = auth.getUser();
  log('USER', 'Logged in user:', user);
  if (user) {
    const welcomeMsg = document.getElementById('welcome-msg');
    const flatInfo = document.getElementById('flat-info');
    const userAvatar = document.getElementById('user-avatar');
    
    if (welcomeMsg) {
      const firstName = user.full_name || user.first_name || 'User';
      welcomeMsg.textContent = getGreeting() + ', ' + firstName;
      log('USER', 'Welcome message set:', welcomeMsg.textContent);
    }
    if (flatInfo) {
      flatInfo.textContent = 'Flat ' + (user.flat_no || '-') + ', Wing ' + (user.wing || '-');
    }
    if (userAvatar && user.first_name) {
      userAvatar.textContent = user.first_name.charAt(0).toUpperCase();
    }
  }
  
  // Setup navigation event listeners
  setupNavigation();
  
  // Setup sub-tab navigation for complaints
  setupComplaintTabs();
  
  // Initialize all data modules
  initializeData();
  
  log('INIT', 'Initialization complete');
});

// ============================================
// Navigation Setup
// ============================================
function setupNavigation() {
  log('NAV', 'Setting up navigation...');
  
  const navLinks = document.querySelectorAll('.sidebar .nav-link');
  log('NAV', 'Found nav links:', navLinks.length);
  
  navLinks.forEach((link, index) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.dataset.tab;
      log('NAV', 'Clicked nav link:', tabId);
      if (tabId) {
        switchTab(tabId);
      }
    });
  });
}

// ============================================
// Complaint Sub-tabs Setup
// ============================================
function setupComplaintTabs() {
  log('COMPLAINT', 'Setting up complaint sub-tabs...');
  
  const subtabLinks = document.querySelectorAll('[data-subtab]');
  log('COMPLAINT', 'Found subtab links:', subtabLinks.length);
  
  subtabLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const subtab = link.dataset.subtab;
      log('COMPLAINT', 'Switching to subtab:', subtab);
      
      // Update active state
      subtabLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      // Show/hide subtab content
      const contents = document.querySelectorAll('.subtab-content');
      contents.forEach(c => c.classList.add('d-none'));
      
      const targetContent = document.getElementById('subtab-' + subtab);
      if (targetContent) {
        targetContent.classList.remove('d-none');
      }
    });
  });
}

// ============================================
// Data Initialization
// ============================================
function initializeData() {
  log('DATA', 'Initializing data modules...');
  
  // Load all data in parallel
  Promise.allSettled([
    loadDashboard(),
    loadMyComplaints(),
    loadServices(),
    loadMyDues(),
    loadNotices()
  ]).then(() => {
    log('DATA', 'All data modules initialized');
    
    // Initialize Bylaw Chat
    if (typeof initBylawChat === 'function') {
      initBylawChat();
      log('DATA', 'Bylaw chat initialized');
    } else {
      console.error('initBylawChat function not found');
    }
    
    // Initialize Voice Recorder
    if (typeof initVoiceRecorder === 'function') {
      initVoiceRecorder(handleTranscript);
      log('DATA', 'Voice recorder initialized');
    } else {
      console.error('initVoiceRecorder function not found');
    }
  });
}

// ============================================
// Tab Switching
// ============================================
function switchTab(tabId) {
  log('TAB', 'Switching to tab:', tabId);
  
  // Hide all tab contents
  const allTabs = document.querySelectorAll('.tab-content');
  allTabs.forEach(tab => {
    tab.classList.add('d-none');
    tab.classList.remove('active');
  });
  
  // Remove active from all nav links
  const allLinks = document.querySelectorAll('.sidebar .nav-link');
  allLinks.forEach(l => l.classList.remove('active'));
  
  // Show target tab
  const target = document.getElementById('tab-' + tabId);
  if (target) {
    target.classList.remove('d-none');
    target.classList.add('active');
    log('TAB', 'Tab activated:', target.id);
  } else {
    log('TAB', 'Target tab not found:', 'tab-' + tabId);
  }
  
  // Activate nav link
  const activeLink = document.querySelector(`.sidebar [data-tab="${tabId}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }
}

// ============================================
// Dashboard Loading
// ============================================
async function loadDashboard() {
  log('DASHBOARD', 'Loading dashboard...');
  const user = auth.getUser();
  
  if (!user) {
    log('DASHBOARD', 'No user found, skipping dashboard load');
    return;
  }
  
  const userId = user.id; // Store user ID for comparison
  
  try {
    // Load complaints
    const complaintsRes = await api.get('/complaints/');
    const complaintsData = await complaintsRes.json();
    const complaints = complaintsData.results || [];
    log('DASHBOARD', 'Complaints loaded:', complaints.length);
    
    // Filter by submitted_by - handle both string and number comparison
    const myComplaints = complaints.filter(c => String(c.submitted_by) === String(userId));
    const openCount = myComplaints.filter(c => c.status === 'open').length;
    
    const countEl = document.getElementById('my-complaints-count');
    if (countEl) {
      countEl.textContent = openCount;
      log('DASHBOARD', 'Open complaints count set:', openCount);
    }
  } catch (e) {
    console.error('DASHBOARD', 'Error loading complaints:', e);
  }
  
  try {
    // Load bookings
    const bookingsRes = await api.get('/services/bookings/');
    const bookingsData = await bookingsRes.json();
    const bookings = bookingsData.results || [];
    log('DASHBOARD', 'Bookings loaded:', bookings.length);
    
    // Filter by resident - handle both string and number comparison
    const myBookings = bookings.filter(b => String(b.resident) === String(userId) && b.status === 'confirmed');
    const nextBookingEl = document.getElementById('next-booking');
    if (nextBookingEl) {
      if (myBookings.length > 0) {
        const next = myBookings[0];
        nextBookingEl.textContent = (next.service_name || 'Service') + ' (' + formatDate(next.slot_date) + ')';
        log('DASHBOARD', 'Next booking set:', next.service_name);
      } else {
        nextBookingEl.textContent = 'None';
      }
    }
  } catch (e) {
    console.error('DASHBOARD', 'Error loading bookings:', e);
    const nextBookingEl = document.getElementById('next-booking');
    if (nextBookingEl) nextBookingEl.textContent = '-';
  }
  
  try {
    // Load notices
    const noticesRes = await api.get('/notices/');
    const noticesData = await noticesRes.json();
    const notices = noticesData.results || [];
    log('DASHBOARD', 'Notices loaded:', notices.length);
    
    const latestNoticeEl = document.getElementById('latest-notice');
    if (latestNoticeEl) {
      if (notices.length > 0) {
        const title = notices[0].title || '';
        latestNoticeEl.textContent = title.length > 15 ? title.substring(0, 15) + '...' : title;
        log('DASHBOARD', 'Latest notice set:', notices[0].title);
      } else {
        latestNoticeEl.textContent = 'None';
      }
    }
  } catch (e) {
    console.error('DASHBOARD', 'Error loading notices:', e);
    const latestNoticeEl = document.getElementById('latest-notice');
    if (latestNoticeEl) latestNoticeEl.textContent = '-';
  }
  
  try {
    // Check dues
    const duesRes = await api.get('/finance/dues/me/');
    const duesData = await duesRes.json();
    const dues = duesData.results || [];
    log('DASHBOARD', 'Dues loaded:', dues.length);
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentDue = dues.find(d => d.month && d.month.startsWith(currentMonth));
    
    if (currentDue && !currentDue.is_paid) {
      const alertEl = document.getElementById('dues-alert');
      const alertText = document.getElementById('dues-alert-text');
      if (alertEl && alertText) {
        alertEl.classList.remove('d-none');
        alertText.textContent = 'You have ₹' + (currentDue.amount || 0) + ' pending for ' + 
          new Date().toLocaleDateString('en-IN', { month: 'long' }) + '.';
        log('DASHBOARD', 'Dues alert shown');
      }
    }
    
    log('DASHBOARD', 'Dashboard loaded successfully');
  } catch (e) {
    console.error('DASHBOARD', 'Error loading dashboard:', e);
  }
}

// ============================================
// Complaint Form Handling
// ============================================
document.getElementById('complaint-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  log('COMPLAINT', 'Form submitted');
  
  const titleInput = document.getElementById('complaint-title');
  const categoryInput = document.getElementById('complaint-category');
  const priorityInput = document.getElementById('complaint-priority');
  const descInput = document.getElementById('complaint-desc');
  
  const data = {
    title: titleInput?.value?.trim() || '',
    category: categoryInput?.value || 'other',
    priority: priorityInput?.value || 'medium',
    description: descInput?.value?.trim() || ''
  };
  
  log('COMPLAINT', 'Form data:', data);
  
  if (!data.title) {
    showToast('Please enter a title', 'error');
    return;
  }
  
  if (!data.category) {
    showToast('Please select a category', 'error');
    return;
  }
  
  const btn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.post('/complaints/', data);
    const result = await res.json();
    log('COMPLAINT', 'Response:', result);
    
    if (result.success) {
      showToast('Complaint submitted successfully', 'success');
      e.target.reset();
      loadMyComplaints();
      // Switch to list view
      const listLink = document.querySelector('[data-subtab="list"]');
      if (listLink) listLink.click();
    } else {
      showToast(result.message || 'Failed to submit complaint', 'error');
    }
  } catch (e) {
    console.error('COMPLAINT', 'Submit error:', e);
    showToast('Failed to submit complaint', 'error');
  }
  
  setButtonLoading(btn, false);
});

// ============================================
// Voice Complaint Handler
// ============================================
function handleTranscript(data) {
  log('VOICE', 'Transcript received:', data);
  
  const transcriptEl = document.getElementById('voice-transcript');
  const submitBtn = document.getElementById('submit-voice-complaint');
  
  if (transcriptEl) {
    transcriptEl.textContent = data.transcript || '';
    transcriptEl.dataset.transcript = data.transcript || '';
  }
  
  if (submitBtn) {
    submitBtn.disabled = false;
  }
  
  showToast('Voice transcribed! Review and submit.', 'success');
}

// ============================================
// Priority Selection
// ============================================
function selectPriority(element) {
  document.querySelectorAll('.priority-option').forEach(opt => opt.classList.remove('selected'));
  element.classList.add('selected');
  const input = document.getElementById('complaint-priority');
  if (input && element.dataset.value) {
    input.value = element.dataset.value;
  }
}

// ============================================
// Voice Complaint Categorization (Fallback)
// ============================================
async function categorizeVoiceComplaint(transcript) {
  const categories = ['plumbing', 'electrical', 'lift', 'parking', 'noise', 'cleanliness', 'security', 'other'];
  const lower = transcript.toLowerCase();
  
  let category = 'other';
  let priority = 'medium';
  let title = 'Voice Complaint';
  
  if (lower.includes('tap') || lower.includes('pipe') || lower.includes('leak') || 
      lower.includes('water') || lower.includes('drain') || lower.includes('bathroom')) {
    category = 'plumbing';
    title = 'Plumbing Issue';
  } else if (lower.includes('light') || lower.includes('fan') || lower.includes('power') || 
             lower.includes('electric') || lower.includes('wire') || lower.includes('socket')) {
    category = 'electrical';
    title = 'Electrical Issue';
  } else if (lower.includes('lift') || lower.includes('elevator')) {
    category = 'lift';
    title = 'Lift Malfunction';
  } else if (lower.includes('car') || lower.includes('parking') || lower.includes('vehicle')) {
    category = 'parking';
    title = 'Parking Issue';
  } else if (lower.includes('noise') || lower.includes('loud') || lower.includes('party') || lower.includes('music')) {
    category = 'noise';
    title = 'Noise Complaint';
  } else if (lower.includes('dirty') || lower.includes('garbage') || lower.includes('clean')) {
    category = 'cleanliness';
    title = 'Cleanliness Issue';
  } else if (lower.includes('security') || lower.includes('guard') || lower.includes('entry')) {
    category = 'security';
    title = 'Security Issue';
  }
  
  if (lower.includes('urgent') || lower.includes('emergency') || lower.includes('danger')) {
    priority = 'urgent';
  } else if (lower.includes('slow') || lower.includes('minor')) {
    priority = 'low';
  }
  
  return { title, category, priority, reason: 'Local keyword analysis' };
}

// ============================================
// Submit Voice Complaint
// ============================================
document.getElementById('submit-voice-complaint')?.addEventListener('click', async () => {
  const transcriptEl = document.getElementById('voice-transcript');
  const transcript = transcriptEl?.dataset?.transcript || transcriptEl?.textContent || '';
  
  if (!transcript || transcript === 'Recording transcript will appear here...') {
    showToast('No voice transcript found. Please record first.', 'error');
    return;
  }
  
  const btn = document.getElementById('submit-voice-complaint');
  setButtonLoading(btn, true);
  showToast('Analyzing complaint...', 'info');
  
  const categorized = await categorizeVoiceComplaint(transcript);
  
  const data = {
    title: categorized.title,
    category: categorized.category,
    priority: categorized.priority,
    description: transcript,
    ai_transcript: transcript,
    language: 'en'
  };
  
  log('VOICE', 'Submitting voice complaint:', data);
  
  try {
    const res = await api.post('/complaints/', data);
    const result = await res.json();
    log('VOICE', 'Response:', result);
    
    if (result.success) {
      showToast(`Complaint submitted as "${categorized.category}"!`, 'success');
      if (transcriptEl) {
        transcriptEl.textContent = 'Recording transcript will appear here...';
        delete transcriptEl.dataset.transcript;
      }
      if (btn) btn.disabled = true;
      loadMyComplaints();
      switchTab('complaints');
      // Switch to list view
      setTimeout(() => {
        const listLink = document.querySelector('[data-subtab="list"]');
        if (listLink) listLink.click();
      }, 500);
    } else {
      showToast(result.message || 'Failed to submit', 'error');
    }
  } catch (e) {
    console.error('VOICE', 'Submit error:', e);
    showToast('Failed to submit complaint', 'error');
  }
  
  setButtonLoading(btn, false);
});

// ============================================
// Load My Complaints
// ============================================
async function loadMyComplaints(filter = 'all') {
  log('COMPLAINTS', 'Loading complaints with filter:', filter);
  
  const user = auth.getUser();
  let complaints = [];
  
  try {
    const res = await api.get('/complaints/');
    const data = await res.json();
    if (res.ok && data.results) {
      complaints = data.results;
    }
    log('COMPLAINTS', 'API Response:', data);
  } catch (e) {
    console.error('COMPLAINTS', 'Error loading complaints:', e);
  }

  // Handle both string and number comparison for user ID
  const userId = user ? user.id : null;
  const myComplaints = complaints.filter(c => c.submitted_by && String(c.submitted_by) === String(userId));
  log('COMPLAINTS', 'My complaints:', myComplaints.length);
  
  const container = document.getElementById('my-complaints-list');
  if (!container) {
    log('COMPLAINTS', 'Container not found');
    return;
  }
  
  // Filter
  let filteredComplaints = myComplaints;
  if (filter === 'open') {
    filteredComplaints = myComplaints.filter(c => c.status === 'open');
  } else if (filter === 'in_progress') {
    filteredComplaints = myComplaints.filter(c => c.status === 'in_progress');
  } else if (filter === 'resolved') {
    filteredComplaints = myComplaints.filter(c => c.status === 'resolved');
  }
  
  // Build HTML
  let html = `
    <div class="filter-tabs">
      <button class="filter-tab ${filter === 'all' ? 'active' : ''}" onclick="filterComplaints('all')">
        <i class="fas fa-list me-1"></i> All (${myComplaints.length})
      </button>
      <button class="filter-tab ${filter === 'open' ? 'active' : ''}" onclick="filterComplaints('open')">
        <i class="fas fa-exclamation-circle me-1"></i> Open (${myComplaints.filter(c => c.status === 'open').length})
      </button>
      <button class="filter-tab ${filter === 'in_progress' ? 'active' : ''}" onclick="filterComplaints('in_progress')">
        <i class="fas fa-spinner me-1"></i> In Progress (${myComplaints.filter(c => c.status === 'in_progress').length})
      </button>
      <button class="filter-tab ${filter === 'resolved' ? 'active' : ''}" onclick="filterComplaints('resolved')">
        <i class="fas fa-check-circle me-1"></i> Resolved (${myComplaints.filter(c => c.status === 'resolved').length})
      </button>
    </div>
  `;
  
  if (filteredComplaints.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i class="fas fa-ticket-alt"></i>
        </div>
        <h4>No Complaints</h4>
        <p>${filter === 'all' ? "You haven't filed any complaints yet" : "No complaints in this category"}</p>
        ${filter === 'all' ? `
        <button class="btn btn-primary" onclick="switchTab('complaints'); document.querySelector('[data-subtab=\\'text\\']').click();">
          <i class="fas fa-plus"></i> File a Complaint
        </button>
        ` : ''}
      </div>
    `;
    container.innerHTML = html;
    return;
  }
  
  const categoryLabels = {
    plumbing: 'Plumbing',
    electrical: 'Electrical',
    lift: 'Lift',
    parking: 'Parking',
    noise: 'Noise',
    cleanliness: 'Cleanliness',
    security: 'Security',
    other: 'Other'
  };
  
  html += '<div style="display:flex;flex-direction:column;gap:12px;">';
  html += filteredComplaints.map(c => {
    const statusLabel = c.status === 'open' ? 'Open' : c.status === 'in_progress' ? 'In Progress' : 'Resolved';
    const canEdit = c.status === 'open' || c.status === 'in_progress';
    const buttons = canEdit ? `
      <div class="mt-3 pt-3 border-top d-flex gap-2">
        <button onclick="openEditComplaint(${c.id})" class="btn btn-sm btn-primary flex-fill">
          <i class="fas fa-edit me-1"></i> Edit
        </button>
        <button onclick="deleteComplaint(${c.id})" class="btn btn-sm btn-danger flex-fill">
          <i class="fas fa-trash me-1"></i> Delete
        </button>
      </div>
    ` : '';
    return `
      <div style="background:white;padding:15px;border-radius:8px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border-left:4px solid ${c.status==='open'?'#dc3545':c.status==='in_progress'?'#ffc107':'#198754'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div>
            <strong>${c.title || 'Untitled'}</strong>
            <span style="color:#6c757d;font-size:12px;margin-left:8px;">#${c.id}</span>
          </div>
          <span style="padding:3px 8px;border-radius:12px;font-size:12px;background:${c.priority==='urgent'?'#dc3545':c.priority==='medium'?'#ffc107':'#6c757d'};color:white;">${c.priority || 'medium'}</span>
        </div>
        ${c.description ? `<p style="color:#6c757d;font-size:14px;margin:8px 0;">${(c.description || '').substring(0,80)}${c.description.length > 80 ? '...' : ''}</p>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#6c757d;">
          <span>${categoryLabels[c.category] || 'Other'}</span>
          <span>${formatDate(c.created_at)}</span>
          <span style="padding:3px 8px;border-radius:12px;background:${c.status==='open'?'#cff4fc':c.status==='in_progress'?'#fff3cd':'#d1e7dd'};color:${c.status==='open'?'#055160':c.status==='in_progress'?'#664d03':'#0f5132'};">${statusLabel}</span>
        </div>
        ${buttons}
      </div>
    `;
  }).join('');
  html += '</div>';
  
  container.innerHTML = html;
  log('COMPLAINTS', 'Complaints rendered');
}

function filterComplaints(filter) {
  log('COMPLAINTS', 'Filtering:', filter);
  loadMyComplaints(filter);
}

// ============================================
// Load Services
// ============================================
async function loadServices() {
  log('SERVICES', 'Loading services...');
  
  const grid = document.getElementById('services-grid');
  if (!grid) {
    log('SERVICES', 'Grid not found');
    return;
  }
  
  grid.innerHTML = '<div class="text-center py-4"><div class="spinner"></div></div>';
  
  try {
    const res = await api.get('/services/');
    const data = await res.json();
    const services = (data.results || []).filter(s => s.is_active !== false);
    log('SERVICES', 'Services loaded:', services.length);
    
    if (services.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-tools empty-state-icon"></i>
          <h4>No Services</h4>
          <p>No services available at the moment</p>
        </div>
      `;
      return;
    }
    
    grid.innerHTML = services.map(s => `
      <div class="service-card">
        <div class="service-icon">
          <i class="fas fa-tools"></i>
        </div>
        <h5>${s.name || 'Service'}</h5>
        <p class="text-muted">${s.description || 'No description'}</p>
        <div class="d-flex justify-content-between align-items-center">
          <span class="font-semibold">₹${s.price_per_slot || 0}</span>
          <button class="btn btn-primary btn-sm" onclick="openBookingModal(${s.id})">
            <i class="fas fa-calendar-plus"></i> Book Now
          </button>
        </div>
      </div>
    `).join('');
    
    // Load bookings
    const user = auth.getUser();
    let allBookings = [];
    try {
      const bookingsRes = await api.get('/services/bookings/');
      const bookingsData = await bookingsRes.json();
      if (bookingsData.results) allBookings = bookingsData.results;
    } catch (e) {
      console.error('Error loading bookings:', e);
    }
    
    const myBookings = allBookings.filter(b => b.resident === user.id);
    const tbody = document.getElementById('my-bookings-tbody');
    if (tbody) {
      if (myBookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No bookings yet</td></tr>';
      } else {
        tbody.innerHTML = myBookings.map(b => `
          <tr>
            <td>${b.service_name || 'Service'}</td>
            <td>${formatDate(b.slot_date)}</td>
            <td>${b.start_time || '-'} - ${b.end_time || '-'}</td>
            <td><span class="badge badge-${b.status === 'confirmed' ? 'success' : 'warning'}">${b.status}</span></td>
            <td>${b.status === 'confirmed' ? `<button class="btn btn-sm btn-danger" onclick="cancelBooking(${b.id})"><i class="fas fa-times"></i></button>` : '-'}</td>
          </tr>
        `).join('');
      }
    }
    
    log('SERVICES', 'Services rendered');
  } catch (e) {
    console.error('SERVICES', 'Error:', e);
    grid.innerHTML = '<div class="text-center text-danger py-4">Failed to load services</div>';
  }
}

// ============================================
// Booking Modal
// ============================================
function openBookingModal(serviceId) {
  log('BOOKING', 'Opening modal for service:', serviceId);
  currentServiceId = serviceId;
  selectedSlotId = null;
  
  const slotsEl = document.getElementById('available-slots');
  if (slotsEl) slotsEl.innerHTML = '<p class="text-muted">Select a date first</p>';
  
  const confirmBtn = document.getElementById('confirm-booking');
  if (confirmBtn) confirmBtn.disabled = true;
  
  // Reset date input
  const dateInput = document.getElementById('booking-date');
  if (dateInput) dateInput.value = '';
  
  const modal = document.getElementById('bookingModal');
  if (modal) {
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }
}

document.getElementById('booking-date')?.addEventListener('change', async (e) => {
  const date = e.target.value;
  if (!date || !currentServiceId) return;
  
  log('BOOKING', 'Date selected:', date, 'Service:', currentServiceId);
  
  try {
    const res = await api.get(`/services/${currentServiceId}/slots/?date=${date}`);
    const data = await res.json();
    const slots = data.results || [];
    log('BOOKING', 'Slots loaded:', slots.length);
    
    const slotsEl = document.getElementById('available-slots');
    const confirmBtn = document.getElementById('confirm-booking');
    
    if (slots.length === 0) {
      if (slotsEl) slotsEl.innerHTML = '<p class="text-muted">No slots available for this date</p>';
      if (confirmBtn) confirmBtn.disabled = true;
      return;
    }
    
    if (slotsEl) {
      slotsEl.innerHTML = slots.map(s => `
        <div class="form-check">
          <input class="form-check-input" type="radio" name="slot" value="${s.id}" id="slot-${s.id}">
          <label class="form-check-label" for="slot-${s.id}">${s.start_time} - ${s.end_time}</label>
        </div>
      `).join('');
    }
    
    // Add event listener for slot selection
    setTimeout(() => {
      document.querySelectorAll('input[name="slot"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          selectedSlotId = e.target.value;
          if (confirmBtn) confirmBtn.disabled = false;
          log('BOOKING', 'Slot selected:', selectedSlotId);
        });
      });
    }, 100);
  } catch (e) {
    console.error('BOOKING', 'Error loading slots:', e);
  }
});

document.getElementById('confirm-booking')?.addEventListener('click', async () => {
  if (!selectedSlotId) {
    showToast('Please select a time slot', 'error');
    return;
  }
  
  const btn = document.getElementById('confirm-booking');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.post('/services/bookings/', { slot: selectedSlotId });
    const result = await res.json();
    log('BOOKING', 'Create response:', result);
    
    if (result.success) {
      showToast('Booking confirmed', 'success');
      const modal = document.getElementById('bookingModal');
      if (modal) {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) bsModal.hide();
      }
      loadServices();
    } else {
      showToast(result.message || 'Booking failed', 'error');
    }
  } catch (e) {
    console.error('BOOKING', 'Error:', e);
    showToast('Booking failed', 'error');
  }
  
  setButtonLoading(btn, false);
});

async function cancelBooking(bookingId) {
  if (!confirm('Cancel this booking?')) return;
  
  log('BOOKING', 'Cancelling booking:', bookingId);
  
  try {
    const res = await api.put(`/services/bookings/${bookingId}/cancel/`);
    if (res.ok) {
      showToast('Booking cancelled', 'success');
      loadServices();
    }
  } catch (e) {
    console.error('BOOKING', 'Cancel error:', e);
    showToast('Failed to cancel booking', 'error');
  }
}

// ============================================
// Load My Dues
// ============================================
async function loadMyDues() {
  log('DUES', 'Loading dues...');
  
  let dues = [];
  try {
    const res = await api.get('/finance/dues/me/');
    const data = await res.json();
    if (res.ok && data.results) {
      dues = data.results;
    }
    log('DUES', 'Dues loaded:', dues.length);
  } catch (e) {
    console.error('DUES', 'Error:', e);
  }
  
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentDue = dues.find(d => d.month && d.month.startsWith(currentMonth));
  
  const amountEl = document.getElementById('current-amount');
  const statusEl = document.getElementById('current-status');
  
  if (amountEl && statusEl) {
    if (currentDue) {
      amountEl.textContent = '₹' + (currentDue.amount || 0);
      if (currentDue.is_paid) {
        statusEl.innerHTML = '<span class="badge badge-success">Paid</span>';
        const card = statusEl.closest('.card');
        if (card) {
          card.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          card.style.color = 'white';
        }
      } else {
        statusEl.innerHTML = '<span class="badge badge-danger">Unpaid</span>';
      }
    } else {
      amountEl.textContent = '₹0';
      statusEl.innerHTML = '<span class="badge badge-success">No dues</span>';
    }
  }
  
  const tbody = document.getElementById('dues-history-tbody');
  if (!tbody) return;
  
  if (dues.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No dues history</td></tr>';
    return;
  }
  
  tbody.innerHTML = dues.map(d => `
    <tr>
      <td>${d.month ? new Date(d.month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-'}</td>
      <td>₹${d.amount || 0}</td>
      <td>${d.is_paid ? '<span class="badge badge-success">Paid</span>' : '<span class="badge badge-danger">Unpaid</span>'}</td>
      <td>${d.paid_at ? formatDate(d.paid_at) : '-'}</td>
      <td>${d.payment_ref || '-'}</td>
    </tr>
  `).join('');
  
  log('DUES', 'Dues rendered');
}

// ============================================
// Load Notices
// ============================================
async function loadNotices() {
  log('NOTICES', 'Loading notices...');
  
  let notices = [];
  try {
    const res = await api.get('/notices/');
    const data = await res.json();
    if (res.ok && data.results) {
      notices = data.results;
    }
    log('NOTICES', 'Notices loaded:', notices.length);
  } catch (e) {
    console.error('NOTICES', 'Error:', e);
  }
  
  const container = document.getElementById('notices-list');
  if (!container) {
    log('NOTICES', 'Container not found');
    return;
  }
  
  if (notices.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-bullhorn empty-state-icon"></i>
        <h4>No Notices</h4>
        <p>No notices posted yet</p>
      </div>
    `;
    return;
  }
  
  const pinned = notices.filter(n => n.is_pinned);
  const others = notices.filter(n => !n.is_pinned);
  
  let html = '';
  if (pinned.length) {
    html += '<h6 class="text-muted mb-3"><i class="fas fa-thumbtack me-1"></i> Pinned</h6>';
    html += pinned.map(n => `
      <div class="card mb-3 pinned-notice">
        <div class="card-body">
          <h6>${n.title || 'Notice'}</h6>
          <p class="mb-2">${n.body || ''}</p>
          <small class="text-muted">${formatDate(n.created_at)}</small>
        </div>
      </div>
    `).join('');
  }
  
  html += others.map(n => `
    <div class="card mb-3">
      <div class="card-body">
        <h6>${n.title || 'Notice'}</h6>
        <p class="mb-2">${n.body || ''}</p>
        <small class="text-muted">${formatDate(n.created_at)}</small>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
  log('NOTICES', 'Notices rendered');
}

// ============================================
// Edit/Delete Complaint
// ============================================
async function openEditComplaint(complaintId) {
  log('EDIT', 'Opening edit for complaint:', complaintId);
  
  try {
    const res = await api.get(`/complaints/${complaintId}/`);
    const complaint = await res.json();
    log('EDIT', 'Complaint data:', complaint);
    
    if (complaint.status !== 'open' && complaint.status !== 'in_progress') {
      showToast('Cannot edit complaints that are not open or in progress', 'error');
      return;
    }
    
    document.getElementById('edit-complaint-id').value = complaint.id;
    document.getElementById('edit-complaint-title').value = complaint.title || '';
    document.getElementById('edit-complaint-category').value = complaint.category || 'other';
    document.getElementById('edit-complaint-priority').value = complaint.priority || 'medium';
    document.getElementById('edit-complaint-desc').value = complaint.description || '';
    
    const modal = document.getElementById('complaintEditModal');
    if (modal) {
      new bootstrap.Modal(modal).show();
    }
  } catch (e) {
    console.error('EDIT', 'Error:', e);
    showToast('Error loading complaint details', 'error');
  }
}

document.getElementById('save-complaint-btn')?.addEventListener('click', async () => {
  const id = document.getElementById('edit-complaint-id').value;
  const data = {
    title: document.getElementById('edit-complaint-title').value,
    category: document.getElementById('edit-complaint-category').value,
    priority: document.getElementById('edit-complaint-priority').value,
    description: document.getElementById('edit-complaint-desc').value
  };
  
  if (!data.title.trim()) {
    showToast('Title is required', 'error');
    return;
  }
  
  const btn = document.getElementById('save-complaint-btn');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.put(`/complaints/${id}/`, data);
    const result = await res.json();
    log('EDIT', 'Save response:', result);
    
    if (result.success) {
      showToast('Complaint updated!', 'success');
      const modal = document.getElementById('complaintEditModal');
      if (modal) bootstrap.Modal.getInstance(modal).hide();
      loadMyComplaints();
    } else {
      showToast(result.message || 'Failed to update', 'error');
    }
  } catch (e) {
    showToast('Failed to update complaint', 'error');
  }
  
  setButtonLoading(btn, false);
});

document.getElementById('delete-complaint-btn')?.addEventListener('click', async () => {
  const id = document.getElementById('edit-complaint-id').value;
  
  if (!confirm('Are you sure you want to delete this complaint? This cannot be undone.')) {
    return;
  }
  
  const btn = document.getElementById('delete-complaint-btn');
  setButtonLoading(btn, true);
  
  try {
    const res = await api.delete(`/complaints/${id}/`);
    const result = await res.json();
    log('DELETE', 'Response:', result);
    
    if (result.success) {
      showToast('Complaint deleted!', 'success');
      const modal = document.getElementById('complaintEditModal');
      if (modal) bootstrap.Modal.getInstance(modal).hide();
      loadMyComplaints();
    } else {
      showToast(result.message || 'Failed to delete', 'error');
    }
  } catch (e) {
    showToast('Failed to delete complaint', 'error');
  }
  
  setButtonLoading(btn, false);
});

async function deleteComplaint(complaintId) {
  if (!confirm('Are you sure you want to delete this complaint? This cannot be undone.')) {
    return;
  }
  
  try {
    const res = await api.delete(`/complaints/${complaintId}/`);
    const result = await res.json();
    
    if (result.success) {
      showToast('Complaint deleted!', 'success');
      loadMyComplaints();
    } else {
      showToast(result.message || 'Failed to delete', 'error');
    }
  } catch (e) {
    showToast('Failed to delete complaint', 'error');
  }
}

// ============================================
// Export Functions to Window
// ============================================
window.switchTab = switchTab;
window.loadDashboard = loadDashboard;
window.loadMyComplaints = loadMyComplaints;
window.filterComplaints = filterComplaints;
window.loadServices = loadServices;
window.loadMyDues = loadMyDues;
window.loadNotices = loadNotices;
window.openBookingModal = openBookingModal;
window.cancelBooking = cancelBooking;
window.selectPriority = selectPriority;
window.openEditComplaint = openEditComplaint;
window.deleteComplaint = deleteComplaint;

log('MAIN', 'Resident.js loaded successfully');