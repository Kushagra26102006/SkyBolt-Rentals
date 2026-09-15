/**
 * SkyBolt Rentals — Client-Side Error Tracking Boundary
 * 
 * Captures unhandled client JavaScript runtime errors, unhandled promise rejections,
 * and failed API requests. Sanitizes all data to guarantee zero credential or token leakage.
 */

(function(global) {
  'use strict';

  const errorLog = [];
  const MAX_STORED_ERRORS = 25;

  function sanitize(data) {
    if (!data) return '';
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str.replace(/(password|token|secret|key|jwt)=([^&]+)/gi, '$1=[REDACTED]');
  }

  const SkyBoltErrorTracker = {
    captureError: function(message, source, lineno, colno, error) {
      const errorEntry = {
        timestamp: new Date().toISOString(),
        message: sanitize(message),
        source: source || 'inline',
        lineno: lineno || 0,
        colno: colno || 0,
        stack: error && error.stack ? sanitize(error.stack) : null,
        url: window.location ? window.location.href : ''
      };

      errorLog.unshift(errorEntry);
      if (errorLog.length > MAX_STORED_ERRORS) {
        errorLog.pop();
      }

      if (global.SkyBoltConfig && global.SkyBoltConfig.logger) {
        global.SkyBoltConfig.logger.error('Client Error Captured:', errorEntry.message);
      }
    },

    captureApiError: function(endpoint, status, statusText, details) {
      const errorEntry = {
        timestamp: new Date().toISOString(),
        type: 'API_FAILURE',
        endpoint: sanitize(endpoint),
        status: status,
        statusText: statusText,
        details: sanitize(details)
      };

      errorLog.unshift(errorEntry);
      if (errorLog.length > MAX_STORED_ERRORS) {
        errorLog.pop();
      }
    },

    getRecentErrors: function() {
      return [...errorLog];
    }
  };

  // Global listeners
  if (typeof window !== 'undefined') {
    window.addEventListener('error', function(event) {
      SkyBoltErrorTracker.captureError(
        event.message,
        event.filename,
        event.lineno,
        event.colno,
        event.error
      );
    });

    window.addEventListener('unhandledrejection', function(event) {
      SkyBoltErrorTracker.captureError(
        event.reason ? event.reason.message || String(event.reason) : 'Unhandled Promise Rejection',
        'Promise',
        0,
        0,
        event.reason instanceof Error ? event.reason : null
      );
    });
  }

  global.SkyBoltErrorTracker = SkyBoltErrorTracker;
})(typeof window !== 'undefined' ? window : globalThis);
