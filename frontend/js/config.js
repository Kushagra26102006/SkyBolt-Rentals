/* ==========================================================================
   SkyBolt Rentals - Centralized Application Configuration & Runtime Environment
   ========================================================================== */

(function(global) {
  'use strict';

  /**
   * Detect current runtime environment based on hostname or manual override
   */
  function detectEnvironment() {
    if (global.__SKYBOLT_ENV__) {
      return String(global.__SKYBOLT_ENV__).toLowerCase();
    }
    if (typeof location !== 'undefined') {
      const hostname = location.hostname;
      const port = location.port;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '' ||
        location.protocol === 'file:' ||
        port === '8089' ||
        port === '8080' ||
        port === '3000' ||
        port === '5173' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.endsWith('.local')
      ) {
        return 'development';
      }
      if (hostname.includes('test') || hostname.includes('staging')) {
        return 'test';
      }
      return 'production';
    }
    return 'development';
  }

  const currentEnv = detectEnvironment();
  const isProd = currentEnv === 'production';
  const isDev = currentEnv === 'development';
  const isTest = currentEnv === 'test';

  /**
   * Determine default base URLs
   */
  const origin = (typeof location !== 'undefined' && location.origin && location.origin !== 'null')
    ? location.origin
    : 'http://localhost:8080';

  /**
   * Environment-Specific Defaults
   */
  const envDefaults = {
    development: {
      appBaseUrl: origin,
      apiBaseUrl: global.__SKYBOLT_API_URL__ || 'http://localhost:5001/api/v1',
      logLevel: 'debug'
    },
    test: {
      appBaseUrl: 'http://localhost:8080',
      apiBaseUrl: 'http://localhost:8080/api/v1',
      logLevel: 'warn'
    },
    production: {
      appBaseUrl: origin,
      apiBaseUrl: global.__SKYBOLT_API_URL__ || 'https://skybolt-rentals-backend.onrender.com/api/v1',
      logLevel: 'info'
    }
  };

  const activeDefaults = envDefaults[currentEnv] || envDefaults.development;
  const userOverrides = global.__SKYBOLT_CONFIG__ || {};

  /**
   * Feature Flags (Controls gradual rollout of future modules)
   * All advanced production features default to false until backend phases are active.
   */
  const featureFlags = {
    enablePayments: true,
    enableReviews: false,
    enableNotifications: false,
    enableAi: true,
    ...(userOverrides.featureFlags || {})
  };

  /**
   * Raw configuration candidate
   */
  const rawConfig = {
    env: currentEnv,
    isProduction: isProd,
    isDevelopment: isDev,
    isTest: isTest,
    version: '1.0.0',
    razorpayKeyId: userOverrides.razorpayKeyId || 'rzp_test_TZpQaAZXme6a5g',
    appBaseUrl: userOverrides.appBaseUrl || activeDefaults.appBaseUrl,
    apiBaseUrl: userOverrides.apiBaseUrl || activeDefaults.apiBaseUrl,
    logLevel: userOverrides.logLevel || activeDefaults.logLevel,
    featureFlags: featureFlags
  };

  /**
   * Configuration Validator
   * Ensures essential runtime configuration is present and valid.
   */
  function validateConfig(cfg) {
    const validEnvs = ['development', 'test', 'production'];
    if (!validEnvs.includes(cfg.env)) {
      throw new Error(`[SkyBolt Config] Invalid environment "${cfg.env}". Expected one of: ${validEnvs.join(', ')}`);
    }
    if (!cfg.appBaseUrl || typeof cfg.appBaseUrl !== 'string') {
      throw new Error('[SkyBolt Config] Missing required configuration: appBaseUrl must be a valid string');
    }
    if (!cfg.apiBaseUrl || typeof cfg.apiBaseUrl !== 'string') {
      throw new Error('[SkyBolt Config] Missing required configuration: apiBaseUrl must be a valid string');
    }

    // Security check: Guard against accidental inclusion of sensitive secret keys
    const forbiddenKeys = ['password', 'secret', 'token', 'private_key', 'database_url', 'jwt_secret'];
    for (const key of Object.keys(cfg)) {
      const lower = key.toLowerCase();
      if (forbiddenKeys.some(forbidden => lower.includes(forbidden))) {
        throw new Error(`[SkyBolt Security Alert] Forbidden sensitive key "${key}" detected in client-side configuration!`);
      }
    }
    return true;
  }

  // Execute validation
  validateConfig(rawConfig);

  /**
   * Centralized Environment-Aware Logger
   * Suppresses verbose debug diagnostics in production environments.
   */
  const logger = {
    debug(...args) {
      if (rawConfig.logLevel === 'debug' && !rawConfig.isProduction) {
        console.debug('[SkyBolt DEBUG]', ...args);
      }
    },
    info(...args) {
      if (rawConfig.logLevel === 'debug' || rawConfig.logLevel === 'info') {
        console.info('[SkyBolt INFO]', ...args);
      }
    },
    warn(...args) {
      console.warn('[SkyBolt WARN]', ...args);
    },
    error(message, errorObj) {
      if (rawConfig.isProduction) {
        // Sanitized, non-sensitive logging in production
        console.error('[SkyBolt Error]', message);
      } else {
        // Detailed debugging output in development and test
        console.error('[SkyBolt Error]', message, errorObj !== undefined ? errorObj : '');
      }
    }
  };

  /**
   * Assembled, immutable Configuration Object
   */
  const config = {
    ...rawConfig,
    featureFlags: Object.freeze(rawConfig.featureFlags),
    logger: Object.freeze(logger),
    validate: () => validateConfig(rawConfig)
  };

  // Deep freeze to prevent runtime mutation
  const frozenConfig = Object.freeze(config);

  // Expose to global window scope
  global.SkyBoltConfig = frozenConfig;

  // Log environment initialization in development
  frozenConfig.logger.debug(`Application configuration initialized for environment: "${frozenConfig.env}"`);

})(typeof window !== 'undefined' ? window : globalThis);
