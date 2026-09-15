/* ==========================================================================
   SkyBolt Rentals - Vehicle Details & Dynamic Calculation Engine
   Connected to Production Backend API (GET /api/v1/vehicles/:id)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const rawId = urlParams.get('id');
  const vehicleId = rawId ? decodeURIComponent(rawId).trim() : null;

  loadVehicleDetails(vehicleId);
});

/**
 * Render loading state while vehicle details are fetched
 */
function renderLoadingState() {
  const titleEl = document.getElementById('detail-title');
  const descEl = document.getElementById('detail-description');
  if (titleEl) titleEl.textContent = 'Loading vehicle details...';
  if (descEl) descEl.textContent = 'Fetching up-to-date fleet specifications from SkyBolt servers...';
}

/**
 * Render error state with retry button
 */
function renderErrorState(vehicleId, message) {
  const container = document.getElementById('details-container');
  if (container) {
    // Build the DOM safely to avoid XSS from API error messages / URL params
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: var(--space-16) var(--space-6); background-color: var(--white); border-radius: var(--radius-xl); border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
        <i class="fa-solid fa-triangle-exclamation text-primary" style="font-size: 3.5rem; margin-bottom: var(--space-4);"></i>
        <h2>Failed to Load Vehicle</h2>
        <p class="text-muted" id="error-state-msg" style="max-width: 480px; margin: 0 auto var(--space-6);"></p>
        <button id="btn-retry-details" class="btn btn-primary">
          <i class="fa-solid fa-rotate-right"></i> Retry
        </button>
      </div>
    `;
    // Set message via textContent — never via innerHTML — to prevent XSS
    const msgEl = document.getElementById('error-state-msg');
    if (msgEl) msgEl.textContent = message || 'We could not connect to the vehicle service. Please try again.';
    const retryBtn = document.getElementById('btn-retry-details');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        window.location.reload();
      });
    }
  }
}

/**
 * Normalize vehicle data item from API DTO or local fallback
 */
function normalizeVehicleDetails(v) {
  const isApi = v.rental && v.rental.baseRate !== undefined;
  const spec = v.specifications || {};
  return {
    id: v.id || v._id || v.vehicleCode,
    _id: v._id || v.id,
    vehicleCode: v.vehicleCode || (v.id && !isNaN(Number(v.id)) ? `SKY-VHC-${String(v.id).padStart(3, '0')}` : (v.vehicleCode || v.id)),
    name: v.name || `${v.brand || ''} ${v.model || ''}`.trim() || 'SkyBolt Vehicle',
    category: (v.category || 'CAR').toLowerCase(),
    image: (v.images && v.images[0] && v.images[0].url) || v.image || 'assets/images/car-tour.webp',
    pricePerDay: isApi ? Number(v.rental.baseRate) : (Number(v.pricePerDay) || 500),
    currency: (v.rental && v.rental.currency) || 'INR',
    location: (v.location && (v.location.name || v.location.city)) || v.location || 'Fleet Hub',
    fuel: spec.fuelType || v.fuel || 'Petrol',
    transmission: spec.transmission || v.transmission || 'Automatic',
    seats: spec.seats || v.seats || (String(v.category).toUpperCase() === 'BIKE' || String(v.category).toUpperCase() === 'SCOOTER' ? 2 : 4),
    rating: (v.rating && v.rating.average) || v.rating || 4.8,
    reviews: (v.rating && v.rating.count) || v.reviews || 42,
    description: v.description || 'Experience the highest standard of freedom, comfort, and reliability with SkyBolt Rentals.'
  };
}

/**
 * Load vehicle details from Production API or fallback to data.js
 */
async function loadVehicleDetails(vehicleId) {
  if (!vehicleId || !vehicleId.trim()) {
    renderVehicleNotFound();
    return;
  }

  const cleanId = vehicleId.trim();
  renderLoadingState();

  // 1. Direct API lookup (handles MongoDB ObjectId, vehicleCode e.g. SKY-VHC-001, and numeric index)
  if (window.SkyBoltApi) {
    try {
      const res = await window.SkyBoltApi.get(`/vehicles/${encodeURIComponent(cleanId)}`);
      if (res && res.success && res.data && (res.data.vehicle || res.data.id)) {
        const vData = res.data.vehicle || res.data;
        const vehicle = normalizeVehicleDetails(vData);
        renderVehicleDetails(vehicle);
        initCalculatorEngine(vehicle);
        initFavoritesButton(vehicle.id);
        initVehicleReviewsEngine(vehicle.id);
        return;
      }
    } catch (err) {
      console.warn('[SkyBolt Details] Direct API lookup failed, trying local & catalog fallbacks:', err);
    }
  }

  // 2. Local data.js dataset lookup
  if (typeof getVehicleById === 'function') {
    const fallbackVehicle = getVehicleById(cleanId);
    if (fallbackVehicle) {
      const vehicle = normalizeVehicleDetails(fallbackVehicle);
      renderVehicleDetails(vehicle);
      initCalculatorEngine(vehicle);
      initFavoritesButton(vehicle.id);
      initVehicleReviewsEngine(vehicle.id);
      return;
    }
  }

  // 3. Live fleet catalog search for matching vehicle by code, ObjectId, name or model
  if (window.SkyBoltApi) {
    try {
      const catalogRes = await window.SkyBoltApi.get('/vehicles?limit=50');
      if (catalogRes && catalogRes.success && catalogRes.data && Array.isArray(catalogRes.data.items) && catalogRes.data.items.length > 0) {
        const items = catalogRes.data.items;
        const lowerSearch = cleanId.toLowerCase();

        const matched = items.find(i => 
          (i.vehicleCode && i.vehicleCode.toLowerCase() === lowerSearch) ||
          (i.id && i.id.toLowerCase() === lowerSearch) ||
          (i._id && String(i._id).toLowerCase() === lowerSearch) ||
          (i.name && i.name.toLowerCase() === lowerSearch) ||
          (i.name && i.name.toLowerCase().includes(lowerSearch)) ||
          (i.model && i.model.toLowerCase().includes(lowerSearch))
        );

        if (matched) {
          const vehicle = normalizeVehicleDetails(matched);
          try {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('id', vehicle.vehicleCode || vehicle.id);
            window.history.replaceState({}, '', newUrl);
          } catch (e) {}

          renderVehicleDetails(vehicle);
          initCalculatorEngine(vehicle);
          initFavoritesButton(vehicle.id);
          initVehicleReviewsEngine(vehicle.id);
          return;
        }
      }
    } catch (catErr) {
      console.warn('[SkyBolt Details] Catalog recovery query error:', catErr);
    }
  }

  // If vehicle was explicitly requested and not found anywhere, show clean "Vehicle Not Found"
  renderVehicleNotFound();
}

function renderVehicleNotFound() {
  document.title = 'Vehicle Not Found - SkyBolt Rentals';
  const container = document.getElementById('details-container');
  if (container) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: var(--space-16) var(--space-6); background-color: var(--white); border-radius: var(--radius-xl); border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
        <i class="fa-solid fa-triangle-exclamation text-primary" style="font-size: 3.5rem; margin-bottom: var(--space-4);"></i>
        <h2>Vehicle Not Found</h2>
        <p class="text-muted" style="max-width: 480px; margin: 0 auto var(--space-6);">
          The vehicle you requested does not exist or is currently unavailable in our active fleet inventory.
        </p>
        <div style="display: flex; gap: var(--space-3); justify-content: center; flex-wrap: wrap;">
          <a href='/bikes' class="btn btn-outline"><i class="fa-solid fa-motorcycle"></i> Browse Bikes</a>
          <a href='/cars' class="btn btn-outline"><i class="fa-solid fa-car"></i> Browse Cars</a>
          <a href='/scooters' class="btn btn-outline"><i class="fa-solid fa-bolt"></i> Browse E-Scooters</a>
          <a href='/vehicles' class="btn btn-primary"><i class="fa-solid fa-layer-group"></i> Full Fleet</a>
        </div>
      </div>
    `;
  }
}

function renderVehicleDetails(vehicle) {
  const escape = window.escapeHtml || ((s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

  document.title = `${vehicle.name} - SkyBolt Rentals`;

  const imgEl = document.getElementById('detail-img');
  const titleEl = document.getElementById('detail-title');
  const categoryBadge = document.getElementById('detail-category-badge');
  const ratingBadge = document.getElementById('detail-rating-badge');
  const locationEl = document.getElementById('detail-location');
  const reviewsEl = document.getElementById('detail-reviews');
  const priceDisplay = document.getElementById('detail-price-display');
  const descEl = document.getElementById('detail-description');

  const specFuel = document.getElementById('spec-fuel');
  const specTrans = document.getElementById('spec-trans');
  const specSeats = document.getElementById('spec-seats');

  if (imgEl) {
    imgEl.src = vehicle.image;
    imgEl.alt = vehicle.name;
    imgEl.onerror = () => { imgEl.src = 'assets/images/car-tour.webp'; };
  }
  if (titleEl) titleEl.textContent = vehicle.name;
  if (categoryBadge) categoryBadge.textContent = vehicle.category.toUpperCase();
  if (ratingBadge) ratingBadge.innerHTML = `<i class="fa-solid fa-star"></i> ${escape(vehicle.rating)}`;
  if (locationEl) locationEl.textContent = vehicle.location;
  if (reviewsEl) reviewsEl.textContent = `${escape(vehicle.reviews)} verified reviews`;
  if (priceDisplay) priceDisplay.innerHTML = `₹${escape(vehicle.pricePerDay)} <span style="font-size: var(--fs-xs); color: var(--muted); font-weight: 400;">/ day</span>`;
  if (descEl) descEl.textContent = vehicle.description;

  if (specFuel) {
    specFuel.textContent = String(vehicle.fuel || 'Petrol').toUpperCase();
    const fuelItem = specFuel.closest('.spec-item');
    if (fuelItem) {
      const fuelIcon = fuelItem.querySelector('i');
      if (fuelIcon) {
        const isElectric = String(vehicle.fuel || '').toLowerCase().includes('electric');
        fuelIcon.className = isElectric ? 'fa-solid fa-bolt' : 'fa-solid fa-gas-pump';
      }
    }
  }
  if (specTrans) {
    specTrans.textContent = String(vehicle.transmission || 'Automatic').toUpperCase();
  }
  if (specSeats) {
    specSeats.textContent = `${escape(vehicle.seats || 2)} Seats`;
  }

  // Preselect vehicle location in dropdown
  const calcLocSelect = document.getElementById('calc-location');
  if (calcLocSelect && vehicle.location) {
    const matchingOption = Array.from(calcLocSelect.options).find(opt => opt.value.toLowerCase() === vehicle.location.toLowerCase());
    if (matchingOption) {
      calcLocSelect.value = matchingOption.value;
    }
  }
}

function initCalculatorEngine(vehicle) {
  const pickupInput = document.getElementById('calc-pickup-date');
  const returnInput = document.getElementById('calc-return-date');
  const form = document.getElementById('booking-calc-form');

  if (!pickupInput || !returnInput) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  pickupInput.min = todayStr;

  // Initialize dates dynamically if empty or in the past
  if (!pickupInput.value || pickupInput.value < todayStr) {
    pickupInput.value = todayStr;
  }

  const [py, pm, pd] = pickupInput.value.split('-').map(Number);
  const nextDayUtc = new Date(Date.UTC(py, pm - 1, pd + 1));
  const minReturnStr = nextDayUtc.toISOString().split('T')[0];
  returnInput.min = minReturnStr;

  if (!returnInput.value || returnInput.value <= pickupInput.value) {
    const defaultReturnUtc = new Date(Date.UTC(py, pm - 1, pd + 3));
    returnInput.value = defaultReturnUtc.toISOString().split('T')[0];
  }

  let pricingDebounceTimer = null;

  function calculatePrice() {
    const toUtc = window.toRentalUtcTimestamp || ((v) => `${v}T10:00:00.000Z`);
    const pIso = toUtc(pickupInput.value);
    const rIso = toUtc(returnInput.value);
    if (!pIso || !rIso) return;

    const pickupDate = new Date(pIso);
    const returnDate = new Date(rIso);

    if (pickupDate >= returnDate) return;

    const elDays = document.getElementById('breakdown-days');
    const elRate = document.getElementById('breakdown-rate');
    const elSubtotal = document.getElementById('breakdown-subtotal');
    const elTax = document.getElementById('breakdown-tax');
    const elTotal = document.getElementById('breakdown-total');

    // Show quick optimistic calculation while live quote loads
    const diffTime = returnDate - pickupDate;
    let approxDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (isNaN(approxDays) || approxDays < 1) approxDays = 1;
    const approxRate = vehicle.pricePerDay || 0;
    const approxSubtotal = approxDays * approxRate;
    const approxTax = Math.round(approxSubtotal * 0.18);
    const approxTotal = approxSubtotal + approxTax;

    if (elDays) elDays.textContent = `${approxDays} Day${approxDays > 1 ? 's' : ''}`;
    if (elRate) elRate.textContent = `₹${approxRate}`;
    if (elSubtotal) elSubtotal.textContent = `₹${approxSubtotal}`;
    if (elTax) elTax.textContent = `₹${approxTax}`;
    if (elTotal) elTotal.textContent = `₹${approxTotal}`;

    // Authoritative backend pricing quote
    clearTimeout(pricingDebounceTimer);
    pricingDebounceTimer = setTimeout(async () => {
      if (window.SkyBoltApi) {
        try {
          const vehicleId = vehicle.id || vehicle._id || vehicle.vehicleCode;
          if (!vehicleId) return;
          const res = await window.SkyBoltApi.post('/pricing/quote', {
            vehicleId: String(vehicleId),
            pickupAt: pickupDate.toISOString(),
            returnAt: returnDate.toISOString()
          });

          if (res && res.success && res.data) {
            const quote = res.data;
            if (elDays) elDays.textContent = `${quote.duration.value} Day${quote.duration.value > 1 ? 's' : ''}`;
            if (elRate) elRate.textContent = `₹${quote.baseRate}`;
            if (elSubtotal) elSubtotal.textContent = `₹${quote.subtotal}`;
            if (elTax) elTax.textContent = `₹${quote.taxAmount}`;
            if (elTotal) elTotal.textContent = `₹${quote.total}`;
          }
        } catch (err) {
          console.warn('[SkyBolt Details] Pricing quote error:', err);
        }
      }
    }, 250);
  }

  let isVehicleAvailable = true;
  let availabilityDebounceTimer = null;

  function checkLiveAvailability() {
    try {
      const badge = document.getElementById('calc-availability-badge');
      if (badge) {
        badge.innerHTML = `<span style="font-size: 12px; color: var(--muted);"><i class="fa-solid fa-spinner fa-spin"></i> Checking live availability...</span>`;
      }

      clearTimeout(availabilityDebounceTimer);
      availabilityDebounceTimer = setTimeout(async () => {
        try {
          const toUtc = window.toRentalUtcTimestamp || ((v) => `${v}T10:00:00.000Z`);
          const pIso = toUtc(pickupInput.value);
          const rIso = toUtc(returnInput.value);
          if (!pIso || !rIso) return;

          const pDate = new Date(pIso);
          const rDate = new Date(rIso);

          if (pDate >= rDate) {
            if (badge) badge.innerHTML = '';
            return;
          }

          if (window.SkyBoltApi) {
            const endpoint = `/vehicles/${encodeURIComponent(vehicle.id)}/availability?pickupAt=${encodeURIComponent(pIso)}&returnAt=${encodeURIComponent(rIso)}`;
            const res = await window.SkyBoltApi.get(endpoint);
            if (res && res.success && res.data) {
              if (res.data.available) {
                isVehicleAvailable = true;
                if (badge) {
                  badge.innerHTML = `
                    <div style="padding: 6px 12px; border-radius: var(--radius-sm); background: var(--success-light); color: var(--success); font-size: var(--fs-xs); font-weight: 700; display: flex; align-items: center; gap: 6px;">
                      <i class="fa-solid fa-circle-check"></i> Available for Selected Dates
                    </div>
                  `;
                }
              } else {
                isVehicleAvailable = false;
                if (badge) {
                  badge.innerHTML = `
                    <div style="padding: 6px 12px; border-radius: var(--radius-sm); background: var(--danger-light); color: var(--danger); font-size: var(--fs-xs); font-weight: 700; display: flex; align-items: center; gap: 6px;">
                      <i class="fa-solid fa-circle-xmark"></i> Unavailable — Reserved for selected dates
                    </div>
                  `;
                }
              }
            }
          }
        } catch (err) {
          console.warn('[SkyBolt Details] Availability check failed:', err);
        }
      }, 350);
    } catch (err) {
      console.warn('[SkyBolt Details] checkLiveAvailability initialization error:', err);
    }
  }

  pickupInput.addEventListener('change', () => {
    if (pickupInput.value < todayStr) {
      if (typeof showToast === 'function') {
        showToast('Pickup date cannot be in the past.', 'warning');
      }
      pickupInput.value = todayStr;
    }
    const nextReturnMin = new Date(pickupInput.value + 'T00:00:00');
    nextReturnMin.setDate(nextReturnMin.getDate() + 1);
    returnInput.min = nextReturnMin.toISOString().split('T')[0];

    if (new Date(returnInput.value) <= new Date(pickupInput.value)) {
      const nextDay = new Date(pickupInput.value + 'T00:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      returnInput.value = nextDay.toISOString().split('T')[0];
    }
    calculatePrice();
    checkLiveAvailability();
  });

  returnInput.addEventListener('change', () => {
    if (returnInput.value <= pickupInput.value) {
      if (typeof showToast === 'function') {
        showToast('Return date must be after pickup date.', 'warning');
      }
      const nextDay = new Date(pickupInput.value + 'T00:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      returnInput.value = nextDay.toISOString().split('T')[0];
    }
    calculatePrice();
    checkLiveAvailability();
  });

  // Initial Calculation & Availability Check
  calculatePrice();
  checkLiveAvailability();

  // Form Submission
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!isVehicleAvailable) {
        if (typeof showToast === 'function') {
          showToast('This vehicle is already reserved for the selected dates. Please select other dates.', 'error');
        }
        return;
      }

      const modal = document.getElementById('success-modal');
      const summaryText = document.getElementById('modal-summary-text');
      
      const elDays = document.getElementById('breakdown-days');
      const elTotal = document.getElementById('breakdown-total');
      const daysText = elDays ? elDays.textContent : 'selected duration';
      const totalText = elTotal ? elTotal.textContent : '';

      const pickupVal = pickupInput ? pickupInput.value : '';
      const returnVal = returnInput ? returnInput.value : '';
      const locSelect = document.getElementById('calc-location');
      const locVal = locSelect ? locSelect.value : (vehicle.location || 'Bangalore');
      const vehId = vehicle.id || vehicle._id || vehicle.vehicleCode;

      try {
        sessionStorage.setItem('skybolt_selected_vehicle_id', vehId);
      } catch (e) {}

      const checkoutUrl = `booking?id=${encodeURIComponent(vehId)}&pickup=${encodeURIComponent(pickupVal)}&return=${encodeURIComponent(returnVal)}&location=${encodeURIComponent(locVal)}`;

      const proceedBtn = document.getElementById('modal-proceed-booking');
      if (proceedBtn) {
        proceedBtn.href = checkoutUrl;
      }

      if (summaryText) {
        summaryText.textContent = `Reservation hold prepared for ${vehicle.name} (${daysText}). Estimated total: ${totalText}. Proceed to checkout to finalize driver info and secure your vehicle.`;
      }

      if (modal) {
        modal.classList.add('active');
      } else {
        window.location.href = checkoutUrl;
      }
    });
  }

  const closeModalBtn = document.getElementById('close-modal-btn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      window.location.href = '/vehicles';
    });
  }
}

function initFavoritesButton(vehicleId) {
  const favBtn = document.getElementById('detail-fav-btn');
  if (!favBtn) return;

  function updateIconState() {
    const fav = typeof isFavorite === 'function' ? isFavorite(vehicleId) : false;
    if (fav) {
      favBtn.classList.add('active');
      favBtn.innerHTML = `<i class="fa-solid fa-heart"></i>`;
    } else {
      favBtn.classList.remove('active');
      favBtn.innerHTML = `<i class="fa-regular fa-heart"></i>`;
    }
  }

  updateIconState();

  favBtn.addEventListener('click', () => {
    if (typeof toggleFavorite === 'function') {
      toggleFavorite(vehicleId);
      updateIconState();
    }
  });
}

/**
 * Verified Customer Reviews & Authoritative Ratings Engine
 */
function initVehicleReviewsEngine(vehicleId) {
  const escape = window.escapeHtml || ((s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

  let currentPage = 1;
  const pageLimit = 5;
  let currentSort = 'newest';
  let currentRating = '';

  const listContainer = document.getElementById('reviews-list-container');
  const paginationContainer = document.getElementById('reviews-pagination-container');
  const sortSelect = document.getElementById('review-sort-select');
  const filterSelect = document.getElementById('review-filter-rating');

  const avgEl = document.getElementById('review-stat-avg');
  const starsEl = document.getElementById('review-stat-stars');
  const countEl = document.getElementById('review-stat-count');
  const topRatingBadge = document.getElementById('detail-rating-badge');
  const topReviewsCount = document.getElementById('detail-reviews');

  // Modal elements
  const reportModal = document.getElementById('report-modal');
  const closeReportBtn = document.getElementById('close-report-modal-btn');
  const cancelReportBtn = document.getElementById('btn-cancel-report');
  const reportForm = document.getElementById('report-review-form');
  const reportTargetInput = document.getElementById('report-target-review-id');

  if (closeReportBtn) closeReportBtn.addEventListener('click', () => reportModal && reportModal.classList.remove('active'));
  if (cancelReportBtn) cancelReportBtn.addEventListener('click', () => reportModal && reportModal.classList.remove('active'));

  if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reviewId = reportTargetInput ? reportTargetInput.value : '';
      const reasonSelect = document.getElementById('report-reason');
      const descInput = document.getElementById('report-description');
      const submitBtn = document.getElementById('btn-submit-report');

      if (!reviewId || !reasonSelect || !reasonSelect.value) return;

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Submitting...';
        }

        if (window.SkyBoltApi) {
          await window.SkyBoltApi.post(`/reviews/${encodeURIComponent(reviewId)}/report`, {
            reason: reasonSelect.value,
            description: descInput ? descInput.value.trim() : undefined
          });
        }

        if (typeof window.showToast === 'function') {
          window.showToast('Report submitted. Our moderation team will inspect this review.', 'success');
        } else {
          alert('Report submitted successfully.');
        }

        reportForm.reset();
        if (reportModal) reportModal.classList.remove('active');
      } catch (err) {
        const msg = err && err.message ? err.message : 'Failed to submit report. Please log in first.';
        if (typeof window.showToast === 'function') {
          window.showToast(msg, 'error');
        } else {
          alert(msg);
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Report';
        }
      }
    });
  }

  function renderStarIcons(rating) {
    const r = Math.round(Number(rating || 0));
    let html = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= r) {
        html += '<i class="fa-solid fa-star"></i>';
      } else {
        html += '<i class="fa-regular fa-star"></i>';
      }
    }
    return html;
  }

  function updateSummaryUI(summary) {
    if (!summary) return;
    const avg = Number(summary.averageRating || 0).toFixed(1);
    const total = Number(summary.totalReviews || 0);

    if (avgEl) avgEl.textContent = avg;
    if (starsEl) starsEl.innerHTML = renderStarIcons(avg);
    if (countEl) countEl.textContent = `Based on ${total} verified ${total === 1 ? 'review' : 'reviews'}`;

    // Update top header badges as well for consistency
    if (topRatingBadge) topRatingBadge.innerHTML = `<i class="fa-solid fa-star"></i> ${avg}`;
    if (topReviewsCount) topReviewsCount.textContent = `${total} verified reviews`;

    // Distribution bars
    const dist = summary.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let star = 1; star <= 5; star++) {
      const count = dist[star] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const fillEl = document.getElementById(`dist-bar-${star}`);
      const countBadge = document.getElementById(`dist-count-${star}`);
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (countBadge) countBadge.textContent = count;
    }
  }

  async function loadReviews() {
    if (!listContainer) return;

    listContainer.innerHTML = `
      <div style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: var(--space-2);"></i>
        <p style="font-size: var(--fs-xs);">Loading verified customer experiences...</p>
      </div>
    `;

    try {
      let data = [];
      let summary = null;
      let meta = { total: 0, page: 1, limit: pageLimit, totalPages: 1 };

      if (window.SkyBoltApi) {
        const queryParams = new URLSearchParams({
          page: String(currentPage),
          limit: String(pageLimit),
          sort: currentSort
        });
        if (currentRating) queryParams.append('rating', currentRating);

        const res = await window.SkyBoltApi.get(`/vehicles/${encodeURIComponent(vehicleId)}/reviews?${queryParams.toString()}`);
        if (res && res.success && res.data) {
          data = res.data;
          summary = res.summary;
          meta = res.meta || meta;
        }
      }

      if (summary) {
        updateSummaryUI(summary);
      }

      if (!data || data.length === 0) {
        listContainer.innerHTML = `
          <div style="text-align: center; padding: var(--space-8); background: var(--surface); border-radius: var(--radius-lg); border: 1px solid var(--border);">
            <i class="fa-solid fa-comment-dots" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: var(--space-3);"></i>
            <h4 style="margin-bottom: var(--space-1); font-size: var(--fs-md);">No Customer Reviews Yet</h4>
            <p style="font-size: var(--fs-xs); color: var(--text-muted); max-width: 400px; margin: 0 auto;">
              Be the first customer to rent this vehicle and share your verified experience after trip completion.
            </p>
          </div>
        `;
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
      }

      // Render Review Cards
      listContainer.innerHTML = data.map((review) => {
        const authorName = escape(review.author?.name || 'Verified Customer');
        const initials = authorName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'VC';
        const dateStr = review.publishedAt ? new Date(review.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        const isEdited = review.editedAt ? '<span style="font-size: var(--fs-2xs); color: var(--text-muted); margin-left: 4px;">(edited)</span>' : '';
        const helpfulCount = review.helpfulCount || 0;
        const isHelpful = review.userVotedHelpful ? 'active' : '';

        return `
          <article class="review-card-item" id="review-card-${escape(review.id)}">
            <div class="review-card-header">
              <div class="review-author-info">
                <div class="author-avatar">${escape(initials)}</div>
                <div>
                  <div style="font-weight: 700; font-size: var(--fs-sm); color: var(--text-primary);">${authorName}</div>
                  <div style="font-size: var(--fs-2xs); color: var(--text-muted);">
                    Rented ${dateStr}${isEdited}
                  </div>
                </div>
              </div>
              <div>
                <span class="verified-badge"><i class="fa-solid fa-circle-check"></i> Verified Rental</span>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
              <div class="rating-stars-gold" style="font-size: 0.95rem; margin: 0;">
                ${renderStarIcons(review.rating)}
              </div>
              <strong style="font-size: var(--fs-sm); color: var(--text-primary);">${escape(review.title)}</strong>
            </div>

            <p style="font-size: var(--fs-sm); color: var(--text-secondary); line-height: var(--lh-relaxed); margin-bottom: 0;">
              ${escape(review.comment)}
            </p>

            <div class="review-footer">
              <button class="btn-helpful ${isHelpful}" data-review-id="${escape(review.id)}" aria-label="Mark review as helpful">
                <i class="fa-regular fa-thumbs-up"></i> Helpful (<span class="helpful-count-val">${helpfulCount}</span>)
              </button>

              <button class="btn-report" data-review-id="${escape(review.id)}" aria-label="Report review for moderation">
                <i class="fa-regular fa-flag"></i> Report
              </button>
            </div>
          </article>
        `;
      }).join('');

      // Wire up helpful buttons
      listContainer.querySelectorAll('.btn-helpful').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const revId = btn.getAttribute('data-review-id');
          if (!revId) return;

          try {
            if (window.SkyBoltApi) {
              const res = await window.SkyBoltApi.post(`/reviews/${encodeURIComponent(revId)}/helpful`, {});
              if (res && res.success && res.data) {
                const countSpan = btn.querySelector('.helpful-count-val');
                if (countSpan) countSpan.textContent = res.data.helpfulCount;
                if (res.data.voted) {
                  btn.classList.add('active');
                } else {
                  btn.classList.remove('active');
                }
              }
            }
          } catch (err) {
            const msg = err && err.message ? err.message : 'Please log in to vote on reviews.';
            if (typeof window.showToast === 'function') {
              window.showToast(msg, 'warning');
            } else {
              alert(msg);
            }
          }
        });
      });

      // Wire up report buttons
      listContainer.querySelectorAll('.btn-report').forEach((btn) => {
        btn.addEventListener('click', () => {
          const revId = btn.getAttribute('data-review-id');
          if (reportTargetInput) reportTargetInput.value = revId || '';
          if (reportModal) reportModal.classList.add('active');
        });
      });

      // Render pagination
      renderPagination(meta);

    } catch (err) {
      console.warn('[SkyBolt Reviews] Error loading reviews:', err);
      listContainer.innerHTML = `
        <div style="text-align: center; padding: var(--space-6); color: var(--text-muted);">
          <p style="font-size: var(--fs-xs);">Unable to load live reviews at this moment.</p>
        </div>
      `;
    }
  }

  function renderPagination(meta) {
    if (!paginationContainer) return;
    if (!meta || meta.totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }

    let html = '';
    if (meta.page > 1) {
      html += `<button class="btn btn-outline btn-sm" id="btn-review-prev"><i class="fa-solid fa-chevron-left"></i> Prev</button>`;
    }
    html += `<span style="font-size: var(--fs-xs); align-self: center; font-weight: 600; color: var(--text-secondary); margin: 0 var(--space-2);">Page ${meta.page} of ${meta.totalPages}</span>`;
    if (meta.page < meta.totalPages) {
      html += `<button class="btn btn-outline btn-sm" id="btn-review-next">Next <i class="fa-solid fa-chevron-right"></i></button>`;
    }

    paginationContainer.innerHTML = html;

    const prevBtn = document.getElementById('btn-review-prev');
    const nextBtn = document.getElementById('btn-review-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          loadReviews();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < meta.totalPages) {
          currentPage++;
          loadReviews();
        }
      });
    }
  }

  // Filter and sort event listeners
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      currentPage = 1;
      loadReviews();
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      currentRating = filterSelect.value;
      currentPage = 1;
      loadReviews();
    });
  }

  // Initial load
  loadReviews();
}

