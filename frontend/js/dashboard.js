/* ==========================================================================
   SkyBolt Rentals - Protected Dashboard & Booking Cancellation Engine
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  const activeUser = await enforceAuthProtection();
  if (!activeUser) return;

  renderUserProfile(activeUser);
  initDashboardTabs();
  renderBookingsLists();
  renderFavoritesGrid();
  initProfileForm(activeUser);
  initLogoutButton();
  initReviewModal();
});

/**
 * Route Protection: Authoritative backend session verification via /auth/me
 */
async function enforceAuthProtection() {
  try {
    const res = await window.SkyBoltApi.get('/auth/me');
    if (res && res.success && res.data && res.data.user) {
      sessionStorage.setItem('skybolt_user_profile', JSON.stringify(res.data.user));
      return res.data.user;
    }
  } catch (err) {
    console.warn('Session verification error:', err);
  }

  // Not authenticated
  sessionStorage.removeItem('skybolt_user_profile');
  if (typeof showToast === 'function') {
    showToast('Please sign in to access your dashboard.', 'warning');
  }
  setTimeout(() => {
    window.location.href = '/login';
  }, 400);
  return null;
}

function renderUserProfile(user) {
  const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
  
  const avatarEl = document.getElementById('user-avatar');
  const nameEl = document.getElementById('user-name-display');
  const emailEl = document.getElementById('user-email-display');

  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl) nameEl.textContent = user.name || 'Demo User';
  if (emailEl) emailEl.textContent = user.email || 'user@example.com';
}

function initDashboardTabs() {
  const tabBtns = document.querySelectorAll('.dash-tab-btn[data-tab]');
  const panels = document.querySelectorAll('.dash-content-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.querySelector(`.dash-content-panel[data-panel="${tabName}"]`);
      if (targetPanel) targetPanel.classList.add('active');

      if (tabName === 'favorites') renderFavoritesGrid();
      if (tabName === 'reviews') renderMyReviews();
    });
  });
}

async function fetchLiveBookings() {
  if (window.SkyBoltApi) {
    try {
      const res = await window.SkyBoltApi.get('/bookings?limit=50&sort=newest');
      if (res && res.success && Array.isArray(res.data)) {
        return res.data;
      }
    } catch (err) {
      console.warn('[SkyBolt Dashboard] Live bookings fetch error:', err);
    }
  }
  return [];
}

async function renderBookingsLists() {
  const upcomingList = document.getElementById('upcoming-bookings-list');
  const historyList = document.getElementById('history-bookings-list');

  if (upcomingList) {
    upcomingList.innerHTML = `
      <div style="text-align: center; padding: var(--space-8); color: var(--muted);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.8rem; margin-bottom: var(--space-2);"></i>
        <p>Loading your reservations...</p>
      </div>
    `;
  }

  const allBookings = await fetchLiveBookings();

  const upcoming = allBookings.filter(b => ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'ACTIVE'].includes(b.status));
  const history = allBookings.filter(b => ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(b.status));

  // Render Upcoming
  if (upcomingList) {
    if (upcoming.length === 0) {
      upcomingList.innerHTML = `
        <div style="text-align: center; padding: var(--space-10); background-color: var(--white); border-radius: var(--radius-xl); border: 1px solid var(--border);">
          <i class="fa-solid fa-calendar-plus text-muted" style="font-size: 2.5rem; margin-bottom: var(--space-3);"></i>
          <h3>No Upcoming Reservations</h3>
          <p class="text-muted">Explore our fleet and book your next ride today!</p>
          <a href='/vehicles' class="btn btn-primary btn-sm">Browse Vehicles</a>
        </div>
      `;
    } else {
      upcomingList.innerHTML = upcoming.map(b => createBookingCardHTML(b, true)).join('');
    }
  }

  // Render History
  if (historyList) {
    if (history.length === 0) {
      historyList.innerHTML = `
        <div style="text-align: center; padding: var(--space-10); background-color: var(--white); border-radius: var(--radius-xl); border: 1px solid var(--border);">
          <i class="fa-solid fa-clock-rotate-left text-muted" style="font-size: 2.5rem; margin-bottom: var(--space-3);"></i>
          <h3>No Booking History</h3>
          <p class="text-muted">Past and cancelled reservations will appear here.</p>
        </div>
      `;
    } else {
      historyList.innerHTML = history.map(b => createBookingCardHTML(b, false)).join('');
    }
  }

  // Attach Cancellation Button Event Listeners
  document.querySelectorAll('.btn-cancel-booking').forEach(btn => {
    btn.addEventListener('click', () => {
      const bookingId = btn.getAttribute('data-booking-id');
      const bookingRef = btn.getAttribute('data-booking-ref') || bookingId;
      promptCancelBookingModal(bookingId, bookingRef);
    });
  });

  // Attach Pay Now Button Event Listeners
  document.querySelectorAll('.btn-pay-booking').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bookingId = btn.getAttribute('data-booking-id');
      const bookingRef = btn.getAttribute('data-booking-ref') || bookingId;
      const vehicleName = btn.getAttribute('data-vehicle-name') || 'Vehicle';
      await handleDashboardPayment(bookingId, bookingRef, btn, vehicleName);
    });
  });

  // Attach Rate & Review Button Event Listeners
  document.querySelectorAll('.btn-rate-booking').forEach(btn => {
    btn.addEventListener('click', () => {
      const bookingId = btn.getAttribute('data-booking-id');
      const vehicleName = btn.getAttribute('data-vehicle-name') || 'Vehicle';
      openReviewModalForBooking(bookingId, vehicleName);
    });
  });
}

async function handleDashboardPayment(bookingId, bookingRef, btn, vehicleName = 'Vehicle') {
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Initializing...`;

  try {
    const orderRes = await window.SkyBoltApi.post('/payments/orders', { bookingId });
    if (!orderRes || !orderRes.success || !orderRes.data) {
      if (typeof showToast === 'function') showToast('Failed to initialize payment gateway.', 'error');
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      return;
    }

    const orderData = orderRes.data;

    if (window.SkyBoltPayment && typeof window.SkyBoltPayment.launchPayment === 'function') {
      window.SkyBoltPayment.launchPayment({
        orderData,
        booking: { bookingReference: bookingRef, id: bookingId },
        vehicleName,
        onSuccess: async function (resp) {
          btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verifying...`;
          const verifyRes = await window.SkyBoltApi.post('/payments/verify', {
            bookingId,
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature
          });
          if (verifyRes && verifyRes.success) {
            if (typeof showToast === 'function') showToast(`Payment verified! Reservation ${bookingRef} is Confirmed!`, 'success');
            await renderUserReservations();
          } else {
            if (typeof showToast === 'function') showToast('Payment verification failed.', 'error');
            btn.disabled = false;
            btn.innerHTML = originalHtml;
          }
        },
        onFailure: function (failResp) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
          const desc = failResp?.error?.description || failResp?.error?.reason || 'Payment declined by bank or gateway.';
          if (typeof showToast === 'function') showToast(`Payment failed: ${desc}`, 'error');
        },
        onDismiss: function () {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
          if (typeof showToast === 'function') showToast('Payment window dismissed.', 'warning');
        }
      });
    } else {
      if (typeof showToast === 'function') showToast('Unable to initialize payment module.', 'error');
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  } catch (err) {
    console.error('[Dashboard Payment Error]:', err);
    if (typeof showToast === 'function') showToast('An error occurred opening checkout.', 'error');
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

function createBookingCardHTML(b, isUpcoming) {
  const escape = window.escapeHtml || ((s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

  let statusBadge = `<span class="badge badge-success">Confirmed</span>`;
  if (b.status === 'PENDING' || b.status === 'PAYMENT_PENDING') {
    statusBadge = `<span class="badge" style="background-color: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 600;">Payment Pending</span>`;
  } else if (b.status === 'ACTIVE') {
    statusBadge = `<span class="badge badge-primary">Active Rental</span>`;
  } else if (b.status === 'CANCELLED') {
    statusBadge = `<span class="badge" style="background-color: var(--danger-light); color: var(--danger);">Cancelled</span>`;
  } else if (b.status === 'COMPLETED') {
    statusBadge = `<span class="badge badge-primary">Completed</span>`;
  } else if (b.status === 'EXPIRED') {
    statusBadge = `<span class="badge" style="background-color: var(--muted-light); color: var(--muted);">Expired</span>`;
  }

  const pDate = escape(b.pickupAt ? b.pickupAt.split('T')[0] : '');
  const rDate = escape(b.returnAt ? b.returnAt.split('T')[0] : '');
  const locationName = escape(typeof b.pickupLocation === 'string' ? b.pickupLocation : (b.pickupLocation?.name || 'Main Hub'));
  const rawVehicleName = b.vehicleSnapshot?.name || b.vehicle?.name || `${b.vehicle?.brand || ''} ${b.vehicle?.model || ''}`.trim() || 'Vehicle';
  const vehicleName = escape(rawVehicleName);
  const vehicleImage = escape(b.vehicle?.image || 'assets/images/hero-bg.webp');
  const totalAmount = escape(b.pricingSnapshot?.total || b.pricing?.total || 0);
  const bookingRef = escape(b.bookingReference || b.id || '');
  const bookingId = escape(b.id || '');
  const isCancellable = ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED'].includes(b.status);
  const isPayable = ['PENDING', 'PAYMENT_PENDING'].includes(b.status);

  return `
    <article class="booking-history-card">
      <div class="booking-card-media">
        <img src="${vehicleImage}" alt="${vehicleName}">
      </div>
      <div class="booking-card-body">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-2);">
          <div>
            <span style="font-family: monospace; font-size: var(--fs-xs); font-weight: 800; color: var(--muted);">${bookingRef}</span>
            <h3 style="font-size: var(--fs-md); margin-top: 0.15rem; margin-bottom: 0;">${vehicleName}</h3>
          </div>
          <div>${statusBadge}</div>
        </div>

        <div style="display: flex; gap: var(--space-4); flex-wrap: wrap; font-size: var(--fs-xs); color: var(--muted); margin-bottom: var(--space-4);">
          <span><i class="fa-solid fa-calendar text-primary"></i> ${pDate} to ${rDate}</span>
          <span><i class="fa-solid fa-location-dot text-primary"></i> ${locationName}</span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: var(--space-3); flex-wrap: wrap; gap: var(--space-2);">
          <div style="font-weight: 800; color: var(--primary); font-size: var(--fs-md);">
            Total: ₹${totalAmount}
          </div>
          <div style="display: flex; gap: var(--space-2);">
            ${isUpcoming && isPayable ? `
              <button class="btn btn-primary btn-sm btn-pay-booking" data-booking-id="${bookingId}" data-booking-ref="${bookingRef}" data-vehicle-name="${vehicleName}">
                <i class="fa-solid fa-credit-card"></i> Pay Now
              </button>
            ` : ''}
            ${isUpcoming && isCancellable ? `
              <button class="btn btn-outline btn-sm btn-cancel-booking" data-booking-id="${bookingId}" data-booking-ref="${bookingRef}" style="color: var(--danger); border-color: var(--border);">
                <i class="fa-solid fa-xmark"></i> Cancel
              </button>
            ` : ''}
            ${!isUpcoming && b.status === 'COMPLETED' ? `
              <button class="btn btn-primary btn-sm btn-rate-booking" data-booking-id="${bookingId}" data-vehicle-name="${vehicleName}">
                <i class="fa-solid fa-star"></i> Rate & Review
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    </article>
  `;
}

let pendingCancelId = null;

function promptCancelBookingModal(bookingId, bookingRef) {
  pendingCancelId = bookingId;
  const modal = document.getElementById('cancel-modal');
  const desc = document.getElementById('cancel-modal-desc');

  if (desc) desc.textContent = `Are you sure you want to cancel booking ${bookingRef || bookingId}? The vehicle reservation will be released immediately.`;
  if (modal) modal.classList.add('active');

  const keepBtn = document.getElementById('btn-modal-keep');
  const confirmBtn = document.getElementById('btn-modal-confirm-cancel');

  if (keepBtn) {
    keepBtn.onclick = () => modal.classList.remove('active');
  }

  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      if (pendingCancelId) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cancelling...`;
        await cancelBookingById(pendingCancelId);
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `Confirm Cancellation`;
        modal.classList.remove('active');
      }
    };
  }
}

async function cancelBookingById(bookingId) {
  if (window.SkyBoltApi) {
    try {
      const res = await window.SkyBoltApi.post(`/bookings/${encodeURIComponent(bookingId)}/cancel`, {
        reason: 'CUSTOMER_REQUEST',
        notes: 'Customer cancelled from dashboard'
      });

      if (res && res.success) {
        if (typeof showToast === 'function') {
          showToast('Reservation has been cancelled and inventory released.', 'info');
        }
        await renderBookingsLists();
        return;
      } else {
        const errMsg = res?.error?.message || 'Failed to cancel booking.';
        if (typeof showToast === 'function') {
          showToast(errMsg, 'error');
        }
      }
    } catch (err) {
      console.error('[SkyBolt Dashboard] Cancellation error:', err);
      if (typeof showToast === 'function') {
        showToast('An error occurred while cancelling booking.', 'error');
      }
    }
  }
}

function renderFavoritesGrid() {
  const favGrid = document.getElementById('favorites-grid');
  if (!favGrid) return;

  const favIds = getFavorites();
  const favVehicles = vehicles.filter(v => favIds.includes(v.id));

  if (favVehicles.length === 0) {
    favGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: var(--space-10); background-color: var(--white); border-radius: var(--radius-xl); border: 1px solid var(--border);">
        <i class="fa-regular fa-heart text-muted" style="font-size: 2.5rem; margin-bottom: var(--space-3);"></i>
        <h3>No Favorites Saved</h3>
        <p class="text-muted">Click the heart icon on any vehicle card to save your favorite rides here!</p>
      </div>
    `;
    return;
  }

  favGrid.innerHTML = favVehicles.map(v => `
    <article class="vehicle-card">
      <div class="card-media">
        <span class="badge badge-primary card-badge">${v.category.toUpperCase()}</span>
        <button class="fav-card-btn active" data-fav-id="${v.id}" aria-label="Remove favorite">
          <i class="fa-solid fa-heart"></i>
        </button>
        <img src="${v.image}" alt="${v.name}">
      </div>
      <div class="card-body">
        <h3 class="card-title" style="margin-bottom: var(--space-1);">${v.name}</h3>
        <div class="card-price" style="margin-bottom: var(--space-3);">₹${v.pricePerDay} <span>/ day</span></div>
        <div class="card-footer">
          <a href="vehicle-details?id=${encodeURIComponent(v.vehicleCode || v.id)}" class="btn btn-outline btn-sm" style="flex: 1;">View Details</a>
          <a href="vehicle-details?id=${encodeURIComponent(v.vehicleCode || v.id)}#booking-panel" class="btn btn-primary btn-sm" style="flex: 1;">Book Now</a>
        </div>
      </div>
    </article>
  `).join('');

  favGrid.querySelectorAll('.fav-card-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = parseInt(btn.getAttribute('data-fav-id'), 10);
      toggleFavorite(id);
      renderFavoritesGrid();
    });
  });
}

function initProfileForm(user) {
  const nameInput = document.getElementById('prof-name');
  const emailInput = document.getElementById('prof-email');
  const phoneInput = document.getElementById('prof-phone');
  const licenseInput = document.getElementById('prof-license');
  const form = document.getElementById('profile-update-form');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

  if (nameInput) nameInput.value = user.name || '';
  if (emailInput) {
    emailInput.value = user.email || '';
    emailInput.disabled = true; // Email change requires email verification workflow (deferred)
  }
  if (phoneInput) phoneInput.value = user.phone || '';
  if (licenseInput) licenseInput.value = user.licenseNumber || user.license || '';

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updatedFields = {
        name: nameInput ? nameInput.value.trim() : undefined,
        phone: phoneInput ? phoneInput.value.trim() : undefined,
        licenseNumber: licenseInput ? licenseInput.value.trim() : undefined
      };

      const origBtn = submitBtn ? submitBtn.innerHTML : 'Save Changes';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }

      try {
        const res = await window.SkyBoltApi.patch('/users/me', updatedFields);
        if (res && res.success && res.data && res.data.user) {
          sessionStorage.setItem('skybolt_user_profile', JSON.stringify(res.data.user));
          renderUserProfile(res.data.user);
          showToast('Profile updated successfully!', 'success');
        } else {
          const err = res && res.error ? res.error.message : 'Failed to update profile.';
          showToast(err, 'error');
        }
      } catch {
        showToast('Network error while updating profile.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtn;
        }
      }
    });
  }
}

function initLogoutButton() {
  const logoutBtn = document.getElementById('dash-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await window.SkyBoltApi.post('/auth/logout');
      } catch (e) {
        console.warn('Logout request error', e);
      }
      sessionStorage.removeItem('skybolt_user_profile');
      if (typeof showToast === 'function') {
        showToast('Signed out of session', 'info');
      }
      setTimeout(() => {
        window.location.href = '/login';
      }, 500);
    });
  }
}

/**
 * Reviews Modal and History Engine
 */
const ratingLabels = {
  1: '1 - Poor',
  2: '2 - Fair',
  3: '3 - Good',
  4: '4 - Very Good',
  5: '5 - Excellent'
};

function updateStarSelectorUI(val) {
  const stars = document.querySelectorAll('#rating-star-selector .star-opt');
  stars.forEach(star => {
    const starVal = Number(star.getAttribute('data-val'));
    if (starVal <= val) {
      star.className = 'fa-solid fa-star star-opt';
    } else {
      star.className = 'fa-regular fa-star star-opt';
    }
  });

  const ratingValInput = document.getElementById('review-form-rating-val');
  const ratingLabelEl = document.getElementById('rating-score-label');
  if (ratingValInput) ratingValInput.value = String(val);
  if (ratingLabelEl) ratingLabelEl.textContent = ratingLabels[val] || `${val} Stars`;
}

function openReviewModalForBooking(bookingId, vehicleName) {
  const modal = document.getElementById('review-modal');
  const form = document.getElementById('review-submission-form');
  const titleHeader = document.getElementById('review-modal-title');
  const vehicleNameEl = document.getElementById('review-form-vehicle-name');
  const bookingIdInput = document.getElementById('review-form-booking-id');
  const reviewIdInput = document.getElementById('review-form-review-id');
  const submitBtn = document.getElementById('btn-submit-review');

  if (form) form.reset();
  if (bookingIdInput) bookingIdInput.value = bookingId;
  if (reviewIdInput) reviewIdInput.value = '';
  if (vehicleNameEl) vehicleNameEl.textContent = vehicleName || 'Vehicle Rental';
  if (titleHeader) titleHeader.innerHTML = `<i class="fa-solid fa-star text-primary"></i> Rate & Review Your Rental`;
  if (submitBtn) submitBtn.textContent = 'Publish Review';

  updateStarSelectorUI(5);
  const charCounter = document.getElementById('comment-char-count');
  if (charCounter) charCounter.textContent = '0 / 2000';

  if (modal) modal.classList.add('active');
}

function openReviewModalForEdit(review) {
  const modal = document.getElementById('review-modal');
  const titleHeader = document.getElementById('review-modal-title');
  const vehicleNameEl = document.getElementById('review-form-vehicle-name');
  const bookingIdInput = document.getElementById('review-form-booking-id');
  const reviewIdInput = document.getElementById('review-form-review-id');
  const titleInput = document.getElementById('review-title');
  const commentInput = document.getElementById('review-comment');
  const submitBtn = document.getElementById('btn-submit-review');

  if (bookingIdInput) bookingIdInput.value = review.bookingId || '';
  if (reviewIdInput) reviewIdInput.value = review.id;
  if (vehicleNameEl) vehicleNameEl.textContent = review.vehicle?.name || `${review.vehicle?.brand || ''} ${review.vehicle?.model || ''}`.trim() || 'Vehicle Rental';
  if (titleHeader) titleHeader.innerHTML = `<i class="fa-solid fa-pen text-primary"></i> Edit Your Review`;
  if (titleInput) titleInput.value = review.title || '';
  if (commentInput) {
    commentInput.value = review.comment || '';
    const charCounter = document.getElementById('comment-char-count');
    if (charCounter) charCounter.textContent = `${commentInput.value.length} / 2000`;
  }
  if (submitBtn) submitBtn.textContent = 'Save Changes';

  updateStarSelectorUI(review.rating || 5);

  if (modal) modal.classList.add('active');
}

function initReviewModal() {
  const modal = document.getElementById('review-modal');
  const closeBtn = document.getElementById('close-review-modal-btn');
  const cancelBtn = document.getElementById('btn-cancel-review');
  const form = document.getElementById('review-submission-form');
  const commentInput = document.getElementById('review-comment');
  const charCounter = document.getElementById('comment-char-count');

  if (closeBtn) closeBtn.addEventListener('click', () => modal && modal.classList.remove('active'));
  if (cancelBtn) cancelBtn.addEventListener('click', () => modal && modal.classList.remove('active'));

  // Star selector clicks
  document.querySelectorAll('#rating-star-selector .star-opt').forEach(star => {
    star.addEventListener('click', () => {
      const val = Number(star.getAttribute('data-val')) || 5;
      updateStarSelectorUI(val);
    });
  });

  // Character counter
  if (commentInput && charCounter) {
    commentInput.addEventListener('input', () => {
      charCounter.textContent = `${commentInput.value.length} / 2000`;
    });
  }

  // Submit handler
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const bookingId = document.getElementById('review-form-booking-id')?.value;
      const reviewId = document.getElementById('review-form-review-id')?.value;
      const rating = Number(document.getElementById('review-form-rating-val')?.value || 5);
      const title = document.getElementById('review-title')?.value.trim();
      const comment = document.getElementById('review-comment')?.value.trim();
      const submitBtn = document.getElementById('btn-submit-review');

      if (!title || title.length < 3) {
        if (typeof showToast === 'function') showToast('Review headline must be at least 3 characters.', 'warning');
        return;
      }
      if (!comment || comment.length < 10) {
        if (typeof showToast === 'function') showToast('Detailed review must be at least 10 characters.', 'warning');
        return;
      }

      const origText = submitBtn ? submitBtn.textContent : 'Publish Review';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
      }

      try {
        if (reviewId) {
          // Editing existing review
          await window.SkyBoltApi.patch(`/reviews/${encodeURIComponent(reviewId)}`, {
            rating,
            title,
            comment
          });
          if (typeof showToast === 'function') showToast('Review updated successfully!', 'success');
        } else {
          // Creating new verified review
          await window.SkyBoltApi.post(`/bookings/${encodeURIComponent(bookingId)}/review`, {
            rating,
            title,
            comment
          });
          if (typeof showToast === 'function') showToast('Verified review published successfully!', 'success');
        }

        if (modal) modal.classList.remove('active');
        form.reset();

        // Refresh lists
        await renderBookingsLists();
        await renderMyReviews();

      } catch (err) {
        const msg = err && err.message ? err.message : 'Unable to submit review. Please try again.';
        if (typeof showToast === 'function') {
          showToast(msg, 'error');
        } else {
          alert(msg);
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
        }
      }
    });
  }
}

async function renderMyReviews() {
  const container = document.getElementById('my-reviews-list');
  if (!container) return;

  const escape = window.escapeHtml || ((s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-8); color: var(--muted);">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.8rem; margin-bottom: var(--space-2);"></i>
      <p>Loading your verified reviews...</p>
    </div>
  `;

  try {
    let reviews = [];
    if (window.SkyBoltApi) {
      const res = await window.SkyBoltApi.get('/me/reviews?limit=20');
      if (res && res.success && Array.isArray(res.data)) {
        reviews = res.data;
      }
    }

    if (reviews.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: var(--space-10); background-color: var(--surface); border-radius: var(--radius-xl); border: 1px solid var(--border);">
          <i class="fa-regular fa-star text-muted" style="font-size: 2.5rem; margin-bottom: var(--space-3);"></i>
          <h3>No Reviews Submitted Yet</h3>
          <p class="text-muted" style="max-width: 440px; margin: 0 auto var(--space-4);">
            After completing any trip, you can share your verified rental feedback with the SkyBolt community.
          </p>
          <button class="btn btn-outline btn-sm" onclick="document.querySelector('.dash-tab-btn[data-tab=history]').click()">
            <i class="fa-solid fa-clock-rotate-left"></i> View Completed Trips
          </button>
        </div>
      `;
      return;
    }

    function renderStarIcons(rating) {
      const r = Math.round(Number(rating || 0));
      let html = '';
      for (let i = 1; i <= 5; i++) {
        html += i <= r ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
      }
      return html;
    }

    container.innerHTML = reviews.map(rev => {
      const vehicleName = escape(rev.vehicle?.name || `${rev.vehicle?.brand || ''} ${rev.vehicle?.model || ''}`.trim() || 'Vehicle');
      const dateStr = rev.publishedAt ? new Date(rev.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
      const isEdited = rev.editedAt ? '<span style="font-size: var(--fs-2xs); color: var(--text-muted); margin-left: 4px;">(edited)</span>' : '';
      const canEdit = rev.canEdit !== false && rev.status === 'PUBLISHED';

      let statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Published</span>`;
      if (rev.status === 'PENDING') statusBadge = `<span class="badge badge-neutral">Pending Moderation</span>`;
      if (rev.status === 'HIDDEN') statusBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger);">Hidden</span>`;
      if (rev.status === 'REJECTED') statusBadge = `<span class="badge badge-danger">Rejected</span>`;

      return `
        <article class="booking-history-card" id="my-rev-${escape(rev.id)}">
          <div class="booking-card-body" style="width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-2);">
              <div>
                <h3 style="font-size: var(--fs-md); margin-top: 0.15rem; margin-bottom: 0;">${vehicleName}</h3>
                <div style="font-size: var(--fs-2xs); color: var(--text-muted); margin-top: 2px;">
                  Reviewed on ${dateStr}${isEdited}
                </div>
              </div>
              <div>${statusBadge}</div>
            </div>

            <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
              <div style="color: #f59e0b; font-size: 0.95rem;">
                ${renderStarIcons(rev.rating)}
              </div>
              <strong style="font-size: var(--fs-sm);">${escape(rev.title)}</strong>
            </div>

            <p style="font-size: var(--fs-sm); color: var(--text-secondary); line-height: var(--lh-relaxed); margin-bottom: var(--space-4);">
              ${escape(rev.comment)}
            </p>

            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: var(--space-3); font-size: var(--fs-xs);">
              <span class="text-muted"><i class="fa-regular fa-thumbs-up"></i> ${rev.helpfulCount || 0} found this helpful</span>
              <div style="display: flex; gap: var(--space-2);">
                ${canEdit ? `
                  <button class="btn btn-outline btn-xs btn-edit-my-review" data-rev-id="${escape(rev.id)}">
                    <i class="fa-solid fa-pen"></i> Edit
                  </button>
                ` : ''}
                <button class="btn btn-ghost btn-xs btn-delete-my-review" data-rev-id="${escape(rev.id)}" style="color: var(--danger);">
                  <i class="fa-solid fa-trash"></i> Delete
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach edit review click listeners
    container.querySelectorAll('.btn-edit-my-review').forEach(btn => {
      btn.addEventListener('click', () => {
        const rId = btn.getAttribute('data-rev-id');
        const rev = reviews.find(r => r.id === rId);
        if (rev) openReviewModalForEdit(rev);
      });
    });

    // Attach delete review click listeners
    container.querySelectorAll('.btn-delete-my-review').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rId = btn.getAttribute('data-rev-id');
        if (!rId) return;
        if (!confirm('Are you sure you want to delete this review?')) return;

        try {
          await window.SkyBoltApi.delete(`/reviews/${encodeURIComponent(rId)}`);
          if (typeof showToast === 'function') showToast('Review removed.', 'info');
          await renderMyReviews();
        } catch (err) {
          const msg = err && err.message ? err.message : 'Failed to delete review.';
          if (typeof showToast === 'function') showToast(msg, 'error');
        }
      });
    });

  } catch (err) {
    console.warn('[SkyBolt Dashboard] Failed to load my reviews:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: var(--space-6); color: var(--muted);">
        <p>Failed to load reviews. Please try again.</p>
      </div>
    `;
  }
}

