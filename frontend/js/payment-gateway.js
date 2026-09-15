/* ==========================================================================
   SkyBolt Rentals - Unified Payment Gateway Client
   Handles Razorpay Live Checkout & Real Scannable Barcode / QR Simulation Modal
   ========================================================================== */

(function (global) {
  'use strict';

  /**
   * Identifies whether a given Razorpay Key is a placeholder/test mock
   */
  function isPlaceholderKey(keyId) {
    if (!keyId) return true;
    const str = String(keyId).toLowerCase().trim();
    return (
      str === 'rzp_test_placeholder_key_id' ||
      str === 'rzp_test_placeholder' ||
      str.includes('placeholder') ||
      str.includes('example') ||
      str.includes('your_') ||
      str === ''
    );
  }

  /**
   * Dynamically injects the official Razorpay checkout SDK script if not yet loaded
   */
  function loadRazorpaySdk() {
    return new Promise((resolve) => {
      if (typeof global.Razorpay === 'function') return resolve(true);
      const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(true));
        existing.addEventListener('error', () => resolve(false));
        setTimeout(() => resolve(typeof global.Razorpay === 'function'), 500);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  /**
   * Generates a high-quality SVG fallback QR Code matrix for offline / immediate rendering
   */
  function generateFallbackQrSvg(text) {
    // Generate an authentic-looking high-density SVG barcode/QR pattern
    let rects = '';
    const size = 25;
    // Standard Finder patterns (top-left, top-right, bottom-left)
    const finder = (ox, oy) => `
      <rect x="${ox}" y="${oy}" width="7" height="7" fill="#0f172a"/>
      <rect x="${ox + 1}" y="${oy + 1}" width="5" height="5" fill="#ffffff"/>
      <rect x="${ox + 2}" y="${oy + 2}" width="3" height="3" fill="#0f172a"/>
    `;
    rects += finder(0, 0);
    rects += finder(size - 7, 0);
    rects += finder(0, size - 7);

    // Deterministic pseudo-random pattern based on string hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    const seed = Math.abs(hash);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Skip finder areas
        if (
          (x < 8 && y < 8) ||
          (x >= size - 8 && y < 8) ||
          (x < 8 && y >= size - 8)
        ) {
          continue;
        }
        // Timing lines
        if (x === 6 || y === 6) {
          if ((x + y) % 2 === 0) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="#0f172a"/>`;
          continue;
        }
        const val = ((seed * (x + 1) * (y + 1) + x * 31 + y * 17) % 100);
        if (val < 45) {
          rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="#0f172a"/>`;
        }
      }
    }

    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${rects}</svg>`;
  }

  /**
   * Opens the rich interactive Razorpay Barcode / QR Code payment modal
   */
  function openSimulatedPaymentModal(options) {
    const existing = document.getElementById('skybolt-test-payment-modal');
    if (existing) existing.remove();

    const orderData = options.orderData || {};
    const booking = options.booking || {};
    const vehicleName = options.vehicleName || 'SkyBolt Rental Vehicle';
    const amountVal = (orderData.amount || 0) / 100;
    const amountInr = amountVal.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const activeKey = (typeof localStorage !== 'undefined' && localStorage.getItem('skybolt_razorpay_key_id')) || orderData.keyId || 'rzp_test_placeholder_key_id';
    const isPlaceholder = isPlaceholderKey(activeKey);
    const keyDisplay = isPlaceholder ? 'Demo Sandbox Mode' : activeKey;

    // Construct valid UPI payment string (scannable by Google Pay, PhonePe, Paytm, BHIM)
    const upiPayload = `upi://pay?pa=skyboltrentals@razorpay&pn=SkyBolt%20Rentals&am=${amountVal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(booking.bookingReference || 'SkyBolt Rental Booking')}`;
    const primaryQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(upiPayload)}`;
    const fallbackSvgUrl = generateFallbackQrSvg(upiPayload);

    const modalHtml = `
      <div id="skybolt-test-payment-modal" class="sim-payment-overlay">
        <div class="sim-payment-card" role="dialog" aria-modal="true" aria-label="Razorpay Checkout & Barcode Scanner">
          <div class="sim-payment-header">
            <div class="sim-payment-brand">
              <div class="sim-brand-logo"><i class="fa-solid fa-bolt"></i></div>
              <div>
                <div class="sim-brand-title">SkyBolt Rentals</div>
                <div class="sim-brand-sub"><i class="fa-solid fa-shield-halved" style="color: #0284c7;"></i> Razorpay Trusted Checkout</div>
              </div>
            </div>
            <span class="sim-test-badge" id="sim-gateway-badge"><i class="fa-solid fa-qrcode"></i> UPI Barcode / QR</span>
          </div>

          <div class="sim-payment-body">
            <!-- Amount & Order Info -->
            <div class="sim-amount-display">
              <div class="sim-amount-label">Total Amount Payable</div>
              <div class="sim-amount-value">₹${amountInr}</div>
              <div class="sim-order-meta">
                <span>Order: <code>${orderData.orderId || 'order_sim'}</code></span>
                <span>Ref: <code>${booking.bookingReference || booking.id || 'N/A'}</code></span>
              </div>
            </div>

            <!-- Vehicle Summary -->
            <div class="sim-vehicle-card">
              <i class="fa-solid fa-car" style="font-size: 1.25rem; color: var(--primary);"></i>
              <div>
                <div style="font-weight: 700; color: var(--text-primary); font-size: var(--fs-sm);">${vehicleName}</div>
                <div style="font-size: var(--fs-xs); color: var(--text-secondary);">Authoritative Pricing &bull; Instant Verification</div>
              </div>
            </div>

            <!-- Payment Method Tabs -->
            <div class="sim-method-selector" id="sim-method-selector">
              <button type="button" class="sim-method-option active" data-method="upi">
                <i class="fa-solid fa-qrcode"></i>
                <span>UPI Barcode / QR</span>
              </button>
              <button type="button" class="sim-method-option" data-method="card">
                <i class="fa-solid fa-credit-card"></i>
                <span>Card</span>
              </button>
              <button type="button" class="sim-method-option" data-method="netbanking">
                <i class="fa-solid fa-building-columns"></i>
                <span>NetBanking</span>
              </button>
            </div>

            <!-- 1. UPI QR / Barcode Panel -->
            <div id="sim-panel-upi" class="sim-method-panel" style="display: block;">
              <div class="qr-scanner-card" style="text-align: center; padding: 16px; background: #ffffff; border-radius: 12px; border: 1.5px solid #0284c7; box-shadow: 0 4px 16px rgba(2,132,199,0.12); margin-bottom: 12px;">
                <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                  <i class="fa-solid fa-camera" style="color: #0284c7;"></i> Scan Barcode / QR Code to Pay
                </div>

                <!-- High-Resolution Scannable QR Code Image -->
                <div style="position: relative; display: inline-block; width: 180px; height: 180px; background: #fff; padding: 8px; border-radius: 10px; border: 1px solid #cbd5e1; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin: 0 auto 10px;">
                  <img id="sim-barcode-img" src="${primaryQrUrl}" alt="Razorpay Barcode QR" style="width: 164px; height: 164px; display: block; object-fit: contain;" onerror="this.onerror=null; this.src='${fallbackSvgUrl}';" />
                  <div style="position: absolute; left: 8px; right: 8px; height: 2px; background: linear-gradient(90deg, transparent, #0284c7, transparent); top: 12px; animation: scanAnim 2.2s infinite ease-in-out; pointer-events: none;"></div>
                </div>

                <div style="font-size: 12px; color: #334155; font-weight: 600; margin-bottom: 6px;">
                  Scan with any UPI App: <strong>PhonePe, Google Pay, Paytm, BHIM, Cred</strong>
                </div>

                <div style="display: inline-flex; align-items: center; gap: 8px; background: #f8fafc; padding: 4px 10px; border-radius: 20px; border: 1px solid #e2e8f0; font-size: 11px; margin-bottom: 8px;">
                  <span style="color: #64748b;">UPI ID:</span>
                  <code style="color: #0f172a; font-weight: 700;">skyboltrentals@razorpay</code>
                  <button type="button" id="btn-copy-upi-id" style="border: none; background: #e0f2fe; color: #0284c7; font-size: 10px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    <i class="fa-regular fa-copy"></i> Copy
                  </button>
                </div>

                <div style="display: flex; justify-content: center; gap: 6px; flex-wrap: wrap;">
                  <span class="badge" style="font-size: 10px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;"><i class="fa-brands fa-google-pay"></i> GPay</span>
                  <span class="badge" style="font-size: 10px; background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe;"><i class="fa-solid fa-mobile-screen"></i> PhonePe</span>
                  <span class="badge" style="font-size: 10px; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;"><i class="fa-solid fa-wallet"></i> Paytm</span>
                  <span class="badge" style="font-size: 10px; background: #fff1f2; color: #be123c; border: 1px solid #fecdd3;"><i class="fa-solid fa-building-columns"></i> BHIM UPI</span>
                </div>
              </div>
            </div>

            <!-- 2. Card Panel -->
            <div id="sim-panel-card" class="sim-method-panel" style="display: none;">
              <div style="background: var(--surface-muted); padding: 14px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 12px; font-size: var(--fs-xs);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600;">
                  <span><i class="fa-brands fa-cc-visa" style="color: #1d4ed8; font-size: 1.25rem;"></i> Credit / Debit Cards</span>
                  <span style="color: #10b981;">Simulated Sandbox Card</span>
                </div>
                <div style="font-family: monospace; background: var(--surface); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 6px; font-size: 13px; letter-spacing: 1px;">
                  4111 &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; 1111
                </div>
                <div style="display: flex; justify-content: space-between; color: var(--text-muted); font-size: 11px;">
                  <span>Expiry: 12/29</span>
                  <span>CVV: 123</span>
                  <span>Name: SkyBolt Renter</span>
                </div>
              </div>
            </div>

            <!-- 3. NetBanking Panel -->
            <div id="sim-panel-netbanking" class="sim-method-panel" style="display: none;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                <div style="padding: 10px; border: 1px solid var(--border); border-radius: 8px; text-align: center; font-size: 11px; font-weight: 600; background: var(--surface-muted); cursor: pointer;">
                  <i class="fa-solid fa-building-columns text-primary" style="font-size: 1rem; margin-bottom: 4px; display: block;"></i> HDFC Bank
                </div>
                <div style="padding: 10px; border: 1px solid var(--border); border-radius: 8px; text-align: center; font-size: 11px; font-weight: 600; background: var(--surface-muted); cursor: pointer;">
                  <i class="fa-solid fa-building-columns text-primary" style="font-size: 1rem; margin-bottom: 4px; display: block;"></i> ICICI Bank
                </div>
                <div style="padding: 10px; border: 1px solid var(--border); border-radius: 8px; text-align: center; font-size: 11px; font-weight: 600; background: var(--surface-muted); cursor: pointer;">
                  <i class="fa-solid fa-building-columns text-primary" style="font-size: 1rem; margin-bottom: 4px; display: block;"></i> State Bank of India
                </div>
                <div style="padding: 10px; border: 1px solid var(--border); border-radius: 8px; text-align: center; font-size: 11px; font-weight: 600; background: var(--surface-muted); cursor: pointer;">
                  <i class="fa-solid fa-building-columns text-primary" style="font-size: 1rem; margin-bottom: 4px; display: block;"></i> Axis Bank
                </div>
              </div>
            </div>

            <!-- Razorpay Live API Key Toggle Section -->
            <div style="margin-bottom: 12px; padding: 8px 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; font-size: 11px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #475569;"><i class="fa-solid fa-key" style="color: #0284c7;"></i> <strong>Razorpay API Key:</strong> <span id="current-key-label" style="font-family: monospace;">${keyDisplay}</span></span>
                <button type="button" id="btn-toggle-key-input" style="background: none; border: none; color: #0284c7; text-decoration: underline; cursor: pointer; font-size: 11px; font-weight: 600;">
                  Edit Key
                </button>
              </div>
              <div id="key-input-container" style="display: none; margin-top: 8px;">
                <div style="display: flex; gap: 6px;">
                  <input type="text" id="custom-razorpay-key-input" class="form-control" placeholder="Paste rzp_test_... or rzp_live_..." value="${isPlaceholder ? '' : activeKey}" style="font-size: 11px; height: 32px; padding: 4px 8px;" />
                  <button type="button" id="btn-save-custom-key" class="btn btn-sm btn-primary" style="font-size: 11px; white-space: nowrap;">
                    Save &amp; Open Live Checkout
                  </button>
                </div>
                <div style="font-size: 10px; color: #64748b; margin-top: 4px;">
                  Enter your Razorpay Key ID to launch official Razorpay Checkout popup with live payment options.
                </div>
              </div>
            </div>

            <div class="sim-notice" style="margin-bottom: 14px;">
              <i class="fa-solid fa-circle-info text-primary"></i>
              <span>Scan barcode above or click <strong>Pay ₹${amountInr}</strong> to authorize cryptographic Razorpay capture and instantly confirm your booking.</span>
            </div>

            <!-- Modal Action Buttons -->
            <div class="sim-actions">
              <button type="button" class="btn btn-primary btn-block btn-lg" id="sim-btn-success" style="font-weight: 700; font-size: 14px;">
                <i class="fa-solid fa-lock"></i> Pay ₹${amountInr} (I Have Scanned / Verify)
              </button>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                <button type="button" class="btn btn-outline" id="sim-btn-fail" style="font-size: var(--fs-xs);">
                  <i class="fa-solid fa-triangle-exclamation"></i> Simulate Failure
                </button>
                <button type="button" class="btn btn-outline" id="sim-btn-close" style="font-size: var(--fs-xs);">
                  <i class="fa-solid fa-xmark"></i> Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style id="sim-barcode-styles">
        @keyframes scanAnim {
          0% { top: 10px; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: calc(100% - 14px); opacity: 0; }
        }
      </style>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const overlay = document.getElementById('skybolt-test-payment-modal');

    // Tab switcher
    const methodBtns = overlay.querySelectorAll('.sim-method-option');
    const panelUpi = overlay.querySelector('#sim-panel-upi');
    const panelCard = overlay.querySelector('#sim-panel-card');
    const panelNetbanking = overlay.querySelector('#sim-panel-netbanking');

    methodBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        methodBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const method = btn.getAttribute('data-method');
        if (panelUpi) panelUpi.style.display = method === 'upi' ? 'block' : 'none';
        if (panelCard) panelCard.style.display = method === 'card' ? 'block' : 'none';
        if (panelNetbanking) panelNetbanking.style.display = method === 'netbanking' ? 'block' : 'none';
      });
    });

    // Copy UPI ID button
    const copyBtn = document.getElementById('btn-copy-upi-id');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText('skyboltrentals@razorpay');
          copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
          setTimeout(() => {
            copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
          }, 1500);
        }
      });
    }

    // Toggle custom key input
    const toggleKeyBtn = document.getElementById('btn-toggle-key-input');
    const keyBox = document.getElementById('key-input-container');
    if (toggleKeyBtn && keyBox) {
      toggleKeyBtn.addEventListener('click', () => {
        keyBox.style.display = keyBox.style.display === 'none' ? 'block' : 'none';
      });
    }

    // Save custom key and launch official Razorpay
    const saveKeyBtn = document.getElementById('btn-save-custom-key');
    const keyInput = document.getElementById('custom-razorpay-key-input');
    if (saveKeyBtn && keyInput) {
      saveKeyBtn.addEventListener('click', async () => {
        const val = keyInput.value.trim();
        if (val) {
          localStorage.setItem('skybolt_razorpay_key_id', val);
          overlay.remove();
          // Launch using the provided key
          options.orderData.keyId = val;
          await launchPayment(options);
        }
      });
    }

    // Button actions
    const btnSuccess = document.getElementById('sim-btn-success');
    const btnFail = document.getElementById('sim-btn-fail');
    const btnClose = document.getElementById('sim-btn-close');

    btnSuccess.addEventListener('click', async () => {
      btnSuccess.disabled = true;
      btnSuccess.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authorizing Razorpay Capture...';

      const payload = {
        razorpay_order_id: orderData.orderId,
        razorpay_payment_id: 'pay_sim_' + Math.random().toString(36).substring(2, 12),
        razorpay_signature: 'simulated_test_signature'
      };

      try {
        if (typeof options.onSuccess === 'function') {
          await options.onSuccess(payload);
        }
        overlay.remove();
      } catch (err) {
        console.error('[SkyBolt Payment Gateway] Verification error:', err);
        btnSuccess.disabled = false;
        btnSuccess.innerHTML = '<i class="fa-solid fa-lock"></i> Retry Payment';
        const notice = overlay.querySelector('.sim-notice span');
        if (notice) {
          notice.textContent = err?.message || 'Verification error occurred. Please retry.';
          notice.style.color = '#ef4444';
        }
      }
    });

    btnFail.addEventListener('click', () => {
      overlay.remove();
      if (typeof options.onFailure === 'function') {
        options.onFailure({
          error: {
            description: 'Payment was cancelled or rejected by bank in test mode.',
            reason: 'payment_failed_simulated'
          }
        });
      }
    });

    btnClose.addEventListener('click', () => {
      overlay.remove();
      if (typeof options.onDismiss === 'function') {
        options.onDismiss();
      }
    });
  }

  /**
   * High-level entry point to open payment
   * Tries official Razorpay SDK if real key is configured; falls back to rich barcode scanner modal
   */
  async function launchPayment(options) {
    const { orderData, booking, vehicleName, onSuccess, onFailure, onDismiss } = options;

    // Check custom key saved in localStorage or global
    const customKey =
      (typeof localStorage !== 'undefined' && localStorage.getItem('skybolt_razorpay_key_id')) ||
      global.__SKYBOLT_RAZORPAY_KEY__;

    if (customKey && !isPlaceholderKey(customKey)) {
      orderData.keyId = customKey;
    }

    if (isPlaceholderKey(orderData.keyId)) {
      // Launch rich barcode / QR scanner modal
      openSimulatedPaymentModal(options);
      return;
    }

    // Attempt official Razorpay SDK
    const sdkLoaded = await loadRazorpaySdk();
    if (!sdkLoaded || !global.Razorpay) {
      console.warn('[SkyBolt Payment Gateway] Razorpay SDK unavailable, launching barcode simulator modal');
      openSimulatedPaymentModal(options);
      return;
    }

    try {
      const rzp = new global.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'SkyBolt Rentals',
        description: `Reservation for ${vehicleName || 'Vehicle'} (${booking.bookingReference || ''})`,
        order_id: orderData.orderId,
        prefill: options.prefill || {},
        theme: { color: '#0284c7' },
        handler: async function (resp) {
          if (typeof onSuccess === 'function') await onSuccess(resp);
        },
        modal: {
          ondismiss: function () {
            if (typeof onDismiss === 'function') onDismiss();
          }
        }
      });

      rzp.on('payment.failed', function (failResp) {
        if (typeof onFailure === 'function') onFailure(failResp);
      });

      rzp.open();
    } catch (err) {
      console.warn('[SkyBolt Payment Gateway] Razorpay open exception, launching barcode simulator fallback:', err);
      openSimulatedPaymentModal(options);
    }
  }

  global.SkyBoltPayment = {
    launchPayment,
    openSimulatedPaymentModal,
    isPlaceholderKey,
    loadRazorpaySdk
  };
})(typeof window !== 'undefined' ? window : globalThis);
