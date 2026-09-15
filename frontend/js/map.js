/**
 * SkyBolt Rentals - Interactive Google Maps & Hub Locator Controller
 */

(function () {
  'use strict';

  const HUBS_DATA = {
    bangalore: {
      id: 'bangalore',
      code: 'Bangalore',
      name: 'Bangalore Tech Hub',
      city: 'Bangalore, Karnataka',
      address: 'Electronic City Phase 1, Hosur Road, Bangalore 560100',
      mapQuery: 'Electronic City Phase 1 Hosur Road Bangalore',
      lat: 12.8452,
      lng: 77.6602,
      phone: '+91 98800 11223',
      hours: 'Open 24/7 (All 365 Days)',
      statusText: 'Operational 24/7',
      amenities: [
        'EV Supercharging (120kW)',
        '3-Min Express Handoff',
        '24/7 Key Drop Locker',
        'Pre-Trip Inspection Bay',
        'Customer Lounge & Wi-Fi'
      ]
    },
    delhi: {
      id: 'delhi',
      code: 'Delhi',
      name: 'Delhi Aerocity Logistics Hub',
      city: 'Delhi NCR',
      address: 'Asset 8, Hospitality District, IGI Airport, Delhi 110037',
      mapQuery: 'Asset 8 Hospitality District IGI Airport Delhi',
      lat: 28.5494,
      lng: 77.1215,
      phone: '+91 99112 23344',
      hours: 'Open 24/7 (Terminal Handoff Available)',
      statusText: 'Airport Express 24/7',
      amenities: [
        'Airport Shuttle Delivery',
        'Covered Secure Parking',
        'Long-Term Fleet Bay',
        'EV Rapid Charging',
        'Express Identity Verification'
      ]
    },
    ludhiana: {
      id: 'ludhiana',
      code: 'Ludhiana',
      name: 'Ludhiana Central Hub',
      city: 'Ludhiana, Punjab',
      address: 'Plot 45, Industrial Focal Point, Phase 5, Ludhiana 141010',
      mapQuery: 'Industrial Focal Point Phase 5 Ludhiana',
      lat: 30.901,
      lng: 75.8573,
      phone: '+91 98765 43210',
      hours: '07:00 AM – 11:00 PM Daily',
      statusText: 'Open Today 07:00 - 23:00',
      amenities: [
        'Heavy Motorcycle Bay',
        'Pre-Departure Sanitization',
        'Commercial Fleet Station',
        'Direct Highway Access'
      ]
    },
    newyork: {
      id: 'newyork',
      code: 'New York',
      name: 'New York Central Depot',
      city: 'New York, USA',
      address: '520 West 43rd Street, New York, NY 10036',
      mapQuery: '520 West 43rd Street New York NY',
      lat: 40.7605,
      lng: -73.9965,
      phone: '+1 212 555 0199',
      hours: 'Open 24/7 (Manhattan Downtown)',
      statusText: 'Operational 24/7',
      amenities: [
        'Covered Multi-Level Garage',
        'E-Scooter Battery Swap',
        'Digital Keyless Unlock',
        'VIP Concierge Desk'
      ]
    }
  };

  let activeHubId = 'bangalore';

  function getEmbedUrl(query) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
  }

  function getDirectionsUrl(lat, lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  function getOpenMapUrl(query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function renderActiveHub(hubId) {
    const hub = HUBS_DATA[hubId];
    if (!hub) return;

    activeHubId = hubId;

    // 1. Update Tab Buttons
    const tabButtons = document.querySelectorAll('.hub-tab-btn');
    tabButtons.forEach(btn => {
      if (btn.getAttribute('data-hub') === hubId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 2. Update Hub Information Elements
    const titleEl = document.getElementById('hub-info-title');
    const cityEl = document.getElementById('hub-info-city');
    const statusEl = document.getElementById('hub-info-status');
    const addressEl = document.getElementById('hub-info-address');
    const hoursEl = document.getElementById('hub-info-hours');
    const phoneEl = document.getElementById('hub-info-phone');
    const amenitiesEl = document.getElementById('hub-info-amenities');
    const directionsBtn = document.getElementById('hub-directions-btn');
    const bookBtn = document.getElementById('hub-book-btn');
    const mapIndicatorEl = document.getElementById('hub-map-indicator-text');
    const mapOpenLink = document.getElementById('hub-map-open-link');
    const mapIframe = document.getElementById('hub-map-iframe');

    if (titleEl) titleEl.textContent = hub.name;
    if (cityEl) cityEl.textContent = hub.city;
    if (statusEl) {
      statusEl.innerHTML = `<span class="status-pulse"></span> ${hub.statusText}`;
    }
    if (addressEl) addressEl.textContent = hub.address;
    if (hoursEl) hoursEl.textContent = hub.hours;
    if (phoneEl) {
      phoneEl.textContent = hub.phone;
      phoneEl.setAttribute('href', `tel:${hub.phone.replace(/[^0-9+]/g, '')}`);
    }

    // Amenities List
    if (amenitiesEl) {
      amenitiesEl.innerHTML = hub.amenities
        .map(a => `<span class="hub-amenity-tag"><i class="fa-solid fa-check text-primary"></i> ${a}</span>`)
        .join('');
    }

    // Directions & Links
    const directionsUrl = getDirectionsUrl(hub.lat, hub.lng);
    const openMapUrl = getOpenMapUrl(hub.mapQuery);

    if (directionsBtn) directionsBtn.setAttribute('href', directionsUrl);
    if (bookBtn) bookBtn.setAttribute('href', `/booking?location=${encodeURIComponent(hub.code)}`);
    if (mapIndicatorEl) mapIndicatorEl.textContent = `${hub.name} (${hub.city})`;
    if (mapOpenLink) mapOpenLink.setAttribute('href', openMapUrl);

    // Update iframe smoothly
    if (mapIframe) {
      const nextSrc = getEmbedUrl(hub.mapQuery);
      if (mapIframe.getAttribute('src') !== nextSrc) {
        mapIframe.setAttribute('src', nextSrc);
      }
    }
  }

  function initMapEvents() {
    // Hub Tab buttons
    const tabButtons = document.querySelectorAll('.hub-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const hubId = btn.getAttribute('data-hub');
        if (hubId && HUBS_DATA[hubId]) {
          renderActiveHub(hubId);
        }
      });
    });

    // Copy address button
    const copyBtn = document.getElementById('hub-copy-address-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const hub = HUBS_DATA[activeHubId];
        if (!hub) return;

        try {
          await navigator.clipboard.writeText(hub.address);
          if (typeof window.showToast === 'function') {
            window.showToast('Address copied to clipboard!', 'success');
          } else {
            const orig = copyBtn.innerHTML;
            copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
            setTimeout(() => { copyBtn.innerHTML = orig; }, 2000);
          }
        } catch (err) {
          console.warn('Clipboard write failed:', err);
        }
      });
    }

    // Initial render
    renderActiveHub('bangalore');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMapEvents);
  } else {
    initMapEvents();
  }

  // Expose for external access if needed
  window.SkyBoltHubs = {
    data: HUBS_DATA,
    selectHub: renderActiveHub,
    getDirectionsUrl,
    getEmbedUrl
  };
})();
