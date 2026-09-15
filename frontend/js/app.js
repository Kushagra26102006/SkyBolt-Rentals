/* ==========================================================================
   SkyBolt Rentals - Main Application, Navbar & Dark/Light Theme Engine
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initThemeEngine();
  initMobileMenu();
  setActiveNavLink();
  initNavbarAuthSession();
  initIndexSearchDates();
  initChatbotWidget();
  initScrollAnimations();
  initHeroParallax();
});

/**
 * Initialize Dark / Light Mode Theme Switching
 */
function initThemeEngine() {
  const storedTheme = localStorage.getItem('skybolt_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const currentTheme = storedTheme || (prefersDark ? 'dark' : 'light');

  applyTheme(currentTheme);

  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
      localStorage.setItem('skybolt_theme', newTheme);
      
      if (typeof showToast === 'function') {
        showToast(`${newTheme === 'dark' ? 'Dark' : 'Light'} mode enabled`, 'info');
      }
    });
  });
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  updateThemeToggleIcons(theme);
}

function updateThemeToggleIcons(theme) {
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    if (theme === 'dark') {
      btn.innerHTML = `<i class="fa-solid fa-sun" style="color: #F59E0B;"></i>`;
      btn.setAttribute('aria-label', 'Switch to light mode');
    } else {
      btn.innerHTML = `<i class="fa-solid fa-moon"></i>`;
      btn.setAttribute('aria-label', 'Switch to dark mode');
    }
  });
}

/**
 * Initialize Mobile Navigation Drawer Toggle
 */
function initMobileMenu() {
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');

  if (!navToggle || !navMenu) return;

  navToggle.addEventListener('click', () => {
    const isActive = navMenu.classList.toggle('active');
    navToggle.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    
    const icon = navToggle.querySelector('i');
    if (icon) {
      icon.className = isActive ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    }
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('active');
      const icon = navToggle.querySelector('i');
      if (icon) icon.className = 'fa-solid fa-bars';
    });
  });
}

/**
 * Highlight Current Page in Navigation Bar
 */
function setActiveNavLink() {
  const pathname = (window.location.pathname || '').replace(/\/$/, '') || '/';
  const pageName = pathname.split('/').pop().replace(/\.html$/, '') || 'index';
  const navLinks = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => {
    const rawHref = link.getAttribute('href') || '';
    if (!rawHref || rawHref.startsWith('#')) return;
    
    const cleanHref = rawHref.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
    const targetPage = cleanHref.split('/').pop().replace(/\.html$/, '') || 'index';
    
    if (targetPage === pageName || (pageName === 'index' && (targetPage === 'index' || cleanHref === '/'))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

/**
 * Safe storage accessor fallback
 */
function getStoredItemSafe(key, fallback = null) {
  if (typeof safeStorageGet === 'function') return safeStorageGet(key, fallback);
  try {
    const item = localStorage.getItem(key);
    return item !== null ? JSON.parse(item) : fallback;
  } catch (e) {
    return fallback;
  }
}

function setStoredItemSafe(key, value) {
  if (typeof safeStorageSet === 'function') return safeStorageSet(key, value);
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function removeStoredItemSafe(key) {
  if (typeof safeStorageRemove === 'function') return safeStorageRemove(key);
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Update Header Navbar Actions based on Active User Session
 * Server-authoritative session state verified via /auth/me
 */
async function initNavbarAuthSession() {
  const navActions = document.querySelector('.nav-actions');
  const mobileNavActions = document.querySelector('.nav-actions-mobile');
  let currentTheme = 'light';
  try {
    currentTheme = localStorage.getItem('skybolt_theme') || 'light';
  } catch (e) {}
  const themeIcon = currentTheme === 'dark' ? '<i class="fa-solid fa-sun" style="color: #F59E0B;"></i>' : '<i class="fa-solid fa-moon"></i>';

  let activeUser = null;

  // Verify server session via API
  if (window.SkyBoltApi) {
    try {
      const res = await window.SkyBoltApi.get('/auth/me');
      if (res && res.success && res.data && res.data.user) {
        activeUser = res.data.user;
        sessionStorage.setItem('skybolt_user_profile', JSON.stringify(activeUser));
      } else {
        sessionStorage.removeItem('skybolt_user_profile');
      }
    } catch {
      // Offline fallback: check non-sensitive profile cache
      try {
        const cached = sessionStorage.getItem('skybolt_user_profile');
        if (cached) activeUser = JSON.parse(cached);
      } catch {}
    }
  }

  const escape = window.escapeHtml || ((s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

  if (activeUser) {
    const rawName = activeUser.name || 'User';
    const userFirstName = escape(rawName.split(' ')[0]);
    const role = activeUser.role || 'CUSTOMER';
    const isAdmin = ['ADMIN', 'STAFF', 'FLEET_MANAGER'].includes(role);
    const isOwner = role === 'OWNER';
    
    if (navActions) {
      let roleLinks = '';
      if (isAdmin) {
        roleLinks = `<a href='/admin' class="btn btn-primary btn-sm"><i class="fa-solid fa-shield-halved"></i> Admin Dashboard</a>`;
      } else if (isOwner) {
        roleLinks = `
          <a href='/owner-dashboard' class="btn btn-primary btn-sm"><i class="fa-solid fa-gauge"></i> Owner Dashboard</a>
          <a href='/owner-dashboard#my-vehicles' class="btn btn-outline btn-sm"><i class="fa-solid fa-motorcycle"></i> My Vehicles</a>
        `;
      } else {
        roleLinks = `<a href='/dashboard' class="btn btn-outline btn-sm"><i class="fa-solid fa-user"></i> Dashboard</a>`;
      }

      navActions.innerHTML = `
        <button class="theme-toggle-btn" aria-label="Toggle theme">${themeIcon}</button>
        <span style="font-size: var(--fs-xs); font-weight: 600; color: var(--dark); display: inline-flex; align-items: center; gap: 4px;">
          <i class="fa-solid fa-user-circle text-primary"></i> Hi, ${userFirstName}
        </span>
        ${roleLinks}
        <button class="btn btn-dark btn-sm" id="btn-logout-nav">Logout</button>
      `;

      // Re-bind theme button in freshly rendered navActions
      const themeBtn = navActions.querySelector('.theme-toggle-btn');
      if (themeBtn) {
        themeBtn.addEventListener('click', () => {
          const activeTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
          const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
          applyTheme(newTheme);
          try { localStorage.setItem('skybolt_theme', newTheme); } catch (e) {}
          if (typeof showToast === 'function') {
            showToast(`${newTheme === 'dark' ? 'Dark' : 'Light'} mode enabled`, 'info');
          }
        });
      }
    }

    if (mobileNavActions) {
      let mobileLinks = '';
      if (isAdmin) {
        mobileLinks = `<a href='/admin' class="btn btn-primary">Admin Dashboard</a>`;
      } else if (isOwner) {
        mobileLinks = `
          <a href='/owner-dashboard' class="btn btn-primary">Owner Dashboard</a>
          <a href='/owner-dashboard#my-vehicles' class="btn btn-outline">My Vehicles</a>
        `;
      } else {
        mobileLinks = `<a href='/dashboard' class="btn btn-outline">My Dashboard (${userFirstName})</a>`;
      }

      mobileNavActions.innerHTML = `
        ${mobileLinks}
        <button class="btn btn-dark" id="btn-logout-mobile">Logout</button>
      `;
    }

    document.querySelectorAll('#btn-logout-nav, #btn-logout-mobile').forEach(btn => {
      btn.addEventListener('click', () => {
        logoutUserSession();
      });
    });
  } else {
    // Logged out state
    if (navActions) {
      navActions.innerHTML = `
        <button class="theme-toggle-btn" aria-label="Toggle theme">${themeIcon}</button>
        <a href="/login" class="btn btn-outline btn-sm" id="btn-login">Login</a>
        <a href="/register" class="btn btn-primary btn-sm" id="btn-register">Create Account</a>
      `;

      const themeBtn = navActions.querySelector('.theme-toggle-btn');
      if (themeBtn) {
        themeBtn.addEventListener('click', () => {
          const activeTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
          const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
          applyTheme(newTheme);
          try { localStorage.setItem('skybolt_theme', newTheme); } catch (e) {}
          if (typeof showToast === 'function') {
            showToast(`${newTheme === 'dark' ? 'Dark' : 'Light'} mode enabled`, 'info');
          }
        });
      }
    }

    if (mobileNavActions) {
      mobileNavActions.innerHTML = `
        <a href="/login" class="btn btn-outline">Login</a>
        <a href="/register" class="btn btn-primary">Create Account</a>
      `;
    }
  }

  // Ensure theme toggle icons match current theme
  updateThemeToggleIcons(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
}

function getActiveUserSession() {
  try {
    const cached = sessionStorage.getItem('skybolt_user_profile');
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return null;
}

async function logoutUserSession() {
  if (window.SkyBoltApi) {
    try {
      await window.SkyBoltApi.post('/auth/logout');
    } catch (err) {
      console.warn('[SkyBolt Auth] Server logout notice:', err);
    }
  }
  sessionStorage.removeItem('skybolt_user_profile');
  try { localStorage.removeItem('skybolt_user'); } catch (e) {}

  if (typeof showToast === 'function') {
    showToast('Logged out successfully', 'info');
  }
  setTimeout(() => {
    window.location.href = '/';
  }, 400);
}

/**
 * Initialize Landing Page Search Widget Dates
 */
function initIndexSearchDates() {
  const pickup = document.getElementById('pickup-date');
  const returnInput = document.getElementById('return-date');
  if (!pickup || !returnInput) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  pickup.min = todayStr;
  if (!pickup.value || pickup.value < todayStr) {
    pickup.value = todayStr;
  }

  const nextDay = new Date(pickup.value + 'T00:00:00');
  nextDay.setDate(nextDay.getDate() + 1);
  returnInput.min = nextDay.toISOString().split('T')[0];

  if (!returnInput.value || returnInput.value <= pickup.value) {
    const returnDay = new Date(pickup.value + 'T00:00:00');
    returnDay.setDate(returnDay.getDate() + 3);
    returnInput.value = returnDay.toISOString().split('T')[0];
  }

  pickup.addEventListener('change', () => {
    if (pickup.value < todayStr) {
      pickup.value = todayStr;
    }
    const nextMin = new Date(pickup.value + 'T00:00:00');
    nextMin.setDate(nextMin.getDate() + 1);
    returnInput.min = nextMin.toISOString().split('T')[0];
    if (returnInput.value <= pickup.value) {
      const newRet = new Date(pickup.value + 'T00:00:00');
      newRet.setDate(newRet.getDate() + 3);
      returnInput.value = newRet.toISOString().split('T')[0];
    }
  });

  returnInput.addEventListener('change', () => {
    if (returnInput.value <= pickup.value) {
      const newRet = new Date(pickup.value + 'T00:00:00');
      newRet.setDate(newRet.getDate() + 1);
      returnInput.value = newRet.toISOString().split('T')[0];
    }
  });
}

/**
 * Initialize AI Chatbot Widget (Platform-wide)
 */
function initChatbotWidget() {
  if (window.SkyBoltConfig && window.SkyBoltConfig.featureFlags && window.SkyBoltConfig.featureFlags.enableAi === false) {
    return;
  }
  if (!document.querySelector('script[src*="chatbot.js"]') && !window.SkyBoltChatbotWidget) {
    const s = document.createElement('script');
    s.src = 'js/chatbot.js';
    s.defer = true;
    document.body.appendChild(s);
  }
}

/**
 * Initialize Smooth Viewport Scroll-Reveal Animations
 */
function initScrollAnimations() {
  // Check reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.reveal-on-scroll, .reveal-stagger-item').forEach(el => {
      el.classList.add('revealed');
    });
    return;
  }

  // Auto-tag sections, cards, and headers for smooth entrance
  const targets = document.querySelectorAll(`
    .section-header,
    .search-widget-card,
    .process-card,
    .category-card,
    .vehicle-card,
    .feature-card,
    .benefit-item,
    .stat-card,
    .faq-item
  `);

  targets.forEach((el, idx) => {
    if (!el.classList.contains('reveal-on-scroll') && !el.classList.contains('reveal-stagger-item')) {
      el.classList.add('reveal-on-scroll');
      const staggerClass = `delay-${(idx % 4) + 1}`;
      el.classList.add(staggerClass);
    }
  });

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal-on-scroll, .reveal-stagger-item').forEach(el => el.classList.add('revealed'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        obs.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    threshold: 0.08,
    rootMargin: '0px 0px -40px 0px'
  });

  document.querySelectorAll('.reveal-on-scroll, .reveal-stagger-item').forEach(el => {
    observer.observe(el);
  });
}

/**
 * Initialize Hero Image Interactive Mouse Parallax
 */
function initHeroParallax() {
  const heroSection = document.querySelector('.hero');
  const heroWrapper = document.querySelector('.hero-image-wrapper');
  if (!heroSection || !heroWrapper) return;
  if (window.matchMedia('(pointer: coarse)').matches) return; // Skip touch devices

  let ticking = false;

  heroSection.addEventListener('mousemove', (e) => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const rect = heroSection.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      const tiltX = (y * -6).toFixed(2);
      const tiltY = (x * 8).toFixed(2);

      heroWrapper.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-4px)`;
      ticking = false;
    });
  });

  heroSection.addEventListener('mouseleave', () => {
    heroWrapper.style.transform = '';
  });
}

