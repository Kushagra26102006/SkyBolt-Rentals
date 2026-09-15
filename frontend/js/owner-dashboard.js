/* ==========================================================================
   SkyBolt Rentals - Vehicle Owner Dashboard Controller
   Fixed: API contract alignment, XSS escaping, correct field names
   ========================================================================== */

(function(global) {
  'use strict';

  let currentOwner = null;
  let ownerVehicles = [];

  // ---- SAFE HTML ESCAPING (XSS prevention) ----
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCurrency(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return escapeHtml(dateStr);
    }
  }

  function getStatusBadge(status) {
    const safeStatus = escapeHtml(status);
    switch (status) {
      case 'ACTIVE':
        return '<span class="status-badge badge-active"><i class="fa-solid fa-circle-check"></i> Active</span>';
      case 'PENDING_APPROVAL':
        return '<span class="status-badge badge-pending"><i class="fa-solid fa-clock"></i> Pending Review</span>';
      case 'REJECTED':
        return '<span class="status-badge badge-inactive"><i class="fa-solid fa-circle-xmark"></i> Rejected</span>';
      case 'SUSPENDED':
        return '<span class="status-badge badge-inactive"><i class="fa-solid fa-ban"></i> Suspended</span>';
      case 'INACTIVE':
        return '<span class="status-badge badge-inactive"><i class="fa-solid fa-pause"></i> Inactive</span>';
      default:
        return `<span class="status-badge badge-pending">${safeStatus}</span>`;
    }
  }

  function getVerificationBadge(status) {
    if (status === 'ACTIVE') {
      return '<span class="status-badge badge-active"><i class="fa-solid fa-shield-check"></i> Verified Owner</span>';
    } else if (status === 'PENDING_VERIFICATION') {
      return '<span class="status-badge badge-pending"><i class="fa-solid fa-hourglass-half"></i> Verification Pending</span>';
    } else {
      return `<span class="status-badge badge-inactive">${escapeHtml(status)}</span>`;
    }
  }

  function getPaymentBadge(paymentStatus) {
    const safeStatus = escapeHtml(paymentStatus || 'UNKNOWN');
    const colorMap = {
      PAID: '#10B981',
      PENDING: '#F59E0B',
      REFUNDED: '#6366F1',
      FAILED: '#EF4444'
    };
    const color = colorMap[paymentStatus] || '#6B7280';
    return `<span class="badge" style="background: ${color}22; color: ${color}; border: 1px solid ${color}44; padding: 2px 8px; border-radius: var(--radius-sm); font-size: var(--fs-xs);">${safeStatus}</span>`;
  }

  function getBookingStatusBadge(status) {
    const safeStatus = escapeHtml(status || 'UNKNOWN');
    return `<span class="badge" style="padding: 2px 8px; border-radius: var(--radius-sm); font-size: var(--fs-xs); background: var(--bg-alt); color: var(--text); border: 1px solid var(--border);">${safeStatus}</span>`;
  }

  // --- TAB SWITCHING ---
  function initTabs() {
    const tabButtons = document.querySelectorAll('.dash-tab-btn[data-tab]');
    const tabPanels = document.querySelectorAll('.dash-tab-panel');

    function activateTab(tabId) {
      tabButtons.forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      tabPanels.forEach(panel => {
        if (panel.id === `panel-${tabId}`) {
          panel.style.display = 'block';
        } else {
          panel.style.display = 'none';
        }
      });
    }

    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = btn.getAttribute('data-tab');
        if (tab) activateTab(tab);
      });
    });

    document.querySelectorAll('.btn-switch-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        if (target) activateTab(target);
      });
    });
  }

  // --- AUTH CHECK & PROFILE POPULATION ---
  async function checkAuthAndInit() {
    try {
      const res = await global.SkyBoltApi.get('/auth/me');
      if (!res.success || !res.data) {
        window.location.href = '/login?redirect=/owner-dashboard';
        return;
      }

      currentOwner = res.data.user || res.data;

      // Ensure user has owner access (OWNER or ADMIN)
      if (currentOwner.role !== 'OWNER' && currentOwner.role !== 'ADMIN') {
        if (global.showToast) {
          global.showToast('Access restricted to registered Vehicle Owners.', 'warning');
        }
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1200);
        return;
      }

      // Use actual backend `name` field — not firstName/lastName
      const displayName = currentOwner.name || 'Vehicle Owner';

      const nameElem = document.getElementById('user-name-display');
      if (nameElem) nameElem.textContent = displayName;

      const initialElem = document.getElementById('user-avatar-initial');
      if (initialElem) {
        initialElem.textContent = displayName.charAt(0).toUpperCase();
      }

      const verifBadgeElem = document.getElementById('owner-verification-badge');
      if (verifBadgeElem) {
        verifBadgeElem.innerHTML = getVerificationBadge(currentOwner.status);
      }

      // Populate profile form inputs using correct field names
      const profName = document.getElementById('prof-name');
      if (profName) profName.value = currentOwner.name || '';
      const profEmail = document.getElementById('prof-email');
      if (profEmail) profEmail.value = currentOwner.email || '';
      const profPhone = document.getElementById('prof-phone');
      if (profPhone) profPhone.value = currentOwner.phone || '';
      const profCity = document.getElementById('prof-city');
      if (profCity) profCity.value = currentOwner.city || '';
      const profAddress = document.getElementById('prof-address');
      if (profAddress) profAddress.value = currentOwner.address || '';
      const profIdNum = document.getElementById('prof-id-num');
      if (profIdNum) profIdNum.value = currentOwner.idVerificationNumber || '';

      // Load Dashboard Data concurrently
      await Promise.all([
        loadStats(),
        loadVehicles(),
        loadBookings(),
        loadEarnings()
      ]);

    } catch (err) {
      console.error('Owner dashboard auth error:', err);
      window.location.href = '/login?redirect=/owner-dashboard';
    }
  }

  // --- STATS ---
  // Backend returns: { totalVehicles, activeVehicles, pendingApprovalVehicles, totalBookings, upcomingRentals, completedRentals, totalEarnings }
  async function loadStats() {
    try {
      const res = await global.SkyBoltApi.get('/owner/stats');
      if (res.success && res.data) {
        // Stats are returned directly in res.data (not nested under res.data.stats)
        const stats = res.data;

        const totalV = document.getElementById('stat-total-vehicles');
        if (totalV) totalV.textContent = stats.totalVehicles != null ? stats.totalVehicles : '—';

        const activeV = document.getElementById('stat-active-vehicles');
        if (activeV) activeV.textContent = stats.activeVehicles != null ? stats.activeVehicles : '—';

        // Backend field is pendingApprovalVehicles, NOT pendingVehicles
        const pendingV = document.getElementById('stat-pending-vehicles');
        if (pendingV) pendingV.textContent = stats.pendingApprovalVehicles != null ? stats.pendingApprovalVehicles : '—';

        const totalB = document.getElementById('stat-total-bookings');
        if (totalB) totalB.textContent = stats.totalBookings != null ? stats.totalBookings : '—';

        const totalE = document.getElementById('stat-total-earnings');
        if (totalE) totalE.textContent = formatCurrency(stats.totalEarnings);
      } else {
        console.warn('[Owner Dashboard] Stats API returned unsuccessful response:', res.error);
      }
    } catch (err) {
      console.error('Failed to load owner stats:', err);
    }
  }

  // --- VEHICLES ---
  async function loadVehicles() {
    const overviewTbody = document.getElementById('tbody-overview-vehicles');
    const fullTbody = document.getElementById('tbody-full-vehicles');

    try {
      const res = await global.SkyBoltApi.get('/owner/vehicles');
      // Backend: { success, data: { vehicles: [...] } }
      const vehicleList = res.data && res.data.vehicles ? res.data.vehicles
        : Array.isArray(res.data) ? res.data : null;

      if (res.success && vehicleList) {
        ownerVehicles = vehicleList;

        if (ownerVehicles.length === 0) {
          const emptyRow = '<tr><td colspan="6" class="text-center text-muted" style="padding: var(--space-8);"><i class="fa-solid fa-motorcycle" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.3;"></i>You have not listed any vehicles yet.<br><a href="/owner/add-vehicle" class="btn btn-primary btn-sm mt-3"><i class="fa-solid fa-plus"></i> List Your First Vehicle</a></td></tr>';
          if (overviewTbody) overviewTbody.innerHTML = emptyRow;
          if (fullTbody) fullTbody.innerHTML = emptyRow;
          return;
        }

        // Render Overview table (up to 5 items)
        if (overviewTbody) {
          overviewTbody.innerHTML = ownerVehicles.slice(0, 5).map(v => {
            const imgUrl = escapeHtml((v.images && v.images[0] && v.images[0].url) || 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=300');
            const vName = escapeHtml(v.name || v.model || '');
            const vBrand = escapeHtml(v.brand || '');
            const vCode = escapeHtml(v.vehicleCode || v.id || '');
            const vCategory = escapeHtml(v.category || 'BIKE');
            const hubName = escapeHtml(v.location?.hubName || v.location?.city || 'Fleet Hub');
            const vId = escapeHtml(v.id || '');
            const vCodeForUrl = encodeURIComponent(v.vehicleCode || v.id || '');
            return `
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: var(--space-3);">
                    <img src="${imgUrl}" alt="${vName}" style="width: 48px; height: 36px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                    <div>
                      <div style="font-weight: 700; color: var(--text);">${vBrand} ${vName}</div>
                      <div class="text-muted" style="font-size: var(--fs-xs);">${vCode}</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge" style="background: var(--bg-alt); color: var(--text-secondary); border: 1px solid var(--border); padding: 2px 8px; border-radius: var(--radius-sm); font-size: var(--fs-xs);">${vCategory}</span></td>
                <td style="font-weight: 700;">${formatCurrency(v.rental?.baseRate)}<span style="font-size: var(--fs-xs); font-weight: 400; color: var(--text-muted);">/day</span></td>
                <td>${hubName}</td>
                <td>${getStatusBadge(v.status)}</td>
                <td>
                  <button class="btn btn-sm btn-outline btn-edit-veh" data-id="${vId}"><i class="fa-solid fa-pen"></i></button>
                  <a href="/vehicle-details?id=${vCodeForUrl}" class="btn btn-sm btn-outline" title="View"><i class="fa-solid fa-eye"></i></a>
                </td>
              </tr>
            `;
          }).join('');
        }

        // Render Full Vehicles table
        if (fullTbody) {
          fullTbody.innerHTML = ownerVehicles.map(v => {
            const canToggle = v.status === 'ACTIVE' || v.status === 'INACTIVE';
            const toggleLabel = v.status === 'ACTIVE' ? 'Disable' : 'Enable';
            const toggleIcon = v.status === 'ACTIVE' ? 'fa-pause' : 'fa-play';
            const toggleBtnClass = v.status === 'ACTIVE' ? 'btn-outline' : 'btn-primary';
            const imgUrl = escapeHtml((v.images && v.images[0] && v.images[0].url) || 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=300');
            const vName = escapeHtml(v.name || v.model || '');
            const vBrand = escapeHtml(v.brand || '');
            const vCode = escapeHtml(v.vehicleCode || v.id || '');
            const vYear = escapeHtml(v.year || '');
            const vCategory = escapeHtml(v.category || 'BIKE');
            const vId = escapeHtml(v.id || '');
            const safeToggleLabel = escapeHtml(toggleLabel);

            return `
              <tr>
                <td>
                  <div style="display: flex; align-items: center; gap: var(--space-3);">
                    <img src="${imgUrl}" alt="${vName}" style="width: 54px; height: 40px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                    <div>
                      <div style="font-weight: 700; color: var(--text); font-size: var(--fs-base);">${vBrand} ${vName}</div>
                      <div class="text-muted" style="font-size: var(--fs-xs);">${vYear} &bull; ${vCode}</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge" style="background: var(--bg-alt); color: var(--text-secondary); border: 1px solid var(--border); padding: 2px 8px; border-radius: var(--radius-sm); font-size: var(--fs-xs);">${vCategory}</span></td>
                <td style="font-weight: 700; color: var(--primary);">${formatCurrency(v.rental?.baseRate)}<span style="font-size: var(--fs-xs); font-weight: 400; color: var(--text-muted);">/day</span></td>
                <td>${formatCurrency(v.rental?.deposit)}</td>
                <td>${getStatusBadge(v.status)}</td>
                <td>
                  <div style="display: flex; gap: var(--space-1); flex-wrap: wrap;">
                    <button class="btn btn-sm btn-outline btn-edit-veh" data-id="${vId}" title="Edit Listing">
                      <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    ${canToggle ? `
                      <button class="btn btn-sm ${escapeHtml(toggleBtnClass)} btn-toggle-status" data-id="${vId}" data-current="${escapeHtml(v.status)}" title="${safeToggleLabel} Listing">
                        <i class="fa-solid ${escapeHtml(toggleIcon)}"></i> ${safeToggleLabel}
                      </button>
                    ` : ''}
                    <button class="btn btn-sm btn-outline btn-delete-veh" data-id="${vId}" title="Delete Listing" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.3);">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }

        bindVehicleActions();
      } else {
        // API error — show the message safely via textContent
        const errMsg = (res.error && res.error.message) || 'Could not load vehicles.';
        const makeErrRow = (cols) => {
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = cols;
          td.className = 'text-center text-muted';
          td.style.padding = 'var(--space-8)';
          td.textContent = errMsg;
          tr.appendChild(td);
          return tr;
        };
        if (overviewTbody) { overviewTbody.innerHTML = ''; overviewTbody.appendChild(makeErrRow(6)); }
        if (fullTbody) { fullTbody.innerHTML = ''; fullTbody.appendChild(makeErrRow(6)); }
      }
    } catch (err) {
      console.error('Failed to load owner vehicles:', err);
      const makeErrRow = (cols) => {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = cols;
        td.className = 'text-center text-muted';
        td.style.padding = 'var(--space-8)';
        td.textContent = 'Failed to load vehicles. Please refresh.';
        tr.appendChild(td);
        return tr;
      };
      if (overviewTbody) { overviewTbody.innerHTML = ''; overviewTbody.appendChild(makeErrRow(6)); }
      if (fullTbody) { fullTbody.innerHTML = ''; fullTbody.appendChild(makeErrRow(6)); }
    }
  }

  // --- VEHICLE ACTIONS (EDIT / TOGGLE / DELETE) ---
  function bindVehicleActions() {
    // Edit Modal Open
    document.querySelectorAll('.btn-edit-veh').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const veh = ownerVehicles.find(v => (v.id || v._id) === id);
        if (!veh) return;

        document.getElementById('edit-veh-id').value = veh.id || veh._id;
        document.getElementById('edit-veh-name').value = veh.name || '';
        document.getElementById('edit-veh-rate').value = veh.rental?.baseRate || '';
        document.getElementById('edit-veh-deposit').value = veh.rental?.deposit || '';
        document.getElementById('edit-veh-location').value = veh.location?.hubName || '';
        document.getElementById('edit-veh-desc').value = veh.description || '';

        const modal = document.getElementById('edit-vehicle-modal');
        if (modal) modal.style.display = 'flex';
      });
    });

    // Toggle Active / Inactive — use data attributes, no inline onclick
    document.querySelectorAll('.btn-toggle-status').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const current = btn.getAttribute('data-current');
        const newStatus = current === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

        try {
          btn.disabled = true;
          const res = await global.SkyBoltApi.patch(`/owner/vehicles/${encodeURIComponent(id)}/status`, { status: newStatus });
          if (res.success) {
            if (global.showToast) global.showToast(`Vehicle marked as ${newStatus.toLowerCase()}.`, 'success');
            await Promise.all([loadVehicles(), loadStats()]);
          } else {
            if (global.showToast) global.showToast(res.error?.message || 'Failed to update vehicle status.', 'error');
          }
        } catch {
          if (global.showToast) global.showToast('Network error updating status.', 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });

    // Delete Vehicle
    document.querySelectorAll('.btn-delete-veh').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Are you sure you want to permanently delete this vehicle listing? This action cannot be undone.')) {
          return;
        }

        try {
          btn.disabled = true;
          const res = await global.SkyBoltApi.delete(`/owner/vehicles/${encodeURIComponent(id)}`);
          if (res.success) {
            if (global.showToast) global.showToast('Vehicle listing deleted successfully.', 'success');
            await Promise.all([loadVehicles(), loadStats()]);
          } else {
            if (global.showToast) global.showToast(res.error?.message || 'Failed to delete vehicle.', 'error');
          }
        } catch {
          if (global.showToast) global.showToast('Network error deleting vehicle.', 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // --- EDIT MODAL SUBMIT & CLOSE ---
  function initEditModal() {
    const modal = document.getElementById('edit-vehicle-modal');
    const closeBtn = document.getElementById('btn-close-edit-modal');
    const form = document.getElementById('edit-vehicle-form');

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-veh-id').value;
        const name = document.getElementById('edit-veh-name').value.trim();
        const baseRate = Number(document.getElementById('edit-veh-rate').value);
        const deposit = Number(document.getElementById('edit-veh-deposit').value) || 0;
        const hubName = document.getElementById('edit-veh-location').value.trim();
        const description = document.getElementById('edit-veh-desc').value.trim();

        const submitBtn = document.getElementById('btn-submit-edit-vehicle');
        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
          }

          const payload = {
            name,
            description,
            rental: { baseRate, deposit, currency: 'INR' },
            location: { hubName }
          };

          const res = await global.SkyBoltApi.patch(`/owner/vehicles/${encodeURIComponent(id)}`, payload);
          if (res.success) {
            if (global.showToast) global.showToast('Vehicle details updated successfully.', 'success');
            modal.style.display = 'none';
            await loadVehicles();
          } else {
            if (global.showToast) global.showToast(res.error?.message || 'Failed to update vehicle.', 'error');
          }
        } catch {
          if (global.showToast) global.showToast('Network error updating vehicle.', 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Save Vehicle Updates';
          }
        }
      });
    }
  }

  // --- BOOKINGS ---
  // Backend returns: { id, bookingReference, pickupAt, returnAt, status, paymentStatus,
  //   customer: { name, email, phone }, vehicle: { id, name, brand, model, image },
  //   pricing: { total, currency, ownerEarning }, createdAt }
  async function loadBookings() {
    const overviewTbody = document.getElementById('tbody-overview-bookings');
    const fullTbody = document.getElementById('tbody-full-bookings');

    try {
      const res = await global.SkyBoltApi.get('/owner/bookings');
      // Backend: { success, data: { bookings: [...] } }
      const bookingList = res.data && res.data.bookings ? res.data.bookings
        : Array.isArray(res.data) ? res.data : null;

      if (res.success && bookingList) {
        const bookings = bookingList;

        if (bookings.length === 0) {
          if (overviewTbody) overviewTbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding: var(--space-8);">No bookings recorded yet.</td></tr>';
          if (fullTbody) fullTbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: var(--space-8);"><i class="fa-solid fa-calendar-xmark" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.3;"></i>No customer bookings recorded for your vehicles yet.</td></tr>';
          return;
        }

        // Render Overview table (5 items)
        // Use: pickupAt/returnAt, customer.name, pricing.ownerEarning
        if (overviewTbody) {
          overviewTbody.innerHTML = bookings.slice(0, 5).map(b => {
            const ref = escapeHtml(b.bookingReference || b.id || '');
            const vName = escapeHtml(b.vehicle?.name || b.vehicle?.model || 'Vehicle');
            const custName = escapeHtml(b.customer?.name || 'Customer');
            const dateRange = `${formatDate(b.pickupAt)} &rarr; ${formatDate(b.returnAt)}`;
            const ownerEarning = formatCurrency(b.pricing?.ownerEarning);
            return `
              <tr>
                <td style="font-weight: 700; color: var(--primary);">${ref}</td>
                <td>${vName}</td>
                <td>${custName}</td>
                <td style="font-size: var(--fs-xs);">${dateRange}</td>
                <td>${getPaymentBadge(b.paymentStatus)}</td>
                <td style="font-weight: 700; color: #7c3aed;">${ownerEarning}</td>
              </tr>
            `;
          }).join('');
        }

        // Render Full table
        if (fullTbody) {
          fullTbody.innerHTML = bookings.map(b => {
            const ref = escapeHtml(b.bookingReference || b.id || '');
            const vName = escapeHtml(b.vehicle?.name || b.vehicle?.model || 'Vehicle');
            const vCategory = escapeHtml(b.vehicle?.category || '');
            const custName = escapeHtml(b.customer?.name || 'Customer');
            const custEmail = escapeHtml(b.customer?.email || '');
            const ownerEarning = formatCurrency(b.pricing?.ownerEarning);
            return `
              <tr>
                <td style="font-weight: 700; color: var(--primary);">${ref}</td>
                <td>
                  <div style="font-weight: 600;">${vName}</div>
                  <div class="text-muted" style="font-size: var(--fs-xs);">${vCategory}</div>
                </td>
                <td>
                  <div>${custName}</div>
                  <div class="text-muted" style="font-size: var(--fs-xs);">${custEmail}</div>
                </td>
                <td>${formatDate(b.pickupAt)}</td>
                <td>${formatDate(b.returnAt)}</td>
                <td>${getBookingStatusBadge(b.status)}</td>
                <td>${getPaymentBadge(b.paymentStatus)}</td>
                <td style="font-weight: 700; color: #7c3aed; font-size: var(--fs-base);">${ownerEarning}</td>
              </tr>
            `;
          }).join('');
        }
      } else {
        const errMsg = (res.error && res.error.message) || 'Could not load bookings.';
        const makeErrRow = (cols) => {
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = cols;
          td.className = 'text-center text-muted';
          td.style.padding = 'var(--space-8)';
          td.textContent = errMsg;
          tr.appendChild(td);
          return tr;
        };
        if (overviewTbody) { overviewTbody.innerHTML = ''; overviewTbody.appendChild(makeErrRow(6)); }
        if (fullTbody) { fullTbody.innerHTML = ''; fullTbody.appendChild(makeErrRow(8)); }
      }
    } catch (err) {
      console.error('Failed to load owner bookings:', err);
      if (overviewTbody) overviewTbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding: var(--space-8);">Failed to load bookings. Please refresh.</td></tr>';
      if (fullTbody) fullTbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: var(--space-8);">Failed to load bookings. Please refresh.</td></tr>';
    }
  }

  // --- EARNINGS ---
  // Backend returns: { totalEarnings, pendingEarnings, completedEarnings, currency, recentTransactions }
  // Each transaction: { bookingReference, vehicleName, pickupAt, returnAt, bookingStatus, paymentStatus, amount, createdAt }
  async function loadEarnings() {
    const ledgerTbody = document.getElementById('tbody-earnings-ledger');

    try {
      const res = await global.SkyBoltApi.get('/owner/earnings');
      if (res.success && res.data) {
        const data = res.data;

        // Map correct backend field names: totalEarnings, pendingEarnings, completedEarnings
        const paidElem = document.getElementById('stat-paid-earnings');
        if (paidElem) paidElem.textContent = formatCurrency(data.totalEarnings);

        const pendingElem = document.getElementById('stat-pending-earnings');
        if (pendingElem) pendingElem.textContent = formatCurrency(data.pendingEarnings);

        const compElem = document.getElementById('stat-completed-earnings');
        if (compElem) compElem.textContent = formatCurrency(data.completedEarnings);

        // recentTransactions is the correct backend field name
        const items = data.recentTransactions || [];
        if (ledgerTbody) {
          if (items.length === 0) {
            ledgerTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding: var(--space-8);">No earnings transactions recorded yet.</td></tr>';
          } else {
            ledgerTbody.innerHTML = items.map(item => {
              // pickupAt/returnAt are the correct date fields; bookingStatus/paymentStatus for status
              const ref = escapeHtml(item.bookingReference || '');
              const vName = escapeHtml(item.vehicleName || 'Vehicle Rental');
              const dateRange = `${formatDate(item.pickupAt)} &rarr; ${formatDate(item.returnAt)}`;
              const statusDisplay = escapeHtml(item.bookingStatus || item.paymentStatus || 'SETTLED');
              const amount = formatCurrency(item.amount);
              return `
                <tr>
                  <td style="font-weight: 700; color: var(--primary);">${ref}</td>
                  <td>${vName}</td>
                  <td style="font-size: var(--fs-xs);">${dateRange}</td>
                  <td><span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 8px; border-radius: var(--radius-sm); font-size: var(--fs-xs);">${statusDisplay}</span></td>
                  <td style="font-weight: 700; color: #10B981;">+${amount}</td>
                </tr>
              `;
            }).join('');
          }
        }
      } else {
        console.warn('[Owner Dashboard] Earnings API returned unsuccessful response:', res.error);
      }
    } catch (err) {
      console.error('Failed to load earnings:', err);
    }
  }

  // --- PROFILE FORM ---
  // Issue 2 fix: call PATCH /users/me (not /auth/profile) with correct schema
  function initProfileForm() {
    const form = document.getElementById('owner-profile-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-profile');
      const name = (document.getElementById('prof-name')?.value || '').trim();
      const phone = (document.getElementById('prof-phone')?.value || '').trim();
      const city = (document.getElementById('prof-city')?.value || '').trim();
      const address = (document.getElementById('prof-address')?.value || '').trim();
      const licenseNumber = (document.getElementById('prof-id-num')?.value || '').trim();

      // Build payload with only fields that have values to avoid sending empty strings
      const payload = {};
      if (name) payload.name = name;
      if (phone) payload.phone = phone;
      if (city) payload.city = city;
      if (address) payload.address = address;
      if (licenseNumber) payload.licenseNumber = licenseNumber;

      try {
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        }

        // Correct endpoint: PATCH /users/me (not /auth/profile)
        const res = await global.SkyBoltApi.patch('/users/me', payload);

        if (res.success) {
          if (global.showToast) global.showToast('Profile updated successfully.', 'success');
          // Update local state and UI with returned user data
          if (res.data && res.data.user) {
            currentOwner = { ...currentOwner, ...res.data.user };
          } else if (name) {
            currentOwner = { ...currentOwner, name };
          }
          const nameElem = document.getElementById('user-name-display');
          if (nameElem) nameElem.textContent = currentOwner.name || name;
          const initialElem = document.getElementById('user-avatar-initial');
          if (initialElem && currentOwner.name) {
            initialElem.textContent = currentOwner.name.charAt(0).toUpperCase();
          }
        } else {
          if (global.showToast) global.showToast(res.error?.message || 'Failed to update profile.', 'error');
        }
      } catch {
        if (global.showToast) global.showToast('Network error updating profile.', 'error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
        }
      }
    });
  }

  // --- INIT ON DOM READY ---
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEditModal();
    initProfileForm();
    checkAuthAndInit();
  });

})(typeof window !== 'undefined' ? window : globalThis);
