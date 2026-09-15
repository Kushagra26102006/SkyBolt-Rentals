/**
 * SkyBolt Rentals - Centralized API Configuration for React Services
 * Supports local development, production on Render, and custom environment overrides.
 */

declare global {
  interface Window {
    SkyBoltConfig?: {
      apiBaseUrl?: string;
      [key: string]: any;
    };
  }
}

export const API_BASE_URL: string =
  (typeof process !== 'undefined' && process.env && (process.env.REACT_APP_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_URL)) ||
  (typeof window !== 'undefined' && window.SkyBoltConfig && window.SkyBoltConfig.apiBaseUrl) ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5001/api/v1'
    : 'https://skybolt-rentals-backend.onrender.com/api/v1');
