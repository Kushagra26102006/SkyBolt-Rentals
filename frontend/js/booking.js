/* ==========================================================================
   SkyBolt Rentals - 5-Step Checkout Wizard & Dynamic Calculator Engine
   
   PRODUCTION WARNING:
   Client-side pricing is temporary and cannot be trusted for production.
   All pricing, discounts, taxes, and availability must be validated on the
   server in future phases (Phase 6, 7 & 8).
   ========================================================================== */

let isBookingConfirmedByBackend = false;
let activeAuthoritativeQuote = null;

const activeBookingVehicleRegistry = new Map();

function registerBookingVehicle(v) {
  if (!v) return;
  const actualId = String(v.id || v._id || v.vehicleCode || '');
  if (actualId) activeBookingVehicleRegistry.set(actualId, v);
  if (v._id) activeBookingVehicleRegistry.set(String(v._id), v);
  if (v.id) activeBookingVehicleRegistry.set(String(v.id), v);
  if (v.vehicleCode) activeBookingVehicleRegistry.set(String(v.vehicleCode).toLowerCase(), v);
}

// Seed with static catalog vehicles if available
if (typeof vehicles !== 'undefined' && Array.isArray(vehicles)) {
  vehicles.forEach(registerBookingVehicle);
}

document.addEventListener('DOMContentLoaded', () => {
  initBookingWizard();
});

async function initBookingWizard() {
  const urlParams = new URLSearchParams(window.location.search);
  let vehicleIdParam = urlParams.get('id') || urlParams.get('vehicleId') || urlParams.get('v');

  if (!vehicleIdParam) {
    try {
      vehicleIdParam = sessionStorage.getItem('skybolt_selected_vehicle_id');
    } catch (e) {}
  }

  let selectedVehicle = null;
  if (vehicleIdParam) {
    const cleanId = String(vehicleIdParam).trim();

    // 1. Authoritative API lookup first (handles MongoDB ObjectIds and vehicleCodes)
    if (window.SkyBoltApi) {
      try {
        const res = await window.SkyBoltApi.get(`/vehicles/${encodeURIComponent(cleanId)}`);
        if (res && res.success && res.data && (res.data.vehicle || res.data.id || res.data._id)) {
          const vData = res.data.vehicle || res.data;
          const actualId = String(vData._id || vData.id || vData.vehicleCode || cleanId);
          selectedVehicle = {
            id: actualId,
            _id: vData._id || vData.id,
            vehicleCode: vData.vehicleCode || actualId,
            name: vData.name || `${vData.brand || ''} ${vData.model || ''}`.trim() || 'SkyBolt Vehicle',
            brand: vData.brand || '',
            model: vData.model || '',
            category: (vData.category || 'CAR').toLowerCase(),
            image: (vData.images && vData.images[0] && vData.images[0].url) || vData.image || 'assets/images/car-tour.webp',
            pricePerDay: vData.rental && vData.rental.baseRate !== undefined ? Number(vData.rental.baseRate) : (Number(vData.pricePerDay) || 500),
            fuel: (vData.specifications && vData.specifications.fuelType) || vData.fuel || 'Petrol',
            transmission: (vData.specifications && vData.specifications.transmission) || vData.transmission || 'Automatic',
            seats: (vData.specifications && vData.specifications.seats) || vData.seats || 2,
            location: (vData.location && (vData.location.name || vData.location.city)) || vData.location || 'Bangalore'
          };
          registerBookingVehicle(selectedVehicle);
        }
      } catch (err) {
        console.warn('[SkyBolt Booking] Backend lookup failed, checking local catalog:', err);
      }
    }

    if (!selectedVehicle) {
      if (activeBookingVehicleRegistry.has(cleanId)) {
        selectedVehicle = activeBookingVehicleRegistry.get(cleanId);
      } else if (activeBookingVehicleRegistry.has(cleanId.toLowerCase())) {
        selectedVehicle = activeBookingVehicleRegistry.get(cleanId.toLowerCase());
      } else if (typeof getVehicleById === 'function') {
        selectedVehicle = getVehicleById(cleanId);
      }
    }
  }

  if (!selectedVehicle) {
    selectedVehicle = (typeof vehicles !== 'undefined' && vehicles.length > 0) ? vehicles[0] : null;
  }

  if (selectedVehicle) {
    registerBookingVehicle(selectedVehicle);
  }

  initDateValidation();

  initVehicleSelection(selectedVehicle, (v) => {
    selectedVehicle = v;
    registerBookingVehicle(selectedVehicle);
    updateCalculationSummary(selectedVehicle);
  });

  autoFillCustomerDetails();
  initStepNavigation(() => selectedVehicle);
  initBookingConfirmation(selectedVehicle);

  // Initial Calculation
  if (selectedVehicle) {
    updateCalculationSummary(selectedVehicle);
  }
}

const BOOKING_HUBS_CONFIG = {
  bangalore: {
    name: 'Bangalore Tech Hub',
    query: 'Electronic City Phase 1 Hosur Road Bangalore',
    lat: 12.8452,
    lng: 77.6602,
    hours: 'Open 24/7 (365 Days)'
  },
  delhi: {
    name: 'Delhi Aerocity Hub',
    query: 'Asset 8 Hospitality District IGI Airport Delhi',
    lat: 28.5494,
    lng: 77.1215,
    hours: 'Open 24/7 (Terminal Handoff)'
  },
  ludhiana: {
    name: 'Ludhiana Central Hub',
    query: 'Industrial Focal Point Phase 5 Ludhiana',
    lat: 30.901,
    lng: 75.8573,
    hours: '07:00 AM – 11:00 PM Daily'
  },
  'new york': {
    name: 'New York Central Depot',
    query: '520 West 43rd Street New York NY',
    lat: 40.7605,
    lng: -73.9965,
    hours: 'Open 24/7 (Manhattan Downtown)'
  }
};

function updateBookingHubMapPreview(hubVal) {
  if (!hubVal) return;
  const key = String(hubVal).trim().toLowerCase();
  const hub = BOOKING_HUBS_CONFIG[key] || BOOKING_HUBS_CONFIG['bangalore'];
  if (!hub) return;

  const titleEl = document.getElementById('booking-hub-map-title');
  const dirEl = document.getElementById('booking-hub-map-directions');
  const iframeEl = document.getElementById('booking-hub-map-iframe');
  const hoursEl = document.getElementById('booking-hub-map-hours');

  if (titleEl) titleEl.textContent = hub.name;
  if (hoursEl) hoursEl.textContent = hub.hours;
  if (dirEl) dirEl.href = `https://www.google.com/maps/dir/?api=1&destination=${hub.lat},${hub.lng}`;
  if (iframeEl) {
    const nextSrc = `https://maps.google.com/maps?q=${encodeURIComponent(hub.query)}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
    if (iframeEl.getAttribute('src') !== nextSrc) {
      iframeEl.setAttribute('src', nextSrc);
    }
  }
}

/**
 * Initialize dynamic date constraints: min pickup = today, min return = pickup
 */
function initDateValidation() {
  const pickupInput = document.getElementById('step2-pickup-date');
  const returnInput = document.getElementById('step2-return-date');
  const locationSelect = document.getElementById('step2-location');
  if (!pickupInput || !returnInput) return;

  const urlParams = new URLSearchParams(window.location.search);
  const urlPickup = urlParams.get('pickup') || urlParams.get('pickupDate');
  const urlReturn = urlParams.get('return') || urlParams.get('returnDate');
  const urlLocation = urlParams.get('location');

  if (urlLocation && locationSelect) {
    const matchingOption = Array.from(locationSelect.options).find(opt => opt.value.toLowerCase() === urlLocation.toLowerCase());
    if (matchingOption) locationSelect.value = matchingOption.value;
  }

  if (locationSelect) {
    updateBookingHubMapPreview(locationSelect.value);
    locationSelect.addEventListener('change', () => {
      updateBookingHubMapPreview(locationSelect.value);
      const select = document.getElementById('step1-vehicle-select');
      const curVehicle = select ? getVehicleById(select.value) : vehicles[0];
      if (curVehicle) updateCalculationSummary(curVehicle);
    });
  }

  const todayStr = getTodayDateString();
  pickupInput.min = todayStr;

  if (urlPickup && urlPickup >= todayStr) {
    pickupInput.value = urlPickup;
  } else if (!pickupInput.value || pickupInput.value < todayStr) {
    pickupInput.value = todayStr;
  }

  const minReturnStr = getNextDateString(pickupInput.value, 1);
  returnInput.min = minReturnStr;

  if (urlReturn && urlReturn > pickupInput.value) {
    returnInput.value = urlReturn;
  } else if (!returnInput.value || returnInput.value <= pickupInput.value) {
    returnInput.value = getNextDateString(pickupInput.value, 3);
  }

  let isStep2Available = true;
  let step2Debounce = null;

  function checkStep2Availability() {
    const badge = document.getElementById('step2-availability-badge');
    const select = document.getElementById('step1-vehicle-select');
    const curVehicle = select ? (typeof getVehicleById === 'function' ? getVehicleById(select.value) : null) : null;
    const vehicleId = curVehicle ? (curVehicle.id || curVehicle._id || curVehicle.vehicleCode) : '1';

    if (!badge) {
      const panel2 = document.querySelector('.wizard-panel[data-panel="2"]');
      if (panel2) {
        const badgeDiv = document.createElement('div');
        badgeDiv.id = 'step2-availability-badge';
        badgeDiv.style.margin = '16px 0';
        const buttonRow = panel2.querySelector('.btn-next-step')?.parentElement;
        if (buttonRow) {
          panel2.insertBefore(badgeDiv, buttonRow);
        }
      }
    }

    const badgeEl = document.getElementById('step2-availability-badge');
    if (badgeEl) {
      badgeEl.innerHTML = `<span style="font-size: 13px; color: var(--muted);"><i class="fa-solid fa-spinner fa-spin"></i> Checking live fleet availability...</span>`;
    }

    clearTimeout(step2Debounce);
    step2Debounce = setTimeout(async () => {
      const toUtc = window.toRentalUtcTimestamp || ((v) => `${v}T10:00:00.000Z`);
      const pIso = toUtc(pickupInput.value);
      const rIso = toUtc(returnInput.value);
      if (!pIso || !rIso) return;

      const pDate = new Date(pIso);
      const rDate = new Date(rIso);

      if (pDate >= rDate) {
        if (badgeEl) badgeEl.innerHTML = '';
        return;
      }

      if (window.SkyBoltApi) {
        try {
          const endpoint = `/vehicles/${encodeURIComponent(vehicleId)}/availability?pickupAt=${encodeURIComponent(pIso)}&returnAt=${encodeURIComponent(rIso)}`;
          const res = await window.SkyBoltApi.get(endpoint);
          if (res.success && res.data) {
            if (res.data.available) {
              isStep2Available = true;
              if (badgeEl) {
                badgeEl.innerHTML = `
                  <div style="padding: 10px 14px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); color: #059669; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-circle-check"></i> Vehicle Available for Selected Rental Period
                  </div>
                `;
              }
            } else {
              isStep2Available = false;
              if (badgeEl) {
                badgeEl.innerHTML = `
                  <div style="padding: 10px 14px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #dc2626; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-circle-xmark"></i> Unavailable — Vehicle is already booked for these dates
                  </div>
                `;
              }
            }
            return;
          }
        } catch (err) {
          console.warn('[SkyBolt Booking] Availability check error:', err);
        }
      }

      isStep2Available = true;
      if (badgeEl) badgeEl.innerHTML = '';
    }, 350);
  }

  // Expose check to window for step validation
  window.__isStep2Available = () => isStep2Available;
  window.__checkStep2Availability = checkStep2Availability;

  pickupInput.addEventListener('change', () => {
    if (pickupInput.value < todayStr) {
      if (typeof showToast === 'function') {
        showToast('Pickup date cannot be in the past. Reset to today.', 'warning');
      }
      pickupInput.value = todayStr;
    }
    const nextDay = getNextDateString(pickupInput.value, 1);
    returnInput.min = nextDay;

    if (returnInput.value <= pickupInput.value) {
      returnInput.value = getNextDateString(pickupInput.value, 3);
    }
    const select = document.getElementById('step1-vehicle-select');
    const curVehicle = select ? getVehicleById(select.value) : vehicles[0];
    if (curVehicle) updateCalculationSummary(curVehicle);
    checkStep2Availability();
  });

  returnInput.addEventListener('change', () => {
    if (returnInput.value <= pickupInput.value) {
      if (typeof showToast === 'function') {
        showToast('Return date must be after pickup date.', 'warning');
      }
      returnInput.value = getNextDateString(pickupInput.value, 1);
    }
    const select = document.getElementById('step1-vehicle-select');
    const curVehicle = select ? getVehicleById(select.value) : vehicles[0];
    if (curVehicle) updateCalculationSummary(curVehicle);
    checkStep2Availability();
  });

  checkStep2Availability();
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextDateString(baseDateStr, daysToAdd = 1) {
  const date = new Date(baseDateStr + 'T00:00:00');
  date.setDate(date.getDate() + daysToAdd);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initVehicleSelection(initialVehicle, onVehicleChange) {
  const select = document.getElementById('step1-vehicle-select');
  if (!select) return;

  if (initialVehicle) {
    registerBookingVehicle(initialVehicle);
  }

  // Combine static vehicles with dynamically requested vehicle
  let optionList = (typeof vehicles !== 'undefined' && Array.isArray(vehicles)) ? [...vehicles] : [];
  if (initialVehicle) {
    const curCode = (initialVehicle.vehicleCode || '').toLowerCase();
    const curId = String(initialVehicle.id || initialVehicle._id || '');
    const alreadyExists = optionList.some(v => 
      (v.vehicleCode && v.vehicleCode.toLowerCase() === curCode) ||
      String(v.id) === curId ||
      String(v._id) === curId
    );
    if (!alreadyExists) {
      optionList.unshift(initialVehicle);
    }
  }

  const currentCode = initialVehicle ? (initialVehicle.vehicleCode || '').toLowerCase() : '';
  const currentId = initialVehicle ? String(initialVehicle.id || initialVehicle._id || '') : '';
  const currentName = initialVehicle ? String(initialVehicle.name || '').toLowerCase() : '';

  select.innerHTML = optionList.map(v => {
    const isSelected = initialVehicle && (
      (v.vehicleCode && v.vehicleCode.toLowerCase() === currentCode) ||
      String(v.id) === currentId ||
      String(v._id) === currentId ||
      (v.name && v.name.toLowerCase() === currentName)
    );
    const val = v.vehicleCode || v.id || v._id;
    return `
      <option value="${val}" ${isSelected ? 'selected' : ''}>
        ${v.name} - ₹${v.pricePerDay}/day (${v.location || 'Bangalore'})
      </option>
    `;
  }).join('');

  if (initialVehicle) {
    updatePreviewCard(initialVehicle);
  }

  select.addEventListener('change', (e) => {
    const val = e.target.value;
    const v = activeBookingVehicleRegistry.get(val) || 
              activeBookingVehicleRegistry.get(val.toLowerCase()) || 
              (typeof getVehicleById === 'function' ? getVehicleById(val) : null);
    if (v) {
      registerBookingVehicle(v);
      try {
        sessionStorage.setItem('skybolt_selected_vehicle_id', v.vehicleCode || v.id || v._id);
      } catch (err) {}
      updatePreviewCard(v);
      onVehicleChange(v);
    }
  });
}

function updatePreviewCard(vehicle) {
  if (!vehicle) return;
  const img = document.getElementById('step1-preview-img');
  const title = document.getElementById('step1-preview-title');
  const specs = document.getElementById('step1-preview-specs');
  const price = document.getElementById('step1-preview-price');

  if (img) {
    img.src = vehicle.image;
    img.alt = vehicle.name;
    img.onerror = () => { img.src = 'assets/images/car-tour.webp'; };
  }
  if (title) title.textContent = vehicle.name;
  if (specs) specs.textContent = `${vehicle.fuel} • ${vehicle.transmission} • ${vehicle.location}`;
  if (price) price.textContent = `₹${vehicle.pricePerDay} / day`;
}

function autoFillCustomerDetails() {
  const activeUser = getActiveUserSession();
  if (!activeUser) return;

  const nameInput = document.getElementById('step3-name');
  const emailInput = document.getElementById('step3-email');
  const phoneInput = document.getElementById('step3-phone');
  const licenseInput = document.getElementById('step3-license');

  if (nameInput && activeUser.name) nameInput.value = activeUser.name;
  if (emailInput && activeUser.email) emailInput.value = activeUser.email;
  if (phoneInput && (activeUser.phone || activeUser.phoneNumber)) phoneInput.value = activeUser.phone || activeUser.phoneNumber;
  if (licenseInput && (activeUser.license || activeUser.licenseNumber)) licenseInput.value = activeUser.license || activeUser.licenseNumber;
}

function getActiveUserSession() {
  const cached = sessionStorage.getItem('skybolt_user_profile');
  if (cached) {
    try {
      const u = JSON.parse(cached);
      if (u) return u;
    } catch (e) {}
  }
  if (typeof safeStorageGet === 'function') {
    return safeStorageGet('skybolt_user', null);
  }
  try {
    const data = localStorage.getItem('skybolt_user');
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

function updateCalculationSummary(vehicle) {
  if (!vehicle) return { days: 1, rate: 0, subtotal: 0, tax: 0, deposit: 0, total: 0 };
  const pickupInput = document.getElementById('step2-pickup-date');
  const returnInput = document.getElementById('step2-return-date');
  const locationSelect = document.getElementById('step2-location');
  const nameInput = document.getElementById('step3-name');

  if (!pickupInput || !returnInput) return { days: 1, rate: vehicle.pricePerDay, subtotal: vehicle.pricePerDay, tax: 0, deposit: 1000, total: vehicle.pricePerDay + 1000 };

  const pickupDate = new Date(pickupInput.value + 'T00:00:00');
  const returnDate = new Date(returnInput.value + 'T00:00:00');

  let diffTime = returnDate - pickupDate;
  let days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (isNaN(days) || days < 1) days = 1;

  const rate = vehicle.pricePerDay || 0;
  const subtotal = days * rate;
  const tax = Math.round(subtotal * 0.18);
  const deposit = 1000;
  const total = subtotal + tax + deposit;

  // Step 4 Review Update
  const revVehicle = document.getElementById('review-vehicle-name');
  const revLocation = document.getElementById('review-location');
  const revCustomer = document.getElementById('review-customer-name');
  const revDates = document.getElementById('review-dates-range');

  if (revVehicle) revVehicle.textContent = vehicle.name;
  if (revLocation) revLocation.innerHTML = `<i class="fa-solid fa-location-dot text-primary"></i> ${locationSelect ? locationSelect.value : vehicle.location}`;
  if (revCustomer) revCustomer.textContent = nameInput && nameInput.value ? nameInput.value : 'Customer';
  if (revDates) revDates.textContent = `${pickupInput.value} to ${returnInput.value}`;

  const elDays = document.getElementById('review-days');
  const elRate = document.getElementById('review-rate');
  const elSubtotal = document.getElementById('review-subtotal');
  const elTax = document.getElementById('review-tax');
  const elDeposit = document.getElementById('review-deposit');
  const elTotal = document.getElementById('review-total');

  if (elDays) elDays.textContent = `${days} Day${days > 1 ? 's' : ''}`;
  if (elRate) elRate.textContent = `₹${rate}`;
  if (elSubtotal) elSubtotal.textContent = `₹${subtotal}`;
  if (elTax) elTax.textContent = `₹${tax}`;
  if (elDeposit) elDeposit.textContent = `₹${deposit}`;
  if (elTotal) elTotal.textContent = `₹${total}`;

  // Fetch live authoritative quote from backend
  if (window.SkyBoltApi && pickupDate < returnDate) {
    const toUtc = window.toRentalUtcTimestamp || ((v) => `${v}T10:00:00.000Z`);
    const pIso = toUtc(pickupInput.value);
    const rIso = toUtc(returnInput.value);
    const vehicleId = vehicle._id || vehicle.id || vehicle.vehicleCode || '1';

    window.SkyBoltApi.post('/pricing/quote', {
      vehicleId: String(vehicleId),
      pickupAt: pIso,
      returnAt: rIso
    }).then(res => {
      if (res && res.success && res.data) {
        activeAuthoritativeQuote = res.data;
        const q = res.data;
        if (elDays) elDays.textContent = `${q.duration.value} Day${q.duration.value > 1 ? 's' : ''}`;
        if (elRate) elRate.textContent = `₹${q.baseRate}`;
        if (elSubtotal) elSubtotal.textContent = `₹${q.subtotal}`;
        if (elTax) elTax.textContent = `₹${q.taxAmount}`;
        if (elDeposit) elDeposit.textContent = `₹${q.feeAmount}`;
        if (elTotal) elTotal.textContent = `₹${q.total}`;
        const confirmBtn = document.getElementById('btn-confirm-booking');
        if (confirmBtn) {
          confirmBtn.innerHTML = `<i class="fa-solid fa-lock"></i>&nbsp; Pay ₹${q.total.toLocaleString('en-IN')} with Razorpay`;
        }
      }
    }).catch(err => {
      console.warn('[SkyBolt Booking] Live quote fetch warning:', err);
    });
  }

  return { days, rate, subtotal, tax, deposit, total };
}

function initStepNavigation(getSelectedVehicle) {
  const nextBtns = document.querySelectorAll('.btn-next-step');
  const prevBtns = document.querySelectorAll('.btn-prev-step');

  nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const nextStep = parseInt(btn.getAttribute('data-next'), 10);
      
      // Step 2 Validation before Step 3 Customer Details
      if (nextStep === 3) {
        const pickupInput = document.getElementById('step2-pickup-date');
        const returnInput = document.getElementById('step2-return-date');
        const todayStr = getTodayDateString();

        if (!pickupInput || !pickupInput.value || !returnInput || !returnInput.value) {
          if (typeof showToast === 'function') showToast('Please select valid pickup and return dates.', 'error');
          return;
        }

        if (pickupInput.value < todayStr) {
          if (typeof showToast === 'function') showToast('Pickup date cannot be in the past.', 'error');
          return;
        }

        if (returnInput.value <= pickupInput.value) {
          if (typeof showToast === 'function') showToast('Return date must be after the pickup date.', 'error');
          return;
        }

        if (typeof window.__isStep2Available === 'function' && !window.__isStep2Available()) {
          if (typeof showToast === 'function') {
            showToast('Vehicle is currently unavailable for these dates. Please select other dates.', 'error');
          }
          return;
        }
      }

      // Step 3 Validation before Step 4 Review
      if (nextStep === 4) {
        const nameInput = document.getElementById('step3-name');
        const emailInput = document.getElementById('step3-email');
        const phoneInput = document.getElementById('step3-phone');
        const licenseInput = document.getElementById('step3-license');

        const name = nameInput ? nameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const phone = phoneInput ? phoneInput.value.trim() : '';
        const license = licenseInput ? licenseInput.value.trim() : '';

        if (!name || !email || !phone || !license) {
          if (typeof showToast === 'function') showToast('Please fill in all customer details including driving license.', 'error');
          return;
        }

        if (typeof getSelectedVehicle === 'function') {
          updateCalculationSummary(getSelectedVehicle());
        }
      }

      goToStep(nextStep);
    });
  });

  prevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const prevStep = parseInt(btn.getAttribute('data-prev'), 10);
      goToStep(prevStep);
    });
  });
}

function goToStep(stepNumber) {
  // Security guard: Prevent reaching confirmation step 5 unless verified by backend
  if (stepNumber === 5 && !isBookingConfirmedByBackend) {
    console.warn('[SkyBolt Security] Confirmation step 5 cannot be accessed without definitive backend confirmation.');
    return;
  }

  // Update panels
  document.querySelectorAll('.wizard-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const targetPanel = document.querySelector(`.wizard-panel[data-panel="${stepNumber}"]`);
  if (targetPanel) targetPanel.classList.add('active');

  // Update progress indicator
  document.querySelectorAll('.wizard-step').forEach(step => {
    const sNum = parseInt(step.getAttribute('data-step'), 10);
    step.classList.remove('active', 'completed');
    if (sNum === stepNumber) {
      step.classList.add('active');
    } else if (sNum < stepNumber) {
      step.classList.add('completed');
    }
  });

  if (typeof window.updateProgressBar === 'function') {
    window.updateProgressBar(stepNumber);
  }

  window.scrollTo({ top: 150, behavior: 'smooth' });
}
window.goToStep = goToStep;

function renderStep5Summary(booking, paymentRef, isPaid = true) {
  const elConfirmId = document.getElementById('confirm-booking-id');
  const elConfirmVehicle = document.getElementById('confirm-vehicle');
  const elConfirmLocation = document.getElementById('confirm-location');
  const elConfirmPickup = document.getElementById('confirm-pickup');
  const elConfirmReturn = document.getElementById('confirm-return');
  const elConfirmTotal = document.getElementById('confirm-total');
  const elStatus = document.getElementById('confirm-payment-status');
  const elPaymentRef = document.getElementById('confirm-payment-ref');
  const elPaymentRefRow = document.getElementById('confirm-payment-ref-row');

  const ref = booking.bookingReference || booking.id || 'N/A';
  const vName = booking.vehicleSnapshot?.name || booking.vehicle?.name || 'Selected Vehicle';
  const loc = (typeof booking.pickupLocation === 'string' ? booking.pickupLocation : (booking.pickupLocation?.name || 'Main Hub'));
  const pDate = (booking.pickupAt || '').split('T')[0];
  const rDate = (booking.returnAt || '').split('T')[0];
  const totalVal = booking.pricingSnapshot?.total || booking.pricing?.total || 0;

  if (elConfirmId) elConfirmId.textContent = ref;
  if (elConfirmVehicle) elConfirmVehicle.textContent = vName;
  if (elConfirmLocation) elConfirmLocation.textContent = loc;
  if (elConfirmPickup) elConfirmPickup.textContent = pDate;
  if (elConfirmReturn) elConfirmReturn.textContent = rDate;
  if (elConfirmTotal) elConfirmTotal.textContent = `₹${totalVal.toLocaleString('en-IN')}`;

  if (elStatus) {
    if (isPaid) {
      elStatus.innerHTML = `<span style="color: #059669; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Paid &amp; Confirmed via Razorpay</span>`;
    } else {
      elStatus.innerHTML = `<span style="color: #d97706; font-weight: 700;"><i class="fa-solid fa-clock"></i> Payment Pending</span>`;
    }
  }

  if (paymentRef && elPaymentRef) {
    elPaymentRef.textContent = paymentRef;
    if (elPaymentRefRow) elPaymentRefRow.style.display = 'block';
  } else if (elPaymentRefRow && !isPaid) {
    elPaymentRefRow.style.display = 'none';
  }
}

function promptInlineLogin(emailVal) {
  return new Promise((resolve) => {
    const existing = document.getElementById('skybolt-inline-login-modal');
    if (existing) existing.remove();

    const modalHtml = `
      <div id="skybolt-inline-login-modal" class="sim-payment-overlay">
        <div class="sim-payment-card" style="max-width: 420px;" role="dialog" aria-modal="true">
          <div class="sim-payment-header">
            <div class="sim-payment-brand">
              <div class="sim-brand-logo"><i class="fa-solid fa-user-check"></i></div>
              <div>
                <div class="sim-brand-title">Sign In to Continue</div>
                <div class="sim-brand-sub">${emailVal}</div>
              </div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" id="inline-login-close" style="padding: 4px 8px;"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="sim-payment-body">
            <p style="font-size: var(--fs-xs); color: var(--text-secondary); margin-bottom: 1rem;">
              An existing account was found for <strong>${emailVal}</strong>. Enter your password to sign in and proceed directly to Razorpay payment.
            </p>
            <form id="inline-login-form">
              <div class="form-group" style="margin-bottom: 1rem;">
                <label for="inline-login-pass" style="font-size: var(--fs-xs); font-weight: 600;">Account Password</label>
                <input type="password" id="inline-login-pass" class="form-control" placeholder="••••••••" required autocomplete="current-password">
                <div id="inline-login-err-msg" style="color: #ef4444; font-size: 11px; margin-top: 6px; display: none;"></div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <button type="button" class="btn btn-outline" id="inline-login-cancel">Cancel</button>
                <button type="submit" class="btn btn-primary" id="inline-login-submit-btn"><i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In &amp; Pay</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('skybolt-inline-login-modal');
    const form = document.getElementById('inline-login-form');
    const passInput = document.getElementById('inline-login-pass');
    const errDiv = document.getElementById('inline-login-err-msg');
    const submitBtn = document.getElementById('inline-login-submit-btn');
    const cancelBtn = document.getElementById('inline-login-cancel');
    const closeBtn = document.getElementById('inline-login-close');

    if (passInput) passInput.focus();

    function cleanup() {
      if (modal) modal.remove();
    }

    cancelBtn?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    closeBtn?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errDiv) errDiv.style.display = 'none';
      const password = passInput?.value || '';
      if (!password) return;

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

      try {
        const loginRes = await window.SkyBoltApi.post('/auth/login', {
          email: emailVal,
          password
        });

        if (loginRes && loginRes.success && loginRes.data?.user) {
          const u = loginRes.data.user;
          sessionStorage.setItem('skybolt_user_profile', JSON.stringify(u));
          cleanup();
          if (typeof showToast === 'function') {
            showToast(`Signed in as ${u.name}. Resuming payment...`, 'success');
          }
          resolve(u);
        } else {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In &amp; Pay';
          if (errDiv) {
            errDiv.textContent = loginRes?.error?.message || 'Invalid password. Please try again.';
            errDiv.style.display = 'block';
          }
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In &amp; Pay';
        if (errDiv) {
          errDiv.textContent = 'Connection error. Please try again.';
          errDiv.style.display = 'block';
        }
      }
    });
  });
}

function initBookingConfirmation(vehicle) {
  const confirmBtn = document.getElementById('btn-confirm-booking');
  if (!confirmBtn) return;

  confirmBtn.addEventListener('click', async () => {
    const select = document.getElementById('step1-vehicle-select');
    const selVal = select ? select.value : null;
    const selectedV = (selVal ? (activeBookingVehicleRegistry.get(selVal) || activeBookingVehicleRegistry.get(selVal.toLowerCase()) || (typeof getVehicleById === 'function' ? getVehicleById(selVal) : null)) : null) || vehicle || (typeof vehicles !== 'undefined' ? vehicles[0] : null);

    if (!selectedV) {
      if (typeof showToast === 'function') showToast('Please select a valid vehicle to proceed.', 'error');
      return;
    }

    const locationSelect = document.getElementById('step2-location');
    const pickupInput = document.getElementById('step2-pickup-date');
    const returnInput = document.getElementById('step2-return-date');

    const locationVal = locationSelect ? locationSelect.value : (selectedV.location || 'Bangalore');
    const pickupVal = pickupInput ? pickupInput.value : getTodayDateString();
    const returnVal = returnInput ? returnInput.value : getNextDateString(pickupVal, 3);

    // Prepare ISO timestamps for authoritative backend interval validation
    const toUtc = window.toRentalUtcTimestamp || ((v) => `${v}T10:00:00.000Z`);
    let pIso = toUtc(pickupVal);
    let rIso = toUtc(returnVal, '18:00:00');
    let pDate = new Date(pIso);
    let rDate = new Date(rIso);

    // Safeguard against past timestamps and ensure return is strictly after pickup
    const nowMs = Date.now();
    if (isNaN(pDate.getTime()) || pDate.getTime() <= nowMs + 15 * 60 * 1000) {
      pDate = new Date(nowMs + 30 * 60 * 1000);
      pIso = pDate.toISOString();
    }
    if (isNaN(rDate.getTime()) || rDate.getTime() <= pDate.getTime()) {
      rDate = new Date(pDate.getTime() + 24 * 60 * 60 * 1000);
      rIso = rDate.toISOString();
    }

    const vehicleIdentifier = selectedV._id || selectedV.id || selectedV.vehicleCode;

    confirmBtn.disabled = true;
    const originalText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Initializing Reservation...`;

    const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    const idempotencyKey = `idemp_${Date.now()}_${randomSuffix}`;

    const nameVal = document.getElementById('step3-name')?.value.trim() || 'Valued Customer';
    const emailVal = document.getElementById('step3-email')?.value.trim() || 'customer@skybolt.com';
    const phoneVal = document.getElementById('step3-phone')?.value.trim() || '+919876543210';
    const licenseVal = document.getElementById('step3-license')?.value.trim() || 'DL-2026-001';

    // 1. Session check & seamless guest auto-registration if needed
    let activeUser = null;
    if (window.SkyBoltApi) {
      try {
        const meRes = await window.SkyBoltApi.get('/auth/me');
        if (meRes && meRes.success && meRes.data?.user) {
          activeUser = meRes.data.user;
        }
      } catch (e) {}

      if (!activeUser && emailVal && emailVal.includes('@')) {
        try {
          const regRes = await window.SkyBoltApi.post('/auth/register', {
            name: nameVal,
            email: emailVal,
            phone: phoneVal,
            licenseNumber: licenseVal,
            password: 'SkyBoltUser@' + Math.floor(100000 + Math.random() * 900000)
          });
          if (regRes && regRes.success && regRes.data?.user) {
            activeUser = regRes.data.user;
            sessionStorage.setItem('skybolt_user_profile', JSON.stringify(activeUser));
          } else if (regRes && !regRes.success) {
            const isExisting = regRes.error?.code === 'USER_ALREADY_EXISTS';
            if (isExisting) {
              const signedInUser = await promptInlineLogin(emailVal);
              if (signedInUser) {
                activeUser = signedInUser;
              } else {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = originalText;
                return;
              }
            } else {
              confirmBtn.disabled = false;
              confirmBtn.innerHTML = originalText;
              const msg = regRes.error?.message || 'Guest account registration failed. Please sign in or try again.';
              if (typeof showToast === 'function') {
                showToast(msg, 'warning');
              }
              return;
            }
          }
        } catch (regErr) {
          console.warn('[SkyBolt Booking] Guest registration error:', regErr);
        }
      }
    }

    // 2. Authoritative backend booking creation (strictly required)
    let booking = null;
    const requestedPickupStr = pDate.toISOString();
    const requestedReturnStr = rDate.toISOString();
    const isSameHold = window._currentHeldBooking &&
      window._currentHeldVehicleId === String(vehicleIdentifier) &&
      window._currentHeldPickup === requestedPickupStr &&
      window._currentHeldReturn === requestedReturnStr;

    if (isSameHold) {
      booking = window._currentHeldBooking;
    } else {
      confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Reserving Vehicle...`;
      let bookingRes = null;
      try {
        bookingRes = await window.SkyBoltApi.post(
          '/bookings',
          {
            vehicleId: String(vehicleIdentifier),
            pickupAt: requestedPickupStr,
            returnAt: requestedReturnStr,
            pickupLocation: locationVal,
            returnLocation: locationVal,
            notes: 'Customer web reservation'
          },
          {
            headers: {
              'Idempotency-Key': idempotencyKey
            }
          }
        );
      } catch (apiErr) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalText;
        if (typeof showToast === 'function') {
          showToast('Network error while creating booking reservation.', 'error');
        }
        return;
      }

      if (!bookingRes || !bookingRes.success || !bookingRes.data || !bookingRes.data.bookingReference) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalText;
        const errorMsg = bookingRes?.error?.message || 'Failed to create booking reservation. Please check dates or login.';
        if (typeof showToast === 'function') {
          showToast(errorMsg, 'error');
        }
        return;
      }

      booking = bookingRes.data;
      window._currentHeldBooking = booking;
      window._currentHeldVehicleId = String(vehicleIdentifier);
      window._currentHeldPickup = requestedPickupStr;
      window._currentHeldReturn = requestedReturnStr;
    }

    // 3. Authoritative backend payment order creation (strictly required)
    confirmBtn.innerHTML = `<i class="fa-solid fa-credit-card fa-spin"></i> Initializing Payment Gateway...`;
    let orderRes = null;
    try {
      orderRes = await window.SkyBoltApi.post('/payments/orders', {
        bookingId: booking.id || booking._id || booking.bookingReference
      });
    } catch (orderErr) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalText;
      if (typeof showToast === 'function') {
        showToast('Network error while initializing payment order.', 'error');
      }
      return;
    }

    if (!orderRes || !orderRes.success || !orderRes.data || !orderRes.data.orderId || typeof orderRes.data.amount !== 'number') {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalText;
      const errorMsg = orderRes?.error?.message || 'Failed to initialize payment gateway order with server.';
      if (typeof showToast === 'function') {
        showToast(errorMsg, 'error');
      }
      return;
    }

    const orderData = orderRes.data;
    const cleanPhone = (phoneVal || '').replace(/\D/g, '').slice(-10) || '9876543210';

    // 4. Launch Payment Gateway (Live Razorpay or Sandbox Simulation)
    if (window.SkyBoltPayment && typeof window.SkyBoltPayment.launchPayment === 'function') {
      window.SkyBoltPayment.launchPayment({
        orderData,
        booking,
        vehicleName: selectedV.name,
        prefill: {
          name: orderData.customerName || nameVal,
          email: orderData.customerEmail || emailVal,
          contact: cleanPhone
        },
        onSuccess: async function (paymentResponse) {
          if (!paymentResponse || !paymentResponse.razorpay_order_id || !paymentResponse.razorpay_payment_id || !paymentResponse.razorpay_signature) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalText;
            if (typeof showToast === 'function') {
              showToast('Malformed payment response received.', 'error');
            }
            return;
          }

          confirmBtn.innerHTML = `<i class="fa-solid fa-shield-halved fa-spin"></i> Verifying Cryptographic Signature...`;

          let verifyRes = null;
          try {
            verifyRes = await window.SkyBoltApi.post('/payments/verify', {
              bookingId: booking.id || booking._id || booking.bookingReference,
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature
            });
          } catch (verifyErr) {
            console.error('[SkyBolt Payment] Verification network error:', verifyErr);
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalText;
            if (typeof showToast === 'function') {
              showToast('Network error while verifying payment. Please check Dashboard or contact support.', 'error');
            }
            return;
          }

          if (!verifyRes || !verifyRes.success || !verifyRes.data || !verifyRes.data.booking || !verifyRes.data.payment) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalText;
            const errMsg = verifyRes?.error?.message || 'Payment verification failed on server. If money was debited, contact support with Order ID: ' + paymentResponse.razorpay_order_id;
            if (typeof showToast === 'function') {
              showToast(`Verification Failed: ${errMsg}`, 'error');
            }
            return;
          }

          const verifiedBooking = verifyRes.data.booking;
          const verifiedPayment = verifyRes.data.payment;

          if (verifiedBooking.status !== 'CONFIRMED' || verifiedPayment.status !== 'CAPTURED') {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalText;
            if (typeof showToast === 'function') {
              showToast(`Booking status is ${verifiedBooking.status}. Confirmation pending.`, 'warning');
            }
            return;
          }

          // Authoritative confirmation from backend succeeded
          isBookingConfirmedByBackend = true;
          window._currentHeldBooking = null;
          renderStep5Summary(verifiedBooking, verifiedPayment.paymentReference, true);
          if (typeof showToast === 'function') {
            showToast(`Payment of ₹${verifiedPayment.amount} captured! Booking Confirmed.`, 'success');
          }
          goToStep(5);
        },
        onFailure: function (resp) {
          console.error('[SkyBolt Checkout Error]:', resp?.error);
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = originalText;
          const desc = resp?.error?.description || resp?.error?.reason || 'Transaction declined by bank or gateway.';
          if (typeof showToast === 'function') {
            showToast(`Payment failed: ${desc}`, 'error');
          }
        },
        onDismiss: function () {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = originalText;
          if (typeof showToast === 'function') {
            showToast('Payment window dismissed. Your booking hold is active. Click Confirm & Pay when ready.', 'warning');
          }
        }
      });
    } else {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalText;
      if (typeof showToast === 'function') {
        showToast('Payment module not initialized.', 'error');
      }
    }
  });
}
