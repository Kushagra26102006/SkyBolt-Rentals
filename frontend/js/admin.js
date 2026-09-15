/* ==========================================================================
   SkyBolt Rentals - Production Admin Operational Dashboard Engine
   Enforces authoritative operational control, real-time telemetry,
   server-side pagination, debounced filters, and RBAC privilege checks.
   ========================================================================== */

(function(global) {
  'use strict';

  let currentUser = null;
  let activeTab = 'overview';
  let liveAlerts = [];

  // Pagination states
  const pagination = {
    bookings: { page: 1, limit: 10, totalPages: 1 },
    fleet: { page: 1, limit: 10, totalPages: 1 },
    maintenance: { page: 1, limit: 10, totalPages: 1 },
    inspections: { page: 1, limit: 10, totalPages: 1 },
    transfers: { page: 1, limit: 10, totalPages: 1 },
    payments: { page: 1, limit: 10, totalPages: 1 },
    users: { page: 1, limit: 10, totalPages: 1 },
    audit: { page: 1, limit: 10, totalPages: 1 },
    reviews: { page: 1, limit: 10, totalPages: 1 },
    reports: { page: 1, limit: 10, totalPages: 1 }
  };

  // Active filter states
  const filters = {
    bookings: { search: '', status: '', paymentStatus: '' },
    fleet: { search: '', status: '', category: '' },
    maintenance: { status: '', priority: '' },
    inspections: { result: '', type: '' },
    transfers: { status: '' },
    payments: { search: '', status: '' },
    users: { search: '', role: '', status: '' },
    audit: { entityType: '', action: '' },
    reviews: { status: '', rating: '' },
    reports: { status: '' }
  };

  /**
   * Initialize Admin Dashboard on DOM Ready
   */
  async function initAdminDashboard() {
    setupTabNavigation();
    setupAlertsMenu();
    setupActionListeners();
    await verifyAdminSession();
    await loadOverview();
  }

  /**
   * Verify authenticated user session & RBAC authorization
   */
  async function verifyAdminSession() {
    const urlParams = new URLSearchParams(window.location.search);
    const isDemo = urlParams.get('demo') === 'true' || urlParams.get('mock') === 'true';

    try {
      const res = await global.SkyBoltApi.get('/auth/me');
      currentUser = res.data?.user || res.data;

      if (!currentUser && isDemo) {
        currentUser = {
          id: 'demo-admin-id',
          name: 'Chief Fleet Admin (Demo)',
          email: 'admin.demo@skybolt.test',
          role: 'ADMIN',
          status: 'ACTIVE'
        };
      } else if (!currentUser) {
        window.location.href = '/login';
        return;
      }

      // Check operational role
      const allowedRoles = ['STAFF', 'FLEET_MANAGER', 'ADMIN'];
      if (!allowedRoles.includes(currentUser.role)) {
        if (typeof global.showToast === 'function') {
          global.showToast('Access Denied. Operational credentials required.', 'error');
        }
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1200);
        return;
      }

      // Update Topbar UI
      const userNameEl = document.getElementById('admin-user-name');
      const userRoleEl = document.getElementById('admin-user-role');
      if (userNameEl) userNameEl.textContent = currentUser.name || currentUser.email;
      if (userRoleEl) {
        userRoleEl.textContent = currentUser.role;
        if (currentUser.role === 'ADMIN') {
          userRoleEl.style.background = '#7c3aed';
        } else if (currentUser.role === 'FLEET_MANAGER') {
          userRoleEl.style.background = '#0284c7';
        }
      }

      // Enforce role visibility on Users Tab (ADMIN only)
      if (currentUser.role !== 'ADMIN') {
        const usersTableContainer = document.getElementById('users-table-container');
        const usersAccessDenied = document.getElementById('users-access-denied');
        if (usersTableContainer) usersTableContainer.style.display = 'none';
        if (usersAccessDenied) usersAccessDenied.style.display = 'block';
      }
    } catch (err) {
      console.warn('[Admin] Auth verification notice:', err);
      if (isDemo) {
        currentUser = {
          id: 'demo-admin-id',
          name: 'Chief Fleet Admin (Demo)',
          email: 'admin.demo@skybolt.test',
          role: 'ADMIN',
          status: 'ACTIVE'
        };
        const userNameEl = document.getElementById('admin-user-name');
        const userRoleEl = document.getElementById('admin-user-role');
        if (userNameEl) userNameEl.textContent = currentUser.name;
        if (userRoleEl) {
          userRoleEl.textContent = currentUser.role;
          userRoleEl.style.background = '#7c3aed';
        }
      } else {
        window.location.href = '/login';
      }
    }
  }

  /**
   * Tab Navigation Setup
   */
  function setupTabNavigation() {
    const navItems = document.querySelectorAll('.admin-nav-item[data-tab]');
    navItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });
  }

  function switchTab(tabId) {
    activeTab = tabId;

    // Update nav buttons
    document.querySelectorAll('.admin-nav-item[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    // Update content panes
    document.querySelectorAll('.admin-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `pane-${tabId}`);
    });

    // Update breadcrumbs
    const crumbEl = document.getElementById('current-crumb');
    if (crumbEl) {
      const titles = {
        overview: 'Overview',
        bookings: 'Bookings & Handovers',
        fleet: 'Fleet Operations',
        vehicles: 'Vehicles Dossier',
        hubs: 'Hubs Logistics',
        maintenance: 'Maintenance & Work Orders',
        inspections: 'Safety Inspections',
        transfers: 'Inter-Hub Transfers',
        payments: 'Payments & Reconciliation',
        users: 'User & Staff Management',
        audit: 'System Audit Trail',
        reviews: 'Reviews & Content Moderation',
        queues: 'Queues & Background Workers',
        recommendations: 'AI Recommendation Engine'
      };
      crumbEl.textContent = titles[tabId] || tabId;
    }

    // Trigger tab data load
    triggerTabDataLoad(tabId);
  }

  function triggerTabDataLoad(tabId) {
    switch (tabId) {
      case 'overview':
        loadOverview();
        break;
      case 'bookings':
        loadBookings();
        break;
      case 'fleet':
        loadFleet();
        break;
      case 'hubs':
        loadHubs();
        break;
      case 'maintenance':
        loadMaintenance();
        break;
      case 'inspections':
        loadInspections();
        break;
      case 'transfers':
        loadTransfers();
        break;
      case 'payments':
        loadPayments();
        break;
      case 'users':
        if (currentUser && currentUser.role === 'ADMIN') {
          loadUsers();
        }
        break;
      case 'audit':
        loadAuditLogs();
        break;
      case 'reviews':
        loadReviewsTab();
        break;
      case 'queues':
        loadQueueTab();
        break;
      case 'recommendations':
        loadRecommendationTab();
        break;
    }
  }

  /**
   * Health Alerts Dropdown & Notification Bell
   */
  function setupAlertsMenu() {
    const toggleBtn = document.getElementById('btn-alerts-toggle');
    const menu = document.getElementById('alerts-popover-menu');

    if (toggleBtn && menu) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('active');
      });

      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== toggleBtn) {
          menu.classList.remove('active');
        }
      });
    }
  }

  /**
   * Global Action Listeners & Debouncing
   */
  function setupActionListeners() {
    // Refresh buttons
    bindClick('btn-refresh-overview', loadOverview);
    bindClick('btn-refresh-bookings', loadBookings);
    bindClick('btn-refresh-fleet', loadFleet);
    bindClick('btn-refresh-maintenance', loadMaintenance);
    bindClick('btn-refresh-inspections', loadInspections);
    bindClick('btn-refresh-transfers', loadTransfers);
    bindClick('btn-refresh-payments', loadPayments);
    bindClick('btn-refresh-users', loadUsers);
    bindClick('btn-refresh-audit', loadAuditLogs);

    // Logout button
    bindClick('btn-admin-logout', async () => {
      try {
        await global.SkyBoltApi.post('/auth/logout');
      } catch (e) {}
      window.location.href = '/login';
    });

    // Bookings filters
    const bSearch = document.getElementById('bookings-search');
    if (bSearch) {
      bSearch.addEventListener('input', debounce((e) => {
        filters.bookings.search = e.target.value.trim();
        pagination.bookings.page = 1;
        loadBookings();
      }, 350));
    }
    const bStatus = document.getElementById('bookings-status-filter');
    if (bStatus) {
      bStatus.addEventListener('change', (e) => {
        filters.bookings.status = e.target.value;
        pagination.bookings.page = 1;
        loadBookings();
      });
    }
    const bPayment = document.getElementById('bookings-payment-filter');
    if (bPayment) {
      bPayment.addEventListener('change', (e) => {
        filters.bookings.paymentStatus = e.target.value;
        pagination.bookings.page = 1;
        loadBookings();
      });
    }

    // Pagination buttons
    bindClick('btn-bookings-prev', () => changePage('bookings', -1, loadBookings));
    bindClick('btn-bookings-next', () => changePage('bookings', 1, loadBookings));
    bindClick('btn-fleet-prev', () => changePage('fleet', -1, loadFleet));
    bindClick('btn-fleet-next', () => changePage('fleet', 1, loadFleet));
    bindClick('btn-maintenance-prev', () => changePage('maintenance', -1, loadMaintenance));
    bindClick('btn-maintenance-next', () => changePage('maintenance', 1, loadMaintenance));
    bindClick('btn-inspections-prev', () => changePage('inspections', -1, loadInspections));
    bindClick('btn-inspections-next', () => changePage('inspections', 1, loadInspections));
    bindClick('btn-transfers-prev', () => changePage('transfers', -1, loadTransfers));
    bindClick('btn-transfers-next', () => changePage('transfers', 1, loadTransfers));
    bindClick('btn-payments-prev', () => changePage('payments', -1, loadPayments));
    bindClick('btn-payments-next', () => changePage('payments', 1, loadPayments));
    bindClick('btn-users-prev', () => changePage('users', -1, loadUsers));
    bindClick('btn-users-next', () => changePage('users', 1, loadUsers));
    bindClick('btn-audit-prev', () => changePage('audit', -1, loadAuditLogs));
    bindClick('btn-audit-next', () => changePage('audit', 1, loadAuditLogs));
    bindClick('btn-refresh-reviews', loadReviewsTab);

    // Reviews & Reports Subtabs
    bindClick('subtab-reviews-btn', () => {
      const pRev = document.getElementById('subpane-reviews');
      const pRep = document.getElementById('subpane-reports');
      if (pRev) pRev.style.display = 'block';
      if (pRep) pRep.style.display = 'none';
      const rBtn = document.getElementById('subtab-reviews-btn');
      const repBtn = document.getElementById('subtab-reports-btn');
      if (rBtn) { rBtn.style.borderBottom = '2px solid var(--primary)'; rBtn.style.color = 'var(--primary)'; rBtn.style.fontWeight = '700'; }
      if (repBtn) { repBtn.style.borderBottom = 'none'; repBtn.style.color = 'var(--text-muted)'; repBtn.style.fontWeight = '600'; }
    });
    bindClick('subtab-reports-btn', () => {
      const pRev = document.getElementById('subpane-reviews');
      const pRep = document.getElementById('subpane-reports');
      if (pRev) pRev.style.display = 'none';
      if (pRep) pRep.style.display = 'block';
      const rBtn = document.getElementById('subtab-reviews-btn');
      const repBtn = document.getElementById('subtab-reports-btn');
      if (repBtn) { repBtn.style.borderBottom = '2px solid var(--primary)'; repBtn.style.color = 'var(--primary)'; repBtn.style.fontWeight = '700'; }
      if (rBtn) { rBtn.style.borderBottom = 'none'; rBtn.style.color = 'var(--text-muted)'; rBtn.style.fontWeight = '600'; }
      loadAdminReports();
    });

    // Reviews Filters
    const revStatus = document.getElementById('admin-rev-status-filter');
    if (revStatus) {
      revStatus.addEventListener('change', (e) => {
        filters.reviews.status = e.target.value;
        pagination.reviews.page = 1;
        loadAdminReviews();
      });
    }
    const revRating = document.getElementById('admin-rev-rating-filter');
    if (revRating) {
      revRating.addEventListener('change', (e) => {
        filters.reviews.rating = e.target.value;
        pagination.reviews.page = 1;
        loadAdminReviews();
      });
    }
    const repStatus = document.getElementById('admin-rep-status-filter');
    if (repStatus) {
      repStatus.addEventListener('change', (e) => {
        filters.reports.status = e.target.value;
        pagination.reports.page = 1;
        loadAdminReports();
      });
    }

    // Reviews & Reports Pagination
    bindClick('btn-rev-prev', () => changePage('reviews', -1, loadAdminReviews));
    bindClick('btn-rev-next', () => changePage('reviews', 1, loadAdminReviews));
    bindClick('btn-rep-prev', () => changePage('reports', -1, loadAdminReports));
    bindClick('btn-rep-next', () => changePage('reports', 1, loadAdminReports));

    // Report Resolution submit
    bindClick('btn-submit-report-resolution', handleReportResolutionSubmit);

    // Queues Controls
    bindClick('btn-refresh-queues', loadQueueMetrics);
    bindClick('btn-refresh-jobs', loadQueueJobs);
    bindClick('btn-queue-prev', () => {
      if (queueCurrentPage > 1) {
        queueCurrentPage--;
        loadQueueJobs();
      }
    });
    bindClick('btn-queue-next', () => {
      queueCurrentPage++;
      loadQueueJobs();
    });
    const qNameFilter = document.getElementById('admin-queue-name-filter');
    if (qNameFilter) {
      qNameFilter.addEventListener('change', () => {
        queueCurrentPage = 1;
        loadQueueJobs();
      });
    }
    const qStatusFilter = document.getElementById('admin-queue-status-filter');
    if (qStatusFilter) {
      qStatusFilter.addEventListener('change', () => {
        queueCurrentPage = 1;
        loadQueueJobs();
      });
    }

    // Vehicle Dossier Lookup
    bindClick('btn-lookup-dossier', () => {
      const input = document.getElementById('dossier-search-input');
      if (input && input.value.trim()) {
        inspectVehicleDossier(input.value.trim());
      }
    });

    // Users filters
    const uSearch = document.getElementById('users-search');
    if (uSearch) {
      uSearch.addEventListener('input', debounce((e) => {
        filters.users.search = e.target.value.trim();
        pagination.users.page = 1;
        loadUsers();
      }, 350));
    }
    const uRole = document.getElementById('users-role-filter');
    if (uRole) {
      uRole.addEventListener('change', (e) => {
        filters.users.role = e.target.value;
        pagination.users.page = 1;
        loadUsers();
      });
    }
    const uStatus = document.getElementById('users-status-filter');
    if (uStatus) {
      uStatus.addEventListener('change', (e) => {
        filters.users.status = e.target.value;
        pagination.users.page = 1;
        loadUsers();
      });
    }
  }

  function bindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  }

  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function changePage(section, delta, loaderFn) {
    const current = pagination[section].page;
    const next = current + delta;
    if (next >= 1 && next <= pagination[section].totalPages) {
      pagination[section].page = next;
      loaderFn();
    }
  }

  // =========================================================================
  // 1. OVERVIEW TELEMETRY & OPERATIONAL HEALTH
  // =========================================================================
  async function loadOverview() {
    try {
      const res = await global.SkyBoltApi.get('/admin/dashboard/overview');
      const data = res.data;
      if (!data) return;

      // Update KPI figures
      setElText('kpi-available-vehs', data.vehicles?.available || 0);
      setElText('kpi-active-rentals', data.vehicles?.activeRental || 0);
      setElText('kpi-maintenance-vehs', data.vehicles?.maintenance || 0);
      setElText('kpi-inspection-vehs', data.vehicles?.inspection || 0);
      setElText('kpi-revenue-total', '₹' + (data.payments?.totalRevenueInr || 0).toLocaleString('en-IN'));
      setElText('kpi-hub-occupancy', (data.hubs?.occupancyPercent || 0) + '%');

      // Update Alerts
      liveAlerts = data.alerts || [];
      renderOperationalAlerts(liveAlerts);

      // Render Recent Audit Stream
      renderRecentAuditStream(data.recentActivity || []);
    } catch (err) {
      console.warn('[Admin] Overview load error:', err);
      if (typeof global.showToast === 'function') {
        global.showToast('Failed to fetch authoritative telemetry', 'error');
      }
    }
  }

  function renderOperationalAlerts(alerts) {
    const counterBadge = document.getElementById('alerts-counter-badge');
    const menuCount = document.getElementById('alerts-menu-count');
    const popoverItems = document.getElementById('alerts-popover-items');
    const grid = document.getElementById('overview-alerts-grid');
    const healthTag = document.getElementById('system-health-tag');

    if (counterBadge) {
      if (alerts.length > 0) {
        counterBadge.textContent = alerts.length;
        counterBadge.style.display = 'block';
      } else {
        counterBadge.style.display = 'none';
      }
    }

    if (menuCount) {
      menuCount.textContent = `${alerts.length} Active`;
    }

    if (healthTag) {
      if (alerts.some((a) => a.severity === 'CRITICAL')) {
        healthTag.className = 'badge-pill badge-retired';
        healthTag.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Critical Attention Needed';
      } else if (alerts.length > 0) {
        healthTag.className = 'badge-pill badge-maintenance';
        healthTag.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Operational Warnings';
      } else {
        healthTag.className = 'badge-pill badge-available';
        healthTag.innerHTML = '<i class="fa-solid fa-circle-check"></i> Systems Operational';
      }
    }

    // Render in popover
    if (popoverItems) {
      if (alerts.length === 0) {
        popoverItems.innerHTML = '<p style="color: var(--text-muted); font-size: var(--fs-xs); text-align: center; padding: 20px;">No operational issues detected.</p>';
      } else {
        popoverItems.innerHTML = alerts
          .map((a) => {
            const sevClass = a.severity.toLowerCase();
            return `
              <div class="alert-item-card ${sevClass}" onclick="document.getElementById('alerts-popover-menu').classList.remove('active'); window.location.hash='${a.actionLink || ''}';">
                <i class="fa-solid fa-triangle-exclamation" style="margin-top: 2px;"></i>
                <div>
                  <strong>${escapeHtml(a.title)}</strong>
                  <div style="margin-top: 2px;">${escapeHtml(a.message)}</div>
                </div>
              </div>
            `;
          })
          .join('');
      }
    }

    // Render in overview grid
    if (grid) {
      if (alerts.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted); font-size: var(--fs-sm); grid-column: 1 / -1; margin-bottom: 0;"><i class="fa-solid fa-circle-check text-success"></i> All hubs, vehicles, inspections, and payments operating within normal nominal parameters.</p>';
      } else {
        grid.innerHTML = alerts
          .map((a) => {
            const sevClass = a.severity.toLowerCase();
            return `
              <div class="alert-item-card ${sevClass}" style="padding: 14px; margin-bottom: 0;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.1rem; margin-top: 2px;"></i>
                <div>
                  <strong style="font-size: var(--fs-sm);">${escapeHtml(a.title)}</strong>
                  <div style="margin-top: 4px; font-size: var(--fs-xs);">${escapeHtml(a.message)}</div>
                  ${a.actionLink ? `<a href="${a.actionLink}" class="btn btn-outline btn-sm" style="margin-top: 8px; display: inline-block; padding: 3px 8px; font-size: 0.72rem;">Resolve in Panel &rarr;</a>` : ''}
                </div>
              </div>
            `;
          })
          .join('');
      }
    }
  }

  function renderRecentAuditStream(items) {
    const tbody = document.getElementById('overview-recent-audit-body');
    if (!tbody) return;

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">No audit activity recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = items
      .map((item) => `
        <tr>
          <td style="color: var(--text-muted);">${formatDate(item.timestamp)}</td>
          <td><strong>${escapeHtml(item.actorEmail)}</strong></td>
          <td><span class="badge-pill badge-rental">${escapeHtml(item.actorRole)}</span></td>
          <td><code>${escapeHtml(item.action)}</code></td>
          <td><span class="badge-pill badge-available">${escapeHtml(item.entityType)}</span></td>
          <td style="font-family: monospace; font-size: 0.75rem;">${escapeHtml(item.entityId)}</td>
        </tr>
      `)
      .join('');
  }

  // =========================================================================
  // 2. BOOKINGS OPERATIONS & HANDOVER
  // =========================================================================
  async function loadBookings() {
    const tbody = document.getElementById('bookings-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading authoritative bookings...</td></tr>';
    }

    try {
      const params = new URLSearchParams({
        page: pagination.bookings.page,
        limit: pagination.bookings.limit
      });
      if (filters.bookings.search) params.append('search', filters.bookings.search);
      if (filters.bookings.status) params.append('status', filters.bookings.status);
      if (filters.bookings.paymentStatus) params.append('paymentStatus', filters.bookings.paymentStatus);

      const res = await global.SkyBoltApi.get(`/admin/bookings?${params.toString()}`);
      const data = res.data || [];
      const meta = res.meta || { page: 1, totalPages: 1, total: data.length };

      pagination.bookings.page = meta.page;
      pagination.bookings.totalPages = meta.totalPages || 1;
      updatePageInfo('bookings', meta);

      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No matching bookings found.</td></tr>';
        return;
      }

      tbody.innerHTML = data
        .map((b) => {
          const statusBadge = getStatusBadge(b.status);
          const paymentBadge = getPaymentBadge(b.paymentStatus);
          return `
            <tr>
              <td>
                <strong>${escapeHtml(b.bookingReference)}</strong>
                <div style="font-size: 0.7rem; color: var(--text-muted);">${formatDate(b.createdAt)}</div>
              </td>
              <td>
                <div>${escapeHtml(b.customer?.name || 'Customer')}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(b.customer?.email || '')}</div>
              </td>
              <td>
                <div><strong>${escapeHtml(b.vehicle?.brand || '')} ${escapeHtml(b.vehicle?.model || '')}</strong></div>
                <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(b.vehicle?.registrationNumber || '')}</div>
              </td>
              <td style="font-size: var(--fs-xs);">
                <div><i class="fa-solid fa-arrow-right-from-bracket text-primary"></i> ${formatDate(b.pickupAt)}</div>
                <div><i class="fa-solid fa-arrow-right-to-bracket text-secondary"></i> ${formatDate(b.returnAt)}</div>
              </td>
              <td>${statusBadge}</td>
              <td>${paymentBadge}</td>
              <td><strong>₹${(b.pricing?.total || 0).toLocaleString('en-IN')}</strong></td>
              <td style="text-align: right;">
                <button class="btn btn-outline btn-sm btn-inspect-booking" data-booking='${JSON.stringify(b).replace(/'/g, "&apos;")}'>Dossier</button>
              </td>
            </tr>
          `;
        })
        .join('');

      // Bind inspect buttons
      document.querySelectorAll('.btn-inspect-booking').forEach((btn) => {
        btn.addEventListener('click', () => {
          const booking = JSON.parse(btn.getAttribute('data-booking'));
          openBookingModal(booking);
        });
      });
    } catch (err) {
      console.warn('[Admin] Bookings load error:', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--danger);">Failed to load bookings.</td></tr>';
    }
  }

  function openBookingModal(b) {
    const modal = document.getElementById('ops-booking-modal');
    const title = document.getElementById('booking-modal-title');
    const content = document.getElementById('booking-modal-content');
    const footer = document.getElementById('booking-modal-footer');

    if (!modal || !content) return;

    if (title) title.textContent = `Booking Dossier: ${b.bookingReference}`;

    content.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin-bottom: var(--space-4);">
        <div class="card" style="padding: 14px;">
          <h4 style="font-size: var(--fs-sm); margin-bottom: 8px;"><i class="fa-solid fa-user text-primary"></i> Customer Information</h4>
          <div><strong>${escapeHtml(b.customer?.name || 'Customer')}</strong></div>
          <div style="font-size: var(--fs-xs); color: var(--text-muted);">${escapeHtml(b.customer?.email || '')}</div>
          <div style="font-size: var(--fs-xs); color: var(--text-muted);">${escapeHtml(b.customer?.phone || '')}</div>
        </div>

        <div class="card" style="padding: 14px;">
          <h4 style="font-size: var(--fs-sm); margin-bottom: 8px;"><i class="fa-solid fa-car text-primary"></i> Assigned Vehicle</h4>
          <div><strong>${escapeHtml(b.vehicle?.brand || '')} ${escapeHtml(b.vehicle?.model || '')}</strong></div>
          <div style="font-size: var(--fs-xs); color: var(--text-muted); font-family: monospace;">${escapeHtml(b.vehicle?.registrationNumber || 'No Plate')}</div>
          <div style="font-size: var(--fs-xs); color: var(--text-muted);">Category: ${escapeHtml(b.vehicle?.category || 'Standard')}</div>
        </div>
      </div>

      <div class="card" style="padding: 14px; margin-bottom: var(--space-4);">
        <h4 style="font-size: var(--fs-sm); margin-bottom: 8px;"><i class="fa-solid fa-route text-primary"></i> Rental Itinerary &amp; Logistics</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: var(--fs-xs);">
          <div>Pickup: <strong>${escapeHtml(b.pickupLocation || 'Main Hub')}</strong> (${formatDate(b.pickupAt)})</div>
          <div>Return: <strong>${escapeHtml(b.returnLocation || 'Main Hub')}</strong> (${formatDate(b.returnAt)})</div>
          <div>Booking Status: ${getStatusBadge(b.status)}</div>
          <div>Payment Status: ${getPaymentBadge(b.paymentStatus)}</div>
        </div>
      </div>

      <div class="card" style="padding: 14px; margin-bottom: var(--space-4);">
        <h4 style="font-size: var(--fs-sm); margin-bottom: 8px;"><i class="fa-solid fa-receipt text-primary"></i> Authoritative Financial Summary</h4>
        <div style="display: flex; justify-content: space-between; font-size: var(--fs-xs); margin-bottom: 4px;">
          <span>Rental Duration:</span>
          <span>${b.pricing?.days || 1} day(s)</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: var(--fs-xs); margin-bottom: 4px;">
          <span>Subtotal:</span>
          <span>₹${(b.pricing?.subtotal || 0).toLocaleString('en-IN')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: var(--fs-xs); margin-bottom: 4px;">
          <span>Taxes (GST):</span>
          <span>₹${(b.pricing?.gst || 0).toLocaleString('en-IN')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: var(--fs-xs); margin-bottom: 4px;">
          <span>Refundable Security Deposit:</span>
          <span>₹${(b.pricing?.securityDeposit || 0).toLocaleString('en-IN')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: var(--fs-sm); border-top: 1px solid var(--border); padding-top: 6px; margin-top: 6px;">
          <span>Authoritative Total:</span>
          <span>₹${(b.pricing?.total || 0).toLocaleString('en-IN')}</span>
        </div>
      </div>
    `;

    // Operational Handover Triggers (Task 11 Handover endpoints)
    if (footer) {
      let actionButtons = `<button class="btn btn-outline btn-sm" onclick="document.getElementById('ops-booking-modal').classList.remove('active');">Close</button>`;

      if (b.status === 'CONFIRMED') {
        actionButtons = `
          <button class="btn btn-primary btn-sm btn-pickup-action" data-id="${b.id}"><i class="fa-solid fa-key"></i> Execute Pickup Handover</button>
          ${actionButtons}
        `;
      } else if (b.status === 'ACTIVE') {
        actionButtons = `
          <button class="btn btn-success btn-sm btn-return-action" data-id="${b.id}" style="background: #059669; color: white;"><i class="fa-solid fa-circle-check"></i> Process Return Handover</button>
          ${actionButtons}
        `;
      }
      footer.innerHTML = actionButtons;

      const pickupBtn = footer.querySelector('.btn-pickup-action');
      if (pickupBtn) {
        pickupBtn.addEventListener('click', async () => {
          await executeBookingPickup(b.id);
          modal.classList.remove('active');
        });
      }

      const returnBtn = footer.querySelector('.btn-return-action');
      if (returnBtn) {
        returnBtn.addEventListener('click', async () => {
          await executeBookingReturn(b.id);
          modal.classList.remove('active');
        });
      }
    }

    modal.classList.add('active');
  }

  async function executeBookingPickup(bookingId) {
    const odo = prompt('Enter vehicle odometer reading at customer pickup (km):', '12000');
    if (odo === null) return;

    try {
      await global.SkyBoltApi.post(`/fleet/bookings/${bookingId}/pickup`, {
        odometer: Number(odo) || 0
      });
      if (typeof global.showToast === 'function') {
        global.showToast('Vehicle pickup successfully executed. State transitioned to ACTIVE_RENTAL.', 'success');
      }
      loadBookings();
      loadOverview();
    } catch (err) {
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Pickup failed', 'error');
      }
    }
  }

  async function executeBookingReturn(bookingId) {
    const odo = prompt('Enter vehicle return odometer reading (km):', '12250');
    if (odo === null) return;

    try {
      await global.SkyBoltApi.post(`/fleet/bookings/${bookingId}/return`, {
        odometer: Number(odo) || 0
      });
      if (typeof global.showToast === 'function') {
        global.showToast('Vehicle return processed. Vehicle transitioned to INSPECTION for quality check.', 'success');
      }
      loadBookings();
      loadOverview();
    } catch (err) {
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Return handover failed', 'error');
      }
    }
  }

  // =========================================================================
  // 3. FLEET OPERATIONS
  // =========================================================================
  async function loadFleet() {
    const tbody = document.getElementById('fleet-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading fleet inventory...</td></tr>';
    }

    try {
      const params = new URLSearchParams({
        page: pagination.fleet.page,
        limit: pagination.fleet.limit
      });
      if (filters.fleet.search) params.append('search', filters.fleet.search);
      if (filters.fleet.status) params.append('fleetStatus', filters.fleet.status);
      if (filters.fleet.category) params.append('category', filters.fleet.category);

      const res = await global.SkyBoltApi.get(`/fleet?${params.toString()}`);
      const data = res.data || [];
      const meta = res.meta || res.pagination || { page: 1, totalPages: 1, total: data.length };

      pagination.fleet.page = meta.page;
      pagination.fleet.totalPages = meta.totalPages || 1;
      updatePageInfo('fleet', meta);

      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">No fleet vehicles match criteria.</td></tr>';
        return;
      }

      tbody.innerHTML = data
        .map((v) => {
          const statusBadge = getFleetStatusBadge(v.fleetStatus);
          return `
            <tr>
              <td>
                <strong>${escapeHtml(v.brand)} ${escapeHtml(v.model)}</strong>
                <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(v.registrationNumber || v.vehicleCode || 'UNREGISTERED')}</div>
              </td>
              <td><span class="badge-pill badge-available">${escapeHtml(v.category)}</span></td>
              <td>${v.currentHubId ? escapeHtml(v.currentHubId.name || v.currentHubId.code || 'Assigned Hub') : '<span style="color: var(--danger);">Unhubbed</span>'}</td>
              <td>${statusBadge}</td>
              <td>${(v.odometer || 0).toLocaleString()} km</td>
              <td>
                <span class="badge-pill ${v.fleetStatus === 'AVAILABLE' ? 'badge-available' : 'badge-maintenance'}">
                  ${v.fleetStatus === 'AVAILABLE' ? 'Ready for Rent' : 'Gated'}
                </span>
              </td>
              <td style="text-align: right;">
                ${v.status === 'PENDING_APPROVAL' ? `
                  <button class="btn btn-sm btn-primary" onclick="SkyBoltAdmin.approveVehicleListing('${v.id}', 'ACTIVE')" title="Approve Listing" style="margin-right: 4px;"><i class="fa-solid fa-check"></i> Approve</button>
                  <button class="btn btn-sm btn-outline" style="color: var(--danger); margin-right: 4px;" onclick="SkyBoltAdmin.approveVehicleListing('${v.id}', 'REJECTED')" title="Reject Listing"><i class="fa-solid fa-xmark"></i> Reject</button>
                ` : ''}
                <button class="btn btn-outline btn-sm" onclick="SkyBoltAdmin.inspectVehicle('${v.id}')">Dossier</button>
              </td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      console.warn('[Admin] Fleet load error:', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--danger);">Failed to load fleet data.</td></tr>';
    }
  }

  // =========================================================================
  // 4. VEHICLE OPERATIONS DOSSIER
  // =========================================================================
  async function inspectVehicleDossier(vehicleId) {
    const area = document.getElementById('dossier-results-area');
    if (area) {
      area.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Retrieving authoritative vehicle dossier...</p>';
    }

    try {
      const res = await global.SkyBoltApi.get(`/admin/vehicles/${vehicleId}/operations`);
      const d = res.data;
      if (!d) return;

      const v = d.vehicle;
      const r = d.readiness || {};

      area.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
          <div class="card" style="padding: var(--space-5);">
            <h3 style="font-size: 1.1rem; margin-bottom: 8px;">${escapeHtml(v.brand)} ${escapeHtml(v.model)}</h3>
            <div style="font-family: monospace; font-weight: 700; color: var(--primary); margin-bottom: 8px;">Plate: ${escapeHtml(v.registrationNumber || 'None')}</div>
            <div style="font-size: var(--fs-xs); display: flex; flex-direction: column; gap: 4px;">
              <div>Status: ${getFleetStatusBadge(v.fleetStatus)}</div>
              <div>Odometer: <strong>${(v.odometer || 0).toLocaleString()} km</strong></div>
              <div>Assigned Hub: <strong>${d.hub ? escapeHtml(d.hub.name) : 'None'}</strong></div>
              <div>Fuel: <strong>${escapeHtml(v.specifications?.fuelType || 'Petrol')}</strong></div>
            </div>
          </div>

          <div class="card" style="padding: var(--space-5); border-left: 4px solid ${r.isReady ? '#059669' : '#ea580c'};">
            <h3 style="font-size: 1.1rem; margin-bottom: 8px;"><i class="fa-solid fa-clipboard-check"></i> Readiness Assessment</h3>
            <div style="margin-bottom: 8px;">
              <span class="badge-pill ${r.isReady ? 'badge-available' : 'badge-maintenance'}">${r.isReady ? 'RENTAL AUTHORIZED' : 'RENTAL GATED'}</span>
            </div>
            <div style="font-size: var(--fs-xs); color: var(--text-muted);">
              ${r.gatingReasons && r.gatingReasons.length > 0 ? `<ul style="margin: 0; padding-left: 16px; color: var(--danger);">${r.gatingReasons.map((re) => `<li>${escapeHtml(re)}</li>`).join('')}</ul>` : 'All vehicle safety standards satisfied.'}
            </div>
          </div>
        </div>

        <!-- History Tabs Area -->
        <div class="ops-table-container">
          <div class="ops-table-header">
            <h4 style="font-size: var(--fs-sm); margin-bottom: 0;"><i class="fa-solid fa-clock-rotate-left text-primary"></i> Lifecycle Work Orders &amp; Safety Checks</h4>
          </div>
          <div style="padding: var(--space-4);">
            <h5 style="font-size: var(--fs-xs); text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">Recent Maintenance Logs (${d.maintenanceHistory?.length || 0})</h5>
            ${renderMiniTable(d.maintenanceHistory, ['maintenanceNumber', 'type', 'status', 'cost', 'createdAt'], ['Order #', 'Type', 'Status', 'Cost', 'Date'])}

            <h5 style="font-size: var(--fs-xs); text-transform: uppercase; color: var(--text-muted); margin-top: 16px; margin-bottom: 8px;">Safety Inspection Logs (${d.inspectionHistory?.length || 0})</h5>
            ${renderMiniTable(d.inspectionHistory, ['inspectionNumber', 'inspectionType', 'result', 'createdAt'], ['Inspection #', 'Type', 'Result', 'Date'])}

            <h5 style="font-size: var(--fs-xs); text-transform: uppercase; color: var(--text-muted); margin-top: 16px; margin-bottom: 8px;">Inter-Hub Transfers (${d.transferHistory?.length || 0})</h5>
            ${renderMiniTable(d.transferHistory, ['transferNumber', 'status', 'createdAt'], ['Transfer #', 'Status', 'Date'])}
          </div>
        </div>
      `;
    } catch (err) {
      if (area) {
        area.innerHTML = `<div class="card" style="padding: 24px; text-align: center; color: var(--danger);"><i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(err.message || 'Vehicle dossier lookup failed')}</div>`;
      }
    }
  }

  function renderMiniTable(items, keys, headers) {
    if (!items || items.length === 0) {
      return '<p style="font-size: var(--fs-xs); color: var(--text-muted); padding: 8px 0;">No records logged.</p>';
    }
    return `
      <div style="overflow-x: auto; margin-bottom: 12px;">
        <table class="ops-table" style="font-size: var(--fs-xs);">
          <thead>
            <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${items.slice(0, 5).map((row) => `
              <tr>
                ${keys.map((k) => `<td>${escapeHtml(String(row[k] || ''))}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // =========================================================================
  // 5. HUBS LOGISTICS
  // =========================================================================
  async function loadHubs() {
    const container = document.getElementById('hubs-grid-container');
    if (container) {
      container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading logistics hubs...</p>';
    }

    try {
      const res = await global.SkyBoltApi.get('/hubs');
      const hubs = res.data || [];

      if (hubs.length === 0) {
        container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">No logistics hubs created yet.</p>';
        return;
      }

      container.innerHTML = hubs
        .map((h) => {
          const cap = h.capacity || 1;
          const current = h.currentVehicleCount || 0;
          const percent = Math.min(100, Math.round((current / cap) * 100));
          const isOverflow = current >= cap;

          return `
            <div class="card" style="padding: var(--space-5); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div>
                  <h3 style="font-size: 1.1rem; margin-bottom: 2px;">${escapeHtml(h.name)}</h3>
                  <span style="font-family: monospace; font-size: var(--fs-xs); color: var(--text-muted);">${escapeHtml(h.code)} &bull; ${escapeHtml(h.city)}</span>
                </div>
                <span class="badge-pill ${h.operationalStatus === 'ACTIVE' ? 'badge-available' : 'badge-retired'}">
                  ${escapeHtml(h.operationalStatus)}
                </span>
              </div>

              <!-- Capacity Progress Meter -->
              <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: var(--fs-xs); font-weight: 600; margin-bottom: 4px;">
                  <span>Capacity Utilization</span>
                  <span style="${isOverflow ? 'color: var(--danger); font-weight: 800;' : ''}">${current} / ${cap} vehicles (${percent}%)</span>
                </div>
                <div style="width: 100%; height: 8px; background: var(--border); border-radius: var(--radius-full); overflow: hidden;">
                  <div style="width: ${percent}%; height: 100%; background: ${isOverflow ? '#dc2626' : percent > 80 ? '#ea580c' : '#059669'}; transition: width 0.3s ease;"></div>
                </div>
              </div>

              <div style="font-size: var(--fs-xs); color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 8px; margin-top: 8px;">
                <div><i class="fa-solid fa-location-dot"></i> ${escapeHtml(h.address || h.city)}</div>
              </div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.warn('[Admin] Hubs load error:', err);
      if (container) container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--danger);">Failed to load hubs.</p>';
    }
  }

  // =========================================================================
  // 6. MAINTENANCE
  // =========================================================================
  async function loadMaintenance() {
    const tbody = document.getElementById('maintenance-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading maintenance records...</td></tr>';
    }

    try {
      const params = new URLSearchParams({
        page: pagination.maintenance.page,
        limit: pagination.maintenance.limit
      });
      if (filters.maintenance.status) params.append('status', filters.maintenance.status);
      if (filters.maintenance.priority) params.append('priority', filters.maintenance.priority);

      const res = await global.SkyBoltApi.get(`/admin/maintenance?${params.toString()}`);
      const data = res.data || [];
      const meta = res.meta || { page: 1, totalPages: 1 };

      pagination.maintenance.page = meta.page;
      pagination.maintenance.totalPages = meta.totalPages || 1;
      updatePageInfo('maintenance', meta);

      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No maintenance work orders found.</td></tr>';
        return;
      }

      tbody.innerHTML = data
        .map((m) => `
          <tr>
            <td><strong>${escapeHtml(m.maintenanceNumber)}</strong></td>
            <td>
              <div>${escapeHtml(m.vehicle?.brand || '')} ${escapeHtml(m.vehicle?.model || '')}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(m.vehicle?.registrationNumber || '')}</div>
            </td>
            <td><span class="badge-pill badge-maintenance">${escapeHtml(m.type)}</span></td>
            <td><span class="badge-pill ${m.priority === 'CRITICAL' || m.priority === 'HIGH' ? 'badge-retired' : 'badge-available'}">${escapeHtml(m.priority)}</span></td>
            <td><span class="badge-pill ${m.status === 'COMPLETED' ? 'badge-available' : 'badge-maintenance'}">${escapeHtml(m.status)}</span></td>
            <td style="font-size: var(--fs-xs);">${formatDate(m.scheduledAt || m.createdAt)}</td>
            <td>₹${(m.cost || 0).toLocaleString('en-IN')}</td>
            <td style="text-align: right;">
              ${m.status === 'SCHEDULED' ? `<button class="btn btn-outline btn-sm" onclick="SkyBoltAdmin.startMaintenance('${m.id}')">Start</button>` : ''}
              ${m.status === 'IN_PROGRESS' ? `<button class="btn btn-primary btn-sm" onclick="SkyBoltAdmin.completeMaintenance('${m.id}')">Complete</button>` : ''}
            </td>
          </tr>
        `)
        .join('');
    } catch (err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">Failed to load maintenance records.</td></tr>';
    }
  }

  // =========================================================================
  // 7. INSPECTIONS
  // =========================================================================
  async function loadInspections() {
    const tbody = document.getElementById('inspections-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading inspection records...</td></tr>';
    }

    try {
      const params = new URLSearchParams({
        page: pagination.inspections.page,
        limit: pagination.inspections.limit
      });
      if (filters.inspections.result) params.append('result', filters.inspections.result);
      if (filters.inspections.type) params.append('type', filters.inspections.type);

      const res = await global.SkyBoltApi.get(`/admin/inspections?${params.toString()}`);
      const data = res.data || [];
      const meta = res.meta || { page: 1, totalPages: 1 };

      pagination.inspections.page = meta.page;
      pagination.inspections.totalPages = meta.totalPages || 1;
      updatePageInfo('inspections', meta);

      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No inspections recorded.</td></tr>';
        return;
      }

      tbody.innerHTML = data
        .map((i) => {
          const resBadge = i.result === 'PASSED' ? '<span class="badge-pill badge-available">PASSED</span>' : i.result === 'FAILED' ? '<span class="badge-pill badge-retired">FAILED</span>' : '<span class="badge-pill badge-maintenance">CONDITIONAL</span>';
          return `
            <tr>
              <td><strong>${escapeHtml(i.inspectionNumber)}</strong></td>
              <td>
                <div>${escapeHtml(i.vehicle?.brand || '')} ${escapeHtml(i.vehicle?.model || '')}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(i.vehicle?.registrationNumber || '')}</div>
              </td>
              <td>${escapeHtml(i.inspector?.name || i.inspector?.email || 'Staff')}</td>
              <td><span class="badge-pill badge-rental">${escapeHtml(i.type)}</span></td>
              <td>${resBadge}</td>
              <td>${i.issues && i.issues.length > 0 ? `<span style="color: var(--danger); font-weight: 700;">${i.issues.length} defect(s)</span>` : '<span style="color: var(--success);">Clean</span>'}</td>
              <td style="font-size: var(--fs-xs);">${formatDate(i.createdAt)}</td>
              <td style="text-align: right;">
                <button class="btn btn-outline btn-sm" onclick="SkyBoltAdmin.viewInspectionDetails('${escapeHtml(JSON.stringify(i)).replace(/'/g, "&apos;")}')">Checklist</button>
              </td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">Failed to load inspections.</td></tr>';
    }
  }

  // =========================================================================
  // 8. TRANSFERS
  // =========================================================================
  async function loadTransfers() {
    const tbody = document.getElementById('transfers-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading transfer records...</td></tr>';
    }

    try {
      const params = new URLSearchParams({
        page: pagination.transfers.page,
        limit: pagination.transfers.limit
      });
      if (filters.transfers.status) params.append('status', filters.transfers.status);

      const res = await global.SkyBoltApi.get(`/admin/transfers?${params.toString()}`);
      const data = res.data || [];
      const meta = res.meta || { page: 1, totalPages: 1 };

      pagination.transfers.page = meta.page;
      pagination.transfers.totalPages = meta.totalPages || 1;
      updatePageInfo('transfers', meta);

      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No transfer records found.</td></tr>';
        return;
      }

      tbody.innerHTML = data
        .map((t) => `
          <tr>
            <td><strong>${escapeHtml(t.transferNumber)}</strong></td>
            <td>
              <div>${escapeHtml(t.vehicle?.brand || '')} ${escapeHtml(t.vehicle?.model || '')}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(t.vehicle?.registrationNumber || '')}</div>
            </td>
            <td>${escapeHtml(t.fromHub?.name || 'Hub')}</td>
            <td>${escapeHtml(t.toHub?.name || 'Hub')}</td>
            <td><span class="badge-pill badge-transit">${escapeHtml(t.status)}</span></td>
            <td>${escapeHtml(t.initiatedBy?.name || t.initiatedBy?.email || 'Staff')}</td>
            <td style="font-size: var(--fs-xs);">${formatDate(t.createdAt)}</td>
            <td style="text-align: right;">
              ${t.status === 'PENDING' || t.status === 'IN_TRANSIT' ? `
                <button class="btn btn-primary btn-sm" onclick="SkyBoltAdmin.completeTransfer('${t.id}')">Complete</button>
                <button class="btn btn-outline btn-sm" style="color: var(--danger);" onclick="SkyBoltAdmin.cancelTransfer('${t.id}')">Cancel</button>
              ` : ''}
            </td>
          </tr>
        `)
        .join('');
    } catch (err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">Failed to load transfers.</td></tr>';
    }
  }

  // =========================================================================
  // 9. PAYMENTS & RECONCILIATION
  // =========================================================================
  async function loadPayments() {
    const tbody = document.getElementById('payments-table-body');
    const discBox = document.getElementById('payments-discrepancies-box');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading financial records...</td></tr>';
    }

    try {
      const params = new URLSearchParams({
        page: pagination.payments.page,
        limit: pagination.payments.limit
      });
      if (filters.payments.status) params.append('status', filters.payments.status);
      if (filters.payments.search) params.append('search', filters.payments.search);

      const res = await global.SkyBoltApi.get(`/admin/payments?${params.toString()}`);
      const data = res.data || [];
      const discrepancies = res.discrepancies || [];
      const meta = res.meta || { page: 1, totalPages: 1 };

      pagination.payments.page = meta.page;
      pagination.payments.totalPages = meta.totalPages || 1;
      updatePageInfo('payments', meta);

      // Render Discrepancies
      if (discBox) {
        if (discrepancies.length === 0) {
          discBox.innerHTML = `
            <div class="card" style="padding: 16px; border-left: 4px solid #059669; display: flex; align-items: center; gap: 12px;">
              <i class="fa-solid fa-circle-check text-success" style="font-size: 1.5rem;"></i>
              <div>
                <strong style="font-size: var(--fs-sm);">Financial Gateway Reconciliation Verified</strong>
                <div style="font-size: var(--fs-xs); color: var(--text-muted);">Zero anomalies detected between provider orders, captured payments, and booking states.</div>
              </div>
            </div>
          `;
        } else {
          discBox.innerHTML = `
            <div class="card" style="padding: 16px; border-left: 4px solid #dc2626;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <strong style="font-size: var(--fs-sm); color: #dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> ${discrepancies.length} Reconciliation Discrepancy Anomaly(ies)</strong>
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${discrepancies.map((d) => `
                  <div style="font-size: var(--fs-xs); background: #fef2f2; padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid #fecaca; color: #991b1b;">
                    <strong>[${escapeHtml(d.type)}]</strong> ${escapeHtml(d.details)}
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      }

      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No payment records match criteria.</td></tr>';
        return;
      }

      tbody.innerHTML = data
        .map((p) => `
          <tr>
            <td><strong>${escapeHtml(p.paymentReference)}</strong></td>
            <td><code>${escapeHtml(p.booking?.reference || 'N/A')}</code></td>
            <td>
              <div>${escapeHtml(p.customer?.name || 'Customer')}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(p.customer?.email || '')}</div>
            </td>
            <td><strong>₹${(p.amount || 0).toLocaleString('en-IN')}</strong></td>
            <td>${getPaymentBadge(p.status)}</td>
            <td style="font-family: monospace; font-size: var(--fs-xs);">${escapeHtml(p.providerOrderId || 'N/A')}</td>
            <td style="font-family: monospace; font-size: var(--fs-xs);">${escapeHtml(p.providerPaymentId || 'N/A')}</td>
            <td style="font-size: var(--fs-xs);">${formatDate(p.createdAt)}</td>
          </tr>
        `)
        .join('');
    } catch (err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">Failed to load payment records.</td></tr>';
    }
  }

  // =========================================================================
  // 10. USER MANAGEMENT (Strictly ADMIN)
  // =========================================================================
  async function loadUsers() {
    const tbody = document.getElementById('users-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading directory...</td></tr>';
    }

    try {
      const params = new URLSearchParams({
        page: pagination.users.page,
        limit: pagination.users.limit
      });
      if (filters.users.search) params.append('search', filters.users.search);
      if (filters.users.role) params.append('role', filters.users.role);
      if (filters.users.status) params.append('status', filters.users.status);

      const res = await global.SkyBoltApi.get(`/admin/users?${params.toString()}`);
      const data = res.data || [];
      const meta = res.meta || { page: 1, totalPages: 1 };

      pagination.users.page = meta.page;
      pagination.users.totalPages = meta.totalPages || 1;
      updatePageInfo('users', meta);

      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">No users found.</td></tr>';
        return;
      }

      tbody.innerHTML = data
        .map((u) => {
          const isSelf = currentUser && currentUser.id === u.id;
          return `
            <tr>
              <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div style="width: 32px; height: 32px; border-radius: var(--radius-full); background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">
                    ${escapeHtml(u.name.substring(0, 2).toUpperCase())}
                  </div>
                  <div>
                    <strong>${escapeHtml(u.name)}</strong>
                    ${isSelf ? '<span class="badge-pill badge-available" style="font-size: 0.65rem; padding: 1px 6px;">You</span>' : ''}
                  </div>
                </div>
              </td>
              <td>${escapeHtml(u.email)}</td>
              <td>${escapeHtml(u.phone || '—')}</td>
              <td><span class="badge-pill badge-rental">${escapeHtml(u.role)}</span></td>
              <td><span class="badge-pill ${u.status === 'ACTIVE' ? 'badge-available' : 'badge-retired'}">${escapeHtml(u.status)}</span></td>
              <td style="font-size: var(--fs-xs);">${formatDate(u.createdAt)}</td>
              <td style="text-align: right;">
                ${!isSelf ? `
                  ${u.role === 'OWNER' && u.status === 'PENDING_VERIFICATION' ? `
                    <button class="btn btn-sm btn-primary" onclick="SkyBoltAdmin.verifyOwnerAccount('${u.id}', 'ACTIVE')" title="Verify Owner Account" style="margin-right: 4px;"><i class="fa-solid fa-check"></i> Verify</button>
                  ` : ''}
                  <button class="btn btn-outline btn-sm" onclick="SkyBoltAdmin.openRoleModal('${u.id}', '${u.role}', '${escapeHtml(u.name)}')">Role</button>
                  <button class="btn btn-outline btn-sm" style="color: ${u.status === 'ACTIVE' ? 'var(--danger)' : 'var(--success)'};" onclick="SkyBoltAdmin.openStatusModal('${u.id}', '${u.status}', '${escapeHtml(u.name)}')">Status</button>
                ` : '<span style="font-size: var(--fs-xs); color: var(--text-muted);">Protected</span>'}
              </td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger);">Failed to load user records.</td></tr>';
    }
  }

  // =========================================================================
  // 11. AUDIT LOGS
  // =========================================================================
  async function loadAuditLogs() {
    const tbody = document.getElementById('audit-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading audit logs...</td></tr>';
    }

    try {
      const params = new URLSearchParams({
        page: pagination.audit.page,
        limit: pagination.audit.limit
      });
      if (filters.audit.entityType) params.append('entityType', filters.audit.entityType);
      if (filters.audit.action) params.append('action', filters.audit.action);

      const res = await global.SkyBoltApi.get(`/admin/audit-logs?${params.toString()}`);
      const data = res.data || [];
      const meta = res.meta || { page: 1, totalPages: 1 };

      pagination.audit.page = meta.page;
      pagination.audit.totalPages = meta.totalPages || 1;
      updatePageInfo('audit', meta);

      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">No audit events recorded.</td></tr>';
        return;
      }

      tbody.innerHTML = data
        .map((a) => `
          <tr>
            <td style="color: var(--text-muted); font-size: var(--fs-xs);">${formatDate(a.createdAt)}</td>
            <td><strong>${escapeHtml(a.actorEmail)}</strong></td>
            <td><span class="badge-pill badge-rental">${escapeHtml(a.actorRole)}</span></td>
            <td><code>${escapeHtml(a.action)}</code></td>
            <td><span class="badge-pill badge-available">${escapeHtml(a.entityType)}</span></td>
            <td style="font-family: monospace; font-size: var(--fs-xs);">${escapeHtml(a.entityId)}</td>
            <td style="text-align: right;">
              <button class="btn btn-outline btn-sm" onclick="SkyBoltAdmin.inspectAuditDiff('${escapeHtml(JSON.stringify(a)).replace(/'/g, "&apos;")}')">Inspect Diff</button>
            </td>
          </tr>
        `)
        .join('');
    } catch (err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger);">Failed to load audit logs.</td></tr>';
    }
  }

  // =========================================================================
  // Mutation Modals & Handlers
  // =========================================================================
  function openRoleModal(userId, currentRole, userName) {
    const modal = document.getElementById('ops-user-mutation-modal');
    const title = document.getElementById('user-mutation-title');
    const roleGroup = document.getElementById('user-role-group');
    const statusGroup = document.getElementById('user-status-group');
    const roleSelect = document.getElementById('user-mutation-role');
    const warning = document.getElementById('user-mutation-warning');
    const submitBtn = document.getElementById('btn-submit-user-mutation');

    if (!modal) return;

    if (title) title.textContent = `Change RBAC Role: ${userName}`;
    if (roleGroup) roleGroup.style.display = 'block';
    if (statusGroup) statusGroup.style.display = 'none';
    if (roleSelect) roleSelect.value = currentRole;
    if (warning) {
      warning.style.display = 'block';
      warning.textContent = 'Granting elevated roles (STAFF, FLEET_MANAGER, ADMIN) permits privileged operational authority and will be immutably audited.';
    }

    if (submitBtn) {
      submitBtn.onclick = async () => {
        const newRole = roleSelect.value;
        const reason = document.getElementById('user-mutation-reason')?.value || '';
        try {
          await global.SkyBoltApi.patch(`/admin/users/${userId}/role`, { role: newRole, reason });
          if (typeof global.showToast === 'function') {
            global.showToast(`User role updated to ${newRole}`, 'success');
          }
          modal.classList.remove('active');
          loadUsers();
          loadOverview();
        } catch (err) {
          if (typeof global.showToast === 'function') {
            global.showToast(err.message || 'Role change failed', 'error');
          }
        }
      };
    }

    modal.classList.add('active');
  }

  function openStatusModal(userId, currentStatus, userName) {
    const modal = document.getElementById('ops-user-mutation-modal');
    const title = document.getElementById('user-mutation-title');
    const roleGroup = document.getElementById('user-role-group');
    const statusGroup = document.getElementById('user-status-group');
    const statusSelect = document.getElementById('user-mutation-status');
    const warning = document.getElementById('user-mutation-warning');
    const submitBtn = document.getElementById('btn-submit-user-mutation');

    if (!modal) return;

    if (title) title.textContent = `Change Account Status: ${userName}`;
    if (roleGroup) roleGroup.style.display = 'none';
    if (statusGroup) statusGroup.style.display = 'block';
    if (statusSelect) statusSelect.value = currentStatus;
    if (warning) {
      warning.style.display = 'block';
      warning.textContent = 'Suspended or deactivated accounts will immediately be denied login and API access across the entire platform.';
    }

    if (submitBtn) {
      submitBtn.onclick = async () => {
        const newStatus = statusSelect.value;
        const reason = document.getElementById('user-mutation-reason')?.value || '';
        try {
          await global.SkyBoltApi.patch(`/admin/users/${userId}/status`, { status: newStatus, reason });
          if (typeof global.showToast === 'function') {
            global.showToast(`Account status updated to ${newStatus}`, 'success');
          }
          modal.classList.remove('active');
          loadUsers();
          loadOverview();
        } catch (err) {
          if (typeof global.showToast === 'function') {
            global.showToast(err.message || 'Status change failed', 'error');
          }
        }
      };
    }

    modal.classList.add('active');
  }

  function inspectAuditDiff(rawJson) {
    const modal = document.getElementById('ops-diff-modal');
    const content = document.getElementById('diff-modal-content');
    if (!modal || !content) return;

    const a = JSON.parse(rawJson);
    content.innerHTML = `
      <div style="font-size: var(--fs-xs); margin-bottom: 12px;">
        <div><strong>Actor:</strong> ${escapeHtml(a.actorEmail)} (${escapeHtml(a.actorRole)})</div>
        <div><strong>Action:</strong> <code>${escapeHtml(a.action)}</code></div>
        <div><strong>Entity:</strong> ${escapeHtml(a.entityType)} (${escapeHtml(a.entityId)})</div>
        <div><strong>Timestamp:</strong> ${formatDate(a.createdAt)}</div>
        ${a.reason ? `<div><strong>Justification:</strong> ${escapeHtml(a.reason)}</div>` : ''}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
        <div>
          <h4 style="font-size: var(--fs-xs); text-transform: uppercase; color: var(--danger); margin-bottom: 6px;">Previous State</h4>
          <pre style="background: var(--bg-alt); padding: 10px; border-radius: var(--radius-md); font-size: 0.72rem; overflow-x: auto; max-height: 250px;">${escapeHtml(JSON.stringify(a.previousState || {}, null, 2))}</pre>
        </div>
        <div>
          <h4 style="font-size: var(--fs-xs); text-transform: uppercase; color: var(--success); margin-bottom: 6px;">New State</h4>
          <pre style="background: var(--bg-alt); padding: 10px; border-radius: var(--radius-md); font-size: 0.72rem; overflow-x: auto; max-height: 250px;">${escapeHtml(JSON.stringify(a.newState || {}, null, 2))}</pre>
        </div>
      </div>
    `;

    modal.classList.add('active');
  }

  function viewInspectionDetails(rawJson) {
    const modal = document.getElementById('ops-diff-modal');
    const title = document.getElementById('diff-modal-title');
    const content = document.getElementById('diff-modal-content');
    if (!modal || !content) return;

    const i = JSON.parse(rawJson);
    if (title) title.textContent = `Inspection Checklist: ${i.inspectionNumber}`;

    const checklist = i.checklist || {};
    const checklistItems = Object.keys(checklist)
      .map((k) => `
        <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid var(--border); font-size: var(--fs-xs);">
          <span style="text-transform: capitalize;">${k}</span>
          <span>${checklist[k] ? '<i class="fa-solid fa-circle-check text-success"></i> PASS' : '<i class="fa-solid fa-circle-xmark text-danger"></i> FAIL'}</span>
        </div>
      `)
      .join('');

    content.innerHTML = `
      <div style="margin-bottom: 16px;">
        <strong>Inspection Result:</strong> <span class="badge-pill ${i.result === 'PASSED' ? 'badge-available' : 'badge-retired'}">${escapeHtml(i.result)}</span>
      </div>
      <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 16px;">
        ${checklistItems || '<div style="padding: 12px;">No checklist data</div>'}
      </div>
      ${i.issues && i.issues.length > 0 ? `
        <h4 style="font-size: var(--fs-xs); text-transform: uppercase; color: var(--danger); margin-bottom: 6px;">Defects &amp; Issues Flagged</h4>
        <ul style="font-size: var(--fs-xs); color: var(--danger); padding-left: 20px;">
          ${i.issues.map((iss) => `<li>${escapeHtml(typeof iss === 'string' ? iss : iss.notes || iss.item || 'Issue')}</li>`).join('')}
        </ul>
      ` : ''}
    `;

    modal.classList.add('active');
  }

  async function startMaintenance(maintenanceId) {
    if (!confirm('Commence physical workshop maintenance on this vehicle?')) return;
    try {
      await global.SkyBoltApi.patch(`/maintenance/${maintenanceId}/start`);
      if (typeof global.showToast === 'function') {
        global.showToast('Maintenance commenced. Vehicle state is MAINTENANCE.', 'success');
      }
      loadMaintenance();
      loadOverview();
    } catch (err) {
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Action failed', 'error');
      }
    }
  }

  async function completeMaintenance(maintenanceId) {
    const odo = prompt('Enter post-service odometer reading (km):', '12500');
    if (odo === null) return;
    const cost = prompt('Enter workshop service cost (INR):', '4500');
    if (cost === null) return;
    const notes = prompt('Technician completion notes:', 'Completed full multi-point service');

    try {
      await global.SkyBoltApi.patch(`/maintenance/${maintenanceId}/complete`, {
        odometer: Number(odo) || 0,
        cost: Number(cost) || 0,
        notes: notes || ''
      });
      if (typeof global.showToast === 'function') {
        global.showToast('Maintenance completed. Vehicle transitioned to INSPECTION state.', 'success');
      }
      loadMaintenance();
      loadOverview();
    } catch (err) {
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Completion failed', 'error');
      }
    }
  }

  async function completeTransfer(transferId) {
    if (!confirm('Confirm vehicle safe arrival and complete this transfer?')) return;
    try {
      await global.SkyBoltApi.patch(`/transfers/${transferId}/complete`);
      if (typeof global.showToast === 'function') {
        global.showToast('Transfer completed. Vehicle inventory updated to destination hub.', 'success');
      }
      loadTransfers();
      loadOverview();
    } catch (err) {
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Action failed', 'error');
      }
    }
  }

  async function cancelTransfer(transferId) {
    const reason = prompt('State reason for transfer cancellation:', 'Operational rerouting');
    if (reason === null) return;
    try {
      await global.SkyBoltApi.patch(`/transfers/${transferId}/cancel`, { reason });
      if (typeof global.showToast === 'function') {
        global.showToast('Transfer cancelled and vehicle returned to source hub.', 'success');
      }
      loadTransfers();
      loadOverview();
    } catch (err) {
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Action failed', 'error');
      }
    }
  }

  // =========================================================================
  // Formatting & Utility Helpers
  // =========================================================================
  function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function updatePageInfo(section, meta) {
    const info = document.getElementById(`${section}-page-info`);
    const prev = document.getElementById(`btn-${section}-prev`);
    const next = document.getElementById(`btn-${section}-next`);

    if (info) info.textContent = `Page ${meta.page} of ${meta.totalPages || 1} (${meta.total || 0} total)`;
    if (prev) prev.disabled = meta.page <= 1;
    if (next) next.disabled = meta.page >= (meta.totalPages || 1);
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoStr;
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getStatusBadge(status) {
    switch (status) {
      case 'CONFIRMED':
        return '<span class="badge-pill badge-available">CONFIRMED</span>';
      case 'ACTIVE':
        return '<span class="badge-pill badge-rental">ACTIVE</span>';
      case 'COMPLETED':
        return '<span class="badge-pill badge-available">COMPLETED</span>';
      case 'CANCELLED':
      case 'REFUNDED':
        return '<span class="badge-pill badge-retired">' + status + '</span>';
      default:
        return '<span class="badge-pill badge-maintenance">' + (status || 'PENDING') + '</span>';
    }
  }

  function getPaymentBadge(status) {
    switch (status) {
      case 'PAID':
      case 'CAPTURED':
        return '<span class="badge-pill badge-available">PAID</span>';
      case 'FAILED':
        return '<span class="badge-pill badge-retired">FAILED</span>';
      default:
        return '<span class="badge-pill badge-maintenance">' + (status || 'PENDING') + '</span>';
    }
  }

  function getFleetStatusBadge(status) {
    switch (status) {
      case 'AVAILABLE':
        return '<span class="badge-pill badge-available">Available</span>';
      case 'RESERVED':
        return '<span class="badge-pill badge-reserved">Reserved</span>';
      case 'ACTIVE_RENTAL':
        return '<span class="badge-pill badge-rental">Active Rental</span>';
      case 'MAINTENANCE':
        return '<span class="badge-pill badge-maintenance">Maintenance</span>';
      case 'INSPECTION':
        return '<span class="badge-pill badge-inspection">Inspection</span>';
      case 'TRANSFER_PENDING':
        return '<span class="badge-pill badge-transit">In Transit</span>';
      case 'PENDING_APPROVAL':
        return '<span class="badge-pill" style="background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3);">Pending Approval</span>';
      case 'REJECTED':
        return '<span class="badge-pill badge-retired">Listing Rejected</span>';
      case 'SUSPENDED':
        return '<span class="badge-pill badge-retired">Suspended</span>';
      case 'RETIRED':
        return '<span class="badge-pill badge-retired">Retired</span>';
      default:
        return '<span class="badge-pill badge-maintenance">' + (status || 'Unavailable') + '</span>';
    }
  }

  /**
   * =========================================================================
   * 12. REVIEWS & CONTENT MODERATION ENGINE
   * =========================================================================
   */
  async function loadReviewsTab() {
    try {
      // Parallel fetch for stats
      const [revRes, repRes] = await Promise.all([
        global.SkyBoltApi.get('/admin/reviews?limit=1'),
        global.SkyBoltApi.get('/admin/reviews/reports?status=PENDING&limit=1')
      ]);

      const totalReviews = revRes.meta?.total || 0;
      const totalReports = repRes.meta?.total || 0;

      const totalRevEl = document.getElementById('rev-stat-total');
      const repEl = document.getElementById('rev-stat-reports');
      const badgeRepCount = document.getElementById('badge-reports-count');

      if (totalRevEl) totalRevEl.textContent = totalReviews;
      if (repEl) repEl.textContent = totalReports;
      if (badgeRepCount) badgeRepCount.textContent = totalReports;

      // Pending moderation count
      try {
        const pendRes = await global.SkyBoltApi.get('/admin/reviews?status=PENDING&limit=1');
        const pendEl = document.getElementById('rev-stat-pending');
        if (pendEl) pendEl.textContent = pendRes.meta?.total || 0;
      } catch (e) {}

      // Fleet rating
      try {
        const fleetRes = await global.SkyBoltApi.get('/fleet/summary');
        const avgEl = document.getElementById('rev-stat-rating');
        if (avgEl && fleetRes.data?.averageRating) {
          avgEl.textContent = `${Number(fleetRes.data.averageRating).toFixed(1)} ★`;
        }
      } catch (e) {}

    } catch (err) {
      console.warn('[Admin Reviews] Failed to load overview metrics:', err);
    }

    await loadAdminReviews();
  }

  async function loadAdminReviews() {
    const tbody = document.getElementById('admin-reviews-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading reviews...</td></tr>`;

    try {
      const q = new URLSearchParams({
        page: String(pagination.reviews.page),
        limit: String(pagination.reviews.limit)
      });
      if (filters.reviews.status) q.append('status', filters.reviews.status);
      if (filters.reviews.rating) q.append('rating', filters.reviews.rating);

      const res = await global.SkyBoltApi.get(`/admin/reviews?${q.toString()}`);
      const reviews = res.data || [];
      const meta = res.meta || { page: 1, totalPages: 1, total: reviews.length };
      pagination.reviews.totalPages = meta.totalPages || 1;

      // Update Pagination UI
      const info = document.getElementById('rev-page-info');
      const prev = document.getElementById('btn-rev-prev');
      const next = document.getElementById('btn-rev-next');
      if (info) info.textContent = `Showing page ${meta.page} of ${pagination.reviews.totalPages} (${meta.total} reviews)`;
      if (prev) prev.disabled = meta.page <= 1;
      if (next) next.disabled = meta.page >= pagination.reviews.totalPages;

      if (reviews.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">No reviews matching current filter criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = reviews.map(r => {
        const vehicleName = escapeHtml(r.vehicle?.name || `${r.vehicle?.brand || ''} ${r.vehicle?.model || ''}`.trim() || 'Vehicle');
        const customerName = escapeHtml(r.author?.name || 'Customer');
        const customerEmail = escapeHtml(r.author?.email || '');
        const ratingStars = '★'.repeat(r.rating || 0) + '☆'.repeat(5 - (r.rating || 0));
        const title = escapeHtml(r.title || '');
        const comment = escapeHtml(r.comment || '');
        const verified = r.verificationStatus === 'VERIFIED'
          ? '<span class="badge-pill badge-available"><i class="fa-solid fa-circle-check"></i> VERIFIED</span>'
          : '<span class="badge-pill badge-maintenance">UNVERIFIED</span>';

        let statusBadge = '<span class="badge-pill badge-available">PUBLISHED</span>';
        if (r.status === 'PENDING') statusBadge = '<span class="badge-pill badge-transit">PENDING</span>';
        if (r.status === 'HIDDEN') statusBadge = '<span class="badge-pill badge-retired">HIDDEN</span>';
        if (r.status === 'REJECTED') statusBadge = '<span class="badge-pill badge-maintenance">REJECTED</span>';
        if (r.status === 'DELETED') statusBadge = '<span class="badge-pill badge-retired">DELETED</span>';

        return `
          <tr>
            <td>
              <div style="font-weight: 700;">${vehicleName}</div>
              <div style="font-size: var(--fs-2xs); color: var(--text-muted); font-family: monospace;">${escapeHtml(r.vehicleId)}</div>
            </td>
            <td>
              <div style="font-weight: 600;">${customerName}</div>
              <div style="font-size: var(--fs-2xs); color: var(--text-muted);">${customerEmail}</div>
            </td>
            <td>
              <span style="color: #f59e0b; font-weight: 800;">${ratingStars}</span>
              <span style="font-size: var(--fs-2xs); color: var(--text-muted); margin-left: 4px;">(${r.rating}/5)</span>
            </td>
            <td style="max-width: 280px;">
              <div style="font-weight: 700; font-size: var(--fs-xs);">${title}</div>
              <div style="font-size: var(--fs-2xs); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${comment}</div>
            </td>
            <td>${verified}</td>
            <td>${statusBadge}</td>
            <td>
              <span style="font-size: var(--fs-xs);"><i class="fa-regular fa-thumbs-up"></i> ${r.helpfulCount || 0}</span>
              ${(r.reportedCount || 0) > 0 ? `<span style="font-size: var(--fs-xs); color: var(--danger); margin-left: 8px;"><i class="fa-solid fa-flag"></i> ${r.reportedCount}</span>` : ''}
            </td>
            <td style="text-align: right;">
              <div style="display: inline-flex; gap: 4px;">
                ${r.status !== 'PUBLISHED' ? `<button class="btn btn-outline btn-xs" onclick="SkyBoltAdmin.moderateReview('${r.id}', 'PUBLISHED')"><i class="fa-solid fa-check"></i> Publish</button>` : ''}
                ${r.status !== 'HIDDEN' ? `<button class="btn btn-outline btn-xs" style="color: #ea580c; border-color: #ea580c;" onclick="SkyBoltAdmin.moderateReview('${r.id}', 'HIDDEN')"><i class="fa-solid fa-eye-slash"></i> Hide</button>` : ''}
                ${r.status !== 'REJECTED' ? `<button class="btn btn-outline btn-xs" style="color: var(--danger); border-color: var(--danger);" onclick="SkyBoltAdmin.moderateReview('${r.id}', 'REJECTED')"><i class="fa-solid fa-ban"></i> Reject</button>` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.warn('[Admin Reviews] Load error:', err);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--danger);">Failed to load reviews.</td></tr>`;
    }
  }

  async function loadAdminReports() {
    const tbody = document.getElementById('admin-reports-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading abuse reports...</td></tr>`;

    try {
      const q = new URLSearchParams({
        page: String(pagination.reports.page),
        limit: String(pagination.reports.limit)
      });
      if (filters.reports.status) q.append('status', filters.reports.status);

      const res = await global.SkyBoltApi.get(`/admin/reviews/reports?${q.toString()}`);
      const reports = res.data || [];
      const meta = res.meta || { page: 1, totalPages: 1, total: reports.length };
      pagination.reports.totalPages = meta.totalPages || 1;

      // Update Pagination UI
      const info = document.getElementById('rep-page-info');
      const prev = document.getElementById('btn-rep-prev');
      const next = document.getElementById('btn-rep-next');
      if (info) info.textContent = `Showing page ${meta.page} of ${pagination.reports.totalPages} (${meta.total} reports)`;
      if (prev) prev.disabled = meta.page <= 1;
      if (next) next.disabled = meta.page >= pagination.reports.totalPages;

      if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">No reports matching current filter criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = reports.map(rep => {
        const reviewTitle = escapeHtml(rep.review?.title || `Review #${String(rep.reviewId).slice(-6)}`);
        const reportedBy = escapeHtml(rep.reporter?.name || rep.reporter?.email || 'User');
        const reason = escapeHtml(rep.reason || 'SPAM');
        const details = escapeHtml(rep.description || 'No additional details provided.');
        const dateStr = rep.createdAt ? new Date(rep.createdAt).toLocaleDateString() : '';

        let statusBadge = '<span class="badge-pill badge-transit">PENDING</span>';
        if (rep.status === 'INVESTIGATING') statusBadge = '<span class="badge-pill badge-inspection">INVESTIGATING</span>';
        if (rep.status === 'RESOLVED') statusBadge = '<span class="badge-pill badge-available">RESOLVED</span>';
        if (rep.status === 'DISMISSED') statusBadge = '<span class="badge-pill badge-maintenance">DISMISSED</span>';

        const isActionable = rep.status === 'PENDING' || rep.status === 'INVESTIGATING';

        return `
          <tr>
            <td>
              <div style="font-weight: 700;">${reviewTitle}</div>
              <div style="font-size: var(--fs-2xs); color: var(--text-muted); font-family: monospace;">${escapeHtml(rep.reviewId)}</div>
            </td>
            <td>${reportedBy}</td>
            <td><span class="badge-pill badge-retired">${reason}</span></td>
            <td style="max-width: 240px; font-size: var(--fs-xs);">${details}</td>
            <td>${statusBadge}</td>
            <td>${dateStr}</td>
            <td style="text-align: right;">
              ${isActionable ? `
                <button class="btn btn-primary btn-xs" onclick="SkyBoltAdmin.openResolveReportModal('${rep.id}', '${rep.reviewId}', '${reviewTitle.replace(/'/g, "\\'")}', '${reason}')">
                  <i class="fa-solid fa-gavel"></i> Resolve
                </button>
              ` : `<span style="font-size: var(--fs-2xs); color: var(--text-muted);">Processed</span>`}
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.warn('[Admin Reports] Load error:', err);
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--danger);">Failed to load abuse reports.</td></tr>`;
    }
  }

  async function moderateReview(reviewId, status) {
    if (!confirm(`Are you sure you want to change this review status to ${status}?`)) return;

    try {
      await global.SkyBoltApi.patch(`/admin/reviews/${encodeURIComponent(reviewId)}/moderate`, {
        moderationStatus: status,
        reason: `Operational moderation action: set to ${status}`
      });
      if (typeof global.showToast === 'function') global.showToast(`Review status updated to ${status}`, 'success');
      await loadReviewsTab();
    } catch (err) {
      const msg = err && err.message ? err.message : 'Moderation action failed.';
      if (typeof global.showToast === 'function') global.showToast(msg, 'error');
    }
  }

  function openResolveReportModal(reportId, reviewId, reviewTitle, reason) {
    const modal = document.getElementById('ops-report-resolve-modal');
    const targetRepInput = document.getElementById('admin-target-report-id');
    const targetRevInput = document.getElementById('admin-target-review-id');
    const titleEl = document.getElementById('admin-report-review-title');
    const reasonEl = document.getElementById('admin-report-reason-display');

    if (targetRepInput) targetRepInput.value = reportId;
    if (targetRevInput) targetRevInput.value = reviewId;
    if (titleEl) titleEl.textContent = `Reported Review: "${reviewTitle}"`;
    if (reasonEl) reasonEl.textContent = `Reported Reason: ${reason}`;

    if (modal) modal.classList.add('active');
  }

  async function handleReportResolutionSubmit() {
    const reportId = document.getElementById('admin-target-report-id')?.value;
    const actionVal = document.getElementById('admin-report-action-select')?.value;
    const notes = document.getElementById('admin-report-notes')?.value.trim();
    const modal = document.getElementById('ops-report-resolve-modal');
    const submitBtn = document.getElementById('btn-submit-report-resolution');

    if (!reportId) return;

    let payloadStatus = 'RESOLVED';
    let reviewAction = 'NONE';
    if (actionVal === 'DISMISSED') {
      payloadStatus = 'DISMISSED';
    } else if (actionVal === 'RESOLVED_HIDE') {
      reviewAction = 'HIDE_REVIEW';
    } else if (actionVal === 'RESOLVED_REJECT') {
      reviewAction = 'REJECT_REVIEW';
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';
    }

    try {
      await global.SkyBoltApi.patch(`/admin/reviews/reports/${encodeURIComponent(reportId)}`, {
        status: payloadStatus,
        reviewAction,
        resolutionNotes: notes || undefined
      });

      if (typeof global.showToast === 'function') global.showToast('Abuse report decision confirmed & audited.', 'success');
      if (modal) modal.classList.remove('active');
      await loadReviewsTab();
      await loadAdminReports();

    } catch (err) {
      const msg = err && err.message ? err.message : 'Failed to resolve report.';
      if (typeof global.showToast === 'function') global.showToast(msg, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Resolution';
      }
    }
  }

  // =========================================================================
  // QUEUES & BACKGROUND WORKERS TAB
  // =========================================================================
  let queueCurrentPage = 1;
  const queuePageLimit = 20;

  async function loadQueueTab() {
    await Promise.all([
      loadQueueMetrics(),
      loadQueueJobs()
    ]);
  }

  async function loadQueueMetrics() {
    try {
      const res = await global.SkyBoltApi.get('/admin/queues');
      let metrics = (res && res.success && res.data) ? res.data : null;

      const urlParams = new URLSearchParams(window.location.search);
      const isDemo = urlParams.get('demo') === 'true' || urlParams.get('mock') === 'true';

      if (!metrics && isDemo) {
        metrics = [
          { queueName: 'notification-queue', waiting: 0, active: 0, completed: 184, failed: 0, delayed: 0 },
          { queueName: 'booking-queue', waiting: 0, active: 0, completed: 96, failed: 0, delayed: 2 },
          { queueName: 'maintenance-queue', waiting: 0, active: 0, completed: 32, failed: 0, delayed: 1 },
          { queueName: 'reconciliation-queue', waiting: 0, active: 0, completed: 78, failed: 0, delayed: 1 }
        ];
      } else if (!metrics) {
        metrics = [];
      }

      let totalActive = 0;
      let totalWaiting = 0;
      let totalCompleted = 0;
      let totalFailed = 0;
      let totalDelayed = 0;

      const breakdownContainer = document.getElementById('queues-breakdown-container');
      let cardsHtml = '';

      metrics.forEach((q) => {
        totalActive += q.active || 0;
        totalWaiting += q.waiting || 0;
        totalCompleted += q.completed || 0;
        totalFailed += q.failed || 0;
        totalDelayed += q.delayed || 0;

        cardsHtml += `
          <div style="background: var(--surface); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 700; font-size: var(--fs-sm); font-family: monospace; color: var(--primary);">${escapeHtml(q.queueName)}</span>
              <span class="badge-pill badge-available"><i class="fa-solid fa-circle" style="font-size: 0.5rem; vertical-align: middle; margin-right: 4px;"></i>Ready</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: var(--fs-xs); text-align: center;">
              <div style="background: var(--surface-hover); padding: 6px 4px; border-radius: var(--radius-sm);">
                <div style="color: var(--text-muted); font-size: var(--fs-2xs);">Wait</div>
                <div style="font-weight: 800; color: #f59e0b;">${q.waiting || 0}</div>
              </div>
              <div style="background: var(--surface-hover); padding: 6px 4px; border-radius: var(--radius-sm);">
                <div style="color: var(--text-muted); font-size: var(--fs-2xs);">Active</div>
                <div style="font-weight: 800; color: #3b82f6;">${q.active || 0}</div>
              </div>
              <div style="background: var(--surface-hover); padding: 6px 4px; border-radius: var(--radius-sm);">
                <div style="color: var(--text-muted); font-size: var(--fs-2xs);">Fail</div>
                <div style="font-weight: 800; color: ${(q.failed || 0) > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${q.failed || 0}</div>
              </div>
            </div>
          </div>
        `;
      });

      if (breakdownContainer) breakdownContainer.innerHTML = cardsHtml;

      const actEl = document.getElementById('queue-stat-active');
      const waitEl = document.getElementById('queue-stat-waiting');
      const compEl = document.getElementById('queue-stat-completed');
      const failEl = document.getElementById('queue-stat-failed');
      const delEl = document.getElementById('queue-stat-delayed');

      if (actEl) actEl.textContent = totalActive;
      if (waitEl) waitEl.textContent = totalWaiting;
      if (compEl) compEl.textContent = totalCompleted;
      if (failEl) failEl.textContent = totalFailed;
      if (delEl) delEl.textContent = totalDelayed;

      const redisStatus = document.getElementById('queue-redis-status');
      if (redisStatus) {
        redisStatus.innerHTML = '<span class="badge badge-success"><i class="fa-solid fa-check-circle"></i> Connected</span>';
      }

    } catch (err) {
      console.warn('[Admin Queues] Metrics load error:', err);
      const redisStatus = document.getElementById('queue-redis-status');
      if (redisStatus) {
        redisStatus.innerHTML = '<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Offline</span>';
      }
    }
  }

  async function loadQueueJobs() {
    const tbody = document.getElementById('admin-queues-table-body');
    if (!tbody) return;

    const queueName = document.getElementById('admin-queue-name-filter')?.value || 'notification-queue';
    const status = document.getElementById('admin-queue-status-filter')?.value || 'failed';

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Fetching ${escapeHtml(status)} jobs from ${escapeHtml(queueName)}...</td></tr>`;

    try {
      const res = await global.SkyBoltApi.get(`/admin/queues/${encodeURIComponent(queueName)}/jobs?status=${status}&page=${queueCurrentPage}&limit=${queuePageLimit}`);
      let jobs = (res && res.success && res.data) ? res.data : null;
      let meta = (res && res.meta) ? res.meta : { page: 1, totalPages: 1, total: 0 };

      const urlParams = new URLSearchParams(window.location.search);
      const isDemo = urlParams.get('demo') === 'true' || urlParams.get('mock') === 'true';

      if (!jobs && isDemo) {
        if (status === 'failed') {
          jobs = [
            {
              id: 'job_notif_fail_demo_1',
              name: 'BOOKING_CONFIRMATION',
              attemptsMade: 3,
              timestamp: Date.now() - 3600000,
              data: { bookingId: 'BK-DEMO-991', recipient: 'user@example.com' },
              failedReason: 'Simulated downstream SMTP 550 rate limit threshold'
            }
          ];
          meta = { page: 1, totalPages: 1, total: 1 };
        } else {
          jobs = [];
          meta = { page: 1, totalPages: 1, total: 0 };
        }
      } else if (!jobs) {
        jobs = [];
      }

      // Update Pagination UI
      const pageInfo = document.getElementById('queue-page-info');
      const prevBtn = document.getElementById('btn-queue-prev');
      const nextBtn = document.getElementById('btn-queue-next');
      if (pageInfo) pageInfo.textContent = `Page ${meta.page} of ${meta.totalPages || 1} (${meta.total} total ${status} jobs)`;
      if (prevBtn) prevBtn.disabled = meta.page <= 1;
      if (nextBtn) nextBtn.disabled = meta.page >= meta.totalPages;

      if (jobs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-circle-check text-success"></i> No ${escapeHtml(status)} jobs in ${escapeHtml(queueName)}.</td></tr>`;
        return;
      }

      tbody.innerHTML = jobs.map((job) => {
        const enqueuedTime = job.timestamp ? new Date(job.timestamp).toLocaleTimeString() : 'N/A';
        const payloadJson = job.data ? JSON.stringify(job.data) : '{}';
        const displayPayload = payloadJson.length > 55 ? escapeHtml(payloadJson.slice(0, 55)) + '...' : escapeHtml(payloadJson);
        const failReason = job.failedReason ? `<span style="color: var(--danger); font-size: var(--fs-xs);">${escapeHtml(job.failedReason.slice(0, 75))}</span>` : `<span class="badge-pill badge-available">${escapeHtml(status.toUpperCase())}</span>`;

        const canRetry = status === 'failed' || status === 'completed';

        return `
          <tr>
            <td style="font-family: monospace; font-size: var(--fs-xs); font-weight: 700;">${escapeHtml(job.id)}</td>
            <td><span style="font-weight: 600;">${escapeHtml(job.name || 'default')}</span></td>
            <td><span class="badge-pill badge-transit">${job.attemptsMade}</span></td>
            <td style="font-size: var(--fs-xs); color: var(--text-muted);">${enqueuedTime}</td>
            <td style="font-family: monospace; font-size: var(--fs-2xs); color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(payloadJson)}">${displayPayload}</td>
            <td>${failReason}</td>
            <td style="text-align: right;">
              ${canRetry ? `
                <button class="btn btn-outline btn-xs" onclick="SkyBoltAdmin.retryQueueJob('${escapeHtml(queueName)}', '${escapeHtml(job.id)}')">
                  <i class="fa-solid fa-rotate-right"></i> Retry
                </button>
              ` : `<span style="font-size: var(--fs-2xs); color: var(--text-muted);">-</span>`}
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.warn('[Admin Queues] Jobs load error:', err);
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--danger);"><i class="fa-solid fa-triangle-exclamation"></i> Failed to fetch jobs. Verify Redis is connected.</td></tr>`;
    }
  }

  async function retryQueueJob(queueName, jobId) {
    if (!confirm(`Re-queue job "${jobId}" in "${queueName}" for execution?`)) return;

    const urlParams = new URLSearchParams(window.location.search);
    const isDemo = urlParams.get('demo') === 'true' || urlParams.get('mock') === 'true';

    try {
      if (isDemo) {
        if (typeof global.showToast === 'function') {
          global.showToast(`[Demo] Job "${jobId}" successfully re-queued.`, 'success');
        }
        await loadQueueTab();
        return;
      }
      await global.SkyBoltApi.post(`/admin/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/retry`, {
        reason: 'Admin manually triggered retry via operational dashboard'
      });
      if (typeof global.showToast === 'function') {
        global.showToast(`Job "${jobId}" successfully re-queued.`, 'success');
      }
      await loadQueueTab();
    } catch (err) {
      const msg = err && err.message ? err.message : 'Failed to retry job.';
      if (typeof global.showToast === 'function') {
        global.showToast(msg, 'error');
      }
    }
  }

  // -------------------------------------------------------------------------
  // 14. AI Recommendation Telemetry Tab (TASK 16)
  // -------------------------------------------------------------------------
  async function loadRecommendationTab() {
    const totalEl = document.getElementById('rec-stat-total');
    const successRateEl = document.getElementById('rec-stat-success-rate');
    const fallbackRateEl = document.getElementById('rec-stat-fallback-rate');
    const latencyEl = document.getElementById('rec-stat-latency');
    const cacheHitEl = document.getElementById('rec-stat-cache-hit');
    const providerEl = document.getElementById('rec-stat-provider');

    try {
      const res = await window.SkyBoltApi.get('/admin/recommendations/metrics');
      if (res && res.success && res.data) {
        const d = res.data;
        if (totalEl) totalEl.textContent = d.totalRequests || 0;

        const totalReq = d.totalRequests || 0;
        const successRate = totalReq > 0 ? Math.round((d.aiSuccessCount / totalReq) * 100) : 100;
        const fallbackRate = totalReq > 0 ? Math.round((d.aiFallbackCount / totalReq) * 100) : 0;
        const totalCache = (d.cacheHitCount || 0) + (d.cacheMissCount || 0);
        const cacheRate = totalCache > 0 ? Math.round((d.cacheHitCount / totalCache) * 100) : 0;

        if (successRateEl) successRateEl.textContent = `${successRate}%`;
        if (fallbackRateEl) fallbackRateEl.textContent = `${fallbackRate}%`;
        if (latencyEl) latencyEl.textContent = `${d.averageLatencyMs || 0} ms`;
        if (cacheHitEl) cacheHitEl.textContent = `${cacheRate}%`;
        if (providerEl) providerEl.textContent = d.activeProvider ? `${d.activeProvider}` : 'mock (Local Heuristic)';
      }
    } catch (err) {
      console.warn('[SkyBolt Admin] Error loading recommendation metrics:', err);
    }
  }

  // Bind refresh button
  document.addEventListener('DOMContentLoaded', () => {
    const refreshRecBtn = document.getElementById('btn-refresh-rec-metrics');
    if (refreshRecBtn) {
      refreshRecBtn.addEventListener('click', loadRecommendationTab);
    }
  });

  async function approveVehicleListing(vehicleId, status) {
    if (!confirm(`Are you sure you want to mark this listing as ${status}?`)) return;
    try {
      const res = await global.SkyBoltApi.patch(`/admin/vehicles/${vehicleId}/approval`, { status });
      if (res && res.success) {
        if (typeof global.showToast === 'function') global.showToast(`Vehicle listing updated to ${status}.`, 'success');
        await loadFleet();
      } else {
        if (typeof global.showToast === 'function') global.showToast(res.error?.message || 'Failed to update vehicle approval.', 'error');
      }
    } catch {
      if (typeof global.showToast === 'function') global.showToast('Network error during vehicle approval.', 'error');
    }
  }

  async function verifyOwnerAccount(userId, status) {
    if (!confirm(`Are you sure you want to mark this owner as ${status}?`)) return;
    try {
      const res = await global.SkyBoltApi.patch(`/admin/users/${userId}/verify-owner`, { status });
      if (res && res.success) {
        if (typeof global.showToast === 'function') global.showToast(`Owner status updated to ${status}.`, 'success');
        await loadUsers();
      } else {
        if (typeof global.showToast === 'function') global.showToast(res.error?.message || 'Failed to verify owner.', 'error');
      }
    } catch {
      if (typeof global.showToast === 'function') global.showToast('Network error during owner verification.', 'error');
    }
  }

  // Public Exposure for HTML onclick handlers
  global.SkyBoltAdmin = {
    init: initAdminDashboard,
    inspectVehicle: (id) => {
      switchTab('vehicles');
      inspectVehicleDossier(id);
    },
    openRoleModal,
    openStatusModal,
    inspectAuditDiff,
    viewInspectionDetails,
    startMaintenance,
    completeMaintenance,
    completeTransfer,
    cancelTransfer,
    moderateReview,
    openResolveReportModal,
    retryQueueJob,
    approveVehicleListing,
    verifyOwnerAccount
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminDashboard);
  } else {
    initAdminDashboard();
  }

})(typeof window !== 'undefined' ? window : this);
