/* ==========================================================================
   SkyBolt Rentals - Add Vehicle Controller
   ========================================================================== */

(function(global) {
  'use strict';

  let currentImages = [
    'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=800'
  ];

  async function checkOwnerAuth() {
    try {
      const res = await global.SkyBoltApi.get('/auth/me');
      if (!res.success || !res.data) {
        window.location.href = '/login?redirect=/owner/add-vehicle';
        return;
      }
      const user = res.data.user || res.data;
      if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
        if (global.showToast) {
          global.showToast('Access restricted to registered Vehicle Owners.', 'warning');
        }
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1200);
      }
    } catch {
      window.location.href = '/login?redirect=/owner/add-vehicle';
    }
  }

  function renderImagePreviews() {
    const grid = document.getElementById('image-preview-grid');
    const errElem = document.getElementById('image-error');
    if (!grid) return;

    if (currentImages.length === 0) {
      grid.innerHTML = '<p class="text-muted" style="font-size: var(--fs-xs); grid-column: 1/-1;">No images added yet. Please add at least one vehicle photo.</p>';
      if (errElem) errElem.style.display = 'block';
      return;
    }

    if (errElem) errElem.style.display = 'none';

    grid.innerHTML = currentImages.map((url, idx) => `
      <div class="image-preview-card ${idx === 0 ? 'is-primary' : ''}">
        <img src="${url}" alt="Vehicle Photo ${idx + 1}" onerror="this.src='https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=400'">
        ${idx === 0 ? '<span class="badge-primary-img">Primary</span>' : ''}
        <button type="button" class="btn-remove-img" data-index="${idx}" title="Remove Image">&times;</button>
      </div>
    `).join('');

    grid.querySelectorAll('.btn-remove-img').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const index = parseInt(btn.getAttribute('data-index'), 10);
        if (!isNaN(index)) {
          currentImages.splice(index, 1);
          renderImagePreviews();
        }
      });
    });
  }

  function initImageManager() {
    const addBtn = document.getElementById('btn-add-image');
    const urlInput = document.getElementById('image-url-input');

    function addImageFromInput() {
      if (!urlInput) return;
      const url = urlInput.value.trim();
      if (!url) return;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (global.showToast) global.showToast('Please enter a valid HTTP/HTTPS image URL.', 'warning');
        return;
      }
      currentImages.push(url);
      urlInput.value = '';
      renderImagePreviews();
    }

    if (addBtn) {
      addBtn.addEventListener('click', addImageFromInput);
    }

    if (urlInput) {
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addImageFromInput();
        }
      });
    }

    // Quick demo buttons
    document.querySelectorAll('.btn-quick-img').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        if (url && !currentImages.includes(url)) {
          currentImages.push(url);
          renderImagePreviews();
        }
      });
    });

    renderImagePreviews();
  }

  function initFeatureTags() {
    const container = document.getElementById('feature-tags-container');
    if (!container) return;

    container.querySelectorAll('.feature-tag-checkbox').forEach(label => {
      const checkbox = label.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            label.classList.add('selected');
          } else {
            label.classList.remove('selected');
          }
        });
      }
    });
  }

  function initFormSubmit() {
    const form = document.getElementById('add-vehicle-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (currentImages.length === 0) {
        const errElem = document.getElementById('image-error');
        if (errElem) errElem.style.display = 'block';
        if (global.showToast) global.showToast('Please add at least one vehicle image.', 'warning');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-listing');
      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting Listing...';
        }

        // Collect form data
        const brand = document.getElementById('veh-brand').value.trim();
        const model = document.getElementById('veh-model').value.trim();
        const name = document.getElementById('veh-name').value.trim();
        const variant = document.getElementById('veh-variant').value.trim() || undefined;
        const category = document.getElementById('veh-category').value;
        const year = parseInt(document.getElementById('veh-year').value, 10);

        const transmission = document.getElementById('veh-transmission').value;
        const fuelType = document.getElementById('veh-fuel').value;
        const seats = parseInt(document.getElementById('veh-seats').value, 10);
        const doorsVal = document.getElementById('veh-doors').value;
        const doors = doorsVal !== '' ? parseInt(doorsVal, 10) : 0;
        const engineVal = document.getElementById('veh-engine').value;
        const engineCC = engineVal !== '' ? parseInt(engineVal, 10) : undefined;
        const mileage = document.getElementById('veh-mileage').value.trim() || undefined;

        const baseRate = parseFloat(document.getElementById('veh-rate').value);
        const deposit = parseFloat(document.getElementById('veh-deposit').value) || 0;

        const city = document.getElementById('veh-city').value.trim();
        const hubName = document.getElementById('veh-hub').value.trim();

        // Selected features
        const features = [];
        const featureCheckboxes = document.querySelectorAll('#feature-tags-container input[type="checkbox"]:checked');
        featureCheckboxes.forEach(cb => {
          if (cb.value) features.push(cb.value);
        });

        const description = document.getElementById('veh-description').value.trim() || undefined;

        const images = currentImages.map((url, idx) => ({
          url,
          isPrimary: idx === 0,
          sortOrder: idx
        }));

        const payload = {
          brand,
          model,
          name,
          variant,
          category,
          year,
          specifications: {
            seats,
            doors,
            transmission,
            fuelType,
            engineCC,
            mileage
          },
          rental: {
            baseRate,
            deposit,
            currency: 'INR'
          },
          location: {
            name: hubName,
            city
          },
          images,
          features,
          description
        };

        const res = await global.SkyBoltApi.post('/owner/vehicles', payload);

        if (res.success) {
          if (global.showToast) {
            global.showToast('Vehicle listed successfully! Status is PENDING_APPROVAL.', 'success');
          }
          setTimeout(() => {
            window.location.href = '/owner-dashboard';
          }, 1500);
        } else {
          const errMsg = (res.error && res.error.message) || 'Failed to submit vehicle listing.';
          if (global.showToast) global.showToast(errMsg, 'error');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Vehicle for Review';
          }
        }
      } catch (err) {
        console.error('Error submitting vehicle:', err);
        if (global.showToast) global.showToast('Network error while creating listing.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Vehicle for Review';
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    checkOwnerAuth();
    initImageManager();
    initFeatureTags();
    initFormSubmit();
  });

})(typeof window !== 'undefined' ? window : globalThis);
