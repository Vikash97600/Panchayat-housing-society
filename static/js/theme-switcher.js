/* ==============================================
   PANCHAYAT - Theme Switcher Module
   Handles theme switching, persistence, and UI
   ============================================== */

// Theme configuration
const themes = {
  light: { name: 'Light', icon: 'fa-sun' },
  dark: { name: 'Dark', icon: 'fa-moon' },
  green: { name: 'Green', icon: 'fa-leaf' },
  gov: { name: 'Government', icon: 'fa-flag' },
  'gov-admin': { name: 'Admin Governance', icon: 'fa-landmark' },
  neon: { name: 'Neon', icon: 'fa-bolt' },
  earth: { name: 'Earthy', icon: 'fa-seedling' }
};

// Default theme
const DEFAULT_THEME = 'light';

// Get saved theme
function getSavedTheme() {
  const saved = localStorage.getItem('panchayat_theme');
  return saved && themes[saved] ? saved : DEFAULT_THEME;
}

// Save theme
function saveTheme(themeName) {
  localStorage.setItem('panchayat_theme', themeName);
}

// Apply theme to document
function applyTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  saveTheme(themeName);
  updateAllThemeMenus(themeName);
  console.log(`[THEME] Applied: ${themeName}`);
}

// Initialize theme on page load
function initTheme() {
  let theme = getSavedTheme();
  // Auto-apply gov-admin theme on admin page
  if (window.location.pathname.includes('admin') || document.querySelector('.sidebar-admin')) {
    theme = 'gov-admin';
  }
  applyTheme(theme);
}

// Update all theme menu UIs
function updateAllThemeMenus(activeTheme) {
  // Update sidebar theme menu
  const sidebarMenu = document.getElementById('sidebarThemeMenu');
  if (sidebarMenu) {
    const options = sidebarMenu.querySelectorAll('.theme-option');
    options.forEach(opt => {
      if (opt.dataset.theme === activeTheme) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
  }
  
  // Update floating theme switcher if exists
  const floatingMenu = document.getElementById('themeDropdown');
  if (floatingMenu) {
    const options = floatingMenu.querySelectorAll('.theme-option');
    options.forEach(opt => {
      if (opt.dataset.theme === activeTheme) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
    const nameEl = document.getElementById('currentThemeName');
    if (nameEl && themes[activeTheme]) {
      nameEl.textContent = themes[activeTheme].name;
    }
  }
}

// Toggle sidebar theme menu
function toggleSidebarThemeMenu() {
  const menu = document.getElementById('sidebarThemeMenu');
  const btn = document.querySelector('.theme-toggle-btn .fa-chevron-right');
  if (menu) {
    menu.classList.toggle('show');
    if (btn) {
      btn.style.transform = menu.classList.contains('show') ? 'rotate(90deg)' : '';
    }
  }
}

// Toggle header theme menu
function toggleHeaderThemeMenu() {
  const menu = document.getElementById('headerThemeMenu');
  if (menu) {
    menu.classList.toggle('show');
  }
}

// Set theme (for header theme menu)
function setTheme(themeName) {
  if (themes[themeName]) {
    applyTheme(themeName);
    const menu = document.getElementById('headerThemeMenu');
    if (menu) menu.classList.remove('show');
  }
}

// Set theme from sidebar
function setSidebarTheme(themeName) {
  if (themes[themeName]) {
    applyTheme(themeName);
    toggleSidebarThemeMenu(); // Close menu after selection
  }
}

// Create floating theme switcher (for pages without sidebar)
function createFloatingThemeSwitcher() {
  // Remove existing if any
  const existing = document.querySelector('.theme-switcher');
  if (existing) return;
  
  const container = document.createElement('div');
  container.className = 'theme-switcher';
  container.innerHTML = `
    <button class="theme-switcher-btn" onclick="toggleFloatingThemeMenu()">
      <i class="fas fa-palette"></i>
      <span id="currentThemeName">${themes[getSavedTheme()].name}</span>
      <i class="fas fa-chevron-down"></i>
    </button>
    <div class="theme-dropdown" id="themeDropdown">
      ${Object.entries(themes).map(([key, value]) => `
        <button class="theme-option ${key === getSavedTheme() ? 'active' : ''}" 
                data-theme="${key}" 
                onclick="selectFloatingTheme('${key}')">
          <span class="theme-icon ${key}">
            <i class="fas ${value.icon}"></i>
          </span>
          <span>${value.name}</span>
        </button>
      `).join('')}
    </div>
  `;
  document.body.appendChild(container);
}

// Toggle floating theme menu
function toggleFloatingThemeMenu() {
  const dropdown = document.getElementById('themeDropdown');
  if (dropdown) {
    dropdown.classList.toggle('show');
  }
}

// Select theme from floating menu
function selectFloatingTheme(themeName) {
  if (themes[themeName]) {
    applyTheme(themeName);
    const dropdown = document.getElementById('themeDropdown');
    if (dropdown) dropdown.classList.remove('show');
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  // Sidebar theme menu
  const themeSwitcher = document.querySelector('.sidebar-theme-switcher');
  if (themeSwitcher && !themeSwitcher.contains(e.target)) {
    const menu = document.getElementById('sidebarThemeMenu');
    const btn = document.querySelector('.theme-toggle-btn .fa-chevron-right');
    if (menu) menu.classList.remove('show');
    if (btn) btn.style.transform = '';
  }
  
  // Header theme menu
  const headerThemeToggle = document.querySelector('.header-theme-toggle');
  if (headerThemeToggle && !headerThemeToggle.contains(e.target)) {
    const headerMenu = document.getElementById('headerThemeMenu');
    if (headerMenu) headerMenu.classList.remove('show');
  }
  
  // Floating theme dropdown
  const floatingSwitcher = document.querySelector('.theme-switcher');
  const dropdown = document.getElementById('themeDropdown');
  if (floatingSwitcher && !floatingSwitcher.contains(e.target) && dropdown) {
    dropdown.classList.remove('show');
  }
});

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

// Mobile sidebar toggle
function toggleMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.classList.toggle('show');
  }
}

// Export to window
window.themes = themes;
window.getSavedTheme = getSavedTheme;
window.applyTheme = applyTheme;
window.toggleSidebarThemeMenu = toggleSidebarThemeMenu;
window.toggleHeaderThemeMenu = toggleHeaderThemeMenu;
window.setTheme = setTheme;
window.setSidebarTheme = setSidebarTheme;
window.selectFloatingTheme = selectFloatingTheme;
window.toggleFloatingThemeMenu = toggleFloatingThemeMenu;
window.toggleMobileSidebar = toggleMobileSidebar;