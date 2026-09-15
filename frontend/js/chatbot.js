/* ==========================================================================
   SkyBolt Rentals - Production AI Chatbot Client Component
   Provides seamless, secure conversational rental assistance across all pages.
   ========================================================================== */

(function(global) {
  'use strict';

  class SkyBoltChatbotWidget {
    constructor() {
      this.isOpen = false;
      this.isLoading = false;
      this.conversationId = null;
      this.sessionId = null;
      this.messages = [];
      this.apiBaseUrl = this._resolveApiBaseUrl();

      this._initStorage();
      this._injectStylesheet();
      this._mountUI();
      this._bindEvents();
      this._loadInitialState();
    }

    _resolveApiBaseUrl() {
      if (global.SkyBoltConfig && global.SkyBoltConfig.apiBaseUrl) {
        return global.SkyBoltConfig.apiBaseUrl;
      }
      if (typeof location !== 'undefined') {
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (isLocal) return 'http://localhost:5001/api/v1';
        return 'https://skybolt-rentals-backend.onrender.com/api/v1';
      }
      return 'https://skybolt-rentals-backend.onrender.com/api/v1';
    }

    _initStorage() {
      try {
        this.sessionId = sessionStorage.getItem('skybolt_chat_session_id');
        if (!this.sessionId) {
          this.sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
          sessionStorage.setItem('skybolt_chat_session_id', this.sessionId);
        }

        this.conversationId = sessionStorage.getItem('skybolt_chat_conv_id') || null;
      } catch (e) {
        this.sessionId = 'sess_' + Date.now().toString(36);
      }
    }

    _injectStylesheet() {
      if (document.querySelector('link[href*="chatbot.css"]')) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/chatbot.css';
      document.head.appendChild(link);
    }

    _mountUI() {
      // 1. Mount Floating Action Button
      if (!document.getElementById('skybolt-chat-fab')) {
        const fab = document.createElement('button');
        fab.id = 'skybolt-chat-fab';
        fab.className = 'skybolt-chat-fab';
        fab.setAttribute('aria-label', 'Open SkyBolt AI Assistant');
        fab.innerHTML = `
          <div class="skybolt-chat-badge" id="skybolt-chat-badge"></div>
          <i class="fa-solid fa-bolt-lightning fab-icon-open"></i>
          <i class="fa-solid fa-xmark fab-icon-close"></i>
          <div class="skybolt-chat-tooltip">
            <i class="fa-solid fa-sparkles"></i> Ask SkyBolt AI
          </div>
        `;
        document.body.appendChild(fab);
      }

      // 2. Mount Chat Window
      if (!document.getElementById('skybolt-chat-window')) {
        const windowEl = document.createElement('div');
        windowEl.id = 'skybolt-chat-window';
        windowEl.className = 'skybolt-chat-window';
        windowEl.setAttribute('role', 'dialog');
        windowEl.setAttribute('aria-label', 'SkyBolt AI Assistant Dialog');
        windowEl.innerHTML = `
          <!-- Header -->
          <div class="skybolt-chat-header">
            <div class="skybolt-chat-header-brand">
              <div class="skybolt-chat-avatar">
                <i class="fa-solid fa-bolt"></i>
                <div class="skybolt-chat-status-dot"></div>
              </div>
              <div>
                <h3 class="skybolt-chat-header-title">
                  SkyBolt AI <span class="skybolt-chat-badge-ai">PROD</span>
                </h3>
                <p class="skybolt-chat-header-subtitle">
                  <i class="fa-solid fa-shield-halved" style="color: #10B981;"></i> Authoritative Rental Concierge
                </p>
              </div>
            </div>
            <div class="skybolt-chat-header-actions">
              <button class="skybolt-chat-action-btn" id="skybolt-chat-clear-btn" title="Reset Conversation">
                <i class="fa-solid fa-rotate-right"></i>
              </button>
              <button class="skybolt-chat-action-btn" id="skybolt-chat-close-btn" title="Close Assistant">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          <!-- Body / Messages -->
          <div class="skybolt-chat-body" id="skybolt-chat-body">
            <!-- Messages rendered here dynamically -->
          </div>

          <!-- Footer / Input -->
          <div class="skybolt-chat-footer">
            <div class="skybolt-input-wrap">
              <textarea
                id="skybolt-chat-input"
                class="skybolt-chat-input"
                rows="1"
                placeholder="Ask about car rentals, prices, coupons, hubs..."
                maxlength="2000"
              ></textarea>
              <button
                id="skybolt-chat-send-btn"
                class="skybolt-chat-send-btn"
                aria-label="Send message"
                disabled
              >
                <i class="fa-solid fa-paper-plane"></i>
              </button>
            </div>
            <p class="skybolt-chat-disclaimer">
              <i class="fa-solid fa-lock" style="font-size: 9px;"></i>
              Authoritative rates verified directly via SkyBolt Pricing Engine
            </p>
          </div>
        `;
        document.body.appendChild(windowEl);
      }
    }

    _bindEvents() {
      const fab = document.getElementById('skybolt-chat-fab');
      const closeBtn = document.getElementById('skybolt-chat-close-btn');
      const clearBtn = document.getElementById('skybolt-chat-clear-btn');
      const sendBtn = document.getElementById('skybolt-chat-send-btn');
      const input = document.getElementById('skybolt-chat-input');

      if (fab) {
        fab.addEventListener('click', () => this.toggleWindow());
      }

      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeWindow());
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', () => this.resetConversation());
      }

      if (input) {
        input.addEventListener('input', () => {
          this._autoResizeInput(input);
          const hasText = input.value.trim().length > 0;
          if (sendBtn) sendBtn.disabled = !hasText || this.isLoading;
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.value.trim().length > 0 && !this.isLoading) {
              this.sendMessage(input.value.trim());
            }
          }
        });
      }

      if (sendBtn) {
        sendBtn.addEventListener('click', () => {
          if (input && input.value.trim().length > 0 && !this.isLoading) {
            this.sendMessage(input.value.trim());
          }
        });
      }
    }

    _autoResizeInput(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 90) + 'px';
    }

    toggleWindow() {
      if (this.isOpen) {
        this.closeWindow();
      } else {
        this.openWindow();
      }
    }

    openWindow() {
      const windowEl = document.getElementById('skybolt-chat-window');
      const fab = document.getElementById('skybolt-chat-fab');
      const input = document.getElementById('skybolt-chat-input');

      if (windowEl) windowEl.classList.add('open');
      if (fab) fab.classList.add('active');
      this.isOpen = true;

      // Hide unread badge
      const badge = document.getElementById('skybolt-chat-badge');
      if (badge) badge.style.display = 'none';

      this._scrollToBottom();
      if (input && window.innerWidth > 640) {
        setTimeout(() => input.focus(), 250);
      }
    }

    closeWindow() {
      const windowEl = document.getElementById('skybolt-chat-window');
      const fab = document.getElementById('skybolt-chat-fab');
      if (windowEl) windowEl.classList.remove('open');
      if (fab) fab.classList.remove('active');
      this.isOpen = false;
    }

    async _loadInitialState() {
      if (this.conversationId) {
        try {
          const res = await this._fetchApi(`/chat/history/${this.conversationId}`, { method: 'GET' });
          if (res.success && Array.isArray(res.messages) && res.messages.length > 0) {
            this._renderHistory(res.messages);
            return;
          }
        } catch (e) {
          // fallback to fresh greeting
        }
      }

      this._renderDefaultGreeting();
    }

    _renderDefaultGreeting() {
      const body = document.getElementById('skybolt-chat-body');
      if (!body) return;
      body.innerHTML = '';

      const greetingHtml = `
        <div class="skybolt-msg-row bot">
          <div class="skybolt-msg-avatar"><i class="fa-solid fa-bolt"></i></div>
          <div class="skybolt-msg-content">
            <div class="skybolt-msg-bubble">
              <p>👋 Hello! I am <strong>SkyBolt AI</strong>, your personal vehicle rental assistant.</p>
              <p>I can help you find the perfect car or bike, calculate exact rental quotes with coupons, check hub availability, or track an existing reservation.</p>
            </div>
            <div class="skybolt-suggestions-wrap">
              <span class="skybolt-suggestions-label">Quick Suggestions</span>
              <div class="skybolt-chips-list">
                <button class="skybolt-chip-btn" data-query="Recommend a premium SUV for a road trip">
                  🚙 Find an SUV
                </button>
                <button class="skybolt-chip-btn" data-query="Show me electric vehicles for rent">
                  ⚡ Rent Electric (EV)
                </button>
                <button class="skybolt-chip-btn" data-query="How much does it cost to rent a car for 3 days?">
                  💰 Get Rental Quote
                </button>
                <button class="skybolt-chip-btn" data-query="What active coupon discount codes are available?">
                  🎟️ View Coupons
                </button>
                <button class="skybolt-chip-btn" data-query="Where are your pickup and return locations?">
                  📍 Rental Hubs
                </button>
              </div>
            </div>
            <span class="skybolt-msg-time">Just now</span>
          </div>
        </div>
      `;

      body.innerHTML = greetingHtml;
      this._bindChipClicks(body);
    }

    _bindChipClicks(container) {
      container.querySelectorAll('.skybolt-chip-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const query = btn.getAttribute('data-query');
          if (query && !this.isLoading) {
            this.sendMessage(query);
          }
        });
      });
    }

    _renderHistory(messages) {
      const body = document.getElementById('skybolt-chat-body');
      if (!body) return;
      body.innerHTML = '';

      messages.forEach((msg) => {
        if (msg.role === 'user') {
          this._appendUserMessage(msg.content, false);
        } else if (msg.role === 'assistant') {
          this._appendBotMessage({ message: msg.content }, false);
        }
      });

      this._scrollToBottom();
    }

    async sendMessage(text) {
      if (!text || this.isLoading) return;

      const input = document.getElementById('skybolt-chat-input');
      const sendBtn = document.getElementById('skybolt-chat-send-btn');
      if (input) {
        input.value = '';
        this._autoResizeInput(input);
      }
      if (sendBtn) sendBtn.disabled = true;

      // 1. Render user message in UI
      this._appendUserMessage(text, true);

      // 2. Show typing indicator
      this._showTypingIndicator();
      this.isLoading = true;

      try {
        const payload = {
          message: text,
          conversationId: this.conversationId || undefined
        };

        const response = await this._fetchApi('/chat', {
          method: 'POST',
          body: payload
        });

        this._hideTypingIndicator();
        this.isLoading = false;

        if (response.success) {
          if (response.conversationId) {
            this.conversationId = response.conversationId;
            try {
              sessionStorage.setItem('skybolt_chat_conv_id', response.conversationId);
            } catch (e) {}
          }

          this._appendBotMessage(response, true);
        } else {
          const errMsg = response.error?.message || 'Sorry, I encountered an issue processing your request. Please try again.';
          this._appendBotMessage({ message: `⚠️ ${errMsg}` }, true);
        }
      } catch (err) {
        this._hideTypingIndicator();
        this.isLoading = false;
        this._appendBotMessage({
          message: '⚠️ Network error: Unable to reach SkyBolt servers. Please check your internet connection.'
        }, true);
      }
    }

    _appendUserMessage(text, scroll = true) {
      const body = document.getElementById('skybolt-chat-body');
      if (!body) return;

      const safeText = this._escapeHtml(text);
      const time = this._formatTime(new Date());

      const row = document.createElement('div');
      row.className = 'skybolt-msg-row user';
      row.innerHTML = `
        <div class="skybolt-msg-content">
          <div class="skybolt-msg-bubble">${safeText}</div>
          <span class="skybolt-msg-time">${time}</span>
        </div>
      `;

      body.appendChild(row);
      if (scroll) this._scrollToBottom();
    }

    _appendBotMessage(data, scroll = true) {
      const body = document.getElementById('skybolt-chat-body');
      if (!body) return;

      const formattedText = this._renderMarkdown(data.message || '');
      const time = this._formatTime(new Date());

      const row = document.createElement('div');
      row.className = 'skybolt-msg-row bot';

      let innerContent = `
        <div class="skybolt-msg-avatar"><i class="fa-solid fa-bolt"></i></div>
        <div class="skybolt-msg-content">
          <div class="skybolt-msg-bubble">${formattedText}</div>
      `;

      // 1. Rich Vehicles Card rendering
      if (data.data && data.data.type === 'vehicles' && Array.isArray(data.data.vehicles)) {
        innerContent += this._renderVehicleCards(data.data.vehicles);
      }

      // 2. Rich Quote Card rendering
      if (data.data && data.data.type === 'quote' && data.data.quote) {
        innerContent += this._renderQuoteCard(data.data.quote);
      }

      // 3. Confirmation Action Buttons
      if (data.requiresConfirmation) {
        innerContent += `
          <div class="skybolt-confirm-actions">
            <button class="skybolt-btn-confirm" id="skybolt-btn-confirm-action">
              <i class="fa-solid fa-check"></i> Confirm Reservation
            </button>
            <button class="skybolt-btn-cancel" id="skybolt-btn-cancel-action">
              <i class="fa-solid fa-xmark"></i> Cancel
            </button>
          </div>
        `;
      }

      // 4. Quick Suggestion Chips if provided
      if (data.data && Array.isArray(data.data.suggestions) && data.data.suggestions.length > 0) {
        innerContent += `
          <div class="skybolt-suggestions-wrap">
            <div class="skybolt-chips-list">
              ${data.data.suggestions.map((s) => `<button class="skybolt-chip-btn" data-query="${this._escapeHtml(s)}">${this._escapeHtml(s)}</button>`).join('')}
            </div>
          </div>
        `;
      }

      innerContent += `
          <span class="skybolt-msg-time">${time}</span>
        </div>
      `;

      row.innerHTML = innerContent;
      body.appendChild(row);

      // Bind dynamic buttons inside this message
      this._bindChipClicks(row);

      const confirmBtn = row.querySelector('#skybolt-btn-confirm-action');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => this.sendMessage('Confirm'));
      }

      const cancelBtn = row.querySelector('#skybolt-btn-cancel-action');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.sendMessage('Cancel'));
      }

      if (scroll) this._scrollToBottom();
    }

    _renderVehicleCards(vehicles) {
      if (!vehicles || vehicles.length === 0) return '';
      return `
        <div class="skybolt-card-carousel">
          ${vehicles.slice(0, 3).map((v) => {
            const fallbackImg = 'assets/images/hero-bg.webp';
            const sanitize = window.sanitizeUrl || ((u) => this._escapeHtml(u));
            const imgUrl = sanitize(v.primaryImage || fallbackImg, fallbackImg);
            return `
              <div class="skybolt-vehicle-card">
                <img src="${imgUrl}" alt="${this._escapeHtml(v.name)}" class="skybolt-vehicle-img" onerror="this.src='${fallbackImg}'">
                <div class="skybolt-vehicle-info">
                  <div>
                    <div class="skybolt-vehicle-title">
                      ${this._escapeHtml(v.name)}
                      <span class="skybolt-vehicle-badge">${this._escapeHtml(v.category || 'CAR')}</span>
                    </div>
                    <div class="skybolt-vehicle-specs">
                      <span><i class="fa-solid fa-user-group"></i> ${v.seats || 4} Seats</span>
                      <span><i class="fa-solid fa-gear"></i> ${v.transmission || 'Manual'}</span>
                    </div>
                  </div>
                  <div class="skybolt-vehicle-footer">
                    <div class="skybolt-vehicle-price">
                      ₹${Number(v.baseRate || 0).toLocaleString('en-IN')}<small>/day</small>
                    </div>
                    <a href="/booking?vehicleId=${encodeURIComponent(v.id)}" class="skybolt-btn-book">
                      Book <i class="fa-solid fa-arrow-right"></i>
                    </a>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    _renderQuoteCard(q) {
      const durationDays = q.durationDays || (q.duration?.unit === 'DAY' ? q.duration.value : Math.ceil((q.duration?.hoursTotal || 24) / 24));
      return `
        <div class="skybolt-quote-card">
          <div class="skybolt-quote-header">
            <span class="skybolt-quote-vehicle">📋 ${this._escapeHtml(q.vehicleName || 'Rental Quote')}</span>
            <span class="skybolt-vehicle-badge">${durationDays} Days</span>
          </div>
          <div class="skybolt-quote-row">
            <span>Base Rental (${durationDays}d)</span>
            <span>₹${Number(q.grossBaseAmount || q.baseAmount || 0).toLocaleString('en-IN')}</span>
          </div>
          ${q.discountAmount > 0 ? `
            <div class="skybolt-quote-row discount">
              <span>Promo Discount (${this._escapeHtml(q.couponCode || 'APPLIED')})</span>
              <span>-₹${Number(q.discountAmount).toLocaleString('en-IN')}</span>
            </div>
          ` : ''}
          <div class="skybolt-quote-row">
            <span>Taxes & Service Fees</span>
            <span>₹${Number((q.taxes || q.taxAmount || 0) + (q.fees || q.feeAmount || 0)).toLocaleString('en-IN')}</span>
          </div>
          <div class="skybolt-quote-total">
            <span class="skybolt-quote-total-label">Final Guaranteed Total:</span>
            <span class="skybolt-quote-total-val">₹${Number(q.finalTotal || q.total || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>
      `;
    }

    _showTypingIndicator() {
      const body = document.getElementById('skybolt-chat-body');
      if (!body) return;

      const indicator = document.createElement('div');
      indicator.id = 'skybolt-typing-indicator';
      indicator.className = 'skybolt-msg-row bot';
      indicator.innerHTML = `
        <div class="skybolt-msg-avatar"><i class="fa-solid fa-bolt"></i></div>
        <div class="skybolt-typing-indicator">
          <div class="skybolt-typing-dot"></div>
          <div class="skybolt-typing-dot"></div>
          <div class="skybolt-typing-dot"></div>
        </div>
      `;
      body.appendChild(indicator);
      this._scrollToBottom();
    }

    _hideTypingIndicator() {
      const indicator = document.getElementById('skybolt-typing-indicator');
      if (indicator) indicator.remove();
    }

    async resetConversation() {
      if (this.conversationId) {
        try {
          await this._fetchApi(`/chat/history/${this.conversationId}`, { method: 'DELETE' });
        } catch (e) {}
      }

      this.conversationId = null;
      try {
        sessionStorage.removeItem('skybolt_chat_conv_id');
      } catch (e) {}

      this._renderDefaultGreeting();
    }

    _scrollToBottom() {
      const body = document.getElementById('skybolt-chat-body');
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    }

    _formatTime(d) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    _escapeHtml(text) {
      if (!text) return '';
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return String(text).replace(/[&<>"']/g, (m) => map[m]);
    }

    _renderMarkdown(text) {
      if (!text) return '';

      // First escape all unsafe HTML
      let clean = this._escapeHtml(text);

      // Bold: **text**
      clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      // Bullet points
      clean = clean.replace(/^[•\-\*]\s+(.*)$/gm, '<li>$1</li>');
      clean = clean.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

      // Line breaks to paragraphs
      clean = clean.replace(/\n\n+/g, '</p><p>');
      clean = clean.replace(/\n/g, '<br>');

      return `<p>${clean}</p>`;
    }

    async _fetchApi(endpoint, options = {}) {
      if (global.SkyBoltApi && typeof global.SkyBoltApi.post === 'function') {
        const fullEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        if (options.method === 'POST') {
          return await global.SkyBoltApi.post(fullEndpoint, options.body, {
            headers: { 'X-Session-ID': this.sessionId }
          });
        }
        if (options.method === 'GET') {
          return await global.SkyBoltApi.get(fullEndpoint, {
            headers: { 'X-Session-ID': this.sessionId }
          });
        }
        if (options.method === 'DELETE') {
          return await global.SkyBoltApi.delete(fullEndpoint, {
            headers: { 'X-Session-ID': this.sessionId }
          });
        }
      }

      const url = `${this.apiBaseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Session-ID': this.sessionId,
        ...(options.headers || {})
      };

      const res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        credentials: 'include',
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      return await res.json();
    }
  }

  // Self-mount on DOM Ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        global.skyboltChatbot = new SkyBoltChatbotWidget();
      });
    } else {
      global.skyboltChatbot = new SkyBoltChatbotWidget();
    }
  }

  global.SkyBoltChatbotWidget = SkyBoltChatbotWidget;

})(typeof window !== 'undefined' ? window : globalThis);
