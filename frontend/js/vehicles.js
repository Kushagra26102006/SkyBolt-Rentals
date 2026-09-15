/* ==========================================================================
   SkyBolt Rentals - Vehicle Browsing, Filter, Search, Sort & Favorites Engine
   Connected to Production Backend API (GET /api/v1/vehicles)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initVehicleCatalog();
});

function initVehicleCatalog() {
  const container = document.getElementById('vehicles-grid-container');
  if (!container) return;

  // Filter DOM elements
  const categoryRadios = document.querySelectorAll('input[name="filter-category"]');
  const priceRange = document.getElementById('filter-price-range');
  const priceValueLabel = document.getElementById('price-range-value');
  const locationSelect = document.getElementById('filter-location');
  const fuelSelect = document.getElementById('filter-fuel');
  const transmissionSelect = document.getElementById('filter-transmission');
  const ratingSelect = document.getElementById('filter-rating');

  const searchInput = document.getElementById('catalog-search-input');
  const sortSelect = document.getElementById('catalog-sort-select');
  const resetBtn = document.getElementById('btn-reset-filters');
  const countDisplay = document.getElementById('results-count-display');

  const mobileToggleBtn = document.getElementById('toggle-filter-sidebar');
  const filterSidebar = document.getElementById('filter-sidebar');

  // State management
  let currentPage = 1;
  const pageLimit = 12;
  let totalPages = 1;
  let isLoading = false;
  let searchDebounceTimer = null;

  // Mobile sidebar drawer toggle
  if (mobileToggleBtn && filterSidebar) {
    mobileToggleBtn.addEventListener('click', () => {
      filterSidebar.classList.toggle('active');
    });
  }

  // Detect default category based on page pathname or URL query parameters
  const path = (window.location.pathname || '').toLowerCase();
  let defaultCategory = 'all';
  if (path.endsWith('/bikes') || path.includes('bikes')) defaultCategory = 'bike';
  else if (path.endsWith('/cars') || path.includes('cars')) defaultCategory = 'car';
  else if (path.endsWith('/scooters') || path.includes('scooters')) defaultCategory = 'scooter';

  const urlParams = new URLSearchParams(window.location.search);
  const rawType = urlParams.get('type') || urlParams.get('category') || (defaultCategory !== 'all' ? defaultCategory : null);
  if (rawType) {
    let normalizedType = rawType.toLowerCase();
    if (normalizedType === 'bikes') normalizedType = 'bike';
    if (normalizedType === 'cars') normalizedType = 'car';
    if (normalizedType === 'scooters') normalizedType = 'scooter';

    categoryRadios.forEach(radio => {
      if (radio.value.toLowerCase() === normalizedType) {
        radio.checked = true;
      }
    });
  }

  // Parse location query parameter
  const rawLocation = urlParams.get('location');
  if (rawLocation && rawLocation !== 'all' && locationSelect) {
    const locMap = {
      'ny': 'New York',
      'nyc': 'New York',
      'blr': 'Bangalore',
      'bangalore': 'Bangalore',
      'del': 'Delhi',
      'delhi': 'Delhi',
      'ldh': 'Ludhiana',
      'ludhiana': 'Ludhiana'
    };
    const targetLoc = locMap[rawLocation.toLowerCase()] || rawLocation;
    const matchingOption = Array.from(locationSelect.options).find(
      opt => opt.value.toLowerCase().includes(targetLoc.toLowerCase()) || targetLoc.toLowerCase().includes(opt.value.toLowerCase())
    );
    if (matchingOption) {
      locationSelect.value = matchingOption.value;
    }
  }

  // Parse search keyword query parameter
  const searchParam = urlParams.get('search') || urlParams.get('q');
  if (searchParam && searchInput) {
    searchInput.value = searchParam;
  }

  /**
   * Render loading skeleton state
   */
  function renderLoading() {
    isLoading = true;
    container.innerHTML = Array.from({ length: 6 }).map(() => `
      <article class="vehicle-card" style="opacity: 0.7; pointer-events: none;">
        <div class="card-media" style="background: linear-gradient(90deg, var(--border) 25%, var(--light) 50%, var(--border) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; height: 200px;"></div>
        <div class="card-body" style="padding: var(--space-4);">
          <div style="height: 20px; width: 60%; background: var(--border); border-radius: 4px; margin-bottom: 12px;"></div>
          <div style="height: 14px; width: 40%; background: var(--border); border-radius: 4px; margin-bottom: 16px;"></div>
          <div style="height: 36px; width: 100%; background: var(--border); border-radius: 4px;"></div>
        </div>
      </article>
    `).join('');
    if (countDisplay) countDisplay.textContent = 'Loading fleet...';
  }

  /**
   * Render API error state with retry button
   */
  function renderError(errorMessage) {
    isLoading = false;
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: var(--space-12) var(--space-6); background-color: var(--white); border-radius: var(--radius-xl); border: 1px solid var(--border);">
        <i class="fa-solid fa-triangle-exclamation text-primary" style="font-size: 3rem; margin-bottom: var(--space-4);"></i>
        <h3>Unable to Load Vehicles</h3>
        <p class="text-muted" style="margin-bottom: var(--space-4);">${errorMessage || 'Failed to connect to the fleet service.'}</p>
        <button id="btn-retry-fetch" class="btn btn-primary btn-sm">
          <i class="fa-solid fa-rotate-right"></i> Retry Connection
        </button>
      </div>
    `;
    const retryBtn = document.getElementById('btn-retry-fetch');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => fetchCatalog());
    }
    if (countDisplay) countDisplay.textContent = 'Error loading vehicles';
  }

  /**
   * Normalize vehicle data item whether from API DTO or local fallback
   */
  function normalizeVehicle(v) {
    const isApi = v.rental && v.rental.baseRate !== undefined;
    return {
      id: v.id || v._id || v.vehicleCode,
      vehicleCode: v.vehicleCode || `SKY-VHC-${v.id}`,
      name: v.name || `${v.brand} ${v.model}`,
      category: (v.category || 'CAR').toLowerCase(),
      image: (v.images && v.images[0] && v.images[0].url) || v.image || 'assets/images/car-tour.webp',
      pricePerDay: isApi ? Number(v.rental.baseRate) : (v.pricePerDay || 500),
      currency: (v.rental && v.rental.currency) || 'INR',
      location: (v.location && (v.location.name || v.location.city)) || v.location || 'Fleet Hub',
      fuel: (v.specifications && v.specifications.fuelType) || v.fuel || 'Petrol',
      transmission: (v.specifications && v.specifications.transmission) || v.transmission || 'Automatic',
      seats: (v.specifications && v.specifications.seats) || v.seats || 4,
      rating: (v.rating && v.rating.average) || v.rating || 4.8,
      reviews: (v.rating && v.rating.count) || v.reviews || 42
    };
  }

  /**
   * Fetch vehicles from Production API or fallback gracefully to data.js
   */
  async function fetchCatalog() {
    renderLoading();

    const checkedCat = document.querySelector('input[name="filter-category"]:checked')?.value;
    const selectedCategory = checkedCat || (defaultCategory !== 'all' ? defaultCategory : 'all');
    const maxPrice = parseInt(priceRange ? priceRange.value : 50000, 10);
    if (priceValueLabel) priceValueLabel.textContent = `₹${maxPrice}`;

    const selectedLocation = locationSelect ? locationSelect.value : 'all';
    const selectedFuel = fuelSelect ? fuelSelect.value : 'all';
    const selectedTrans = transmissionSelect ? transmissionSelect.value : 'all';
    const minRating = parseFloat(ratingSelect ? ratingSelect.value : 0);
    const searchTerm = (searchInput ? searchInput.value : '').trim();
    const sortVal = sortSelect ? sortSelect.value : 'popular';

    // Map frontend sort values to API allowlist
    const sortMap = {
      'price-asc': 'price_asc',
      'price-desc': 'price_desc',
      'rating': 'rating_desc',
      'popular': 'popular'
    };

    // Try API fetch first
    if (window.SkyBoltApi) {
      try {
        const queryParams = new URLSearchParams();
        if (selectedCategory !== 'all') {
          // Map to backend category enum
          const catMap = {
            'car': 'CAR',
            'bike': 'BIKE',
            'scooter': 'SCOOTER',
            'electric': 'EV'
          };
          queryParams.append('category', catMap[selectedCategory] || selectedCategory.toUpperCase());
        }

        if (maxPrice && maxPrice < 50000) {
          // Convert to minor units (e.g. ₹1000 = 100000 paise)
          queryParams.append('maxPrice', (maxPrice * 100).toString());
        }

        if (selectedFuel !== 'all') {
          queryParams.append('fuelType', selectedFuel.toUpperCase());
        }

        if (selectedTrans !== 'all') {
          queryParams.append('transmission', selectedTrans.toUpperCase());
        }

        if (selectedLocation !== 'all') {
          queryParams.append('location', selectedLocation);
        }

        if (searchTerm) {
          queryParams.append('search', searchTerm);
        }

        queryParams.append('sort', sortMap[sortVal] || 'popular');
        queryParams.append('page', currentPage.toString());
        queryParams.append('limit', pageLimit.toString());

        const res = await window.SkyBoltApi.get(`/vehicles?${queryParams.toString()}`);

        if (res.success && res.data && Array.isArray(res.data.items)) {
          const items = res.data.items.map(normalizeVehicle);
          totalPages = res.data.pagination?.totalPages || 1;
          const totalCount = res.data.pagination?.total ?? items.length;
          renderGrid(items, totalCount);
          return;
        }
      } catch (err) {
        console.warn('[SkyBolt Vehicles] API query failed, falling back to local dataset:', err);
      }
    }

    // Fallback: local filtering if API not reached or returns non-200
    if (typeof vehicles !== 'undefined' && Array.isArray(vehicles)) {
      let filtered = [...vehicles];

      if (selectedCategory !== 'all') {
        filtered = filtered.filter(v => v.category.toLowerCase() === selectedCategory.toLowerCase());
      }
      filtered = filtered.filter(v => v.pricePerDay <= maxPrice);

      if (selectedLocation !== 'all') {
        filtered = filtered.filter(v => v.location.toLowerCase() === selectedLocation.toLowerCase());
      }
      if (selectedFuel !== 'all') {
        filtered = filtered.filter(v => v.fuel.toLowerCase() === selectedFuel.toLowerCase());
      }
      if (selectedTrans !== 'all') {
        filtered = filtered.filter(v => v.transmission.toLowerCase() === selectedTrans.toLowerCase());
      }
      if (minRating > 0) {
        filtered = filtered.filter(v => v.rating >= minRating);
      }
      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        filtered = filtered.filter(v =>
          v.name.toLowerCase().includes(lowerSearch) ||
          v.category.toLowerCase().includes(lowerSearch) ||
          v.location.toLowerCase().includes(lowerSearch)
        );
      }

      if (sortVal === 'price-asc') {
        filtered.sort((a, b) => a.pricePerDay - b.pricePerDay);
      } else if (sortVal === 'price-desc') {
        filtered.sort((a, b) => b.pricePerDay - a.pricePerDay);
      } else if (sortVal === 'rating') {
        filtered.sort((a, b) => b.rating - a.rating);
      } else if (sortVal === 'popular') {
        filtered.sort((a, b) => b.reviews - a.reviews);
      }

      renderGrid(filtered.map(normalizeVehicle), filtered.length);
    } else {
      renderError('No fleet dataset available.');
    }
  }

  /**
   * Render vehicle cards and pagination UI
   */
  function renderGrid(items, totalCount) {
    isLoading = false;

    // Update Result Count
    if (countDisplay) {
      countDisplay.textContent = `${totalCount} vehicle${totalCount === 1 ? '' : 's'} found`;
    }

    // Empty state
    if (items.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: var(--space-12) var(--space-6); background-color: var(--white); border-radius: var(--radius-xl); border: 1px solid var(--border);">
          <i class="fa-solid fa-car-side text-muted" style="font-size: 3rem; margin-bottom: var(--space-4);"></i>
          <h3>No Vehicles Found</h3>
          <p class="text-muted">Try relaxing your search or filter parameters to find available rides.</p>
        </div>
      `;
      return;
    }

    const escape = window.escapeHtml || ((s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

    const cardsHtml = items.map(v => {
      const fav = typeof isFavorite === 'function' ? isFavorite(v.id) : false;
      const categoryBadgeClass =
        v.category === 'electric' || v.category === 'ev' || v.fuel.toLowerCase() === 'electric'
          ? 'badge-success'
          : v.category === 'car'
          ? 'badge-secondary'
          : 'badge-primary';

      const sanitize = window.sanitizeUrl || ((u) => escape(u));
      const vId = escape(v.id);
      const vName = escape(v.name);
      const vImage = sanitize(v.image, 'assets/images/car-tour.webp');
      const vRating = escape(v.rating);
      const vReviews = escape(v.reviews);
      const vPrice = escape(v.pricePerDay);
      const vLocation = escape(v.location);
      const vFuel = escape(v.fuel);
      const vTrans = escape(v.transmission);
      const vSeats = escape(v.seats);
      const vCat = escape(v.category.toUpperCase());

      return `
        <article class="vehicle-card" data-id="${vId}">
          <div class="card-media">
            <span class="badge ${categoryBadgeClass} card-badge">${vCat}</span>
            <button class="fav-card-btn ${fav ? 'active' : ''}" data-fav-id="${vId}" aria-label="Toggle favorite">
              <i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
            </button>
            <img src="${vImage}" alt="${vName}" loading="lazy" onerror="this.src='assets/images/car-tour.webp'">
            <div class="card-rating-badge">
              <i class="fa-solid fa-star"></i> ${vRating} <span>(${vReviews})</span>
            </div>
          </div>
          <div class="card-body">
            <div class="card-header-row">
              <h3 class="card-title">${vName}</h3>
              <div class="card-price">₹${vPrice} <span>/ day</span></div>
            </div>
            <div class="card-location">
              <i class="fa-solid fa-location-dot text-primary"></i> ${vLocation}
            </div>
            <div class="card-specs">
              <span class="spec-pill"><i class="fa-solid fa-gas-pump"></i> ${vFuel}</span>
              <span class="spec-pill"><i class="fa-solid fa-gear"></i> ${vTrans}</span>
              <span class="spec-pill"><i class="fa-solid fa-users"></i> ${vSeats} Seats</span>
            </div>
            <div class="card-footer">
              <a href="vehicle-details?id=${encodeURIComponent(v.vehicleCode || v.id)}" class="btn btn-outline btn-sm" style="flex: 1;">View Details</a>
              <a href="booking?id=${encodeURIComponent(v.vehicleCode || v.id)}" class="btn btn-primary btn-sm" style="flex: 1;">Book Now</a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Pagination controls if more than 1 page
    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `
        <div style="grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; gap: var(--space-3); margin-top: var(--space-8);">
          <button id="btn-page-prev" class="btn btn-outline btn-sm" ${currentPage <= 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i> Prev
          </button>
          <span style="font-size: var(--fs-sm); font-weight: 600; color: var(--muted);">
            Page ${currentPage} of ${totalPages}
          </span>
          <button id="btn-page-next" class="btn btn-outline btn-sm" ${currentPage >= totalPages ? 'disabled' : ''}>
            Next <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      `;
    }

    container.innerHTML = cardsHtml + paginationHtml;

    // Attach favorite toggle handlers
    container.querySelectorAll('.fav-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-fav-id');
        if (typeof toggleFavorite === 'function') {
          const isFavNow = toggleFavorite(id);
          if (isFavNow) {
            btn.classList.add('active');
            btn.innerHTML = `<i class="fa-solid fa-heart"></i>`;
          } else {
            btn.classList.remove('active');
            btn.innerHTML = `<i class="fa-regular fa-heart"></i>`;
          }
        }
      });
    });

    // Attach pagination listeners
    const prevBtn = document.getElementById('btn-page-prev');
    const nextBtn = document.getElementById('btn-page-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          fetchCatalog();
          window.scrollTo({ top: container.offsetTop - 100, behavior: 'smooth' });
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          fetchCatalog();
          window.scrollTo({ top: container.offsetTop - 100, behavior: 'smooth' });
        }
      });
    }
  }

  // Filter change triggers
  function onFilterChange() {
    currentPage = 1; // Reset to first page
    fetchCatalog();
  }

  categoryRadios.forEach(r => r.addEventListener('change', onFilterChange));
  if (priceRange) priceRange.addEventListener('input', () => {
    if (priceValueLabel) priceValueLabel.textContent = `₹${priceRange.value}`;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(onFilterChange, 200);
  });
  if (locationSelect) locationSelect.addEventListener('change', onFilterChange);
  if (fuelSelect) fuelSelect.addEventListener('change', onFilterChange);
  if (transmissionSelect) transmissionSelect.addEventListener('change', onFilterChange);
  if (ratingSelect) ratingSelect.addEventListener('change', onFilterChange);
  if (sortSelect) sortSelect.addEventListener('change', onFilterChange);

  // Debounced Search Input (300ms)
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(onFilterChange, 300);
    });
  }

  // Reset Filters Button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      categoryRadios.forEach(r => r.checked = r.value === 'all');
      if (priceRange) priceRange.value = 1000;
      if (locationSelect) locationSelect.value = 'all';
      if (fuelSelect) fuelSelect.value = 'all';
      if (transmissionSelect) transmissionSelect.value = 'all';
      if (ratingSelect) ratingSelect.value = '0';
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'popular';
      currentPage = 1;
      fetchCatalog();
    });
  }

  // Initialize AI Recommendation Engine Assistant (TASK 16)
  initRecommendationAssistant();

  // Initial load
  fetchCatalog();

  // -------------------------------------------------------------------------
  // AI-Powered Vehicle Recommendation Assistant Engine (TASK 16)
  // -------------------------------------------------------------------------
  function initRecommendationAssistant() {
    const openBtn = document.getElementById('btn-open-ai-recommendation');
    const closeBtn = document.getElementById('btn-close-ai-rec');
    const modal = document.getElementById('ai-rec-modal');
    const form = document.getElementById('ai-rec-form');
    const queryInput = document.getElementById('ai-rec-query');
    const pickupInput = document.getElementById('ai-rec-pickup');
    const returnInput = document.getElementById('ai-rec-return');
    const passengersSelect = document.getElementById('ai-rec-passengers');
    const categorySelect = document.getElementById('ai-rec-category');
    const transmissionSelect = document.getElementById('ai-rec-transmission');
    const budgetSelect = document.getElementById('ai-rec-budget');
    const resultsArea = document.getElementById('ai-rec-results-area');
    const cardsList = document.getElementById('ai-rec-cards-list');
    const sourcePill = document.getElementById('ai-rec-source-pill');
    const submitBtn = document.getElementById('btn-submit-ai-rec');
    const resetRecBtn = document.getElementById('btn-reset-ai-rec');

    if (!openBtn || !modal) return;

    // Helper: format datetime local input default values
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(10, 0, 0, 0);
    const dayAfter = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    dayAfter.setHours(10, 0, 0, 0);

    const formatDtLocal = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    if (pickupInput && !pickupInput.value) pickupInput.value = formatDtLocal(tomorrow);
    if (returnInput && !returnInput.value) returnInput.value = formatDtLocal(dayAfter);

    // Open/Close modal
    openBtn.addEventListener('click', () => {
      modal.classList.add('active');
      if (queryInput) queryInput.focus();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        modal.classList.remove('active');
      }
    });

    if (resetRecBtn) {
      resetRecBtn.addEventListener('click', () => {
        if (queryInput) queryInput.value = '';
        if (passengersSelect) passengersSelect.value = '5';
        if (categorySelect) categorySelect.value = '';
        if (transmissionSelect) transmissionSelect.value = '';
        if (budgetSelect) budgetSelect.value = '';
        if (resultsArea) resultsArea.style.display = 'none';
        if (cardsList) cardsList.innerHTML = '';
      });
    }

    // Submit inquiry
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const pickupVal = pickupInput && pickupInput.value ? new Date(pickupInput.value).toISOString() : undefined;
        const returnVal = returnInput && returnInput.value ? new Date(returnInput.value).toISOString() : undefined;
        const queryVal = queryInput ? queryInput.value.trim() : '';

        const payload = {
          query: queryVal || undefined,
          pickupAt: pickupVal,
          returnAt: returnVal,
          passengers: passengersSelect && passengersSelect.value ? parseInt(passengersSelect.value, 10) : undefined,
          category: categorySelect && categorySelect.value ? categorySelect.value : undefined,
          transmission: transmissionSelect && transmissionSelect.value ? transmissionSelect.value : undefined,
          budget: budgetSelect && budgetSelect.value ? parseInt(budgetSelect.value, 10) : undefined
        };

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing Fleet...';
        }

        try {
          const res = await window.SkyBoltApi.post('/recommendations', payload);
          if (res && res.success && res.data) {
            renderRecommendationResults(res.data, pickupVal, returnVal);
          } else {
            const msg = res?.error?.message || 'Could not fetch recommendations.';
            if (cardsList) {
              cardsList.innerHTML = `<div class="alert alert-warning" style="padding: 1rem; border-radius: 8px;">${msg}</div>`;
              resultsArea.style.display = 'block';
            }
          }
        } catch (err) {
          if (cardsList) {
            cardsList.innerHTML = `<div class="alert alert-danger" style="padding: 1rem; border-radius: 8px;">Error generating recommendations. Please try again.</div>`;
            resultsArea.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Find Recommended Vehicles';
          }
        }
      });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderRecommendationResults(data, pickupAt, returnAt) {
      if (!resultsArea || !cardsList) return;
      resultsArea.style.display = 'block';

      if (sourcePill) {
        sourcePill.textContent = data.source === 'AI' ? '⚡ AI Recommendation' : '✦ Deterministic Match';
      }

      if (!data.recommendations || data.recommendations.length === 0) {
        cardsList.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
            <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--warning);"></i>
            <h4>No Available Vehicles Found</h4>
            <p style="font-size: 0.9rem;">No vehicles matched all your selected criteria for those dates. Try adjusting budget or passenger count.</p>
          </div>
        `;
        return;
      }

      cardsList.innerHTML = data.recommendations.map(rec => {
        const v = rec.vehicle;
        const rawImg = (v.images && v.images[0] && v.images[0].url) ? v.images[0].url : 'assets/images/hero-bg.webp';
        const imgUrl = (window.sanitizeUrl || escapeHtml)(rawImg, 'assets/images/hero-bg.webp');
        const rating = v.rating?.average ? v.rating.average.toFixed(1) : 'New';
        const ratingCount = v.rating?.count || 0;
        const baseRate = rec.pricing?.baseRate || v.rental?.baseRate || 0;
        const finalTotal = rec.pricing?.total || 0;
        const durationFmt = rec.pricing?.duration?.formatted || '1 Day';

        const highlightsHtml = (rec.highlights || []).map(h => `<span class="ai-highlight-pill">${escapeHtml(h)}</span>`).join('');

        const bookUrl = `/booking?vehicleId=${v.id}&pickup=${encodeURIComponent(pickupAt || rec.availability.pickupAt)}&return=${encodeURIComponent(returnAt || rec.availability.returnAt)}`;

        return `
          <div class="ai-rec-card" data-vehicle-id="${v.id}">
            <div>
              <img src="${imgUrl}" alt="${escapeHtml(v.name)}" style="width: 100%; height: 120px; object-fit: cover; border-radius: var(--radius-lg); border: 1px solid var(--border);">
            </div>

            <div>
              <div class="ai-reason-badge">
                <i class="fa-solid fa-wand-magic-sparkles"></i> ${escapeHtml(rec.reason)}
              </div>

              <h4 style="margin: 4px 0 6px 0; font-size: var(--fs-base); font-weight: 800; color: var(--text-primary);">
                ${escapeHtml(v.brand)} ${escapeHtml(v.name)}
              </h4>

              <div style="margin-bottom: 6px;">${highlightsHtml}</div>

              <div style="font-size: 0.8rem; color: var(--text-muted);">
                <i class="fa-solid fa-users"></i> ${v.specifications.seats} Seats • 
                <i class="fa-solid fa-gears"></i> ${v.specifications.transmission} • 
                <i class="fa-solid fa-gas-pump"></i> ${v.specifications.fuelType} • 
                <i class="fa-solid fa-star" style="color: #f59e0b;"></i> ${rating} (${ratingCount})
              </div>
            </div>

            <div style="text-align: right; display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
              <div>
                <div style="font-size: var(--fs-lg); font-weight: 800; color: var(--text-primary);">
                  ₹${baseRate.toLocaleString('en-IN')}<span style="font-size: 0.75rem; font-weight: 500; color: var(--text-muted);">/day</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">
                  Est. Total: ₹${finalTotal.toLocaleString('en-IN')} (${durationFmt})
                </div>
                <div style="margin-bottom: 8px;">
                  <span style="color: var(--success); font-weight: 700; font-size: 0.75rem;">
                    <i class="fa-solid fa-circle-check"></i> Available for dates
                  </span>
                </div>
              </div>

              <div>
                <a href="${bookUrl}" class="btn btn-primary btn-sm" style="display: block; text-align: center; font-weight: 700; text-decoration: none; padding: 0.5rem 0.75rem; border-radius: var(--radius-md);">
                  Book This Vehicle &rarr;
                </a>
                <div style="margin-top: 6px; display: flex; justify-content: flex-end; gap: 8px; font-size: 0.75rem; color: var(--text-muted);">
                  <span>Helpful?</span>
                  <button class="btn-rec-feedback" data-helpful="true" data-vehicle="${v.id}" style="background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.85rem;" title="Helpful">👍</button>
                  <button class="btn-rec-feedback" data-helpful="false" data-vehicle="${v.id}" style="background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.85rem;" title="Not helpful">👎</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Attach feedback listener
      cardsList.querySelectorAll('.btn-rec-feedback').forEach(btn => {
        btn.addEventListener('click', async () => {
          const isHelpful = btn.getAttribute('data-helpful') === 'true';
          const vehId = btn.getAttribute('data-vehicle');
          btn.style.transform = 'scale(1.3)';
          btn.style.transition = 'transform 0.2s';
          try {
            await window.SkyBoltApi.post('/recommendations/feedback', {
              vehicleId: vehId,
              helpful: isHelpful
            });
            const parent = btn.parentElement;
            if (parent) parent.innerHTML = '<span style="color: var(--success);">Thanks!</span>';
          } catch {}
        });
      });
    }
  }
}
