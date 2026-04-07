// Panchayat API Client
// Modern, robust API handler with loading states and error handling

const API_BASE = '/api';

const token = () => localStorage.getItem('panchayat_token');

const headers = (includeJson = true) => {
  const h = {
    'Authorization': `Bearer ${token()}`
  };
  if (includeJson) {
    h['Content-Type'] = 'application/json';
    h['Accept'] = 'application/json';
  }
  return h;
};

const api = {
  // GET request
  get: async (url) => {
    try {
      const response = await fetch(API_BASE + url, { 
        headers: headers(),
        credentials: 'include'
      });
      return response;
    } catch (error) {
      console.error('API GET Error:', error);
      throw error;
    }
  },
  
  // POST request
  post: async (url, body) => {
    try {
      const response = await fetch(API_BASE + url, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        credentials: 'include'
      });
      return response;
    } catch (error) {
      console.error('API POST Error:', error);
      throw error;
    }
  },
  
  // PUT request
  put: async (url, body) => {
    try {
      const response = await fetch(API_BASE + url, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(body),
        credentials: 'include'
      });
      return response;
    } catch (error) {
      console.error('API PUT Error:', error);
      throw error;
    }
  },
  
  // DELETE request
  delete: async (url) => {
    try {
      const response = await fetch(API_BASE + url, {
        method: 'DELETE',
        headers: headers(),
        credentials: 'include'
      });
      return response;
    } catch (error) {
      console.error('API DELETE Error:', error);
      throw error;
    }
  },
  
  // File upload
  upload: async (url, formData) => {
    try {
      const response = await fetch(API_BASE + url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token()}` },
        body: formData,
        credentials: 'include'
      });
      return response;
    } catch (error) {
      console.error('API Upload Error:', error);
      throw error;
    }
  }
};

// Auth utilities
const auth = {
  login: async (email, password) => {
    const res = await api.post('/auth/login/', { email, password });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('panchayat_token', data.data.access);
      localStorage.setItem('panchayat_user', JSON.stringify(data.data.user));
      localStorage.setItem('panchayat_role', data.data.user.role);
    }
    return data;
  },
  
  logout: () => {
    localStorage.removeItem('panchayat_token');
    localStorage.removeItem('panchayat_user');
    localStorage.removeItem('panchayat_role');
    window.location.href = '/login/';
  },
  
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem('panchayat_user') || 'null');
    } catch {
      return null;
    }
  },
  
  getRole: () => localStorage.getItem('panchayat_role'),
  
  isAuthenticated: () => !!token()
};

// Auth guard
function requireAuth() {
  if (!auth.isAuthenticated()) {
    window.location.href = '/login/';
    return false;
  }
  return true;
}

// Role-based redirect
function handleRoleRedirect(role) {
  localStorage.setItem('panchayat_role', role);
  const routes = {
    admin: '/admin-panel/',
    committee: '/committee/',
    resident: '/resident/'
  };
  window.location.href = routes[role] || '/login/';
}

// Toast notifications
function showToast(message, type = 'success', title = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">
      <i class="fas ${icons[type]}"></i>
    </div>
    <div class="toast-message">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      <div>${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  container.appendChild(toast);
  
  // Auto remove
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 4000);
}

function log(section, message, data = null) {
  if (!window.console) return;
  if (data !== null) {
    console.debug(`[${section}]`, message, data);
  } else {
    console.debug(`[${section}]`, message);
  }
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });
}

// Format time
function formatTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// Get greeting
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Loading state helper
function setButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner spinner-sm me-2"></span> Loading...';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHTML || btn.innerHTML;
  }
}

// Render table with data
function renderTable(tbodyId, data, columns, emptyMessage = 'No data available') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  
  if (!data || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${columns.length}" class="text-center text-muted py-4">
          <div class="empty-state">
            <i class="fas fa-inbox empty-state-icon"></i>
            <p>${emptyMessage}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = data.map(row => `
    <tr>
      ${columns.map(col => `<td>${col.render ? col.render(row) : row[col.key] || '-'}</td>`).join('')}
    </tr>
  `).join('');
}

// Format currency
function formatCurrency(amount) {
  return '₹' + (parseFloat(amount) || 0).toLocaleString('en-IN');
}

// Format status badge
function formatStatusBadge(status, mapping = {}) {
  const defaultMap = {
    open: 'badge-open',
    in_progress: 'badge-progress',
    resolved: 'badge-resolved',
    pending: 'badge-warning',
    paid: 'badge-success',
    confirmed: 'badge-success',
    cancelled: 'badge-danger'
  };
  const className = mapping[status] || defaultMap[status] || 'badge-primary';
  return `<span class="badge ${className}">${status.replace('_', ' ')}</span>`;
}

// Tab switching
function switchTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(t => {
    t.classList.add('d-none');
    t.classList.remove('active');
  });
  
  // Remove active from all nav links
  document.querySelectorAll('.sidebar .nav-link, .nav-item .nav-link').forEach(l => {
    l.classList.remove('active');
  });
  
  // Show target tab
  const target = document.getElementById('tab-' + tabId);
  if (target) {
    target.classList.remove('d-none');
    target.classList.add('active');
  }
  
  // Activate nav link
  const activeLink = document.querySelector(`.sidebar [data-tab="${tabId}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }
}

// Handle API response
async function handleApiResponse(response, showSuccess = true) {
  const data = await response.json();
  if (data.success) {
    if (showSuccess && data.message) {
      showToast(data.message, 'success');
    }
    return data;
  } else {
    showToast(data.message || 'An error occurred', 'error');
    throw new Error(data.message);
  }
}

// Export for use
window.api = api;
window.auth = auth;
window.requireAuth = requireAuth;
window.handleRoleRedirect = handleRoleRedirect;
window.showToast = showToast;
window.log = log;
window.formatDate = formatDate;
window.formatTime = formatTime;
window.getGreeting = getGreeting;
window.setButtonLoading = setButtonLoading;
window.renderTable = renderTable;
window.formatCurrency = formatCurrency;
window.formatStatusBadge = formatStatusBadge;
window.switchTab = switchTab;
window.handleApiResponse = handleApiResponse;
