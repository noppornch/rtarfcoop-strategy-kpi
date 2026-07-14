// Global Session and Authentication Handler
window.currentUser = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  initTheme();
  setupAuthEvents();
});

// Check if user is logged in
async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (!data.loggedIn) {
      window.location.href = '/login.html';
      return;
    }

    window.currentUser = data.user;
    updateUIForUser();
  } catch (err) {
    console.error('Session check failed:', err);
    window.location.href = '/login.html';
  }
}

// Update UI elements based on user role and details
function updateUIForUser() {
  if (!window.currentUser) return;

  // Sidebar Profile details
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  const avatarEl = document.getElementById('user-avatar-char');
  
  if (nameEl) nameEl.innerText = window.currentUser.name;
  if (roleEl) {
    let roleText = 'ผู้ใช้ทั่วไป';
    if (window.currentUser.role === 'admin') roleText = 'ผู้ดูแลระบบ';
    if (window.currentUser.role === 'manager') roleText = 'ผู้บริหาร';
    roleEl.innerText = roleText;
  }
  if (avatarEl) {
    avatarEl.innerText = window.currentUser.name.charAt(0);
  }

  // Handle Admin permissions (Show/hide User Management and structure editing)
  if (window.currentUser.role === 'admin') {
    const tabUserMgmt = document.getElementById('tab-user-management');
    if (tabUserMgmt) tabUserMgmt.style.display = 'flex';
    
    const tabDbAdmin = document.getElementById('tab-db-admin');
    if (tabDbAdmin) tabDbAdmin.style.display = 'flex';
    
    const addPlanBtn = document.getElementById('admin-plan-actions');
    if (addPlanBtn) addPlanBtn.style.display = 'block';

    const addNodeBtn = document.getElementById('add-node-btn');
    if (addNodeBtn) addNodeBtn.style.display = 'inline-flex';
  }

  // Trigger main app loading sequence
  if (window.initApp) {
    window.initApp();
  }
}

// Setup Event Listeners
function setupAuthEvents() {
  // Logout action
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
        try {
          const res = await fetch('/api/auth/logout', { method: 'POST' });
          if (res.ok) {
            window.location.href = '/login.html';
          }
        } catch (err) {
          alert('เกิดข้อผิดพลาดในการออกจากระบบ');
        }
      }
    });
  }

  // Mobile Drawer Toggle
  const sidebar = document.getElementById('sidebar');
  const sidebarOpen = document.getElementById('sidebar-open');
  const sidebarClose = document.getElementById('sidebar-close');

  if (sidebarOpen && sidebar) {
    sidebarOpen.addEventListener('click', () => {
      sidebar.classList.add('open');
    });
  }

  if (sidebarClose && sidebar) {
    sidebarClose.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  }
}

// Theme handling (Light / Dark mode)
function initTheme() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (!themeBtn) return;

  const currentTheme = localStorage.getItem('theme') || 'light';
  if (currentTheme === 'dark') {
    document.body.classList.add('dark-mode');
    updateThemeIcon('dark');
  }

  themeBtn.addEventListener('click', () => {
    if (document.body.classList.contains('dark-mode')) {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
      updateThemeIcon('light');
    } else {
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
      updateThemeIcon('dark');
    }
  });
}

function updateThemeIcon(theme) {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (!themeBtn) return;

  if (theme === 'dark') {
    themeBtn.innerHTML = '<i data-lucide="sun" style="width: 20px; height: 20px;"></i>';
  } else {
    themeBtn.innerHTML = '<i data-lucide="moon" style="width: 20px; height: 20px;"></i>';
  }
  lucide.createIcons();
}
