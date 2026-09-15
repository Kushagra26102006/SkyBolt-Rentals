/* ==========================================================================
   SkyBolt Rentals - Standardized Frontend API Client Foundation
   Provides unified HTTP transport with JSON parsing, timeouts, and error handling.
   ========================================================================== */

(function(global) {
  'use strict';

  class SkyBoltApiClient {
    /**
     * @param {Object} options
     * @param {string} [options.baseUrl] - API Base URL (defaults to SkyBoltConfig.apiBaseUrl)
     * @param {number} [options.timeoutMs] - Default request timeout in milliseconds (default 10,000ms)
     */
    constructor(options = {}) {
      this.baseUrl = options.baseUrl || (global.SkyBoltConfig && global.SkyBoltConfig.apiBaseUrl) || 'http://localhost:5001/api/v1';
      this.timeoutMs = options.timeoutMs || 10000;
    }

    /**
     * Generate client-side correlation request ID
     */
    _generateRequestId() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
    }

    /**
     * Internal HTTP transport method
     */
    async _fetch(endpoint, options = {}) {
      const url = endpoint.startsWith('http')
        ? endpoint
        : `${this.baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;

      const timeout = options.timeout || this.timeoutMs;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const headers = {
        'Accept': 'application/json',
        'X-Request-ID': this._generateRequestId(),
        'X-Requested-With': 'XMLHttpRequest',
        ...(options.headers || {})
      };

      if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }

      try {
        const response = await fetch(url, {
          ...options,
          credentials: options.credentials || 'include',
          headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        let data = null;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        if (!response.ok) {
          const errorPayload = (typeof data === 'object' && data && data.error)
            ? data.error
            : {
                code: `HTTP_${response.status}`,
                message: (typeof data === 'object' && data && data.message) || response.statusText || 'Request failed'
              };

          return {
            success: false,
            status: response.status,
            error: errorPayload
          };
        }

        return data;
      } catch (err) {
        clearTimeout(timeoutId);

        if (err.name === 'AbortError') {
          return {
            success: false,
            status: 408,
            error: {
              code: 'REQUEST_TIMEOUT',
              message: `API request timed out after ${timeout}ms`
            }
          };
        }

        let errMsg = err.message || 'Network connection failed';
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
          errMsg = `Unable to connect to SkyBolt API (${this.baseUrl}). Please verify the backend server is running.`;
        }

        return {
          success: false,
          status: 0,
          error: {
            code: 'NETWORK_ERROR',
            message: errMsg
          }
        };
      }
    }

    /**
     * HTTP GET
     */
    async get(endpoint, options = {}) {
      return this._fetch(endpoint, { ...options, method: 'GET' });
    }

    /**
     * HTTP POST
     */
    async post(endpoint, body, options = {}) {
      return this._fetch(endpoint, { ...options, method: 'POST', body });
    }

    /**
     * HTTP PUT
     */
    async put(endpoint, body, options = {}) {
      return this._fetch(endpoint, { ...options, method: 'PUT', body });
    }

    /**
     * HTTP PATCH
     */
    async patch(endpoint, body, options = {}) {
      return this._fetch(endpoint, { ...options, method: 'PATCH', body });
    }

    /**
     * HTTP DELETE
     */
    async delete(endpoint, options = {}) {
      return this._fetch(endpoint, { ...options, method: 'DELETE' });
    }
  }

  // Freeze prototype and expose singleton
  const apiClient = new SkyBoltApiClient();
  Object.freeze(apiClient);

  global.SkyBoltApiClient = SkyBoltApiClient;
  global.SkyBoltApi = apiClient;

})(typeof window !== 'undefined' ? window : globalThis);
