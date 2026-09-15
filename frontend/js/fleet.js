/* ==========================================================================
   SkyBolt Rentals - Production Fleet & Hub Logistics Manager (Vanilla JS Engine)
   Empowers Operations Staff & Fleet Managers to manage physical fleet state,
   logistics hubs, transfers, maintenance, and vehicle readiness.
   ========================================================================== */

(function(global) {
  'use strict';

  let currentVehicles = [];
  let currentHubs = [];
  let activeFilter = 'ALL';
  let activeSearch = '';
  let activeHubFilter = '';

  const statusColors = {
    AVAILABLE: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0', label: 'Available', icon: 'fa-circle-check' },
    RESERVED: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', label: 'Reserved', icon: 'fa-clock' },
    ACTIVE_RENTAL: { bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe', label: 'Active Rental', icon: 'fa-road' },
    MAINTENANCE: { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa', label: 'Maintenance', icon: 'fa-wrench' },
    INSPECTION: { bg: '#fefce8', text: '#ca8a04', border: '#fef08a', label: 'Inspection', icon: 'fa-clipboard-check' },
    TRANSFER_PENDING: { bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc', label: 'In Transit', icon: 'fa-truck-arrow-right' },
    UNAVAILABLE: { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb', label: 'Unavailable', icon: 'fa-ban' },
    RETIRED: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', label: 'Retired', icon: 'fa-trash-can' }
  };

  /**
   * Initialize Fleet Portal
   */
  async function initFleetPortal() {
    setupEventListeners();
    await loadHubs();
    await loadFleet();
  }

  /**
   * Set up UI event listeners
   */
  function setupEventListeners() {
    const searchInput = document.getElementById('fleet-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        activeSearch = e.target.value.trim().toLowerCase();
        renderFleetTable();
      });
    }

    const filterPills = document.querySelectorAll('.fleet-filter-btn');
    filterPills.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterPills.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.status || 'ALL';
        renderFleetTable();
      });
    });

    const hubSelect = document.getElementById('fleet-hub-filter');
    if (hubSelect) {
      hubSelect.addEventListener('change', (e) => {
        activeHubFilter = e.target.value;
        renderFleetTable();
      });
    }

    const refreshBtn = document.getElementById('btn-refresh-fleet');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...';
        await loadHubs();
        await loadFleet();
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh Fleet';
      });
    }
  }

  /**
   * Load logistics hubs
   */
  async function loadHubs() {
    try {
      const res = await global.SkyBoltApi.get('/hubs');
      currentHubs = res.data || [];
      renderHubOverview();
      populateHubFilter();
    } catch (err) {
      console.warn('[Fleet] Hub load notice:', err);
    }
  }

  /**
   * Load fleet inventory
   */
  async function loadFleet() {
    const tableBody = document.getElementById('fleet-table-body');
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading fleet inventory...</td></tr>';
    }

    try {
      const res = await global.SkyBoltApi.get('/fleet');
      currentVehicles = res.data || [];
      updateKPIs();
      renderFleetTable();
    } catch (err) {
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger" style="padding: 30px;"><i class="fa-solid fa-triangle-exclamation"></i> ${err.message || 'Please log in with Staff or Manager permissions to access Fleet Management.'}</td></tr>`;
      }
    }
  }

  /**
   * Update KPI Summary Cards
   */
  function updateKPIs() {
    const totalCount = currentVehicles.length;
    const availableCount = currentVehicles.filter((v) => (v.fleetStatus || 'AVAILABLE') === 'AVAILABLE').length;
    const activeRentalCount = currentVehicles.filter((v) => v.fleetStatus === 'ACTIVE_RENTAL').length;
    const maintenanceCount = currentVehicles.filter((v) => v.fleetStatus === 'MAINTENANCE').length;
    const inspectionCount = currentVehicles.filter((v) => v.fleetStatus === 'INSPECTION').length;
    const transitCount = currentVehicles.filter((v) => v.fleetStatus === 'TRANSFER_PENDING').length;

    const elTotal = document.getElementById('kpi-total-vehicles');
    const elAvailable = document.getElementById('kpi-available');
    const elRentals = document.getElementById('kpi-rentals');
    const elMaintenance = document.getElementById('kpi-maintenance');
    const elTransit = document.getElementById('kpi-transit');

    if (elTotal) elTotal.textContent = totalCount;
    if (elAvailable) elAvailable.textContent = availableCount;
    if (elRentals) elRentals.textContent = activeRentalCount;
    if (elMaintenance) elMaintenance.textContent = maintenanceCount + inspectionCount;
    if (elTransit) elTransit.textContent = transitCount;
  }

  /**
   * Render Logistics Hub overview cards
   */
  function renderHubOverview() {
    const container = document.getElementById('hub-overview-cards');
    if (!container) return;

    if (currentHubs.length === 0) {
      container.innerHTML = '<p class="text-muted">No logistics hubs configured.</p>';
      return;
    }

    container.innerHTML = currentHubs
      .map((hub) => {
        const pct = Math.min(100, Math.round(((hub.currentVehicleCount || 0) / hub.capacity) * 100));
        const isFull = (hub.currentVehicleCount || 0) >= hub.capacity;
        return `
          <div class="hub-kpi-card" style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-4); background: var(--white);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <strong style="font-size: 1rem; color: var(--text);">${hub.name}</strong>
                <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${hub.code} • ${hub.city}</div>
              </div>
              <span class="badge" style="background: ${hub.operationalStatus === 'ACTIVE' ? '#ecfdf5' : '#fef2f2'}; color: ${hub.operationalStatus === 'ACTIVE' ? '#059669' : '#dc2626'}; border: 1px solid ${hub.operationalStatus === 'ACTIVE' ? '#a7f3d0' : '#fecaca'}; font-size: 0.7rem;">
                ${hub.operationalStatus}
              </span>
            </div>
            <div style="margin-bottom: 6px; display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
              <span>Occupancy: ${hub.currentVehicleCount || 0} / ${hub.capacity}</span>
              <span style="font-weight: 600; color: ${isFull ? 'var(--danger)' : 'var(--primary)'};">${pct}%</span>
            </div>
            <div style="width: 100%; height: 6px; background: #e5e7eb; border-radius: 999px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: ${isFull ? 'var(--danger)' : 'var(--primary)'}; border-radius: 999px;"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  /**
   * Populate Hub filter dropdown
   */
  function populateHubFilter() {
    const select = document.getElementById('fleet-hub-filter');
    if (!select) return;

    select.innerHTML = '<option value="">All Logistics Hubs</option>' +
      currentHubs.map((h) => `<option value="${h.id}">${h.name} (${h.code})</option>`).join('');
  }

  /**
   * Render Fleet Table based on current filters
   */
  function renderFleetTable() {
    const tableBody = document.getElementById('fleet-table-body');
    if (!tableBody) return;

    let filtered = currentVehicles;

    if (activeFilter !== 'ALL') {
      filtered = filtered.filter((v) => (v.fleetStatus || 'AVAILABLE') === activeFilter);
    }

    if (activeHubFilter) {
      filtered = filtered.filter((v) => v.currentHubId === activeHubFilter || (v.location && v.location.locationId === activeHubFilter));
    }

    if (activeSearch) {
      filtered = filtered.filter((v) =>
        (v.name && v.name.toLowerCase().includes(activeSearch)) ||
        (v.brand && v.brand.toLowerCase().includes(activeSearch)) ||
        (v.model && v.model.toLowerCase().includes(activeSearch)) ||
        (v.vehicleCode && v.vehicleCode.toLowerCase().includes(activeSearch)) ||
        (v.registrationNumber && v.registrationNumber.toLowerCase().includes(activeSearch))
      );
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 40px; color: var(--text-muted);">
            No vehicles match the selected fleet filter.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered
      .map((v) => {
        const fleetSt = v.fleetStatus || 'AVAILABLE';
        const stStyle = statusColors[fleetSt] || statusColors.AVAILABLE;
        const hubName = v.location?.name || 'Unassigned Hub';
        const hubCity = v.location?.city || '';

        return `
          <tr style="border-bottom: 1px solid var(--border); transition: background 0.15s ease;">
            <td style="padding: 12px 16px;">
              <div style="font-weight: 600; color: var(--text);">${v.name}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); font-family: monospace;">
                ${v.vehicleCode} ${v.registrationNumber ? `• ${v.registrationNumber}` : ''}
              </div>
            </td>
            <td style="padding: 12px 16px;">
              <span class="badge" style="background: #f3f4f6; color: #374151; font-weight: 600; font-size: 0.75rem;">
                ${v.category}
              </span>
            </td>
            <td style="padding: 12px 16px;">
              <div style="font-weight: 500; color: var(--text);">${hubName}</div>
              ${hubCity ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${hubCity}</div>` : ''}
            </td>
            <td style="padding: 12px 16px;">
              <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; background: ${stStyle.bg}; color: ${stStyle.text}; border: 1px solid ${stStyle.border};">
                <i class="fa-solid ${stStyle.icon}" style="font-size: 0.75em;"></i>
                ${stStyle.label}
              </span>
            </td>
            <td style="padding: 12px 16px; font-family: monospace; font-size: 0.85rem;">
              ${(v.odometer || 0).toLocaleString()} km
            </td>
            <td style="padding: 12px 16px;">
              <strong>₹${v.rental?.baseRate || 0}</strong><span style="font-size: 0.75rem; color: var(--text-muted);">/day</span>
            </td>
            <td style="padding: 12px 16px; text-align: right;">
              <div style="display: inline-flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                <button class="btn btn-sm btn-outline" onclick="SkyBoltFleet.openReadinessModal('${v.id}')" title="Check Readiness">
                  <i class="fa-solid fa-stethoscope"></i> Ready?
                </button>
                <button class="btn btn-sm btn-outline" onclick="SkyBoltFleet.openHubModal('${v.id}')" title="Assign Hub">
                  <i class="fa-solid fa-location-dot"></i> Hub
                </button>
                <button class="btn btn-sm btn-outline" onclick="SkyBoltFleet.openTransferModal('${v.id}')" title="Transfer Vehicle" ${fleetSt === 'ACTIVE_RENTAL' || fleetSt === 'RETIRED' ? 'disabled' : ''}>
                  <i class="fa-solid fa-truck"></i> Transfer
                </button>
                ${fleetSt === 'AVAILABLE' ? `
                  <button class="btn btn-sm btn-outline" style="color: #ea580c; border-color: #fed7aa;" onclick="SkyBoltFleet.quickStatus('${v.id}', 'MAINTENANCE')" title="Send to Maintenance">
                    <i class="fa-solid fa-wrench"></i> Service
                  </button>
                ` : fleetSt === 'MAINTENANCE' ? `
                  <button class="btn btn-sm btn-outline" style="color: #ca8a04; border-color: #fef08a;" onclick="SkyBoltFleet.completeMaintenanceModal('${v.id}')" title="Complete Maintenance">
                    <i class="fa-solid fa-check"></i> Done
                  </button>
                ` : fleetSt === 'INSPECTION' ? `
                  <button class="btn btn-sm btn-outline" style="color: #059669; border-color: #a7f3d0;" onclick="SkyBoltFleet.openInspectionModal('${v.id}')" title="Perform Inspection">
                    <i class="fa-solid fa-clipboard-check"></i> Inspect
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  /**
   * Action: Open Physical Readiness Evaluation Modal
   */
  async function openReadinessModal(vehicleId) {
    try {
      const res = await global.SkyBoltApi.get(`/fleet/${vehicleId}/readiness`);
      const readiness = res.data;
      const v = currentVehicles.find((item) => item.id === vehicleId);

      const statusHtml = readiness.ready
        ? `<div style="padding: 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; color: #059669; font-weight: 600; display: flex; align-items: center; gap: 8px;">
             <i class="fa-solid fa-circle-check" style="font-size: 1.2rem;"></i>
             Vehicle is OPERATIONALLY READY for customer rental.
           </div>`
        : `<div style="padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-weight: 600; display: flex; align-items: flex-start; gap: 8px;">
             <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.2rem; margin-top: 2px;"></i>
             <div>
               <div>Vehicle is NOT operationally ready for rental.</div>
               <ul style="margin: 6px 0 0 0; padding-left: 20px; font-weight: 400; font-size: 0.85rem;">
                 ${readiness.reasons.map((r) => `<li>${r}</li>`).join('')}
               </ul>
             </div>
           </div>`;

      showCustomModal('Vehicle Rental Readiness Verification', `
        <div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 4px 0;">${v ? v.name : 'Vehicle'} (${v ? v.vehicleCode : vehicleId})</h4>
          <div style="font-size: 0.85rem; color: var(--text-muted);">
            Fleet Status: <strong>${readiness.fleetStatus}</strong> • Stationed Hub: <strong>${readiness.hubName || 'Unassigned'}</strong>
          </div>
        </div>
        ${statusHtml}
      `);
    } catch (err) {
      global.showToast(err.message || 'Failed to check vehicle readiness', 'error');
    }
  }

  /**
   * Action: Open Hub Assignment Modal
   */
  function openHubModal(vehicleId) {
    const v = currentVehicles.find((item) => item.id === vehicleId);
    if (!v) return;

    const options = currentHubs
      .map((h) => {
        const disabled = h.operationalStatus !== 'ACTIVE' || (h.availableCapacity <= 0 && h.id !== v.currentHubId);
        return `<option value="${h.id}" ${h.id === v.currentHubId ? 'selected' : ''} ${disabled ? 'disabled' : ''}>
          ${h.name} (${h.code}) — ${h.availableCapacity} spots free ${h.operationalStatus !== 'ACTIVE' ? `[${h.operationalStatus}]` : ''}
        </option>`;
      })
      .join('');

    showCustomModal('Assign Vehicle to Hub', `
      <form id="form-assign-hub" onsubmit="SkyBoltFleet.submitHubAssignment(event, '${vehicleId}')">
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">
          Select operational logistics center for <strong>${v.name}</strong> (${v.vehicleCode}):
        </p>
        <div class="form-group" style="margin-bottom: 20px;">
          <label class="form-label">Logistics Hub</label>
          <select id="select-target-hub" class="form-control" required>
            <option value="">Select target hub...</option>
            ${options}
          </select>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-outline" onclick="SkyBoltFleet.closeCustomModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Assign Hub</button>
        </div>
      </form>
    `);
  }

  /**
   * Action: Submit Hub Assignment
   */
  async function submitHubAssignment(event, vehicleId) {
    event.preventDefault();
    const select = document.getElementById('select-target-hub');
    if (!select || !select.value) return;

    try {
      await global.SkyBoltApi.post(`/fleet/${vehicleId}/hub`, { hubId: select.value });
      global.showToast('Vehicle assigned to hub successfully.', 'success');
      closeCustomModal();
      await loadHubs();
      await loadFleet();
    } catch (err) {
      global.showToast(err.message || 'Hub assignment failed', 'error');
    }
  }

  /**
   * Action: Open Transfer Modal
   */
  function openTransferModal(vehicleId) {
    const v = currentVehicles.find((item) => item.id === vehicleId);
    if (!v) return;

    const options = currentHubs
      .filter((h) => h.id !== v.currentHubId)
      .map((h) => {
        const disabled = h.operationalStatus !== 'ACTIVE' || h.availableCapacity <= 0;
        return `<option value="${h.id}" ${disabled ? 'disabled' : ''}>
          ${h.name} (${h.code}) — ${h.availableCapacity} available
        </option>`;
      })
      .join('');

    showCustomModal('Dispatch Vehicle Transfer', `
      <form id="form-transfer" onsubmit="SkyBoltFleet.submitTransfer(event, '${vehicleId}')">
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">
          Initiate transfer of <strong>${v.name}</strong> (${v.vehicleCode}) to another hub:
        </p>
        <div class="form-group" style="margin-bottom: 14px;">
          <label class="form-label">Destination Hub</label>
          <select id="transfer-target-hub" class="form-control" required>
            <option value="">Select destination hub...</option>
            ${options}
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 14px;">
          <label class="form-label">Reason</label>
          <input type="text" id="transfer-reason" class="form-control" value="Inventory rebalance" required />
        </div>
        <div class="form-group" style="margin-bottom: 20px;">
          <label class="form-label">Notes</label>
          <textarea id="transfer-notes" class="form-control" rows="2" placeholder="Driver details or dispatch remarks..."></textarea>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-outline" onclick="SkyBoltFleet.closeCustomModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-truck"></i> Dispatch Transfer</button>
        </div>
      </form>
    `);
  }

  /**
   * Action: Submit Transfer
   */
  async function submitTransfer(event, vehicleId) {
    event.preventDefault();
    const toHubId = document.getElementById('transfer-target-hub')?.value;
    const reason = document.getElementById('transfer-reason')?.value;
    const notes = document.getElementById('transfer-notes')?.value;

    if (!toHubId) return;

    try {
      await global.SkyBoltApi.post(`/fleet/${vehicleId}/transfers`, { toHubId, reason, notes });
      global.showToast('Vehicle transfer initiated successfully.', 'success');
      closeCustomModal();
      await loadHubs();
      await loadFleet();
    } catch (err) {
      global.showToast(err.message || 'Transfer initiation failed', 'error');
    }
  }

  /**
   * Action: Quick Status update
   */
  async function quickStatus(vehicleId, newStatus) {
    try {
      await global.SkyBoltApi.patch(`/fleet/${vehicleId}/status`, { status: newStatus });
      global.showToast(`Vehicle status changed to ${newStatus}.`, 'success');
      await loadFleet();
    } catch (err) {
      global.showToast(err.message || 'Failed to update status', 'error');
    }
  }

  /**
   * Action: Complete Maintenance Modal
   */
  function completeMaintenanceModal(vehicleId) {
    showCustomModal('Complete Maintenance', `
      <form onsubmit="SkyBoltFleet.submitCompleteMaintenance(event, '${vehicleId}')">
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">
          Mark maintenance work completed. <em>Vehicle will transition to INSPECTION for mandatory safety sign-off.</em>
        </p>
        <div class="form-group" style="margin-bottom: 14px;">
          <label class="form-label">Service Cost (₹)</label>
          <input type="number" id="mnt-cost" class="form-control" min="0" value="1500" />
        </div>
        <div class="form-group" style="margin-bottom: 20px;">
          <label class="form-label">Service Provider / Mechanic Notes</label>
          <input type="text" id="mnt-notes" class="form-control" placeholder="Oil changed, brake pads replaced..." />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-outline" onclick="SkyBoltFleet.closeCustomModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Complete Service</button>
        </div>
      </form>
    `);
  }

  async function submitCompleteMaintenance(event, vehicleId) {
    event.preventDefault();
    const cost = parseFloat(document.getElementById('mnt-cost')?.value || '0');
    const notes = document.getElementById('mnt-notes')?.value || '';

    try {
      await global.SkyBoltApi.patch(`/fleet/${vehicleId}/status`, {
        status: 'INSPECTION',
        reason: `Maintenance finished (${notes}). Awaiting safety inspection.`
      });
      global.showToast('Maintenance completed. Vehicle moved to INSPECTION.', 'success');
      closeCustomModal();
      await loadFleet();
    } catch (err) {
      global.showToast(err.message || 'Failed to complete maintenance', 'error');
    }
  }

  /**
   * Action: Safety Inspection Modal
   */
  function openInspectionModal(vehicleId) {
    showCustomModal('Record Safety Inspection', `
      <form onsubmit="SkyBoltFleet.submitInspection(event, '${vehicleId}')">
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 14px;">
          Multi-point safety verification prior to marking vehicle AVAILABLE:
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; background: #f9fafb; padding: 12px; border-radius: 8px;">
          <label><input type="checkbox" checked id="chk-brakes" /> Brakes & ABS</label>
          <label><input type="checkbox" checked id="chk-lights" /> Lights & Indicators</label>
          <label><input type="checkbox" checked id="chk-tires" /> Tire Pressure & Tread</label>
          <label><input type="checkbox" checked id="chk-fluids" /> Oil & Coolant Levels</label>
          <label><input type="checkbox" checked id="chk-body" /> Bodywork & Mirrors</label>
          <label><input type="checkbox" checked id="chk-docs" /> Registration & Insurance</label>
        </div>
        <div class="form-group" style="margin-bottom: 14px;">
          <label class="form-label">Inspection Result</label>
          <select id="insp-result" class="form-control" required>
            <option value="PASSED">PASSED (Restore to AVAILABLE)</option>
            <option value="FAILED">FAILED (Block in MAINTENANCE)</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 20px;">
          <label class="form-label">Inspector Remarks</label>
          <input type="text" id="insp-notes" class="form-control" placeholder="All safety checkpoints verified" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-outline" onclick="SkyBoltFleet.closeCustomModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Submit Inspection</button>
        </div>
      </form>
    `);
  }

  async function submitInspection(event, vehicleId) {
    event.preventDefault();
    const result = document.getElementById('insp-result')?.value || 'PASSED';
    const notes = document.getElementById('insp-notes')?.value || '';

    try {
      await global.SkyBoltApi.post(`/fleet/${vehicleId}/inspections`, {
        inspectionType: 'POST_MAINTENANCE',
        result,
        odometer: 15000,
        notes,
        checklists: {
          brakes: document.getElementById('chk-brakes')?.checked ?? true,
          lights: document.getElementById('chk-lights')?.checked ?? true,
          tires: document.getElementById('chk-tires')?.checked ?? true,
          fluids: document.getElementById('chk-fluids')?.checked ?? true,
          bodywork: document.getElementById('chk-body')?.checked ?? true,
          documents: document.getElementById('chk-docs')?.checked ?? true
        }
      });

      global.showToast(`Inspection recorded: ${result}`, result === 'PASSED' ? 'success' : 'warning');
      closeCustomModal();
      await loadFleet();
    } catch (err) {
      global.showToast(err.message || 'Failed to submit inspection', 'error');
    }
  }

  /**
   * Helper: Custom Modal Dialog
   */
  function showCustomModal(title, htmlContent) {
    let backdrop = document.getElementById('custom-fleet-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'custom-fleet-modal-backdrop';
      backdrop.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';
      document.body.appendChild(backdrop);
    }

    backdrop.innerHTML = `
      <div style="background: var(--white); border-radius: var(--radius-xl); padding: var(--space-6); width: 90%; max-width: 520px; box-shadow: var(--shadow-xl); border: 1px solid var(--border);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); border-bottom: 1px solid var(--border); padding-bottom: 12px;">
          <h3 style="margin: 0; font-size: 1.2rem; color: var(--text);">${title}</h3>
          <button style="border: none; background: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted);" onclick="SkyBoltFleet.closeCustomModal()">&times;</button>
        </div>
        <div>${htmlContent}</div>
      </div>
    `;
    backdrop.style.display = 'flex';
  }

  function closeCustomModal() {
    const backdrop = document.getElementById('custom-fleet-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  }

  // Export to global scope
  global.SkyBoltFleet = {
    init: initFleetPortal,
    openReadinessModal,
    openHubModal,
    submitHubAssignment,
    openTransferModal,
    submitTransfer,
    quickStatus,
    completeMaintenanceModal,
    submitCompleteMaintenance,
    openInspectionModal,
    submitInspection,
    closeCustomModal
  };

  document.addEventListener('DOMContentLoaded', initFleetPortal);
})(typeof window !== 'undefined' ? window : globalThis);
